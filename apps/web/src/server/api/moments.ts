import { and, asc, eq, inArray, notExists } from 'drizzle-orm';
import type { FastifyPluginCallback } from 'fastify';
import { z } from 'zod';
import type { Tx } from '../db/client.ts';
import { annotation, moment, momentRower, momentRowerLog, rower, video } from '../db/schema.ts';
import { withTenant } from '../db/tenant.ts';
import { type ClubRouteOptions, notFound, tenantOf } from './route-helpers.ts';

const frameParams = z.object({ id: z.uuid(), frame: z.coerce.number().int().min(0) });
const assignBody = z.object({ rowerIds: z.array(z.uuid()).max(50) });

export interface MomentRowers {
  frame: number;
  rowers: { id: string; displayName: string; archived: boolean }[];
}

/** Who each note of a video is for, by frame; notes without rowers are left out. */
export async function momentRowersOf(tx: Tx, videoId: string): Promise<MomentRowers[]> {
  const rows = await tx
    .select({
      frame: moment.frame,
      rowerId: rower.id,
      displayName: rower.displayName,
      archivedAt: rower.archivedAt,
    })
    .from(moment)
    .innerJoin(momentRower, eq(momentRower.momentId, moment.id))
    .innerJoin(rower, eq(rower.id, momentRower.rowerId))
    .where(eq(moment.videoId, videoId))
    .orderBy(asc(moment.frame), asc(rower.displayName));
  const byFrame = new Map<number, MomentRowers>();
  for (const r of rows) {
    const m = byFrame.get(r.frame) ?? { frame: r.frame, rowers: [] };
    m.rowers.push({ id: r.rowerId, displayName: r.displayName, archived: r.archivedAt !== null });
    byFrame.set(r.frame, m);
  }
  return [...byFrame.values()];
}

/** The note at a frame is gone once nothing is drawn or written there any more. */
export async function dropEmptyMoments(tx: Tx, videoId: string, frame?: number): Promise<void> {
  await tx.delete(moment).where(
    and(
      eq(moment.videoId, videoId),
      frame === undefined ? undefined : eq(moment.frame, frame),
      notExists(
        tx
          .select({ id: annotation.id })
          .from(annotation)
          .where(and(eq(annotation.videoId, moment.videoId), eq(annotation.frame, moment.frame))),
      ),
    ),
  );
}

/** Merging two roster entries (#104): `from`'s notes go to `into`, once per note. */
export async function mergeMomentRowers(tx: Tx, from: string, into: string): Promise<void> {
  const shared = tx
    .select({ momentId: momentRower.momentId })
    .from(momentRower)
    .where(eq(momentRower.rowerId, into));
  await tx
    .delete(momentRower)
    .where(and(eq(momentRower.rowerId, from), inArray(momentRower.momentId, shared)));
  await tx.update(momentRower).set({ rowerId: into }).where(eq(momentRower.rowerId, from));
}

type AssignError = 'no_moment' | 'unknown_rower' | 'archived_rower';

/**
 * Who a note is for (#105): the rowers of the note at one frame, replaced as a whole. Every change
 * is logged (who added or removed whom, when) so assignments stay traceable.
 */
export const momentRoutes: FastifyPluginCallback<ClubRouteOptions> = (app, opts, done) => {
  const { db, guard } = opts;

  app.addHook('onSend', async (_req, reply) => {
    void reply.header('cache-control', 'private, no-store');
  });

  app.put('/api/videos/:id/frames/:frame/rowers', { preHandler: guard }, async (req, reply) => {
    const params = frameParams.safeParse(req.params);
    if (!params.success) return notFound(reply);
    const body = assignBody.safeParse(req.body);
    const wanted = new Set(body.success ? body.data.rowerIds : []);
    if (!body.success || wanted.size !== body.data.rowerIds.length) {
      return reply.code(400).send({ error: 'invalid_rowers' });
    }
    const tenant = tenantOf(req);
    const { id: videoId, frame } = params.data;

    const result = await withTenant(
      db,
      tenant,
      async (tx): Promise<MomentRowers | AssignError | null> => {
        const [v] = await tx.select({ id: video.id }).from(video).where(eq(video.id, videoId));
        if (v === undefined) return null;
        const [drawnOrWritten] = await tx
          .select({ id: annotation.id })
          .from(annotation)
          .where(and(eq(annotation.videoId, videoId), eq(annotation.frame, frame)))
          .limit(1);
        if (drawnOrWritten === undefined) return 'no_moment';

        await tx
          .insert(moment)
          .values({ clubId: tenant.clubId, videoId, frame })
          .onConflictDoNothing({ target: [moment.videoId, moment.frame] });
        const [m] = await tx
          .select({ id: moment.id })
          .from(moment)
          .where(and(eq(moment.videoId, videoId), eq(moment.frame, frame)))
          .for('update');
        if (m === undefined) return null;

        const before = new Set(
          (
            await tx
              .select({ rowerId: momentRower.rowerId })
              .from(momentRower)
              .where(eq(momentRower.momentId, m.id))
          ).map((r) => r.rowerId),
        );
        const found =
          wanted.size === 0
            ? []
            : await tx
                .select({ id: rower.id, archivedAt: rower.archivedAt })
                .from(rower)
                .where(inArray(rower.id, [...wanted]));
        if (found.length !== wanted.size) return 'unknown_rower';
        if (found.some((r) => r.archivedAt !== null && !before.has(r.id))) return 'archived_rower';

        const added = [...wanted].filter((r) => !before.has(r));
        const removed = [...before].filter((r) => !wanted.has(r));
        if (removed.length > 0) {
          await tx
            .delete(momentRower)
            .where(and(eq(momentRower.momentId, m.id), inArray(momentRower.rowerId, removed)));
        }
        if (added.length > 0) {
          await tx.insert(momentRower).values(
            added.map((rowerId) => ({
              clubId: tenant.clubId,
              momentId: m.id,
              rowerId,
              assignedByUserId: tenant.userId,
            })),
          );
        }
        const changes = [
          ...added.map((rowerId) => ({ rowerId, action: 'assigned' as const })),
          ...removed.map((rowerId) => ({ rowerId, action: 'unassigned' as const })),
        ];
        if (changes.length > 0) {
          await tx.insert(momentRowerLog).values(
            changes.map((c) => ({
              clubId: tenant.clubId,
              momentId: m.id,
              rowerId: c.rowerId,
              action: c.action,
              byUserId: tenant.userId,
            })),
          );
        }
        const now = (await momentRowersOf(tx, videoId)).find((x) => x.frame === frame);
        return now ?? { frame, rowers: [] };
      },
    );
    if (result === null) return notFound(reply);
    if (result === 'no_moment') return reply.code(409).send({ error: result });
    if (typeof result === 'string') return reply.code(400).send({ error: result });
    return result;
  });

  done();
};
