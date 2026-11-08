import { describe, it, expect } from 'vitest';
import { admissionMessage, type AdmissionNotice } from './admission-mail.ts';
const notice: AdmissionNotice = {
  id: '11111111-1111-4111-8111-111111111111',
  applicationId: '22222222-2222-4222-8222-222222222222',
  lease: '33333333-3333-4333-8333-333333333333',
  clubId: '44444444-4444-4444-8444-444444444444',
  clubName: '<Club & friends>',
  email: 'synthetic@example.test',
  locale: 'nl',
  global: false,
};
describe('admission notification', () => {
  it.each(['nl', 'en'] as const)(
    'has separate safe review links and escaped HTML (%s)',
    (locale) => {
      const m = admissionMessage(
        { ...notice, locale },
        'https://example.test',
        '/projects/rowlens',
      );
      expect(m.html).not.toContain('<Club & friends>');
      expect(m.html).toContain('&#60;Club &#38; friends&#62;');
      const links = [...m.text.matchAll(/https:\/\/\S+/g)].map((v) => new URL(v[0]));
      expect(links).toHaveLength(2);
      expect(links.map((u) => u.searchParams.get('decision'))).toEqual(['accept', 'reject']);
      expect(
        links.every(
          (u) =>
            u.pathname === `/projects/rowlens/admission/${notice.applicationId}` &&
            u.searchParams.get('club') === notice.clubId,
        ),
      ).toBe(true);
      expect(m.text).not.toContain(notice.email);
      expect(m.text).not.toContain(notice.lease);
    },
  );
  it('routes clubless decisions to platform scope without a fake tenant', () => {
    const m = admissionMessage(
      { ...notice, global: true, clubId: null, clubName: null },
      'https://example.test',
      '',
    );
    expect(m.text).toContain('scope=platform');
    expect(m.text).not.toContain('club=');
    expect(m.subject).toContain('zonder club');
  });
});
