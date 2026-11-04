import { lang } from '../i18n/language.ts';
// Player strings in NL and EN. Moves into the i18n catalogs with #34; kept here so no user-facing
// string is hard-coded in components in the meantime.
const en = {
  play: 'Play',
  pause: 'Pause',
  frameBack: 'Previous frame',
  frameForward: 'Next frame',
  tenthBack: 'Back 0.1 second',
  tenthForward: 'Forward 0.1 second',
  secondBack: 'Back 1 second',
  secondForward: 'Forward 1 second',
  speed: 'Playback speed',
  loopIn: 'Set loop start here',
  loopOut: 'Set loop end here',
  loop: 'Loop',
  loopClear: 'Clear loop',
  fullscreen: 'Full screen',
  exitFullscreen: 'Exit full screen',
  position: 'Position (frame)',
  frame: 'Frame',
  approximate: 'Approximate: this browser cannot report exact frames',
  controls: 'Player controls',
  prevMoment: 'Previous stroke moment',
  nextMoment: 'Next stroke moment',
  noMoments: 'Mark a stroke moment to jump there.',
  speedShort: 'Speed',
  keys: 'Space play · , . one frame · ← → 0.1 s (⇧ 1 s) · 1 2 3 speed · [ ] loop · L loop on/off · F full screen · + − 0 zoom',
  zoom: 'Zoom into the picture',
  zoomIn: 'Zoom in',
  zoomOut: 'Zoom out',
  zoomReset: 'Whole picture',
};

const nl: typeof en = {
  play: 'Afspelen',
  pause: 'Pauzeren',
  frameBack: 'Vorige frame',
  frameForward: 'Volgende frame',
  tenthBack: '0,1 seconde terug',
  tenthForward: '0,1 seconde vooruit',
  secondBack: '1 seconde terug',
  secondForward: '1 seconde vooruit',
  speed: 'Afspeelsnelheid',
  loopIn: 'Begin van de lus hier',
  loopOut: 'Einde van de lus hier',
  loop: 'Lus',
  loopClear: 'Lus wissen',
  fullscreen: 'Volledig scherm',
  exitFullscreen: 'Volledig scherm sluiten',
  position: 'Positie (frame)',
  frame: 'Frame',
  approximate: 'Bij benadering: deze browser meldt geen exacte frames',
  controls: 'Bediening van de speler',
  prevMoment: 'Vorig haalmoment',
  nextMoment: 'Volgend haalmoment',
  noMoments: 'Geef een haalmoment aan om daarheen te springen.',
  speedShort: 'Snelheid',
  keys: 'Spatie afspelen · , . één frame · ← → 0,1 s (⇧ 1 s) · 1 2 3 snelheid · [ ] lus · L lus aan/uit · F volledig scherm · + − 0 zoom',
  zoom: 'Inzoomen op het beeld',
  zoomIn: 'Inzoomen',
  zoomOut: 'Uitzoomen',
  zoomReset: 'Heel beeld',
};

export type PlayerStrings = typeof en;

export function playerStrings(language: string = lang()): PlayerStrings {
  return language.toLowerCase().startsWith('nl') ? nl : en;
}
