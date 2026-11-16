import { randomUUID } from 'node:crypto';
import pg from 'pg';
import type { FastifyInstance } from 'fastify';
import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, inject, it } from 'vitest';
import { buildApp } from '../app.ts';
import { loadConfig } from '../config.ts';
import { sha256 } from '../auth/crypto.ts';
import { connectDatabase, type DatabaseHandle } from '../db/client.ts';
import { withTenant, type TenantContext } from '../db/tenant.ts';
import { asOwner, createTwoClubs } from '../db/test/fixtures.ts';
import { withBasePath } from '../../shared/base-path.ts';
import { exampleCandidates, publishExample } from '../repositories/example-management.ts';
import type { ExampleCandidates } from '../../shared/example-management.ts';
let h: DatabaseHandle, app: FastifyInstance, clubs: { a: string; b: string };
const owner = randomUUID(),
  publisher = randomUUID(),
  second = randomUUID(),
  coach = randomUUID(),
  admin = randomUUID(),
  outsider = randomUUID();
const cookies = new Map<string, { cookie: string; csrf: string }>();
const actor = (userId = publisher, clubId = clubs.a): TenantContext => ({
  userId,
  clubId,
  roles: ['admin'],
  platformAdmin: true,
  unifiedUsers: true,
});
async function ordinary(title = 'Existing ordinary', clubId = clubs.a) {
  const id = randomUUID();
  await asOwner(
    "insert into rowing_session(id,club_id,title,session_date,created_by_user_id) values($1,$2,$3,'2026-11-16',$4)",
    [id, clubId, title, owner],
  );
  return id;
}
const call = (
  userId: string,
  path: string,
  method: 'GET' | 'POST' = 'GET',
  body?: unknown,
  clubId = clubs.a,
) => {
  const auth = cookies.get(userId);
  if (!auth) throw new Error('Missing synthetic authentication');
  return app.inject({
    method,
    url: withBasePath('/projects/rowlens', path),
    headers: {
      cookie: auth.cookie,
      origin: 'http://localhost:3101',
      'x-csrf-token': auth.csrf,
      'x-rowlens-club': clubId,
      ...(body === undefined ? {} : { 'content-type': 'application/json' }),
    },
    ...(body === undefined ? {} : { payload: JSON.stringify(body) }),
  });
};
beforeAll(async () => {
  h = connectDatabase(inject('appUrl'), 4);
  clubs = await createTwoClubs();
  app = await buildApp({
    database: h.db,
    clientDir: null,
    logger: false,
    config: loadConfig({
      UNIFIED_USERS: 'true',
      PUBLIC_ORIGIN: 'http://localhost:3101',
      OTP_PEPPER: 'e'.repeat(64),
    }),
  });
  for (const id of [owner, publisher, second, coach, admin, outsider]) {
    await asOwner(
      "insert into app_user(id,email,display_name,first_name,last_name,verified_at) values($1,$2,'Synthetic','Synthetic','Account',now())",
      [id, `${id}@example.test`],
    );
    const token = randomUUID().replaceAll('-', '').repeat(2),
      csrf = randomUUID();
    cookies.set(id, { csrf, cookie: `rowlens_sid=${token}; rowlens_csrf=${csrf}` });
    await asOwner(
      "insert into account_session(user_id,token_hash,csrf_hash,expires_at) values($1,$2,$3,now()+interval '1 day')",
      [id, sha256(token), sha256(csrf)],
    );
  }
  await asOwner('insert into platform_admin(user_id) values($1),($2)', [publisher, second]);
  for (const [id, role] of [
    [owner, 'rower'],
    [coach, 'coach'],
    [admin, 'admin'],
  ])
    await asOwner('insert into membership(club_id,user_id,roles) values($1,$2,ARRAY[$3])', [
      clubs.a,
      id,
      role,
    ]);
});
afterAll(async () => {
  await app.close();
  await h.close();
});
describe('explicit publication of existing training examples', () => {
  it('bounds and pages only selected-club candidate metadata, with literal search', async () => {
    for (let i = 0; i < 25; i++) await ordinary(`Candidate ${String(i).padStart(2, '0')}`);
    await ordinary('Foreign candidate', clubs.b);
    const first = await call(publisher, '/api/example-management/candidates?q=Candidate%20');
    expect(first.statusCode).toBe(200);
    const page = first.json<ExampleCandidates>();
    expect(page.sessions).toHaveLength(20);
    expect(page.nextCursor).toBeTruthy();
    expect(Object.keys(page.sessions[0] ?? {}).sort()).toEqual([
      'boatType',
      'date',
      'id',
      'title',
      'videoCount',
    ]);
    const last = await call(
      publisher,
      `/api/example-management/candidates?q=Candidate%20&before=${page.nextCursor ?? ''}`,
    );
    expect(last.json<ExampleCandidates>().sessions).toHaveLength(5);
    expect(
      last.json<ExampleCandidates>().sessions.some((s) => page.sessions.some((a) => a.id === s.id)),
    ).toBe(false);
    expect(
      (await call(publisher, '/api/example-management/candidates?q=%25')).json<ExampleCandidates>()
        .sessions,
    ).toEqual([]);
    expect(
      (
        await call(publisher, '/api/example-management/candidates?q=Foreign')
      ).json<ExampleCandidates>().sessions,
    ).toEqual([]);
    expect(
      (
        await call(
          publisher,
          '/api/example-management/candidates?q=Foreign',
          'GET',
          undefined,
          clubs.b,
        )
      ).json<ExampleCandidates>().sessions,
    ).toHaveLength(1);
    expect(
      (await call(publisher, '/api/example-management/candidates?before=bad')).statusCode,
    ).toBe(400);
  });
  it('rejects club roles, clubless callers and forged platform contexts', async () => {
    const id = await ordinary('Not published');
    for (const user of [owner, coach, admin, outsider]) {
      expect((await call(user, '/api/example-management/candidates')).statusCode).toBe(404);
      expect(
        (await call(user, `/api/example-management/${id}/publish`, 'POST', { confirm: true }))
          .statusCode,
      ).toBe(404);
    }
    expect(await exampleCandidates(h.db, actor(owner), '')).toBeNull();
    expect(await publishExample(h.db, actor(owner), id)).toBeNull();
  });
  it('publishes the selected admin notes, preserves the actual creator, and excludes other feedback', async () => {
    const id = await ordinary('Ready for publication'),
      vid = randomUUID();
    await asOwner(
      "insert into video(id,club_id,session_id,original_filename,content_type,perspective,size_bytes,status) values($1,$2,$3,'synthetic.mp4','video/mp4','bank',1,'ready')",
      [vid, clubs.a, id],
    );
    for (const [author, body] of [
      [owner, 'Private creator'],
      [publisher, 'Published administrator'],
      [second, 'Private other administrator'],
    ])
      await asOwner(
        "insert into annotation(club_id,video_id,frame,body,author_user_id,author_name) values($1,$2,10,$3,$4,'Synthetic')",
        [clubs.a, vid, body, author],
      );
    expect(
      (await call(publisher, `/api/example-management/${id}/publish`, 'POST', {})).statusCode,
    ).toBe(400);
    expect(
      (
        await call(
          publisher,
          `/api/example-management/${id}/publish`,
          'POST',
          { confirm: true },
          clubs.b,
        )
      ).statusCode,
    ).toBe(404);
    expect(
      (
        await call(publisher, `/api/example-management/${id}/publish`, 'POST', { confirm: true })
      ).json(),
    ).toEqual({ id, status: 'published' });
    const [row] = await asOwner<{
      is_example: boolean;
      created_by_user_id: string;
      example_publisher_user_id: string;
    }>(
      'select is_example,created_by_user_id,example_publisher_user_id from rowing_session where id=$1',
      [id],
    );
    expect(row).toEqual({
      is_example: true,
      created_by_user_id: owner,
      example_publisher_user_id: publisher,
    });
    const view = await call(outsider, `/api/examples/${id}`);
    expect(view.statusCode).toBe(200);
    expect(view.body).toContain('Published administrator');
    expect(view.body).not.toMatch(
      /Private creator|Private other administrator|authorUserId|authorName/,
    );
    expect((await call(owner, `/api/sessions/${id}`)).json()).toMatchObject({
      id,
      createdByMe: true,
      canEdit: true,
    });
    expect(
      (
        await call(second, `/api/example-management/${id}/publish`, 'POST', { confirm: true })
      ).json(),
    ).toEqual({ id, status: 'already-published' });
    expect(
      (await asOwner('select example_publisher_user_id from rowing_session where id=$1', [id]))[0],
    ).toEqual({ example_publisher_user_id: publisher });
    const audit = await asOwner(
      'select actor_user_id from platform_audit where action=$1 and target=$2',
      ['publish_example', `${clubs.a}:${id}`],
    );
    expect(audit).toEqual([{ actor_user_id: publisher }]);
    expect(
      (
        await call(publisher, '/api/example-management/candidates?q=Ready')
      ).json<ExampleCandidates>().sessions,
    ).toEqual([]);
  });
  it('keeps classification and publisher protected from ordinary and forged direct updates', async () => {
    const id = await ordinary('Protected classification');
    await withTenant(h.db, actor(), (tx) =>
      tx.execute(
        sql`update rowing_session set is_example=true,example_publisher_user_id=${second} where id=${id}`,
      ),
    );
    expect(
      (
        await asOwner(
          'select is_example,example_publisher_user_id from rowing_session where id=$1',
          [id],
        )
      )[0],
    ).toEqual({ is_example: false, example_publisher_user_id: null });
    await withTenant(
      h.db,
      { ...actor(owner), platformAdmin: false, roles: ['rower'] },
      async (tx) => {
        await tx.execute(sql`select set_config('app.publish_example',${id},true)`);
        await tx.execute(
          sql`update rowing_session set is_example=true,example_publisher_user_id=${publisher} where id=${id}`,
        );
      },
    );
    expect((await asOwner('select is_example from rowing_session where id=$1', [id]))[0]).toEqual({
      is_example: false,
    });
    await withTenant(h.db, actor(), async (tx) => {
      await tx.execute(sql`select set_config('app.publish_example',${id},true)`);
      await tx.execute(sql`update rowing_session set is_example=true where id=${id}`);
    });
    expect((await asOwner('select is_example from rowing_session where id=$1', [id]))[0]).toEqual({
      is_example: false,
    });
    await publishExample(h.db, actor(), id);
    await withTenant(h.db, actor(second), (tx) =>
      tx.execute(
        sql`update rowing_session set is_example=false,example_publisher_user_id=${second} where id=${id}`,
      ),
    );
    expect(
      (
        await asOwner(
          'select is_example,example_publisher_user_id from rowing_session where id=$1',
          [id],
        )
      )[0],
    ).toEqual({ is_example: true, example_publisher_user_id: publisher });
  });
  it('retains the publisher of an automatically published example', async () => {
    const created = await withTenant(h.db, actor(), async (tx) => {
      const rows = await tx.execute<{ id: string }>(
        sql`insert into rowing_session(club_id,title,session_date,created_by_user_id) values(${clubs.a},'Automatic example','2026-11-16',${publisher}) returning id`,
      );
      return rows.rows[0]?.id;
    });
    if (!created) throw new Error('Missing automatic example');
    expect(await publishExample(h.db, actor(second), created)).toEqual({
      id: created,
      status: 'already-published',
    });
    expect(
      (
        await asOwner('select example_publisher_user_id from rowing_session where id=$1', [created])
      )[0]?.example_publisher_user_id,
    ).toBe(publisher);
  });
  it('requires a currently verified actor and active club, including forged repository contexts', async () => {
    const id = await ordinary('Live publication authority');
    await asOwner('update app_user set verified_at=null where id=$1', [second]);
    try {
      expect(await exampleCandidates(h.db, actor(second), '')).toBeNull();
      expect(await publishExample(h.db, actor(second), id)).toBeNull();
    } finally {
      await asOwner('update app_user set verified_at=now() where id=$1', [second]);
    }
    await asOwner('update club set archived_at=now() where id=$1', [clubs.b]);
    try {
      expect(await exampleCandidates(h.db, actor(second, clubs.b), '')).toBeNull();
      expect(await publishExample(h.db, actor(second, clubs.b), id)).toBeNull();
    } finally {
      await asOwner('update club set archived_at=null where id=$1', [clubs.b]);
    }
  });
  it.each(['grant', 'club'] as const)(
    'rechecks a %s withdrawal that starts before publication obtains its locks',
    async (kind) => {
      const id = await ordinary('Withdrawal race');
      const client = new pg.Client({ connectionString: inject('ownerUrl') });
      await client.connect();
      let pending: ReturnType<typeof publishExample> | undefined;
      try {
        await client.query('begin');
        await client.query(
          kind === 'grant'
            ? 'delete from platform_admin where user_id=$1'
            : 'update club set archived_at=now() where id=$1',
          [kind === 'grant' ? second : clubs.a],
        );
        pending = publishExample(h.db, actor(second), id);
        await expect
          .poll(async () =>
            (
              await asOwner(
                "select count(*)::int as n from pg_stat_activity where wait_event_type='Lock' and query like '%rowlens_publish_example%'",
              )
            ).some((row) => Number(row.n) > 0),
          )
          .toBe(true);
        await client.query('commit');
        expect(await pending).toBeNull();
        expect(
          (await asOwner('select is_example from rowing_session where id=$1', [id]))[0]?.is_example,
        ).toBe(false);
      } finally {
        await client.query('rollback');
        await client.end();
        if (pending) await pending;
        if (kind === 'grant')
          await asOwner('insert into platform_admin(user_id) values($1) on conflict do nothing', [
            second,
          ]);
        else await asOwner('update club set archived_at=null where id=$1', [clubs.a]);
      }
    },
  );
  it('serializes competing publishers and audits only the actual first publication', async () => {
    const id = await ordinary('Concurrent publication');
    const results = await Promise.all([
      publishExample(h.db, actor(), id),
      publishExample(h.db, actor(second), id),
    ]);
    expect(results.map((r) => r?.status).sort()).toEqual(['already-published', 'published']);
    const rows = await asOwner(
      'select actor_user_id from platform_audit where action=$1 and target=$2',
      ['publish_example', `${clubs.a}:${id}`],
    );
    expect(rows).toHaveLength(1);
    expect(
      (await asOwner('select example_publisher_user_id from rowing_session where id=$1', [id]))[0]
        ?.example_publisher_user_id,
    ).toBe(rows[0]?.actor_user_id);
  });
});
