import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import type { FastifyInstance } from 'fastify';
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, inject, it } from 'vitest';
import { buildApp } from '../app.ts';
import { loadConfig } from '../config.ts';
import { sha256 } from '../auth/crypto.ts';
import { MediaStore } from '../media/store.ts';
import { withBasePath } from '../../shared/base-path.ts';
import { connectDatabase, type DatabaseHandle } from '../db/client.ts';
import { asOwner, createTwoClubs } from '../db/test/fixtures.ts';

// BUG-077: whoever may edit a training picks its crew from the whole club and may add a name.
let app: FastifyInstance, h: DatabaseHandle, clubs: { a: string; b: string };
let directory = '';
const cookies = new Map<string, string>();
const creator = randomUUID(),
  teammate = randomUUID(),
  coach = randomUUID(),
  clubAdmin = randomUUID(),
  unverified = randomUUID(),
  foreign = randomUUID(),
  sid = randomUUID(),
  foreignSid = randomUUID(),
  nameOnly = randomUUID(),
  archivedName = randomUUID(),
  foreignName = randomUUID();

const call = (userId: string, method: 'GET' | 'PUT' | 'POST', path: string, body?: unknown) => {
  const cookie = cookies.get(userId) ?? '';
  return app.inject({
    method,
    url: withBasePath('/projects/rowlens', path),
    headers: {
      cookie,
      origin: 'http://localhost:3191',
      'x-rowlens-club': clubs.a,
      'x-csrf-token': /rowlens_csrf=([^;]+)/.exec(cookie)?.[1] ?? '',
      ...(body === undefined ? {} : { 'content-type': 'application/json' }),
    },
    ...(body === undefined ? {} : { payload: JSON.stringify(body) }),
  });
};
type Row = { id: string; displayName: string; mine: boolean };
const names = async (userId: string) => {
  const res = await call(userId, 'GET', `/api/sessions/${sid}/rowers?crew=true`);
  expect(res.statusCode).toBe(200);
  return res.json<{ rowers: Row[] }>().rowers;
};
const rowerOf = async (userId: string) =>
  (await asOwner<{ id: string }>('select id from rower where user_id=$1', [userId]))[0]?.id ?? '';

beforeAll(async () => {
  h = connectDatabase(inject('appUrl'), 3);
  clubs = await createTwoClubs();
  directory = await mkdtemp(join(tmpdir(), 'rowlens-crew-'));
  app = await buildApp({
    database: h.db,
    media: new MediaStore(directory),
    clientDir: null,
    logger: false,
    config: loadConfig({
      UNIFIED_USERS: 'true',
      PUBLIC_ORIGIN: 'http://localhost:3191',
      OTP_PEPPER: 'c'.repeat(64),
    }),
  });
  const people: [string, string, string | null][] = [
    [creator, 'Crew Creator', 'now()'],
    [teammate, 'Crew Teammate', 'now()'],
    [coach, 'Crew Coach', 'now()'],
    [clubAdmin, 'Crew Admin', 'now()'],
    [unverified, 'Crew Unverified', null],
    [foreign, 'Crew Foreign', 'now()'],
  ];
  for (const [id, name, verified] of people) {
    const [first, last] = name.split(' ');
    await asOwner(
      `insert into app_user(id,email,display_name,first_name,last_name,verified_at) values($1,$2,$3,$4,$5,${verified ?? 'null'})`,
      [id, `${id}@example.test`, name, first, last],
    );
  }
  const roles: [string, string, string[]][] = [
    [creator, clubs.a, ['rower']],
    [teammate, clubs.a, ['rower']],
    [coach, clubs.a, ['coach']],
    [clubAdmin, clubs.a, ['admin']],
    [unverified, clubs.a, ['rower']],
    [foreign, clubs.b, ['rower']],
  ];
  for (const [id, club, r] of roles)
    await asOwner('insert into membership(club_id,user_id,roles) values($1,$2,$3)', [club, id, r]);
  await asOwner(
    "insert into rowing_session(id,club_id,title,session_date,created_by_user_id) values($1,$2,'Crew fixture','2026-11-21',$3),($4,$5,'Foreign fixture','2026-11-21',$6)",
    [sid, clubs.a, creator, foreignSid, clubs.b, foreign],
  );
  await asOwner(
    "insert into rower(id,club_id,display_name,archived_at) values($1,$2,'Loose Name',null),($3,$2,'Gone Name',now()),($4,$5,'Foreign Name',null)",
    [nameOnly, clubs.a, archivedName, foreignName, clubs.b],
  );
  for (const id of [creator, teammate, coach, clubAdmin, foreign]) {
    const token = randomUUID().replaceAll('-', '').repeat(2),
      csrf = randomUUID();
    cookies.set(id, `rowlens_sid=${token}; rowlens_csrf=${csrf}`);
    await asOwner(
      "insert into account_session(user_id,token_hash,csrf_hash,expires_at) values($1,$2,$3,now()+interval '1 day')",
      [id, sha256(token), sha256(csrf)],
    );
  }
});
afterAll(async () => {
  await app.close();
  await h.close();
  await rm(directory, { recursive: true, force: true });
});

describe('crew choices for a training the member may edit', () => {
  it('lists every verified member of the club, any role, and active name-only entries', async () => {
    const rows = await names(creator);
    const shown = rows.map((r) => r.displayName);
    for (const name of ['Crew Creator', 'Crew Teammate', 'Crew Coach', 'Crew Admin', 'Loose Name'])
      expect(shown).toContain(name);
    for (const name of ['Crew Unverified', 'Crew Foreign', 'Gone Name', 'Foreign Name'])
      expect(shown).not.toContain(name);
    expect(rows.filter((r) => r.mine).map((r) => r.displayName)).toEqual(['Crew Creator']);
    expect(JSON.stringify(rows)).not.toContain('@example.test');
  });

  it('is not given to a member who may not edit the training, nor across clubs', async () => {
    expect((await call(teammate, 'GET', `/api/sessions/${sid}/rowers?crew=true`)).statusCode).toBe(
      404,
    );
    expect(
      (await call(creator, 'GET', `/api/sessions/${foreignSid}/rowers?crew=true`)).statusCode,
    ).toBe(404);
  });

  it('saves a lineup with club members the rower could not see before; refuses other clubs', async () => {
    const seats = [
      { seat: 1, rowerId: await rowerOf(creator) },
      { seat: 2, rowerId: await rowerOf(coach) },
      { seat: 3, rowerId: await rowerOf(teammate) },
      { seat: 4, rowerId: nameOnly },
    ];
    const saved = await call(creator, 'PUT', `/api/sessions/${sid}/lineup`, {
      boatType: '4x',
      seats,
    });
    expect(saved.statusCode).toBe(200);
    expect(
      saved
        .json<{ lineup: { rower: { displayName: string } }[] }>()
        .lineup.map((s) => s.rower.displayName),
    ).toEqual(['Crew Creator', 'Crew Coach', 'Crew Teammate', 'Loose Name']);
    for (const rowerId of [foreignName, await rowerOf(foreign), archivedName]) {
      const refused = await call(creator, 'PUT', `/api/sessions/${sid}/lineup`, {
        boatType: '4x',
        seats: [...seats.slice(0, 3), { seat: 4, rowerId }],
      });
      expect(refused.statusCode).toBe(400);
    }
  });

  it('adds a name-only crew member, asking first about a similar name', async () => {
    const similar = await call(creator, 'POST', `/api/sessions/${sid}/rowers`, {
      displayName: 'loose name',
    });
    expect(similar.statusCode).toBe(409);
    expect(similar.json<{ candidates: { id: string }[] }>().candidates[0]?.id).toBe(nameOnly);
    const added = await call(creator, 'POST', `/api/sessions/${sid}/rowers`, {
      displayName: '  Fresh Guest ',
    });
    expect(added.statusCode).toBe(201);
    const row = added.json<{ id: string; displayName: string }>();
    expect(row.displayName).toBe('Fresh Guest');
    expect((await names(creator)).map((r) => r.id)).toContain(row.id);
    const [stored] = await asOwner<{ club_id: string; user_id: string | null; email: null }>(
      'select club_id,user_id,email from rower where id=$1',
      [row.id],
    );
    expect(stored).toEqual({ club_id: clubs.a, user_id: null, email: null });
    const again = await call(creator, 'POST', `/api/sessions/${sid}/rowers`, {
      displayName: 'Fresh Guest',
      confirmNew: true,
    });
    expect(again.statusCode).toBe(201);
  });

  it('refuses adding for a member who may not edit, another club, or an empty name', async () => {
    const before = await asOwner<{ n: string }>('select count(*) n from rower');
    expect(
      (await call(teammate, 'POST', `/api/sessions/${sid}/rowers`, { displayName: 'Sneaky' }))
        .statusCode,
    ).toBe(404);
    expect(
      (await call(creator, 'POST', `/api/sessions/${foreignSid}/rowers`, { displayName: 'Sneaky' }))
        .statusCode,
    ).toBe(404);
    expect(
      (await call(creator, 'POST', `/api/sessions/${sid}/rowers`, { displayName: '  ' }))
        .statusCode,
    ).toBe(400);
    expect(await asOwner<{ n: string }>('select count(*) n from rower')).toEqual(before);
  });

  it('keeps the roster itself hidden from a rower', async () => {
    const res = await call(teammate, 'GET', '/api/rowers');
    const shown = res
      .json<{ rowers: { displayName: string }[] }>()
      .rowers.map((r) => r.displayName);
    expect(shown).not.toContain('Loose Name');
    expect(shown).not.toContain('Crew Coach');
  });

  it('lets the club admin link a crew name to the account later, keeping the seat', async () => {
    const listed = await call(clubAdmin, 'GET', '/api/admin/legacy-people');
    expect(listed.statusCode).toBe(200);
    const people = listed.json<{ people: { id: string; name: string }[] }>().people;
    expect(people.map((p) => p.id)).toContain(nameOnly);
    expect(people.map((p) => p.name)).toContain('Fresh Guest');
    expect((await call(creator, 'GET', '/api/admin/legacy-people')).statusCode).toBe(404);
    // Both sit in the same training: linking would merge two seats, so it is refused.
    const clash = await call(clubAdmin, 'POST', `/api/admin/legacy-people/${nameOnly}`, {
      userId: teammate,
    });
    expect(clash.statusCode).toBe(409);
    // Unverified accounts can't be linked.
    expect(
      (
        await call(clubAdmin, 'POST', `/api/admin/legacy-people/${nameOnly}`, {
          userId: unverified,
        })
      ).statusCode,
    ).toBe(409);
    const [guest] = await asOwner<{ id: string }>(
      "select id from rower where display_name='Fresh Guest' order by created_at limit 1",
    );
    const linked = await call(clubAdmin, 'POST', `/api/admin/legacy-people/${guest?.id ?? ''}`, {
      userId: coach,
    });
    expect(linked.statusCode).toBe(204);
    const crew = await names(creator);
    expect(crew.filter((r) => r.displayName === 'Crew Coach').map((r) => r.id)).toEqual([
      guest?.id,
    ]);
    const lineup = await call(creator, 'GET', `/api/sessions/${sid}`);
    expect(JSON.stringify(lineup.json())).toContain('Crew Coach');
    const [seat] = await asOwner<{ rower_id: string }>(
      'select rower_id from lineup_seat where session_id=$1 and seat=2',
      [sid],
    );
    expect(seat?.rower_id).toBe(guest?.id);
  });
});
