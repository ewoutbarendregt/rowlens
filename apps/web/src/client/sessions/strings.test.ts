import { describe, expect, it } from 'vitest';
import { formatCreatedTime } from './strings.ts';

describe('formatCreatedTime', () => {
  it('shows the creation timestamp as local 24-hour time', () => {
    expect(formatCreatedTime('2026-11-01T20:07:00Z', 'Europe/Amsterdam', 'nl')).toBe('21:07');
    expect(formatCreatedTime('2026-06-01T18:05:00Z', 'Europe/Amsterdam', 'en')).toBe('20:05');
  });
});
