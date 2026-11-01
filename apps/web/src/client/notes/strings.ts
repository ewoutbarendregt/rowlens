// Notes strings in NL and EN (moves into the i18n catalogs with #34).
const en = {
  notes: 'Notes',
  none: 'No notes yet. Pause on a moment and write what you see.',
  atFrame: (frame: number, time: string) => `Note at frame ${String(frame)} (${time})`,
  placeholder: 'e.g. blade goes in before the hands reach full extension',
  yourName: 'Your name',
  save: 'Save note',
  edit: 'Edit',
  cancel: 'Cancel',
  update: 'Save',
  delete: 'Delete',
  confirmDelete: 'Delete this note for everyone?',
  jump: (frame: number, time: string) => `Go to frame ${String(frame)} (${time})`,
  marker: (frame: number, body: string) => `Note at frame ${String(frame)}: ${body}`,
  here: 'on this frame',
  failed: 'Could not save. Check your connection and try again.',
};

const nl: typeof en = {
  notes: 'Notities',
  none: 'Nog geen notities. Pauzeer op een moment en schrijf op wat je ziet.',
  atFrame: (frame: number, time: string) => `Notitie bij frame ${String(frame)} (${time})`,
  placeholder: 'bijv. blad gaat erin voordat de armen helemaal gestrekt zijn',
  yourName: 'Je naam',
  save: 'Notitie opslaan',
  edit: 'Bewerken',
  cancel: 'Annuleren',
  update: 'Opslaan',
  delete: 'Verwijderen',
  confirmDelete: 'Deze notitie voor iedereen verwijderen?',
  jump: (frame: number, time: string) => `Naar frame ${String(frame)} (${time})`,
  marker: (frame: number, body: string) => `Notitie bij frame ${String(frame)}: ${body}`,
  here: 'op dit frame',
  failed: 'Opslaan lukte niet. Controleer je verbinding en probeer het opnieuw.',
};

export type NotesStrings = typeof en;

export function notesStrings(language: string = navigator.language): NotesStrings {
  return language.toLowerCase().startsWith('nl') ? nl : en;
}
