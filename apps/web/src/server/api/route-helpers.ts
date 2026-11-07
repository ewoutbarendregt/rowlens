import type { FastifyReply, FastifyRequest } from 'fastify';
import type { Database } from '../db/client.ts';
import type { TenantContext } from '../db/tenant.ts';
import type { MediaStore } from '../media/store.ts';

export interface MediaLimits {
  /** All clubs' videos together (ADR-0006: 30 GB). */
  capBytes: number;
  /** One upload (ADR-0006: 4 GB). */
  maxUploadBytes: number;
  /** Uploads pause above this share of the (shared) disk in use (ADR-0006: 85 %). */
  diskPauseRatio: number;
}

export interface ClubRouteOptions {
  unifiedUsers?: boolean;
  db: Database;
  guard: (req: FastifyRequest, reply: FastifyReply) => Promise<FastifyReply | undefined>;
  /** `null` without MEDIA_DIR: uploads are off. */
  media: MediaStore | null;
  limits: MediaLimits;
  basePath: string;
}

/** The guard ran as preHandler, so a missing tenant is a wiring bug, not a client error. */
export function tenantOf(req: FastifyRequest): TenantContext {
  if (req.tenant === null) throw new Error('club route without tenant: guard missing');
  return req.tenant;
}

/** The same 404 as an unknown route, so nothing reveals whether an id exists in another club. */
export function notFound(reply: FastifyReply): FastifyReply {
  reply.callNotFound();
  return reply;
}
