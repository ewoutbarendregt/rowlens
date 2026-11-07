import { and, eq, sql } from 'drizzle-orm';
import type { FastifyPluginCallback, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { withBasePath } from '../../shared/base-path.ts';
import { job, perspective, rowingSession, video } from '../db/schema.ts';
import type { Tx } from '../db/client.ts';
import { lockEditableSession, lockEditableVideo } from '../repositories/training-access.ts';
import { withTenant } from '../db/tenant.ts';
import { originalKey, TooLarge, videoKey } from '../media/store.ts';
import { looksLikeVideo, sniffContainer } from '../media/sniff.ts';
import { RateLimiter } from '../rate-limit.ts';
import { type ClubRouteOptions, notFound, tenantOf } from './route-helpers.ts';

const TUS_VERSION = '1.0.0';
/** Caddy allows 64 MB request bodies (ADR-0003); the client sends 16 MB chunks. */
export const MAX_CHUNK_BYTES = 64 * 1024 * 1024;
const OCTET_STREAM = 'application/offset+octet-stream';

const metadataSchema = z.object({
  filename: z.string().trim().min(1).max(255),
  filetype: z.string().max(100).default(''),
  sessionId: z.uuid(),
  perspective: z.enum(perspective.enumValues),
});
const idParam = z.object({ id: z.uuid() });

/**
 * Resumable upload (#45, #46): the tus 1.0 core protocol plus creation and termination, at
 * `/api/uploads`. Every step runs behind the club guard and through withTenant, and the limits
 * (size, global media cap, disk) are checked before bytes are accepted. Bytes go straight to the
 * video's `original` key; HEAD reports how far they got, so a phone can resume after losing signal.
 */
export const uploadRoutes: FastifyPluginCallback<ClubRouteOptions> = (app, opts, done) => {
  const { db, guard, limits, basePath } = opts;
  const media = opts.media;
  if (media === null) {
    done();
    return;
  }
  const creations = new RateLimiter(60, 60 * 60 * 1000);
  const busy = new Set<string>();

  // PATCH bodies are streamed to disk, never buffered or parsed.
  app.addContentTypeParser(OCTET_STREAM, (_req, _payload, parsed) => {
    parsed(null);
  });

  app.addHook('onSend', async (_req, reply) => {
    void reply.header('tus-resumable', TUS_VERSION).header('cache-control', 'private, no-store');
  });

  const tusVersionOk = (req: FastifyRequest, reply: FastifyReply) => {
    if (req.headers['tus-resumable'] === TUS_VERSION) return true;
    void reply.code(412).header('tus-version', TUS_VERSION).send({ error: 'tus_version' });
    return false;
  };

  const diskFull = async () => (await media.diskUsedRatio()) >= limits.diskPauseRatio;

  app.post('/api/uploads', { preHandler: guard }, async (req, reply) => {
    if (!tusVersionOk(req, reply)) return reply;
    const tenant = tenantOf(req);
    const length = intHeader(req, 'upload-length');
    if (length === null || length < 1) return reply.code(400).send({ error: 'upload_length' });
    if (length > limits.maxUploadBytes) return reply.code(413).send({ error: 'too_large' });
    const meta = metadataSchema.safeParse(parseMetadata(req.headers['upload-metadata']));
    if (!meta.success) return reply.code(400).send({ error: 'upload_metadata' });
    if (!looksLikeVideo(meta.data.filename, meta.data.filetype)) {
      return reply.code(415).send({ error: 'not_a_video' });
    }
    // Signed-in accounts get their own bucket; the pilot fallback has no user id and stays per IP.
    const limit = creations.hit(tenant.userId === null ? `ip:${req.ip}` : `user:${tenant.userId}`);
    if (!limit.allowed) {
      return reply
        .code(429)
        .header('retry-after', String(limit.retryAfterS))
        .send({ error: 'too_many_uploads' });
    }
    if (await diskFull()) return reply.code(507).send({ error: 'disk_full' });

    const created = await withTenant(db, tenant, async (tx) => {
      if (!(await lockEditableSession(tx, meta.data.sessionId))) return 'no_session' as const;
      // One creation at a time across all clubs, so two uploads can't both squeeze under the cap.
      await tx.execute(sql`select pg_advisory_xact_lock(hashtext('rowlens_media_cap'))`);
      const used = await tx.execute<{ bytes: string }>(sql`select rowlens_media_bytes() as bytes`);
      if (Number(used.rows[0]?.bytes ?? 0) + length > limits.capBytes) return 'media_cap' as const;
      const [session] = await tx
        .select({ id: rowingSession.id })
        .from(rowingSession)
        .where(eq(rowingSession.id, meta.data.sessionId));
      if (session === undefined) return 'no_session' as const;
      // Next number in the session; creations are serialised by the lock above, so no two get one.
      const [last] = await tx
        .select({ seq: sql<number>`coalesce(max(${video.seq}), 0)::int` })
        .from(video)
        .where(eq(video.sessionId, session.id));
      const [row] = await tx
        .insert(video)
        .values({
          clubId: tenant.clubId,
          sessionId: session.id,
          originalFilename: meta.data.filename,
          contentType: meta.data.filetype || 'application/octet-stream',
          perspective: meta.data.perspective,
          sizeBytes: length,
          seq: (last?.seq ?? 0) + 1,
        })
        .returning({ id: video.id });
      return row;
    });
    if (created === 'media_cap') return reply.code(507).send({ error: 'media_cap' });
    if (created === 'no_session' || created === undefined) return notFound(reply);
    req.log.info({ videoId: created.id, bytes: length }, 'upload created');
    return reply
      .code(201)
      .header('location', withBasePath(basePath, `/api/uploads/${created.id}`))
      .send();
  });

  const findUpload = async (req: FastifyRequest, editable = false) => {
    const params = idParam.safeParse(req.params);
    if (!params.success) return null;
    const tenant = tenantOf(req);
    const [row] = await withTenant(db, tenant, (tx) =>
      tx
        .select({
          id: video.id,
          status: video.status,
          sizeBytes: video.sizeBytes,
          uploadedBytes: video.uploadedBytes,
        })
        .from(video)
        .where(
          and(
            eq(video.id, params.data.id),
            eq(video.clubId, tenant.clubId),
            editable ? sql`rowlens_can_edit_video(${video.id})` : undefined,
          ),
        ),
    );
    return row ?? null;
  };

  app.head('/api/uploads/:id', { preHandler: guard }, async (req, reply) => {
    if (!tusVersionOk(req, reply)) return reply;
    const upload = await findUpload(req);
    if (upload === null) return notFound(reply);
    return reply
      .code(200)
      .header('upload-offset', String(upload.uploadedBytes))
      .header('upload-length', String(upload.sizeBytes))
      .send();
  });

  app.patch('/api/uploads/:id', { preHandler: guard }, async (req, reply) => {
    if (!tusVersionOk(req, reply)) return reply;
    if (req.headers['content-type'] !== OCTET_STREAM) {
      return reply.code(415).send({ error: 'content_type' });
    }
    const offset = intHeader(req, 'upload-offset');
    const chunk = intHeader(req, 'content-length');
    if (offset === null) return reply.code(400).send({ error: 'upload_offset' });
    if (chunk === null) return reply.code(411).send({ error: 'content_length' });
    if (chunk > MAX_CHUNK_BYTES) return reply.code(413).send({ error: 'chunk_too_large' });

    const upload = await findUpload(req, true);
    if (upload === null) return notFound(reply);
    if (busy.has(upload.id)) return reply.code(423).send({ error: 'upload_busy' });
    busy.add(upload.id);
    const done = () => busy.delete(upload.id);
    return appendChunk(req, reply, upload, offset, chunk).finally(done);
  });

  // One PATCH per upload at a time (the caller holds the `busy` slot).
  const appendChunk = async (
    req: FastifyRequest,
    reply: FastifyReply,
    upload: { id: string; status: string; sizeBytes: number },
    offset: number,
    chunk: number,
  ): Promise<FastifyReply> => {
    const tenant = tenantOf(req);
    return withTenant(db, tenant, async (tx) => {
      if (!(await lockEditableVideo(tx, upload.id))) return notFound(reply);
      const key = originalKey(tenant.clubId, upload.id);
      // The file is the truth: after a crash the row may lag behind what reached the disk.
      const stored = await media.size(key);
      if (upload.status !== 'uploading' || offset !== stored) {
        return reply
          .code(409)
          .header('upload-offset', String(stored))
          .send({ error: 'offset_mismatch' });
      }
      if (offset + chunk > upload.sizeBytes) return reply.code(413).send({ error: 'too_large' });
      if (await diskFull()) return reply.code(507).send({ error: 'disk_full' });

      // Streaming can exceed the pool's 15 s idle-transaction limit. Keep the ownership lock,
      // but bound each chunk to five minutes so a stalled client cannot hold it indefinitely.
      await tx.execute(sql`set local idle_in_transaction_session_timeout = 0`);
      const deadline = setTimeout(() => req.raw.destroy(), 5 * 60_000);
      let size: number;
      try {
        size = await media.append(key, req.raw, chunk).catch((err: unknown) => {
          if (err instanceof TooLarge) return -1;
          throw err;
        });
      } finally {
        clearTimeout(deadline);
      }
      if (size === -1) {
        await setProgress(tx, upload.id, await media.size(key));
        return reply.code(413).send({ error: 'chunk_too_large' });
      }
      if (size < upload.sizeBytes) {
        await setProgress(tx, upload.id, size);
        return reply.code(204).header('upload-offset', String(size)).send();
      }

      // Complete: is it a video at all? (ffprobe in the worker decides whether it decodes, #47.)
      const container = sniffContainer(await media.head(key, 64));
      if (container === null) {
        await media.remove(videoKey(tenant.clubId, upload.id));
        await setStatus(tx, upload.id, size, 'rejected', 'not_a_video');
        req.log.info({ videoId: upload.id }, 'upload rejected: not a video');
        return reply.code(415).header('upload-offset', String(size)).send({ error: 'not_a_video' });
      }
      await tx
        .update(video)
        .set({
          uploadedBytes: size,
          status: 'uploaded',
          statusReason: null,
          updatedAt: new Date(),
        })
        .where(eq(video.id, upload.id));
      // Same transaction: a completed upload always has its processing job (#47, ADR-0008).
      await tx
        .insert(job)
        .values({
          clubId: tenant.clubId,
          type: 'video.process',
          payload: { videoId: upload.id },
          idempotencyKey: `video.process:${upload.id}`,
        })
        .onConflictDoNothing();
      req.log.info({ videoId: upload.id, bytes: size, container }, 'upload complete');
      return reply.code(204).header('upload-offset', String(size)).send();
    });
  };

  // tus termination: the client gives up on an upload.
  app.delete('/api/uploads/:id', { preHandler: guard }, async (req, reply) => {
    if (!tusVersionOk(req, reply)) return reply;
    const upload = await findUpload(req, true);
    if (upload === null) return notFound(reply);
    const tenant = tenantOf(req);
    if (busy.has(upload.id)) return reply.code(423).send({ error: 'upload_busy' });
    const deleted = await withTenant(db, tenant, async (tx) => {
      if (!(await lockEditableVideo(tx, upload.id))) return [];
      return tx.delete(video).where(eq(video.id, upload.id)).returning({ id: video.id });
    });
    if (deleted.length === 0) return notFound(reply);
    await media.remove(videoKey(tenant.clubId, upload.id));
    return reply.code(204).send();
  });

  const setProgress = (tx: Tx, id: string, bytes: number) =>
    tx.update(video).set({ uploadedBytes: bytes, updatedAt: new Date() }).where(eq(video.id, id));
  const setStatus = (
    tx: Tx,
    id: string,
    bytes: number,
    status: 'rejected',
    reason: string | null,
  ) =>
    tx
      .update(video)
      .set({ uploadedBytes: bytes, status, statusReason: reason, updatedAt: new Date() })
      .where(eq(video.id, id));

  done();
};

function intHeader(req: FastifyRequest, name: string): number | null {
  const value = req.headers[name];
  if (typeof value !== 'string' || !/^\d{1,16}$/.test(value)) return null;
  const n = Number(value);
  return Number.isSafeInteger(n) ? n : null;
}

/** tus `Upload-Metadata`: comma-separated `key base64value` pairs. */
export function parseMetadata(header: string | string[] | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  if (typeof header !== 'string') return out;
  for (const pair of header.split(',')) {
    const parts = pair.trim().split(' ');
    const [key, value = ''] = parts;
    if (parts.length > 2 || key === undefined || !/^[A-Za-z0-9_-]{1,32}$/.test(key)) continue;
    out[key] = Buffer.from(value, 'base64').toString('utf8');
  }
  return out;
}
