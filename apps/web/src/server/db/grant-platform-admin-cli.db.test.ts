import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { expect, inject, it } from 'vitest';
import { asOwner } from './test/fixtures.ts';

function runBootstrap(email: string) {
  return new Promise<{ code: number | null; output: string }>((resolve, reject) => {
    const child = spawn(
      process.execPath,
      ['--experimental-strip-types', 'src/server/db/grant-platform-admin-cli.ts'],
      { env: { ...process.env, DATABASE_OWNER_URL: inject('ownerUrl') } },
    );
    let output = '';
    child.stdout.on('data', (chunk: Buffer) => (output += chunk.toString()));
    child.stderr.on('data', (chunk: Buffer) => (output += chunk.toString()));
    child.on('error', reject);
    child.on('close', (code) => {
      resolve({ code, output });
    });
    child.stdin.end(email);
  });
}

it('grants a verified account atomically with one audit event, including on repeat invocation', async () => {
  const id = randomUUID();
  const email = `bootstrap-${id}@example.test`;
  await asOwner(
    "insert into app_user(id,email,display_name,verified_at) values($1,$2,'Bootstrap test',now())",
    [id, email],
  );
  for (let attempt = 0; attempt < 2; attempt++) {
    const result = await runBootstrap(email);
    expect(result.output).not.toContain(email);
    expect(result.code, result.output).toBe(0);
    expect(result.output).toContain('Platform administrator is enabled.');
  }
  expect(await asOwner('select user_id from platform_admin where user_id=$1', [id])).toEqual([
    { user_id: id },
  ]);
  expect(
    await asOwner('select action,target from platform_audit where actor_user_id=$1', [id]),
  ).toEqual([{ action: 'platform.operator_bootstrap', target: id }]);
});

it('refuses an unverified account without granting authority or leaking its address', async () => {
  const id = randomUUID();
  const email = `bootstrap-${id}@example.test`;
  await asOwner("insert into app_user(id,email,display_name) values($1,$2,'Bootstrap test')", [
    id,
    email,
  ]);
  const result = await runBootstrap(email);
  expect(result.code).not.toBe(0);
  expect(result.output).toContain('A verified account is required first');
  expect(result.output).not.toContain(email);
  expect(await asOwner('select user_id from platform_admin where user_id=$1', [id])).toEqual([]);
  expect(await asOwner('select id from platform_audit where actor_user_id=$1', [id])).toEqual([]);
});
