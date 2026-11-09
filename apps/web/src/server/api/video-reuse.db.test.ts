import { randomUUID } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Readable } from 'node:stream';
import { withBasePath } from '../../shared/base-path.ts';
import { sql } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, inject, it } from 'vitest';
import { buildApp } from '../app.ts';
import type { LoginMail } from '../auth/mail.ts';
import { loadConfig } from '../config.ts';
import { connectDatabase, type DatabaseHandle } from '../db/client.ts';
import { asOwner, createTwoClubs } from '../db/test/fixtures.ts';
import { withTenant, type TenantContext } from '../db/tenant.ts';
import { MediaStore, videoKey } from '../media/store.ts';
import { reuseVideo } from '../repositories/video-reuse.ts';
import { listSessions } from '../repositories/session-list.ts';
import type { Role } from '../../shared/roles.ts';

const BASE = '/projects/rowlens',
  ORIGIN = 'https://trustable.nl';
const tag = randomUUID();
const emails = {
  a: `reuse-a-${tag}@example.com`,
  b: `reuse-b-${tag}@example.com`,
  staff: `reuse-staff-${tag}@example.com`,
};
const cookies = { a: '', b: '', staff: '' },
  ids = { ...cookies };
let app: FastifyInstance, handle: DatabaseHandle, media: MediaStore;
let dir = '',
  club = '',
  foreignClub = '',
  sourceSession = '',
  target = '',
  source = '',
  hidden = '',
  shared = '',
  rower = '';
const mails: LoginMail[] = [];
function ctx(who: keyof typeof ids, roles: readonly Role[] = ['rower']): TenantContext {
  return { clubId: club, userId: ids[who], roles };
}
function send(
  who: keyof typeof cookies,
  method: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH',
  path: string,
  body?: unknown,
) {
  return app.inject({
    method,
    url: withBasePath(BASE, path),
    headers: {
      ...(body === undefined ? {} : { 'content-type': 'application/json' }),
      origin: ORIGIN,
      cookie: cookies[who],
      'sec-fetch-site': 'same-origin',
      'x-csrf-token': /rowlens_csrf=([^;]+)/.exec(cookies[who])?.[1] ?? '',
    },
    ...(body === undefined ? {} : { payload: JSON.stringify(body) }),
  });
}
async function training(owner: string, title = 'Workspace') {
  const [row] = await asOwner<{ id: string }>(
    `insert into rowing_session(club_id,title,session_date,created_by_user_id) values($1,$2,'2026-11-09',$3) returning id`,
    [club, title, owner],
  );
  return row?.id ?? '';
}
async function ready(session: string, tenant = club) {
  const [row] = await asOwner<{ id: string }>(
    `insert into video(club_id,session_id,original_filename,content_type,perspective,size_bytes,status,frame_count,fps_num,fps_den,width,height,renditions) values($1,$2,'same-name.mp4','video/mp4','bank',4,'ready',300,30,1,640,360,'[]') returning id`,
    [tenant, session],
  );
  return row?.id ?? '';
}
async function annotation(videoId: string, frame: number, body: string, author = ids.b) {
  const [row] = await asOwner<{ id: string }>(
    `insert into annotation(club_id,video_id,frame,body,author_name,author_user_id) values($1,$2,$3,$4,'Source coach',$5) returning id`,
    [club, videoId, frame, body, author],
  );
  return row?.id ?? '';
}
beforeAll(async () => {
  handle = connectDatabase(inject('appUrl'), 5);
  dir = await mkdtemp(join(tmpdir(), 'rowlens-reuse-'));
  media = new MediaStore(dir);
  const [pilot] = await asOwner<{ id: string }>("select id from club where slug='pilot'");
  club = pilot?.id ?? '';
  foreignClub = (await createTwoClubs()).b;
  app = await buildApp({
    database: handle.db,
    media,
    clientDir: null,
    logger: false,
    config: loadConfig({
      PUBLIC_ORIGIN: ORIGIN,
      OTP_PEPPER: 'c'.repeat(64),
      AUTH_ALLOWED_EMAILS: emails.staff,
    }),
    deliverLoginCode: (m) => {
      mails.push(m);
      return Promise.resolve();
    },
  });
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
  sourceSession = await training(ids.b, 'Source training');
  target = await training(ids.a, 'Own analysis');
  source = await ready(sourceSession);
  hidden = await annotation(source, 10, 'Private feedback');
  shared = await annotation(source, 20, 'Shared feedback');
  const [r] = await asOwner<{ id: string }>(
    `insert into rower(club_id,display_name,user_id) values($1,'Viewer',$2) returning id`,
    [club, ids.a],
  );
  rower = r?.id ?? '';
  const [m] = await asOwner<{ id: string }>(
    `insert into moment(club_id,video_id,frame) values($1,$2,20) returning id`,
    [club, source],
  );
  await asOwner(
    `insert into moment_share(club_id,moment_id,scope,rower_id,shared_by_user_id) values($1,$2,'rower',$3,$4)`,
    [club, m?.id, rower, ids.b],
  );
});
afterAll(async () => {
  await app.close();
  await handle.close();
  await rm(dir, { recursive: true, force: true });
});

describe('independent reused video entries', () => {
  it('projects creation separately from participation and staff edit rights', async () => {
    const own = await listSessions(handle.db, ctx('a'));
    expect(own.find((s) => s.id === target)?.createdByMe).toBe(true);
    expect(own.find((s) => s.id === sourceSession)?.createdByMe).toBe(false);
    const staff = await listSessions(handle.db, ctx('staff', ['coach']));
    expect(staff.find((s) => s.id === target)).toMatchObject({ createdByMe: false, canEdit: true });
  });
  it('lists only ready same-club sources and refuses foreign/unwritable targets', async () => {
    const [s] = await asOwner<{ id: string }>(
      `insert into rowing_session(club_id,title,session_date) values($1,'Foreign','2026-11-09') returning id`,
      [foreignClub],
    );
    const foreign = await ready(s?.id ?? '', foreignClub);
    const available = await send('a', 'GET', `/api/sessions/${target}/available-videos?q=Source`);
    expect(available.statusCode).toBe(200);
    expect(available.json<{ videos: { id: string }[] }>().videos.map((v) => v.id)).toContain(
      source,
    );
    expect(
      (await send('a', 'POST', `/api/sessions/${target}/reuse-video`, { sourceVideoId: foreign }))
        .statusCode,
    ).toBe(404);
    expect(
      (
        await send('a', 'POST', `/api/sessions/${sourceSession}/reuse-video`, {
          sourceVideoId: source,
        })
      ).statusCode,
    ).toBe(404);
    expect(
      (await send('a', 'GET', `/api/sessions/${sourceSession}/available-videos`)).statusCode,
    ).toBe(404);
    expect(
      (await send('a', 'POST', `/api/sessions/${target}/reuse-video`, { sourceVideoId: 'bad' }))
        .statusCode,
    ).toBe(400);
  });
  it('deduplicates concurrent reuse, keeps metadata/media, charges bytes once and starts only independent boat-line analysis', async () => {
    const before = await asOwner<{ n: string }>('select rowlens_media_bytes() as n');
    const [a, b] = await Promise.all([
      reuseVideo(handle.db, ctx('a'), target, source),
      reuseVideo(handle.db, ctx('a'), target, source),
    ]);
    expect(a?.id).toBe(b?.id);
    expect(a?.id).not.toBe(source);
    expect(await asOwner('select rowlens_media_bytes() as n')).toEqual(before);
    const detail = await send('a', 'GET', `/api/videos/${a?.id ?? ''}`);
    expect(detail.json()).toMatchObject({
      sessionId: target,
      status: 'ready',
      frameCount: 300,
      fpsNum: 30,
      assetId: source,
    });
    expect(await asOwner(`select type from job where payload->>'videoId'=$1`, [a?.id])).toEqual([
      { type: 'video.boat_line' },
    ]);
    expect((await send('a', 'GET', `/api/videos/${a?.id ?? ''}/annotations`)).json()).toMatchObject(
      {
        annotations: [],
        moments: [],
        shares: [],
      },
    );
  });
  it('shows only readable source annotations, keeps same-frame local feedback independent and rechecks sharing revocation', async () => {
    const entry = await reuseVideo(handle.db, ctx('a'), target, source);
    const id = entry?.id ?? '';
    const catalog = await send('a', 'GET', `/api/videos/${id}/source-annotations`);
    const available = catalog.json<{ annotations: { id: string }[] }>().annotations;
    expect(available.map((a) => a.id)).toContain(shared);
    expect(available.map((a) => a.id)).not.toContain(hidden);
    expect(
      (await send('a', 'PUT', `/api/videos/${id}/annotation-references/${hidden}`)).statusCode,
    ).toBe(404);
    expect(
      (await send('a', 'PUT', `/api/videos/${id}/annotation-references/${shared}`)).statusCode,
    ).toBe(204);
    expect(
      (await send('a', 'PUT', `/api/videos/${id}/annotation-references/${shared}`)).statusCode,
    ).toBe(204);
    expect((await send('a', 'GET', `/api/videos/${id}/source-annotations`)).json()).toMatchObject({
      annotations: [expect.objectContaining({ id: shared, linked: true })],
    });
    const local = await send('a', 'POST', `/api/videos/${id}/annotations`, {
      kind: 'note',
      frame: 20,
      body: 'My independent feedback',
    });
    expect(local.statusCode).toBe(201);
    expect((await send('a', 'DELETE', `/api/videos/${id}/frames/20/annotations`)).statusCode).toBe(
      204,
    );
    expect(await asOwner('select body from annotation where id=$1', [shared])).toEqual([
      { body: 'Shared feedback' },
    ]);
    await asOwner(`update annotation set body='Updated at source' where id=$1`, [shared]);
    expect((await send('a', 'GET', `/api/videos/${id}/source-annotations`)).body).toContain(
      'Updated at source',
    );
    await asOwner(`delete from moment_share where rower_id=$1`, [rower]);
    const revoked = await send('a', 'GET', `/api/videos/${id}/source-annotations`);
    expect(
      revoked.json<{ annotations: { id: string }[] }>().annotations.map((a) => a.id),
    ).not.toContain(shared);
    const links = await withTenant(handle.db, ctx('a'), (tx) =>
      tx.execute(sql`select * from video_annotation_reference where video_id=${id}::uuid`),
    );
    expect(links.rows).toEqual([]);
    expect(
      (await send('a', 'DELETE', `/api/videos/${id}/annotation-references/${shared}`)).statusCode,
    ).toBe(204);
  });
  it('denies forged asset/source/reference operations through direct SQL RLS', async () => {
    const different = await ready(await training(ids.b, 'Different recording'));
    const otherNote = await annotation(different, 1, 'Unrelated recording');
    await expect(
      withTenant(handle.db, ctx('a'), (tx) =>
        tx.execute(
          sql`insert into video_annotation_reference(club_id,video_id,annotation_id,added_by_user_id) values(${club}::uuid,${source}::uuid,${otherNote}::uuid,${ids.a}::uuid)`,
        ),
      ),
    ).rejects.toHaveProperty('cause.code', '42501');
    expect(
      (await withTenant(handle.db, ctx('a'), (tx) => tx.execute(sql`select * from video_asset`)))
        .rows,
    ).toEqual([]);
    await expect(
      withTenant(handle.db, ctx('a'), (tx) =>
        tx.execute(sql`delete from video_asset returning id`),
      ),
    ).resolves.toMatchObject({ rows: [] });
    await expect(
      withTenant(handle.db, ctx('a'), (tx) =>
        tx.execute(
          sql`insert into video_asset(id,club_id,metadata,size_bytes) values(gen_random_uuid(),${club}::uuid,'{}',1)`,
        ),
      ),
    ).rejects.toHaveProperty('cause.code', '42501');
  });
  it.each([
    ['rower'],
    ['coach'],
    ['admin'],
    ['rower', 'coach'],
    ['rower', 'admin'],
    ['coach', 'admin'],
    ['rower', 'coach', 'admin'],
  ] as Role[][])('preserves additive roles %j', async (...roles: Role[]) => {
    await asOwner('update membership set roles=$3 where club_id=$1 and user_id=$2', [
      club,
      ids.a,
      roles,
    ]);
    try {
      const entry = await reuseVideo(handle.db, ctx('a', roles), await training(ids.a), source);
      expect(entry?.id).toBeTruthy();
    } finally {
      await asOwner("update membership set roles=ARRAY['rower'] where club_id=$1 and user_id=$2", [
        club,
        ids.a,
      ]);
    }
  });
  it('keeps stroke, angle and boat-line analysis local to the reused entry', async () => {
    const entry = await reuseVideo(handle.db, ctx('a'), await training(ids.a), source);
    const id = entry?.id ?? '';
    expect(
      (await send('a', 'PUT', `/api/videos/${id}/strokes/30`, { kind: 'catch' })).statusCode,
    ).toBe(403);
    expect(
      (await send('staff', 'PUT', `/api/videos/${id}/strokes/30`, { kind: 'catch' })).statusCode,
    ).toBe(200);
    expect(
      (
        await send('staff', 'PUT', `/api/videos/${id}/angles`, {
          frame: 30,
          rowerId: rower,
          joint: 'knee',
          points: [
            [0.2, 0.3],
            [0.4, 0.5],
            [0.5, 0.7],
          ],
        })
      ).statusCode,
    ).toBe(200);
    expect(
      (
        await send('staff', 'PUT', `/api/videos/${id}/boat-line`, {
          frame: 30,
          points: [
            [0.1, 0.5],
            [0.9, 0.5],
          ],
        })
      ).statusCode,
    ).toBe(200);
    expect(await asOwner('select frame from stroke_mark where video_id=$1', [source])).toEqual([]);
    expect(await asOwner('select id from angle_measure where video_id=$1', [source])).toEqual([]);
    expect(await asOwner('select frame from video_boat_line where video_id=$1', [source])).toEqual(
      [],
    );
    expect(
      await asOwner('select video_id from video_auto_boat_line where video_id=$1', [id]),
    ).toEqual([{ video_id: id }]);
    expect(
      await asOwner('select video_id from video_auto_boat_line where video_id=$1', [source]),
    ).toEqual([]);
  });

  it('enforces archived-club and live membership boundaries', async () => {
    const [account] = await asOwner<{ id: string }>(
      "insert into app_user(email,display_name,verified_at) values('revoked-'||gen_random_uuid()||'@example.com','Revoked',now()) returning id",
    );
    const userId = account?.id ?? '';
    await asOwner("insert into membership(club_id,user_id,roles) values($1,$2,ARRAY['rower'])", [
      club,
      userId,
    ]);
    const own = await training(userId);
    const clip = await ready(own);
    await asOwner('delete from membership where club_id=$1 and user_id=$2', [club, userId]);
    expect(
      await reuseVideo(handle.db, { ...ctx('a'), userId, unifiedUsers: true }, own, clip),
    ).toBeNull();
    const [privateClub] = await asOwner<{ id: string }>(
      "insert into club(slug,name) values('reuse-archive-'||gen_random_uuid(),'Archived') returning id",
    );
    const clubId = privateClub?.id ?? '';
    const [session] = await asOwner<{ id: string }>(
      "insert into rowing_session(club_id,title,session_date,created_by_user_id) values($1,'Archived','2026-11-09',$2) returning id",
      [clubId, ids.a],
    );
    const archivedVideo = await ready(session?.id ?? '', clubId);
    await asOwner('update club set archived_at=now() where id=$1', [clubId]);
    expect(
      await reuseVideo(handle.db, { ...ctx('a'), clubId }, session?.id ?? '', archivedVideo),
    ).toBeNull();
  });

  it('protects shared media against old-image deletion before filesystem effects', async () => {
    const entry = await reuseVideo(handle.db, ctx('a'), target, source);
    expect(entry).toBeTruthy();
    await expect(
      withTenant(handle.db, ctx('staff', ['coach']), async (tx) => {
        await tx.execute(sql`select set_config('app.video_assets','',true)`);
        await tx.execute(sql`delete from video where id=${source}::uuid`);
      }),
    ).rejects.toHaveProperty('cause.message', 'shared_video_requires_asset_aware_server');
    expect(await asOwner('select id from video where id=$1', [source])).toHaveLength(1);
  });
  it('serializes reuse against source deletion and preserves the asset when reuse wins', async () => {
    const s = await training(ids.b);
    const original = await ready(s);
    const dest = await training(ids.a);
    const results = await Promise.all([
      reuseVideo(handle.db, ctx('a'), dest, original),
      send('b', 'DELETE', `/api/videos/${original}`),
    ]);
    const entry = results[0];
    expect(results[1].statusCode).toBe(204);
    if (entry)
      expect(await asOwner('select id from video_asset where id=$1', [original])).toHaveLength(1);
    else
      expect(await asOwner('select id from video_asset where id=$1', [original])).toHaveLength(0);
  });
  it('deleting the original training preserves reused playback/local feedback; last-entry and tus deletion reclaim bytes', async () => {
    const s = await training(ids.b);
    const original = await ready(s);
    const dest = await training(ids.a);
    const entry = await reuseVideo(handle.db, ctx('a'), dest, original);
    const id = entry?.id ?? '';
    await media.append(`${videoKey(club, original)}/poster`, Readable.from('JPEG'), 4);
    await annotation(id, 5, 'Local remains', ids.a);
    expect((await send('b', 'DELETE', `/api/sessions/${s}`)).statusCode).toBe(204);
    expect((await send('a', 'GET', `/api/videos/${id}/media/poster`)).body).toBe('JPEG');
    expect((await send('a', 'GET', `/api/videos/${id}/annotations`)).body).toContain(
      'Local remains',
    );
    expect(await asOwner('select id from video_asset where id=$1', [original])).toHaveLength(1);
    const terminated = await app.inject({
      method: 'DELETE',
      url: `${BASE}/api/uploads/${id}`,
      headers: {
        origin: ORIGIN,
        cookie: cookies.a,
        'tus-resumable': '1.0.0',
        'x-csrf-token': /rowlens_csrf=([^;]+)/.exec(cookies.a)?.[1] ?? '',
      },
    });
    expect(terminated.statusCode, terminated.body).toBe(204);
    expect(await media.size(`${videoKey(club, original)}/poster`)).toBe(0);
    expect(await asOwner('select id from video_asset where id=$1', [original])).toHaveLength(0);
  });
});
