/**
 * How a video is called in RowLens (Ewout, 2026-11-01): `[session]-[#]-[start]-[length]`, e.g.
 * `Zaterdag CX4+-2-09:48-1:27`. `#` is the video's fixed number in its session, `start` the time
 * of day filming began (from the file, in local time), `length` m:ss. A part that isn't known is
 * left out (Ewout, 2026-11-03: no question marks); many exported phone videos carry no start time.
 */
export interface NamedVideo {
  sessionTitle: string;
  seq: number | null;
  recordedAt: string | null;
  durationMs: number | null;
}

export function videoDisplayName(v: NamedVideo, timeZone?: string): string {
  return [v.sessionTitle, v.seq, startTime(v.recordedAt, timeZone), length(v.durationMs)]
    .filter((part) => part !== null)
    .join('-');
}

function startTime(iso: string | null, timeZone: string | undefined): string | null {
  if (iso === null) return null;
  const at = new Date(iso);
  if (Number.isNaN(at.getTime())) return null;
  return new Intl.DateTimeFormat('nl-NL', {
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
    ...(timeZone === undefined ? {} : { timeZone }),
  }).format(at);
}

function length(ms: number | null): string | null {
  if (ms === null) return null;
  const total = Math.round(ms / 1000);
  return `${String(Math.floor(total / 60))}:${String(total % 60).padStart(2, '0')}`;
}
