import { describe, expect, it } from 'vitest';
import { BOAT_CLASS_NAMES, COX_SEAT, seatRole, seatsOf } from './boats.ts';

describe('seatsOf', () => {
  it.each([
    ['C1x', [1]],
    ['C2x', [1, 2]],
    ['C4x+', [1, 2, 3, 4, COX_SEAT]],
    ['8+', [1, 2, 3, 4, 5, 6, 7, 8, COX_SEAT]],
    ['4-', [1, 2, 3, 4]],
  ] as const)('%s → %j', (boat, seats) => {
    expect(seatsOf(boat)).toEqual(seats);
  });

  it('lists coastal classes first', () => {
    expect(BOAT_CLASS_NAMES.slice(0, 5)).toEqual(['C1x', 'C2x', 'C2x+', 'C4x+', 'C4+']);
  });
});

describe('seatRole', () => {
  it('names bow, stroke, cox and the single sculler', () => {
    expect(seatRole('C4x+', 1)).toBe('bow');
    expect(seatRole('C4x+', 2)).toBe('middle');
    expect(seatRole('C4x+', 4)).toBe('stroke');
    expect(seatRole('C4x+', COX_SEAT)).toBe('cox');
    expect(seatRole('C1x', 1)).toBe('single');
    expect(seatRole('2x', 2)).toBe('stroke');
  });
});
