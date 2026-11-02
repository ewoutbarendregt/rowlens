// Sessions and upload strings in NL and EN (moves into the i18n catalogs with #34).
const en = {
  sessions: 'Sessions',
  noSessions: 'No sessions yet. Create one, then upload its videos.',
  newSession: 'New session',
  title: 'Title',
  titlePlaceholder: 'e.g. Saturday morning, CX4+',
  date: 'Date',
  create: 'Create session',
  createdAt: (time: string) => `Created at ${time}`,
  videos: (n: number) => (n === 1 ? '1 video' : `${String(n)} videos`),
  back: 'All sessions',
  home: 'Home',
  noVideos: 'No videos in this session yet.',
  upload: 'Upload videos',
  chooseFiles: 'Choose videos',
  chooseHint: 'You can pick several. Keep this page open until they are done.',
  perspective: 'Camera',
  perspectives: { boat: 'In the boat', bank: 'From the bank', drone: 'Drone' },
  start: 'Upload',
  remove: 'Remove',
  delete: 'Delete',
  confirmDelete: (name: string) => `Delete “${name}” for everyone? This cannot be undone.`,
  deleteSession: 'Delete session',
  deleteSessionHint: 'Deletes the session, all its videos and every annotation.',
  confirmDeleteSession: (title: string, videos: string) =>
    `Delete “${title}”, ${videos} and every annotation for everyone? This cannot be undone.`,
  deleteSessionFailed: 'The session could not be deleted. Check your connection and try again.',
  status: {
    uploading: 'Uploading',
    uploaded: 'Uploaded, waiting for processing',
    processing: 'Processing',
    ready: 'Ready',
    failed: 'Processing failed',
    rejected: 'Not a video',
  },
  processingAt: (pct: number) => `Processing ${String(pct)} %`,
  failReasons: {
    no_video_stream: 'The file has no picture.',
    too_long: 'Longer than 30 minutes.',
    unreadable: 'The file could not be read.',
    processing_failed: 'Processing failed. Try uploading it again.',
  } as Record<string, string>,
  incomplete: (pct: number) =>
    `Stopped at ${String(pct)} %. Choose the same file again on this device to continue.`,
  progress: (pct: number) => `${String(pct)} %`,
  done: 'Done',
  errors: {
    not_a_video: 'This file is not a video.',
    too_large: 'This file is larger than 4 GB.',
    media_cap: 'RowLens storage is full. Delete old videos first.',
    disk_full: 'The server is almost full. Uploads are paused; try again later.',
    too_many_uploads: 'Too many uploads in an hour. Try again later.',
    failed: 'Upload failed. Check your connection; it continues where it stopped.',
  },
  leaveWarning: 'Uploads are still running.',
  quality: 'Quality',
  qualityHint: '540p starts faster on a slow connection; 1080p shows more detail.',
  watch: (name: string) => `Watch ${name}`,
  backToSession: (title: string) => `Back to ${title}`,
  notReady: 'This video is not ready to watch yet.',
  loadFailed: 'Could not load this page. Check your connection and reload.',
  cancel: 'Cancel',
  creator: 'Coach (made by)',
  noCreator: 'Nobody (only the admin sees it)',
  creatorHint: 'Only you, as admin, see this. The coach chosen here sees this session.',
  filters: 'Filters',
  from: 'From',
  to: 'Until',
  rower: 'Rower',
  anyone: 'Anyone',
  anyBoat: 'Any boat',
  search: 'Search',
  searchTitle: 'Words in the title',
  sortBy: 'Sort by',
  sorts: {
    'date-desc': 'Newest first',
    'date-asc': 'Oldest first',
    title: 'Title (A–Z)',
    videos: 'Most videos',
    notes: 'Most notes for me',
  },
  onlyMine: 'Only with notes for me',
  clearFilters: 'Clear filters',
  showing: (shown: number, total: number) =>
    shown === total ? `${String(total)} sessions` : `${String(shown)} of ${String(total)} sessions`,
  notesForMe: (n: number) => (n === 1 ? '1 note for you' : `${String(n)} notes for you`),
  withNotesForYou: (n: number) => `${String(n)} with notes for you`,
  filtersInLink: 'Filters stay in the link, so a shared URL shows the same list.',
  columns: { session: 'Session', crew: 'Crew', videos: 'Videos', forYou: 'For you' },
  noLineup: 'No lineup yet',
  cox: 'cox',
  unlinked:
    'You see the sessions you made or rowed in, but your account isn’t linked to your name in the roster yet. Ask a coach or the admin to add your e-mail address to your name on the Rowers page.',
};

const nl: typeof en = {
  sessions: 'Trainingen',
  noSessions: 'Nog geen trainingen. Maak er een aan en upload daarna de video’s.',
  newSession: 'Nieuwe training',
  title: 'Titel',
  titlePlaceholder: 'bijv. zaterdagochtend, CX4+',
  date: 'Datum',
  create: 'Training aanmaken',
  createdAt: (time: string) => `Aangemaakt om ${time}`,
  videos: (n: number) => (n === 1 ? '1 video' : `${String(n)} video’s`),
  back: 'Alle trainingen',
  home: 'Start',
  noVideos: 'Nog geen video’s bij deze training.',
  upload: 'Video’s uploaden',
  chooseFiles: 'Video’s kiezen',
  chooseHint: 'Je kunt er meerdere kiezen. Laat deze pagina open tot ze klaar zijn.',
  perspective: 'Camera',
  perspectives: { boat: 'In de boot', bank: 'Vanaf de kant', drone: 'Drone' },
  start: 'Uploaden',
  remove: 'Weghalen',
  delete: 'Verwijderen',
  confirmDelete: (name: string) =>
    `“${name}” voor iedereen verwijderen? Dit kan niet ongedaan worden gemaakt.`,
  deleteSession: 'Training verwijderen',
  deleteSessionHint: 'Verwijdert de training, alle video’s en alle annotaties.',
  confirmDeleteSession: (title: string, videos: string) =>
    `“${title}”, ${videos} en alle annotaties voor iedereen verwijderen? Dit kan niet ongedaan worden gemaakt.`,
  deleteSessionFailed:
    'De training kon niet worden verwijderd. Controleer je verbinding en probeer het opnieuw.',
  status: {
    uploading: 'Bezig met uploaden',
    uploaded: 'Geüpload, wacht op verwerking',
    processing: 'Wordt verwerkt',
    ready: 'Klaar',
    failed: 'Verwerking mislukt',
    rejected: 'Geen video',
  },
  processingAt: (pct: number) => `Wordt verwerkt, ${String(pct)} %`,
  failReasons: {
    no_video_stream: 'Het bestand heeft geen beeld.',
    too_long: 'Langer dan 30 minuten.',
    unreadable: 'Het bestand kon niet worden gelezen.',
    processing_failed: 'Verwerken mislukt. Upload hem opnieuw.',
  },
  incomplete: (pct: number) =>
    `Gestopt bij ${String(pct)} %. Kies op dit apparaat hetzelfde bestand opnieuw om verder te gaan.`,
  progress: (pct: number) => `${String(pct)} %`,
  done: 'Klaar',
  errors: {
    not_a_video: 'Dit bestand is geen video.',
    too_large: 'Dit bestand is groter dan 4 GB.',
    media_cap: 'De opslag van RowLens is vol. Verwijder eerst oude video’s.',
    disk_full: 'De server is bijna vol. Uploaden staat even stil; probeer het later opnieuw.',
    too_many_uploads: 'Te veel uploads in een uur. Probeer het later opnieuw.',
    failed: 'Uploaden mislukt. Controleer je verbinding; hij gaat verder waar hij stopte.',
  },
  leaveWarning: 'Er lopen nog uploads.',
  quality: 'Kwaliteit',
  qualityHint: '540p start sneller bij een trage verbinding; 1080p laat meer detail zien.',
  watch: (name: string) => `${name} bekijken`,
  backToSession: (title: string) => `Terug naar ${title}`,
  notReady: 'Deze video is nog niet klaar om te bekijken.',
  loadFailed: 'Deze pagina kon niet laden. Controleer je verbinding en herlaad.',
  cancel: 'Annuleren',
  creator: 'Coach (gemaakt door)',
  noCreator: 'Niemand (alleen de beheerder ziet hem)',
  creatorHint: 'Alleen jij als beheerder ziet dit. De coach die je hier kiest, ziet deze training.',
  filters: 'Filters',
  from: 'Van',
  to: 'Tot en met',
  rower: 'Roeier',
  anyone: 'Iedereen',
  anyBoat: 'Elke boot',
  search: 'Zoeken',
  searchTitle: 'Woorden in de titel',
  sortBy: 'Sorteren op',
  sorts: {
    'date-desc': 'Nieuwste eerst',
    'date-asc': 'Oudste eerst',
    title: 'Titel (A–Z)',
    videos: 'Meeste video’s',
    notes: 'Meeste notities voor mij',
  },
  onlyMine: 'Alleen met notities voor mij',
  clearFilters: 'Filters wissen',
  showing: (shown: number, total: number) =>
    shown === total
      ? `${String(total)} trainingen`
      : `${String(shown)} van ${String(total)} trainingen`,
  notesForMe: (n: number) => (n === 1 ? '1 notitie voor jou' : `${String(n)} notities voor jou`),
  withNotesForYou: (n: number) => `${String(n)} met notities voor jou`,
  filtersInLink: 'Filters blijven in de link, dus een gedeelde URL toont dezelfde lijst.',
  columns: { session: 'Training', crew: 'Ploeg', videos: 'Video’s', forYou: 'Voor jou' },
  noLineup: 'Nog geen opstelling',
  cox: 'stuur',
  unlinked:
    'Je ziet de trainingen die je aanmaakte of waarin je roeide, maar je account is nog niet gekoppeld aan je naam in de ploeglijst. Vraag een coach of de beheerder je e-mailadres bij jouw naam op de Roeiers-pagina te zetten.',
};

export type SessionStrings = typeof en;
export type Perspective = keyof SessionStrings['perspectives'];
export type VideoStatus = keyof SessionStrings['status'];
export type UploadError = keyof SessionStrings['errors'];

export const lang = (): 'nl' | 'en' =>
  navigator.language.toLowerCase().startsWith('nl') ? 'nl' : 'en';

export function sessionStrings(): SessionStrings {
  return lang() === 'nl' ? nl : en;
}

export function formatDate(iso: string): string {
  return new Intl.DateTimeFormat(lang() === 'nl' ? 'nl-NL' : 'en-GB', {
    weekday: 'short',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(`${iso}T00:00:00Z`));
}

/** "Sun" and "1 Nov" for the date column; the year too when the list isn't grouped by month. */
export function formatDayParts(iso: string, withYear = false): { weekday: string; day: string } {
  const locale = lang() === 'nl' ? 'nl-NL' : 'en-GB';
  const date = new Date(`${iso}T00:00:00Z`);
  return {
    weekday: new Intl.DateTimeFormat(locale, { weekday: 'short', timeZone: 'UTC' }).format(date),
    day: new Intl.DateTimeFormat(locale, {
      day: 'numeric',
      month: 'short',
      year: withYear ? 'numeric' : undefined,
      timeZone: 'UTC',
    }).format(date),
  };
}

/** A month heading from `YYYY-MM`: "November 2026", in Dutch with a capital too ("November 2026"). */
export function formatMonth(month: string): string {
  const text = new Intl.DateTimeFormat(lang() === 'nl' ? 'nl-NL' : 'en-GB', {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(`${month}-01T00:00:00Z`));
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/** The database creation timestamp in the viewer's local time; tests can pin a time zone. */
export function formatCreatedTime(
  iso: string,
  timeZone?: string,
  language: 'nl' | 'en' = lang(),
): string {
  return new Intl.DateTimeFormat(language === 'nl' ? 'nl-NL' : 'en-GB', {
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
    timeZone,
  }).format(new Date(iso));
}

/** e.g. `60 fps · 1920×1080 · 2:03`; fractional rates like 59.94 keep two decimals. */
export function formatVideoFacts(v: {
  fpsNum: number | null;
  fpsDen: number | null;
  width: number | null;
  height: number | null;
  durationMs: number | null;
}): string | null {
  if (v.fpsNum === null || v.fpsDen === null || v.width === null || v.height === null) return null;
  const locale = lang() === 'nl' ? 'nl-NL' : 'en-GB';
  const fps = new Intl.NumberFormat(locale, { maximumFractionDigits: 2 }).format(
    v.fpsNum / v.fpsDen,
  );
  const total = Math.round((v.durationMs ?? 0) / 1000);
  const duration = `${String(Math.floor(total / 60))}:${String(total % 60).padStart(2, '0')}`;
  return `${fps} fps · ${String(v.width)}×${String(v.height)} · ${duration}`;
}

export function formatBytes(bytes: number): string {
  const units = ['B', 'kB', 'MB', 'GB'];
  let value = bytes;
  let unit = 0;
  while (value >= 1000 && unit < units.length - 1) {
    value /= 1000;
    unit += 1;
  }
  const n = new Intl.NumberFormat(lang() === 'nl' ? 'nl-NL' : 'en-GB', {
    maximumFractionDigits: unit >= 2 ? 1 : 0,
  }).format(value);
  return `${n} ${units[unit] ?? 'B'}`;
}
