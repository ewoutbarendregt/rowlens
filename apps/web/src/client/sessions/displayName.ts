/**
 * How a video is called in RowLens (Ewout, 2026-11-01): `[session]-[#]-[start]-[length]`, e.g.
 * `Zaterdag CX4+-2-09:48-1:27`. `#` is the video's fixed number in its session, `start` the time
 * of day filming began (from the file, in local time), `length` m:ss. Unknown parts read `??:??`
 * and `?:??` (not dashes: those are the separators).
 */
export interface NamedVideo {
  sessionTitle: string;
  seq: number | null;
  recordedAt: string | null;
  durationMs: number | null;
}

export function videoDisplayName(v: NamedVideo, timeZone?: string): string {
  return [
    v.sessionTitle,
    v.seq ?? '?',
    startTime(v.recordedAt, timeZone),
    length(v.durationMs),
  ].join('-');
}

function startTime(iso: string | null, timeZone: string | undefined): string {
  if (iso === null) return '??:??';
  const at = new Date(iso);
  if (Number.isNaN(at.getTime())) return '??:??';
  return new Intl.DateTimeFormat('nl-NL', {
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
    ...(timeZone === undefined ? {} : { timeZone }),
  }).format(at);
}

function length(ms: number | null): string {
  if (ms === null) return '?:??';
  const total = Math.round(ms / 1000);
  return `${String(Math.floor(total / 60))}:${String(total % 60).padStart(2, '0')}`;
}
