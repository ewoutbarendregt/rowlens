import { z } from 'zod';

export const ROLES = ['rower', 'coach', 'admin'] as const;
export type Role = (typeof ROLES)[number];
export const rolesSchema = z
  .array(z.enum(ROLES))
  .min(1)
  .max(3)
  .refine((roles) => new Set(roles).size === roles.length, 'duplicate_roles')
  .transform((roles) => ROLES.filter((role) => roles.includes(role)));

export const hasRole = (roles: readonly Role[], role: Role): boolean => roles.includes(role);
export const canManageRoster = (roles: readonly Role[]): boolean =>
  hasRole(roles, 'coach') || hasRole(roles, 'admin');

/** Read-only compatibility for clients opened before the upgrade; never the authorization source. */
export const primaryRole = (roles: readonly Role[]): Role =>
  roles.includes('admin') ? 'admin' : roles.includes('coach') ? 'coach' : 'rower';
