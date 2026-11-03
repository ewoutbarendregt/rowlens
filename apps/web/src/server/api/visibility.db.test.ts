import { randomUUID } from 'node:crypto';
import { sql } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, beforeEach, describe, expect, inject, it } from 'vitest';
import { buildApp } from '../app.ts';
import type { LoginMail } from '../auth/mail.ts';
import { loadConfig } from '../config.ts';
import { connectDatabase, type DatabaseHandle } from '../db/client.ts';
import { withTenant } from '../db/tenant.ts';
import { asOwner } from '../db/test/fixtures.ts';

// What a rower may see and change (#40, ADR-0013) and sharing notes (#112), through the real
// login flow: a coach, rower A who rowed in the session, rower B who didn't.
const BASE = '/projects/rowlens';
const ORIGIN = 'https://trustable.nl';
const tag = randomUUID().slice(0, 8);
const COACH = `coach-${tag}@example.com`;
const A = `a-${tag}@example.com`;
const B = `b-${tag}@example.com`;
const COACH2 = `coach2-${tag}@example.com`;
const ADMIN = `admin-${tag}@example.com`;

let app: FastifyInstance;
let handle: DatabaseHandle;
let codes: LoginMail[] = [];
let ip = 0;
let club = '';
const as: Record<'coach' | 'a' | 'b' | 'coach2' | 'admin', string> = {
  coach: '',
  a: '',
  b: '',
  coach2: '',
  admin: '',
};
const roster: Record<'a' | 'b' | 'c', string> = { a: '', b: '', c: '' };
let sessionId = '';
let videoId = '';

function send(
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE',
  path: string,
  cookies: string,
  body?: unknown,
) {
  ip += 1;
  const csrf = /rowlens_csrf=([^;]+)/.exec(cookies)?.[1] ?? '';
  return app.inject({
    method,
    url: `${BASE}${path}`,
    headers: {
      origin: ORIGIN,
      'sec-fetch-site': 'same-origin',
      'x-forwarded-for': `192.0.2.${String(ip % 250)}`,
      ...(cookies === '' ? {} : { cookie: cookies, 'x-csrf-token': csrf }),
      ...(body === undefined ? {} : { 'content-type': 'application/json' }),
    },
    ...(body === undefined ? {} : { payload: JSON.stringify(body) }),
  });
}

async function signIn(email: string): Promise<string> {
  codes = [];
  await send('POST', '/api/auth/otp', '', { email });
  const code = codes[0]?.code ?? '';
  const res = await send('POST', '/api/auth/verify', '', { email, code });
  expect(res.statusCode).toBe(204);
  return res.cookies.map((c) => `${c.name}=${c.value}`).join('; ');
}

interface NotesView {
  annotations: { id: string; frame: number; canEdit: boolean; mine: boolean }[];
  shares: { frame: number; crew: unknown; rowers: { id: string; canUnshare: boolean }[] }[];
}

async function notes(who: keyof typeof as): Promise<NotesView | null> {
  const res = await send('GET', `/api/videos/${videoId}/annotations`, as[who]);
  return res.statusCode === 200 ? res.json<NotesView>() : null;
}

const frames = async (who: keyof typeof as) =>
  [...new Set((await notes(who))?.annotations.map((a) => a.frame) ?? [])].sort((x, y) => x - y);

const sessionsOf = async (who: keyof typeof as) =>
  (await send('GET', '/api/sessions', as[who]))
    .json<{ sessions: { id: string }[] }>()
    .sessions.map((s) => s.id);

beforeAll(async () => {
  handle = connectDatabase(inject('appUrl'), 2);
  app = await buildApp({
    config: loadConfig({
      PUBLIC_ORIGIN: ORIGIN,
      AUTH_ALLOWED_EMAILS: `${COACH},${COACH2}`,
      AUTH_ADMIN_EMAILS: ADMIN,
      OTP_PEPPER: 'c'.repeat(64),
    }),
    clientDir: null,
    database: handle.db,
    logger: false,
    deliverLoginCode: (mail) => {
      codes.push(mail);
      return Promise.resolve();
    },
  });
  const [pilot] = await asOwner<{ id: string }>(`select id from club where slug = 'pilot'`);
  club = pilot?.id ?? '';
  await asOwner(
    `insert into club_access (club_id, email, role) values ($1, $2, 'rower'), ($1, $3, 'rower')`,
    [club, A, B],
  );
  // The coach puts A and B in the roster with their e-mail (that links them at login); C has none.
  const rows = await asOwner<{ id: string }>(
    `insert into rower (club_id, display_name, email) values
       ($1, 'A ' || $4, $2), ($1, 'B ' || $4, $3), ($1, 'C ' || $4, null)
     returning id`,
    [club, A, B, tag],
  );
  [roster.a, roster.b, roster.c] = rows.map((r) => r.id) as [string, string, string];

  as.coach = await signIn(COACH);
  as.a = await signIn(A);
  as.b = await signIn(B);
  as.coach2 = await signIn(COACH2);
  as.admin = await signIn(ADMIN);

  // A session the coach made, with A and C in the lineup and a ready video with two coach notes.
  const created = await send('POST', '/api/sessions', as.coach, {
    title: `Visibility ${tag}`,
    date: '2026-11-02',
  });
  sessionId = created.json<{ id: string }>().id;
  await send('PUT', `/api/sessions/${sessionId}/lineup`, as.coach, {
    boatType: 'C2x',
    seats: [
      { seat: 1, rowerId: roster.a },
      { seat: 2, rowerId: roster.c },
    ],
  });
  const [v] = await asOwner<{ id: string }>(
    `insert into video (club_id, session_id, original_filename, content_type, perspective, size_bytes,
       status, frame_count, fps_num, fps_den)
     values ($1, $2, 'clip.mov', 'video/quicktime', 'boat', 4, 'ready', 300, 30, 1) returning id`,
    [club, sessionId],
  );
  videoId = v?.id ?? '';
  for (const frame of [10, 20]) {
    const res = await send('POST', `/api/videos/${videoId}/annotations`, as.coach, {
      kind: 'note',
      frame,
      body: `Coach at ${String(frame)}`,
      authorName: 'Coach',
    });
    expect(res.statusCode).toBe(201);
  }
});

afterAll(async () => {
  await app.close();
  await handle.close();
});

beforeEach(async () => {
  await asOwner(`delete from auth_event`);
});

describe('what a rower sees (#40)', () => {
  it('links a roster entry to the account with exactly that e-mail, and nothing else', async () => {
    const linked = await asOwner<{ id: string; user_id: string | null }>(
      `select id, user_id from rower where id = any($1::uuid[]) order by display_name`,
      [[roster.a, roster.b, roster.c]],
    );
    expect(linked.map((r) => r.user_id !== null)).toEqual([true, true, false]);
  });

  it('shows a rower only the sessions they rowed in', async () => {
    expect(await sessionsOf('coach')).toContain(sessionId);
    expect(await sessionsOf('a')).toContain(sessionId);
    expect(await sessionsOf('b')).not.toContain(sessionId);
    expect((await send('GET', `/api/sessions/${sessionId}`, as.b)).statusCode).toBe(404);
    expect((await send('GET', `/api/videos/${videoId}`, as.b)).statusCode).toBe(404);
    expect(await notes('b')).toBeNull();
    expect((await send('GET', `/api/videos/${videoId}`, as.a)).statusCode).toBe(200);
  });

  it('keeps notes private until they are assigned or shared', async () => {
    expect(await frames('coach')).toEqual([10, 20]);
    expect(await frames('a')).toEqual([]);
    await send('PUT', `/api/videos/${videoId}/frames/10/rowers`, as.coach, {
      rowerIds: [roster.a],
    });
    expect(await frames('a')).toEqual([10]);
    expect((await notes('a'))?.annotations[0]).toMatchObject({ canEdit: false, mine: false });
  });

  it('a share with one rower opens that note (and its session) to them only', async () => {
    const res = await send('PUT', `/api/videos/${videoId}/frames/20/shares`, as.coach, {
      rowerIds: [roster.b],
      crew: false,
    });
    expect(res.statusCode).toBe(200);
    expect(await frames('b')).toEqual([20]);
    expect(await sessionsOf('b')).toContain(sessionId);
    expect(await frames('a')).toEqual([10]);
  });

  it('a share with the crew reaches everyone in the lineup', async () => {
    await send('PUT', `/api/videos/${videoId}/frames/10/rowers`, as.coach, { rowerIds: [] });
    expect(await frames('a')).toEqual([]);
    await send('PUT', `/api/videos/${videoId}/frames/10/shares`, as.coach, {
      rowerIds: [],
      crew: true,
    });
    expect(await frames('a')).toEqual([10]);
    expect(await frames('b')).toEqual([20]); // B is not in the lineup
  });

  it("lets a rower share what they see, take back their own share, not the coach's", async () => {
    const mine = await send('PUT', `/api/videos/${videoId}/frames/10/shares`, as.a, {
      rowerIds: [roster.b],
      crew: true,
    });
    expect(mine.statusCode).toBe(200);
    expect(await frames('b')).toEqual([10, 20]);
    const view = (await notes('a'))?.shares.find((s) => s.frame === 10);
    expect(view?.rowers.find((r) => r.id === roster.b)?.canUnshare).toBe(true);

    const notYours = await send('PUT', `/api/videos/${videoId}/frames/10/shares`, as.a, {
      rowerIds: [roster.b],
      crew: false, // the crew share is the coach's
    });
    expect([notYours.statusCode, notYours.json()]).toEqual([403, { error: 'not_yours' }]);
    const back = await send('PUT', `/api/videos/${videoId}/frames/10/shares`, as.a, {
      rowerIds: [],
      crew: true,
    });
    expect(back.statusCode).toBe(200);
    expect(await frames('b')).toEqual([20]);
    // A rower can't share a note they can't see.
    const hidden = await send('PUT', `/api/videos/${videoId}/frames/20/shares`, as.a, {
      rowerIds: [roster.a],
      crew: false,
    });
    expect(hidden.statusCode).toBe(409);
  });

  it('lets a rower write their own notes and change only those; the coach sees them', async () => {
    const coachNote = (await notes('a'))?.annotations.find((n) => n.frame === 10)?.id ?? '';
    expect(
      (await send('PATCH', `/api/annotations/${coachNote}`, as.a, { body: 'mine now' })).statusCode,
    ).toBe(404);
    expect((await send('DELETE', `/api/annotations/${coachNote}`, as.a)).statusCode).toBe(404);

    const own = await send('POST', `/api/videos/${videoId}/annotations`, as.a, {
      kind: 'note',
      frame: 30,
      body: 'Is my catch late here?',
      authorName: 'A',
    });
    expect(own.statusCode).toBe(201);
    expect(own.json()).toMatchObject({ mine: true, canEdit: true });
    const ownId = own.json<{ id: string }>().id;
    expect(await frames('a')).toEqual([10, 30]);
    expect(await frames('b')).toEqual([20]);
    expect(await frames('coach')).toEqual([10, 20, 30]);
    expect(
      (await send('PATCH', `/api/annotations/${ownId}`, as.a, { body: 'Catch late?' })).statusCode,
    ).toBe(200);
    expect((await send('DELETE', `/api/annotations/${ownId}`, as.a)).statusCode).toBe(204);
  });

  it('names a note after the account, never after what the client sends (#106)', async () => {
    // A is linked to the roster entry "A <tag>": that name, whatever the request says.
    const linked = await send('POST', `/api/videos/${videoId}/annotations`, as.a, {
      kind: 'note',
      frame: 40,
      body: 'Linked',
      authorName: 'Someone else',
    });
    expect(linked.json()).toMatchObject({ authorName: `A ${tag}` });
    // The coach has no roster entry: the account's own name, and no name field is needed.
    const unlinked = await send('POST', `/api/videos/${videoId}/annotations`, as.coach, {
      kind: 'note',
      frame: 41,
      body: 'Unlinked',
    });
    expect(unlinked.statusCode).toBe(201);
    expect(unlinked.json()).toMatchObject({ authorName: `coach ${tag}` });
    // The page shows the same name before anything is written ("as …").
    const status = await app.inject({ url: `${BASE}/api/auth/status`, headers: { cookie: as.a } });
    expect(status.json()).toMatchObject({ user: { authorName: `A ${tag}` } });
    for (const frame of [40, 41]) {
      await send('DELETE', `/api/videos/${videoId}/frames/${String(frame)}/annotations`, as.coach);
    }
  });

  it('a rower sees the sessions they create and can keep its lineup', async () => {
    const created = await send('POST', '/api/sessions', as.b, {
      title: `B's own ${tag}`,
      date: '2026-11-02',
    });
    const own = created.json<{ id: string }>().id;
    expect(await sessionsOf('b')).toContain(own);
    expect(await sessionsOf('a')).not.toContain(own);
    const lineup = await send('PUT', `/api/sessions/${own}/lineup`, as.b, {
      boatType: 'C1x',
      seats: [{ seat: 1, rowerId: roster.b }],
    });
    expect(lineup.statusCode).toBe(200);
  });

  it('the worker and the pilot path (no role) still see the whole club', async () => {
    const all = await withTenant(handle.db, { clubId: club, userId: null }, (tx) =>
      tx.execute<{ n: number }>(
        sql`select count(*)::int as n from annotation where video_id = ${videoId}`,
      ),
    );
    expect(all.rows[0]?.n).toBe(2);
  });

  it('stroke marks: the coach sets them, a rower reads them, others see nothing (#85)', async () => {
    const at = `/api/videos/${videoId}/strokes`;
    expect((await send('PUT', `${at}/12`, as.coach, { kind: 'catch' })).statusCode).toBe(200);
    expect((await send('GET', at, as.a)).json()).toEqual({ marks: [{ frame: 12, kind: 'catch' }] });
    // A rower in the lineup reads the marks but doesn't set or remove them.
    expect((await send('PUT', `${at}/40`, as.a, { kind: 'finish' })).statusCode).toBe(403);
    expect((await send('DELETE', `${at}/12`, as.a)).statusCode).toBe(403);
    // Underneath the API, the database refuses a rower too.
    const [a] = await asOwner<{ id: string }>(`select id from app_user where email = $1`, [A]);
    await expect(
      withTenant(handle.db, { clubId: club, userId: a?.id ?? null, role: 'rower' }, (tx) =>
        tx.execute(
          sql`insert into stroke_mark (club_id, video_id, frame, kind) values (${club}, ${videoId}, 41, 'finish')`,
        ),
      ),
    ).rejects.toThrow();
    // Another coach doesn't see this session, so not its video or marks either.
    expect((await send('GET', at, as.coach2)).statusCode).toBe(404);
    expect((await send('PUT', `${at}/50`, as.coach2, { kind: 'catch' })).statusCode).toBe(404);
    expect((await send('DELETE', `${at}/12`, as.coach)).statusCode).toBe(204);
  });

  it('every table a rower is limited on has a restrictive role policy', async () => {
    const rows = await asOwner<{ tablename: string }>(
      `select distinct tablename from pg_policies where permissive = 'RESTRICTIVE' order by 1`,
    );
    expect(rows.map((r) => r.tablename)).toEqual([
      'annotation',
      'lineup_seat',
      'moment',
      'moment_rower',
      'moment_rower_log',
      'moment_share',
      'rowing_session',
      'stroke_mark',
      'video',
    ]);
  });
});

describe('coaches see their own sessions; the admin sees and assigns all (#108)', () => {
  it("a coach doesn't see another coach's session; the admin does", async () => {
    expect(await sessionsOf('coach2')).not.toContain(sessionId);
    expect((await send('GET', `/api/videos/${videoId}`, as.coach2)).statusCode).toBe(404);
    expect(await sessionsOf('admin')).toContain(sessionId);
    expect(await frames('admin')).toEqual(await frames('coach'));
  });

  it('only the admin gives a session to a coach, who then sees all its notes', async () => {
    const coach2Id = (
      await asOwner<{ id: string }>(`select id from app_user where email = $1`, [COACH2])
    )[0]?.id;
    expect(
      (await send('PATCH', `/api/sessions/${sessionId}/creator`, as.coach, { userId: coach2Id }))
        .statusCode,
    ).toBe(404);
    const detail = await send('GET', `/api/sessions/${sessionId}`, as.admin);
    expect(detail.json<{ coaches: { email: string }[] }>().coaches.map((c) => c.email)).toContain(
      COACH2,
    );
    expect(
      (await send('PATCH', `/api/sessions/${sessionId}/creator`, as.admin, { userId: coach2Id }))
        .statusCode,
    ).toBe(204);
    expect(await sessionsOf('coach2')).toContain(sessionId);
    expect(await frames('coach2')).toEqual(await frames('admin'));
    const note = (await notes('coach2'))?.annotations[0];
    expect(note?.canEdit).toBe(true);
    // Not a member: refused.
    expect(
      (
        await send('PATCH', `/api/sessions/${sessionId}/creator`, as.admin, {
          userId: randomUUID(),
        })
      ).statusCode,
    ).toBe(400);
    expect((await send('GET', `/api/sessions/${sessionId}`, as.coach2)).json()).not.toHaveProperty(
      'coaches',
    );
  });

  it("lists each session with the viewer's seat and the notes meant for them", async () => {
    const list = (await send('GET', '/api/sessions', as.a)).json<{
      sessions: { id: string; mySeat: number | null; notesForMe: number }[];
    }>().sessions;
    const mine = list.find((s) => s.id === sessionId);
    expect(mine?.mySeat).toBe(1);
    expect(mine?.notesForMe).toBeGreaterThanOrEqual(1);
  });
});
