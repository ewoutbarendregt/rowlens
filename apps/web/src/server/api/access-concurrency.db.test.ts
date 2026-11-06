import { randomUUID } from 'node:crypto';
import { withBasePath } from '../../shared/base-path.ts';
import { expect, inject, it } from 'vitest';
import { buildApp } from '../app.ts';
import { loadConfig } from '../config.ts';
import { connectDatabase } from '../db/client.ts';
import { asOwner } from '../db/test/fixtures.ts';
import type { LoginMail } from '../auth/mail.ts';

it('serializes mutually competing admin demotions and rechecks the waiting actor', async () => {
  const slug = `race-${randomUUID()}`;
  const a = `a-${slug}@example.com`;
  const b = `b-${slug}@example.com`;
  const [club] = await asOwner<{ id: string }>(
    `insert into club(slug,name) values($1,'Race') returning id`,
    [slug],
  );
  const grants = await asOwner<{ id: string; email: string }>(
    `insert into club_access(club_id,email,roles) values($1,$2,ARRAY['admin']),($1,$3,ARRAY['admin']) returning id,email`,
    [club?.id, a, b],
  );
  const handle = connectDatabase(inject('appUrl'), 4);
  const mails: LoginMail[] = [];
  const app = await buildApp({
    config: loadConfig({
      PUBLIC_ORIGIN: 'https://trustable.nl',
      PILOT_CLUB_SLUG: slug,
      AUTH_ALLOWED_EMAILS: `${a},${b}`,
      OTP_PEPPER: 'e'.repeat(64),
    }),
    database: handle.db,
    clientDir: null,
    logger: false,
    deliverLoginCode: (mail) => {
      mails.push(mail);
      return Promise.resolve();
    },
  });
  let ip = 0;
  const send = (path: string, cookie: string, body: unknown) =>
    app.inject({
      method: 'POST',
      url: withBasePath('/projects/rowlens', path),
      headers: {
        origin: 'https://trustable.nl',
        'x-forwarded-for': `192.0.2.${String(++ip)}`,
        cookie,
        'content-type': 'application/json',
      },
      payload: JSON.stringify(body),
    });
  const login = async (email: string) => {
    await send('/api/auth/otp', '', { email });
    const code = mails.find((m) => m.email === email)?.code;
    const response = await send('/api/auth/verify', '', { email, code });
    expect(response.statusCode, response.body).toBe(204);
    return response.cookies.map((c) => `${c.name}=${c.value}`).join('; ');
  };
  try {
    const ca = await login(a);
    const cb = await login(b);
    const demote = (cookie: string, email: string) =>
      app.inject({
        method: 'PATCH',
        url: withBasePath(
          '/projects/rowlens',
          `/api/admin/access/${grants.find((g) => g.email === email)?.id ?? ''}`,
        ),
        headers: {
          origin: 'https://trustable.nl',
          'sec-fetch-site': 'same-origin',
          'x-forwarded-for': `192.0.2.${String(++ip)}`,
          cookie,
          'x-csrf-token': /rowlens_csrf=([^;]+)/.exec(cookie)?.[1] ?? '',
          'content-type': 'application/json',
        },
        payload: JSON.stringify({ roles: ['rower'] }),
      });
    const results = await Promise.all([demote(ca, b), demote(cb, a)]);
    expect(results.map((r) => r.statusCode).sort()).toEqual([204, 404]);
    const remaining = await asOwner<{ roles: string[] }>(
      `select roles from membership where club_id=$1`,
      [club?.id],
    );
    expect(remaining.filter((r) => r.roles.includes('admin'))).toHaveLength(1);
    const access = await asOwner<{ roles: string[] }>(
      `select roles from club_access where club_id=$1`,
      [club?.id],
    );
    expect(access.filter((r) => r.roles.includes('admin'))).toHaveLength(1);
  } finally {
    await app.close();
    await handle.close();
  }
});
