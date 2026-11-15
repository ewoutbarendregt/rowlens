import { z } from 'zod';
export const shareMemberSchema = z.object({ id: z.uuid(), name: z.string().nullable() });
export type ShareMember = z.infer<typeof shareMemberSchema>;
export const sessionSharingSchema = z.object({
  revision: z.int().nonnegative().max(2147483647),
  isExample: z.boolean(),
  clubWide: z.boolean(),
  members: z.array(shareMemberSchema),
});
export type SessionSharing = z.infer<typeof sessionSharingSchema>;
export const sharingBodySchema = z
  .object({
    revision: z.int().nonnegative().max(2147483647),
    clubWide: z.boolean(),
    userIds: z.array(z.uuid()).max(500),
  })
  .strict()
  .refine((v) => new Set(v.userIds).size === v.userIds.length, { path: ['userIds'] });
export type SharingBody = z.infer<typeof sharingBodySchema>;
export const sharingMembersSchema = z.object({
  members: z.array(shareMemberSchema),
  more: z.boolean(),
});
