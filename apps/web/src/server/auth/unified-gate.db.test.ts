import { randomUUID } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, inject, it } from 'vitest';
import { sql } from 'drizzle-orm';
import { buildApp } from '../app.ts';
import { loadConfig } from '../config.ts';
import { connectDatabase, type DatabaseHandle } from '../db/client.ts';
import { asOwner, createTwoClubs } from '../db/test/fixtures.ts';
import { withTenant } from '../db/tenant.ts';
import type { LoginMail } from './mail.ts';
const BASE = '/projects/rowlens',
  ORIGIN = 'https://trustable.nl';
let app: FastifyInstance, h: DatabaseHandle, clubs: { a: string; b: string };
const mails: LoginMail[] = [];
let ip = 0;
const call = (
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE',
  path: string,
  body?: unknown,
  cookies = '',
  club?: string,
) =>
  app.inject({
    method,
    url: BASE + path,
    headers: {
      origin: ORIGIN,
      ...(body === undefined ? {} : { 'content-type': 'application/json' }),
      cookie: cookies,
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
async function signIn() {
  const email = `account-${randomUUID()}@example.test`;
  expect((await call('POST', '/api/auth/otp', { email })).statusCode).toBe(202);
  const code = mails.at(-1)?.code ?? '';
  const r = await call('POST', '/api/auth/verify', { email, code });
  expect(r.statusCode).toBe(204);
  const cookies = r.cookies.map((c) => `${c.name}=${c.value}`).join('; ');
  const status = (await call('GET', '/api/auth/status', undefined, cookies)).json<{
    user: { id: string };
  }>();
  return { email, code, cookies, id: status.user.id };
}
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
describe('unified accounts and club admission', () => {
  it('lets a persisted platform administrator manage an account with zero clubs without a club context', async () => {
    const operator = await signIn(),
      target = await signIn();
    await asOwner('insert into platform_admin(user_id) values($1)', [operator.id]);
    const users = (await call('GET', '/api/platform/users', undefined, operator.cookies)).json<
      { id: string }[]
    >();
    expect(users.some((u) => u.id === target.id)).toBe(true);
    const path = `/api/admin/users/${target.id}/settings`;
    const initial = await call('GET', path, undefined, operator.cookies);
    expect(initial.statusCode).toBe(200);
    const revision = initial.json<{ revision: number }>().revision;
    const saved = await call(
      'PATCH',
      path,
      { revision, changes: { firstName: 'Global', lastName: 'Account' } },
      operator.cookies,
    );
    expect(saved.statusCode).toBe(200);
    expect(saved.json<{ firstName: string }>().firstName).toBe('Global');
    expect(
      (await call('PATCH', path, { revision, changes: { firstName: 'Stale' } }, operator.cookies))
        .statusCode,
    ).toBe(409);
    expect(await asOwner('select club_id from membership where user_id=$1', [target.id])).toEqual(
      [],
    );
    expect(
      await asOwner(
        "select action from platform_audit where actor_user_id=$1 and action='user.settings.saved'",
        [operator.id],
      ),
    ).toHaveLength(1);
    await asOwner('delete from platform_admin where user_id=$1', [operator.id]);
    expect((await call('GET', path, undefined, operator.cookies)).statusCode).toBe(404);
  });
  it('lists every current-club member, excludes account-only users and edits membership-only roles', async () => {
    const local = await createTwoClubs();
    const admin = await signIn(),
      member = await signIn(),
      outsider = await signIn();
    await asOwner(
      "insert into membership(club_id,user_id,roles) values($1,$2,ARRAY['admin']),($1,$3,ARRAY['rower']),($4,$5,ARRAY['coach'])",
      [local.a, admin.id, member.id, local.b, outsider.id],
    );
    const response = await call('GET', '/api/admin/users', undefined, admin.cookies, local.a);
    expect(response.statusCode).toBe(200);
    const entries = response.json<{ entries: { userId: string; source: string }[] }>().entries;
    expect(entries.map((e) => e.userId).sort()).toEqual([admin.id, member.id].sort());
    expect(entries.find((e) => e.userId === member.id)?.source).toBe('app');
    expect(
      (await call('GET', '/api/admin/users', undefined, member.cookies, local.a)).statusCode,
    ).toBe(404);
    expect(
      (
        await call(
          'POST',
          '/api/admin/access',
          { email: member.email, roles: ['rower', 'coach'] },
          admin.cookies,
          local.a,
        )
      ).statusCode,
    ).toBe(201);
    expect(
      (await call('GET', '/api/auth/status', undefined, member.cookies, local.a)).json<{
        user: { roles: string[] };
      }>().user.roles,
    ).toEqual(['rower', 'coach']);
    expect(
      (await call('GET', '/api/admin/users', undefined, admin.cookies, local.b)).statusCode,
    ).toBe(404);
  });
  it('archives and restores clubs without losing memberships/history or affecting another club', async () => {
    const local = await createTwoClubs();
    const platform = await signIn();
    const member = await signIn();
    await asOwner('insert into platform_admin(user_id) values($1)', [platform.id]);
    await asOwner(
      "insert into membership(club_id,user_id,roles) values($1,$3,ARRAY['admin']),($2,$3,ARRAY['rower'])",
      [local.a, local.b, member.id],
    );
    const session = await call(
      'POST',
      '/api/sessions',
      { title: 'Retained history', date: '2026-11-07' },
      member.cookies,
      local.a,
    );
    expect(session.statusCode).toBe(201);
    expect((await call('GET', '/api/platform/clubs', undefined, member.cookies)).statusCode).toBe(
      404,
    );
    expect(
      (
        await call(
          'POST',
          `/api/platform/clubs/${local.a}/archive`,
          { archived: true },
          member.cookies,
        )
      ).statusCode,
    ).toBe(404);
    expect(
      (
        await call(
          'POST',
          `/api/platform/clubs/${local.a}/archive`,
          { archived: true },
          platform.cookies,
        )
      ).statusCode,
    ).toBe(204);
    for (const cookies of [member.cookies, platform.cookies]) {
      expect((await call('GET', '/api/sessions', undefined, cookies, local.a)).statusCode).toBe(
        404,
      );
      expect((await call('GET', '/api/admin/users', undefined, cookies, local.a)).statusCode).toBe(
        404,
      );
      expect((await call('GET', '/api/sessions', undefined, cookies, local.b)).statusCode).toBe(
        200,
      );
      expect((await call('GET', '/api/me/settings', undefined, cookies, local.a)).statusCode).toBe(
        200,
      );
    }
    const directory = (await call('GET', '/api/account/clubs', undefined, member.cookies)).json<{
      clubs: { id: string }[];
    }>();
    expect(directory.clubs.some((c) => c.id === local.a)).toBe(false);
    const listed = (await call('GET', '/api/platform/clubs', undefined, platform.cookies)).json<
      { id: string; archivedAt: string | null }[]
    >();
    expect(listed.find((c) => c.id === local.a)?.archivedAt).toBeTruthy();
    expect(
      (await call('POST', '/api/account/applications', { clubId: local.a }, member.cookies))
        .statusCode,
    ).toBe(409);
    const denied = await withTenant(
      h.db,
      { clubId: local.a, userId: platform.id, platformAdmin: true },
      async (tx) => {
        const rows = await tx.execute(sql`select * from rowing_session`);
        const admitted = await tx.execute<{ value: string }>(
          sql`select rowlens_admit_account(${member.email},ARRAY['coach']) as value`,
        );
        return { rows: rows.rows, admitted: admitted.rows[0]?.value };
      },
    );
    expect(denied.rows).toEqual([]);
    expect(denied.admitted).not.toBe('ok');
    expect(
      (
        await call(
          'POST',
          `/api/platform/clubs/${local.a}/archive`,
          { archived: false },
          platform.cookies,
        )
      ).statusCode,
    ).toBe(204);
    const restored = await call('GET', '/api/sessions', undefined, member.cookies, local.a);
    expect(restored.statusCode).toBe(200);
    expect(restored.body).toContain('Retained history');
    expect(
      await asOwner(
        'select action from platform_audit where target=$1 and action in ($2,$3) order by at',
        [local.a, 'club.archived', 'club.restored'],
      ),
    ).toEqual([{ action: 'club.archived' }, { action: 'club.restored' }]);
  });
  it('verifies an unknown account without admitting it to any club; OTP is single-use', async () => {
    const u = await signIn();
    const status = (await call('GET', '/api/auth/status', undefined, u.cookies)).json<{
      club: unknown;
      clubs: unknown[];
      applications: { id: string }[];
      rowers: unknown[];
    }>();
    expect(status.club).toBeNull();
    expect(status.clubs).toEqual([]);
    expect((await call('GET', '/api/sessions', undefined, u.cookies)).statusCode).toBe(404);
    expect((await call('GET', '/api/sessions?x=/api/me/', undefined, u.cookies)).statusCode).toBe(
      404,
    );
    expect(
      (await call('POST', '/api/auth/verify', { email: u.email, code: u.code })).statusCode,
    ).toBe(403);
    expect(
      (
        await call(
          'PUT',
          '/api/me/profile',
          { firstName: 'New', lastName: 'Member', defaultBoatType: null },
          u.cookies,
        )
      ).statusCode,
    ).toBe(200);
    expect((await call('GET', '/api/me/settings', undefined, u.cookies)).statusCode).toBe(200);
  });
  it('requires a completed profile and admin admission, serializes duplicates, and isolates clubs', async () => {
    const u = await signIn();
    expect(
      (await call('POST', '/api/account/applications', { clubId: clubs.a }, u.cookies)).statusCode,
    ).toBe(409);
    await call(
      'PUT',
      '/api/me/profile',
      { firstName: 'New', lastName: 'Member', defaultBoatType: null },
      u.cookies,
    );
    const results = await Promise.all([
      call('POST', '/api/account/applications', { clubId: clubs.a }, u.cookies),
      call('POST', '/api/account/applications', { clubId: clubs.a }, u.cookies),
    ]);
    expect(results.map((r) => r.statusCode).sort()).toEqual([201, 409]);
    const account = (await call('GET', '/api/account/clubs', undefined, u.cookies)).json<{
      club: unknown;
      clubs: unknown[];
      applications: { id: string }[];
      rowers: unknown[];
    }>();
    const id = account.applications[0]?.id ?? '';
    expect(
      (await call('POST', `/api/admin/applications/${id}`, { approve: true }, u.cookies, clubs.a))
        .statusCode,
    ).toBe(404);
    const admin = await signIn();
    await asOwner("insert into membership(club_id,user_id,roles) values($1,$2,ARRAY['admin'])", [
      clubs.a,
      admin.id,
    ]);
    expect(
      (
        await call(
          'POST',
          `/api/admin/applications/${id}`,
          { approve: true },
          admin.cookies,
          clubs.b,
        )
      ).statusCode,
    ).toBe(404);
    const approved = await Promise.all([
      call('POST', `/api/admin/applications/${id}`, { approve: true }, admin.cookies, clubs.a),
      call('POST', `/api/admin/applications/${id}`, { approve: true }, admin.cookies, clubs.a),
    ]);
    expect(approved.map((r) => r.statusCode).sort()).toEqual([204, 404]);
    expect((await call('GET', '/api/sessions', undefined, u.cookies, clubs.a)).statusCode).toBe(
      200,
    );
    expect((await call('GET', '/api/sessions', undefined, u.cookies, clubs.b)).statusCode).toBe(
      404,
    );
    const accounts = (await call('GET', '/api/rowers', undefined, u.cookies, clubs.a)).json<{
      club: unknown;
      clubs: unknown[];
      applications: { id: string }[];
      rowers: unknown[];
    }>();
    expect(accounts.rowers).toHaveLength(1);
    expect(
      (await call('POST', '/api/rowers', { displayName: 'Ghost' }, admin.cookies, clubs.a))
        .statusCode,
    ).toBe(404);
  });
  it('keeps roles per club and preserves the global account after club revocation', async () => {
    const u = await signIn();
    await asOwner(
      "insert into membership(club_id,user_id,roles) values($1,$3,ARRAY['rower']),($2,$3,ARRAY['coach'])",
      [clubs.a, clubs.b, u.id],
    );
    expect(
      (await call('GET', '/api/auth/status', undefined, u.cookies, clubs.a)).json<{
        user: { roles: string[] };
      }>().user.roles,
    ).toEqual(['rower']);
    expect(
      (await call('GET', '/api/auth/status', undefined, u.cookies, clubs.b)).json<{
        user: { roles: string[] };
      }>().user.roles,
    ).toEqual(['coach']);
    expect((await call('GET', '/api/sessions', undefined, u.cookies)).statusCode).toBe(404);
    expect(
      (
        await call(
          'POST',
          '/api/sessions',
          { title: 'Ambiguous club', date: '2026-11-07' },
          u.cookies,
        )
      ).statusCode,
    ).toBe(404);
    await asOwner('delete from membership where user_id=$1 and club_id=$2', [u.id, clubs.a]);
    expect((await call('GET', '/api/sessions', undefined, u.cookies, clubs.a)).statusCode).toBe(
      404,
    );
    expect((await call('GET', '/api/sessions', undefined, u.cookies, clubs.b)).statusCode).toBe(
      200,
    );
  });
  it('protects global authority and grants a persisted RowLens admin access without membership', async () => {
    const u = await signIn();
    expect(
      (
        await call(
          'POST',
          '/api/platform/clubs',
          { slug: `new-${randomUUID()}`, name: 'Club' },
          u.cookies,
        )
      ).statusCode,
    ).toBe(404);
    await expect(h.db.execute(sql`select * from platform_admin`)).rejects.toThrow();
    const forged = await withTenant(
      h.db,
      { clubId: clubs.b, userId: u.id, roles: ['admin'] },
      async (tx) => {
        const r = await tx.execute<{ ok: boolean }>(
          sql`select set_config('app.platform_admin','true',true),rowlens_platform_admin() as ok`,
        );
        return r.rows[0]?.ok;
      },
    );
    expect(forged).toBe(false);
    await asOwner('insert into platform_admin(user_id) values($1)', [u.id]);
    expect((await call('GET', '/api/sessions', undefined, u.cookies, clubs.b)).statusCode).toBe(
      200,
    );
    expect(
      (
        await call(
          'POST',
          '/api/platform/clubs',
          { slug: `new-${randomUUID()}`, name: 'New club', adminId: u.id },
          u.cookies,
        )
      ).statusCode,
    ).toBe(200);
    expect(
      (await call('GET', '/api/platform/users', undefined, u.cookies))
        .json<{ id: string }[]>()
        .some((v: { id: string }) => v.id === u.id),
    ).toBe(true);
  });
  it('rejects missing CSRF and signs out all global sessions', async () => {
    const u = await signIn();
    const bad = await app.inject({
      method: 'POST',
      url: BASE + '/api/account/applications',
      headers: { origin: ORIGIN, cookie: u.cookies },
      payload: { clubId: clubs.a },
    });
    expect(bad.statusCode).toBe(403);
    expect((await call('POST', '/api/auth/logout', undefined, u.cookies)).statusCode).toBe(204);
    expect(
      (await call('GET', '/api/auth/status', undefined, u.cookies)).json<{ access: boolean }>()
        .access,
    ).toBe(false);
  });
  it('limits wrong codes to five attempts and rejects expired codes', async () => {
    const email = `limited-${randomUUID()}@example.test`;
    await call('POST', '/api/auth/otp', { email });
    const code = mails.at(-1)?.code ?? '';
    for (let i = 0; i < 5; i++)
      expect((await call('POST', '/api/auth/verify', { email, code: 'xxxxxx' })).statusCode).toBe(
        400,
      );
    const wrong = code === '000000' ? '111111' : '000000';
    for (let i = 0; i < 5; i++)
      expect((await call('POST', '/api/auth/verify', { email, code: wrong })).statusCode).toBe(403);
    expect((await call('POST', '/api/auth/verify', { email, code })).statusCode).toBe(403);
    await asOwner(
      "update account_login_code set expires_at=now()-interval '1 second',attempts=0 where email=$1",
      [email],
    );
    expect((await call('POST', '/api/auth/verify', { email, code })).statusCode).toBe(403);
  });
  it('allows only the applicant to cancel; rejected applications have a cooldown', async () => {
    const u = await signIn(),
      other = await signIn(),
      admin = await signIn();
    await call(
      'PUT',
      '/api/me/profile',
      { firstName: 'Applicant', lastName: 'Test', defaultBoatType: null },
      u.cookies,
    );
    await call('POST', '/api/account/applications', { clubId: clubs.b }, u.cookies);
    const own = (await call('GET', '/api/account/clubs', undefined, u.cookies)).json<{
      applications: { id: string }[];
    }>();
    const id = own.applications[0]?.id ?? '';
    expect(
      (await call('POST', `/api/account/applications/${id}/cancel`, undefined, other.cookies))
        .statusCode,
    ).toBe(404);
    expect(
      (await call('POST', `/api/account/applications/${id}/cancel`, undefined, u.cookies))
        .statusCode,
    ).toBe(204);
    expect(
      (await call('POST', '/api/account/applications', { clubId: clubs.b }, u.cookies)).statusCode,
    ).toBe(201);
    await asOwner("insert into membership(club_id,user_id,roles) values($1,$2,ARRAY['admin'])", [
      clubs.b,
      admin.id,
    ]);
    expect(
      (
        await call(
          'POST',
          `/api/admin/applications/${id}`,
          { approve: false },
          admin.cookies,
          clubs.b,
        )
      ).statusCode,
    ).toBe(204);
    expect(
      (await call('POST', '/api/account/applications', { clubId: clubs.b }, u.cookies)).statusCode,
    ).toBe(409);
  });
  it('refuses unknown-account admission and role escalation, without sending invitations', async () => {
    const admin = await signIn();
    await asOwner("insert into membership(club_id,user_id,roles) values($1,$2,ARRAY['admin'])", [
      clubs.a,
      admin.id,
    ]);
    expect(
      (
        await call(
          'POST',
          '/api/admin/access',
          { email: `missing-${randomUUID()}@example.test`, roles: ['rower'] },
          admin.cookies,
          clubs.a,
        )
      ).json<{ error: string }>().error,
    ).toBe('account_required');
    expect(
      (
        await call(
          'POST',
          '/api/admin/access',
          { email: admin.email, roles: ['platform_admin'] },
          admin.cookies,
          clubs.a,
        )
      ).statusCode,
    ).toBe(400);
    const u = await signIn();
    expect(
      (
        await call(
          'POST',
          '/api/admin/access',
          { email: u.email, roles: ['rower'] },
          admin.cookies,
          clubs.a,
        )
      ).statusCode,
    ).toBe(201);
    expect(
      (await call('GET', '/api/auth/status', undefined, u.cookies, clubs.a)).json<{
        user: { roles: string[] };
      }>().user.roles,
    ).toEqual(['rower']);
  });
  it('rejects conflicting club contexts and ignores platform flags supplied by the client', async () => {
    const u = await signIn();
    await asOwner(
      "insert into membership(club_id,user_id,roles) values($1,$3,ARRAY['rower']),($2,$3,ARRAY['rower'])",
      [clubs.a, clubs.b, u.id],
    );
    expect(
      (await call('GET', `/api/sessions?club=${clubs.b}`, undefined, u.cookies, clubs.a))
        .statusCode,
    ).toBe(404);
    expect(
      (
        await call(
          'POST',
          '/api/platform/clubs',
          { slug: 'forged', name: 'Forged', platformAdmin: true },
          u.cookies,
          clubs.a,
        )
      ).statusCode,
    ).toBe(404);
    await asOwner('insert into platform_admin(user_id) values($1)', [u.id]);
    expect(
      (await call('GET', '/api/auth/status', undefined, u.cookies, clubs.a)).json<{
        user: { platformAdmin: boolean };
      }>().user.platformAdmin,
    ).toBe(true);
    await asOwner('delete from platform_admin where user_id=$1', [u.id]);
    expect(
      (
        await call(
          'POST',
          '/api/platform/clubs',
          { slug: 'forged', name: 'Forged' },
          u.cookies,
          clubs.a,
        )
      ).statusCode,
    ).toBe(404);
  });
  it('maps historical seats without loss and derives canonical user IDs from the same-club identity', async () => {
    const admin = await signIn(),
      u = await signIn(),
      foreign = await signIn();
    await asOwner(
      "insert into membership(club_id,user_id,roles) values($1,$2,ARRAY['admin']),($1,$3,ARRAY['rower']),($4,$5,ARRAY['rower'])",
      [clubs.a, admin.id, u.id, clubs.b, foreign.id],
    );
    await call(
      'PUT',
      '/api/me/profile',
      { firstName: 'Historical', lastName: 'Member', defaultBoatType: null },
      u.cookies,
      clubs.a,
    );
    const sid = randomUUID(),
      rid = randomUUID();
    await asOwner(
      "insert into rowing_session(id,club_id,title,session_date) values($1,$2,'History','2026-11-07')",
      [sid, clubs.a],
    );
    await asOwner("insert into rower(id,club_id,display_name) values($1,$2,'Legacy person')", [
      rid,
      clubs.a,
    ]);
    await asOwner('insert into lineup_seat(club_id,session_id,seat,rower_id) values($1,$2,1,$3)', [
      clubs.a,
      sid,
      rid,
    ]);
    expect(
      (
        await call(
          'POST',
          `/api/admin/legacy-people/${rid}`,
          { userId: foreign.id },
          admin.cookies,
          clubs.a,
        )
      ).statusCode,
    ).toBe(409);
    expect(
      (
        await call(
          'POST',
          `/api/admin/legacy-people/${rid}`,
          { userId: u.id },
          admin.cookies,
          clubs.a,
        )
      ).statusCode,
    ).toBe(204);
    expect(
      await asOwner('select rower_id,account_user_id from lineup_seat where session_id=$1', [sid]),
    ).toEqual([{ rower_id: rid, account_user_id: u.id }]);
    // A client/database writer cannot inject a foreign canonical account into its own club's seat.
    await asOwner('update lineup_seat set account_user_id=$1 where session_id=$2', [
      foreign.id,
      sid,
    ]);
    expect(
      await asOwner('select account_user_id from lineup_seat where session_id=$1', [sid]),
    ).toEqual([{ account_user_id: u.id }]);
    await asOwner('delete from membership where club_id=$1 and user_id=$2', [clubs.a, u.id]);
    expect(
      await asOwner('select rower_id,account_user_id from lineup_seat where session_id=$1', [sid]),
    ).toEqual([{ rower_id: rid, account_user_id: u.id }]);
  });
  it('lets a platform administrator read private feedback without membership but never mix clubs', async () => {
    const u = await signIn(),
      rower = await signIn();
    await asOwner("insert into membership(club_id,user_id,roles) values($1,$2,ARRAY['rower'])", [
      clubs.b,
      rower.id,
    ]);
    const sid = randomUUID(),
      vid = randomUUID();
    await asOwner(
      "insert into rowing_session(id,club_id,title,session_date) values($1,$2,'Private','2026-11-07')",
      [sid, clubs.b],
    );
    await asOwner(
      "insert into video(id,club_id,session_id,original_filename,content_type,perspective,size_bytes,status,frame_count,fps_num,fps_den) values($1,$2,$3,'test.mp4','video/mp4','boat',4,'ready',300,30,1)",
      [vid, clubs.b, sid],
    );
    await asOwner(
      "insert into annotation(club_id,video_id,frame,kind,body,author_name) values($1,$2,1,'note','private test','Coach')",
      [clubs.b, vid],
    );
    expect(
      (
        await call('GET', `/api/videos/${vid}/annotations`, undefined, rower.cookies, clubs.b)
      ).json<{ annotations: unknown[] }>().annotations,
    ).toEqual([]);
    await asOwner('insert into platform_admin(user_id) values($1)', [u.id]);
    expect(
      (await call('GET', `/api/videos/${vid}/annotations`, undefined, u.cookies, clubs.b)).json<{
        annotations: unknown[];
      }>().annotations,
    ).toHaveLength(1);
    expect(
      (await call('GET', `/api/videos/${vid}/annotations`, undefined, u.cookies, clubs.a))
        .statusCode,
    ).toBe(404);
    expect(
      (
        await asOwner('select count(*)::int n from platform_audit where actor_user_id=$1', [u.id])
      )[0]?.n,
    ).toBeGreaterThan(0);
  });
  it('denies direct membership/grant self-escalation and scopes application rows to the club', async () => {
    const u = await signIn();
    await asOwner("insert into membership(club_id,user_id,roles) values($1,$2,ARRAY['rower'])", [
      clubs.a,
      u.id,
    ]);
    const changes = await withTenant(
      h.db,
      { clubId: clubs.a, userId: u.id, roles: ['rower'], unifiedUsers: true },
      async (tx) => {
        const r = await tx.execute(
          sql`update membership set roles=ARRAY['admin'] where user_id=${u.id}`,
        );
        return r.rowCount;
      },
    );
    expect(changes).toBe(0);
    await expect(
      withTenant(
        h.db,
        { clubId: clubs.a, userId: u.id, roles: ['rower'], unifiedUsers: true },
        (tx) =>
          tx.execute(
            sql`insert into club_access(club_id,email,roles) values(${clubs.a},${u.email},ARRAY['admin'])`,
          ),
      ),
    ).rejects.toThrow();
    const admin = await signIn();
    await asOwner("insert into membership(club_id,user_id,roles) values($1,$2,ARRAY['admin'])", [
      clubs.a,
      admin.id,
    ]);
    await asOwner('insert into membership_application(club_id,user_id) values($1,$2)', [
      clubs.b,
      u.id,
    ]);
    const rows = await withTenant(
      h.db,
      { clubId: clubs.a, userId: admin.id, roles: ['admin'] },
      (tx) => tx.execute(sql`select id from membership_application where user_id=${u.id}`),
    );
    expect(rows.rows).toEqual([]);
  });
  it('approval replaces a stale invitation role and never silently promotes the new member', async () => {
    const u = await signIn(),
      admin = await signIn();
    await call(
      'PUT',
      '/api/me/profile',
      { firstName: 'Pending', lastName: 'Member', defaultBoatType: null },
      u.cookies,
    );
    await asOwner("insert into membership(club_id,user_id,roles) values($1,$2,ARRAY['admin'])", [
      clubs.b,
      admin.id,
    ]);
    await asOwner("insert into club_access(club_id,email,roles) values($1,$2,ARRAY['coach'])", [
      clubs.b,
      u.email,
    ]);
    await call('POST', '/api/account/applications', { clubId: clubs.b }, u.cookies);
    const app =
      (await call('GET', '/api/account/clubs', undefined, u.cookies)).json<{
        applications: { id: string }[];
      }>().applications[0]?.id ?? '';
    expect(
      (
        await call(
          'POST',
          `/api/admin/applications/${app}`,
          { approve: true },
          admin.cookies,
          clubs.b,
        )
      ).statusCode,
    ).toBe(204);
    expect(
      await asOwner('select roles from club_access where club_id=$1 and email=$2', [
        clubs.b,
        u.email,
      ]),
    ).toEqual([{ roles: ['rower'] }]);
  });
  it('adopts a legacy login without platform promotion and keeps account access after club revocation', async () => {
    const email = `legacy-${randomUUID()}@example.test`;
    let code = '';
    const legacy = await buildApp({
      config: loadConfig({
        AUTH_ALLOWED_EMAILS: email,
        OTP_PEPPER: 'b'.repeat(64),
        PUBLIC_ORIGIN: ORIGIN,
      }),
      clientDir: null,
      database: h.db,
      logger: false,
      deliverLoginCode: (mail) => {
        code = mail.code;
        return Promise.resolve();
      },
    });
    try {
      await legacy.inject({
        method: 'POST',
        url: BASE + '/api/auth/otp',
        headers: { origin: ORIGIN },
        payload: { email },
      });
      const r = await legacy.inject({
        method: 'POST',
        url: BASE + '/api/auth/verify',
        headers: { origin: ORIGIN },
        payload: { email, code },
      });
      expect(r.statusCode).toBe(204);
      const cookies = r.cookies.map((c) => `${c.name}=${c.value}`).join('; ');
      const status = (await call('GET', '/api/auth/status', undefined, cookies)).json<{
        user: { id: string; platformAdmin: boolean };
        club: { id: string };
      }>();
      expect(status.user.platformAdmin).toBe(false);
      await asOwner('delete from membership where club_id=$1 and user_id=$2', [
        status.club.id,
        status.user.id,
      ]);
      expect(
        (await call('GET', '/api/auth/status', undefined, cookies)).json<{
          access: boolean;
          club: unknown;
        }>(),
      ).toMatchObject({ access: true, club: null });
      await legacy.inject({
        method: 'POST',
        url: BASE + '/api/auth/otp',
        headers: { origin: ORIGIN },
        payload: { email },
      });
      const again = await legacy.inject({
        method: 'POST',
        url: BASE + '/api/auth/verify',
        headers: { origin: ORIGIN },
        payload: { email, code },
      });
      const second = again.cookies.map((c) => `${c.name}=${c.value}`).join('; ');
      expect(
        (await call('GET', '/api/auth/status', undefined, second)).json<{ access: boolean }>()
          .access,
      ).toBe(true);
      await legacy.inject({
        method: 'POST',
        url: BASE + '/api/auth/logout',
        headers: {
          origin: ORIGIN,
          cookie: second,
          'x-csrf-token':
            second
              .split('; ')
              .find((p) => p.startsWith('rowlens_csrf='))
              ?.slice(13) ?? '',
        },
      });
      expect(
        (await call('GET', '/api/auth/status', undefined, second)).json<{ access: boolean }>()
          .access,
      ).toBe(false);
    } finally {
      await legacy.close();
    }
  });
  it('logout-others revokes other account sessions while retaining the current device', async () => {
    const u = await signIn();
    await call('POST', '/api/auth/otp', { email: u.email });
    const code = mails.at(-1)?.code ?? '';
    const r = await call('POST', '/api/auth/verify', { email: u.email, code });
    const second = r.cookies.map((c) => `${c.name}=${c.value}`).join('; ');
    expect((await call('POST', '/api/auth/logout-others', undefined, u.cookies)).statusCode).toBe(
      204,
    );
    expect(
      (await call('GET', '/api/auth/status', undefined, second)).json<{ access: boolean }>().access,
    ).toBe(false);
    expect(
      (await call('GET', '/api/auth/status', undefined, u.cookies)).json<{ access: boolean }>()
        .access,
    ).toBe(true);
  });
  it('rechecks a withdrawn platform grant in SQL instead of trusting the request role snapshot', async () => {
    const u = await signIn();
    await asOwner('insert into platform_admin(user_id) values($1)', [u.id]);
    await asOwner('delete from platform_admin where user_id=$1', [u.id]);
    const result = await withTenant(
      h.db,
      { clubId: clubs.a, userId: u.id, roles: ['admin'], platformAdmin: true, unifiedUsers: true },
      (tx) =>
        tx.execute<{ admin: boolean; read: boolean }>(
          sql`select rowlens_has_role('admin') as admin,rowlens_can_read_trainings() as read`,
        ),
    );
    expect(result.rows).toEqual([{ admin: false, read: false }]);
  });
  it('direct admission resolves a pending request, while revocation preserves the account and reapplication cooldown', async () => {
    const admin = await signIn(),
      u = await signIn();
    await asOwner("insert into membership(club_id,user_id,roles) values($1,$2,ARRAY['admin'])", [
      clubs.a,
      admin.id,
    ]);
    await call(
      'PUT',
      '/api/me/profile',
      { firstName: 'Member', lastName: 'Request', defaultBoatType: null },
      u.cookies,
    );
    await call('POST', '/api/account/applications', { clubId: clubs.a }, u.cookies);
    expect(
      (
        await call(
          'POST',
          '/api/admin/access',
          { email: u.email, roles: ['rower'] },
          admin.cookies,
          clubs.a,
        )
      ).statusCode,
    ).toBe(201);
    const rows = await asOwner<{ id: string }>(
      'select id from club_access where club_id=$1 and email=$2',
      [clubs.a, u.email],
    );
    expect(
      (await call('GET', '/api/account/clubs', undefined, u.cookies)).json<{
        applications: { status: string }[];
      }>().applications[0]?.status,
    ).toBe('approved');
    expect(
      (
        await call(
          'DELETE',
          `/api/admin/access/${rows[0]?.id ?? ''}`,
          undefined,
          admin.cookies,
          clubs.a,
        )
      ).statusCode,
    ).toBe(204);
    expect(
      (await call('GET', '/api/auth/status', undefined, u.cookies)).json<{ access: boolean }>()
        .access,
    ).toBe(true);
    expect(
      (await call('GET', '/api/account/clubs', undefined, u.cookies)).json<{
        applications: { status: string }[];
      }>().applications[0]?.status,
    ).toBe('rejected');
    expect(
      (await call('POST', '/api/account/applications', { clubId: clubs.a }, u.cookies)).statusCode,
    ).toBe(409);
  });
  it('account-first admission preserves self, last-admin and server-managed protections', async () => {
    const admin = await signIn(),
      platform = await signIn();
    const cid = randomUUID();
    await asOwner("insert into club(id,slug,name) values($1,$2,'Protected club')", [
      cid,
      `protected-${cid}`,
    ]);
    await asOwner("insert into membership(club_id,user_id,roles) values($1,$2,ARRAY['admin'])", [
      cid,
      admin.id,
    ]);
    expect(
      (
        await call(
          'POST',
          '/api/admin/access',
          { email: admin.email, roles: ['rower'] },
          admin.cookies,
          cid,
        )
      ).json<{ error: string }>().error,
    ).toBe('self');
    await asOwner('insert into platform_admin(user_id) values($1)', [platform.id]);
    expect(
      (
        await call(
          'POST',
          '/api/admin/access',
          { email: admin.email, roles: ['rower'] },
          platform.cookies,
          cid,
        )
      ).json<{ error: string }>().error,
    ).toBe('last_admin');
    expect(
      (
        await call(
          'POST',
          '/api/admin/access',
          { email: platform.email, roles: ['rower'] },
          platform.cookies,
          cid,
        )
      ).statusCode,
    ).toBe(201);
    const rooted = await buildApp({
      config: loadConfig({
        UNIFIED_USERS: 'true',
        AUTH_ADMIN_EMAILS: admin.email,
        OTP_PEPPER: 'a'.repeat(64),
        PUBLIC_ORIGIN: ORIGIN,
      }),
      clientDir: null,
      database: h.db,
      logger: false,
    });
    try {
      const pilot =
        (await asOwner<{ id: string }>("select id from club where slug='pilot'"))[0]?.id ?? '';
      const response = await rooted.inject({
        method: 'POST',
        url: BASE + '/api/admin/access',
        headers: {
          origin: ORIGIN,
          cookie: platform.cookies,
          'x-rowlens-club': pilot,
          'x-csrf-token':
            platform.cookies
              .split('; ')
              .find((p) => p.startsWith('rowlens_csrf='))
              ?.slice(13) ?? '',
        },
        payload: { email: admin.email, roles: ['rower'] },
      });
      expect(response.json<{ error: string }>().error).toBe('server_managed');
    } finally {
      await rooted.close();
    }
  });
});
