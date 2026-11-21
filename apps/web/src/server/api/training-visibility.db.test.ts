import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Readable } from 'node:stream';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../app.ts';
import { loadConfig } from '../config.ts';
import { sha256 } from '../auth/crypto.ts';
import { MediaStore, videoKey } from '../media/store.ts';
import { withBasePath } from '../../shared/base-path.ts';
import { randomUUID } from 'node:crypto';
import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, inject, it } from 'vitest';
import { connectDatabase, type DatabaseHandle } from '../db/client.ts';
import { withTenant, type TenantContext } from '../db/tenant.ts';
import { asOwner, createTwoClubs } from '../db/test/fixtures.ts';
import { readSettings, writeSettings } from '../repositories/user-settings.ts';
import type { Role } from '../../shared/roles.ts';
let app: FastifyInstance;
let media: MediaStore;
let directory = '';
const token = randomUUID().replaceAll('-', '').repeat(2),
  csrf = randomUUID();
const cookie = `rowlens_sid=${token}; rowlens_csrf=${csrf}`;
let h: DatabaseHandle, clubs: { a: string; b: string };
const viewer = randomUUID(),
  maker = randomUUID(),
  platform = randomUUID();
const own = randomUUID(),
  crew = randomUUID(),
  unrelated = randomUUID(),
  example = randomUUID();
const video = randomUUID(),
  privateVideo = randomUUID(),
  person = randomUUID();
const tenant = (
  roles: readonly Role[] = ['rower'],
  extra: Partial<TenantContext> = {},
): TenantContext => ({ clubId: clubs.a, userId: viewer, roles, ...extra });
beforeAll(async () => {
  h = connectDatabase(inject('appUrl'), 2);
  clubs = await createTwoClubs();
  directory = await mkdtemp(join(tmpdir(), 'rowlens-examples-'));
  media = new MediaStore(directory);
  app = await buildApp({
    database: h.db,
    media,
    clientDir: null,
    logger: false,
    config: loadConfig({
      UNIFIED_USERS: 'true',
      PUBLIC_ORIGIN: 'http://localhost:3101',
      OTP_PEPPER: 'a'.repeat(64),
    }),
  });
  for (const id of [viewer, maker, platform])
    await asOwner(
      "insert into app_user(id,email,display_name,verified_at) values($1,$2,'Synthetic',now())",
      [id, `${id}@example.test`],
    );
  await asOwner('insert into platform_admin(user_id) values($1)', [platform]);
  await asOwner("insert into membership(club_id,user_id,roles) values($1,$2,ARRAY['rower'])", [
    clubs.a,
    viewer,
  ]);
  await asOwner("insert into rower(id,club_id,user_id,display_name) values($1,$2,$3,'Synthetic')", [
    person,
    clubs.a,
    viewer,
  ]);
  for (const [id, creator, cid] of [
    [own, viewer, clubs.a],
    [crew, maker, clubs.a],
    [unrelated, maker, clubs.a],
    [example, platform, clubs.b],
  ]) {
    if (id === example)
      await withTenant(
        h.db,
        { clubId: clubs.b, userId: platform, roles: ['admin'], platformAdmin: true },
        (tx) =>
          tx.execute(
            sql`insert into rowing_session(id,club_id,title,session_date,created_by_user_id) values(${id},${cid},'Synthetic','2026-11-15',${creator})`,
          ),
      );
    else
      await asOwner(
        "insert into rowing_session(id,club_id,title,session_date,created_by_user_id) values($1,$2,'Synthetic','2026-11-15',$3)",
        [id, cid, creator],
      );
  }
  await asOwner('insert into lineup_seat(club_id,session_id,seat,rower_id) values($1,$2,0,$3)', [
    clubs.a,
    crew,
    person,
  ]);
  for (const [id, sid, cid] of [
    [video, example, clubs.b],
    [privateVideo, unrelated, clubs.a],
  ])
    await asOwner(
      "insert into video(id,club_id,session_id,original_filename,content_type,perspective,size_bytes) values($1,$2,$3,'synthetic.mp4','video/mp4','bank',1)",
      [id, cid, sid],
    );
  await asOwner(
    "insert into annotation(club_id,video_id,frame,body,author_user_id,author_name) values($1,$2,1,'Private',$3,'Synthetic')",
    [clubs.a, privateVideo, viewer],
  );
  await asOwner(
    "insert into account_session(user_id,token_hash,csrf_hash,expires_at) values($1,$2,$3,now()+interval '1 day')",
    [viewer, sha256(token), sha256(csrf)],
  );
  const [asset] = await asOwner<{ asset_id: string }>('select asset_id from video where id=$1', [
    video,
  ]);
  const key = videoKey(clubs.b, asset?.asset_id ?? video) + '/play-540';
  await media.append(key, Readable.from(Buffer.from('demo')), 4);
  await asOwner(
    "update video set status='ready',fps_num=30,fps_den=1,width=640,height=360,renditions=$2::jsonb where id=$1",
    [
      video,
      JSON.stringify([
        { name: 'play-540', key, width: 640, height: 360, bytes: 4, contentType: 'video/mp4' },
      ]),
    ],
  );
});
afterAll(async () => {
  await app.close();
  await h.close();
  await rm(directory, { recursive: true, force: true });
});
describe('creator/participant visibility and authenticated examples', () => {
  for (const roles of [
    ['rower'],
    ['coach'],
    ['admin'],
    ['rower', 'coach'],
    ['rower', 'admin'],
    ['coach', 'admin'],
    ['rower', 'coach', 'admin'],
  ] as Role[][]) {
    it(`enforces visibility for ${roles.join('+')}`, async () => {
      const seen = await withTenant(h.db, tenant(roles), async (tx) =>
        (await tx.execute<{ id: string }>(sql`select id from rowing_session`)).rows.map(
          (r) => r.id,
        ),
      );
      expect(seen).toContain(own);
      expect(seen).toContain(crew);
      expect(seen).not.toContain(example);
      expect(seen.includes(unrelated)).toBe(roles.includes('coach') || roles.includes('admin'));
    });
  }
  it('does not expose old own feedback when its parent is inaccessible', async () => {
    expect(
      await withTenant(
        h.db,
        tenant(),
        async (tx) =>
          (await tx.execute(sql`select id from annotation where video_id=${privateVideo}`)).rows,
      ),
    ).toEqual([]);
  });
  it('allows a verified clubless viewer only the selected example, never private content or writes', async () => {
    const scope = tenant(['rower'], { clubId: clubs.b, exampleSessionId: example });
    const read = await withTenant(h.db, scope, async (tx) => ({
      sessions: (await tx.execute<{ id: string }>(sql`select id from rowing_session`)).rows,
      videos: (await tx.execute<{ id: string }>(sql`select id from video`)).rows,
      notes: (await tx.execute(sql`select id from annotation`)).rows,
      members: (await tx.execute(sql`select user_id from membership`)).rows,
      changes: (await tx.execute(sql`update rowing_session set title='Denied' where id=${example}`))
        .rowCount,
    }));
    expect(read).toEqual({
      sessions: [{ id: example }],
      videos: [{ id: video }],
      notes: [],
      members: [],
      changes: 0,
    });
    expect(
      await withTenant(
        h.db,
        tenant(['rower'], { exampleSessionId: unrelated }),
        async (tx) => (await tx.execute(sql`select id from rowing_session`)).rows,
      ),
    ).toEqual([]);
    expect(
      await withTenant(
        h.db,
        tenant(['rower'], { clubId: clubs.b, exampleSessionId: example, userId: randomUUID() }),
        async (tx) => (await tx.execute(sql`select id from rowing_session`)).rows,
      ),
    ).toEqual([]);
  });
  it('validates primary membership and preserves revision conflicts', async () => {
    const ctx = tenant();
    const settings = await readSettings(h.db, ctx, viewer);
    const saved = await writeSettings(
      h.db,
      ctx,
      viewer,
      { primaryClubId: clubs.a },
      settings?.revision ?? 0,
    );
    expect(saved).toMatchObject({ primaryClubId: clubs.a });
    expect(
      await writeSettings(h.db, ctx, viewer, { primaryClubId: clubs.a }, settings?.revision ?? 0),
    ).toEqual({ conflict: true });
    expect(
      await writeSettings(
        h.db,
        ctx,
        viewer,
        { primaryClubId: clubs.b },
        (settings?.revision ?? 0) + 1,
      ),
    ).toBeNull();
  });
});

const call = (path: string, method: 'GET' | 'POST' | 'PATCH' = 'GET', payload?: unknown) =>
  app.inject({
    method,
    url: withBasePath('/projects/rowlens', path),
    headers: {
      cookie,
      origin: 'http://localhost:3101',
      'x-csrf-token': csrf,
      'content-type': 'application/json',
    },
    ...(payload === undefined ? {} : { payload: JSON.stringify(payload) }),
  });
describe('authenticated example API', () => {
  it('discovers examples and exposes only the safe projection across clubs', async () => {
    const list = await call('/api/examples');
    expect(list.statusCode).toBe(200);
    expect(list.json<{ examples: { id: string }[] }>().examples.map((s) => s.id)).toContain(
      example,
    );
    // The overview card fields (boat, crew, video count) keep the same safe projection.
    const row = list
      .json<{ examples: Record<string, unknown>[] }>()
      .examples.find((s) => s.id === example);
    expect(Object.keys(row ?? {}).sort()).toEqual(
      ['boatType', 'clubId', 'clubName', 'date', 'id', 'lineup', 'title', 'videoCount'].sort(),
    );
    expect(list.body).not.toMatch(
      /email|originalFilename|authorUserId|createdByUserId|createdAt|Private/,
    );
    const snapshot = await call(`/api/examples/${example}`);
    expect(snapshot.statusCode).toBe(200);
    expect(snapshot.body).not.toMatch(
      /email|originalFilename|authorUserId|renditions.*key|Private/,
    );
    expect((await call(`/api/examples/${unrelated}`)).statusCode).toBe(404);
    expect((await call(`/api/videos/${video}?club=${clubs.b}`)).statusCode).toBe(404);
    expect(
      (await app.inject({ url: withBasePath('/projects/rowlens', '/api/examples') })).statusCode,
    ).toBe(404);
  });
  it('streams only the example video and refuses cross-resource guesses and mutations', async () => {
    const path = `/api/examples/${example}/videos/${video}/media/play-540`;
    const r = await call(path);
    expect(r.statusCode).toBe(200);
    expect(r.body).toBe('demo');
    expect(
      (await call(`/api/examples/${example}/videos/${privateVideo}/media/play-540`)).statusCode,
    ).toBe(404);
    expect((await call(`/api/examples/${example}`, 'PATCH', { title: 'Denied' })).statusCode).toBe(
      404,
    );
  });
  it('stamps examples only from real platform creation and keeps their classification', async () => {
    const created = await withTenant(
      h.db,
      tenant(['rower']),
      async (tx) =>
        (
          await tx.execute<{ id: string; is_example: boolean }>(
            sql`insert into rowing_session(club_id,title,session_date,created_by_user_id,is_example) values(${clubs.a},'Synthetic','2026-11-15',${viewer},true) returning id,is_example`,
          )
        ).rows[0],
    );
    expect(created?.is_example).toBe(false);
    await asOwner('delete from platform_admin where user_id=$1', [platform]);
    expect((await call(`/api/examples/${example}`)).statusCode).toBe(200);
  });
  it('refuses importing a primary club as a legacy device preference', async () => {
    const r = await call('/api/me/settings', 'PATCH', {
      revision: 0,
      changes: { primaryClubId: clubs.a },
      importLegacy: true,
    });
    expect(r.statusCode).toBe(400);
  });
  it('withdraws examples immediately when their club is archived', async () => {
    await asOwner('update club set archived_at=now() where id=$1', [clubs.b]);
    try {
      expect((await call(`/api/examples/${example}`)).statusCode).toBe(404);
      expect(
        (await call(`/api/examples/${example}/videos/${video}/media/play-540`)).statusCode,
      ).toBe(404);
    } finally {
      await asOwner('update club set archived_at=null where id=$1', [clubs.b]);
    }
  });
});

describe('published example feedback', () => {
  const published = Array.from({ length: 4 }, () => randomUUID());
  const hidden = randomUUID();
  const scope = () => tenant(['rower'], { clubId: clubs.b, exampleSessionId: example });
  it('exposes only the original publisher annotations, including drawings, across clubs', async () => {
    for (const [i, kind] of ['note', 'line', 'arrow', 'angle'].entries()) {
      await asOwner(
        'insert into annotation(id,club_id,video_id,frame,kind,body,shape,author_user_id,author_name) values($1,$2,$3,10,$4,$5,$6::jsonb,$7,$8)',
        [
          published[i],
          clubs.b,
          video,
          kind,
          `Published ${kind}`,
          kind === 'note'
            ? null
            : JSON.stringify({
                ignoredPrivateMetadata: 'Hidden shape metadata',
                points: [[0.1, 0.2], [0.5, 0.6], ...(kind === 'angle' ? [[0.8, 0.2]] : [])],
              }),
          platform,
          'Private author label',
        ],
      );
    }
    await asOwner(
      "insert into annotation(id,club_id,video_id,frame,body,author_user_id,author_name) values($1,$2,$3,10,'Hidden sibling',$4,'Hidden author'),(gen_random_uuid(),$2,$3,20,'Hidden legacy',null,'Hidden legacy author')",
      [hidden, clubs.b, video, maker],
    );
    await asOwner('insert into moment(club_id,video_id,frame) values($1,$2,10)', [clubs.b, video]);
    const snapshot = await call(`/api/examples/${example}`);
    expect(snapshot.statusCode).toBe(200);
    const rows = snapshot.json<{ videos: { annotations: { id: string; canEdit: boolean }[] }[] }>()
      .videos[0]?.annotations;
    expect(rows?.map((a) => a.id).sort()).toEqual([...published].sort());
    expect(rows?.every((a) => !a.canEdit)).toBe(true);
    expect(Object.keys(rows?.[0] ?? {}).sort()).toEqual([
      'body',
      'canEdit',
      'frame',
      'id',
      'kind',
      'shape',
    ]);
    expect(snapshot.body).not.toMatch(
      /Hidden|Private author|authorUserId|authorName|createdAt|examplePublisher/,
    );
    const direct = await withTenant(h.db, scope(), async (tx) => ({
      notes: (await tx.execute<{ id: string }>(sql`select id from annotation`)).rows
        .map((r) => r.id)
        .sort(),
      moments: (await tx.execute(sql`select * from moment`)).rows,
      references: (await tx.execute(sql`select * from video_annotation_reference`)).rows,
    }));
    expect(direct).toEqual({ notes: [...published].sort(), moments: [], references: [] });
  });
  it('freezes publisher attribution through creator transfer and forged updates', async () => {
    await asOwner(
      'update rowing_session set created_by_user_id=$1,example_publisher_user_id=$1 where id=$2',
      [maker, example],
    );
    const [row] = await asOwner<{ example_publisher_user_id: string }>(
      'select example_publisher_user_id from rowing_session where id=$1',
      [example],
    );
    expect(row?.example_publisher_user_id).toBe(platform);
    const snapshot = await call(`/api/examples/${example}`);
    expect(snapshot.body).toContain('Published note');
    expect(snapshot.body).not.toContain('Hidden sibling');
    const [forged] = await withTenant(
      h.db,
      tenant(),
      async (tx) =>
        (
          await tx.execute<{ is_example: boolean; example_publisher_user_id: string | null }>(
            sql`insert into rowing_session(club_id,title,session_date,created_by_user_id,is_example,example_publisher_user_id) values(${clubs.a},'Forged','2026-11-16',${viewer},true,${platform}) returning is_example,example_publisher_user_id`,
          )
        ).rows,
    );
    expect(forged).toEqual({ is_example: false, example_publisher_user_id: null });
  });
  it('denies published-feedback writes even when example scope contains staff roles', async () => {
    const changes = await withTenant(
      h.db,
      { ...scope(), roles: ['admin', 'coach'] },
      async (tx) => ({
        updated: (
          await tx.execute(sql`update annotation set body='Denied' where video_id=${video}`)
        ).rowCount,
        deleted: (await tx.execute(sql`delete from annotation where video_id=${video}`)).rowCount,
      }),
    );
    expect(changes).toEqual({ updated: 0, deleted: 0 });
    await expect(
      withTenant(h.db, scope(), (tx) =>
        tx.execute(
          sql`insert into annotation(club_id,video_id,frame,body,author_name,author_user_id) values(${clubs.b},${video},20,'Denied','Synthetic',${viewer})`,
        ),
      ),
    ).rejects.toThrow();
    expect(
      (await call(`/api/annotations/${published[0] ?? ''}`, 'PATCH', { body: 'Denied' }))
        .statusCode,
    ).toBe(404);
  });
});

describe('published example feedback for members of the owning club', () => {
  const member = randomUUID();
  const memberToken = randomUUID().replaceAll('-', '').repeat(2),
    memberCsrf = randomUUID();
  const asMember = (path: string) =>
    app.inject({
      url: withBasePath('/projects/rowlens', path),
      headers: {
        cookie: `rowlens_sid=${memberToken}; rowlens_csrf=${memberCsrf}`,
        origin: 'http://localhost:3101',
      },
    });
  beforeAll(async () => {
    await asOwner(
      "insert into app_user(id,email,display_name,verified_at) values($1,$2,'Synthetic',now())",
      [member, `${member}@example.test`],
    );
    await asOwner("insert into membership(club_id,user_id,roles) values($1,$2,ARRAY['rower'])", [
      clubs.b,
      member,
    ]);
    await asOwner(
      "insert into account_session(user_id,token_hash,csrf_hash,expires_at) values($1,$2,$3,now()+interval '1 day')",
      [member, sha256(memberToken), sha256(memberCsrf)],
    );
    // The example is shared with the whole owning club, so its members open the normal pages.
    await asOwner(
      "insert into session_share(club_id,session_id,scope,shared_by_user_id) values($1,$2,'club',$3)",
      [clubs.b, example, platform],
    );
  });
  it('shows a rower of the owning club the publisher notes in the normal video page', async () => {
    const r = await asMember(`/api/videos/${video}/annotations?club=${clubs.b}`);
    expect(r.statusCode).toBe(200);
    const body = r.json<{ annotations: { body: string | null }[] }>();
    expect(body.annotations.map((a) => a.body)).toContain('Published note');
    expect(r.body).not.toMatch(/Hidden sibling|Hidden legacy/);
  });
});
