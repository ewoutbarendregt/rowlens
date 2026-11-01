import { createHash, randomBytes, randomInt, scrypt, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';

const scryptAsync = promisify(scrypt) as (
  password: string,
  salt: Buffer,
  keylen: number,
  options: { N: number; r: number; p: number; maxmem: number },
) => Promise<Buffer>;

// 2^15 × 8 × 128 B = 32 MiB per check; ~50 ms. With the rate limit that makes guessing hopeless.
const PARAMS = { logN: 15, r: 8, p: 1 };
const KEY_LENGTH = 32;
// Dots, not `$`: Docker Compose would interpolate `$…` in .env files and compose YAML.
const STORED = /^scrypt\.(\d{2})\.(\d{1,2})\.(\d{1,2})\.([A-Za-z0-9_-]{22,})\.([A-Za-z0-9_-]{43})$/;

// No 0/O, 1/I/L: the code is read aloud and typed on phones.
const ALPHABET = 'abcdefghjkmnpqrstuvwxyz23456789';

/** A new code like `k7pq-3mxa-9rtd-wv2e`: 16 characters, ~79 bits. */
export function generateAccessCode(): string {
  const chars = Array.from({ length: 16 }, () => ALPHABET[randomInt(ALPHABET.length)]);
  return [0, 4, 8, 12].map((i) => chars.slice(i, i + 4).join('')).join('-');
}

/** Case, spaces and dashes don't matter when typing the code. */
export function normalizeAccessCode(code: string): string {
  return code.toLowerCase().replace(/[\s-]/g, '');
}

export function isStoredHash(value: string): boolean {
  return STORED.test(value);
}

/** `scrypt.15.8.1.<salt>.<hash>` (base64url); this string goes into PILOT_ACCESS_CODE_HASH. */
export async function hashAccessCode(code: string): Promise<string> {
  const salt = randomBytes(16);
  const key = await derive(normalizeAccessCode(code), salt, PARAMS);
  return [
    'scrypt',
    PARAMS.logN,
    PARAMS.r,
    PARAMS.p,
    salt.toString('base64url'),
    key.toString('base64url'),
  ].join('.');
}

export async function verifyAccessCode(code: string, stored: string): Promise<boolean> {
  const m = STORED.exec(stored);
  if (m === null) return false;
  const [, logN, r, p, salt = '', expected = ''] = m;
  const want = Buffer.from(expected, 'base64url');
  const got = await derive(normalizeAccessCode(code), Buffer.from(salt, 'base64url'), {
    logN: Number(logN),
    r: Number(r),
    p: Number(p),
  });
  return got.length === want.length && timingSafeEqual(got, want);
}

/** Short, non-secret identifier of a stored hash; a new code changes it and so voids every cookie. */
export function hashFingerprint(stored: string): string {
  return createHash('sha256').update(stored).digest('base64url').slice(0, 16);
}

function derive(
  code: string,
  salt: Buffer,
  { logN, r, p }: { logN: number; r: number; p: number },
): Promise<Buffer> {
  const N = 2 ** logN;
  return scryptAsync(code, salt, KEY_LENGTH, { N, r, p, maxmem: 256 * N * r });
}
