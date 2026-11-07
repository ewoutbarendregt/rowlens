import { z } from 'zod';
import { ROLES } from './roles.ts';
export const DIRECTORY_FIELDS = [
  'firstName',
  'lastName',
  'email',
  'platformAdmin',
  'clubs',
  'roles',
  'status',
  'defaultBoatType',
  'language',
  'theme',
  'notesVisible',
  'noteHoldSeconds',
  'driveMiddle',
  'createdAt',
  'verifiedAt',
  'lastSeenAt',
  'id',
] as const;
export type DirectoryField = (typeof DIRECTORY_FIELDS)[number];
export const directoryRowSchema = z.object({
  id: z.uuid(),
  firstName: z.string().nullable(),
  lastName: z.string().nullable(),
  email: z.email(),
  platformAdmin: z.boolean(),
  defaultBoatType: z.string().nullable(),
  language: z.string().nullable(),
  theme: z.string().nullable(),
  notesVisible: z.boolean().nullable(),
  noteHoldSeconds: z.number().nullable(),
  driveMiddle: z.boolean().nullable(),
  createdAt: z.string(),
  verifiedAt: z.string().nullable(),
  lastSeenAt: z.string().nullable(),
  revision: z.int(),
  serverManaged: z.boolean().default(false),
  memberships: z.array(
    z.object({
      clubId: z.uuid(),
      name: z.string(),
      roles: z.array(z.enum(ROLES)),
      archived: z.boolean(),
    }),
  ),
  applications: z.array(
    z.object({ id: z.uuid(), clubId: z.uuid(), name: z.string(), status: z.string() }),
  ),
});
export type DirectoryRow = z.infer<typeof directoryRowSchema>;
export const directoryQuerySchema = z
  .object({
    filters: z
      .array(
        z
          .object({
            field: z.enum(DIRECTORY_FIELDS),
            op: z.enum(['contains', 'eq', 'gte', 'lte', 'isNull']),
            value: z.union([z.string().max(254), z.number(), z.boolean(), z.null()]),
          })
          .strict(),
      )
      .max(30)
      .default([]),
    sort: z.enum(DIRECTORY_FIELDS).default('lastName'),
    desc: z.boolean().default(false),
    page: z.int().min(0).max(100000).default(0),
    pageSize: z.int().min(1).max(100).default(25),
  })
  .strict();
export type DirectoryQuery = z.infer<typeof directoryQuerySchema>;
export function directoryValue(
  row: DirectoryRow,
  field: DirectoryField,
): string | number | boolean | null {
  if (field === 'clubs') return row.memberships.map((m) => m.name).join(', ');
  if (field === 'roles')
    return [...new Set(row.memberships.flatMap((m) => m.roles))].sort().join(', ');
  if (field === 'status')
    return (
      [
        ...new Set([
          ...row.memberships.map(() => 'member'),
          ...row.applications.filter((a) => a.status === 'pending').map(() => 'pending'),
        ]),
      ]
        .sort()
        .join(', ') || 'none'
    );
  return row[field];
}
/** Apply only to the already-authorized projection; never filter a global list for club actors. */
export function queryDirectory(rows: DirectoryRow[], q: DirectoryQuery) {
  const matching = rows.filter((row) =>
    q.filters.every((f) => {
      const value = directoryValue(row, f.field);
      if (f.op === 'isNull')
        return value === null || (['clubs', 'roles'].includes(f.field) && value === '');
      if (f.op === 'eq') {
        if (f.field === 'roles' && f.value === null) return row.memberships.length === 0;
        if (f.field === 'roles')
          return row.memberships.some((m) => m.roles.some((r) => r === f.value));
        if (f.field === 'clubs' && f.value === null) return row.memberships.length === 0;
        if (f.field === 'clubs') return row.memberships.some((m) => m.clubId === f.value);
        if (f.field === 'status') return String(value).split(', ').includes(String(f.value));
        if (
          ['createdAt', 'verifiedAt', 'lastSeenAt'].includes(f.field) &&
          value !== null &&
          f.value !== null
        )
          return Date.parse(String(value)) === Date.parse(String(f.value));
        if (typeof value === 'string' && typeof f.value === 'string')
          return value.toLocaleLowerCase('en') === f.value.toLocaleLowerCase('en');
        return value === f.value;
      }
      if (value === null || f.value === null) return value === f.value && f.op === 'contains';
      if (f.op === 'contains')
        return String(value)
          .toLocaleLowerCase('en')
          .includes(String(f.value).toLocaleLowerCase('en'));
      if (['createdAt', 'verifiedAt', 'lastSeenAt'].includes(f.field)) {
        const left = Date.parse(String(value)),
          right = Date.parse(String(f.value));
        return f.op === 'gte' ? left >= right : left <= right;
      }
      return f.op === 'gte' ? value >= f.value : value <= f.value;
    }),
  );
  matching.sort((a, b) => {
    const av = directoryValue(a, q.sort),
      bv = directoryValue(b, q.sort);
    const cmp =
      av === bv
        ? 0
        : av === null
          ? 1
          : bv === null
            ? -1
            : typeof av === 'number' && typeof bv === 'number'
              ? av - bv
              : String(av).localeCompare(String(bv), 'en', { numeric: true, sensitivity: 'base' });
    return (q.desc ? -cmp : cmp) || a.id.localeCompare(b.id);
  });
  return {
    rows: matching.slice(q.page * q.pageSize, (q.page + 1) * q.pageSize),
    total: matching.length,
    clubs: [
      ...new Map(
        rows.flatMap((row) =>
          row.memberships.map((m) => [m.clubId, { id: m.clubId, name: m.name }] as const),
        ),
      ).values(),
    ].sort((a, b) => a.name.localeCompare(b.name)),
  };
}
