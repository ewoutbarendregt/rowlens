import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Readable } from 'node:stream';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { MediaStore, TooLarge, originalKey } from './store.ts';

let dir = '';
let store: MediaStore;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'rowlens-media-'));
  store = new MediaStore(dir);
});
afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

const KEY = originalKey(
  '7c1e1f8a-0000-4000-8000-000000000001',
  '7c1e1f8a-0000-4000-8000-000000000002',
);

describe('MediaStore', () => {
  it('appends chunks and reports the size', async () => {
    expect(await store.size(KEY)).toBe(0);
    expect(await store.append(KEY, Readable.from([Buffer.from('abc')]), 10)).toBe(3);
    expect(await store.append(KEY, Readable.from([Buffer.from('de')]), 10)).toBe(5);
    expect((await store.head(KEY, 4)).toString()).toBe('abcd');
  });

  it('keeps the bytes that arrived when the connection breaks', async () => {
    const body = new Readable({ read() {} });
    const appended = store.append(KEY, body, 100);
    body.push(Buffer.from('12345'));
    setTimeout(() => body.destroy(Object.assign(new Error('reset'), { code: 'ECONNRESET' })), 20);
    expect(await appended).toBe(5);
  });

  it('refuses more than the allowed bytes and writes none of the crossing chunk', async () => {
    const body = Readable.from([Buffer.from('1234'), Buffer.from('5678')]);
    await expect(store.append(KEY, body, 6)).rejects.toBeInstanceOf(TooLarge);
    expect(await store.size(KEY)).toBe(4);
  });

  it('removes a key prefix recursively', async () => {
    await store.append(KEY, Readable.from([Buffer.from('x')]), 1);
    await store.remove(KEY.replace(/\/original$/, ''));
    expect(await store.size(KEY)).toBe(0);
  });

  it.each(['../etc/passwd', 'clubs/../../x', '/abs', 'Clubs/A', 'a//b', ''])(
    'rejects key %j',
    async (key) => {
      await expect(store.size(key)).rejects.toThrow(/invalid media key/);
    },
  );

  it('reports disk use as a ratio', async () => {
    const ratio = await store.diskUsedRatio();
    expect(ratio).toBeGreaterThanOrEqual(0);
    expect(ratio).toBeLessThanOrEqual(1);
  });
});
