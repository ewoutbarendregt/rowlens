/** Each tab owns its club; requests and media URLs capture this context when created. */
const requestedClub = new URLSearchParams(window.location.search).get('club');
let selected: string | null =
  requestedClub !== null && /^[0-9a-f-]{36}$/i.test(requestedClub)
    ? requestedClub
    : sessionStorage.getItem('rowlens.activeClub');
export const activeClub = () => selected;
export function setActiveClub(id: string | null): void {
  selected = id;
  if (id === null) sessionStorage.removeItem('rowlens.activeClub');
  else sessionStorage.setItem('rowlens.activeClub', id);
}
