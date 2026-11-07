import pg from 'pg';
import { withBasePath } from '../../shared/base-path.ts';
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, inject, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { sql } from 'drizzle-orm';
import { buildApp } from '../app.ts';
import { loadConfig } from '../config.ts';
import { connectDatabase, type DatabaseHandle } from '../db/client.ts';
import { asOwner, createTwoClubs } from '../db/test/fixtures.ts';
import { withTenant } from '../db/tenant.ts';
import type { LoginMail } from './mail.ts';
const BASE = '/projects/rowlens',
  ORIGIN = 'https://trustable.nl';
let app: FastifyInstance,
  h: DatabaseHandle,
  clubs: { a: string; b: string },
  ip = 0;
const mails: LoginMail[] = [];
const email = () => `registration-${randomUUID()}@example.test`;
const call = (method: 'GET' | 'POST', path: string, body?: unknown, cookies = '', club?: string) =>
  app.inject({
    method,
    url: withBasePath(BASE, path),
    headers: {
      origin: ORIGIN,
      cookie: cookies,
      ...(body === undefined ? {} : { 'content-type': 'application/json' }),
      'x-forwarded-for': `203.0.113.${String(++ip)}`,
      ...(club ? { 'x-rowlens-club': club } : {}),
      'x-csrf-token':
        cookies
          .split('; ')
          .find((p) => p.startsWith('rowlens_csrf='))
          ?.slice(13) ?? '',
    },
    ...(body === undefined ? {} : { payload: JSON.stringify(body) }),
  });
async function issue(address: string, clubId: string | null = null) {
  const r = await call('POST', '/api/auth/registration/otp', {
    email: address,
    clubId,
    language: 'en',
  });
  expect(r.statusCode, r.body).toBe(202);
  return {
    email: address,
    requestId: r.json<{ requestId: string }>().requestId,
    code: mails.at(-1)?.code ?? '',
  };
}
const verify = (proof: { email: string; requestId: string; code: string }) =>
  call('POST', '/api/auth/registration/verify', proof);
async function register(clubId: string | null = null, address = email()) {
  const proof = await issue(address, clubId),
    r = await verify(proof);
  expect(r.statusCode, r.body).toBe(204);
  const cookies = r.cookies.map((c) => `${c.name}=${c.value}`).join('; ');
  const status = (await call('GET', '/api/auth/status', undefined, cookies)).json<{
    user: { id: string };
  }>();
  return { ...proof, id: status.user.id, cookies };
}
async function actors() {
  const platform = await register(),
    a = await register(),
    b = await register();
  await asOwner('insert into platform_admin(user_id) values($1)', [platform.id]);
  await asOwner(
    "insert into membership(club_id,user_id,roles) values($1,$2,ARRAY['admin']),($3,$4,ARRAY['admin'])",
    [clubs.a, a.id, clubs.b, b.id],
  );
  return { platform, a, b };
}
interface Request {
  id: string;
  kind: string;
  userId: string;
  clubId: string | null;
  status: string;
  email: string;
  createdAt: string;
}
const requests = async (cookies: string, club?: string) =>
  (await call('GET', '/api/manage/applications', undefined, cookies, club)).json<Request[]>();
beforeAll(async () => {
  clubs = await createTwoClubs();
  h = connectDatabase(inject('appUrl'), 4);
  app = await buildApp({
    config: loadConfig({
      UNIFIED_USERS: 'true',
      OTP_PEPPER: 'a'.repeat(64),
      PUBLIC_ORIGIN: ORIGIN,
      AUTH_OTP_PER_IP_HOUR: '1000',
      AUTH_VERIFY_PER_IP_15M: '1000',
    }),
    clientDir: null,
    database: h.db,
    logger: false,
    deliverLoginCode: (m) => {
      mails.push(m);
      return Promise.resolve();
    },
  });
});
afterAll(async () => {
  await app.close();
  await h.close();
});
describe('explicit verified registration', () => {
  it('publishes only active club names/IDs and rejects cross-origin registration', async () => {
    const local = await createTwoClubs();
    await asOwner('update club set archived_at=now() where id=$1', [local.b]);
    const list = (await call('GET', '/api/auth/registration/clubs')).json<
      { id: string; name: string }[]
    >();
    expect(list.some((c) => c.id === local.a)).toBe(true);
    expect(list.some((c) => c.id === local.b)).toBe(false);
    expect(list.every((c) => Object.keys(c).sort().join(',') === 'id,name')).toBe(true);
    expect(
      (
        await app.inject({
          method: 'POST',
          url: withBasePath(BASE, '/api/auth/registration/otp'),
          headers: { origin: 'https://evil.test' },
          payload: { email: email(), clubId: null },
        })
      ).statusCode,
    ).toBe(403);
  });
  it('creates no account/application before proof; rejects wrong, expired and exhausted codes', async () => {
    const proof = await issue(email(), clubs.a);
    expect(mails.at(-1)).toMatchObject({ purpose: 'registration', locale: 'en' });
    expect(await asOwner('select id from app_user where email=$1', [proof.email])).toEqual([]);
    const wrong = proof.code === '000000' ? '111111' : '000000';
    for (let i = 0; i < 5; i++)
      expect((await verify({ ...proof, code: wrong })).statusCode).toBe(403);
    expect((await verify(proof)).statusCode).toBe(403);
    const fresh = await issue(proof.email, clubs.a);
    await asOwner(
      "update account_login_code set expires_at=now()-interval '1 second' where email=$1",
      [proof.email],
    );
    expect((await verify(fresh)).statusCode).toBe(403);
    expect(await asOwner('select id from app_user where email=$1', [proof.email])).toEqual([]);
  });
  it('atomically records club signup without names or automatic membership, and scopes review/decision', async () => {
    const { platform, a, b } = await actors(),
      u = await register(clubs.a);
    const own = (await call('GET', '/api/account/clubs', undefined, u.cookies)).json<{
      registration: { clubId: string };
      applications: { id: string; status: string }[];
    }>();
    expect(own.registration.clubId).toBe(clubs.a);
    expect(own.applications).toMatchObject([{ status: 'pending' }]);
    expect(await asOwner('select user_id from membership where user_id=$1', [u.id])).toEqual([]);
    expect((await call('GET', '/api/sessions', undefined, u.cookies, clubs.a)).statusCode).toBe(
      404,
    );
    const global = (await requests(platform.cookies, clubs.b)).filter((r) => r.userId === u.id);
    expect(global).toHaveLength(1);
    expect(global[0]).toMatchObject({ kind: 'club', status: 'pending', clubId: clubs.a });
    expect((await requests(a.cookies, clubs.a)).some((r) => r.userId === u.id)).toBe(true);
    expect((await requests(b.cookies, clubs.b)).some((r) => r.userId === u.id)).toBe(false);
    expect(
      (await call('GET', '/api/manage/applications', undefined, u.cookies, clubs.a)).statusCode,
    ).toBe(404);
    const id = own.applications[0]?.id ?? '';
    expect(
      (await call('POST', `/api/admin/applications/${id}`, { approve: true }, b.cookies, clubs.b))
        .statusCode,
    ).toBe(404);
    expect(
      (await call('POST', `/api/admin/applications/${id}`, { approve: true }, a.cookies, clubs.a))
        .statusCode,
    ).toBe(204);
    expect((await requests(platform.cookies)).find((r) => r.id === id)?.status).toBe('approved');
    expect((await requests(a.cookies, clubs.a)).find((r) => r.id === id)?.status).toBe('approved');
    expect(
      await asOwner('select roles from membership where user_id=$1 and club_id=$2', [
        u.id,
        clubs.a,
      ]),
    ).toEqual([{ roles: ['rower'] }]);
  });
  it('shows clubless registration only to platform admins even without a selected club', async () => {
    const { platform, a, b } = await actors(),
      u = await register();
    const global = (await requests(platform.cookies)).filter((r) => r.userId === u.id);
    expect(global).toMatchObject([
      { kind: 'registration', clubId: null, status: 'registered', email: u.email },
    ]);
    expect(global[0]?.createdAt).toBeTruthy();
    for (const admin of [a, b])
      expect(
        (await requests(admin.cookies, admin.id === a.id ? clubs.a : clubs.b)).some(
          (r) => r.userId === u.id,
        ),
      ).toBe(false);
    expect((await call('GET', '/api/account/clubs', undefined, u.cookies)).json()).toMatchObject({
      registration: { clubId: null },
      applications: [],
    });
    expect(await asOwner('select user_id from membership where user_id=$1', [u.id])).toEqual([]);
  });
  it('does not create accounts through login; existing login creates no new registration', async () => {
    const address = email(),
      before = mails.length;
    const response = await call('POST', '/api/auth/otp', { email: address });
    expect(response.statusCode).toBe(202);
    expect(response.json()).toEqual({ accepted: true });
    expect(mails).toHaveLength(before);
    expect(
      (await call('POST', '/api/auth/verify', { email: address, code: '123456' })).statusCode,
    ).toBe(403);
    expect(await asOwner('select id from app_user where email=$1', [address])).toEqual([]);
    const u = await register(null, address);
    await call('POST', '/api/auth/otp', { email: address });
    expect(
      (await call('POST', '/api/auth/verify', { email: address, code: mails.at(-1)?.code }))
        .statusCode,
    ).toBe(204);
    expect(
      await asOwner('select user_id from account_registration where user_id=$1', [u.id]),
    ).toEqual([{ user_id: u.id }]);
  });
  it('binds purpose, challenge and club choice; resending invalidates old registration intent', async () => {
    const address = email(),
      old = await issue(address, clubs.a),
      fresh = await issue(address, clubs.b);
    expect((await verify(old)).statusCode).toBe(403);
    expect((await verify({ ...fresh, requestId: old.requestId })).statusCode).toBe(403);
    expect(
      (await call('POST', '/api/auth/verify', { email: address, code: fresh.code })).statusCode,
    ).toBe(403);
    expect(
      (await call('POST', '/api/auth/registration/verify', { ...fresh, clubId: clubs.a }))
        .statusCode,
    ).toBe(400);
    const r = await verify(fresh);
    expect(r.statusCode).toBe(204);
    const rows = await asOwner(
      'select a.club_id from membership_application a join app_user u on u.id=a.user_id where u.email=$1',
      [address],
    );
    expect(rows).toEqual([{ club_id: clubs.b }]);
    expect((await verify(fresh)).statusCode).toBe(403);
  });
  it('handles an archived club between request and proof without partial account creation', async () => {
    const local = await createTwoClubs(),
      address = email(),
      proof = await issue(address, local.a);
    await asOwner('update club set archived_at=now() where id=$1', [local.a]);
    expect((await verify(proof)).statusCode).toBe(409);
    expect(await asOwner('select id from app_user where email=$1', [address])).toEqual([]);
    const next = await issue(address, null);
    expect((await verify(next)).statusCode).toBe(204);
  });
  it('serializes duplicate verification and preserves existing identity/roles on repeated signup', async () => {
    const proof = await issue(email(), clubs.a);
    const responses = await Promise.all([verify(proof), verify(proof)]);
    expect(responses.map((r) => r.statusCode).sort()).toEqual([204, 403]);
    const result = responses.find((r) => r.statusCode === 204);
    if (!result) throw new Error('No successful verification');
    const cookies = result.cookies.map((c) => `${c.name}=${c.value}`).join('; ');
    const id = (await call('GET', '/api/auth/status', undefined, cookies)).json<{
      user: { id: string };
    }>().user.id;
    await asOwner("update app_user set first_name='Preserved',last_name='Person' where id=$1", [
      id,
    ]);
    await asOwner("insert into membership(club_id,user_id,roles) values($1,$2,ARRAY['coach'])", [
      clubs.a,
      id,
    ]);
    const repeated = await register(clubs.b, proof.email);
    expect(repeated.id).toBe(id);
    expect(
      (await call('GET', '/api/account/clubs', undefined, repeated.cookies)).json(),
    ).toMatchObject({ registration: { clubId: clubs.b } });

    expect(await asOwner('select first_name,last_name from app_user where id=$1', [id])).toEqual([
      { first_name: 'Preserved', last_name: 'Person' },
    ]);
    expect(
      await asOwner('select roles from membership where user_id=$1 and club_id=$2', [id, clubs.a]),
    ).toEqual([{ roles: ['coach'] }]);
    expect(
      await asOwner('select user_id from account_registration where user_id=$1', [id]),
    ).toHaveLength(1);
    const withoutClub = await register(null, proof.email);
    expect(
      (await call('GET', '/api/account/clubs', undefined, withoutClub.cookies)).json(),
    ).toMatchObject({ registration: { clubId: null } });
    expect(
      await asOwner('select requested_club_id from account_registration where user_id=$1', [id]),
    ).toEqual([{ requested_club_id: clubs.a }]);

    expect(
      await asOwner('select id from membership_application where user_id=$1 and club_id=$2', [
        id,
        clubs.b,
      ]),
    ).toHaveLength(1);
  });
  it('prevents direct app-role access and rejects null proofs/private helper execution', async () => {
    const u = await register();
    await expect(h.db.execute(sql`select * from account_registration`)).rejects.toThrow();
    await expect(
      h.db.execute(sql`select rowlens_submit_application(${u.id}::uuid,${clubs.a}::uuid)`),
    ).rejects.toThrow();
    expect(
      (
        await h.db.execute<{ value: string }>(
          sql`select rowlens_registration_verify(null,null,null,null,null) as value`,
        )
      ).rows[0]?.value,
    ).toBe('invalid');
    expect(
      await withTenant(
        h.db,
        { clubId: clubs.a, userId: u.id, roles: ['rower'] },
        async (tx) =>
          (
            await tx.execute<{ value: unknown[] }>(
              sql`select rowlens_manage_applications() as value`,
            )
          ).rows[0]?.value,
      ),
    ).toEqual([]);
  });
  it('rolls back account, registration, session and proof consumption when application creation fails', async () => {
    const local = await createTwoClubs(),
      address = email(),
      proof = await issue(address, local.a);
    await asOwner(`CREATE FUNCTION registration_failure_fixture() RETURNS trigger LANGUAGE plpgsql AS $$
    BEGIN IF NEW.club_id='${local.a}'::uuid THEN RAISE EXCEPTION 'fixture admission failure'; END IF; RETURN NEW; END $$`);
    await asOwner(
      'CREATE TRIGGER registration_failure_fixture BEFORE INSERT ON membership_application FOR EACH ROW EXECUTE FUNCTION registration_failure_fixture()',
    );
    try {
      expect((await verify(proof)).statusCode).toBe(500);
      expect(await asOwner('select id from app_user where email=$1', [address])).toEqual([]);
      expect(
        await asOwner('select used_at from account_login_code where email=$1', [address]),
      ).toEqual([{ used_at: null }]);
    } finally {
      await asOwner('DROP TRIGGER registration_failure_fixture ON membership_application');
      await asOwner('DROP FUNCTION registration_failure_fixture()');
    }
    expect((await verify(proof)).statusCode).toBe(204);
  });
  it('preserves rejection cooldown and lists archived requests only to platform administrators', async () => {
    const { platform, a } = await actors(),
      u = await register(clubs.a);
    const request = (await requests(a.cookies, clubs.a)).find((r) => r.userId === u.id);
    if (!request) throw new Error('No application');
    expect(
      (
        await call(
          'POST',
          `/api/admin/applications/${request.id}`,
          { approve: false },
          a.cookies,
          clubs.a,
        )
      ).statusCode,
    ).toBe(204);
    expect((await requests(platform.cookies)).find((r) => r.id === request.id)?.status).toBe(
      'rejected',
    );
    await register(clubs.a, u.email);
    expect((await requests(platform.cookies)).find((r) => r.id === request.id)?.status).toBe(
      'rejected',
    );
    const local = await createTwoClubs(),
      other = await register(local.a);
    await asOwner('update club set archived_at=now() where id=$1', [local.a]);
    expect((await requests(platform.cookies)).some((r) => r.userId === other.id)).toBe(true);
    expect((await requests(a.cookies, clubs.a)).some((r) => r.userId === other.id)).toBe(false);
  });
  it('shares email limits across login and registration and bounds anonymous club enumeration', async () => {
    const address = email(),
      before = mails.length;
    const responses = [];
    for (let i = 0; i < 4; i++)
      responses.push(
        await call('POST', '/api/auth/registration/otp', { email: address, clubId: null }),
      );
    expect(responses.every((r) => r.statusCode === 202)).toBe(true);
    expect(mails.length - before).toBe(3);
    expect(new Set(responses.map((r) => r.json<{ requestId: string }>().requestId)).size).toBe(4);
    const sameIp = '198.51.100.1';
    for (let i = 0; i < 30; i++)
      expect(
        (
          await app.inject({
            method: 'GET',
            url: withBasePath(BASE, '/api/auth/registration/clubs'),
            headers: { 'x-forwarded-for': sameIp },
          })
        ).statusCode,
      ).toBe(200);
    expect(
      (
        await app.inject({
          method: 'GET',
          url: withBasePath(BASE, '/api/auth/registration/clubs'),
          headers: { 'x-forwarded-for': sameIp },
        })
      ).statusCode,
    ).toBe(429);
  });
  it('serializes a concurrent resend before old verification without reusing its club intent', async () => {
    const u = await register(),
      first = await issue(u.email, clubs.a);
    const blocker = new pg.Client({ connectionString: inject('ownerUrl') });
    await blocker.connect();
    const waiting = async (pattern: string) => {
      const deadline = Date.now() + 5000;
      while (Date.now() < deadline) {
        const rows = await asOwner<{ waiting: boolean }>(
          "select exists(select 1 from pg_stat_activity where wait_event_type='Lock' and query like $1) as waiting",
          [`%${pattern}%`],
        );
        if (rows[0]?.waiting) return;
        await new Promise((resolve) => setTimeout(resolve, 10));
      }
      throw new Error('Expected registration operation to wait for the mailbox lock');
    };
    let resend: ReturnType<typeof issue> | undefined,
      oldVerification: ReturnType<typeof verify> | undefined;
    try {
      await blocker.query('BEGIN');
      await blocker.query(
        "select pg_advisory_xact_lock(hashtextextended('rowlens-mailbox:'||$1::text,0))",
        [u.email],
      );
      resend = issue(u.email, clubs.b);
      await waiting('rowlens_registration_issue');
      oldVerification = verify(first);
      await waiting('rowlens_registration_verify');
    } finally {
      await blocker.query('ROLLBACK');
      await blocker.end();
      await Promise.allSettled([resend, oldVerification]);
    }
    expect((await oldVerification).statusCode).toBe(403);
    expect((await verify(await resend)).statusCode).toBe(204);
    expect(
      await asOwner('select club_id from membership_application where user_id=$1', [u.id]),
    ).toEqual([{ club_id: clubs.b }]);
  });
});
