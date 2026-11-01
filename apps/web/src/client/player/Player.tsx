import { useEffect, useMemo, useRef } from 'react';
import { formatFrameTime } from './frames.ts';
import { playerStrings } from './strings.ts';
import { SPEEDS, type PlayerMeasurement, type Speed, usePlayer } from './usePlayer.ts';
import { useHoldRepeat } from './useHoldRepeat.ts';

export interface PlayerProps {
  src: string;
  fps: number;
  /** Shown before the first frame decodes. */
  poster?: string;
  /** Frame to show once loaded, e.g. after switching rendition (remount with `key`). */
  startFrame?: number;
  /** Every presented frame; lets the page keep the position across a rendition switch. */
  onFrame?: (frame: number) => void;
  onMeasure?: (m: PlayerMeasurement) => void;
}

const SPEED_KEYS: Record<string, Speed> = { '1': 0.25, '2': 0.5, '3': 1 };

function isTyping(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return target.isContentEditable || ['INPUT', 'SELECT', 'TEXTAREA'].includes(target.tagName);
}

export function Player({ src, fps, poster, startFrame, onFrame, onMeasure }: PlayerProps) {
  const t = useMemo(() => playerStrings(), []);
  const p = usePlayer(onMeasure === undefined ? { src, fps } : { src, fps, onMeasure });

  const start = useRef(startFrame);
  useEffect(() => {
    if (p.ready && start.current !== undefined && start.current > 0) {
      p.seekToFrame(start.current);
      start.current = undefined;
    }
  }, [p.ready, p]);

  const frameCallback = useRef(onFrame);
  frameCallback.current = onFrame;
  useEffect(() => {
    frameCallback.current?.(p.frame);
  }, [p.frame]);

  // Keyboard shortcuts (ADR-0007). Buttons keep their own Space/Enter; the scrub slider keeps arrows.
  // Subscribed once; reads the latest player state through a ref (it changes every frame).
  const latest = useRef(p);
  latest.current = p;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const p = latest.current;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const onButton = e.target instanceof HTMLButtonElement;
      if (e.key === 'Escape' && p.immersive) {
        p.exitImmersive();
        return;
      }
      if (
        isTyping(e.target) &&
        !(e.target instanceof HTMLInputElement && e.target.type === 'range')
      ) {
        return;
      }
      const onSlider = e.target instanceof HTMLInputElement;
      let handled = true;
      switch (e.key) {
        case ' ':
        case 'k':
          if (onButton && e.key === ' ') return;
          p.togglePlay();
          break;
        case ',':
          p.stepFrames(-1);
          break;
        case '.':
          p.stepFrames(1);
          break;
        case 'ArrowLeft':
          if (onSlider) return;
          p.seekSeconds(e.shiftKey ? -1 : -0.1);
          break;
        case 'ArrowRight':
          if (onSlider) return;
          p.seekSeconds(e.shiftKey ? 1 : 0.1);
          break;
        case '[':
          p.setLoopIn();
          break;
        case ']':
          p.setLoopOut();
          break;
        case 'l':
          p.toggleLoop();
          break;
        case 'f':
          p.toggleFullscreen();
          break;
        default: {
          const speed = SPEED_KEYS[e.key];
          if (speed === undefined) handled = false;
          else p.setRate(speed);
        }
      }
      if (handled) e.preventDefault();
    };
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
    };
  }, []);

  const back1f = useHoldRepeat(() => {
    p.stepFrames(-1);
  });
  const fwd1f = useHoldRepeat(() => {
    p.stepFrames(1);
  });
  const back01 = useHoldRepeat(() => {
    p.seekSeconds(-0.1);
  });
  const fwd01 = useHoldRepeat(() => {
    p.seekSeconds(0.1);
  });
  const back1s = useHoldRepeat(() => {
    p.seekSeconds(-1);
  });
  const fwd1s = useHoldRepeat(() => {
    p.seekSeconds(1);
  });

  const last = Math.max(1, p.count - 1);
  const loopStyle =
    p.loop === null
      ? undefined
      : {
          left: `${String((p.loop.in / last) * 100)}%`,
          width: `${String(((p.loop.out - p.loop.in) / last) * 100)}%`,
        };

  return (
    <div
      ref={p.containerRef}
      className={`player${p.immersive ? ' player--immersive' : ''}${p.fullscreen ? ' player--fullscreen' : ''}`}
    >
      <div className="player__stage">
        <video
          ref={p.videoRef}
          src={src}
          poster={poster}
          playsInline
          muted
          preload="auto"
          className="player__video"
          onClick={p.togglePlay}
        />
      </div>

      <div className="player__readout" aria-live="off">
        <span>
          {t.frame} <strong data-testid="player-frame">{p.frame}</strong> / {p.count - 1}
        </span>
        <span>
          {formatFrameTime(p.frame, fps)} · {p.rate}×
        </span>
        {!p.exact && (
          <span className="player__approx" title={t.approximate}>
            ≈
          </span>
        )}
      </div>

      <div className="player__scrub">
        {loopStyle !== undefined && (
          <div
            className={`player__loop-region${p.loopOn ? ' player__loop-region--on' : ''}`}
            style={loopStyle}
          />
        )}
        <input
          type="range"
          min={0}
          max={last}
          step={1}
          value={p.frame}
          aria-label={t.position}
          onChange={(e) => {
            p.seekToFrame(Number(e.target.value));
          }}
        />
      </div>

      <div className="player__controls" role="toolbar" aria-label={t.controls}>
        <div className="player__group">
          <button type="button" aria-label={t.secondBack} {...back1s}>
            −1s
          </button>
          <button type="button" aria-label={t.tenthBack} {...back01}>
            −.1s
          </button>
          <button type="button" aria-label={t.frameBack} {...back1f}>
            −1f
          </button>
          <button
            type="button"
            className="player__play"
            aria-label={p.playing ? t.pause : t.play}
            onClick={p.togglePlay}
          >
            {p.playing ? '❚❚' : '▶'}
          </button>
          <button type="button" aria-label={t.frameForward} {...fwd1f}>
            +1f
          </button>
          <button type="button" aria-label={t.tenthForward} {...fwd01}>
            +.1s
          </button>
          <button type="button" aria-label={t.secondForward} {...fwd1s}>
            +1s
          </button>
        </div>

        <div className="player__group" role="group" aria-label={t.speed}>
          {SPEEDS.map((speed) => (
            <button
              key={speed}
              type="button"
              aria-pressed={p.rate === speed}
              onClick={() => {
                p.setRate(speed);
              }}
            >
              {speed}×
            </button>
          ))}
        </div>

        <div className="player__group">
          <button type="button" aria-label={t.loopIn} onClick={p.setLoopIn}>
            [
          </button>
          <button
            type="button"
            aria-pressed={p.loopOn}
            disabled={p.loop === null}
            onClick={p.toggleLoop}
          >
            {t.loop}
          </button>
          <button type="button" aria-label={t.loopOut} onClick={p.setLoopOut}>
            ]
          </button>
          <button
            type="button"
            aria-label={t.loopClear}
            disabled={p.loop === null}
            onClick={p.clearLoop}
          >
            ✕
          </button>
          <button
            type="button"
            aria-label={p.fullscreen ? t.exitFullscreen : t.fullscreen}
            onClick={p.toggleFullscreen}
          >
            ⛶
          </button>
        </div>
      </div>
    </div>
  );
}
