// Notes strings in NL and EN (moves into the i18n catalogs with #34).
const en = {
  notes: 'Notes and drawings',
  draw: 'Draw',
  tools: { line: 'Line', arrow: 'Arrow', angle: 'Angle' },
  hints: {
    line: 'Tap the start and the end on the picture.',
    arrow: 'Tap where the arrow starts, then where it points.',
    angle: 'Tap one arm, then the vertex, then the other arm. Esc cancels.',
  },
  needName: 'Fill in your name at the notes to draw.',
  drawing: { line: 'Line', arrow: 'Arrow', angle: (deg: number) => `Angle ${String(deg)}°` },
  drawingMarker: (frame: number, what: string) => `${what} at frame ${String(frame)}`,
  none: 'Nothing yet. Pause on a moment, then write or draw what you see.',
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
  notes: 'Notities en tekeningen',
  draw: 'Tekenen',
  tools: { line: 'Lijn', arrow: 'Pijl', angle: 'Hoek' },
  hints: {
    line: 'Tik op het begin en het eind op het beeld.',
    arrow: 'Tik waar de pijl begint en waar hij naar wijst.',
    angle: 'Tik op een arm, dan het hoekpunt, dan de andere arm. Esc annuleert.',
  },
  needName: 'Vul bij de notities je naam in om te tekenen.',
  drawing: { line: 'Lijn', arrow: 'Pijl', angle: (deg: number) => `Hoek ${String(deg)}°` },
  drawingMarker: (frame: number, what: string) => `${what} bij frame ${String(frame)}`,
  none: 'Nog niets. Pauzeer op een moment en schrijf of teken wat je ziet.',
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
