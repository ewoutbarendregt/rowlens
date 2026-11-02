import { describe, expect, it } from 'vitest';
import { videoDisplayName } from './displayName.ts';

const AMS = 'Europe/Amsterdam';

describe('videoDisplayName', () => {
  it('is [session]-[#]-[start]-[length]', () => {
    expect(
      videoDisplayName(
        {
          sessionTitle: 'Zaterdag CX4+',
          seq: 2,
          recordedAt: '2026-10-31T08:48:30.000Z',
          durationMs: 86_798,
        },
        AMS,
      ),
    ).toBe('Zaterdag CX4+-2-09:48-1:27');
  });

  it('uses 24-hour time and pads seconds', () => {
    expect(
      videoDisplayName(
        { sessionTitle: 'Avond', seq: 1, recordedAt: '2026-06-01T17:05:00Z', durationMs: 5_000 },
        AMS,
      ),
    ).toBe('Avond-1-19:05-0:05');
  });

  it('marks what is not known yet', () => {
    expect(
      videoDisplayName({ sessionTitle: 'S', seq: 3, recordedAt: null, durationMs: null }, AMS),
    ).toBe('S-3-??:??-?:??');
    expect(
      videoDisplayName(
        { sessionTitle: 'S', seq: null, recordedAt: 'nonsense', durationMs: 60_000 },
        AMS,
      ),
    ).toBe('S-?-??:??-1:00');
  });
});
