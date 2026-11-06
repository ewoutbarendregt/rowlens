import { randomUUID } from 'node:crypto';
import { mkdtemp, rm, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Readable } from 'node:stream';
import { sql } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, inject, it, vi } from 'vitest';
import { withBasePath } from '../../shared/base-path.ts';
import type { Role } from '../../shared/roles.ts';
import { buildApp } from '../app.ts';
import type { LoginMail } from '../auth/mail.ts';
import { loadConfig } from '../config.ts';
import { connectDatabase, type DatabaseHandle } from '../db/client.ts';
import { withTenant } from '../db/tenant.ts';
import { asOwner, createTwoClubs } from '../db/test/fixtures.ts';
import { MediaStore, originalKey } from '../media/store.ts';
const BASE = '/projects/rowlens',
  ORIGIN = 'https://trustable.nl';
const tag = randomUUID();
const emails = {
  a: `a-${tag}@example.com`,
  b: `b-${tag}@example.com`,
  coach: `coach-${tag}@example.com`,
  admin: `admin-${tag}@example.com`,
};
let app: FastifyInstance, handle: DatabaseHandle, media: MediaStore;
let dir = '',
  club = '',
  session = '',
  other = '',
  legacy = '',
  clip = '',
  upload = '',
  oldNote = '',
  privateNote = '',
  crew = '';
let ip = 0;
const cookies: Record<keyof typeof emails, string> = { a: '', b: '', coach: '', admin: '' };
const ids: Record<keyof typeof emails, string> = { ...cookies };
const mails: LoginMail[] = [];
function send(
  who: keyof typeof emails,
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE',
  path: string,
  body?: unknown,
  extra: Record<string, string> = {},
) {
  const cookie = cookies[who];
  return app.inject({
    method,
    url: withBasePath(BASE, path),
    headers: {
      origin: ORIGIN,
      'sec-fetch-site': 'same-origin',
      'x-forwarded-for': `192.0.2.${String(++ip % 250)}`,
      cookie,
      'x-csrf-token': /rowlens_csrf=([^;]+)/.exec(cookie)?.[1] ?? '',
      ...(body === undefined
        ? {}
        : {
            'content-type': Buffer.isBuffer(body)
              ? 'application/offset+octet-stream'
              : 'application/json',
          }),
      ...extra,
    },
    ...(body === undefined ? {} : { payload: Buffer.isBuffer(body) ? body : JSON.stringify(body) }),
  });
}
beforeAll(async () => {
  handle = connectDatabase(inject('appUrl'), 4);
  dir = await mkdtemp(join(tmpdir(), 'rowlens-training-'));
  media = new MediaStore(dir);
  app = await buildApp({
    database: handle.db,
    media,
    clientDir: null,
    logger: false,
    config: loadConfig({
      PUBLIC_ORIGIN: ORIGIN,
      AUTH_ADMIN_EMAILS: emails.admin,
      AUTH_ALLOWED_EMAILS: emails.coach,
      OTP_PEPPER: 'a'.repeat(64),
    }),
    deliverLoginCode: (mail) => {
      mails.push(mail);
      return Promise.resolve();
    },
  });
  const [c] = await asOwner<{ id: string }>(`select id from club where slug='pilot'`);
  club = c?.id ?? '';
  for (const who of ['a', 'b'] as const)
    await asOwner(`insert into club_access(club_id,email,roles) values($1,$2,ARRAY['rower'])`, [
      club,
      emails[who],
    ]);
  for (const who of Object.keys(emails) as (keyof typeof emails)[]) {
    await send(who, 'POST', '/api/auth/otp', { email: emails[who] });
    const verified = await send(who, 'POST', '/api/auth/verify', {
      email: emails[who],
      code: mails.find((m) => m.email === emails[who])?.code,
    });
    expect(verified.statusCode, verified.body).toBe(204);
    cookies[who] = verified.cookies.map((c) => `${c.name}=${c.value}`).join('; ');
    ids[who] = (await send(who, 'GET', '/api/auth/status')).json<{
      user: { id: string };
    }>().user.id;
  }
  session = (
    await send('b', 'POST', '/api/sessions', { title: 'Other training', date: '2026-11-06' })
  ).json<{ id: string }>().id;
  const { b } = await createTwoClubs();
  const [o] = await asOwner<{ id: string }>(
    `insert into rowing_session(club_id,title,session_date) values($1,'Other club','2026-11-06') returning id`,
    [b],
  );
  other = o?.id ?? '';
  const [l] = await asOwner<{ id: string }>(
    `insert into rowing_session(club_id,title,session_date) values($1,'Legacy training','2026-11-06') returning id`,
    [club],
  );
  legacy = l?.id ?? '';
  const [v] = await asOwner<{ id: string }>(
    `insert into video(club_id,session_id,original_filename,content_type,perspective,size_bytes,status,frame_count,fps_num,fps_den) values($1,$2,'clip.mp4','video/mp4','boat',4,'ready',300,30,1) returning id`,
    [club, session],
  );
  clip = v?.id ?? '';
  const [u] = await asOwner<{ id: string }>(
    `insert into video(club_id,session_id,original_filename,content_type,perspective,size_bytes) values($1,$2,'upload.mp4','video/mp4','boat',20) returning id`,
    [club, session],
  );
  upload = u?.id ?? '';
  const [r] = await asOwner<{ id: string }>(
    `insert into rower(club_id,display_name,user_id) values($1,'Viewer',$2) returning id`,
    [club, ids.a],
  );
  crew = r?.id ?? '';
  await asOwner(`insert into lineup_seat(club_id,session_id,seat,rower_id) values($1,$2,1,$3)`, [
    club,
    session,
    crew,
  ]);
  const notes = await asOwner<{ id: string; frame: number }>(
    `insert into annotation(club_id,video_id,frame,body,author_name,author_user_id) values($1,$2,1,'Old own feedback','Viewer',$3),($1,$2,2,'Private feedback','Other',$4) returning id,frame`,
    [club, clip, ids.a, ids.b],
  );
  oldNote = notes.find((n) => n.frame === 1)?.id ?? '';
  privateNote = notes.find((n) => n.frame === 2)?.id ?? '';
  await media.append(originalKey(club, clip), Readable.from(Buffer.from('safe')), 4);
  await media.append(originalKey(club, upload), Readable.from(Buffer.from('part')), 4);
});
afterAll(async () => {
  await app.close();
  await handle.close();
  await rm(dir, { recursive: true, force: true });
});
describe('club training read/write separation (#154)', () => {
  it('lets every role browse all club trainings, including unrelated and ownerless ones, without crossing clubs', async () => {
    for (const who of Object.keys(emails) as (keyof typeof emails)[]) {
      const list = (await send(who, 'GET', '/api/sessions'))
        .json<{ sessions: { id: string }[] }>()
        .sessions.map((s) => s.id);
      expect(list).toContain(session);
      expect(list).toContain(legacy);
      expect(list).not.toContain(other);
      expect((await send(who, 'GET', `/api/sessions/${other}`)).statusCode).toBe(404);
      const detail = await send(who, 'GET', `/api/sessions/${session}`);
      expect(detail.statusCode).toBe(200);
      expect(detail.json<{ canEdit: boolean }>().canEdit).toBe(who !== 'a');
    }
  });
  it('keeps rower private feedback private but exposes an old own note as read-only', async () => {
    const response = await send('a', 'GET', `/api/videos/${clip}/annotations`);
    expect(response.statusCode).toBe(200);
    const notes = response.json<{ annotations: { id: string; canEdit: boolean }[] }>().annotations;
    expect(notes).toContainEqual(expect.objectContaining({ id: oldNote, canEdit: false }));
    expect(notes.some((n) => n.id === privateNote)).toBe(false);
    expect(
      (await send('coach', 'GET', `/api/videos/${clip}/annotations`)).json<{
        annotations: unknown[];
      }>().annotations,
    ).toHaveLength(2);
  });
  const changes: [string, 'POST' | 'PUT' | 'PATCH' | 'DELETE', () => string, () => unknown][] = [
    ['rename', 'PATCH', () => `/api/sessions/${session}`, () => ({ title: 'Denied' })],
    [
      'lineup',
      'PUT',
      () => `/api/sessions/${session}/lineup`,
      () => ({ boatType: 'C1x', seats: [] }),
    ],
    [
      'new note',
      'POST',
      () => `/api/videos/${clip}/annotations`,
      () => ({ kind: 'note', frame: 3, body: 'Denied' }),
    ],
    [
      'new drawing',
      'POST',
      () => `/api/videos/${clip}/annotations`,
      () => ({
        kind: 'line',
        frame: 3,
        points: [
          [0.1, 0.1],
          [0.9, 0.9],
        ],
      }),
    ],
    ['old own note', 'PATCH', () => `/api/annotations/${oldNote}`, () => ({ body: 'Denied' })],
    ['delete own note', 'DELETE', () => `/api/annotations/${oldNote}`, () => undefined],
    ['delete frame', 'DELETE', () => `/api/videos/${clip}/frames/1/annotations`, () => undefined],
    ['assign', 'PUT', () => `/api/videos/${clip}/frames/1/rowers`, () => ({ rowerIds: [crew] })],
    [
      'share',
      'PUT',
      () => `/api/videos/${clip}/frames/1/shares`,
      () => ({ crew: true, rowerIds: [] }),
    ],
    ['stroke', 'PUT', () => `/api/videos/${clip}/strokes/3`, () => ({ kind: 'catch' })],
    ['delete video', 'DELETE', () => `/api/videos/${clip}`, () => undefined],
    ['delete training', 'DELETE', () => `/api/sessions/${session}`, () => undefined],
  ];
  for (const [name, method, path, body] of changes)
    it(`refuses rower ${name} without changing data or media`, async () => {
      const before = await asOwner(
        `select row_to_json(s) as data from rowing_session s where id=$1`,
        [session],
      );
      const result = await send('a', method, path(), body());
      expect([403, 404], result.body).toContain(result.statusCode);
      expect(
        await asOwner(`select row_to_json(s) as data from rowing_session s where id=$1`, [session]),
      ).toEqual(before);
      expect(await readFile(join(dir, originalKey(club, clip)), 'utf8')).toBe('safe');
      expect((await asOwner(`select body from annotation where id=$1`, [oldNote]))[0]).toEqual({
        body: 'Old own feedback',
      });
    });
  it('denies tus creation, append and termination before touching files', async () => {
    const b64 = (s: string) => Buffer.from(s).toString('base64');
    const created = await send('a', 'POST', '/api/uploads', undefined, {
      'tus-resumable': '1.0.0',
      'upload-length': '20',
      'upload-metadata': `sessionId ${b64(session)},filename ${b64('new.mp4')},filetype ${b64('video/mp4')},perspective ${b64('boat')}`,
    });
    expect([403, 404], created.body).toContain(created.statusCode);
    const appended = await send('a', 'PATCH', `/api/uploads/${upload}`, Buffer.from('evil'), {
      'tus-resumable': '1.0.0',
      'upload-offset': '4',
      'content-length': '4',
    });
    expect([403, 404], appended.body).toContain(appended.statusCode);
    const removed = await send('a', 'DELETE', `/api/uploads/${upload}`, undefined, {
      'tus-resumable': '1.0.0',
    });
    expect([403, 404], removed.body).toContain(removed.statusCode);
    expect(await readFile(join(dir, originalKey(club, upload)), 'utf8')).toBe('part');
  });
  it('enforces the same boundary for direct SQL writes', async () => {
    const context = { clubId: club, userId: ids.a, roles: ['rower'] as Role[] };
    for (const statement of [
      sql`update rowing_session set title='Denied' where id=${session} returning id`,
      sql`delete from lineup_seat where session_id=${session} returning seat`,
      sql`update annotation set body='Denied' where id=${oldNote} returning id`,
      sql`delete from video where id=${clip} returning id`,
    ]) {
      const changed = await withTenant(handle.db, context, (tx) => tx.execute(statement));
      expect(changed.rows).toEqual([]);
    }
    await expect(
      withTenant(handle.db, context, (tx) =>
        tx.execute(
          sql`insert into annotation(club_id,video_id,frame,body,author_name,author_user_id) values(${club},${clip},4,'Denied','Viewer',${ids.a})`,
        ),
      ),
    ).rejects.toThrow();
  });
  it('allows unrelated coach/admin edits and preserves rower-owned editing', async () => {
    for (const who of ['coach', 'admin'] as const)
      expect(
        (await send(who, 'PATCH', `/api/sessions/${session}`, { title: `Edited by ${who}` }))
          .statusCode,
      ).toBe(200);
    const mine = await send('a', 'POST', '/api/sessions', {
      title: 'My training',
      date: '2026-11-06',
    });
    expect(mine.statusCode, mine.body).toBe(201);
    const id = mine.json<{ id: string }>().id;
    expect((await send('a', 'PATCH', `/api/sessions/${id}`, { title: 'My edit' })).statusCode).toBe(
      200,
    );
    expect((await send('a', 'DELETE', `/api/sessions/${id}`)).statusCode).toBe(204);
  });
});

for (let mask = 1; mask < 8; mask++) {
  const roles = (['rower', 'coach', 'admin'] as Role[]).filter(
    (_, index) => (mask & (1 << index)) !== 0,
  );
  it(`${roles.join('+')} combines club reading with the correct foreign write scope`, async () => {
    await asOwner(`update membership set roles=$1 where club_id=$2 and user_id=$3`, [
      roles,
      club,
      ids.a,
    ]);
    try {
      const canWrite = roles.includes('coach') || roles.includes('admin');
      const detail = await send('a', 'GET', `/api/sessions/${session}`);
      expect(detail.statusCode).toBe(200);
      expect(detail.json<{ canEdit: boolean }>().canEdit).toBe(canWrite);
      const v = await send('a', 'GET', `/api/videos/${clip}`);
      expect(v.statusCode).toBe(200);
      expect(v.json<{ canEdit: boolean }>().canEdit).toBe(canWrite);
      const feedback = (await send('a', 'GET', `/api/videos/${clip}/annotations`)).json<{
        annotations: { id: string; canEdit: boolean }[];
      }>().annotations;
      expect(feedback.find((n) => n.id === oldNote)?.canEdit).toBe(canWrite);
      expect(feedback.some((n) => n.id === privateNote)).toBe(canWrite);
      const changed = await send('a', 'PATCH', `/api/sessions/${session}`, {
        title: `Combination ${String(mask)}`,
      });
      expect(changed.statusCode).toBe(canWrite ? 200 : 403);
      const result = await withTenant(handle.db, { clubId: club, userId: ids.a, roles }, (tx) =>
        tx.execute<{ editable: boolean }>(
          sql`select rowlens_can_edit_session(${other}::uuid) as editable`,
        ),
      );
      expect(result.rows[0]?.editable).toBe(false);
    } finally {
      await asOwner(`update membership set roles=ARRAY['rower'] where club_id=$1 and user_id=$2`, [
        club,
        ids.a,
      ]);
    }
  });
}

it('allows staff uploads and deletion in foreign trainings, including real media effects', async () => {
  const b64 = (s: string) => Buffer.from(s).toString('base64');
  for (const who of ['coach', 'admin'] as const) {
    const created = await send(who, 'POST', '/api/uploads', undefined, {
      'tus-resumable': '1.0.0',
      'upload-length': '20',
      'upload-metadata': `sessionId ${b64(session)},filename ${b64('staff.mp4')},filetype ${b64('video/mp4')},perspective ${b64('boat')}`,
    });
    expect(created.statusCode, created.body).toBe(201);
    const location = String(created.headers['location']);
    const id = location.split('/').at(-1) ?? '';
    const appended = await send(who, 'PATCH', `/api/uploads/${id}`, Buffer.from('data'), {
      'tus-resumable': '1.0.0',
      'upload-offset': '0',
      'content-length': '4',
    });
    expect(appended.statusCode, appended.body).toBe(204);
    expect(await readFile(join(dir, originalKey(club, id)), 'utf8')).toBe('data');
    expect(
      (await send(who, 'DELETE', `/api/uploads/${id}`, undefined, { 'tus-resumable': '1.0.0' }))
        .statusCode,
    ).toBe(204);
    expect(await media.size(originalKey(club, id))).toBe(0);
    const made = await send('b', 'POST', '/api/sessions', {
      title: `Staff delete ${who}`,
      date: '2026-11-06',
    });
    const target = made.json<{ id: string }>().id;
    expect(
      (await send(who, 'PUT', `/api/sessions/${target}/lineup`, { boatType: 'C1x', seats: [] }))
        .statusCode,
    ).toBe(200);
    const [v] = await asOwner<{ id: string }>(
      `insert into video(club_id,session_id,original_filename,content_type,perspective,size_bytes) values($1,$2,'safe.mp4','video/mp4','boat',4) returning id`,
      [club, target],
    );
    const vid = v?.id ?? '';
    await media.append(originalKey(club, vid), Readable.from(Buffer.from('safe')), 4);
    expect((await send(who, 'DELETE', `/api/sessions/${target}`)).statusCode).toBe(204);
    expect(await media.size(originalKey(club, vid))).toBe(0);
  }
});

it('prevents rower ownership hijacking and coach creator reassignment beneath the API', async () => {
  const unchanged = await withTenant(
    handle.db,
    { clubId: club, userId: ids.a, roles: ['rower'] },
    (tx) =>
      tx.execute(
        sql`update rowing_session set created_by_user_id=${ids.a} where id=${session} returning id`,
      ),
  );
  expect(unchanged.rows).toEqual([]);
  await expect(
    withTenant(handle.db, { clubId: club, userId: ids.coach, roles: ['coach'] }, (tx) =>
      tx.execute(
        sql`update rowing_session set created_by_user_id=${ids.coach} where id=${session} returning id`,
      ),
    ),
  ).rejects.toThrow();
});

it('rechecks upload ownership after waiting for a concurrent creator transfer', async () => {
  const made = await send('a', 'POST', '/api/sessions', {
    title: 'Transfer race',
    date: '2026-11-06',
  });
  const target = made.json<{ id: string }>().id;
  const [v] = await asOwner<{ id: string }>(
    `insert into video(club_id,session_id,original_filename,content_type,perspective,size_bytes) values($1,$2,'race.mp4','video/mp4','boat',20) returning id`,
    [club, target],
  );
  const id = v?.id ?? '';
  await media.append(originalKey(club, id), Readable.from(Buffer.from('safe')), 4);
  let release!: () => void;
  let locked!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const ready = new Promise<void>((resolve) => {
    locked = resolve;
  });
  const transfer = withTenant(
    handle.db,
    { clubId: club, userId: ids.admin, roles: ['admin'] },
    async (tx) => {
      await tx.execute(
        sql`update rowing_session set created_by_user_id=${ids.b} where id=${target}`,
      );
      locked();
      await gate;
    },
  );
  let append: ReturnType<typeof send> | undefined;
  try {
    await ready;
    append = send('a', 'PATCH', `/api/uploads/${id}`, Buffer.from('evil'), {
      'tus-resumable': '1.0.0',
      'upload-offset': '4',
      'content-length': '4',
    });
    // Start injection now, then wait for the actual database lock rather than a timer.
    const response = Promise.resolve(append);
    await expect
      .poll(
        async () =>
          (
            await asOwner<{ waiting: boolean }>(
              `select exists(select 1 from pg_stat_activity where wait_event_type='Lock' and query like '%rowing_session%' and query like '%for update%') as waiting`,
            )
          )[0]?.waiting,
      )
      .toBe(true);
    release();
    await transfer;
    expect([403, 404]).toContain((await response).statusCode);
    expect(await readFile(join(dir, originalKey(club, id)), 'utf8')).toBe('safe');
  } finally {
    release();
    await transfer;
    await append;
    await send('admin', 'DELETE', `/api/sessions/${target}`);
  }
});

it('keeps a slow upload chunk authorized beyond the normal idle-transaction timeout', async () => {
  const made = await send('a', 'POST', '/api/sessions', {
    title: 'Slow upload',
    date: '2026-11-06',
  });
  const target = made.json<{ id: string }>().id;
  const [v] = await asOwner<{ id: string }>(
    `insert into video(club_id,session_id,original_filename,content_type,perspective,size_bytes) values($1,$2,'slow.mp4','video/mp4','boat',20) returning id`,
    [club, target],
  );
  const id = v?.id ?? '';
  const append = media.append.bind(media);
  const delayed = vi.spyOn(media, 'append').mockImplementationOnce(async (...args) => {
    await new Promise((resolve) => setTimeout(resolve, 16_000));
    return append(...args);
  });
  try {
    const response = await send('a', 'PATCH', `/api/uploads/${id}`, Buffer.from('safe'), {
      'tus-resumable': '1.0.0',
      'upload-offset': '0',
      'content-length': '4',
    });
    expect(response.statusCode, response.body).toBe(204);
    expect(await readFile(join(dir, originalKey(club, id)), 'utf8')).toBe('safe');
    const row = (
      await asOwner<{ uploaded_bytes: number }>('select uploaded_bytes from video where id=$1', [
        id,
      ])
    )[0];
    expect(Number(row?.uploaded_bytes)).toBe(4);
  } finally {
    delayed.mockRestore();
    await send('admin', 'DELETE', `/api/sessions/${target}`);
  }
}, 30_000);

it('keeps legacy image visibility and write policies aligned during upgrade and rollback', async () => {
  // Images before #155 do not set this new server-controlled context. Their media handlers
  // rely on visible trainings being writable; do not widen those reads before replacing them.
  for (const who of ['a', 'coach', 'admin'] as const) {
    const roles: Role[] = who === 'a' ? ['rower'] : [who];
    const rows = await withTenant(
      handle.db,
      { clubId: club, userId: ids[who], roles },
      async (tx) => {
        await tx.execute(sql`select set_config('app.training_permissions', '', true)`);
        const visible = await tx.execute<{ id: string; writable: boolean }>(
          sql`select id, rowlens_can_edit_session(id) as writable from rowing_session where id in (${session},${legacy}) order by id`,
        );
        const changed = await tx.execute<{ id: string }>(
          sql`update rowing_session set title=title where id=${session} returning id`,
        );
        return { visible: visible.rows, changed: changed.rows };
      },
    );
    const expected = who === 'coach' ? [] : who === 'admin' ? [session, legacy] : [session];
    expect(rows.visible.map((s) => s.id).sort()).toEqual(expected.sort());
    expect(rows.visible.every((s) => s.writable)).toBe(true);
    expect(rows.changed).toHaveLength(who === 'coach' ? 0 : 1);
  }
  // The new image opts in on every transaction: the participant still cannot write.
  const current = await send('a', 'GET', `/api/sessions/${session}`);
  expect(current.json<{ canEdit: boolean }>().canEdit).toBe(false);
  expect(
    (await send('coach', 'GET', `/api/sessions/${session}`)).json<{ canEdit: boolean }>().canEdit,
  ).toBe(true);
});

it('fails closed for an unrecognized training permission capability', async () => {
  const rows = await withTenant(
    handle.db,
    { clubId: club, userId: ids.admin, roles: ['admin'] },
    async (tx) => {
      await tx.execute(sql`select set_config('app.training_permissions','unknown',true)`);
      return tx.execute(sql`select id from rowing_session where id=${session}`);
    },
  );
  expect(rows.rows).toEqual([]);
});
