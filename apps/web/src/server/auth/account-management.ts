import { randomUUID } from 'node:crypto';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { sql } from 'drizzle-orm';
import { z } from 'zod';
import {
  directoryQuerySchema,
  directoryRowSchema,
  queryDirectory,
} from '../../shared/user-directory.ts';
import type { Database } from '../db/client.ts';
import { withTenant } from '../db/tenant.ts';
import { tenantOf } from '../api/route-helpers.ts';
import type { DeliverLoginCode } from './mail.ts';
import { absoluteUrl } from '../../shared/base-path.ts';
import { hmac, newCode } from './crypto.ts';
interface Options {
  db: Database;
  guard: (req: FastifyRequest, reply: FastifyReply) => Promise<unknown>;
  accountGuard: Options['guard'];
  pepper: string;
  reserved: string[];
  deliver?: DeliverLoginCode;
  generateCode?: () => string;
  origin: string;
  basePath: string;
  hit: (kind: string, key: string, seconds: number, limit: number) => Promise<boolean>;
}
export const managementRoutes = [
  '/api/manage/users/query',
  '/api/manage/users/:id',
  '/api/manage/users/:id/email-change',
  '/api/manage/email-changes/:id/confirm',
  '/api/manage/users/:id/authority',
  '/api/manage/applications',
];
export function accountManagement(app: FastifyInstance, o: Options) {
  const reserved = sql`ARRAY(SELECT jsonb_array_elements_text(${JSON.stringify(o.reserved)}::jsonb))`;
  const run = async <T>(req: FastifyRequest, q: Parameters<Database['execute']>[0]) =>
    withTenant(
      o.db,
      tenantOf(req),
      async (tx) => (await tx.execute<{ value: T }>(q)).rows[0]?.value,
    );
  const guard = async (req: FastifyRequest, reply: FastifyReply) => {
    await o.guard(req, reply);
    if (reply.sent) return;
    if (!req.roles?.includes('admin')) return reply.code(404).send();
  };
  const projection = async (req: FastifyRequest) => {
    const rows = directoryRowSchema
      .array()
      .parse(
        await run(
          req,
          sql`select rowlens_manage_directory() as value, rowlens_audit_platform('user.directory.read','directory')`,
        ),
      );
    return rows.map((r) => ({ ...r, serverManaged: o.reserved.includes(r.email) }));
  };
  app.post('/api/manage/users/query', { preHandler: guard }, async (req, reply) => {
    const q = directoryQuerySchema.safeParse(req.body);
    if (!q.success) return reply.code(400).send({ error: 'invalid_query' });
    return queryDirectory(await projection(req), q.data);
  });
  app.get('/api/manage/users/:id', { preHandler: guard }, async (req, reply) => {
    const p = z.object({ id: z.uuid() }).safeParse(req.params);
    if (!p.success) return reply.code(404).send();
    const row = (await projection(req)).find((r) => r.id === p.data.id);
    return row ?? reply.code(404).send();
  });
  app.get('/api/manage/applications', { preHandler: guard }, (req) =>
    run(req, sql`select rowlens_manage_applications() as value`),
  );
  app.post('/api/manage/users/:id/authority', { preHandler: guard }, async (req, reply) => {
    const p = z.object({ id: z.uuid() }).safeParse(req.params),
      b = z.object({ enabled: z.boolean(), expected: z.boolean() }).strict().safeParse(req.body);
    if (!p.success || !b.success) return reply.code(400).send({ error: 'invalid' });
    const result = await run<string>(
      req,
      sql`select rowlens_set_platform_authority(${p.data.id},${b.data.enabled},${b.data.expected}) as value`,
    );
    return result === 'ok'
      ? reply.code(204).send()
      : reply
          .code(result === 'forbidden' || result === 'not_found' ? 404 : 409)
          .send({ error: result });
  });
  app.post('/api/manage/users/:id/email-change', { preHandler: guard }, async (req, reply) => {
    const p = z.object({ id: z.uuid() }).safeParse(req.params),
      b = z
        .object({
          email: z
            .email()
            .max(254)
            .transform((s) => s.toLowerCase()),
          revision: z.int().nonnegative(),
          language: z.enum(['nl', 'en']),
        })
        .strict()
        .safeParse(req.body);
    if (!p.success || !b.success) return reply.code(400).send({ error: 'invalid' });
    if (!(await o.hit('identity-request', tenantOf(req).userId ?? '', 3600, 10)))
      return reply.code(429).send({ error: 'rate_limit' });
    const id = randomUUID(),
      code = o.generateCode?.() ?? newCode();
    const hash = hmac(o.pepper, `email-change:${id}`, code);
    const result = await run<string>(
      req,
      sql`select rowlens_request_email_change(${id},${p.data.id},${b.data.email},${b.data.revision},${hash},${reserved}) as value`,
    );
    if (result !== 'ok')
      return reply
        .code(result === 'forbidden' || result === 'not_found' ? 404 : 409)
        .send({ error: result });
    try {
      if (o.deliver)
        await o.deliver({
          email: b.data.email,
          code,
          locale: b.data.language,
          loginUrl: absoluteUrl(o.origin, o.basePath, `/email-change/${id}`),
          purpose: 'email-change',
        });
      else req.log.info({ code, requestId: id }, 'development email-change code');
    } catch {
      return reply.code(503).send({ error: 'mail_failed' });
    }
    return { id };
  });
  const confirm = async (req: FastifyRequest, reply: FastifyReply) => {
    const p = z.object({ id: z.uuid() }).safeParse(req.params),
      b = z
        .object({ code: z.string().regex(/^\d{6}$/) })
        .strict()
        .safeParse(req.body);
    if (!p.success || !b.success) return reply.code(400).send({ error: 'invalid' });
    if (!(await o.hit('identity-confirm', req.ip, 900, 30)))
      return reply.code(429).send({ error: 'rate_limit' });
    try {
      const result = await run<string>(
        req,
        sql`select rowlens_confirm_email_change(${p.data.id},${hmac(o.pepper, `email-change:${p.data.id}`, b.data.code)},${reserved}) as value`,
      );
      return result === 'ok'
        ? await reply.code(204).send()
        : await reply
            .code(result === 'forbidden' || result === 'not_found' ? 404 : 409)
            .send({ error: result });
    } catch (error) {
      if ((error as { code?: string }).code === '23505')
        return reply.code(409).send({ error: 'exists' });
      throw error;
    }
  };
  app.post('/api/manage/email-changes/:id/confirm', { preHandler: guard }, confirm);
  app.post('/api/account/email-changes/:id/confirm', { preHandler: o.accountGuard }, confirm);
  app.get('/api/account/email-changes/:id', { preHandler: o.accountGuard }, async (req, reply) => {
    const p = z.object({ id: z.uuid() }).safeParse(req.params);
    if (!p.success) return reply.code(404).send();
    return (
      (await run(req, sql`select rowlens_email_change_view(${p.data.id}) as value`)) ??
      reply.code(404).send()
    );
  });
}
