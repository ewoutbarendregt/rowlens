import { lang } from '../i18n/language.ts';
import type { Joint, Phase } from '../../shared/angles.ts';
// Angle measurements per phase (ADR-0017) in NL and EN (moves into the i18n catalogs with #34).
const en = {
  angles: 'Angles',
  joints: { knee: 'Knee', hip: 'Hip', elbow: 'Elbow', trunk: 'Upper body' } as Record<
    Joint,
    string
  >,
  phases: {
    catch: 'Catch',
    half_slide_drive: 'Half slide (drive)',
    finish: 'Finish',
    half_slide_recovery: 'Half slide (recovery)',
  } as Record<Phase, string>,
  steps: {
    knee: ['hip', 'knee', 'ankle'],
    hip: ['shoulder', 'hip', 'knee'],
    elbow: ['shoulder', 'elbow', 'wrist'],
    trunk: ['hip', 'shoulder'],
  } as Record<Joint, string[]>,
  boatSteps: ['bow side of the boat', 'stern side of the boat'],
  tap: 'Tap on the picture:',
  cancel: 'Cancel',
  boatLine: 'Boat line',
  boatLineMissing: 'Not set yet: needed for the upper body.',
  boatLineFrom: (frame: number, time: string) =>
    `here: the line from frame ${String(frame)} (${time}). Set a new one where the camera turns.`,
  boatLines: 'Boat lines in this video',
  fromFrame: (frame: number, time: string) => `from frame ${String(frame)} · ${time}`,
  drawBoatLine: 'Draw boat line',
  redrawBoatLine: 'Draw again here',
  newBoatLine: 'New boat line from this frame',
  removeBoatLineAt: (frame: number) => `Remove the boat line from frame ${String(frame)}`,
  here: (phase: string, stroke: number | null) =>
    stroke === null ? phase : `${phase} · stroke ${String(stroke)}`,
  rower: 'Rower',
  joint: 'What',
  measure: 'Measure',
  stepToMark: 'Step to a catch, half slide or finish to measure (↑ ↓ jump between catches).',
  onThisFrame: 'Measured on this frame',
  remove: (what: string) => `Remove ${what}`,
  readOnly: 'Coaches measure the angles; you see them here.',
  none: 'No angles measured yet.',
  sideOnly:
    'This video is filmed from the boat or above: angles are only reliable from the side (bank or coach boat).',
  crew: 'Difference in the crew',
  forward: (deg: string) => `forward ${deg}°`,
  back: (deg: string) => `back ${deg}°`,
  upright: 'upright',
  values: (n: number, min: string, max: string) =>
    n === 1 ? '1 measurement' : `${String(n)} measurements, ${min}° to ${max}°`,
  jump: (rower: string, phase: string) => `Go to ${rower} at the ${phase.toLowerCase()}`,
  loose: (n: number) =>
    n === 1
      ? 'One measurement is on a frame whose stroke mark was removed; it counts in no phase.'
      : `${String(n)} measurements are on frames whose stroke mark was removed; they count in no phase.`,
  needBoatLine: (n: number) =>
    n === 1
      ? 'One upper-body measurement waits for the boat line.'
      : `${String(n)} upper-body measurements wait for the boat line.`,
  failed: 'Could not save. Check your connection and try again.',
};

const nl: typeof en = {
  angles: 'Hoeken',
  joints: { knee: 'Knie', hip: 'Heup', elbow: 'Elleboog', trunk: 'Bovenlichaam' },
  phases: {
    catch: 'Inpik',
    half_slide_drive: 'Halve bank (haal)',
    finish: 'Uitpik',
    half_slide_recovery: 'Halve bank (oprijden)',
  },
  steps: {
    knee: ['heup', 'knie', 'enkel'],
    hip: ['schouder', 'heup', 'knie'],
    elbow: ['schouder', 'elleboog', 'pols'],
    trunk: ['heup', 'schouder'],
  },
  boatSteps: ['boegkant van de boot', 'achterstevenkant van de boot'],
  tap: 'Tik op het beeld:',
  cancel: 'Annuleren',
  boatLine: 'Bootlijn',
  boatLineMissing: 'Nog niet gezet: nodig voor het bovenlichaam.',
  boatLineFrom: (frame: number, time: string) =>
    `hier: de lijn vanaf frame ${String(frame)} (${time}). Zet een nieuwe waar de camera draait.`,
  boatLines: 'Bootlijnen in deze video',
  fromFrame: (frame: number, time: string) => `vanaf frame ${String(frame)} · ${time}`,
  drawBoatLine: 'Bootlijn tekenen',
  redrawBoatLine: 'Hier opnieuw tekenen',
  newBoatLine: 'Nieuwe bootlijn vanaf dit frame',
  removeBoatLineAt: (frame: number) => `Bootlijn vanaf frame ${String(frame)} weghalen`,
  here: (phase: string, stroke: number | null) =>
    stroke === null ? phase : `${phase} · haal ${String(stroke)}`,
  rower: 'Roeier',
  joint: 'Wat',
  measure: 'Meten',
  stepToMark:
    'Stap naar een inpik, halve bank of uitpik om te meten (↑ ↓ springt tussen inpikken).',
  onThisFrame: 'Gemeten op dit frame',
  remove: (what: string) => `${what} weghalen`,
  readOnly: 'Coaches meten de hoeken; jij ziet ze hier.',
  none: 'Nog geen hoeken gemeten.',
  sideOnly:
    'Deze video is gefilmd vanuit de boot of van boven: hoeken zijn alleen betrouwbaar van opzij (kant of coachboot).',
  crew: 'Verschil in de ploeg',
  forward: (deg: string) => `voorover ${deg}°`,
  back: (deg: string) => `achterover ${deg}°`,
  upright: 'rechtop',
  values: (n: number, min: string, max: string) =>
    n === 1 ? '1 meting' : `${String(n)} metingen, ${min}° tot ${max}°`,
  jump: (rower: string, phase: string) => `Naar ${rower} bij de ${phase.toLowerCase()}`,
  loose: (n: number) =>
    n === 1
      ? 'Eén meting staat op een frame waarvan de markering is weggehaald; die telt in geen fase.'
      : `${String(n)} metingen staan op frames waarvan de markering is weggehaald; die tellen in geen fase.`,
  needBoatLine: (n: number) =>
    n === 1
      ? 'Eén meting van het bovenlichaam wacht op de bootlijn.'
      : `${String(n)} metingen van het bovenlichaam wachten op de bootlijn.`,
  failed: 'Opslaan lukte niet. Controleer je verbinding en probeer het opnieuw.',
};

export type AngleStrings = typeof en;

export function angleStrings(): AngleStrings {
  return lang() === 'nl' ? nl : en;
}

/** The upper body's lean as words: "forward 14°", "back 6°", or "upright" within half a degree. */
export function leanText(degrees: number, t: AngleStrings = angleStrings()): string {
  const rounded = Math.round(Math.abs(degrees));
  if (Math.abs(degrees) < 0.5) return t.upright;
  return degrees > 0 ? t.forward(String(rounded)) : t.back(String(rounded));
}
