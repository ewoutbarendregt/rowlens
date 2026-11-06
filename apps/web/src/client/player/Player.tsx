import {
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
  type Ref,
  useCallback,
  useEffect,
  useId,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from 'react';
import { Icon } from '../ui/icons.tsx';
import { PressButton } from '../ui/PressButton.tsx';
import { formatFrameTime } from './frames.ts';
import {
  MAX_ZOOM,
  NO_ZOOM,
  panBy,
  pictureAt as zoomPictureAt,
  type View,
  ViewContext,
  ZOOM_STEP,
  zoomAt,
} from './zoom.ts';
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
  /** Moments shown above the scrub bar (notes, #59); tapping one jumps to its frame. */
  markers?: readonly PlayerMarker[];
  /** Lets the page seek and pause, e.g. when a note in a list is chosen. */
  handle?: Ref<PlayerHandle>;
  /** The page's tools for the picture (draw, notes on video, quality): a row above it (mockup 1e). */
  toolbar?: ReactNode;
  /** Frame actions kept immediately above the picture, including on phones and in fullscreen. */
  frameTools?: ReactNode;
  /** Drawn over the picture inside the stage, so it goes into full screen too (#60). */
  overlay?: ReactNode;
  /** Hosts drawing controls beside the picture, inside fullscreen too. */
  drawingControlsRef?: Ref<HTMLDivElement>;
  /** The page's own shortcuts, added to the line of keys (e.g. "N notes on/off"). */
  keyHints?: readonly string[];
  /** While the page draws on the picture, a one-finger or mouse drag is the drawing's, not a pan. */
  panLocked?: boolean;
  /** Stroke marks (#85) on a strip under the note markers: the catch an arrow down, the finish an
   * arrow up (Ewout, 2026-11-03), the half slide a tick; clicking one jumps there. */
  strokeMarks?: readonly PlayerStrokeMark[];
}

export interface PlayerStrokeMark {
  frame: number;
  /** `drive_middle`: computed, not marked (halfway between catch and finish). */
  kind: 'catch' | 'half_slide' | 'finish' | 'drive_middle';
  /** e.g. "Catch, stroke 3, frame 412". */
  label: string;
}

export interface PlayerMarker {
  id: string;
  frame: number;
  /** Accessible name, e.g. "Note at frame 120: blade late". */
  label: string;
}

export interface PlayerHandle {
  seekToFrame: (frame: number) => void;
  pause: () => void;
  /** Loops `in`…`out` (inclusive) and goes to `in`, e.g. one stroke. */
  setLoop: (loopIn: number, loopOut: number) => void;
}

const SPEED_KEYS: Record<string, Speed> = { '1': 0.25, '2': 0.5, '3': 1 };

function isTyping(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return target.isContentEditable || ['INPUT', 'SELECT', 'TEXTAREA'].includes(target.tagName);
}

export function Player({
  src,
  fps,
  poster,
  startFrame,
  onFrame,
  onMeasure,
  markers,
  handle,
  toolbar,
  frameTools,
  overlay,
  drawingControlsRef,
  keyHints = [],
  strokeMarks,
  panLocked = false,
}: PlayerProps) {
  const t = playerStrings();
  const p = usePlayer(onMeasure === undefined ? { src, fps } : { src, fps, onMeasure });

  const start = useRef(startFrame);
  useEffect(() => {
    if (p.ready && start.current !== undefined && start.current > 0) {
      p.seekToFrame(start.current);
      start.current = undefined;
    }
  }, [p.ready, p]);

  useImperativeHandle(
    handle,
    () => ({
      seekToFrame: (frame: number) => {
        p.seekToFrame(frame);
      },
      pause: () => {
        if (p.playing) p.togglePlay();
      },
      setLoop: (loopIn: number, loopOut: number) => {
        p.setLoop({ in: loopIn, out: loopOut });
        p.seekToFrame(loopIn);
      },
    }),
    [p],
  );

  const frameCallback = useRef(onFrame);
  frameCallback.current = onFrame;
  useEffect(() => {
    frameCallback.current?.(p.frame);
  }, [p.frame]);

  // Zooming into the picture (2026-11-03): pinch, ⌘/Ctrl + wheel, + − 0, the corner buttons; a drag
  // pans while zoomed. Only the video is transformed; the drawing layer follows through ViewContext,
  // and the stage, its corner controls and everything below keep their place.
  const [view, setView] = useState<View>(NO_ZOOM);
  const viewRef = useRef(view);
  viewRef.current = view;
  const stageRef = useRef<HTMLDivElement>(null);
  const [box, setBox] = useState<{ width: number; height: number } | null>(null);
  /** The displayed picture inside the stage (object-fit: contain), in screen pixels. */
  const pictureBox = useCallback(() => {
    const el = stageRef.current;
    if (el === null) return null;
    const r = el.getBoundingClientRect();
    const aspect = p.aspect ?? r.width / Math.max(1, r.height);
    let width = r.width;
    let height = width / aspect;
    if (height > r.height) {
      height = r.height;
      width = height * aspect;
    }
    return {
      left: r.left + (r.width - width) / 2,
      top: r.top + (r.height - height) / 2,
      width,
      height,
    };
  }, [p.aspect]);
  useEffect(() => {
    const el = stageRef.current;
    if (el === null) return;
    const measure = () => {
      const b = pictureBox();
      if (b !== null) setBox({ width: b.width, height: b.height });
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => {
      observer.disconnect();
    };
  }, [pictureBox]);
  /** The picture point (fractions) under a screen point. */
  const pointAt = useCallback(
    (clientX: number, clientY: number) => {
      const b = pictureBox();
      if (b === null) return { x: 0.5, y: 0.5 };
      return zoomPictureAt(
        viewRef.current,
        (clientX - b.left) / b.width,
        (clientY - b.top) / b.height,
      );
    },
    [pictureBox],
  );
  const zoomBy = useCallback((factor: number) => {
    setView((v) => zoomAt(v, factor, { x: v.cx, y: v.cy }));
  }, []);

  /** Fingers (or the mouse) down on the stage. */
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  // ⌘/Ctrl + wheel and a trackpad pinch (which arrives as a wheel with ctrlKey) zoom at the cursor.
  useEffect(() => {
    const el = stageRef.current;
    if (el === null) return;
    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey && !e.metaKey) return;
      e.preventDefault();
      const factor = Math.min(ZOOM_STEP, Math.max(1 / ZOOM_STEP, Math.exp(-e.deltaY * 0.01)));
      const at = pointAt(e.clientX, e.clientY);
      setView((v) => zoomAt(v, factor, at));
    };
    // Safari sends its own gesture events for a pinch. Never let them zoom the page. On a Mac
    // trackpad they are the only pinch Safari reports, so they zoom the picture; on an iPhone the
    // fingers' pointer events already do (pointers on the stage), so they're ignored there.
    let gestureFrom: { view: View; at: { x: number; y: number } } | null = null;
    const onGesture = (e: Event) => {
      e.preventDefault();
      const g = e as Event & { scale?: number; clientX?: number; clientY?: number };
      if (pointers.current.size > 0 || typeof g.scale !== 'number') return;
      if (e.type === 'gesturestart') {
        gestureFrom = { view: viewRef.current, at: pointAt(g.clientX ?? 0, g.clientY ?? 0) };
      } else if (gestureFrom !== null) {
        setView(zoomAt(gestureFrom.view, g.scale, gestureFrom.at));
      }
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    el.addEventListener('gesturestart', onGesture);
    el.addEventListener('gesturechange', onGesture);
    return () => {
      el.removeEventListener('wheel', onWheel);
      el.removeEventListener('gesturestart', onGesture);
      el.removeEventListener('gesturechange', onGesture);
    };
  }, [pointAt]);

  // Fingers and mouse on the stage: two fingers pinch (zoom and move), one drag pans when zoomed.
  const gesture = useRef<
    | { kind: 'pan'; x: number; y: number; from: View; moved: boolean }
    | {
        kind: 'pinch';
        distance: number;
        mid: { x: number; y: number };
        from: View;
        at: { x: number; y: number };
      }
    | null
  >(null);
  /** A drag that panned shouldn't also play or pause on release. */
  const swallowClick = useRef(false);
  const distanceOf = () => {
    const [a, b] = [...pointers.current.values()];
    return a === undefined || b === undefined ? 0 : Math.hypot(a.x - b.x, a.y - b.y);
  };
  const midOf = () => {
    const list = [...pointers.current.values()];
    return {
      x: list.reduce((sum, q) => sum + q.x, 0) / Math.max(1, list.length),
      y: list.reduce((sum, q) => sum + q.y, 0) / Math.max(1, list.length),
    };
  };
  const onStagePointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.current.size === 2) {
      const mid = midOf();
      gesture.current = {
        kind: 'pinch',
        distance: distanceOf(),
        mid,
        from: viewRef.current,
        at: pointAt(mid.x, mid.y),
      };
    } else if (pointers.current.size === 1 && viewRef.current.scale > 1 && !panLocked) {
      gesture.current = {
        kind: 'pan',
        x: e.clientX,
        y: e.clientY,
        from: viewRef.current,
        moved: false,
      };
    }
  };
  const onStagePointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (!pointers.current.has(e.pointerId)) return;
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const g = gesture.current;
    const b = pictureBox();
    if (g === null || b === null) return;
    if (g.kind === 'pinch' && pointers.current.size === 2) {
      const mid = midOf();
      const zoomed = zoomAt(g.from, distanceOf() / Math.max(1, g.distance), g.at);
      setView(panBy(zoomed, (mid.x - g.mid.x) / b.width, (mid.y - g.mid.y) / b.height));
      swallowClick.current = true;
    } else if (g.kind === 'pan') {
      const dx = e.clientX - g.x;
      const dy = e.clientY - g.y;
      if (!g.moved && Math.hypot(dx, dy) < 5) return;
      if (!g.moved) stageRef.current?.setPointerCapture(e.pointerId);
      g.moved = true;
      swallowClick.current = true;
      setView(panBy(g.from, dx / b.width, dy / b.height));
    }
  };
  const onStagePointerEnd = (e: ReactPointerEvent<HTMLDivElement>) => {
    pointers.current.delete(e.pointerId);
    if (pointers.current.size === 0) gesture.current = null;
    else if (gesture.current?.kind === 'pinch') gesture.current = null;
  };
  // The video's transform for the view: scaled about the stage's centre, the view's centre moved
  // there. Same mapping as the drawing layer's viewBox, so drawings stay on the picture.
  const videoTransform =
    view.scale === 1 || box === null
      ? undefined
      : `translate(${String(view.scale * (0.5 - view.cx) * box.width)}px, ${String(view.scale * (0.5 - view.cy) * box.height)}px) scale(${String(view.scale)})`;

  // Jumping to the previous and next stroke moment on the strip (Ewout, 2026-11-04): off without
  // marks, with a hint how to get them; off in a direction with no moment left.
  const momentsHintId = useId();
  const moments = useMemo(() => {
    if (strokeMarks === undefined) return null;
    const frames = [...new Set(strokeMarks.map((m) => m.frame))].sort((a, b) => a - b);
    return {
      frames,
      none: frames.length === 0,
      prev: frames.filter((f) => f < p.frame).at(-1) ?? null,
      next: frames.find((f) => f > p.frame) ?? null,
    };
  }, [strokeMarks, p.frame]);
  /** To the moment before or after the frame on screen, or after a jump still in flight (quick
   * taps go one moment further each), paused like a step. */
  const jumpMoment = (direction: -1 | 1) => {
    if (moments === null) return;
    const base = p.baseFrame();
    const to =
      direction === 1
        ? moments.frames.find((f) => f > base)
        : moments.frames.filter((f) => f < base).at(-1);
    if (to !== undefined) p.stepFrames(to - base);
  };

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
        case '+':
        case '=':
          zoomBy(ZOOM_STEP);
          break;
        case '-':
          zoomBy(1 / ZOOM_STEP);
          break;
        case '0':
          setView(NO_ZOOM);
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
      {toolbar !== undefined && <div className="player__toolbar">{toolbar}</div>}
      {frameTools}
      <div
        ref={stageRef}
        className={`player__stage${view.scale > 1 ? ' player__stage--zoomed' : ''}`}
        // The stage takes the picture's shape, so portrait video isn't a narrow strip (BUG-005).
        style={p.aspect === null ? undefined : ({ '--aspect': String(p.aspect) } as CSSProperties)}
        onPointerDown={onStagePointerDown}
        onPointerMove={onStagePointerMove}
        onPointerUp={onStagePointerEnd}
        onPointerCancel={onStagePointerEnd}
      >
        <video
          ref={p.videoRef}
          src={src}
          poster={poster}
          playsInline
          muted
          preload="auto"
          className="player__video"
          style={videoTransform === undefined ? undefined : { transform: videoTransform }}
          onClick={() => {
            if (swallowClick.current) {
              swallowClick.current = false;
              return;
            }
            p.togglePlay();
          }}
        />
        <ViewContext.Provider value={view}>{overlay}</ViewContext.Provider>
        <div className="player__zoom" role="group" aria-label={t.zoom} data-testid="zoom">
          <button
            type="button"
            aria-label={t.zoomOut}
            disabled={view.scale <= 1}
            onClick={() => {
              zoomBy(1 / ZOOM_STEP);
            }}
          >
            −
          </button>
          {view.scale > 1 && (
            <button
              type="button"
              aria-label={t.zoomReset}
              title={t.zoomReset}
              data-testid="zoom-level"
              onClick={() => {
                setView(NO_ZOOM);
              }}
            >
              {Math.round(view.scale * 100)}%
            </button>
          )}
          <button
            type="button"
            aria-label={t.zoomIn}
            disabled={view.scale >= MAX_ZOOM}
            onClick={() => {
              zoomBy(ZOOM_STEP);
            }}
          >
            +
          </button>
        </div>
      </div>

      {drawingControlsRef !== undefined && (
        <div className="player__drawing-controls" ref={drawingControlsRef} />
      )}

      {/* Mockup 1e: the moments above the track, the track, then where you are. */}
      {markers !== undefined && markers.length > 0 && (
        <div className="player__markers" data-testid="player-markers">
          {markers.map((m) => (
            <button
              key={m.id}
              type="button"
              className={`player__marker${m.frame === p.frame ? ' player__marker--here' : ''}`}
              style={{ left: `${String((m.frame / last) * 100)}%` }}
              aria-label={m.label}
              title={m.label}
              onClick={() => {
                p.seekToFrame(m.frame);
              }}
            />
          ))}
        </div>
      )}
      {strokeMarks !== undefined && strokeMarks.length > 0 && (
        // Out of the tab order and the accessibility tree: a video holds hundreds of these. The
        // strokes table and ↑ / ↓ reach them from the keyboard.
        <div className="player__strokes" data-testid="stroke-marks" aria-hidden="true">
          {strokeMarks.map((m) => (
            <button
              key={m.frame}
              type="button"
              tabIndex={-1}
              className={`player__stroke player__stroke--${m.kind}`}
              style={{ left: `${String((m.frame / last) * 100)}%` }}
              title={m.label}
              data-frame={m.frame}
              data-kind={m.kind}
              onClick={() => {
                p.seekToFrame(m.frame);
              }}
            >
              {m.kind === 'catch' && <Icon name="arrowDown" size={14} strokeWidth={2.75} />}
              {m.kind === 'finish' && <Icon name="arrowUp" size={14} strokeWidth={2.75} />}
            </button>
          ))}
        </div>
      )}
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

      <div className="player__readout" aria-live="off">
        <span>
          {t.frame} <strong data-testid="player-frame">{p.frame}</strong> / {p.count - 1}
        </span>
        <span>
          {formatFrameTime(p.frame, fps)} · {p.rate}×
          {!p.exact && (
            <span className="player__approx" title={t.approximate}>
              {' '}
              ≈
            </span>
          )}
        </span>
      </div>

      {/* Speed | previous moment, steps around a round play button, next moment | loop and full
          screen. */}
      <div className="player__controls" role="toolbar" aria-label={t.controls}>
        <div className="player__group player__speed" role="group" aria-label={t.speed}>
          <span className="player__label" aria-hidden="true">
            {t.speedShort}
          </span>
          {SPEEDS.map((speed) => (
            <PressButton
              key={speed}
              type="button"
              aria-pressed={p.rate === speed}
              onPress={() => {
                p.setRate(speed);
              }}
            >
              {speed}×
            </PressButton>
          ))}
        </div>

        {/* Previous moment, the steps, next moment: one block, except on a phone. */}
        <div className="player__stepbar">
          {moments !== null && (
            <div className="player__group player__prev-moment">
              <button
                type="button"
                aria-label={t.prevMoment}
                title={moments.prev === null ? undefined : t.prevMoment}
                aria-describedby={moments.none ? momentsHintId : undefined}
                disabled={moments.prev === null}
                data-testid="prev-moment"
                onClick={() => {
                  jumpMoment(-1);
                }}
              >
                <Icon name="rewind" size={18} />
              </button>
            </div>
          )}
          <div className="player__group player__steps">
            <button type="button" aria-label={t.secondBack} {...back1s}>
              −1s
            </button>
            <button type="button" aria-label={t.tenthBack} {...back01}>
              −.1s
            </button>
            <button type="button" aria-label={t.frameBack} {...back1f}>
              −1f
            </button>
            <PressButton
              type="button"
              className="player__play"
              aria-label={p.playing ? t.pause : t.play}
              onPress={p.togglePlay}
            >
              <Icon name={p.playing ? 'pause' : 'play'} size={22} />
            </PressButton>
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
          {moments !== null && (
            <div className="player__group player__next-moment">
              <button
                type="button"
                aria-label={t.nextMoment}
                title={moments.next === null ? undefined : t.nextMoment}
                aria-describedby={moments.none ? momentsHintId : undefined}
                disabled={moments.next === null}
                data-testid="next-moment"
                onClick={() => {
                  jumpMoment(1);
                }}
              >
                <Icon name="fastForward" size={18} />
              </button>
            </div>
          )}
        </div>

        <div className="player__group player__loop">
          <button type="button" aria-label={t.loopIn} onClick={p.setLoopIn}>
            [
          </button>
          <button
            type="button"
            aria-pressed={p.loopOn}
            disabled={p.loop === null}
            onClick={p.toggleLoop}
          >
            <Icon name="repeat" /> {t.loop}
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
            <Icon name={p.fullscreen ? 'minimize' : 'maximize'} />
          </button>
        </div>
      </div>
      {moments?.none === true && (
        <p className="player__moments-hint" id={momentsHintId} data-testid="moments-hint">
          {t.noMoments}
        </p>
      )}
      <p className="player__keys">{[t.keys, ...keyHints].join(' · ')}</p>
    </div>
  );
}
