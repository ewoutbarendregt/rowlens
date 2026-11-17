import type { OverlayAnnotation } from '../notes/overlay.ts';

/** Public example projection has no author identity, timestamps or recipient metadata. */
export type ExampleAnnotation = Omit<OverlayAnnotation, 'authorName'> & { canEdit: false };
