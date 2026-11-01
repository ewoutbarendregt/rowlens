/**
 * Container check by magic bytes (#46), not by name or declared type. ffprobe in the worker (#47)
 * then decides whether it really decodes. Covers what phones and cameras produce.
 */
export type Container = 'mp4' | 'matroska';

// ISO base media (MP4, MOV, M4V, 3GP): a box header "size + type" at the start; QuickTime files
// may start with moov/mdat/wide/free/skip instead of ftyp.
const ISO_BOXES = new Set(['ftyp', 'moov', 'mdat', 'wide', 'free', 'skip', 'pnot']);

export function sniffContainer(head: Buffer): Container | null {
  if (head.length >= 8 && ISO_BOXES.has(head.toString('latin1', 4, 8))) return 'mp4';
  if (head.length >= 4 && head.readUInt32BE(0) === 0x1a45dfa3) return 'matroska';
  return null;
}

/** First filter at upload creation: what the browser says it is, or the extension. */
export function looksLikeVideo(filename: string, contentType: string): boolean {
  return contentType.startsWith('video/') || /\.(mp4|mov|m4v|webm|mkv|3gp)$/i.test(filename.trim());
}
