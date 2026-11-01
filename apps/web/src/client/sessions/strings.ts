// Sessions and upload strings in NL and EN (moves into the i18n catalogs with #34).
const en = {
  sessions: 'Sessions',
  noSessions: 'No sessions yet. Create one, then upload its videos.',
  newSession: 'New session',
  title: 'Title',
  titlePlaceholder: 'e.g. Saturday morning, CX4+',
  date: 'Date',
  create: 'Create session',
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
  status: {
    uploading: 'Uploading',
    uploaded: 'Uploaded, waiting for processing',
    processing: 'Processing',
    ready: 'Ready',
    failed: 'Processing failed',
    rejected: 'Not a video',
  },
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
  loadFailed: 'Could not load this page. Check your connection and reload.',
};

const nl: typeof en = {
  sessions: 'Trainingen',
  noSessions: 'Nog geen trainingen. Maak er een aan en upload daarna de video’s.',
  newSession: 'Nieuwe training',
  title: 'Titel',
  titlePlaceholder: 'bijv. zaterdagochtend, CX4+',
  date: 'Datum',
  create: 'Training aanmaken',
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
  status: {
    uploading: 'Bezig met uploaden',
    uploaded: 'Geüpload, wacht op verwerking',
    processing: 'Wordt verwerkt',
    ready: 'Klaar',
    failed: 'Verwerking mislukt',
    rejected: 'Geen video',
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
  loadFailed: 'Deze pagina kon niet laden. Controleer je verbinding en herlaad.',
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
