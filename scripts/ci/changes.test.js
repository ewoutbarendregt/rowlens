import assert from 'node:assert/strict';
import { test } from 'node:test';
import { changedPaths, requiresFullSuite } from './changes.js';

test('root logs and nested Markdown documentation use the short path', () => {
  assert.equal(requiresFullSuite(['DOCUMENTATION.md', 'TEST.md', 'docs/runbooks/setup.md']), false);
});

for (const path of [
  'apps/web/src/client/styles.css',
  'worker/src/job.py',
  '.github/workflows/ci.yml',
  'infra/compose/docker-compose.prod.yml',
  'pnpm-lock.yaml',
  'scripts/ci/changes.js',
  'AGENTS.md',
  'docs/fixtures/input.json',
  'unknown.md',
]) {
  test(`${path} requires the complete suite even alongside documentation`, () => {
    assert.equal(requiresFullSuite(['DOCUMENTATION.md', path]), true);
  });
}

test('empty or unavailable comparison requires the complete suite', () => {
  assert.equal(requiresFullSuite([]), true);
  assert.deepEqual(changedPaths(undefined, undefined), []);
  assert.deepEqual(changedPaths('0'.repeat(40), 'a'.repeat(40)), []);
  assert.deepEqual(changedPaths('--invalid', 'a'.repeat(40)), []);
});

test('git failures conservatively require the complete suite', () => {
  assert.equal(
    requiresFullSuite(changedPaths('a'.repeat(40), 'b'.repeat(40), () => ({ status: 128 }))),
    true,
  );
});

test('renamed code and unusual filenames cannot hide behind documentation', () => {
  const paths = changedPaths('a'.repeat(40), 'b'.repeat(40), (command, args) => {
    assert.equal(command, 'git');
    assert.deepEqual(args.slice(0, 4), ['diff', '--no-renames', '--name-only', '-z']);
    return { status: 0, stdout: 'apps/web/old.ts\0docs/moved.md\0docs/line\nbreak.md\0' };
  });
  assert.equal(paths.length, 3);
  assert.equal(requiresFullSuite(paths), true);
});
