import { type PointerEvent, useEffect, useId, useRef, useState } from 'react';
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
  /** `measure`: an angle measurement; `boat`: the boat line, dashed. */
  variant?: 'measure' | 'boat';
}

interface DrawingLayerProps {
  /** The picture's display size in pixels (after rotation): the layer's coordinate system. */
  size: Size;
  /** Drawings on the frame on screen. */
  drawings: readonly Drawing[];
  /** The tool in use; `null`: the layer lets every tap through to the video. */
  tool: DrawingKind | null;
  onComplete: (kind: DrawingKind, points: Point[]) => void;
  onCancel: () => void;
}

/** A press on the picture: a tap that may place a point, or a point being dragged. */
type Press =
  | { kind: 'tap'; pointerId: number; x: number; y: number; at: number; moved: number }
  | { kind: 'drag'; pointerId: number; index: number; x: number; y: number; from: Point };

/**
 * Lines, arrows and angles over the picture (#60), and the points of angle measurements and boat
 * lines (ADR-0017). The SVG's viewBox is the picture's own pixel size and it scales like the video
 * (`meet` = `object-fit: contain`), so drawings sit exactly on the picture at any size, with black
 * bars, and in full screen.
 *
 * Made for fingers (Ewout's coaches on an iPhone, 2026-11-03): a point is placed only by a short,
 * still tap (a swipe, a second finger or a long press places nothing); once placed, every point can
 * be dragged, at half speed with a finger so it can be put precisely and isn't hidden under it; and
 * nothing is saved until Save (or Enter). Backspace takes the last point back, Esc cancels.
 */
export function DrawingLayer({ size, drawings, tool, onComplete, onCancel }: DrawingLayerProps) {
  const t = notesStrings();
  const svg = useRef<SVGSVGElement>(null);
  const arrowId = useId();
  const [pending, setPending] = useState<Point[]>([]);
  const [hover, setHover] = useState<Point | null>(null);
  const press = useRef<Press | null>(null);
  const fingers = useRef(new Set<number>());
  const needed = tool === null ? 0 : POINTS_NEEDED[tool];
  const complete = tool !== null && pending.length >= needed;

  // A new tool (or none) starts afresh.
  useEffect(() => {
    setPending([]);
    setHover(null);
    press.current = null;
  }, [tool]);

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
    if (tool === null) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCancel();
      else if (e.key === 'Enter') {
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
  }, [tool, onCancel]);

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
  /** The placed point within a fingertip of the press, if any. */
  const handleAt = (e: PointerEvent<SVGSVGElement>): number | null => {
    const matrix = svg.current?.getScreenCTM();
    if (matrix === null || matrix === undefined) return null;
    let best: { index: number; distance: number } | null = null;
    pending.forEach((point, index) => {
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
    const index = handleAt(e);
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

  const onPointerMove = (e: PointerEvent<SVGSVGElement>) => {
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
  };

  // Stroke widths and text in picture pixels, scaled to the picture so they read the same on a
  // phone clip and a 4K one.
  const unit = Math.max(size.width, size.height) / 400;
  const preview =
    tool === null
      ? null
      : {
          id: 'preview',
          kind: tool,
          points: hover === null || complete ? pending : [...pending, hover],
        };

  return (
    <>
      <svg
        ref={svg}
        className={`drawing-layer${tool === null ? '' : ' drawing-layer--active'}`}
        viewBox={`0 0 ${String(size.width)} ${String(size.height)}`}
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
        {drawings.map((d) => (
          <Shape key={d.id} drawing={d} size={size} unit={unit} arrowId={arrowId} />
        ))}
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
      {tool !== null && pending.length > 0 && (
        <div className="drawing-confirm" role="group" aria-label={t.draw}>
          <span className="drawing-confirm__hint">
            {complete ? t.drawAdjust : t.drawPoints(pending.length, needed)}
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
        </div>
      )}
    </>
  );
}

function Shape({
  drawing,
  size,
  unit,
  arrowId,
}: {
  drawing: Drawing;
  size: Size;
  unit: number;
  arrowId: string;
}) {
  const pts = drawing.points.map((p) => toPixels(p, size));
  const [a, b, c] = pts;
  if (a === undefined) return null;
  const stroke = {
    strokeWidth: unit * 2.5,
    // The boat line is a reference, not a drawing: dashed, in picture units like the rest.
    ...(drawing.variant === 'boat'
      ? { strokeDasharray: `${String(unit * 8)} ${String(unit * 6)}` }
      : {}),
  };
  const halo = { strokeWidth: unit * 5 };
  if (b === undefined)
    return <circle cx={a[0]} cy={a[1]} r={unit * 2} className="drawing__point" />;

  const segment = (from: readonly number[], to: readonly number[], arrow: boolean) => (
    <>
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
  const text = { fontSize: unit * 12, strokeWidth: unit * 2 };
  if (drawing.kind !== 'angle' || c === undefined) {
    return (
      <g data-kind={drawing.kind} className={variant}>
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
    <g data-kind="angle" className={variant}>
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
