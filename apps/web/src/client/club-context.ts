/** Each tab owns its club; requests and media URLs capture this context when created. */
let selected: string | null = sessionStorage.getItem('rowlens.activeClub');
export const activeClub = () => selected;
export function setActiveClub(id: string | null): void {
  selected = id;
  if (id === null) sessionStorage.removeItem('rowlens.activeClub');
  else sessionStorage.setItem('rowlens.activeClub', id);
}
