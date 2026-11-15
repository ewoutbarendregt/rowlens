import pg from 'pg';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { Readable } from 'node:stream';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../app.ts';
import { loadConfig } from '../config.ts';
import { sha256 } from '../auth/crypto.ts';
import { MediaStore, videoKey } from '../media/store.ts';
import { withBasePath } from '../../shared/base-path.ts';
import { sessionSharingSchema, type SessionSharing } from '../../shared/session-sharing.ts';
import { randomUUID } from 'node:crypto';
import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, inject, it, vi } from 'vitest';
import { connectDatabase, type DatabaseHandle } from '../db/client.ts';
import { withTenant, type TenantContext } from '../db/tenant.ts';
import { asOwner, createTwoClubs } from '../db/test/fixtures.ts';
let app: FastifyInstance, media: MediaStore;
let directory = '';
const cookies = new Map<string, string>();
const vid = randomUUID(),
  roster = randomUUID();
let h: DatabaseHandle, clubs: { a: string; b: string };
const owner = randomUUID(),
  recipient = randomUUID(),
  other = randomUUID(),
  coach = randomUUID(),
  foreign = randomUUID(),
  sid = randomUUID();
const context = (
  userId: string = owner,
  roles: readonly ('rower' | 'coach' | 'admin')[] = ['rower'],
  clubId = clubs.a,
): TenantContext => ({ clubId, userId, roles, unifiedUsers: true });
async function replace(clubWide: boolean, ids: string[], revision: number, ctx = context()) {
  return withTenant(
    h.db,
    ctx,
    async (tx) =>
      (
        await tx.execute<{ value: unknown }>(
          sql`select rowlens_set_session_sharing(${sid}::uuid,${clubWide},${JSON.stringify(ids)}::jsonb,${revision}) as value`,
        )
      ).rows[0]?.value,
  );
}
async function visible(userId: string) {
  return withTenant(
    h.db,
    context(userId),
    async (tx) =>
      (await tx.execute(sql`select id from rowing_session where id=${sid}::uuid`)).rows.length > 0,
  );
}
beforeAll(async () => {
  h = connectDatabase(inject('appUrl'), 3);
  clubs = await createTwoClubs();
  directory = await mkdtemp(join(tmpdir(), 'rowlens-sharing-'));
  media = new MediaStore(directory);
  app = await buildApp({
    database: h.db,
    media,
    clientDir: null,
    logger: false,
    config: loadConfig({
      UNIFIED_USERS: 'true',
      PUBLIC_ORIGIN: 'http://localhost:3190',
      OTP_PEPPER: 'b'.repeat(64),
    }),
  });
  for (const id of [owner, recipient, other, coach, foreign])
    await asOwner(
      "insert into app_user(id,email,display_name,first_name,last_name,verified_at) values($1,$2,'Synthetic Member','Synthetic','Member',now())",
      [id, `${id}@example.test`],
    );
  for (const id of [owner, recipient, other, coach])
    await asOwner('insert into membership(club_id,user_id,roles) values($1,$2,$3)', [
      clubs.a,
      id,
      id === coach ? ['coach'] : ['rower'],
    ]);
  await asOwner("insert into membership(club_id,user_id,roles) values($1,$2,ARRAY['rower'])", [
    clubs.b,
    foreign,
  ]);
  await asOwner(
    "insert into rowing_session(id,club_id,title,session_date,created_by_user_id) values($1,$2,'Shared fixture','2026-11-15',$3)",
    [sid, clubs.a, owner],
  );
  for (const id of [owner, recipient, other, coach, foreign]) {
    const token = randomUUID().replaceAll('-', '').repeat(2),
      csrf = randomUUID();
    cookies.set(id, `rowlens_sid=${token}; rowlens_csrf=${csrf}`);
    await asOwner(
      "insert into account_session(user_id,token_hash,csrf_hash,expires_at) values($1,$2,$3,now()+interval '1 day')",
      [id, sha256(token), sha256(csrf)],
    );
  }
  await asOwner("update app_user set last_name='Coach' where id=$1", [coach]);
  await asOwner(
    "insert into video(id,club_id,session_id,original_filename,content_type,perspective,size_bytes,status,frame_count,fps_num,fps_den,width,height) values($1,$2,$3,'synthetic.mp4','video/mp4','bank',4,'ready',120,30,1,640,360)",
    [vid, clubs.a, sid],
  );
  const [asset] = await asOwner<{ asset_id: string }>('select asset_id from video where id=$1', [
    vid,
  ]);
  const key = videoKey(clubs.a, asset?.asset_id ?? '') + '/play-540';
  await media.append(key, Readable.from('demo'), 4);
  await asOwner('update video set renditions=$1::jsonb where id=$2', [
    JSON.stringify([
      { name: 'play-540', key, width: 640, height: 360, bytes: 4, contentType: 'video/mp4' },
    ]),
    vid,
  ]);
  await asOwner(
    "insert into rower(id,club_id,user_id,display_name) values($1,$2,$3,'Synthetic Recipient')",
    [roster, clubs.a, recipient],
  );
  await asOwner(
    "insert into annotation(club_id,video_id,frame,kind,body,author_name,author_user_id) values($1,$2,1,'note','Private fixture','Synthetic',$3),($1,$2,2,'note','For selected recipient','Synthetic',$3)",
    [clubs.a, vid, owner],
  );
  const [moment] = await asOwner<{ id: string }>(
    'insert into moment(club_id,video_id,frame) values($1,$2,2) returning id',
    [clubs.a, vid],
  );
  await asOwner(
    "insert into moment_share(club_id,moment_id,scope,rower_id,shared_by_user_id) values($1,$2,'rower',$3,$4)",
    [clubs.a, moment?.id, roster, owner],
  );
});
afterAll(async () => {
  await app.close();
  await h.close();
  await rm(directory, { recursive: true, force: true });
});
describe('whole training sharing', () => {
  it('grants selected current club members read access only and prevents forwarding', async () => {
    expect(await visible(recipient)).toBe(false);
    expect(await replace(false, [recipient], 0)).toMatchObject({
      revision: 1,
      clubWide: false,
      members: [{ id: recipient }],
    });
    expect(await visible(recipient)).toBe(true);
    expect(await visible(other)).toBe(false);
    const rights = await withTenant(
      h.db,
      context(recipient),
      async (tx) =>
        (
          await tx.execute(
            sql`select rowlens_can_edit_session(${sid}::uuid) as edit,rowlens_can_manage_session_sharing(${sid}::uuid) as share`,
          )
        ).rows[0],
    );
    expect(rights).toEqual({ edit: false, share: false });
    expect(await replace(true, [], 1, context(recipient))).toBeNull();
  });
  it('rejects foreign recipients and stale audience saves without replacing current grants', async () => {
    expect(await replace(true, [], 0)).toEqual({ error: 'conflict' });
    expect(await replace(false, [foreign], 1)).toEqual({ error: 'invalid_recipients' });
    expect(await visible(recipient)).toBe(true);
  });
  it('combines club-wide and individual grants and revokes them independently', async () => {
    const saved = (await replace(true, [recipient], 1)) as { revision: number };
    expect(await visible(other)).toBe(true);
    const explicit = (await replace(false, [recipient], saved.revision)) as { revision: number };
    expect(await visible(other)).toBe(false);
    expect(await visible(recipient)).toBe(true);
    await replace(false, [], explicit.revision);
    expect(await visible(recipient)).toBe(false);
  });
});

async function audience(): Promise<SessionSharing> {
  return withTenant(h.db, context(), async (tx) =>
    sessionSharingSchema.parse(
      (
        await tx.execute<{ value: unknown }>(
          sql`select rowlens_session_sharing(${sid}::uuid) as value`,
        )
      ).rows[0]?.value,
    ),
  );
}
async function change(clubWide: boolean, ids: string[], ctx = context()) {
  return replace(clubWide, ids, (await audience()).revision, ctx);
}
const call = (
  userId: string,
  method: 'GET' | 'PUT' | 'POST' | 'PATCH' | 'DELETE',
  path: string,
  body?: unknown,
  clubId = clubs.a,
) => {
  const cookie = cookies.get(userId) ?? '';
  return app.inject({
    method,
    url: withBasePath('/projects/rowlens', path),
    headers: {
      cookie,
      origin: 'http://localhost:3190',
      'x-rowlens-club': clubId,
      'x-csrf-token': /rowlens_csrf=([^;]+)/.exec(cookie)?.[1] ?? '',
      ...(body === undefined ? {} : { 'content-type': 'application/json' }),
    },
    ...(body === undefined ? {} : { payload: JSON.stringify(body) }),
  });
};
describe('sharing API, privacy and lifecycle', () => {
  it('gates the audience/search to managers and includes all club roles without emails', async () => {
    await change(false, [recipient]);
    const result = await call(owner, 'GET', `/api/sessions/${sid}/sharing/members?q=Coach`);
    expect(result.statusCode).toBe(200);
    expect(result.json<{ members: { id: string }[] }>().members.map((m) => m.id)).toContain(coach);
    expect(result.body).not.toContain('@');
    expect((await call(recipient, 'GET', `/api/sessions/${sid}/sharing`)).statusCode).toBe(404);
    expect(
      (await call(recipient, 'GET', `/api/sessions/${sid}/sharing/members?q=Synthetic`)).statusCode,
    ).toBe(404);
    expect(
      (await call(foreign, 'GET', `/api/sessions/${sid}/sharing`, undefined, clubs.b)).statusCode,
    ).toBe(404);
  });
  it('shares child media and intended feedback while preserving private notes and edit denial', async () => {
    const detail = await call(recipient, 'GET', `/api/sessions/${sid}`);
    expect(detail.statusCode).toBe(200);
    expect(detail.json()).toMatchObject({ canEdit: false, canShare: false, sharedWithMe: true });
    const notes = await call(recipient, 'GET', `/api/videos/${vid}/annotations`);
    expect(notes.statusCode).toBe(200);
    expect(notes.body).toContain('For selected recipient');
    expect(notes.body).not.toContain('Private fixture');
    expect((await call(recipient, 'GET', `/api/videos/${vid}/media/play-540`)).body).toBe('demo');
    expect([403, 404]).toContain(
      (await call(recipient, 'PATCH', `/api/sessions/${sid}`, { title: 'Denied' })).statusCode,
    );
    expect(
      (
        await call(recipient, 'PUT', `/api/sessions/${sid}/sharing`, {
          revision: (await audience()).revision,
          clubWide: true,
          userIds: [],
        })
      ).statusCode,
    ).toBe(404);
    await change(false, []);
    for (const path of [
      `/api/sessions/${sid}`,
      `/api/videos/${vid}`,
      `/api/videos/${vid}/media/play-540`,
      `/api/videos/${vid}/annotations`,
    ])
      expect((await call(recipient, 'GET', path)).statusCode).toBe(404);
  });
  it('supports club-wide future members without admitting pending/foreign accounts', async () => {
    await change(true, []);
    expect(await visible(other)).toBe(true);
    expect(await visible(foreign)).toBe(false);
    const later = randomUUID();
    await asOwner(
      "insert into app_user(id,email,display_name,verified_at) values($1,$2,'Synthetic Later',now())",
      [later, `${later}@example.test`],
    );
    expect(await visible(later)).toBe(false);
    await asOwner("insert into membership(club_id,user_id,roles) values($1,$2,ARRAY['rower'])", [
      clubs.a,
      later,
    ]);
    expect(await visible(later)).toBe(true);
    await change(false, []);
    expect(await visible(later)).toBe(false);
  });
  it('removes individual grants and advances the revision on membership loss without erasing audit', async () => {
    await change(false, [recipient]);
    const before = await audience();
    await asOwner('delete from membership where club_id=$1 and user_id=$2', [clubs.a, recipient]);
    const after = await audience();
    expect(after.members).toEqual([]);
    expect(after.revision).toBeGreaterThan(before.revision);
    expect(await visible(recipient)).toBe(false);
    await asOwner("insert into membership(club_id,user_id,roles) values($1,$2,ARRAY['rower'])", [
      clubs.a,
      recipient,
    ]);
    expect(await visible(recipient)).toBe(false);
    const events = await asOwner<{ action: string }>(
      'select action from session_share_event where session_id=$1 and recipient_user_id=$2 order by at,id',
      [sid, recipient],
    );
    expect(events.some((e) => e.action === 'grant')).toBe(true);
    expect(events.some((e) => e.action === 'revoke')).toBe(true);
  });
  it('refuses stale and invalid HTTP saves and forged direct grant/audit writes', async () => {
    const revision = (await audience()).revision;
    expect(
      (
        await call(owner, 'PUT', `/api/sessions/${sid}/sharing`, {
          revision: 2147483648,
          clubWide: false,
          userIds: [],
        })
      ).statusCode,
    ).toBe(400);
    expect(
      (
        await call(owner, 'PUT', `/api/sessions/${sid}/sharing`, {
          revision: revision - 1,
          clubWide: true,
          userIds: [],
        })
      ).statusCode,
    ).toBe(409);
    expect(
      (
        await call(owner, 'PUT', `/api/sessions/${sid}/sharing`, {
          revision,
          clubWide: false,
          userIds: [foreign],
        })
      ).statusCode,
    ).toBe(400);
    expect(
      (
        await call(owner, 'PUT', `/api/sessions/${sid}/sharing`, {
          revision,
          clubWide: false,
          userIds: [recipient, recipient],
        })
      ).statusCode,
    ).toBe(400);
    await expect(
      withTenant(h.db, context(), (tx) =>
        tx.execute(
          sql`insert into session_share(club_id,session_id,scope,shared_by_user_id) values(${clubs.a},${sid},'club',${owner})`,
        ),
      ),
    ).rejects.toHaveProperty('cause.code', '42501');
    await expect(
      withTenant(h.db, context(), (tx) =>
        tx.execute(
          sql`insert into session_share_event(club_id,session_id,scope,action,actor_user_id) values(${clubs.a},${sid},'club','grant',${owner})`,
        ),
      ),
    ).rejects.toHaveProperty('cause.code', '42501');
    await expect(
      withTenant(h.db, context(), (tx) =>
        tx.execute(sql`delete from session_share_event where session_id=${sid}`),
      ),
    ).rejects.toHaveProperty('cause.code', '42501');
  });
  it('rechecks current coach authority and denies archived/example contexts', async () => {
    expect(await change(false, [recipient], context(coach, ['coach']))).toMatchObject({
      members: [{ id: recipient }],
    });
    await asOwner("update membership set roles=ARRAY['rower'] where club_id=$1 and user_id=$2", [
      clubs.a,
      coach,
    ]);
    expect(await change(true, [], context(coach, ['coach']))).toBeNull();
    expect(await change(true, [], { ...context(), exampleSessionId: sid })).toBeNull();
    await asOwner('update club set archived_at=now() where id=$1', [clubs.a]);
    try {
      expect(await visible(recipient)).toBe(false);
      expect((await call(owner, 'GET', `/api/sessions/${sid}/sharing`)).statusCode).toBe(404);
    } finally {
      await asOwner('update club set archived_at=null where id=$1', [clubs.a]);
    }
  });
});

describe('sharing races and additive management roles', () => {
  it('preserves creator rights across all seven actual role combinations', async () => {
    const combinations = [
      ['rower'],
      ['coach'],
      ['admin'],
      ['rower', 'coach'],
      ['rower', 'admin'],
      ['coach', 'admin'],
      ['rower', 'coach', 'admin'],
    ] as const;
    try {
      for (const roles of combinations) {
        await asOwner('update membership set roles=$3 where club_id=$1 and user_id=$2', [
          clubs.a,
          owner,
          [...roles],
        ]);
        const revision =
          (
            await asOwner<{ revision: number }>(
              'select sharing_revision as revision from rowing_session where id=$1',
              [sid],
            )
          )[0]?.revision ?? 0;
        expect(await replace(false, [], revision, context(owner, roles))).toMatchObject({
          clubWide: false,
          members: [],
        });
      }
    } finally {
      await asOwner("update membership set roles=ARRAY['rower'] where club_id=$1 and user_id=$2", [
        clubs.a,
        owner,
      ]);
    }
  });
  it('serializes concurrent audience saves and preserves the winning revision', async () => {
    await change(false, []);
    const before = await audience();
    const saves = await Promise.all([
      replace(false, [recipient], before.revision),
      replace(false, [other], before.revision),
    ]);
    expect(
      saves.filter(
        (s) => s !== null && typeof s === 'object' && 'error' in s && s.error === 'conflict',
      ),
    ).toHaveLength(1);
    const result = await audience();
    expect(result.members).toHaveLength(1);
    expect(result.revision).toBe(before.revision + 1);
  });
  it('preserves grants on creator transfer and denies the former owner management', async () => {
    await change(false, [recipient]);
    await asOwner('update rowing_session set created_by_user_id=$2 where id=$1', [sid, other]);
    try {
      const revision =
        (
          await asOwner<{ revision: number }>(
            'select sharing_revision as revision from rowing_session where id=$1',
            [sid],
          )
        )[0]?.revision ?? 0;
      expect(await replace(true, [], revision)).toBeNull();
      expect(await visible(recipient)).toBe(true);
      expect(await replace(false, [recipient], revision, context(other))).toMatchObject({
        members: [{ id: recipient }],
      });
    } finally {
      await asOwner('update rowing_session set created_by_user_id=$2 where id=$1', [sid, owner]);
    }
  });
  it('does not turn ordinary sharing into a mutation bypass for an older image', async () => {
    await change(false, [recipient]);
    const seen = await withTenant(h.db, context(recipient), async (tx) => {
      await tx.execute(sql`select set_config('app.training_permissions','',true)`);
      return (await tx.execute(sql`select id from rowing_session where id=${sid}`)).rows;
    });
    expect(seen).toEqual([]);
  });
  it('retains global example access when club sharing is removed', async () => {
    await asOwner('insert into platform_admin(user_id) values($1)', [owner]);
    try {
      const created = await call(owner, 'POST', '/api/sessions', {
        title: 'Shared example',
        date: '2026-11-15',
      });
      expect(created.statusCode).toBe(201);
      const example = created.json<{ id: string }>().id;
      const scope = await call(owner, 'GET', `/api/sessions/${example}/sharing`);
      expect(scope.json()).toMatchObject({ isExample: true });
      expect(
        (
          await call(owner, 'PUT', `/api/sessions/${example}/sharing`, {
            revision: 0,
            clubWide: false,
            userIds: [],
          })
        ).statusCode,
      ).toBe(200);
      expect(
        (await call(foreign, 'GET', `/api/examples/${example}`, undefined, clubs.b)).statusCode,
      ).toBe(200);
      expect(
        (
          await call(foreign, 'PUT', `/api/sessions/${example}/sharing`, {
            revision: 0,
            clubWide: true,
            userIds: [],
          })
        ).statusCode,
      ).toBe(404);
    } finally {
      await asOwner('delete from platform_admin where user_id=$1', [owner]);
    }
  });
});

describe('sharing parent-lock recheck and audit retention', () => {
  it('refuses a former creator after waiting on a concurrent ownership transfer', async () => {
    const blocker = new pg.Client({ connectionString: inject('ownerUrl') });
    await blocker.connect();
    let pending: ReturnType<typeof replace> | undefined;
    try {
      await blocker.query('begin');
      await blocker.query('select id from rowing_session where id=$1 for update', [sid]);
      const revision = (await audience()).revision;
      pending = replace(true, [], revision);
      await vi.waitFor(
        async () => {
          const waits = await asOwner<{ n: number }>(
            "select count(*)::int n from pg_stat_activity where wait_event_type='Lock' and query like '%rowlens_set_session_sharing%' and pid<>pg_backend_pid()",
          );
          expect(waits[0]?.n).toBeGreaterThan(0);
        },
        { timeout: 3000, interval: 25 },
      );
      await blocker.query('update rowing_session set created_by_user_id=$2 where id=$1', [
        sid,
        other,
      ]);
      await blocker.query('commit');
      expect(await pending).toBeNull();
    } finally {
      await blocker.query('rollback');
      await blocker.end();
      await pending;
      await asOwner('update rowing_session set created_by_user_id=$2 where id=$1', [sid, owner]);
    }
  });
  it('retains grant and revocation events when the training is removed', async () => {
    await change(false, [recipient]);
    const before =
      (
        await asOwner<{ n: number }>(
          'select count(*)::int n from session_share_event where session_id=$1',
          [sid],
        )
      )[0]?.n ?? 0;
    await asOwner('delete from rowing_session where id=$1', [sid]);
    expect(await asOwner('select id from session_share where session_id=$1', [sid])).toEqual([]);
    const after =
      (
        await asOwner<{ n: number }>(
          'select count(*)::int n from session_share_event where session_id=$1',
          [sid],
        )
      )[0]?.n ?? 0;
    expect(after).toBeGreaterThan(before);
  });
});
