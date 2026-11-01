// New pilot access code (#84): prints the code (give it to the club) and the line for .env.
//   pnpm --filter @rowlens/web pilot:code              # locally
//   node dist/server/pilot/code-cli.js                 # inside the web image, on the server
//   echo -n 'my code' | node … --stdin                 # hash a code you chose yourself
import { readFileSync } from 'node:fs';
import { generateAccessCode, hashAccessCode } from './code.ts';

const code = process.argv.includes('--stdin')
  ? readFileSync(0, 'utf8').trim()
  : generateAccessCode();
if (code.length < 12) {
  console.error('A code needs at least 12 characters.');
  process.exit(64);
}
console.log(`code: ${code}`);
console.log(`PILOT_ACCESS_CODE_HASH=${await hashAccessCode(code)}`);
