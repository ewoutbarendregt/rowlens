import pg from 'pg';
import { z } from 'zod';
// Run only by an operator with the owner's database connection. Never expose this through an API.
const ownerUrl = process.env['DATABASE_OWNER_URL'];
if (!ownerUrl) throw new Error('DATABASE_OWNER_URL is required');
let input = '';
for await (const chunk of process.stdin) input += String(chunk);
const email = z.email().parse(input.trim().toLowerCase());
const client = new pg.Client({ connectionString: ownerUrl });
await client.connect();
try {
  await client.query('BEGIN');
  const r = await client.query<{ id: string }>(
    'SELECT id FROM app_user WHERE email=$1 AND verified_at IS NOT NULL',
    [email],
  );
  const id = r.rows[0]?.id;
  if (!id) throw new Error('A verified account is required first');
  const added = await client.query(
    'INSERT INTO platform_admin(user_id) VALUES($1) ON CONFLICT DO NOTHING RETURNING user_id',
    [id],
  );
  if (added.rowCount)
    await client.query(
      "INSERT INTO platform_audit(actor_user_id,action,target) VALUES($1::uuid,'platform.operator_bootstrap',$1::uuid::text)",
      [id],
    );
  await client.query('COMMIT');
  console.log('Platform administrator is enabled.');
} catch (error) {
  await client.query('ROLLBACK');
  throw error;
} finally {
  await client.end();
}
