import { and, asc, desc, eq, inArray, isNotNull, ne, sql } from 'drizzle-orm';
import type { FastifyPluginCallback } from 'fastify';
import { z } from 'zod';
import { BOAT_CLASS_NAMES, seatsOf } from '../../shared/boats.ts';
import { lockEditableSession } from '../repositories/training-access.ts';
import type { Tx } from '../db/client.ts';
import { lineupSeat, rower, rowingSession } from '../db/schema.ts';
import { withTenant } from '../db/tenant.ts';
import { type ClubRouteOptions, notFound, tenantOf } from './route-helpers.ts';

const idParam = z.object({ id: z.uuid() });
const lineupBody = z.object({
  boatType: z.enum(BOAT_CLASS_NAMES).nullable(),
  seats: z.array(z.object({ seat: z.int().min(0).max(8), rowerId: z.uuid() })).max(9),
});
const recentQuery = z.object({
  except: z.uuid().optional(),
  limit: z.coerce.number().int().min(1).max(10).default(5),
});

export interface LineupSeat {
  seat: number;
  rower: { id: string; displayName: string; archived: boolean };
}

/** The lineups of some sessions, seats in bow-to-stroke order (the cox, seat 0, last). */
export async function lineupsOf(tx: Tx, sessionIds: string[]): Promise<Map<string, LineupSeat[]>> {
  const result = new Map<string, LineupSeat[]>();
  if (sessionIds.length === 0) return result;
  const rows = await tx
    .select({
      sessionId: lineupSeat.sessionId,
      seat: lineupSeat.seat,
      rowerId: rower.id,
      displayName: rower.displayName,
      archivedAt: rower.archivedAt,
    })
    .from(lineupSeat)
    .innerJoin(rower, eq(rower.id, lineupSeat.rowerId))
    .where(inArray(lineupSeat.sessionId, sessionIds))
    .orderBy(asc(lineupSeat.seat));
  for (const row of rows) {
    const seats = result.get(row.sessionId) ?? [];
    seats.push({
      seat: row.seat,
      rower: { id: row.rowerId, displayName: row.displayName, archived: row.archivedAt !== null },
    });
    result.set(row.sessionId, seats);
  }
  for (const seats of result.values()) {
    // Seat 0 (cox) sorts first in SQL; it belongs after the stroke.
    seats.sort((a, b) => (a.seat === 0 ? 99 : a.seat) - (b.seat === 0 ? 99 : b.seat));
  }
  return result;
}

export async function lineupOf(tx: Tx, sessionId: string): Promise<LineupSeat[]> {
  return (await lineupsOf(tx, [sessionId])).get(sessionId) ?? [];
}

/** Merging two roster entries (#104): `from`'s seats go to `into`, unless `into` already sat there. */
export async function mergeLineupSeats(tx: Tx, from: string, into: string): Promise<void> {
  const shared = tx
    .select({ sessionId: lineupSeat.sessionId })
    .from(lineupSeat)
    .where(eq(lineupSeat.rowerId, into));
  await tx
    .delete(lineupSeat)
    .where(and(eq(lineupSeat.rowerId, from), inArray(lineupSeat.sessionId, shared)));
  await tx.update(lineupSeat).set({ rowerId: into }).where(eq(lineupSeat.rowerId, from));
}

type SaveError = 'invalid_lineup' | 'unknown_rower' | 'archived_rower';

/**
 * Session lineups (#103): who sat in which seat. Saved as a whole (replace), so the page can't leave
 * half a lineup; checked against the boat class in shared/boats.ts and the club roster.
 */
export const lineupRoutes: FastifyPluginCallback<ClubRouteOptions> = (app, opts, done) => {
  const { db, guard } = opts;

  app.addHook('onSend', async (_req, reply) => {
    void reply.header('cache-control', 'private, no-store');
  });

  app.put('/api/sessions/:id/lineup', { preHandler: guard }, async (req, reply) => {
    const params = idParam.safeParse(req.params);
    if (!params.success) return notFound(reply);
    const body = lineupBody.safeParse(req.body);
    if (!body.success) return reply.code(400).send({ error: 'invalid_lineup' });
    const { boatType, seats } = body.data;
    const allowed = new Set(boatType === null ? [] : seatsOf(boatType));
    const seatNumbers = new Set(seats.map((s) => s.seat));
    const rowerIds = new Set(seats.map((s) => s.rowerId));
    if (
      seatNumbers.size !== seats.length ||
      rowerIds.size !== seats.length ||
      seats.some((s) => !allowed.has(s.seat))
    ) {
      return reply.code(400).send({ error: 'invalid_lineup' });
    }

    const tenant = tenantOf(req);
    const result = await withTenant(
      db,
      tenant,
      async (tx): Promise<LineupSeat[] | SaveError | null> => {
        if (!(await lockEditableSession(tx, params.data.id))) return null;
        const [session] = await tx
          .select({ id: rowingSession.id })
          .from(rowingSession)
          .where(eq(rowingSession.id, params.data.id))
          .for('update');
        if (session === undefined) return null;
        const before = new Set((await lineupOf(tx, session.id)).map((s) => s.rower.id));
        const found =
          rowerIds.size === 0
            ? []
            : await tx
                .select({ id: rower.id, archivedAt: rower.archivedAt })
                .from(rower)
                .where(inArray(rower.id, [...rowerIds]));
        if (found.length !== rowerIds.size) return 'unknown_rower';
        if (opts.unifiedUsers)
          for (const id of rowerIds) {
            if (before.has(id)) continue;
            const valid = await tx.execute<{ ok: boolean }>(
              sql`select rowlens_account_target(${id}) as ok`,
            );
            if (!valid.rows[0]?.ok) return 'unknown_rower';
          }
        // An archived rower may stay where they sat, but can't be put in a seat anew.
        if (found.some((r) => r.archivedAt !== null && !before.has(r.id))) return 'archived_rower';

        await tx.delete(lineupSeat).where(eq(lineupSeat.sessionId, session.id));
        if (seats.length > 0) {
          await tx.insert(lineupSeat).values(
            seats.map((s) => ({
              clubId: tenant.clubId,
              sessionId: session.id,
              seat: s.seat,
              rowerId: s.rowerId,
            })),
          );
        }
        await tx.update(rowingSession).set({ boatType }).where(eq(rowingSession.id, session.id));
        return lineupOf(tx, session.id);
      },
    );
    if (result === null) return notFound(reply);
    if (typeof result === 'string') return reply.code(400).send({ error: result });
    return { boatType, lineup: result };
  });

  /** The latest lineups, for "copy from an earlier session". */
  app.get('/api/lineups/recent', { preHandler: guard }, async (req) => {
    const query = recentQuery.safeParse(req.query);
    const { except, limit } = query.success ? query.data : { except: undefined, limit: 5 };
    const sessions = await withTenant(db, tenantOf(req), async (tx) => {
      const rows = await tx
        .selectDistinct({
          id: rowingSession.id,
          title: rowingSession.title,
          date: rowingSession.sessionDate,
          createdAt: rowingSession.createdAt,
          boatType: rowingSession.boatType,
        })
        .from(rowingSession)
        .innerJoin(lineupSeat, eq(lineupSeat.sessionId, rowingSession.id))
        .where(
          and(
            isNotNull(rowingSession.boatType),
            except === undefined ? undefined : ne(rowingSession.id, except),
          ),
        )
        .orderBy(desc(rowingSession.sessionDate), desc(rowingSession.createdAt))
        .limit(limit);
      const lineups = await lineupsOf(
        tx,
        rows.map((r) => r.id),
      );
      return rows.map((r) => ({ ...r, lineup: lineups.get(r.id) ?? [] }));
    });
    return { sessions };
  });

  done();
};
