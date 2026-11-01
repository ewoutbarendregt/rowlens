import { and, eq } from 'drizzle-orm';
import type { FastifyPluginCallback } from 'fastify';
import { z } from 'zod';
import { rowingSession, video } from '../db/schema.ts';
import { withTenant } from '../db/tenant.ts';
import { videoKey } from '../media/store.ts';
import { type ClubRouteOptions, notFound, tenantOf } from './route-helpers.ts';

const idParam = z.object({ id: z.uuid() });
const mediaParams = z.object({
  id: z.uuid(),
  name: z.enum(['play-1080', 'play-540', 'poster']),
});

interface Rendition {
  name: string;
  key: string;
  width: number;
  height: number;
  bytes: number;
  contentType: string;
}

/**
 * One video and its media (#49, ADR-0007): metadata for the player, and the renditions and poster
 * streamed with byte ranges, only after the club guard and an RLS read of the video. No public or
 * guessable links: the URL alone is useless without the cookie, and other clubs get a 404.
 */
export const videoRoutes: FastifyPluginCallback<ClubRouteOptions> = (app, opts, done) => {
  const { db, guard, media } = opts;

  const readyVideo = async (clubId: string, id: string) => {
    const [row] = await withTenant(db, { clubId, userId: null }, (tx) =>
      tx
        .select({
          id: video.id,
          sessionId: video.sessionId,
          sessionTitle: rowingSession.title,
          filename: video.originalFilename,
          seq: video.seq,
          recordedAt: video.recordedAt,
          perspective: video.perspective,
          status: video.status,
          fpsNum: video.fpsNum,
          fpsDen: video.fpsDen,
          width: video.width,
          height: video.height,
          durationMs: video.durationMs,
          frameCount: video.frameCount,
          renditions: video.renditions,
        })
        .from(video)
        .innerJoin(rowingSession, eq(rowingSession.id, video.sessionId))
        .where(and(eq(video.id, id), eq(video.clubId, clubId))),
    );
    return row;
  };

  app.get('/api/videos/:id', { preHandler: guard }, async (req, reply) => {
    const params = idParam.safeParse(req.params);
    if (!params.success) return notFound(reply);
    const row = await readyVideo(tenantOf(req).clubId, params.data.id);
    if (row === undefined) return notFound(reply);
    const renditions = ((row.renditions ?? []) as Rendition[]).map(({ name, width, height }) => ({
      name,
      width,
      height,
    }));
    void reply.header('cache-control', 'private, no-store');
    return { ...row, renditions };
  });

  app.get('/api/videos/:id/media/:name', { preHandler: guard }, async (req, reply) => {
    const params = mediaParams.safeParse(req.params);
    if (!params.success || media === null) return notFound(reply);
    const clubId = tenantOf(req).clubId;
    const row = await readyVideo(clubId, params.data.id);
    if (row?.status !== 'ready') return notFound(reply);

    const { name } = params.data;
    let key: string;
    let contentType: string;
    if (name === 'poster') {
      key = `${videoKey(clubId, row.id)}/poster`;
      contentType = 'image/jpeg';
    } else {
      const rendition = ((row.renditions ?? []) as Rendition[]).find((r) => r.name === name);
      if (rendition === undefined) return notFound(reply);
      key = rendition.key;
      contentType = rendition.contentType;
    }
    // The stored key must be this video's own; never trust a path from the database blindly.
    if (!key.startsWith(`${videoKey(clubId, row.id)}/`)) return notFound(reply);
    const size = await media.size(key);
    if (size === 0) return notFound(reply);

    void reply
      .header('content-type', contentType)
      .header('accept-ranges', 'bytes')
      // Renditions never change for a video id; the cookie still gates every request.
      .header('cache-control', 'private, max-age=3600')
      .header('content-disposition', 'inline');
    const range = parseRange(req.headers.range, size);
    if (range === 'unsatisfiable') {
      return reply
        .code(416)
        .header('content-range', `bytes */${String(size)}`)
        .send();
    }
    if (range === null) {
      return reply.code(200).header('content-length', String(size)).send(media.read(key));
    }
    return reply
      .code(206)
      .header('content-range', `bytes ${String(range.start)}-${String(range.end)}/${String(size)}`)
      .header('content-length', String(range.end - range.start + 1))
      .send(media.read(key, range));
  });

  done();
};

/**
 * A single `bytes=` range (what video elements send). `null`: no or unsupported Range header, so the
 * whole file; multiple ranges are answered with the whole file too, which RFC 9110 allows.
 */
export function parseRange(
  header: string | undefined,
  size: number,
): { start: number; end: number } | 'unsatisfiable' | null {
  if (header === undefined) return null;
  const m = /^bytes=(\d*)-(\d*)$/.exec(header.trim());
  if (m === null) return null;
  const [, from = '', to = ''] = m;
  if (from === '' && to === '') return null;
  let start: number;
  let end: number;
  if (from === '') {
    // Suffix: the last N bytes.
    const n = Number(to);
    if (n === 0) return 'unsatisfiable';
    start = Math.max(0, size - n);
    end = size - 1;
  } else {
    start = Number(from);
    end = to === '' ? size - 1 : Math.min(Number(to), size - 1);
  }
  if (start >= size || start > end) return 'unsatisfiable';
  return { start, end };
}
