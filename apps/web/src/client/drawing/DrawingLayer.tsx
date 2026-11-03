import { type PointerEvent, useEffect, useId, useRef, useState } from 'react';
import {
  angleArc,
  angleDegrees,
  type DrawingKind,
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

/**
 * Lines, arrows and angles over the picture (#60). The SVG's viewBox is the picture's own pixel
 * size and it scales like the video (`meet` = `object-fit: contain`), so drawings sit exactly on
 * the picture at any size, with black bars, and in full screen.
 */
export function DrawingLayer({ size, drawings, tool, onComplete, onCancel }: DrawingLayerProps) {
  const svg = useRef<SVGSVGElement>(null);
  const arrowId = useId();
  const [pending, setPending] = useState<Point[]>([]);
  const [hover, setHover] = useState<Point | null>(null);

  // A new tool (or none) starts afresh.
  useEffect(() => {
    setPending([]);
    setHover(null);
  }, [tool]);

  useEffect(() => {
    if (tool === null) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCancel();
    };
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
    };
  }, [tool, onCancel]);

  const pointAt = (e: PointerEvent<SVGSVGElement>): Point | null => {
    const el = svg.current;
    const matrix = el?.getScreenCTM();
    if (el === null || matrix === null || matrix === undefined) return null;
    const p = new DOMPoint(e.clientX, e.clientY).matrixTransform(matrix.inverse());
    return toFraction(p.x, p.y, size);
  };

  const onPointerDown = (e: PointerEvent<SVGSVGElement>) => {
    if (tool === null) return;
    e.preventDefault();
    const point = pointAt(e);
    if (point === null) return;
    const next = [...pending, point];
    if (next.length >= POINTS_NEEDED[tool]) {
      setPending([]);
      setHover(null);
      onComplete(tool, next);
    } else {
      setPending(next);
    }
  };

  // Stroke widths and text in picture pixels, scaled to the picture so they read the same on a
  // phone clip and a 4K one.
  const unit = Math.max(size.width, size.height) / 400;
  const preview =
    tool === null
      ? null
      : { id: 'preview', kind: tool, points: hover === null ? pending : [...pending, hover] };

  return (
    <svg
      ref={svg}
      className={`drawing-layer${tool === null ? '' : ' drawing-layer--active'}`}
      viewBox={`0 0 ${String(size.width)} ${String(size.height)}`}
      preserveAspectRatio="xMidYMid meet"
      data-testid="drawing-layer"
      onPointerDown={onPointerDown}
      onPointerMove={(e) => {
        if (tool !== null && pending.length > 0 && e.pointerType === 'mouse') setHover(pointAt(e));
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
          {preview.points.map(([x, y], i) => {
            const [px, py] = toPixels([x, y], size);
            return <circle key={i} cx={px} cy={py} r={unit * 2} className="drawing__point" />;
          })}
        </g>
      )}
    </svg>
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
