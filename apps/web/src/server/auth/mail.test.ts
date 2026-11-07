import { describe, expect, it } from 'vitest';
import { inviteMessage, loginMessage, smtpTransportOptions } from './mail.ts';

const smtp = {
  host: 'smtp.resend.com',
  user: 'resend',
  password: 're_test',
  from: 'RowLens <rowlens@trustable.nl>',
};

describe('smtpTransportOptions', () => {
  it('requires STARTTLS on 587 so the key never goes over plain text', () => {
    const options = smtpTransportOptions({ ...smtp, port: 587 });
    expect([options.secure, options.requireTLS]).toEqual([false, true]);
  });

  it('uses implicit TLS on 465', () => {
    const options = smtpTransportOptions({ ...smtp, port: 465 });
    expect([options.secure, options.requireTLS]).toEqual([true, false]);
  });

  it('gives up on an unreachable server within seconds', () => {
    const options = smtpTransportOptions({ ...smtp, port: 587 });
    expect(options.connectionTimeout).toBeLessThanOrEqual(10_000);
    expect(options.greetingTimeout).toBeLessThanOrEqual(10_000);
  });
});

describe('loginMessage', () => {
  it.each([
    ['nl' as const, 'Je RowLens-inlogcode', '10 minuten', 'één keer'],
    ['en' as const, 'Your RowLens login code', '10 minutes', 'once'],
  ])('builds HTML and text in %s with an absolute base-path link', (locale, subject, ttl, once) => {
    const message = loginMessage({
      email: 'coach@example.com',
      code: '012345',
      locale,
      loginUrl: 'https://trustable.nl/projects/rowlens/',
    });
    expect(message.subject).toBe(subject);
    expect(message.text).toContain('012345');
    expect(message.text).toContain(ttl);
    expect(message.text).toContain(once);
    expect(message.text).toContain('https://trustable.nl/projects/rowlens/');
    expect(message.html).toContain('>012345<');
    expect(message.html).toContain('href="https://trustable.nl/projects/rowlens/"');
  });
});

describe('inviteMessage', () => {
  it('says it in Dutch and English with an absolute link, and escapes the club name', () => {
    const message = inviteMessage({
      email: 'rower@example.com',
      clubName: 'Roeiclub <Test> & Co',
      loginUrl: 'https://trustable.nl/projects/rowlens/',
    });
    expect(message.subject).toContain('Toegang tot RowLens');
    expect(message.text).toContain('Je hebt toegang');
    expect(message.text).toContain('You now have access');
    expect(message.text).toContain('https://trustable.nl/projects/rowlens/');
    expect(message.html).toContain('Roeiclub &#60;Test&#62; &#38; Co');
    expect(message.html).not.toContain('<Test>');
  });
});

it.each(['nl', 'en'] as const)('uses a distinct identity-verification message in %s', (locale) => {
  const m = loginMessage({
    email: 'new@example.test',
    code: '012345',
    locale,
    loginUrl: 'https://example.test/projects/rowlens/users',
    purpose: 'email-change',
  });
  expect(m.subject).toContain(locale === 'nl' ? 'e-mailadres' : 'email');
  expect(m.text).toContain('012345');
  expect(m.text).toContain(locale === 'nl' ? 'bestaande' : 'existing');
});
