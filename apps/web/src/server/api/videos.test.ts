import { describe, expect, it } from 'vitest';
import { parseRange } from './videos.ts';

describe('parseRange', () => {
  it.each([
    ['bytes=0-99', { start: 0, end: 99 }],
    ['bytes=100-', { start: 100, end: 999 }],
    ['bytes=-100', { start: 900, end: 999 }],
    ['bytes=900-5000', { start: 900, end: 999 }],
    ['bytes=-5000', { start: 0, end: 999 }],
    ['bytes=0-0', { start: 0, end: 0 }],
  ])('%s → %j', (header, want) => {
    expect(parseRange(header, 1000)).toEqual(want);
  });

  it.each(['bytes=1000-', 'bytes=500-100', 'bytes=-0'])('%s is unsatisfiable', (header) => {
    expect(parseRange(header, 1000)).toBe('unsatisfiable');
  });

  it.each([undefined, 'items=0-1', 'bytes=0-1,5-9', 'bytes=-', 'bytes=a-b'])(
    '%j means the whole file',
    (header) => {
      expect(parseRange(header, 1000)).toBeNull();
    },
  );
});
