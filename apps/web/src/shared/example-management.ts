import { z } from 'zod';
export const exampleCandidateSchema = z.object({
  id: z.uuid(),
  title: z.string(),
  date: z.iso.date(),
  boatType: z.string().nullable(),
  videoCount: z.number().int().nonnegative(),
});
export const exampleCandidatesSchema = z.object({
  sessions: z.array(exampleCandidateSchema),
  nextCursor: z.uuid().nullable(),
});
export const examplePublishBodySchema = z.object({ confirm: z.literal(true) }).strict();
export const examplePublishResultSchema = z.object({
  id: z.uuid(),
  status: z.enum(['published', 'already-published']),
});
export type ExampleCandidate = z.infer<typeof exampleCandidateSchema>;
export type ExampleCandidates = z.infer<typeof exampleCandidatesSchema>;
