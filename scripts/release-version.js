import { readFileSync } from 'node:fs';
import { buildReleaseVersion } from '../apps/web/src/shared/release-version.ts';

const root = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
process.stdout.write(`${buildReleaseVersion(root.version, process.argv[2])}\n`);
