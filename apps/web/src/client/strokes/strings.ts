import { lang } from '../i18n/language.ts';
import type { StrokeMarkKind, StrokeRefusal } from '../../shared/strokes.ts';
// Stroke marks and timings (#85) in NL and EN (moves into the i18n catalogs with #34).
const en = {
  strokes: 'Strokes',
  notes: 'Notes',
  mark: 'Mark at this frame',
  kinds: { catch: 'Catch', half_slide: 'Half slide', finish: 'Finish' } as Record<
    StrokeMarkKind,
    string
  >,
  keys: { catch: 'I', half_slide: 'H', finish: 'U' } as Record<StrokeMarkKind, string>,
  markHint: 'Step to the frame, then press the button or its key. Pressed again, it comes off.',
  keyHintMark: 'I H U catch / half slide / finish',
  keyHintJump: '↑ ↓ previous / next catch',
  markLabel: (kind: string, stroke: number | null, frame: number) =>
    stroke === null
      ? `${kind}, frame ${String(frame)}`
      : `${kind}, stroke ${String(stroke)}, frame ${String(frame)}`,
  number: 'No.',
  drive: 'Drive',
  recovery: 'Recovery',
  ratio: 'Ratio',
  rate: 'Rate',
  seconds: 's',
  spm: 'spm',
  averages: (n: number) => `Average over ${String(n)} strokes`,
  spread: (spm: string) => `rate varies ± ${spm} spm`,
  tooFew: (n: number) =>
    `Averages come from 3 complete strokes on (catch, finish and the next catch); now ${String(n)}.`,
  loose: (n: number) =>
    n === 1
      ? 'One mark before the first catch belongs to no stroke and is left out.'
      : `${String(n)} marks before the first catch belong to no stroke and are left out.`,
  none: 'No strokes marked yet.',
  noneCanMark: 'No strokes marked yet. Step to a catch and press I, or the Catch button.',
  refusal: {
    last_stroke: 'last stroke',
    no_finish: 'finish missing',
    two_finishes: 'two finishes',
  } as Record<StrokeRefusal, string>,
  jump: (n: number, time: string) => `Go to the catch of stroke ${String(n)} (${time})`,
  loop: 'Loop',
  loopStroke: (n: number) => `Loop stroke ${String(n)}`,
  failed: 'Could not save the mark. Check your connection and try again.',
  readOnly: 'Coaches mark the strokes; you see them and their timings.',
};

const nl: typeof en = {
  strokes: 'Halen',
  notes: 'Notities',
  mark: 'Markeren op dit frame',
  kinds: { catch: 'Inpik', half_slide: 'Halve bank', finish: 'Uitpik' },
  keys: { catch: 'I', half_slide: 'H', finish: 'U' },
  markHint: 'Stap naar het frame en druk op de knop of de toets. Nog een keer weghalen.',
  keyHintMark: 'I H U inpik / halve bank / uitpik',
  keyHintJump: '↑ ↓ vorige / volgende inpik',
  markLabel: (kind: string, stroke: number | null, frame: number) =>
    stroke === null
      ? `${kind}, frame ${String(frame)}`
      : `${kind}, haal ${String(stroke)}, frame ${String(frame)}`,
  number: 'Nr.',
  drive: 'Haal',
  recovery: 'Oprijden',
  ratio: 'Verhouding',
  rate: 'Tempo',
  seconds: 's',
  spm: 'h/min',
  averages: (n: number) => `Gemiddeld over ${String(n)} halen`,
  spread: (spm: string) => `tempo wisselt ± ${spm} h/min`,
  tooFew: (n: number) =>
    `Gemiddelden vanaf 3 volledige halen (inpik, uitpik en de volgende inpik); nu ${String(n)}.`,
  loose: (n: number) =>
    n === 1
      ? 'Eén markering vóór de eerste inpik hoort bij geen haal en telt niet mee.'
      : `${String(n)} markeringen vóór de eerste inpik horen bij geen haal en tellen niet mee.`,
  none: 'Nog geen halen gemarkeerd.',
  noneCanMark: 'Nog geen halen gemarkeerd. Stap naar een inpik en druk op I, of op Inpik.',
  refusal: {
    last_stroke: 'laatste haal',
    no_finish: 'uitpik ontbreekt',
    two_finishes: 'twee uitpikken',
  },
  jump: (n: number, time: string) => `Naar de inpik van haal ${String(n)} (${time})`,
  loop: 'Lus',
  loopStroke: (n: number) => `Haal ${String(n)} in een lus`,
  failed:
    'De markering kon niet worden opgeslagen. Controleer je verbinding en probeer het opnieuw.',
  readOnly: 'Coaches markeren de halen; jij ziet ze met hun tijden.',
};

export type StrokeStrings = typeof en;

export function strokeStrings(): StrokeStrings {
  return lang() === 'nl' ? nl : en;
}
