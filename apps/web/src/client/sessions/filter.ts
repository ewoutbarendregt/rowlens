import { normalizeName } from '../../shared/names.ts';

/** How the session list can be narrowed and ordered (#108); kept in the URL so reloads and links keep it. */
export const SORTS = ['date-desc', 'date-asc', 'title', 'videos', 'notes'] as const;
export type Sort = (typeof SORTS)[number];

export interface Filters {
  /** ISO dates, inclusive. */
  from: string | null;
  to: string | null;
  /** A roster id: only sessions with this rower in the lineup. */
  rower: string | null;
  boat: string | null;
  /** Words in the title. */
  q: string;
  /** Only sessions with notes meant for the viewer. */
  mine: boolean;
  sort: Sort;
}

export const DEFAULT_FILTERS: Filters = {
  from: null,
  to: null,
  rower: null,
  boat: null,
  q: '',
  mine: false,
  sort: 'date-desc',
};

export interface SessionRow {
  title: string;
  date: string;
  createdAt: string;
  boatType: string | null;
  videoCount: number;
  notesForMe: number;
  lineup: { rowerId: string }[];
}

const isoDate = (value: string | null) =>
  value !== null && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : null;

export function readFilters(params: URLSearchParams): Filters {
  const sort = params.get('sort');
  return {
    from: isoDate(params.get('from')),
    to: isoDate(params.get('to')),
    rower: params.get('rower') || null,
    boat: params.get('boat') || null,
    q: params.get('q') ?? '',
    mine: params.get('mine') === '1',
    sort: SORTS.includes(sort as Sort) ? (sort as Sort) : DEFAULT_FILTERS.sort,
  };
}

/** Only what differs from the defaults, so a plain list keeps a plain URL. */
export function writeFilters(f: Filters): URLSearchParams {
  const params = new URLSearchParams();
  if (f.from !== null) params.set('from', f.from);
  if (f.to !== null) params.set('to', f.to);
  if (f.rower !== null) params.set('rower', f.rower);
  if (f.boat !== null) params.set('boat', f.boat);
  if (f.q.trim() !== '') params.set('q', f.q);
  if (f.mine) params.set('mine', '1');
  if (f.sort !== DEFAULT_FILTERS.sort) params.set('sort', f.sort);
  return params;
}

/** How many filters narrow the list (the sort order doesn't count). */
export function activeFilters(f: Filters): number {
  return (
    [f.from, f.to, f.rower, f.boat].filter((v) => v !== null).length +
    (f.q.trim() === '' ? 0 : 1) +
    (f.mine ? 1 : 0)
  );
}

const newestFirst = (a: SessionRow, b: SessionRow) =>
  b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt);

export function applyFilters<T extends SessionRow>(rows: readonly T[], f: Filters): T[] {
  const words = normalizeName(f.q).split(' ').filter(Boolean);
  const kept = rows.filter((r) => {
    if (f.from !== null && r.date < f.from) return false;
    if (f.to !== null && r.date > f.to) return false;
    if (f.boat !== null && r.boatType !== f.boat) return false;
    if (f.rower !== null && !r.lineup.some((s) => s.rowerId === f.rower)) return false;
    if (f.mine && r.notesForMe === 0) return false;
    const title = normalizeName(r.title);
    return words.every((w) => title.includes(w));
  });
  const order: Record<Sort, (a: T, b: T) => number> = {
    'date-desc': newestFirst,
    'date-asc': (a, b) => -newestFirst(a, b),
    title: (a, b) => a.title.localeCompare(b.title) || newestFirst(a, b),
    videos: (a, b) => b.videoCount - a.videoCount || newestFirst(a, b),
    notes: (a, b) => b.notesForMe - a.notesForMe || newestFirst(a, b),
  };
  return kept.sort(order[f.sort]);
}
