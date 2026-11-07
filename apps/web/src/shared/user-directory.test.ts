import { describe, expect, it } from 'vitest';
import {
  DIRECTORY_FIELDS,
  directoryQuerySchema,
  queryDirectory,
  type DirectoryRow,
} from './user-directory.ts';
const a: DirectoryRow = {
  id: '00000000-0000-4000-8000-000000000001',
  firstName: 'Ada',
  lastName: 'Alpha',
  email: 'ada@example.test',
  platformAdmin: true,
  defaultBoatType: 'C2x',
  language: 'nl',
  theme: 'dark',
  notesVisible: true,
  noteHoldSeconds: 0.5,
  driveMiddle: true,
  createdAt: '2026-01-01T00:00:00Z',
  verifiedAt: '2026-01-02T00:00:00Z',
  lastSeenAt: '2026-01-03T00:00:00Z',
  revision: 0,
  serverManaged: false,
  memberships: [
    {
      clubId: '10000000-0000-4000-8000-000000000001',
      name: 'Alpha club',
      roles: ['admin'],
      archived: false,
    },
  ],
  applications: [],
};
const b: DirectoryRow = {
  ...a,
  id: '00000000-0000-4000-8000-000000000002',
  firstName: 'Zoe',
  lastName: 'Zulu',
  email: 'zoe@example.test',
  platformAdmin: false,
  defaultBoatType: 'C4x+',
  language: 'en',
  theme: 'light',
  notesVisible: false,
  noteHoldSeconds: 2,
  driveMiddle: false,
  createdAt: '2026-02-01T00:00:00Z',
  verifiedAt: '2026-02-02T00:00:00Z',
  lastSeenAt: '2026-02-03T00:00:00Z',
  memberships: [],
  applications: [],
};
const values = { ...a, clubs: a.memberships[0]?.clubId, roles: 'admin', status: 'member' };
describe('authorized directory queries', () => {
  it.each(DIRECTORY_FIELDS)(
    'filters %s without losing zero-membership accounts in the unfiltered result',
    (field) => {
      const value = values[field];
      expect(
        queryDirectory(
          [b, a],
          directoryQuerySchema.parse({ filters: [{ field, op: 'eq', value }] }),
        ).rows.map((r) => r.id),
      ).toEqual([a.id]);
    },
  );
  it.each(DIRECTORY_FIELDS)('sorts %s in both directions and pages deterministically', (field) => {
    const asc = queryDirectory([b, a], directoryQuerySchema.parse({ sort: field, pageSize: 1 }));
    const desc = queryDirectory(
      [a, b],
      directoryQuerySchema.parse({ sort: field, desc: true, pageSize: 1 }),
    );
    expect(asc.total).toBe(2);
    expect(desc.total).toBe(2);
    expect(asc.rows[0]?.id).not.toBe(desc.rows[0]?.id);
    const next = queryDirectory(
      [a, b],
      directoryQuerySchema.parse({ sort: field, pageSize: 1, page: 1 }),
    );
    expect(next.rows[0]?.id).toBe(desc.rows[0]?.id);
  });
  it('matches case-insensitive text, unknown preferences and date/number ranges with explicit nulls', () => {
    expect(
      queryDirectory(
        [a, b],
        directoryQuerySchema.parse({ filters: [{ field: 'firstName', op: 'eq', value: 'ADA' }] }),
      ).rows,
    ).toEqual([a]);
    expect(
      queryDirectory(
        [a, b],
        directoryQuerySchema.parse({
          filters: [{ field: 'createdAt', op: 'eq', value: '2025-12-31T23:00:00-01:00' }],
        }),
      ).rows,
    ).toEqual([a]);
    const unknown = { ...b, theme: null };
    expect(
      queryDirectory(
        [a, b],
        directoryQuerySchema.parse({ filters: [{ field: 'clubs', op: 'eq', value: null }] }),
      ).rows,
    ).toEqual([b]);
    expect(
      queryDirectory(
        [a, b],
        directoryQuerySchema.parse({ filters: [{ field: 'clubs', op: 'isNull', value: null }] }),
      ).rows,
    ).toEqual([b]);
    expect(
      queryDirectory(
        [a, unknown],
        directoryQuerySchema.parse({ filters: [{ field: 'theme', op: 'isNull', value: null }] }),
      ).rows,
    ).toEqual([unknown]);
    expect(
      queryDirectory(
        [a, b],
        directoryQuerySchema.parse({
          filters: [{ field: 'email', op: 'contains', value: 'ADA@' }],
        }),
      ).rows,
    ).toEqual([a]);
    expect(
      queryDirectory(
        [a, b],
        directoryQuerySchema.parse({
          filters: [
            { field: 'createdAt', op: 'gte', value: '2026-01-31T23:00:00-01:00' },
            { field: 'noteHoldSeconds', op: 'gte', value: 1 },
          ],
        }),
      ).rows,
    ).toEqual([b]);
  });
  it('uses account ID as stable tie-break and returns only scoped club choices', () => {
    const same = { ...a, id: b.id };
    expect(
      queryDirectory([same, a], directoryQuerySchema.parse({ sort: 'firstName' })).rows.map(
        (r) => r.id,
      ),
    ).toEqual([a.id, b.id]);
    expect(queryDirectory([b], directoryQuerySchema.parse({})).clubs).toEqual([]);
  });
  it('rejects unknown fields, oversized pages and unbounded filter arrays', () => {
    expect(directoryQuerySchema.safeParse({ sort: 'password' }).success).toBe(false);
    expect(directoryQuerySchema.safeParse({ pageSize: 101 }).success).toBe(false);
    expect(
      directoryQuerySchema.safeParse({
        filters: Array.from({ length: 31 }, () => ({ field: 'email', op: 'contains', value: '' })),
      }).success,
    ).toBe(false);
  });
});
