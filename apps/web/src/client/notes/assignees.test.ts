import { describe, expect, it } from 'vitest';
import { framesFor, lineupSuggestions, rowersWithNotes } from './assignees.ts';

const r = (id: string, archived = false) => ({ id, displayName: id.toUpperCase(), archived });

describe('lineupSuggestions', () => {
  it('lists the lineup with seat names and leaves archived rowers out', () => {
    const names = (role: string, seat: number) => `${role}${String(seat)}`;
    expect(
      lineupSuggestions(
        'C4x+',
        [
          { seat: 1, rower: r('a') },
          { seat: 4, rower: r('d') },
          { seat: 0, rower: r('cox') },
          { seat: 2, rower: r('b', true) },
        ],
        names,
      ),
    ).toEqual([
      { id: 'a', label: 'bow1' },
      { id: 'd', label: 'stroke4' },
      { id: 'cox', label: 'cox0' },
    ]);
    expect(lineupSuggestions(null, [{ seat: 1, rower: r('a') }], names)).toEqual([]);
  });
});

describe('framesFor and rowersWithNotes', () => {
  const moments = [
    { frame: 10, rowers: [r('b'), r('a')] },
    { frame: 20, rowers: [r('a')] },
    { frame: 30, rowers: [] },
  ];

  it('filters frames by rower, or none when nobody is chosen', () => {
    expect(framesFor(moments, 'a')).toEqual(new Set([10, 20]));
    expect(framesFor(moments, 'b')).toEqual(new Set([10]));
    expect(framesFor(moments, null)).toBeNull();
  });

  it('lists each rower with a note once, by name', () => {
    expect(rowersWithNotes(moments)).toEqual([
      { id: 'a', displayName: 'A' },
      { id: 'b', displayName: 'B' },
    ]);
  });
});
