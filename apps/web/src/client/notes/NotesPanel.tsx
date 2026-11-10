import { type SubmitEvent, useEffect, useId, useState } from 'react';
import { api } from '../api.ts';
import { angleDegrees, type DrawingKind, type Point, type Size } from '../drawing/geometry.ts';
import { formatFrameTime } from '../player/frames.ts';
import { RowerPicker } from '../rowers/RowerPicker.tsx';
import type { Rower } from '../rowers/useRoster.ts';
import { ConfirmInline } from '../ui/ConfirmInline.tsx';
import {
  framesFor,
  type MomentRowers,
  type MomentShares,
  rowersWithNotes,
  toggleCrew,
  toggleRower,
} from './assignees.ts';
import { moments } from './moments.ts';
import { notesStrings } from './strings.ts';

/** A note (#59) or a drawing (#60) at one frame, as the API returns it. */
export interface Annotation {
  id: string;
  frame: number;
  kind: 'note' | DrawingKind;
  body: string;
  shape: { points: Point[] } | null;
  authorName: string;
  createdAt: string;
  /** Written by the viewer (#40). */
  mine?: boolean;
  /** Server-derived author/role permission, including writable training scope (ADR-0020). */
  canEdit?: boolean;
}

const editable = (a: Annotation) => a.canEdit !== false;

export { moments };

/** How a drawing reads in a list or a marker, e.g. "Angle 128°". */
export function describeDrawing(a: Pick<Annotation, 'kind' | 'shape'>, size: Size): string {
  const t = notesStrings();
  const [p0, p1, p2] = a.shape?.points ?? [];
  if (a.kind === 'angle' && p0 !== undefined && p1 !== undefined && p2 !== undefined) {
    return t.drawing.angle(Math.round(angleDegrees(p0, p1, p2, size)));
  }
  return a.kind === 'arrow' ? t.drawing.arrow : t.drawing.line;
}

interface NotesPanelProps {
  canEdit: boolean;
  videoId: string;
  fps: number;
  frame: number;
  /** The picture's display size, for angle values in the list. */
  size: Size;
  annotations: Annotation[];
  /** The server-controlled name of the signed-in account that writes new notes. */
  authorName: string | undefined;
  onChanged: () => void;
  /** `reveal`: also bring the video into view (the section's Frame link), not for clicks in a section. */
  onJump: (frame: number, reveal: boolean) => void;
  onWriting: () => void;
  /** Who each note is for (#105), from the annotations response. */
  momentRowers: MomentRowers[];
  /** Who each note is shared with (#112). */
  momentShares: MomentShares[];
  /** The active club roster, to pick rowers from. */
  roster: Rower[];
  shareRoster?: Rower[];
  /** The session lineup with seats, offered first. */
  suggestions: readonly { id: string; label: string; name?: string }[];
  onRosterChanged: () => void;
  /** Shared with the player overlay: both surfaces always show the same rower's notes. */
  forRower: string | null;
  onForRowerChange: (rowerId: string | null) => void;
  /** The viewer's own roster entry, offered as "My notes". */
  myRowerId?: string | undefined;
}

/**
 * Notes and drawings per frame (#59, #60; Ewout's feedback): one section per frame with its
 * drawings and an always-open explanation field. Clicking a section jumps there; the section of
 * the frame on screen is the selected one. A frame without a section gets the field at the top.
 */
export function NotesPanel(props: NotesPanelProps) {
  const { videoId, fps, frame, size, annotations } = props;
  const t = notesStrings();
  const editableHere = (a: Annotation) => props.canEdit && editable(a);
  const id = useId();
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  // What is waiting for an in-page "yes": `moment-<frame>` or `drawing-<id>`.
  const [confirming, setConfirming] = useState<string | null>(null);

  const run = (request: Promise<Response>) => {
    setBusy(true);
    setFailed(false);
    return request
      .then((res) => {
        if (!res.ok) throw new Error(String(res.status));
        props.onChanged();
        return true;
      })
      .catch(() => {
        setFailed(true);
        return false;
      })
      .finally(() => {
        setBusy(false);
      });
  };

  const everything = moments(annotations);
  const hasSectionHere = everything.some((m) => m.frame === frame);
  const withNotes = rowersWithNotes(props.momentRowers);
  const filter = props.forRower;
  const shown = framesFor(props.momentRowers, filter);
  const all = shown === null ? everything : everything.filter((m) => shown.has(m.frame));
  const rowersAt = new Map(props.momentRowers.map((m) => [m.frame, m.rowers]));
  const sharesAt = new Map(props.momentShares.map((m) => [m.frame, m]));

  /** Creates, changes or (when emptied) removes the explanation of a frame. */
  const saveExplanation = (at: number, note: Annotation | undefined, text: string) => {
    const body = text.trim();
    if (note === undefined) {
      return run(
        api(`/api/videos/${videoId}/annotations`, {
          method: 'POST',
          body: { kind: 'note', frame: at, body },
        }),
      );
    }
    if (body === '') return run(api(`/api/annotations/${note.id}`, { method: 'DELETE' }));
    return run(api(`/api/annotations/${note.id}`, { method: 'PATCH', body: { body } }));
  };

  return (
    <section className="card notes" aria-labelledby={`${id}-h`}>
      {/* Mockup 1e: the title with its count, and whose notes, in one row. */}
      <div className="notes__head">
        <h2 id={`${id}-h`}>
          {t.notes} <span className="notes__count">· {everything.length}</span>
        </h2>
        {(withNotes.length > 0 || props.myRowerId !== undefined) && (
          <div className="notes__filter">
            {/* Labelled by `for`, not by wrapping: its name stays "Notes for", without the choice. */}
            <label htmlFor={`${id}-for`}>{t.notesFor}</label>
            <select
              id={`${id}-for`}
              value={filter ?? ''}
              onChange={(e) => {
                props.onForRowerChange(e.target.value === '' ? null : e.target.value);
              }}
            >
              <option value="">{t.everyone}</option>
              {props.myRowerId !== undefined && (
                <option value={props.myRowerId}>{t.myNotes}</option>
              )}
              {withNotes
                .filter((r) => r.id !== props.myRowerId)
                .map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.displayName}
                  </option>
                ))}
            </select>
          </div>
        )}
      </div>

      {props.canEdit && props.authorName !== undefined && (
        <p className="notes__author">{t.writingAs(props.authorName)}</p>
      )}

      {props.canEdit && !hasSectionHere && (
        <Explanation
          key={`new-${String(frame)}`}
          label={t.atFrame(frame, formatFrameTime(frame, fps))}
          placeholder={t.placeholder}
          initial=""
          canSave
          busy={busy}
          saveLabel={t.save}
          onFocus={props.onWriting}
          onSave={(text) => saveExplanation(frame, undefined, text)}
        />
      )}

      {failed && (
        <p role="alert" className="error">
          {t.failed}
        </p>
      )}

      {everything.length === 0 && (
        <p className="muted">{props.canEdit ? t.none : t.noneReadOnly}</p>
      )}
      {filter !== null && all.length === 0 && (
        <p className="muted">
          {t.noneFor(withNotes.find((r) => r.id === filter)?.displayName ?? '')}
        </p>
      )}
      <ol className="list" data-testid="notes">
        {all.map(({ frame: at, notes, drawings }) => {
          const time = formatFrameTime(at, fps);
          const selected = at === frame;
          // The field is the viewer's to write in: a coach edits the frame's explanation, a rower
          // their own remark; the rest shows read-only (#40).
          const explanation = notes.find(editableHere);
          const others = notes.filter((n) => n !== explanation);
          const canDeleteAll = [...notes, ...drawings].every(editableHere);
          return (
            <li
              key={at}
              className={`list__item moment${selected ? ' moment--selected' : ''}`}
              data-testid="moment"
              aria-current={selected ? 'true' : undefined}
              // The whole section is a target: clicking anywhere in it shows its frame.
              onClick={() => {
                if (!selected) props.onJump(at, false);
              }}
            >
              <div>
                <button
                  type="button"
                  className="note__jump"
                  aria-label={t.jump(at, time)}
                  onClick={(e) => {
                    e.stopPropagation();
                    props.onJump(at, true);
                  }}
                >
                  Frame {at} · {time}
                  {selected && <span className="moment__selected"> · {t.selected}</span>}
                </button>

                {drawings.length > 0 && (
                  <ul className="moment__drawings" aria-label={t.drawingsHere}>
                    {drawings.map((d) => {
                      const what = describeDrawing(d, size);
                      return (
                        <li key={d.id} className="chip" data-testid="drawing">
                          <span>{what}</span>
                          {editableHere(d) && (
                            <button
                              type="button"
                              className="chip__remove"
                              aria-label={t.deleteDrawing(what)}
                              disabled={busy}
                              onClick={(e) => {
                                e.stopPropagation();
                                void run(api(`/api/annotations/${d.id}`, { method: 'DELETE' }));
                              }}
                            >
                              ×
                            </button>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                )}

                <Assignees
                  readOnly={!props.canEdit}
                  videoId={videoId}
                  frame={at}
                  assigned={rowersAt.get(at) ?? []}
                  roster={props.roster}
                  suggestions={props.suggestions}
                  onChanged={props.onChanged}
                  onRosterChanged={props.onRosterChanged}
                />

                <Shares
                  readOnly={!props.canEdit}
                  videoId={videoId}
                  frame={at}
                  shares={sharesAt.get(at)}
                  roster={props.shareRoster ?? props.roster}
                  suggestions={props.suggestions}
                  onChanged={props.onChanged}
                  onRosterChanged={props.onRosterChanged}
                />

                {props.canEdit && (
                  <Explanation
                    key={
                      explanation === undefined
                        ? `none-${String(at)}`
                        : `${explanation.id}-${explanation.body}`
                    }
                    label={t.explanationAt(at)}
                    hideLabel
                    placeholder={t.explanationPlaceholder}
                    initial={explanation?.body ?? ''}
                    author={explanation?.authorName}
                    canSave
                    busy={busy}
                    saveLabel={t.update}
                    onFocus={props.onWriting}
                    onSave={(text) => saveExplanation(at, explanation, text)}
                  />
                )}

                {others.length > 0 && (
                  <div className="moment__others">
                    <span className="muted">{t.otherNotes}</span>
                    {others.map((n) => (
                      <div key={n.id} className="moment__note" data-testid="note">
                        <span className="muted">{n.authorName}</span>
                        <p className="note__body">{n.body}</p>
                      </div>
                    ))}
                  </div>
                )}

                <div className="moment__footer">
                  {!canDeleteAll ? null : confirming === `moment-${String(at)}` ? (
                    <ConfirmInline
                      question={t.confirmDeleteMoment(at)}
                      onConfirm={() => {
                        setConfirming(null);
                        void run(
                          api(`/api/videos/${videoId}/frames/${String(at)}/annotations`, {
                            method: 'DELETE',
                          }),
                        );
                      }}
                      onCancel={() => {
                        setConfirming(null);
                      }}
                    />
                  ) : (
                    <button
                      type="button"
                      className="button--quiet moment__delete"
                      onClick={(e) => {
                        e.stopPropagation();
                        setConfirming(`moment-${String(at)}`);
                      }}
                    >
                      {t.deleteMoment}
                    </button>
                  )}
                </div>
              </div>
            </li>
          );
        })}
      </ol>
    </section>
  );
}

/**
 * Who this note is for (#105), as in mockup 1e: a chip per seat of the session's lineup that turns
 * that rower on or off with one tap, "whole crew" as a switch, and for anyone outside the lineup a
 * chip with × and the picker. Every change is saved straight away, like deleting a drawing.
 */
function Assignees(props: {
  readOnly: boolean;
  videoId: string;
  frame: number;
  assigned: MomentRowers['rowers'];
  roster: Rower[];
  suggestions: readonly { id: string; label: string; name?: string }[];
  onChanged: () => void;
  onRosterChanged: () => void;
}) {
  const t = notesStrings();
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const ids = props.assigned.map((r) => r.id);
  const crew = props.suggestions.map((s) => s.id);
  const others = props.assigned.filter((r) => !crew.includes(r.id));
  const wholeCrewOn = crew.length > 0 && crew.every((id) => ids.includes(id));

  const save = (rowerIds: string[]) => {
    setBusy(true);
    setFailed(false);
    void api(`/api/videos/${props.videoId}/frames/${String(props.frame)}/rowers`, {
      method: 'PUT',
      body: { rowerIds },
    })
      .then((res) => {
        if (!res.ok) throw new Error(String(res.status));
        props.onChanged();
      })
      .catch(() => {
        setFailed(true);
      })
      .finally(() => {
        setBusy(false);
      });
  };

  if (props.readOnly)
    return (
      <p className="muted" data-testid="assignees">
        {t.assignedTo}: {props.assigned.map((r) => r.displayName).join(', ')}
      </p>
    );
  return (
    <div className="assignees" data-testid="assignees">
      <span className="assignees__label">{t.assignedTo}:</span>
      <ul className="assignees__list" aria-label={t.assignedTo}>
        {props.suggestions.map((seat) => {
          const on = ids.includes(seat.id);
          const name = seat.name ?? '';
          return (
            <li key={seat.id} data-testid={on ? 'assignee' : undefined}>
              <button
                type="button"
                className="chip chip--toggle"
                aria-pressed={on}
                aria-label={`${seat.label} · ${name}`}
                disabled={busy}
                onClick={() => {
                  save(toggleRower(ids, seat.id));
                }}
              >
                {seat.label} · {firstName(name)}
              </button>
            </li>
          );
        })}
        {crew.length > 1 && (
          <li>
            <button
              type="button"
              className="chip chip--toggle"
              aria-pressed={wholeCrewOn}
              disabled={busy}
              onClick={() => {
                save(toggleCrew(ids, crew));
              }}
            >
              {t.wholeCrew}
            </button>
          </li>
        )}
        {others.map((r) => (
          <li key={r.id} className="chip chip--rower" data-testid="assignee">
            <span>
              {r.displayName}
              {r.archived && <span className="muted"> · {t.archived}</span>}
            </span>
            <button
              type="button"
              className="chip__remove"
              aria-label={t.unassign(r.displayName)}
              disabled={busy}
              onClick={() => {
                save(ids.filter((id) => id !== r.id));
              }}
            >
              ×
            </button>
          </li>
        ))}
      </ul>
      <div className="assignees__add">
        <RowerPicker
          label={t.assignPicker(props.frame)}
          rowers={props.roster}
          value={null}
          unavailable={new Set(ids)}
          suggested={props.suggestions}
          onChange={(r) => {
            if (r !== null) save([...ids, r.id]);
          }}
          onAdded={props.onRosterChanged}
        />
      </div>
      {failed && (
        <p role="alert" className="error">
          {t.failed}
        </p>
      )}
    </div>
  );
}

/** "Anna" from "Anna de Vries": the seat already tells crew members apart. */
const firstName = (name: string) => name.trim().split(/\s+/)[0] ?? name;

/**
 * Who this note is shared with (#112): rowers and/or the whole crew of the session. Anyone who can
 * see the note can share it; a share can be taken back by whoever made it, or by a coach.
 */
function Shares(props: {
  readOnly: boolean;
  videoId: string;
  frame: number;
  shares: MomentShares | undefined;
  roster: Rower[];
  suggestions: readonly { id: string; label: string }[];
  onChanged: () => void;
  onRosterChanged: () => void;
}) {
  const t = notesStrings();
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState<string | null>(null);
  const rowers = props.shares?.rowers ?? [];
  const crew = props.shares?.crew ?? null;
  const ids = rowers.map((r) => r.id);

  const save = (rowerIds: string[], withCrew: boolean) => {
    setBusy(true);
    setFailed(null);
    void api(`/api/videos/${props.videoId}/frames/${String(props.frame)}/shares`, {
      method: 'PUT',
      body: { rowerIds, crew: withCrew },
    })
      .then((res) => {
        if (!res.ok) throw new Error(String(res.status));
        props.onChanged();
      })
      .catch((error: unknown) => {
        setFailed(error instanceof Error && error.message === '403' ? t.notYours : t.failed);
      })
      .finally(() => {
        setBusy(false);
      });
  };

  if (props.readOnly)
    return (
      <div className="assignees shares" data-testid="shares">
        <span>{t.sharedWith}:</span>
        {crew !== null && <span data-testid="share">{t.wholeCrew}</span>}
        {rowers.map((r) => (
          <span key={r.id} data-testid="share">
            {r.displayName}
          </span>
        ))}
      </div>
    );
  return (
    <div className="assignees shares" data-testid="shares">
      <span className="assignees__label">{t.sharedWith}:</span>
      {(crew !== null || rowers.length > 0) && (
        <ul className="assignees__list">
          {crew !== null && (
            <li className="chip chip--share" data-testid="share">
              <span>
                {t.wholeCrew}
                {crew.sharedBy !== null && <span className="muted"> · {t.by(crew.sharedBy)}</span>}
              </span>
              {crew.canUnshare && (
                <button
                  type="button"
                  className="chip__remove"
                  aria-label={t.unshareCrew}
                  disabled={busy}
                  onClick={() => {
                    save(ids, false);
                  }}
                >
                  ×
                </button>
              )}
            </li>
          )}
          {rowers.map((r) => (
            <li key={r.id} className="chip chip--share" data-testid="share">
              <span>
                {r.displayName}
                {r.sharedBy !== null && <span className="muted"> · {t.by(r.sharedBy)}</span>}
              </span>
              {r.canUnshare && (
                <button
                  type="button"
                  className="chip__remove"
                  aria-label={t.unshare(r.displayName)}
                  disabled={busy}
                  onClick={() => {
                    save(
                      ids.filter((id) => id !== r.id),
                      crew !== null,
                    );
                  }}
                >
                  ×
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
      <div className="assignees__add">
        <RowerPicker
          label={t.sharePicker(props.frame)}
          rowers={props.roster}
          value={null}
          unavailable={new Set(ids)}
          suggested={props.suggestions}
          onChange={(r) => {
            if (r !== null) save([...ids, r.id], crew !== null);
          }}
          onAdded={props.onRosterChanged}
        />
        {crew === null && (
          <button
            type="button"
            className="button--quiet assignees__crew"
            disabled={busy}
            onClick={() => {
              save(ids, true);
            }}
          >
            {t.shareWithCrew}
          </button>
        )}
      </div>
      {failed !== null && (
        <p role="alert" className="error">
          {failed}
        </p>
      )}
    </div>
  );
}

/**
 * An always-open explanation field. Save appears once the text differs from what is stored;
 * a section's explanation saved empty is removed.
 */
function Explanation(props: {
  label: string;
  hideLabel?: boolean;
  placeholder: string;
  initial: string;
  author?: string | undefined;
  canSave: boolean;
  busy: boolean;
  saveLabel: string;
  onFocus: () => void;
  onSave: (text: string) => Promise<boolean>;
}) {
  const t = notesStrings();
  const id = useId();
  const [text, setText] = useState(props.initial);
  useEffect(() => {
    setText(props.initial);
  }, [props.initial]);
  const dirty = text.trim() !== props.initial.trim();
  const isNew = props.initial === '';

  const submit = (e: SubmitEvent<HTMLFormElement>) => {
    e.preventDefault();
    void props.onSave(text).then((ok) => {
      if (ok && isNew) setText('');
    });
  };

  return (
    <form className="form explanation" onSubmit={submit} data-testid="note">
      <label htmlFor={id} className={props.hideLabel === true ? 'visually-hidden' : undefined}>
        {props.label}
      </label>
      {props.author !== undefined && <span className="muted">{props.author}</span>}
      <textarea
        id={id}
        value={text}
        rows={isNew ? 2 : 3}
        maxLength={2000}
        placeholder={props.placeholder}
        onFocus={props.onFocus}
        onChange={(e) => {
          setText(e.target.value);
        }}
      />
      {dirty && (
        <div className="note__actions">
          <button
            type="submit"
            disabled={props.busy || !props.canSave || (isNew && text.trim() === '')}
          >
            {props.saveLabel}
          </button>
          <button
            type="button"
            className="button--quiet"
            onClick={() => {
              setText(props.initial);
            }}
          >
            {t.cancel}
          </button>
        </div>
      )}
    </form>
  );
}
