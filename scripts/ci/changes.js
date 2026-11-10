import { spawnSync } from 'node:child_process';
import { appendFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

const rootDocs = new Set([
  'README.md',
  'DOCUMENTATION.md',
  'PLAN.md',
  'BUILD.md',
  'FEATURES.md',
  'TEST.md',
  'BUGS.md',
]);

// Unknown paths and empty/unavailable comparisons always receive the complete suite.
export function requiresFullSuite(paths) {
  return (
    paths.length === 0 || paths.some((path) => !rootDocs.has(path) && !/^docs\/.+\.md$/.test(path))
  );
}

export function changedPaths(base, head, git = spawnSync) {
  const validSha = (sha) => /^[0-9a-f]{40,64}$/.test(sha ?? '') && !/^0+$/.test(sha);
  if (!validSha(base) || !validSha(head)) return [];
  // Include both sides of renames: moving code into docs must still run the full suite.
  const diff = git('git', ['diff', '--no-renames', '--name-only', '-z', base, head, '--'], {
    encoding: 'utf8',
  });
  if (diff.status !== 0) return [];
  return diff.stdout.split('\0').filter(Boolean);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const full = requiresFullSuite(changedPaths(process.env['BASE_SHA'], process.env['HEAD_SHA']));
  appendFileSync(process.env['GITHUB_OUTPUT'], `full=${String(full)}\n`);
  console.log(
    full ? 'Complete CI suite required.' : 'Documentation only: policy and secrets checks.',
  );
}
