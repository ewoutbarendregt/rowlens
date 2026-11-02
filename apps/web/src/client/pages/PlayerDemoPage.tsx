import { useEffect, useMemo, useState } from 'react';
import { lang } from '../i18n/language.ts';
import { useSearchParams } from 'react-router';
import { appUrl } from '../env.ts';
import { Player } from '../player/Player.tsx';
import type { PlayerMeasurement } from '../player/usePlayer.ts';

// Dev-only spike page (#51, behind features.playerDemo). Copy is in English and Dutch here; it moves
// to the i18n catalogs (#34) if the page outlives the spike.

interface DemoClip {
  id: string;
  label: string;
  src: string;
  fps: number;
  gop: string;
  height: number;
}

const copy = {
  en: {
    title: 'Player demo',
    intro:
      'Spike for frame-accurate playback. Every synthetic frame shows its own number, so a step that lands on the wrong frame is visible at once.',
    clip: 'Clip',
    missing: 'No demo clips yet. Run `pnpm demo:media` in the repository and reload.',
    measurements: 'Measurements',
    start: 'First frame ready',
    steps: 'Step → frame shown',
    last: 'last',
    median: 'median',
    max: 'max',
    reset: 'Reset',
    keys: 'Keyboard',
    keyList: [
      ['Space / K', 'play / pause'],
      [', .', '−1 / +1 frame'],
      ['← →', '−0.1 / +0.1 s (Shift: 1 s)'],
      ['1 2 3', '0.25× 0.5× 1×'],
      ['[ ]', 'loop start / end'],
      ['L', 'loop on / off'],
      ['F', 'full screen'],
    ],
  },
  nl: {
    title: 'Speler-demo',
    intro:
      'Spike voor frame-nauwkeurig afspelen. Elke synthetische frame toont zijn eigen nummer, dus een stap die op de verkeerde frame landt zie je meteen.',
    clip: 'Clip',
    missing: 'Nog geen democlips. Voer `pnpm demo:media` uit in de repository en herlaad.',
    measurements: 'Metingen',
    start: 'Eerste frame klaar',
    steps: 'Stap → frame zichtbaar',
    last: 'laatste',
    median: 'mediaan',
    max: 'max',
    reset: 'Wissen',
    keys: 'Toetsenbord',
    keyList: [
      ['Spatie / K', 'afspelen / pauzeren'],
      [', .', '−1 / +1 frame'],
      ['← →', '−0,1 / +0,1 s (Shift: 1 s)'],
      ['1 2 3', '0,25× 0,5× 1×'],
      ['[ ]', 'begin / einde lus'],
      ['L', 'lus aan / uit'],
      ['F', 'volledig scherm'],
    ],
  },
} as const;

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1
    ? (sorted[mid] ?? 0)
    : ((sorted[mid - 1] ?? 0) + (sorted[mid] ?? 0)) / 2;
}

const ms = (value: number | undefined) => (value === undefined ? '–' : `${value.toFixed(0)} ms`);

export function PlayerDemoPage() {
  const t = copy[lang()];
  const [clips, setClips] = useState<DemoClip[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [params, setParams] = useSearchParams();
  const [startMs, setStartMs] = useState<number | undefined>();
  const [steps, setSteps] = useState<number[]>([]);

  useEffect(() => {
    fetch(appUrl('/demo-media/manifest.json'))
      .then((res) => (res.ok ? (res.json() as Promise<DemoClip[]>) : Promise.reject(new Error())))
      .then(setClips)
      .catch(() => {
        setFailed(true);
      });
  }, []);

  const clip = useMemo(() => {
    if (clips === null) return undefined;
    return clips.find((c) => c.id === params.get('clip')) ?? clips[0];
  }, [clips, params]);

  const onMeasure = useMemo(
    () => (m: PlayerMeasurement) => {
      if (m.kind === 'start') setStartMs(m.ms);
      else setSteps((prev) => [...prev.slice(-199), m.ms]);
    },
    [],
  );

  return (
    <main className="demo">
      <h1>{t.title}</h1>
      <p className="demo__intro">{t.intro}</p>

      {failed && <p className="demo__missing">{t.missing}</p>}

      {clips !== null && clip !== undefined && (
        <>
          <label className="demo__clip">
            {t.clip}{' '}
            <select
              value={clip.id}
              onChange={(e) => {
                setStartMs(undefined);
                setSteps([]);
                setParams({ clip: e.target.value });
              }}
            >
              {clips.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.label}
                </option>
              ))}
            </select>
          </label>

          <Player
            key={clip.id}
            src={appUrl(`/demo-media/${clip.src}`)}
            fps={clip.fps}
            onMeasure={onMeasure}
          />

          <section className="demo__panel" aria-labelledby="demo-measurements">
            <h2 id="demo-measurements">{t.measurements}</h2>
            <dl>
              <dt>{t.start}</dt>
              <dd data-testid="measure-start">{ms(startMs)}</dd>
              <dt>{t.steps}</dt>
              <dd data-testid="measure-steps">
                {t.last} {ms(steps.at(-1))} · {t.median}{' '}
                {ms(steps.length > 0 ? median(steps) : undefined)} · {t.max}{' '}
                {ms(steps.length > 0 ? Math.max(...steps) : undefined)} · n={steps.length}
              </dd>
            </dl>
            <button
              type="button"
              onClick={() => {
                setSteps([]);
              }}
            >
              {t.reset}
            </button>
          </section>

          <section className="demo__panel" aria-labelledby="demo-keys">
            <h2 id="demo-keys">{t.keys}</h2>
            <dl className="demo__keys">
              {t.keyList.map(([key, what]) => (
                <div key={key}>
                  <dt>
                    <kbd>{key}</kbd>
                  </dt>
                  <dd>{what}</dd>
                </div>
              ))}
            </dl>
          </section>
        </>
      )}
    </main>
  );
}
