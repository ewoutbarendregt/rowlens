import { useState } from 'react';
import {
  type AngleMeasure,
  type AngleTables,
  type Joint,
  JOINT_POINTS,
  JOINTS,
  measureValue,
  type Phase,
  PHASES,
  type BoatLine,
} from '../../shared/angles.ts';
import type { Size } from '../../shared/geometry.ts';
import { angleStrings, leanText } from './strings.ts';

/** What the picture is waiting for: the boat line, or a rower's joint. */
export type Measuring = { kind: 'boat_line' } | { kind: 'joint'; rowerId: string; joint: Joint };

interface AnglesPanelProps {
  tables: AngleTables;
  measures: readonly AngleMeasure[];
  boatLine: BoatLine | null;
  size: Size;
  /** The lineup first (seat · name), in boat order. */
  rowers: readonly { id: string; label: string; name: string }[];
  /** The phase of the frame on screen and its stroke, or null without a mark there. */
  here: { phase: Phase; stroke: number | null } | null;
  frame: number;
  canMeasure: boolean;
  /** Filmed from the boat or from above: angles aren't reliable (perspective rules). */
  notFromTheSide: boolean;
  measuring: Measuring | null;
  busy: boolean;
  failed: boolean;
  onMeasure: (m: Measuring | null) => void;
  onDelete: (id: string) => void;
  onRemoveBoatLine: () => void;
  onJump: (frame: number) => void;
}

/**
 * Angles per rower and phase (ADR-0017): the boat line, measuring on a marked frame, and a table
 * per joint with each rower's mean per phase and the difference in the crew.
 */
export function AnglesPanel(props: AnglesPanelProps) {
  const t = angleStrings();
  const [rowerId, setRowerId] = useState<string | null>(null);
  const [joint, setJoint] = useState<Joint>('knee');
  const nameOf = (id: string) => props.rowers.find((r) => r.id === id)?.name ?? '?';
  const degrees = (j: Joint, d: number) =>
    j === 'trunk' ? leanText(d, t) : `${String(Math.round(d))}°`;
  const onThisFrame = props.measures.filter((m) => m.frame === props.frame);
  const steps =
    props.measuring === null
      ? null
      : props.measuring.kind === 'boat_line'
        ? t.boatSteps
        : t.steps[props.measuring.joint];
  const chosen = props.rowers.some((r) => r.id === rowerId) ? rowerId : null;

  return (
    <section className="card angles" data-testid="angles">
      <h2 className="visually-hidden">{t.angles}</h2>
      {props.notFromTheSide && <p className="callout">{t.sideOnly}</p>}

      <div className="angles__boat">
        <span>
          <strong>{t.boatLine}</strong>{' '}
          <span className="muted">
            {props.boatLine === null ? t.boatLineMissing : t.boatLineSet}
          </span>
        </span>
        {props.canMeasure && (
          <span className="angles__boat-actions">
            <button
              type="button"
              className="button--quiet"
              aria-pressed={props.measuring?.kind === 'boat_line'}
              disabled={props.busy}
              onClick={() => {
                props.onMeasure(
                  props.measuring?.kind === 'boat_line' ? null : { kind: 'boat_line' },
                );
              }}
            >
              {props.boatLine === null ? t.drawBoatLine : t.redrawBoatLine}
            </button>
            {props.boatLine !== null && (
              <button
                type="button"
                className="button--quiet"
                disabled={props.busy}
                onClick={props.onRemoveBoatLine}
              >
                {t.removeBoatLine}
              </button>
            )}
          </span>
        )}
      </div>

      {steps !== null && (
        <p className="angles__prompt" role="status" data-testid="angle-prompt">
          {t.tap}{' '}
          {steps.map((step, i) => (
            <span key={step}>
              {i > 0 && ' · '}
              {String(i + 1)} {step}
            </span>
          ))}
          <button
            type="button"
            className="button--quiet"
            onClick={() => {
              props.onMeasure(null);
            }}
          >
            {t.cancel}
          </button>
        </p>
      )}

      {props.canMeasure ? (
        props.here === null ? (
          <p className="muted">{t.stepToMark}</p>
        ) : (
          <div className="angles__measure">
            <h3>{t.here(t.phases[props.here.phase], props.here.stroke)}</h3>
            <div className="angles__choice" role="group" aria-label={t.rower}>
              {props.rowers.map((r) => (
                <button
                  key={r.id}
                  type="button"
                  className="chip chip--toggle"
                  aria-pressed={chosen === r.id}
                  aria-label={`${r.label} · ${r.name}`}
                  onClick={() => {
                    setRowerId(r.id);
                  }}
                >
                  {r.label} · {r.name.trim().split(/\s+/)[0]}
                </button>
              ))}
            </div>
            <div className="angles__choice" role="group" aria-label={t.joint}>
              {JOINTS.map((j) => (
                <button
                  key={j}
                  type="button"
                  className="chip chip--toggle"
                  aria-pressed={joint === j}
                  onClick={() => {
                    setJoint(j);
                  }}
                >
                  {t.joints[j]}
                </button>
              ))}
            </div>
            <button
              type="button"
              disabled={chosen === null || props.busy}
              onClick={() => {
                if (chosen !== null) props.onMeasure({ kind: 'joint', rowerId: chosen, joint });
              }}
            >
              {t.measure} ({JOINT_POINTS[joint]})
            </button>
          </div>
        )
      ) : (
        <p className="muted">{t.readOnly}</p>
      )}
      {props.failed && (
        <p role="alert" className="error">
          {t.failed}
        </p>
      )}

      {onThisFrame.length > 0 && (
        <div className="angles__here">
          <h3>{t.onThisFrame}</h3>
          <ul>
            {onThisFrame.map((m) => {
              const value = measureValue(m, props.size, props.boatLine);
              const what = `${nameOf(m.rowerId)} · ${t.joints[m.joint]}`;
              return (
                <li key={m.id} data-testid="angle-here">
                  <span>
                    {what} <strong>{value.ok ? degrees(m.joint, value.degrees) : '–'}</strong>
                  </span>
                  {props.canMeasure && (
                    <button
                      type="button"
                      className="chip__remove"
                      aria-label={t.remove(what)}
                      disabled={props.busy}
                      onClick={() => {
                        props.onDelete(m.id);
                      }}
                    >
                      ×
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {props.tables.tables.length === 0 ? (
        <p className="muted">{t.none}</p>
      ) : (
        props.tables.tables.map((table) => {
          const phases = PHASES.filter((p) => table.rows.some((r) => r.cells[p] !== undefined));
          return (
            <div key={table.joint} className="angles__table" data-testid="angle-table">
              <h3>{t.joints[table.joint]}</h3>
              <div className="table-wrap">
                <table className="table">
                  <thead>
                    <tr>
                      <th scope="col">{t.rower}</th>
                      {phases.map((p) => (
                        <th key={p} scope="col" className="num">
                          {t.phases[p]}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {table.rows.map((row) => (
                      <tr key={row.rowerId}>
                        <th scope="row">{nameOf(row.rowerId)}</th>
                        {phases.map((p) => {
                          const cell = row.cells[p];
                          if (cell === undefined) return <td key={p} className="num muted" />;
                          const first = cell.frames[0] ?? 0;
                          return (
                            <td key={p} className="num">
                              <button
                                type="button"
                                className="angles__value"
                                title={t.values(
                                  cell.n,
                                  String(Math.round(cell.min)),
                                  String(Math.round(cell.max)),
                                )}
                                aria-label={`${t.jump(nameOf(row.rowerId), t.phases[p])}: ${degrees(table.joint, cell.mean)}`}
                                onClick={() => {
                                  props.onJump(first);
                                }}
                              >
                                {degrees(table.joint, cell.mean)}
                              </button>
                              <span className="muted angles__n"> n{cell.n}</span>
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                    {phases.some((p) => table.crewRange[p] !== undefined) && (
                      <tr className="angles__crew">
                        <th scope="row">{t.crew}</th>
                        {phases.map((p) => (
                          <td key={p} className="num">
                            {table.crewRange[p] === undefined
                              ? ''
                              : `${String(Math.round(table.crewRange[p]))}°`}
                          </td>
                        ))}
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          );
        })
      )}
      {props.tables.loose.length > 0 && (
        <p className="muted">{t.loose(props.tables.loose.length)}</p>
      )}
      {props.tables.refused.length > 0 && (
        <p className="muted">{t.needBoatLine(props.tables.refused.length)}</p>
      )}
    </section>
  );
}
