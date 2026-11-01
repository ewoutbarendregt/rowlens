import { createHmac, timingSafeEqual } from 'node:crypto';

/**
 * The pilot cookie's value: `v1.<expiresAt>.<mac>`, where the MAC (HMAC-SHA256 with SESSION_SECRET)
 * covers the expiry and the fingerprint of the current access-code hash. Nothing is stored server-side;
 * a new code or a new secret invalidates every cookie at once.
 */
export interface TokenKeys {
  secret: string;
  codeFingerprint: string;
}

export function issueToken(keys: TokenKeys, expiresAt: number): string {
  const payload = `v1.${String(expiresAt)}`;
  return `${payload}.${mac(keys, payload)}`;
}

export function verifyToken(keys: TokenKeys, token: string | undefined, now: number): boolean {
  if (token === undefined) return false;
  const m = /^(v1\.(\d{10,13}))\.([A-Za-z0-9_-]{43})$/.exec(token);
  if (m === null) return false;
  const [, payload = '', expiresAt, given = ''] = m;
  if (Number(expiresAt) <= now) return false;
  const want = Buffer.from(mac(keys, payload));
  const got = Buffer.from(given);
  return got.length === want.length && timingSafeEqual(got, want);
}

function mac(keys: TokenKeys, payload: string): string {
  return createHmac('sha256', keys.secret)
    .update(`rowlens-pilot|${keys.codeFingerprint}|${payload}`)
    .digest('base64url');
}
