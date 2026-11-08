import { describe, expect, it } from 'vitest';
import {
  activeFilters,
  applyFilters,
  crewText,
  DEFAULT_FILTERS,
  groupByMonth,
  type Filters,
  readFilters,
  writeFilters,
} from './filter.ts';

const row = (
  title: string,
  date: string,
  extra: Partial<{ boat: string; videos: number; notes: number; rowers: string[] }> = {},
) => ({
  title,
  date,
  createdAt: `${date}T08:00:00Z`,
  boatType: extra.boat ?? null,
  videoCount: extra.videos ?? 0,
  notesForMe: extra.notes ?? 0,
  lineup: (extra.rowers ?? []).map((rowerId) => ({ rowerId })),
});

const rows = [
  row('Zaterdag CX4+', '2026-11-01', {
    boat: 'C4x+',
    videos: 2,
    notes: 1,
    rowers: ['jan', 'kees'],
  }),
  row('Dinsdag avond', '2026-10-28', { boat: 'C2x', videos: 5, rowers: ['kees'] }),
  row('Ochtend Ëxtra', '2026-11-02', { boat: 'C4x+', videos: 1, notes: 3, rowers: ['piet'] }),
];

const titles = (f: Partial<Filters>) =>
  applyFilters(rows, { ...DEFAULT_FILTERS, ...f }).map((r) => r.title);

describe('applyFilters', () => {
  it('sorts newest first by default', () => {
    expect(titles({})).toEqual(['Ochtend Ëxtra', 'Zaterdag CX4+', 'Dinsdag avond']);
  });

  it.each([
    ['date-asc', ['Dinsdag avond', 'Zaterdag CX4+', 'Ochtend Ëxtra']],
    ['title', ['Dinsdag avond', 'Ochtend Ëxtra', 'Zaterdag CX4+']],
    ['videos', ['Dinsdag avond', 'Zaterdag CX4+', 'Ochtend Ëxtra']],
    ['notes', ['Ochtend Ëxtra', 'Zaterdag CX4+', 'Dinsdag avond']],
  ] as const)('sorts by %s', (sort, expected) => {
    expect(titles({ sort })).toEqual(expected);
  });

  it('filters by period, boat, rower, title words and notes for me', () => {
    expect(titles({ from: '2026-11-01' })).toEqual(['Ochtend Ëxtra', 'Zaterdag CX4+']);
    expect(titles({ to: '2026-11-01' })).toEqual(['Zaterdag CX4+', 'Dinsdag avond']);
    expect(titles({ boat: 'C2x' })).toEqual(['Dinsdag avond']);
    expect(titles({ rower: 'kees' })).toEqual(['Zaterdag CX4+', 'Dinsdag avond']);
    expect(titles({ q: 'extra' })).toEqual(['Ochtend Ëxtra']);
    expect(titles({ q: 'ZATERDAG cx4' })).toEqual(['Zaterdag CX4+']);
    expect(titles({ mine: true })).toEqual(['Ochtend Ëxtra', 'Zaterdag CX4+']);
  });

  it('combines filters', () => {
    expect(titles({ boat: 'C4x+', rower: 'kees', sort: 'title' })).toEqual(['Zaterdag CX4+']);
    expect(titles({ rower: 'nobody' })).toEqual([]);
  });
});

describe('filters in the URL', () => {
  it('round-trips and leaves defaults out', () => {
    const f: Filters = {
      club: null,
      participating: false,
      from: '2026-10-01',
      to: '2026-11-30',
      rower: 'kees',
      boat: 'C4x+',
      q: 'zat',
      mine: true,
      sort: 'title',
    };
    const params = writeFilters(f);
    expect(readFilters(params)).toEqual(f);
    expect(writeFilters(DEFAULT_FILTERS).toString()).toBe('');
    expect(activeFilters(f)).toBe(6);
    expect(activeFilters(DEFAULT_FILTERS)).toBe(0);
  });

  it('ignores junk', () => {
    expect(readFilters(new URLSearchParams('from=yesterday&sort=random&mine=yes'))).toEqual(
      DEFAULT_FILTERS,
    );
  });
});

describe('groupByMonth', () => {
  const dated = [
    row('a', '2026-11-02'),
    row('b', '2026-11-01'),
    row('c', '2026-10-31'),
    row('d', '2026-10-01'),
  ];

  it('groups consecutive rows by month when sorted by date', () => {
    expect(groupByMonth(dated, 'date-desc').map((g) => [g.month, g.rows.length])).toEqual([
      ['2026-11', 2],
      ['2026-10', 2],
    ]);
  });

  it('is one flat group for other sorts, and nothing for no rows', () => {
    expect(groupByMonth(dated, 'title').map((g) => g.month)).toEqual([null]);
    expect(groupByMonth([], 'date-desc')).toEqual([]);
    expect(groupByMonth([], 'title')).toEqual([]);
  });
});

describe('crewText', () => {
  it('lists first names bow to stroke, the cox last', () => {
    expect(
      crewText(
        [
          { seat: 0, displayName: 'Lieke Smit' },
          { seat: 2, displayName: 'Tom Bakker' },
          { seat: 1, displayName: 'Anna de Vries' },
        ],
        'cox',
      ),
    ).toBe('Anna, Tom · cox Lieke');
    expect(crewText([{ seat: 1, displayName: 'Tom Bakker' }], 'stuur')).toBe('Tom');
    expect(crewText([{ seat: 0, displayName: 'Lieke Smit' }], 'stuur')).toBe('stuur Lieke');
    expect(crewText([], 'cox')).toBeNull();
  });
});

describe('multi-club participation filters', () => {
  it('distinguishes actual participation including cox from creation/notes and persists filters', () => {
    const list = [
      { ...row('Participant', '2026-11-01'), clubId: 'a', mySeat: 0 },
      { ...row('Other club', '2026-11-01'), clubId: 'b', mySeat: 2 },
      { ...row('Not participating', '2026-11-01'), clubId: 'a', mySeat: null },
    ];
    const f = { ...DEFAULT_FILTERS, club: 'a', participating: true };
    expect(applyFilters(list, f)).toEqual([list[0]]);
    expect(readFilters(writeFilters(f))).toEqual(f);
    expect(activeFilters(f)).toBe(2);
  });
});
