import { type SubmitEvent, useEffect, useId, useState } from 'react';
import { api } from '../api.ts';
import { angleDegrees, type DrawingKind, type Point, type Size } from '../drawing/geometry.ts';
import { formatFrameTime } from '../player/frames.ts';
import { ConfirmInline } from '../ui/ConfirmInline.tsx';
import { moments } from './moments.ts';
import { rememberName } from './name.ts';
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
}

export { moments };

/** How a drawing reads in a list or a marker, e.g. "Angle 128°". */
export function describeDrawing(a: Annotation, size: Size): string {
  const t = notesStrings();
  const [p0, p1, p2] = a.shape?.points ?? [];
  if (a.kind === 'angle' && p0 !== undefined && p1 !== undefined && p2 !== undefined) {
    return t.drawing.angle(Math.round(angleDegrees(p0, p1, p2, size)));
  }
  return a.kind === 'arrow' ? t.drawing.arrow : t.drawing.line;
}

interface NotesPanelProps {
  videoId: string;
  fps: number;
  frame: number;
  /** The picture's display size, for angle values in the list. */
  size: Size;
  annotations: Annotation[];
  name: string;
  onNameChange: (name: string) => void;
  onChanged: () => void;
  /** `reveal`: also bring the video into view (the section's Frame link), not for clicks in a section. */
  onJump: (frame: number, reveal: boolean) => void;
  onWriting: () => void;
}

/**
 * Notes and drawings per frame (#59, #60; Ewout's feedback): one section per frame with its
 * drawings and an always-open explanation field. Clicking a section jumps there; the section of
 * the frame on screen is the selected one. A frame without a section gets the field at the top.
 */
export function NotesPanel(props: NotesPanelProps) {
  const { videoId, fps, frame, size, annotations, name } = props;
  const t = notesStrings();
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

  const named = name.trim() !== '';
  const all = moments(annotations);
  const hasSectionHere = all.some((m) => m.frame === frame);

  /** Creates, changes or (when emptied) removes the explanation of a frame. */
  const saveExplanation = (at: number, note: Annotation | undefined, text: string) => {
    rememberName(name.trim());
    const body = text.trim();
    if (note === undefined) {
      return run(
        api(`/api/videos/${videoId}/annotations`, {
          method: 'POST',
          body: { kind: 'note', frame: at, body, authorName: name },
        }),
      );
    }
    if (body === '') return run(api(`/api/annotations/${note.id}`, { method: 'DELETE' }));
    return run(api(`/api/annotations/${note.id}`, { method: 'PATCH', body: { body } }));
  };

  return (
    <section className="card notes" aria-labelledby={`${id}-h`}>
      <h2 id={`${id}-h`}>{t.notes}</h2>

      <div className="form">
        <label htmlFor={`${id}-name`}>{t.yourName}</label>
        <input
          id={`${id}-name`}
          value={name}
          maxLength={60}
          autoComplete="name"
          onChange={(e) => {
            props.onNameChange(e.target.value);
          }}
          onBlur={() => {
            rememberName(name.trim());
          }}
          required
        />
      </div>

      {!hasSectionHere && (
        <Explanation
          key={`new-${String(frame)}`}
          label={t.atFrame(frame, formatFrameTime(frame, fps))}
          placeholder={t.placeholder}
          initial=""
          canSave={named}
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

      {all.length === 0 && <p className="muted">{t.none}</p>}
      <ol className="list" data-testid="notes">
        {all.map(({ frame: at, notes, drawings }) => {
          const time = formatFrameTime(at, fps);
          const selected = at === frame;
          const [explanation, ...others] = notes;
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
                          {confirming === `drawing-${d.id}` ? (
                            <ConfirmInline
                              compact
                              question={t.confirmDeleteDrawing(what)}
                              onConfirm={() => {
                                setConfirming(null);
                                void run(api(`/api/annotations/${d.id}`, { method: 'DELETE' }));
                              }}
                              onCancel={() => {
                                setConfirming(null);
                              }}
                            />
                          ) : (
                            <>
                              <span>{what}</span>
                              <button
                                type="button"
                                className="chip__remove"
                                aria-label={t.deleteDrawing(what)}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setConfirming(`drawing-${d.id}`);
                                }}
                              >
                                ×
                              </button>
                            </>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                )}

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
                  canSave={named || explanation !== undefined}
                  busy={busy}
                  saveLabel={t.update}
                  onFocus={props.onWriting}
                  onSave={(text) => saveExplanation(at, explanation, text)}
                />

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
                  {confirming === `moment-${String(at)}` ? (
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
