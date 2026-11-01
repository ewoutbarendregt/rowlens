import { createReadStream, createWriteStream } from 'node:fs';
import { mkdir, open, rm, stat, statfs } from 'node:fs/promises';
import { dirname, join, resolve, sep } from 'node:path';
import type { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';

/**
 * Where video bytes live (ADR-0006, amended): a directory on the server's disk, `/opt/rowlens/media`
 * in production. Code addresses media only by key (`clubs/{clubId}/videos/{videoId}/original`), never
 * by path, so moving to object storage later replaces this class, not its callers.
 */
export class MediaStore {
  readonly root: string;

  constructor(root: string) {
    this.root = resolve(root);
  }

  /** Bytes stored under `key`; 0 if nothing yet. */
  async size(key: string): Promise<number> {
    try {
      return (await stat(this.path(key))).size;
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') return 0;
      throw err;
    }
  }

  /**
   * Appends at most `maxBytes` from `body` to `key` and returns the new size. If the stream breaks
   * off, the bytes that arrived stay (that's what makes uploads resumable).
   */
  async append(key: string, body: Readable, maxBytes: number): Promise<number> {
    const path = this.path(key);
    await mkdir(dirname(path), { recursive: true });
    let written = 0;
    const limitHit = { overflow: false };
    try {
      await pipeline(
        body,
        // Stops (rather than throws) at the limit, so what was allowed is flushed to disk.
        async function* limit(source: AsyncIterable<Buffer>) {
          for await (const chunk of source) {
            if (written + chunk.length > maxBytes) {
              limitHit.overflow = true;
              return;
            }
            written += chunk.length;
            yield chunk;
          }
        },
        createWriteStream(path, { flags: 'a' }),
      );
    } catch (err) {
      // A broken connection keeps what arrived; the caller reads the real size back.
      if (!isAbort(err)) throw err;
    }
    if (limitHit.overflow) throw new TooLarge();
    return this.size(key);
  }

  async head(key: string, bytes: number): Promise<Buffer> {
    const file = await open(this.path(key), 'r');
    try {
      const buf = Buffer.alloc(bytes);
      const { bytesRead } = await file.read(buf, 0, bytes, 0);
      return buf.subarray(0, bytesRead);
    } finally {
      await file.close();
    }
  }

  read(key: string, range?: { start: number; end: number }): Readable {
    return createReadStream(this.path(key), range);
  }

  /** Removes `prefix` and everything under it. */
  async remove(prefix: string): Promise<void> {
    await rm(this.path(prefix), { recursive: true, force: true });
  }

  /** Share of the disk holding the media directory that is in use (0–1); the disk is shared with trustable.nl. */
  async diskUsedRatio(): Promise<number> {
    await mkdir(this.root, { recursive: true });
    const s = await statfs(this.root);
    return s.blocks === 0 ? 0 : 1 - s.bavail / s.blocks;
  }

  private path(key: string): string {
    if (!/^[a-z0-9]+(?:[/-][a-z0-9]+)*$/.test(key)) throw new Error(`invalid media key: ${key}`);
    const path = join(this.root, key);
    if (!path.startsWith(this.root + sep)) throw new Error(`media key escapes the root: ${key}`);
    return path;
  }
}

export class TooLarge extends Error {
  constructor() {
    super('more bytes than allowed');
  }
}

export const videoKey = (clubId: string, videoId: string) => `clubs/${clubId}/videos/${videoId}`;
export const originalKey = (clubId: string, videoId: string) =>
  `${videoKey(clubId, videoId)}/original`;

function isAbort(err: unknown): boolean {
  const code = (err as NodeJS.ErrnoException | undefined)?.code;
  return code === 'ECONNRESET' || code === 'ERR_STREAM_PREMATURE_CLOSE' || code === 'ABORT_ERR';
}
