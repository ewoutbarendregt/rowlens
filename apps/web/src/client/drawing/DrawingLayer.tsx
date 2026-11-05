import {
  type PointerEvent,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useId,
  useRef,
  useState,
} from 'react';
import { createPortal } from 'react-dom';
import { ViewContext, viewBoxOf } from '../player/zoom.ts';
import { notesStrings } from '../notes/strings.ts';
import {
  angleArc,
  angleDegrees,
  dragPoint,
  type DrawingKind,
  HANDLE_REACH,
  isTap,
  type Point,
  POINTS_NEEDED,
  type Size,
  toFraction,
  toPixels,
} from './geometry.ts';

export interface Drawing {
  id: string;
  kind: DrawingKind;
  points: readonly Point[];
  /** Shown with the shape, e.g. the rower of an angle measurement (ADR-0017). */
  label?: string;
  /** `measure`: an angle measurement; `boat`: a coach's boat line, dashed; `auto`: the boat line
   * found by the worker, dotted (ADR-0018). */
  variant?: 'measure' | 'boat' | 'auto';
  /** The frame it belongs to: a note's frame, the frame a boat line starts at (#141). */
  frame?: number;
  /** The viewer may move it; the page knows that from the API and the role (#141). */
  editable?: boolean;
}

interface DrawingLayerProps {
  /** The picture's display size in pixels (after rotation): the layer's coordinate system. */
  size: Size;
  /** Drawings on the frame on screen. */
  drawings: readonly Drawing[];
  /** The tool in use; `null`: the layer selects saved drawings instead of drawing new ones. */
  tool: DrawingKind | null;
  onComplete: (kind: DrawingKind, points: Point[]) => void;
  onCancel: () => void;
  /** A saved drawing was moved and let go (#141). */
  onMove: (drawing: Drawing, points: Point[]) => void;
  /** A drawing was selected, or nothing is selected any more: the page pauses the player. */
  onSelect?: (drawing: Drawing | null) => void;
  /** Control strip inside the player, outside the picture so no point is obscured. */
  controlsTarget: HTMLElement | null;
  /** What the drawing is about (a measurement's rower and joint), beside its controls. */
  attributes?: ReactNode;
}

/** A press while drawing: a tap that may place a point, or a point being dragged. */
type Press =
  | { kind: 'tap'; pointerId: number; x: number; y: number; at: number; moved: number }
  | { kind: 'drag'; pointerId: number; index: number; x: number; y: number; from: Point };

/** A saved drawing's point being dragged (#141). */
interface Drag {
  pointerId: number;
  id: string;
  index: number;
  x: number;
  y: number;
  from: Point;
  /** The drawing's points as the press started; the drag is always measured from these. */
  start: readonly Point[];
  /** Where they are now. */
  points: Point[];
  /** The finger or mouse went somewhere: a press that didn't move saves nothing. */
  moved: boolean;
}

/**
 * Lines, arrows and angles over the picture (#60), the points of angle measurements and boat lines
 * (ADR-0017), and moving them after they were saved (#141). The SVG's viewBox is the picture's own
 * pixel size and it scales like the video (`meet` = `object-fit: contain`), so drawings sit exactly
 * on the picture at any size, with black bars, and in full screen. When the player is zoomed in, the
 * viewBox is the part in view (`ViewContext`), so drawings zoom with the video and lines and handles
 * keep their size on screen.
 *
 * Made for fingers (Ewout's coaches on an iPhone, 2026-11-03): a point is placed only by a short,
 * still tap (a swipe, a second finger or a long press places nothing); once placed, every point can
 * be dragged, at half speed with a finger so it can be put precisely and isn't hidden under it; and
 * nothing is saved until Save (or Enter). Backspace takes the last point back, Esc cancels.
 *
 * Tapping a saved drawing selects it and shows a ring on each of its points (#141); dragging a ring
 * moves that point — exactly with the mouse, at half speed with a finger — and letting go saves it.
 * A tap beside it deselects. Only what the viewer may change can be selected.
 */
export function DrawingLayer({
  size,
  drawings,
  tool,
  onComplete,
  onCancel,
  onMove,
  onSelect,
  controlsTarget,
  attributes,
}: DrawingLayerProps) {
  const view = useContext(ViewContext);
  const t = notesStrings();
  const svg = useRef<SVGSVGElement>(null);
  const arrowId = useId();
  const [pending, setPending] = useState<Point[]>([]);
  const [hover, setHover] = useState<Point | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [moving, setMoving] = useState<Drag | null>(null);
  const press = useRef<Press | null>(null);
  const drag = useRef<Drag | null>(null);
  /** The press started on the catcher, so the click that follows drops the selection. WebKit sends
   * the click to whatever is under the finger at release, which may be the catcher that appeared
   * when a drawing was just selected: that one must not drop it again. */
  const catcherPress = useRef(false);
  const fingers = useRef(new Set<number>());
  const needed = tool === null ? 0 : POINTS_NEEDED[tool];
  const complete = tool !== null && pending.length >= needed;

  const selected = drawings.find((d) => d.id === selectedId) ?? null;
  /** A drawing's points, following the finger while one of them is being dragged. */
  const pointsOf = useCallback(
    (drawing: Drawing): readonly Point[] =>
      moving !== null && moving.id === drawing.id ? moving.points : drawing.points,
    [moving],
  );

  const selectCallback = useRef(onSelect);
  selectCallback.current = onSelect;
  /** Selects a saved drawing, or nothing; the page pauses the player when something is selected. */
  const select = useCallback((drawing: Drawing | null) => {
    drag.current = null;
    setMoving(null);
    setSelectedId(drawing?.id ?? null);
    selectCallback.current?.(drawing);
  }, []);

  // A new tool (or none) starts afresh; drawing and moving don't mix (#141).
  useEffect(() => {
    setPending([]);
    setHover(null);
    press.current = null;
    if (tool !== null) {
      drag.current = null;
      setMoving(null);
      setSelectedId(null);
    }
  }, [tool]);

  // A drawing that leaves the picture (another frame) takes its handles with it.
  useEffect(() => {
    if (selectedId !== null && !drawings.some((d) => d.id === selectedId)) {
      drag.current = null;
      setMoving(null);
      setSelectedId(null);
    }
  }, [drawings, selectedId]);

  const save = () => {
    if (tool === null || pending.length < POINTS_NEEDED[tool]) return;
    const points = pending;
    setPending([]);
    setHover(null);
    onComplete(tool, points);
  };
  const latestSave = useRef(save);
  latestSave.current = save;

  useEffect(() => {
    if (tool === null && selected === null) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (tool === null) select(null);
        else onCancel();
        return;
      }
      if (tool === null) return;
      if (e.key === 'Enter') {
        e.preventDefault();
        latestSave.current();
      } else if (e.key === 'Backspace') {
        e.preventDefault();
        setPending((points) => points.slice(0, -1));
      }
    };
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
    };
  }, [tool, selected, onCancel, select]);

  /** Screen position → picture pixels (not clamped). */
  const pictureAt = (clientX: number, clientY: number): [number, number] | null => {
    const matrix = svg.current?.getScreenCTM();
    if (matrix === null || matrix === undefined) return null;
    const p = new DOMPoint(clientX, clientY).matrixTransform(matrix.inverse());
    return [p.x, p.y];
  };
  const pointAt = (e: PointerEvent<SVGSVGElement>): Point | null => {
    const p = pictureAt(e.clientX, e.clientY);
    return p === null ? null : toFraction(p[0], p[1], size);
  };
  /** The point of `points` within a fingertip of a press, if any. */
  const handleAt = (
    e: { clientX: number; clientY: number },
    points: readonly Point[],
  ): number | null => {
    const matrix = svg.current?.getScreenCTM();
    if (matrix === null || matrix === undefined) return null;
    let best: { index: number; distance: number } | null = null;
    points.forEach((point, index) => {
      const [px, py] = toPixels(point, size);
      const screen = new DOMPoint(px, py).matrixTransform(matrix);
      const distance = Math.hypot(screen.x - e.clientX, screen.y - e.clientY);
      if (distance <= HANDLE_REACH && (best === null || distance < best.distance)) {
        best = { index, distance };
      }
    });
    return (best as { index: number } | null)?.index ?? null;
  };

  const onPointerDown = (e: PointerEvent<SVGSVGElement>) => {
    if (tool === null) return;
    e.preventDefault();
    fingers.current.add(e.pointerId);
    // A second finger (a pinch, a palm) places nothing.
    if (fingers.current.size > 1) {
      press.current = null;
      return;
    }
    const index = handleAt(e, pending);
    const from = index === null ? undefined : pending[index];
    if (index !== null && from !== undefined) {
      svg.current?.setPointerCapture(e.pointerId);
      press.current = {
        kind: 'drag',
        pointerId: e.pointerId,
        index,
        x: e.clientX,
        y: e.clientY,
        from,
      };
      return;
    }
    press.current = {
      kind: 'tap',
      pointerId: e.pointerId,
      x: e.clientX,
      y: e.clientY,
      at: performance.now(),
      moved: 0,
    };
  };

  /** Pressing a ring of the selected drawing starts dragging that point (#141). */
  const startDrag = (e: PointerEvent<SVGElement>, drawing: Drawing, index: number) => {
    if (tool !== null) return;
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    const from = pointsOf(drawing)[index];
    if (from === undefined) return;
    // The layer's own move and up handlers follow it; the picture must not scroll under the finger.
    e.preventDefault();
    e.stopPropagation();
    svg.current?.setPointerCapture(e.pointerId);
    const started: Drag = {
      pointerId: e.pointerId,
      id: drawing.id,
      index,
      x: e.clientX,
      y: e.clientY,
      from,
      start: pointsOf(drawing),
      points: [...pointsOf(drawing)],
      moved: false,
    };
    drag.current = started;
    setMoving(started);
  };

  const onPointerMove = (e: PointerEvent<SVGSVGElement>) => {
    const dragging = drag.current;
    if (dragging !== null) {
      if (dragging.pointerId !== e.pointerId) return;
      const a = pictureAt(dragging.x, dragging.y);
      const b = pictureAt(e.clientX, e.clientY);
      if (a === null || b === null) return;
      // Exactly under the mouse; at half speed under a finger, so the point isn't hidden by it and
      // can be put precisely (Ewout, 2026-11-05).
      const factor = e.pointerType === 'mouse' ? 1 : 0.5;
      const moved = dragPoint(dragging.from, b[0] - a[0], b[1] - a[1], size, factor);
      const points = dragging.start.map((p, i) => (i === dragging.index ? moved : p));
      dragging.points = points;
      // A press that stays put (a fingertip on a ring) changes nothing, so it saves nothing.
      dragging.moved =
        dragging.moved || Math.hypot(e.clientX - dragging.x, e.clientY - dragging.y) > 2;
      setMoving({ ...dragging, points });
      return;
    }
    if (tool === null) return;
    const current = press.current;
    if (current?.pointerId === e.pointerId && current.kind === 'drag') {
      const a = pictureAt(current.x, current.y);
      const b = pictureAt(e.clientX, e.clientY);
      if (a === null || b === null) return;
      // A finger moves the point at half speed: fine control, and the point stays visible.
      const factor = e.pointerType === 'mouse' ? 1 : 0.5;
      const moved = dragPoint(current.from, b[0] - a[0], b[1] - a[1], size, factor);
      setPending((points) => points.map((p, i) => (i === current.index ? moved : p)));
      return;
    }
    if (current?.pointerId === e.pointerId && current.kind === 'tap') {
      current.moved = Math.max(
        current.moved,
        Math.hypot(e.clientX - current.x, e.clientY - current.y),
      );
    }
    if (pending.length > 0 && !complete && e.pointerType === 'mouse') setHover(pointAt(e));
  };

  const onPointerUp = (e: PointerEvent<SVGSVGElement>) => {
    fingers.current.delete(e.pointerId);
    const dragging = drag.current;
    if (dragging !== null) {
      if (dragging.pointerId !== e.pointerId) return;
      drag.current = null;
      setMoving(null);
      const drawing = drawings.find((d) => d.id === dragging.id);
      if (drawing !== undefined && dragging.moved) onMove(drawing, dragging.points);
      return;
    }
    const current = press.current;
    if (current?.pointerId !== e.pointerId) return;
    press.current = null;
    if (current.kind !== 'tap' || tool === null || complete) return;
    if (!isTap(current.moved, performance.now() - current.at)) return;
    const point = pointAt(e);
    if (point === null) return;
    setPending((points) => (points.length < POINTS_NEEDED[tool] ? [...points, point] : points));
  };

  const onPointerCancel = (e: PointerEvent<SVGSVGElement>) => {
    fingers.current.delete(e.pointerId);
    if (press.current?.pointerId === e.pointerId) press.current = null;
    if (drag.current?.pointerId === e.pointerId) {
      drag.current = null;
      setMoving(null);
    }
  };

  // Stroke widths and text in picture pixels, scaled to the picture so they read the same on a
  // phone clip and a 4K one; divided by the zoom so they keep their size on screen.
  const unit = Math.max(size.width, size.height) / 400 / view.scale;
  const preview =
    tool === null
      ? null
      : {
          id: 'preview',
          kind: tool,
          points: hover === null || complete ? pending : [...pending, hover],
        };
  const pickable = tool === null;

  return (
    <>
      <svg
        ref={svg}
        className={`drawing-layer${tool === null ? '' : ' drawing-layer--active'}`}
        viewBox={viewBoxOf(view, size)}
        preserveAspectRatio="xMidYMid meet"
        data-testid="drawing-layer"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerCancel}
        onPointerLeave={() => {
          setHover(null);
        }}
      >
        <defs>
          <marker
            id={arrowId}
            viewBox="0 0 10 10"
            refX="8"
            refY="5"
            markerWidth="4"
            markerHeight="4"
            orient="auto-start-reverse"
          >
            <path d="M 0 0 L 10 5 L 0 10 z" className="drawing__head" />
          </marker>
        </defs>
        {drawings.map((d) => {
          // Only what this viewer may change can be picked (#141).
          const pick =
            pickable && d.editable === true
              ? (e: PointerEvent<SVGGElement>) => {
                  e.stopPropagation();
                  select(d);
                }
              : undefined;
          return (
            <Shape
              key={d.id}
              drawing={{ ...d, points: pointsOf(d) }}
              size={size}
              unit={unit}
              arrowId={arrowId}
              selected={d.id === selectedId}
              {...(pick === undefined ? {} : { pick })}
            />
          );
        })}
        {pickable && selected !== null && (
          <g className="drawing__handles" data-testid="drawing-handles">
            {pointsOf(selected).map(([x, y], index) => {
              const [px, py] = toPixels([x, y], size);
              return (
                <g key={index} className="drawing__handle" data-index={index}>
                  {/* Big enough to see under a fingertip, and the exact point inside. */}
                  <circle
                    cx={px}
                    cy={py}
                    r={unit * 7}
                    className="drawing__handle-ring"
                    data-testid="drawing-handle"
                  />
                  <circle cx={px} cy={py} r={unit * 1.6} className="drawing__point" />
                </g>
              );
            })}
          </g>
        )}
        {/** Selected: a press on the picture either picks a point up or drops the selection. Sits on
         * top so no stroke can take the press away from a ring; the pick itself is in screen pixels,
         * so a fingertip finds a point at any zoom (#141). Dropping happens on the click, while the
         * press still belongs to this layer, so the video doesn't start playing. */}
        {pickable && selected !== null && (
          <rect
            className="drawing__catcher"
            x={0}
            y={0}
            width={size.width}
            height={size.height}
            data-testid="drawing-catcher"
            onPointerDown={(e) => {
              catcherPress.current = false;
              const index = handleAt(e, pointsOf(selected));
              if (index !== null) startDrag(e, selected, index);
              else catcherPress.current = true;
            }}
            onClick={() => {
              const wasHere = catcherPress.current;
              catcherPress.current = false;
              if (wasHere) select(null);
            }}
          />
        )}
        {preview !== null && preview.points.length > 0 && (
          <g className="drawing--preview">
            <Shape drawing={preview} size={size} unit={unit} arrowId={arrowId} />
            {pending.map(([x, y], i) => {
              const [px, py] = toPixels([x, y], size);
              return (
                <g key={i} className="drawing__handle">
                  {/* A ring big enough to see under a fingertip, and the exact point inside. */}
                  <circle cx={px} cy={py} r={unit * 7} className="drawing__handle-ring" />
                  <circle cx={px} cy={py} r={unit * 1.6} className="drawing__point" />
                </g>
              );
            })}
          </g>
        )}
      </svg>
      {tool !== null &&
        (pending.length > 0 || (attributes !== undefined && attributes !== null)) &&
        controlsTarget !== null &&
        createPortal(
          <div
            className="drawing-confirm"
            role="group"
            aria-label={t.draw}
            onPointerDown={(event) => {
              event.stopPropagation();
            }}
          >
            {attributes}
            <span className="drawing-confirm__hint">
              {complete
                ? t.drawAdjust
                : pending.length > 0
                  ? t.drawPoints(pending.length, needed)
                  : t.hints[tool]}
            </span>
            <button
              type="button"
              className="drawing-confirm__save"
              data-testid="drawing-save"
              disabled={!complete}
              onClick={save}
            >
              {t.drawSave}
            </button>
            <button
              type="button"
              onClick={() => {
                setPending([]);
                setHover(null);
              }}
            >
              {t.drawRedo}
            </button>
            <button type="button" onClick={onCancel}>
              {t.cancel}
            </button>
          </div>,
          controlsTarget,
        )}
    </>
  );
}

function Shape({
  drawing,
  size,
  unit,
  arrowId,
  selected = false,
  pick,
}: {
  drawing: Drawing;
  size: Size;
  unit: number;
  arrowId: string;
  /** Its points are showing, so the stroke reads as chosen. */
  selected?: boolean;
  /** Present when the viewer may select it by pressing it (#141). */
  pick?: (e: PointerEvent<SVGGElement>) => void;
}) {
  const pts = drawing.points.map((p) => toPixels(p, size));
  const [a, b, c] = pts;
  if (a === undefined) return null;
  const stroke = {
    strokeWidth: unit * 2.5,
    // The boat line is a reference, not a drawing: dashed, in picture units like the rest.
    ...(drawing.variant === 'boat'
      ? { strokeDasharray: `${String(unit * 8)} ${String(unit * 6)}` }
      : drawing.variant === 'auto'
        ? {
            strokeDasharray: `${String(unit * 2)} ${String(unit * 4)}`,
            strokeLinecap: 'round' as const,
          }
        : {}),
  };
  const halo = { strokeWidth: unit * 5 };
  if (b === undefined)
    return <circle cx={a[0]} cy={a[1]} r={unit * 2} className="drawing__point" />;

  const segment = (from: readonly number[], to: readonly number[], arrow: boolean) => (
    <>
      {pick !== undefined && (
        // Invisible and a fingertip wide: press here to select the drawing (#141).
        <line x1={from[0]} y1={from[1]} x2={to[0]} y2={to[1]} className="drawing__hit" />
      )}
      <line
        x1={from[0]}
        y1={from[1]}
        x2={to[0]}
        y2={to[1]}
        className="drawing__halo"
        style={halo}
      />
      <line
        x1={from[0]}
        y1={from[1]}
        x2={to[0]}
        y2={to[1]}
        className="drawing__line"
        style={stroke}
        markerEnd={arrow ? `url(#${arrowId})` : undefined}
      />
    </>
  );

  const variant = drawing.variant === undefined ? undefined : `drawing--${drawing.variant}`;
  const classes = [
    variant,
    selected ? 'drawing--selected' : '',
    pick === undefined ? '' : 'drawing--pickable',
  ]
    .filter((name) => name !== undefined && name !== '')
    .join(' ');
  const text = { fontSize: unit * 12, strokeWidth: unit * 2 };
  if (drawing.kind !== 'angle' || c === undefined) {
    return (
      <g
        data-kind={drawing.kind}
        className={classes === '' ? undefined : classes}
        onPointerDown={pick}
      >
        {segment(a, b, drawing.kind === 'arrow')}
        {drawing.label !== undefined && (
          <text
            x={(a[0] + b[0]) / 2 + unit * 4}
            y={(a[1] + b[1]) / 2 - unit * 4}
            className="drawing__label"
            style={text}
            data-testid="measure-label"
          >
            {drawing.label}
          </text>
        )}
      </g>
    );
  }
  const [pa, pv, pc] = drawing.points as [Point, Point, Point];
  const degrees = angleDegrees(pa, pv, pc, size);
  const radius =
    Math.min(
      Math.hypot(a[0] - b[0], a[1] - b[1]),
      Math.hypot(c[0] - b[0], c[1] - b[1]),
      unit * 25,
    ) * 0.6;
  return (
    <g data-kind="angle" className={classes === '' ? undefined : classes} onPointerDown={pick}>
      {segment(b, a, false)}
      {segment(b, c, false)}
      <path
        d={angleArc(pa, pv, pc, size, radius)}
        className="drawing__line drawing__arc"
        style={stroke}
      />
      <text
        x={b[0] + unit * 4}
        y={b[1] - unit * 4}
        className="drawing__label"
        style={text}
        data-testid={drawing.label === undefined ? 'angle-label' : 'measure-label'}
      >
        {Math.round(degrees)}°{drawing.label !== undefined && ` · ${drawing.label}`}
      </text>
    </g>
  );
}
