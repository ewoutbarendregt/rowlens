import { describe, expect, it } from 'vitest';
import { type Action, can, seesAll, type Viewer } from './can.ts';

const ME = '00000000-0000-4000-8000-000000000001';
const OTHER = '00000000-0000-4000-8000-000000000002';

const viewers: Record<string, Viewer> = {
  admin: { role: 'admin', userId: ME },
  coach: { role: 'coach', userId: ME },
  rower: { role: 'rower', userId: ME },
  pilot: { role: null, userId: null },
};

// Every role × action × relation, so a change to one rule shows up as one failing row.
const table: [string, Action, Record<keyof typeof viewers, boolean>][] = [
  ['access', { kind: 'manage_access' }, { admin: true, coach: false, rower: false, pilot: false }],
  [
    'stroke marks',
    { kind: 'mark_strokes' },
    { admin: true, coach: true, rower: false, pilot: true },
  ],
  [
    'session creator',
    { kind: 'assign_session_creator' },
    { admin: true, coach: false, rower: false, pilot: false },
  ],
  [
    'own annotation',
    { kind: 'edit_annotation', authorUserId: ME },
    { admin: true, coach: true, rower: true, pilot: true },
  ],
  [
    "someone else's annotation",
    { kind: 'edit_annotation', authorUserId: OTHER },
    { admin: true, coach: true, rower: false, pilot: true },
  ],
  [
    'annotation without author (older notes)',
    { kind: 'edit_annotation', authorUserId: null },
    { admin: true, coach: true, rower: false, pilot: true },
  ],
  [
    'own share',
    { kind: 'unshare', sharedByUserId: ME },
    { admin: true, coach: true, rower: true, pilot: true },
  ],
  [
    "someone else's share",
    { kind: 'unshare', sharedByUserId: OTHER },
    { admin: true, coach: true, rower: false, pilot: true },
  ],
  ['share', { kind: 'share' }, { admin: true, coach: true, rower: true, pilot: true }],
  ['assign', { kind: 'assign' }, { admin: true, coach: true, rower: true, pilot: true }],
  ['roster', { kind: 'manage_roster' }, { admin: true, coach: true, rower: true, pilot: true }],
  ['lineup', { kind: 'manage_lineup' }, { admin: true, coach: true, rower: true, pilot: true }],
  ['upload', { kind: 'upload' }, { admin: true, coach: true, rower: true, pilot: true }],
];

describe('can', () => {
  for (const [what, action, expected] of table) {
    for (const [who, viewer] of Object.entries(viewers)) {
      it(`${who} · ${what} → ${String(expected[who])}`, () => {
        expect(can(viewer, action)).toBe(expected[who]);
      });
    }
  }

  it('a rower without an account id never owns anything', () => {
    const anonymous: Viewer = { role: 'rower', userId: null };
    expect(can(anonymous, { kind: 'edit_annotation', authorUserId: null })).toBe(false);
    expect(can(anonymous, { kind: 'unshare', sharedByUserId: null })).toBe(false);
  });

  it('only the admin (and the pilot path) sees the whole club', () => {
    expect(Object.values(viewers).map(seesAll)).toEqual([true, false, false, true]);
  });
});
