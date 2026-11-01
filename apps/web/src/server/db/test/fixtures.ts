import { randomUUID } from 'node:crypto';
import pg from 'pg';
import { inject } from 'vitest';

/** Runs SQL as the owner (bypasses RLS: it owns the tables), for fixtures and inspection. */
export async function asOwner<T extends pg.QueryResultRow>(
  text: string,
  values: unknown[] = [],
): Promise<T[]> {
  const client = new pg.Client({ connectionString: inject('ownerUrl') });
  await client.connect();
  try {
    return (await client.query<T>(text, values)).rows;
  } finally {
    await client.end();
  }
}

/** Two clubs, A and B, with unique slugs so test files can run in parallel. */
export async function createTwoClubs(): Promise<{ a: string; b: string }> {
  const a = randomUUID();
  const b = randomUUID();
  await asOwner(`insert into club (id, slug, name) values ($1, $2, 'Club A'), ($3, $4, 'Club B')`, [
    a,
    `a-${a}`,
    b,
    `b-${b}`,
  ]);
  return { a, b };
}
