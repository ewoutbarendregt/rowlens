import { describe, expect, it } from 'vitest';
import { moments } from './moments.ts';

describe('moments', () => {
  it('groups notes and drawings per frame, in frame order', () => {
    const got = moments([
      { id: 'a', frame: 40, kind: 'angle' },
      { id: 'b', frame: 12, kind: 'note' },
      { id: 'c', frame: 40, kind: 'arrow' },
      { id: 'd', frame: 40, kind: 'note' },
      { id: 'e', frame: 12, kind: 'line' },
    ]);
    expect(
      got.map((m) => [m.frame, m.drawings.map((d) => d.id), m.notes.map((n) => n.id)]),
    ).toEqual([
      [12, ['e'], ['b']],
      [40, ['a', 'c'], ['d']],
    ]);
  });

  it('is empty without annotations', () => {
    expect(moments([])).toEqual([]);
  });
});
