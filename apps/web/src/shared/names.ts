/**
 * Names of people in the roster (#104): one normalised form for searching and for the "is this the
 * same rower?" check, shared by the API (which refuses a likely duplicate) and the picker (which
 * searches as you type). Accents, case and extra spaces don't count: "Joël  de Vries" = "joel de vries".
 */
export function normalizeName(name: string): string {
  return name
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
}

/** True when `query` matches the start of the name or of any word in it ("vri" finds "Jan de Vries"). */
export function nameMatches(name: string, query: string): boolean {
  const q = normalizeName(query);
  if (q === '') return true;
  const n = normalizeName(name);
  return n.startsWith(q) || n.split(' ').some((word) => word.startsWith(q)) || n.includes(` ${q}`);
}

/** Edit distance, for typos ("Jansen" / "Janssen"). Names are short, so the plain O(n·m) table is fine. */
function distance(a: string, b: string): number {
  let previous = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const current = [i];
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      current[j] = Math.min(
        (previous[j] ?? 0) + 1,
        (current[j - 1] ?? 0) + 1,
        (previous[j - 1] ?? 0) + cost,
      );
    }
    previous = current;
  }
  return previous[b.length] ?? 0;
}

/**
 * Whether two names probably mean the same person: equal once normalised, one contains the other as
 * whole words ("Jan" / "Jan de Vries"), or at most two letters apart for names long enough that two
 * letters is a typo rather than a different name ("Anna" vs "Anne" is still flagged: the coach decides).
 */
export function similarNames(a: string, b: string): boolean {
  const x = normalizeName(a);
  const y = normalizeName(b);
  if (x === '' || y === '') return false;
  if (x === y) return true;
  if (` ${x} `.includes(` ${y} `) || ` ${y} `.includes(` ${x} `)) return true;
  const allowed = Math.min(x.length, y.length) >= 6 ? 2 : 1;
  return distance(x, y) <= allowed;
}
