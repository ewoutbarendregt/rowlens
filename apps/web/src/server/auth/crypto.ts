import { createHash, createHmac, randomBytes, randomInt, timingSafeEqual } from 'node:crypto';

export const newCode = () => String(randomInt(0, 1_000_000)).padStart(6, '0');
export const newToken = () => randomBytes(32).toString('hex');

export const sha256 = (value: string) => createHash('sha256').update(value).digest('hex');

export const hmac = (pepper: string, purpose: string, value: string) =>
  createHmac('sha256', Buffer.from(pepper, 'hex')).update(`${purpose}\0${value}`).digest('hex');

export function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a, 'hex');
  const right = Buffer.from(b, 'hex');
  return left.length === right.length && timingSafeEqual(left, right);
}
