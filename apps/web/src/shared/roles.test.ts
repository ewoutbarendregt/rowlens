import { describe, expect, it } from 'vitest';
import { canManageRoster, rolesSchema, type Role } from './roles.ts';

describe('role sets', () => {
  for (let mask = 1; mask < 8; mask++) {
    const roles = (['rower', 'coach', 'admin'] as Role[]).filter((_, i) => (mask & (1 << i)) !== 0);
    it(`preserves ${roles.join('+')}`, () => {
      expect(rolesSchema.parse(roles)).toEqual(roles);
      expect(canManageRoster(roles)).toBe(roles.includes('coach') || roles.includes('admin'));
    });
  }
  it('rejects empty, unknown and duplicate assignments', () => {
    for (const roles of [[], ['owner'], ['rower', 'rower']])
      expect(rolesSchema.safeParse(roles).success).toBe(false);
  });
});
