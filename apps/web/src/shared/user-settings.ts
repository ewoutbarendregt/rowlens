import { z } from 'zod';
import { BOAT_CLASS_NAMES } from './boats.ts';

export const preferenceSchema = z
  .object({
    language: z.enum(['nl', 'en']),
    theme: z.enum(['light', 'dark', 'hc']),
    notesVisible: z.boolean(),
    noteHoldSeconds: z.union([z.literal(0.5), z.literal(1), z.literal(2)]),
    driveMiddle: z.boolean(),
  })
  .strict();
export type Preferences = z.infer<typeof preferenceSchema>;
export const DEFAULT_PREFERENCES: Preferences = {
  language: 'nl',
  theme: 'light',
  notesVisible: true,
  noteHoldSeconds: 1,
  driveMiddle: false,
};
export const PREFERENCE_KEYS = [
  'language',
  'theme',
  'notesVisible',
  'noteHoldSeconds',
  'driveMiddle',
] as const;
export const profileSchema = z.object({
  firstName: z.string().trim().min(1).max(60),
  lastName: z.string().trim().min(1).max(60),
  defaultBoatType: z.enum(BOAT_CLASS_NAMES).nullable(),
});
export const settingsPatchSchema = preferenceSchema
  .extend(profileSchema.shape)
  .partial()
  .strict()
  .refine((patch) => Object.keys(patch).length > 0, 'empty_patch');
export type SettingsPatch = z.infer<typeof settingsPatchSchema>;
export interface UserSettings {
  firstName: string | null;
  lastName: string | null;
  defaultBoatType: z.infer<typeof profileSchema>['defaultBoatType'];
  preferences: { [K in keyof Preferences]: Preferences[K] | null };
  revision: number;
}

export const userSettingsSchema = z.object({
  firstName: z.string().nullable(),
  lastName: z.string().nullable(),
  defaultBoatType: z.enum(BOAT_CLASS_NAMES).nullable(),
  revision: z.int().nonnegative(),
  preferences: z.object({
    language: z.enum(['nl', 'en']).nullable(),
    theme: z.enum(['light', 'dark', 'hc']).nullable(),
    notesVisible: z.boolean().nullable(),
    noteHoldSeconds: z.union([z.literal(0.5), z.literal(1), z.literal(2)]).nullable(),
    driveMiddle: z.boolean().nullable(),
  }),
});
export function effectivePreferences(
  settings: UserSettings | null,
  fallback: Preferences = DEFAULT_PREFERENCES,
): Preferences {
  return Object.fromEntries(
    PREFERENCE_KEYS.map((key) => [key, settings?.preferences[key] ?? fallback[key]]),
  ) as Preferences;
}
