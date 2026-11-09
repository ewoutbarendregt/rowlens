import { count, desc, eq, sql } from 'drizzle-orm';
import type { Database, Tx } from '../db/client.ts';
import { rower, rowingSession, video } from '../db/schema.ts';
import { withTenant, type TenantContext } from '../db/tenant.ts';
import { lineupsOf } from '../api/lineups.ts';
export interface SessionCursor {
  date: string;
  createdAt: string;
  id: string;
}
// A type, not an interface: `execute` wants a record type for its rows.
type Member = {
  user_id: string;
  email: string;
  roles: string[];
  first_name: string | null;
  last_name: string | null;
};

/** This club's members by user id (rowlens_club_members only sees the current club). */
export async function members(tx: Tx) {
  const result = await tx.execute<Member>(
    sql`select user_id, email, roles, first_name, last_name from rowlens_club_members()`,
  );
  return new Map(result.rows.map((m) => [m.user_id, m]));
}

/** How a member is named on a session: their name, else their e-mail address (2026-11-03). */
export function nameOf(member: Member | undefined): string | null {
  if (member === undefined) return null;
  return member.first_name !== null && member.last_name !== null
    ? `${member.first_name} ${member.last_name}`
    : member.email;
}

/**
 * Per session: the notes meant for the viewer (assigned or shared to their linked roster entry, or
 * shared with a crew they rowed in). One grouped query for the whole list (#108).
 */
async function notesForMe(tx: Tx, mine: string[]): Promise<Map<string, number>> {
  if (mine.length === 0) return new Map();
  const ids = sql`array[${sql.join(
    mine.map((id) => sql`${id}::uuid`),
    sql`, `,
  )}]`;
  const result = await tx.execute<{ session_id: string; n: number }>(sql`
    select v.session_id, count(distinct m.id)::int as n
    from moment m
    join video v on v.id = m.video_id
    where exists (select 1 from moment_rower mr where mr.moment_id = m.id and mr.rower_id = any(${ids}))
       or exists (select 1 from moment_share s where s.moment_id = m.id and s.scope = 'rower'
                  and s.rower_id = any(${ids}))
       or exists (select 1 from moment_share s join lineup_seat ls on ls.session_id = v.session_id
                  where s.moment_id = m.id and s.scope = 'crew' and ls.rower_id = any(${ids}))
    group by v.session_id`);
  return new Map(result.rows.map((r) => [r.session_id, r.n]));
}

export async function listSessions(
  db: Database,
  tenant: TenantContext,
  limit = 2147483647,
  before?: SessionCursor,
) {
  return withTenant(db, tenant, async (tx) => {
    const rows = await tx
      .select({
        id: rowingSession.id,
        title: rowingSession.title,
        date: rowingSession.sessionDate,
        createdAt: rowingSession.createdAt,
        cursorCreatedAt: sql<string>`to_char(${rowingSession.createdAt} at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"')`,
        boatType: rowingSession.boatType,
        createdByUserId: rowingSession.createdByUserId,
        canEdit: sql<boolean>`rowlens_can_edit_session(${rowingSession.id})`,
        videoCount: count(video.id),
      })
      .from(rowingSession)
      .leftJoin(video, eq(video.sessionId, rowingSession.id))
      .where(
        before
          ? sql`(${rowingSession.sessionDate},${rowingSession.createdAt},${rowingSession.id}) < (${before.date}::date,${before.createdAt}::timestamptz,${before.id}::uuid)`
          : undefined,
      )
      .groupBy(rowingSession.id)
      .orderBy(
        desc(rowingSession.sessionDate),
        desc(rowingSession.createdAt),
        desc(rowingSession.id),
      )
      .limit(limit);
    const mine =
      tenant.userId === null
        ? []
        : (
            await tx.select({ id: rower.id }).from(rower).where(eq(rower.userId, tenant.userId))
          ).map((r) => r.id);
    const lineups = await lineupsOf(
      tx,
      rows.map((r) => r.id),
    );
    const forMe = await notesForMe(tx, mine);
    const club = await members(tx);
    return rows.map(({ createdByUserId, ...r }) => {
      const lineup = lineups.get(r.id) ?? [];
      return {
        ...r,
        createdByMe: tenant.userId !== null && createdByUserId === tenant.userId,
        creatorName: createdByUserId === null ? null : nameOf(club.get(createdByUserId)),
        lineup: lineup.map((s) => ({
          seat: s.seat,
          rowerId: s.rower.id,
          displayName: s.rower.displayName,
        })),
        mySeat: lineup.find((s) => mine.includes(s.rower.id))?.seat ?? null,
        notesForMe: forMe.get(r.id) ?? 0,
      };
    });
  });
}
