import { Fragment, useId, useState } from 'react';
import { locale } from '../i18n/language.ts';
import { formatFrameTime } from '../player/frames.ts';
import { Icon } from '../ui/icons.tsx';
import { ConfirmInline } from '../ui/ConfirmInline.tsx';
import {
  type Measured,
  STROKE_MARK_KINDS,
  type StrokeMark,
  type StrokeMarkKind,
  type StrokeSummary,
} from '../../shared/strokes.ts';
import { strokeStrings } from './strings.ts';

interface StrokesPanelProps {
  summary: StrokeSummary;
  marks: readonly StrokeMark[];
  fps: number;
  /** The frame on screen: the mark buttons act on it. */
  frame: number;
  /** Coaches of the session and the admin (#85); others see the table only. */
  canMark: boolean;
  busy: boolean;
  failed: boolean;
  onMark: (kind: StrokeMarkKind) => void;
  onRemove: (frame: number) => void;
  onJump: (frame: number) => void;
  onLoop: (loopIn: number, loopOut: number) => void;
  /** The computed middle of the drive on the timeline (per device, off by default). */
  driveMiddle: boolean;
  onDriveMiddleChange: (on: boolean) => void;
}

/**
 * Strokes from the coach's marks (#85, ADR-0016): the mark buttons for the frame on screen, then
 * a row per stroke with its timings, each from the frames it shows, or why it can't be given.
 */
export function StrokesPanel(props: StrokesPanelProps) {
  const t = strokeStrings();
  const id = useId();
  const [editing, setEditing] = useState<number | null>(null);
  const [removing, setRemoving] = useState<number | null>(null);
  const { summary } = props;
  const here = props.marks.find((m) => m.frame === props.frame)?.kind ?? null;
  const number = (digits: number) =>
    new Intl.NumberFormat(locale(), {
      minimumFractionDigits: digits,
      maximumFractionDigits: digits,
    });
  const show = (m: Measured, digits: number, unit = '') =>
    m.ok ? `${number(digits).format(m.value)}${unit}` : null;
  // Drive : recovery as rowers say it, "1 : 2.1".
  const ratio = (m: Measured) => (m.ok ? `1 : ${number(1).format(1 / m.value)}` : null);
  const complete = summary.strokes.filter((s) => s.rate.ok && s.ratio.ok).length;

  const markList = (marks: readonly StrokeMark[]) => (
    <ul className="strokes__moments">
      {marks.map((mark) => (
        <li key={mark.frame} data-testid="stroke-mark" data-frame={mark.frame}>
          <button
            type="button"
            className="button--quiet strokes__mark-jump"
            onClick={() => {
              props.onJump(mark.frame);
            }}
          >
            {t.markAt(t.kinds[mark.kind], formatFrameTime(mark.frame, props.fps), mark.frame)}
          </button>
          {removing === mark.frame ? (
            <ConfirmInline
              question={t.confirmRemove(t.kinds[mark.kind], mark.frame)}
              onConfirm={() => {
                setRemoving(null);
                props.onRemove(mark.frame);
              }}
              onCancel={() => {
                setRemoving(null);
              }}
            />
          ) : (
            <button
              type="button"
              className="button--quiet strokes__delete"
              aria-label={t.removeMark(t.kinds[mark.kind], mark.frame)}
              disabled={props.busy}
              onClick={() => {
                setRemoving(mark.frame);
              }}
            >
              <Icon name="trash" />
            </button>
          )}
        </li>
      ))}
    </ul>
  );

  return (
    <section className="card strokes" aria-labelledby={`${id}-h`} data-testid="strokes">
      <h2 id={`${id}-h`} className="visually-hidden">
        {t.strokes}
      </h2>

      {props.canMark ? (
        <div className="strokes__mark" role="group" aria-label={t.mark}>
          {STROKE_MARK_KINDS.map((kind) => (
            <button
              key={kind}
              type="button"
              className="button--quiet"
              aria-pressed={here === kind}
              aria-keyshortcuts={t.keys[kind]}
              disabled={props.busy}
              onClick={() => {
                props.onMark(kind);
              }}
            >
              {t.kinds[kind]} <kbd>{t.keys[kind]}</kbd>
            </button>
          ))}
          <p className="muted strokes__hint">{t.markHint}</p>
        </div>
      ) : (
        <p className="muted strokes__hint">{t.readOnly}</p>
      )}
      {props.failed && (
        <p role="alert" className="error">
          {t.failed}
        </p>
      )}

      {props.canMark && summary.loose.length > 0 && (
        <div data-testid="stroke-loose-marks">
          <p className="muted">{t.loose(summary.loose.length)}</p>
          {markList(props.marks.filter((mark) => summary.loose.includes(mark.frame)))}
        </div>
      )}

      <label className="strokes__option">
        <input
          type="checkbox"
          checked={props.driveMiddle}
          onChange={(e) => {
            props.onDriveMiddleChange(e.target.checked);
          }}
        />
        <span>
          {t.driveMiddleToggle}
          <span className="muted strokes__option-hint">{t.driveMiddleHint}</span>
        </span>
      </label>

      {summary.strokes.length === 0 ? (
        <p className="muted">{props.canMark ? t.noneCanMark : t.none}</p>
      ) : (
        <>
          {summary.averages === null ? (
            <p className="muted strokes__averages" role="status">
              {t.tooFew(complete)}
            </p>
          ) : (
            <dl className="strokes__averages" data-testid="stroke-averages">
              <dt>{t.averages(summary.averages.count)}</dt>
              <dd>
                <span>
                  {t.rate} <strong>{number(1).format(summary.averages.rate)}</strong> {t.spm}
                </span>
                <span>
                  {t.drive} <strong>{number(2).format(summary.averages.drive)}</strong> {t.seconds}
                </span>
                <span>
                  {t.recovery} <strong>{number(2).format(summary.averages.recovery)}</strong>{' '}
                  {t.seconds}
                </span>
                <span>
                  {t.ratio} <strong>1 : {number(1).format(1 / summary.averages.ratio)}</strong>
                </span>
                <span className="muted">
                  {t.spread(number(1).format(summary.averages.rateSpread))}
                </span>
              </dd>
            </dl>
          )}
          {!props.canMark && summary.loose.length > 0 && (
            <p className="muted">{t.loose(summary.loose.length)}</p>
          )}

          <div className="table-wrap">
            <table className="table strokes__table" data-testid="stroke-table">
              <thead>
                <tr>
                  <th scope="col">{t.number}</th>
                  <th scope="col" className="num">
                    {t.drive}
                  </th>
                  <th scope="col" className="num">
                    {t.recovery}
                  </th>
                  <th scope="col" className="num">
                    {t.ratio}
                  </th>
                  <th scope="col" className="num">
                    {t.rate}
                  </th>
                  <th scope="col">
                    <span className="visually-hidden">{t.actions}</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {summary.strokes.map((s) => {
                  const current =
                    props.frame >= s.catch && (s.nextCatch === null || props.frame < s.nextCatch);
                  const at = formatFrameTime(s.catch, props.fps);
                  return (
                    <Fragment key={s.catch}>
                      <tr
                        data-frame={s.catch}
                        aria-current={current ? 'true' : undefined}
                        data-testid="stroke-row"
                      >
                        <td>
                          <button
                            type="button"
                            className="strokes__jump"
                            aria-label={t.jump(s.number, at)}
                            title={at}
                            onClick={() => {
                              props.onJump(s.catch);
                            }}
                          >
                            {s.number}
                          </button>
                        </td>
                        {/* Without a single finish there is no drive, recovery or ratio: say why once. */}
                        {!s.drive.ok ? (
                          <td colSpan={3} className="num muted">
                            {t.refusal[s.drive.reason]}
                          </td>
                        ) : (
                          <>
                            <td className="num">{show(s.drive, 2)}</td>
                            <td className="num">
                              {show(s.recovery, 2) ?? (
                                <span className="muted">
                                  {!s.recovery.ok && t.refusal[s.recovery.reason]}
                                </span>
                              )}
                            </td>
                            <td className="num">
                              {ratio(s.ratio) ?? <span className="muted">–</span>}
                            </td>
                          </>
                        )}
                        <td className="num">
                          {show(s.rate, 1) ?? (
                            <span className="muted">{!s.rate.ok && t.refusal[s.rate.reason]}</span>
                          )}
                        </td>
                        <td>
                          <div className="strokes__actions">
                            {s.nextCatch !== null && (
                              <button
                                type="button"
                                className="button--quiet strokes__loop"
                                aria-label={t.loopStroke(s.number)}
                                title={t.loopStroke(s.number)}
                                onClick={() => {
                                  if (s.nextCatch !== null) props.onLoop(s.catch, s.nextCatch - 1);
                                }}
                              >
                                <Icon name="repeat" />
                              </button>
                            )}
                            {props.canMark && (
                              <button
                                type="button"
                                className="button--quiet strokes__delete"
                                aria-label={t.editStroke(s.number)}
                                aria-expanded={editing === s.catch}
                                aria-controls={`${id}-moments-${String(s.catch)}`}
                                disabled={props.busy}
                                onClick={() => {
                                  setEditing(editing === s.catch ? null : s.catch);
                                  setRemoving(null);
                                }}
                              >
                                <Icon name="trash" />
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                      {props.canMark && editing === s.catch && (
                        <tr
                          className="strokes__editor"
                          id={`${id}-moments-${String(s.catch)}`}
                          data-testid="stroke-row-editor"
                        >
                          <td colSpan={6}>
                            <p className="muted">{t.chooseMoment}</p>
                            {markList(
                              props.marks.filter(
                                (mark) =>
                                  mark.frame >= s.catch &&
                                  (s.nextCatch === null || mark.frame < s.nextCatch),
                              ),
                            )}
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
    </section>
  );
}
