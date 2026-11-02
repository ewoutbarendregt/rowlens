import { describe, expect, it } from 'vitest';
import { loginMessage } from './mail.ts';

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
