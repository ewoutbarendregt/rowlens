import { and, asc, eq, sql } from 'drizzle-orm';
import type { FastifyPluginCallback } from 'fastify';
import { z } from 'zod';
import { annotation, video } from '../db/schema.ts';
import { withTenant } from '../db/tenant.ts';
import { can } from '../auth/can.ts';
import type { TenantContext } from '../db/tenant.ts';
import { accountAuthor } from './author.ts';
import { dropEmptyMoments, momentRowersOf, momentSharesOf } from './moments.ts';
import { type ClubRouteOptions, notFound, tenantOf } from './route-helpers.ts';

const idParam = z.object({ id: z.uuid() });
const frameParams = z.object({ id: z.uuid(), frame: z.coerce.number().int().min(0) });
const text = z.string().trim().min(1).max(2000);
// Only the pilot-code path (no account) names its author; with an account the server does (#106).
const author = z.string().trim().min(1).max(60).optional();
/** A point as a fraction of the picture (0–1 from the left and from the top), #60. */
const point = z.tuple([z.number().min(0).max(1), z.number().min(0).max(1)]);
const newAnnotation = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('note'), frame: z.int().min(0), body: text, authorName: author }),
  z.object({
    kind: z.enum(['line', 'arrow']),
    frame: z.int().min(0),
    points: z.tuple([point, point]),
    body: z.string().trim().max(2000).default(''),
    authorName: author,
  }),
  z.object({
    kind: z.literal('angle'),
    frame: z.int().min(0),
    // Arm, vertex, arm: the angle is measured at the middle point.
    points: z.tuple([point, point, point]),
    body: z.string().trim().max(2000).default(''),
    authorName: author,
  }),
]);
const editNote = z.object({ body: text });
/** Moving a saved drawing (#141): the new points, as when it was made. */
const editDrawing = z.object({ points: z.array(point).min(2).max(3) });
const editAnnotation = z.union([editNote, editDrawing]);

/** What the client may do with it (#40), instead of the author's account id. */
function present<T extends { authorUserId: string | null; trainingWritable: boolean }>(
  row: T,
  tenant: TenantContext,
) {
  const { authorUserId, trainingWritable, ...rest } = row;
  const viewer = { roles: tenant.roles, role: tenant.role ?? null, userId: tenant.userId };
  return {
    ...rest,
    mine: tenant.userId !== null && authorUserId === tenant.userId,
    canEdit: trainingWritable && can(viewer, { kind: 'edit_annotation', authorUserId }),
  };
}

const columns = {
  trainingWritable: sql<boolean>`rowlens_can_edit_video(${annotation.videoId})`,
  id: annotation.id,
  frame: annotation.frame,
  kind: annotation.kind,
  body: annotation.body,
  shape: annotation.shape,
  authorName: annotation.authorName,
  authorUserId: annotation.authorUserId,
  createdAt: annotation.createdAt,
  updatedAt: annotation.updatedAt,
};

/**
 * Notes (#59) and drawings (#60) pinned to a frame, behind the guard and RLS like everything in a
 * club. During the one-club phase every signed-in member may edit or delete them; author-only
 * permissions can be added when roles and crews become part of the product flow.
 */
export const annotationRoutes: FastifyPluginCallback<ClubRouteOptions> = (app, opts, done) => {
  const { db, guard } = opts;

  app.addHook('onSend', async (_req, reply) => {
    void reply.header('cache-control', 'private, no-store');
  });

  app.get('/api/videos/:id/annotations', { preHandler: guard }, async (req, reply) => {
    const params = idParam.safeParse(req.params);
    if (!params.success) return notFound(reply);
    const tenant = tenantOf(req);
    const rows = await withTenant(db, tenant, async (tx) => {
      const [v] = await tx.select({ id: video.id }).from(video).where(eq(video.id, params.data.id));
      if (v === undefined) return null;
      const annotations = await tx
        .select(columns)
        .from(annotation)
        .where(eq(annotation.videoId, v.id))
        .orderBy(asc(annotation.frame), asc(annotation.createdAt));
      return {
        annotations: annotations.map((a) => present(a, tenant)),
        moments: await momentRowersOf(tx, v.id),
        shares: await momentSharesOf(tx, v.id, tenant),
      };
    });
    return rows ?? notFound(reply);
  });

  app.post('/api/videos/:id/annotations', { preHandler: guard }, async (req, reply) => {
    const params = idParam.safeParse(req.params);
    if (!params.success) return notFound(reply);
    // Older clients send notes without a kind.
    const raw: unknown = req.body;
    const withKind =
      typeof raw === 'object' && raw !== null && !('kind' in raw) ? { ...raw, kind: 'note' } : raw;
    const body = newAnnotation.safeParse(withKind);
    if (!body.success) return reply.code(400).send({ error: 'invalid_annotation' });
    const tenant = tenantOf(req);
    const result = await withTenant(db, tenant, async (tx) => {
      const [v] = await tx
        .select({ id: video.id, status: video.status, frameCount: video.frameCount })
        .from(video)
        .where(and(eq(video.id, params.data.id), sql`rowlens_can_edit_video(${video.id})`));
      if (v === undefined) return 'not_found' as const;
      // Frames exist only once the worker has made the CFR renditions (ADR-0007).
      if (v.status !== 'ready' || v.frameCount === null) return 'not_ready' as const;
      if (body.data.frame >= v.frameCount) return 'bad_frame' as const;
      const authorName =
        tenant.userId === null
          ? body.data.authorName
          : await accountAuthor(tx, tenant.userId, req.accountName);
      if (authorName === undefined || authorName === null) return 'no_author' as const;
      const [row] = await tx
        .insert(annotation)
        .values({
          clubId: tenant.clubId,
          videoId: v.id,
          frame: body.data.frame,
          kind: body.data.kind,
          body: body.data.body,
          shape: body.data.kind === 'note' ? null : { points: body.data.points },
          authorName,
          authorUserId: tenant.userId,
        })
        .returning(columns);
      return row;
    });
    if (result === 'not_found' || result === undefined) return notFound(reply);
    if (result === 'not_ready') return reply.code(409).send({ error: 'video_not_ready' });
    if (result === 'bad_frame') return reply.code(400).send({ error: 'frame_out_of_range' });
    if (result === 'no_author') return reply.code(400).send({ error: 'invalid_annotation' });
    return reply.code(201).send(present(result, tenant));
  });

  app.patch('/api/annotations/:id', { preHandler: guard }, async (req, reply) => {
    const params = idParam.safeParse(req.params);
    if (!params.success) return notFound(reply);
    const body = editAnnotation.safeParse(req.body);
    if (!body.success) return reply.code(400).send({ error: 'invalid_annotation' });
    const tenant = tenantOf(req);
    const edit = body.data;
    // The kind decides what may change: a note its text, a drawing the points (#141). Who may
    // change it stays the database's call: its author, or a coach of the session (ADR-0013).
    const result = await withTenant(db, tenant, async (tx) => {
      const [current] = await tx
        .select({ kind: annotation.kind })
        .from(annotation)
        .where(eq(annotation.id, params.data.id));
      if (current === undefined) return { outcome: 'not_found' as const };
      if ('body' in edit) {
        if (current.kind !== 'note') return { outcome: 'wrong_kind' as const };
        const [row] = await tx
          .update(annotation)
          .set({ body: edit.body, updatedAt: new Date() })
          .where(and(eq(annotation.id, params.data.id), eq(annotation.kind, 'note')))
          .returning(columns);
        return row === undefined ? { outcome: 'not_found' as const } : { row };
      }
      // An angle is arm, vertex, arm; a line and an arrow are two points.
      const wanted = current.kind === 'angle' ? 3 : 2;
      if (current.kind === 'note' || edit.points.length !== wanted) {
        return { outcome: 'wrong_kind' as const };
      }
      const [row] = await tx
        .update(annotation)
        .set({ shape: { points: edit.points }, updatedAt: new Date() })
        .where(eq(annotation.id, params.data.id))
        .returning(columns);
      return row === undefined ? { outcome: 'not_found' as const } : { row };
    });
    if (result.outcome === 'not_found') return notFound(reply);
    if (result.outcome === 'wrong_kind')
      return reply.code(400).send({ error: 'invalid_annotation' });
    // A rower's update of someone else's note matches no row (RLS): the same 404 as unknown.
    return present(result.row, tenant);
  });

  // A whole moment (Ewout: one note per frame): every drawing and remark at that frame, in one
  // transaction, so it never half-disappears.
  app.delete(
    '/api/videos/:id/frames/:frame/annotations',
    { preHandler: guard },
    async (req, reply) => {
      const params = frameParams.safeParse(req.params);
      if (!params.success) return notFound(reply);
      const deleted = await withTenant(db, tenantOf(req), async (tx) => {
        const [v] = await tx
          .select({ id: video.id })
          .from(video)
          .where(and(eq(video.id, params.data.id), sql`rowlens_can_edit_video(${video.id})`));
        if (v === undefined) return null;
        const gone = await tx
          .delete(annotation)
          .where(and(eq(annotation.videoId, v.id), eq(annotation.frame, params.data.frame)))
          .returning({ id: annotation.id });
        // The note's rowers go with it (#105).
        await dropEmptyMoments(tx, v.id, params.data.frame);
        return gone;
      });
      if (deleted === null || deleted.length === 0) return notFound(reply);
      req.log.info(
        { videoId: params.data.id, frame: params.data.frame, count: deleted.length },
        'moment deleted',
      );
      return reply.code(204).send();
    },
  );

  app.delete('/api/annotations/:id', { preHandler: guard }, async (req, reply) => {
    const params = idParam.safeParse(req.params);
    if (!params.success) return notFound(reply);
    const deleted = await withTenant(db, tenantOf(req), async (tx) => {
      const gone = await tx
        .delete(annotation)
        .where(eq(annotation.id, params.data.id))
        .returning({ videoId: annotation.videoId, frame: annotation.frame });
      // The last drawing or remark at a frame takes the note (and its rowers) with it.
      for (const g of gone) await dropEmptyMoments(tx, g.videoId, g.frame);
      return gone;
    });
    if (deleted.length === 0) return notFound(reply);
    return reply.code(204).send();
  });

  done();
};
