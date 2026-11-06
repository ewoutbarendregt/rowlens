import { randomUUID } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, inject, it } from 'vitest';
import { sql } from 'drizzle-orm';
import { buildApp } from '../app.ts';
import type { LoginMail } from '../auth/mail.ts';
import { loadConfig } from '../config.ts';
import { connectDatabase, type DatabaseHandle } from '../db/client.ts';
import { withTenant } from '../db/tenant.ts';
import { asOwner, createTwoClubs } from '../db/test/fixtures.ts';
import type { UserSettings } from '../../shared/user-settings.ts';
import type { Role } from '../../shared/roles.ts';

const BASE = '/projects/rowlens';
const ORIGIN = 'https://trustable.nl';
const ADMIN = `settings-admin-${randomUUID()}@example.com`;
const USER = `settings-user-${randomUUID()}@example.com`;
let app: FastifyInstance;
let handle: DatabaseHandle;
const mails: LoginMail[] = [];
let ip = 0;
let admin = '';
let user = '';
let userId = '';
let grant = '';
let clubId = '';
let adminId = '';
function send(
  method: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE',
  path: string,
  cookies = '',
  body?: unknown,
) {
  ip++;
  return app.inject({
    method,
    url: BASE + path,
    headers: {
      origin: ORIGIN,
      'sec-fetch-site': 'same-origin',
      'x-forwarded-for': `203.0.113.${String(ip % 250)}`,
      cookie: cookies,
      'x-csrf-token': /rowlens_csrf=([^;]+)/.exec(cookies)?.[1] ?? '',
      ...(body === undefined ? {} : { 'content-type': 'application/json' }),
    },
    ...(body === undefined ? {} : { payload: JSON.stringify(body) }),
  });
}
async function signIn(address: string) {
  await send('POST', '/api/auth/otp', '', { email: address });
  const code = mails.filter((m) => m.email === address).at(-1)?.code;
  const result = await send('POST', '/api/auth/verify', '', { email: address, code });
  expect(result.statusCode, result.body).toBe(204);
  return result.cookies.map((c) => `${c.name}=${c.value}`).join('; ');
}
beforeAll(async () => {
  handle = connectDatabase(inject('appUrl'), 4);
  app = await buildApp({
    config: loadConfig({
      PUBLIC_ORIGIN: ORIGIN,
      AUTH_ADMIN_EMAILS: ADMIN,
      OTP_PEPPER: 'd'.repeat(64),
      AUTH_OTP_PER_EMAIL_15M: '30',
    }),
    clientDir: null,
    database: handle.db,
    logger: false,
    deliverLoginCode: (mail) => {
      mails.push(mail);
      return Promise.resolve();
    },
  });
  admin = await signIn(ADMIN);
  const added = await send('POST', '/api/admin/access', admin, { email: USER, roles: ['rower'] });
  expect(added.statusCode, added.body).toBe(201);
  grant = added.json<{ id: string }>().id;
  user = await signIn(USER);
  userId = (await send('GET', '/api/auth/status', user)).json<{ user: { id: string } }>().user.id;
  adminId = (await send('GET', '/api/auth/status', admin)).json<{ user: { id: string } }>().user.id;
  const [c] = await asOwner<{ id: string }>(`select id from club where slug='pilot'`);
  clubId = c?.id ?? '';
});
afterAll(async () => {
  await app.close();
  await handle.close();
});

describe('central user settings', () => {
  it('starts unknown, lets an admin edit the account and audits the change atomically', async () => {
    const initial = await send('GET', `/api/admin/users/${userId}/settings`, admin);
    expect(initial.statusCode, initial.body).toBe(200);
    const before = initial.json<UserSettings>();
    expect(before.preferences).toEqual({
      language: null,
      theme: null,
      notesVisible: null,
      noteHoldSeconds: null,
      driveMiddle: null,
    });
    const changes = {
      firstName: 'Central',
      lastName: 'Member',
      defaultBoatType: 'C2x',
      language: 'en',
      theme: 'hc',
      notesVisible: false,
      noteHoldSeconds: 0.5,
      driveMiddle: true,
    };
    const saved = await send('PATCH', `/api/admin/users/${userId}/settings`, admin, {
      revision: before.revision,
      changes,
    });
    expect(saved.statusCode, saved.body).toBe(200);
    expect(saved.json<UserSettings>()).toMatchObject({
      firstName: 'Central',
      lastName: 'Member',
      defaultBoatType: 'C2x',
      revision: before.revision + 1,
      preferences: {
        language: 'en',
        theme: 'hc',
        notesVisible: false,
        noteHoldSeconds: 0.5,
        driveMiddle: true,
      },
    });
    expect((await send('GET', '/api/me/settings', user)).json()).toEqual(saved.json());
    expect((await send('GET', '/api/auth/status', user)).json()).toMatchObject({
      user: { firstName: 'Central', lastName: 'Member', defaultBoatType: 'C2x' },
    });
    const events = await asOwner<{ changed_keys: string[]; actor_user_id: string }>(
      `select changed_keys,actor_user_id from user_settings_audit where subject_user_id=$1 and changed_keys @> ARRAY['theme']`,
      [userId],
    );
    expect(events).toHaveLength(1);
    expect(events[0]?.actor_user_id).toBe(adminId);
  });
  it('rejects stale saves and never lets delayed legacy import overwrite admin choices', async () => {
    const current = (await send('GET', '/api/me/settings', user)).json<UserSettings>();
    expect(
      (
        await send('PATCH', '/api/me/settings', user, {
          revision: current.revision - 1,
          changes: { theme: 'dark' },
        })
      ).statusCode,
    ).toBe(409);
    const imported = await send('PATCH', '/api/me/settings', user, {
      revision: 0,
      importLegacy: true,
      changes: {
        language: 'nl',
        theme: 'dark',
        notesVisible: true,
        noteHoldSeconds: 2,
        driveMiddle: false,
      },
    });
    expect(imported.statusCode, imported.body).toBe(200);
    expect(imported.json()).toEqual(current);
    const changed = await send('PATCH', '/api/me/settings', user, {
      revision: current.revision,
      changes: { theme: 'dark' },
    });
    expect(changed.statusCode, changed.body).toBe(200);
    expect(changed.json<UserSettings>().preferences.theme).toBe('dark');
  });
  it('protects own-profile drafts and arbitrates concurrent writes with one shared revision', async () => {
    const current = (await send('GET', '/api/me/settings', user)).json<UserSettings>();
    const responses = await Promise.all([
      send('PATCH', `/api/admin/users/${userId}/settings`, admin, {
        revision: current.revision,
        changes: { noteHoldSeconds: 2 },
      }),
      send('PATCH', '/api/me/settings', user, {
        revision: current.revision,
        changes: { noteHoldSeconds: 1 },
      }),
    ]);
    expect(responses.map((r) => r.statusCode).sort()).toEqual([200, 409]);
    const profile = await send('PUT', '/api/me/profile', user, {
      revision: current.revision,
      firstName: 'Stale',
      lastName: 'Draft',
      defaultBoatType: 'C4x+',
    });
    expect(profile.statusCode).toBe(409);
    expect((await send('GET', '/api/me/settings', user)).json<UserSettings>().firstName).toBe(
      'Central',
    );
    const forged = await withTenant(handle.db, { clubId, userId, roles: ['admin'] }, (tx) =>
      tx.execute<{ settings: unknown }>(
        sql`select rowlens_user_settings(${adminId}::uuid) as settings`,
      ),
    );
    // The settings definer checks actual membership, not only an admin claim in transaction GUCs.
    expect(forged.rows[0]?.settings).toBeNull();
  });
  it('denies another account and invalid values, without a write or audit entry', async () => {
    expect((await send('GET', `/api/admin/users/${adminId}/settings`, user)).statusCode).toBe(404);
    expect(
      (
        await send('PATCH', `/api/admin/users/${adminId}/settings`, user, {
          revision: 0,
          changes: { theme: 'dark' },
        })
      ).statusCode,
    ).toBe(404);
    for (const changes of [
      { theme: 'rainbow' },
      { noteHoldSeconds: 3 },
      { notesVisible: 'yes' },
      { firstName: ' ' },
      { roles: ['admin'] },
      { email: 'other@example.com' },
    ]) {
      expect(
        (
          await send('PATCH', `/api/admin/users/${userId}/settings`, admin, {
            revision: 0,
            changes,
          })
        ).statusCode,
      ).toBe(400);
    }
    expect((await send('GET', '/api/me/settings')).statusCode).toBe(404);
  });
  it('cannot enumerate or update an account in another club, including direct SQL functions', async () => {
    const { b } = await createTwoClubs();
    const outsider = randomUUID();
    // Separate parameterized statements: pg does not prepare multiple commands with parameters.
    await asOwner(`insert into app_user(id,email,display_name) values($1,$2,'Other member')`, [
      outsider,
      `outsider-${outsider}@example.com`,
    ]);
    await asOwner(`insert into membership(club_id,user_id,roles) values($1,$2,ARRAY['rower'])`, [
      b,
      outsider,
    ]);
    expect((await send('GET', `/api/admin/users/${outsider}/settings`, admin)).statusCode).toBe(
      404,
    );
    expect(
      (
        await send('PATCH', `/api/admin/users/${outsider}/settings`, admin, {
          revision: 0,
          changes: { theme: 'dark' },
        })
      ).statusCode,
    ).toBe(404);
    const result = await withTenant(
      handle.db,
      { clubId, userId: adminId, roles: ['admin'] },
      (tx) =>
        tx.execute<{ settings: unknown }>(
          sql`select rowlens_user_settings(${outsider}::uuid) as settings`,
        ),
    );
    expect(result.rows[0]?.settings).toBeNull();
  });
  it('shares the same preferences for one account in multiple clubs, without exposing other memberships', async () => {
    const { b } = await createTwoClubs();
    await asOwner(`insert into membership(club_id,user_id,roles) values($1,$2,ARRAY['rower'])`, [
      b,
      userId,
    ]);
    const result = await withTenant(handle.db, { clubId: b, userId, roles: ['rower'] }, (tx) =>
      tx.execute<{ settings: UserSettings }>(sql`select rowlens_user_settings() as settings`),
    );
    const here = (await send('GET', '/api/me/settings', user)).json<UserSettings>();
    expect(result.rows[0]?.settings).toEqual(here);
  });
  it('makes audit records admin-only and immutable for the app role', async () => {
    const rowerContext = { clubId, userId, roles: ['rower'] as Role[] };
    const rows = await withTenant(handle.db, rowerContext, (tx) =>
      tx.execute(sql`select * from user_settings_audit`),
    );
    expect(rows.rows).toEqual([]);
    await expect(
      withTenant(handle.db, rowerContext, (tx) =>
        tx.execute(
          sql`insert into user_settings_audit(club_id,subject_user_id,actor_user_id,changed_keys) values(${clubId},${userId},${userId},ARRAY['theme'])`,
        ),
      ),
    ).rejects.toThrow();
    for (const op of [
      sql`delete from user_settings_audit`,
      sql`update user_settings_audit set changed_keys=ARRAY['forged']`,
    ])
      await expect(
        withTenant(handle.db, { clubId, userId: adminId, roles: ['admin'] }, (tx) =>
          tx.execute(op),
        ),
      ).rejects.toThrow();
  });
});

describe('multiple roles on one identity', () => {
  for (let mask = 1; mask < 8; mask++) {
    const roles = (['rower', 'coach', 'admin'] as Role[]).filter((_, i) => (mask & (1 << i)) !== 0);
    it(`applies ${roles.join('+')} to an existing session and preserves it at next login`, async () => {
      const update = await send('PATCH', `/api/admin/access/${grant}`, admin, { roles });
      expect(update.statusCode, update.body).toBe(204);
      const status = (await send('GET', '/api/auth/status', user)).json<{
        user: { id: string; roles: Role[] };
      }>();
      expect(status.user.id).toBe(userId);
      expect(status.user.roles).toEqual(roles);
      expect((await send('GET', '/api/rowers', user)).statusCode).toBe(
        roles.includes('coach') || roles.includes('admin') ? 200 : 404,
      );
      expect((await send('GET', '/api/admin/users', user)).statusCode).toBe(
        roles.includes('admin') ? 200 : 404,
      );
      user = await signIn(USER);
      expect(
        (await send('GET', '/api/auth/status', user)).json<{ user: { roles: Role[] } }>().user
          .roles,
      ).toEqual(roles);
    });
  }
  it('refuses empty, duplicate, unknown and legacy scalar updates', async () => {
    for (const body of [
      { roles: [] },
      { roles: ['rower', 'rower'] },
      { roles: ['owner'] },
      { role: 'rower' },
    ])
      expect((await send('PATCH', `/api/admin/access/${grant}`, admin, body)).statusCode).toBe(400);
  });
});

describe('access concurrency and protected role grants', () => {
  it('preserves the server admin role while allowing additional roles on the same identity', async () => {
    const added = await send('POST', '/api/admin/access', admin, {
      email: ADMIN,
      roles: ['rower', 'admin'],
    });
    expect(added.statusCode, added.body).toBe(201);
    const id = added.json<{ id: string }>().id;
    expect((await send('GET', '/api/auth/status', admin)).json()).toMatchObject({
      user: { id: adminId, roles: ['rower', 'admin'] },
    });
    expect(
      (await send('PATCH', `/api/admin/access/${id}`, admin, { roles: ['rower'] })).statusCode,
    ).toBe(409);
    expect((await send('DELETE', `/api/admin/access/${id}`, admin)).statusCode).toBe(409);
    expect(
      (
        await send('PATCH', `/api/admin/access/${id}`, admin, {
          roles: ['rower', 'coach', 'admin'],
          expectedRoles: ['admin'],
        })
      ).statusCode,
    ).toBe(409);
    expect(
      (
        await send('PATCH', `/api/admin/access/${id}`, admin, {
          roles: ['rower', 'coach', 'admin'],
          expectedRoles: ['rower', 'admin'],
        })
      ).statusCode,
    ).toBe(204);
    expect((await send('GET', '/api/auth/status', admin)).json()).toMatchObject({
      user: { id: adminId, roles: ['rower', 'coach', 'admin'] },
    });
  });
  it('uses current grants at OTP completion, even if roles changed after requesting the code', async () => {
    await send('PATCH', `/api/admin/access/${grant}`, admin, { roles: ['admin'] });
    await send('POST', '/api/auth/otp', '', { email: USER });
    const code = mails.filter((m) => m.email === USER).at(-1)?.code;
    await send('PATCH', `/api/admin/access/${grant}`, admin, { roles: ['rower'] });
    const verified = await send('POST', '/api/auth/verify', '', { email: USER, code });
    expect(verified.statusCode, verified.body).toBe(204);
    const cookies = verified.cookies.map((c) => `${c.name}=${c.value}`).join('; ');
    expect((await send('GET', '/api/auth/status', cookies)).json()).toMatchObject({
      user: { id: userId, roles: ['rower'] },
    });
  });
});
