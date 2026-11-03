import { describe, expect, it } from 'vitest';
import { formatCreatedDay, formatCreatedTime } from './strings.ts';

describe('formatCreatedTime', () => {
  it('shows the creation timestamp as local 24-hour time', () => {
    expect(formatCreatedTime('2026-11-01T20:07:00Z', 'Europe/Amsterdam', 'nl')).toBe('21:07');
    expect(formatCreatedTime('2026-06-01T18:05:00Z', 'Europe/Amsterdam', 'en')).toBe('20:05');
  });
});

describe('formatCreatedDay', () => {
  const now = new Date('2026-11-03T12:00:00Z');
  it('shows the local day it was made, with the year only when it is not this year', () => {
    // 23:30 UTC on 1 November is already 2 November in Amsterdam.
    expect(formatCreatedDay('2026-11-01T23:30:00Z', 'Europe/Amsterdam', 'nl', now)).toBe('2 nov');
    expect(formatCreatedDay('2026-11-01T10:00:00Z', 'Europe/Amsterdam', 'en', now)).toBe('1 Nov');
    expect(formatCreatedDay('2025-06-01T10:00:00Z', 'Europe/Amsterdam', 'nl', now)).toBe(
      '1 jun 2025',
    );
  });
});
