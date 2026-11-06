import { sql, and, asc, eq, inArray, notExists } from 'drizzle-orm';
import type { FastifyPluginCallback } from 'fastify';
import { z } from 'zod';
import type { Tx } from '../db/client.ts';
import { alias } from 'drizzle-orm/pg-core';
import { can } from '../auth/can.ts';
import {
  annotation,
  moment,
  momentRower,
  momentRowerLog,
  momentShare,
  rower,
  video,
} from '../db/schema.ts';
import { type TenantContext, withTenant } from '../db/tenant.ts';
import { type ClubRouteOptions, notFound, tenantOf } from './route-helpers.ts';

const frameParams = z.object({ id: z.uuid(), frame: z.coerce.number().int().min(0) });
const assignBody = z.object({ rowerIds: z.array(z.uuid()).max(50) });
const shareBody = z.object({ rowerIds: z.array(z.uuid()).max(50), crew: z.boolean() });

export interface MomentShares {
  frame: number;
  crew: { sharedBy: string | null; canUnshare: boolean } | null;
  rowers: {
    id: string;
    displayName: string;
    archived: boolean;
    sharedBy: string | null;
    canUnshare: boolean;
  }[];
}

const sharer = alias(rower, 'sharer');

/**
 * Who each note of a video is shared with (#112), as far as the viewer may see (RLS). `sharedBy`
 * is the sharer's roster name when their account is linked to the roster.
 */
export async function momentSharesOf(
  tx: Tx,
  videoId: string,
  tenant: TenantContext,
): Promise<MomentShares[]> {
  const rows = await tx
    .select({
      frame: moment.frame,
      scope: momentShare.scope,
      rowerId: rower.id,
      displayName: rower.displayName,
      archivedAt: rower.archivedAt,
      sharedByUserId: momentShare.sharedByUserId,
      sharedBy: sharer.displayName,
    })
    .from(momentShare)
    .innerJoin(moment, eq(moment.id, momentShare.momentId))
    .leftJoin(rower, eq(rower.id, momentShare.rowerId))
    .leftJoin(sharer, eq(sharer.userId, momentShare.sharedByUserId))
    .where(eq(moment.videoId, videoId))
    .orderBy(asc(moment.frame), asc(rower.displayName));
  const viewer = { roles: tenant.roles, role: tenant.role ?? null, userId: tenant.userId };
  const byFrame = new Map<number, MomentShares>();
  for (const r of rows) {
    const m = byFrame.get(r.frame) ?? { frame: r.frame, crew: null, rowers: [] };
    const canUnshare = can(viewer, { kind: 'unshare', sharedByUserId: r.sharedByUserId });
    if (r.scope === 'crew') m.crew = { sharedBy: r.sharedBy, canUnshare };
    else if (r.rowerId !== null && r.displayName !== null) {
      m.rowers.push({
        id: r.rowerId,
        displayName: r.displayName,
        archived: r.archivedAt !== null,
        sharedBy: r.sharedBy,
        canUnshare,
      });
    }
    byFrame.set(r.frame, m);
  }
  return [...byFrame.values()];
}

/**
 * The note at a frame as a row, created on first use. 'no_moment' when nothing the viewer can see
 * is drawn or written there; null when the video is unknown (or not theirs to see).
 */
async function noteAt(
  tx: Tx,
  tenant: TenantContext,
  videoId: string,
  frame: number,
): Promise<{ id: string } | 'no_moment' | null> {
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
  return m ?? null;
}

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
type ShareError = AssignError | 'not_yours';

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
        const m = await noteAt(tx, tenant, videoId, frame);
        if (m === null || m === 'no_moment') return m;

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
            : (
                await tx.execute<{ id: string; archivedAt: Date | null }>(
                  sql`select id, archived_at as "archivedAt" from rowlens_rower_targets(${`{${[...wanted].join(',')}}`}::uuid[])`,
                )
              ).rows;
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

  /**
   * Who a note is shared with (#112): some rowers and/or the session's whole crew, replaced as a
   * whole. A rower can only take back what they shared themselves; coaches can take back anything.
   */
  app.put('/api/videos/:id/frames/:frame/shares', { preHandler: guard }, async (req, reply) => {
    const params = frameParams.safeParse(req.params);
    if (!params.success) return notFound(reply);
    const body = shareBody.safeParse(req.body);
    const wanted = new Set(body.success ? body.data.rowerIds : []);
    if (!body.success || wanted.size !== body.data.rowerIds.length) {
      return reply.code(400).send({ error: 'invalid_shares' });
    }
    const tenant = tenantOf(req);
    const viewer = { roles: tenant.roles, role: tenant.role ?? null, userId: tenant.userId };
    const { id: videoId, frame } = params.data;

    const result = await withTenant(
      db,
      tenant,
      async (tx): Promise<MomentShares | ShareError | null> => {
        const m = await noteAt(tx, tenant, videoId, frame);
        if (m === null || m === 'no_moment') return m;
        const before = await tx
          .select({
            id: momentShare.id,
            scope: momentShare.scope,
            rowerId: momentShare.rowerId,
            sharedByUserId: momentShare.sharedByUserId,
          })
          .from(momentShare)
          .where(eq(momentShare.momentId, m.id));
        const beforeRowers = new Set(
          before.flatMap((b) => (b.rowerId === null ? [] : [b.rowerId])),
        );
        const removed = before.filter((b) =>
          b.scope === 'crew' ? !body.data.crew : b.rowerId !== null && !wanted.has(b.rowerId),
        );
        if (
          removed.some((b) => !can(viewer, { kind: 'unshare', sharedByUserId: b.sharedByUserId }))
        ) {
          return 'not_yours';
        }
        const found =
          wanted.size === 0
            ? []
            : (
                await tx.execute<{ id: string; archivedAt: Date | null }>(
                  sql`select id, archived_at as "archivedAt" from rowlens_rower_targets(${`{${[...wanted].join(',')}}`}::uuid[])`,
                )
              ).rows;
        if (found.length !== wanted.size) return 'unknown_rower';
        if (found.some((r) => r.archivedAt !== null && !beforeRowers.has(r.id))) {
          return 'archived_rower';
        }
        const addedRowers = [...wanted].filter((r) => !beforeRowers.has(r));
        const addCrew = body.data.crew && !before.some((b) => b.scope === 'crew');

        if (removed.length > 0) {
          await tx.delete(momentShare).where(
            inArray(
              momentShare.id,
              removed.map((b) => b.id),
            ),
          );
        }
        const additions = [
          ...addedRowers.map((rowerId) => ({ scope: 'rower' as const, rowerId })),
          ...(addCrew ? [{ scope: 'crew' as const, rowerId: null }] : []),
        ];
        if (additions.length > 0) {
          await tx.insert(momentShare).values(
            additions.map((a) => ({
              clubId: tenant.clubId,
              momentId: m.id,
              ...a,
              sharedByUserId: tenant.userId,
            })),
          );
        }
        const changes = [
          ...additions.map((a) => ({ rowerId: a.rowerId, action: 'shared' as const })),
          ...removed.map((b) => ({ rowerId: b.rowerId, action: 'unshared' as const })),
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
        const now = (await momentSharesOf(tx, videoId, tenant)).find((x) => x.frame === frame);
        return now ?? { frame, crew: null, rowers: [] };
      },
    );
    if (result === null) return notFound(reply);
    if (result === 'no_moment') return reply.code(409).send({ error: result });
    if (result === 'not_yours') return reply.code(403).send({ error: result });
    if (typeof result === 'string') return reply.code(400).send({ error: result });
    return result;
  });

  done();
};
