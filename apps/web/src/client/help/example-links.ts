import { appUrl } from '../env.ts';

/** Enter the ordinary editor with the example's actual owning club, not the active club. */
export function originalTrainingUrl(id: string, clubId: string): string {
  const target = new URL(appUrl(`/sessions/${id}`, null), window.location.origin);
  target.searchParams.set('club', clubId);
  return target.pathname + target.search;
}
