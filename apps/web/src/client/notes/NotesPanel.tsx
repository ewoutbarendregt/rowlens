import { type SubmitEvent, useId, useState } from 'react';
import { api } from '../api.ts';
import { angleDegrees, type DrawingKind, type Point, type Size } from '../drawing/geometry.ts';
import { formatFrameTime } from '../player/frames.ts';
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
  onJump: (frame: number) => void;
  onWriting: () => void;
}

/** Notes and drawings pinned to a frame (#59, #60): write at the current frame; list, jump, edit, delete. */
export { moments };

export function NotesPanel(props: NotesPanelProps) {
  const { videoId, fps, frame, size, annotations, name } = props;
  const t = notesStrings();
  const id = useId();
  const [body, setBody] = useState('');
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const [editing, setEditing] = useState<{ id: string; body: string } | null>(null);
  // The frame whose entry is getting an explanation, and its text.
  const [explaining, setExplaining] = useState<number | null>(null);
  const [explanation, setExplanation] = useState('');

  const run = (request: Promise<Response>, after: () => void) => {
    setBusy(true);
    setFailed(false);
    void request
      .then((res) => {
        if (!res.ok) throw new Error(String(res.status));
        after();
        props.onChanged();
      })
      .catch(() => {
        setFailed(true);
      })
      .finally(() => {
        setBusy(false);
      });
  };

  const create = (e: SubmitEvent<HTMLFormElement>) => {
    e.preventDefault();
    rememberName(name.trim());
    run(
      api(`/api/videos/${videoId}/annotations`, {
        method: 'POST',
        body: { kind: 'note', frame, body, authorName: name },
      }),
      () => {
        setBody('');
      },
    );
  };

  const named = name.trim() !== '';

  return (
    <section className="card notes" aria-labelledby={`${id}-h`}>
      <h2 id={`${id}-h`}>{t.notes}</h2>

      <form className="form" onSubmit={create}>
        <label htmlFor={`${id}-body`}>{t.atFrame(frame, formatFrameTime(frame, fps))}</label>
        <textarea
          id={`${id}-body`}
          value={body}
          rows={3}
          maxLength={2000}
          placeholder={t.placeholder}
          onFocus={props.onWriting}
          onChange={(e) => {
            setBody(e.target.value);
          }}
          required
        />
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
        <button type="submit" disabled={busy || body.trim() === '' || !named}>
          {t.save}
        </button>
        {failed && (
          <p role="alert" className="error">
            {t.failed}
          </p>
        )}
      </form>

      {annotations.length === 0 && <p className="muted">{t.none}</p>}
      <ol className="list" data-testid="notes">
        {moments(annotations).map(({ frame: at, notes, drawings }) => {
          const time = formatFrameTime(at, fps);
          const here = at === frame;
          return (
            <li
              key={at}
              className={`list__item moment${here ? ' note--here' : ''}`}
              data-testid="moment"
            >
              <div>
                <button
                  type="button"
                  className="note__jump"
                  aria-label={t.jump(at, time)}
                  onClick={() => {
                    props.onJump(at);
                  }}
                >
                  Frame {at} · {time}
                  {here && <span className="muted"> · {t.here}</span>}
                </button>

                {drawings.length > 0 && (
                  <ul className="moment__drawings" aria-label={t.drawingsHere}>
                    {drawings.map((d) => {
                      const what = describeDrawing(d, size);
                      return (
                        <li key={d.id} className="chip" data-testid="drawing">
                          <span>{what}</span>
                          <button
                            type="button"
                            className="chip__remove"
                            aria-label={t.deleteDrawing(what)}
                            onClick={() => {
                              if (window.confirm(t.confirmDelete)) {
                                run(
                                  api(`/api/annotations/${d.id}`, { method: 'DELETE' }),
                                  () => undefined,
                                );
                              }
                            }}
                          >
                            ×
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                )}

                {notes.map((n) => (
                  <div key={n.id} className="moment__note" data-testid="note">
                    <span className="muted">{n.authorName}</span>
                    {editing?.id === n.id ? (
                      <EditNote
                        value={editing.body}
                        busy={busy}
                        onChange={(value) => {
                          setEditing({ id: n.id, body: value });
                        }}
                        onCancel={() => {
                          setEditing(null);
                        }}
                        onSave={() => {
                          run(
                            api(`/api/annotations/${n.id}`, {
                              method: 'PATCH',
                              body: { body: editing.body },
                            }),
                            () => {
                              setEditing(null);
                            },
                          );
                        }}
                      />
                    ) : (
                      <>
                        <p className="note__body">{n.body}</p>
                        <div className="note__actions">
                          <button
                            type="button"
                            className="button--quiet"
                            onClick={() => {
                              setEditing({ id: n.id, body: n.body });
                            }}
                          >
                            {t.edit}
                          </button>
                          <button
                            type="button"
                            className="button--quiet"
                            onClick={() => {
                              if (window.confirm(t.confirmDelete)) {
                                run(
                                  api(`/api/annotations/${n.id}`, { method: 'DELETE' }),
                                  () => undefined,
                                );
                              }
                            }}
                          >
                            {t.delete}
                          </button>
                        </div>
                      </>
                    )}
                  </div>
                ))}

                {notes.length === 0 &&
                  (explaining === at ? (
                    <EditNote
                      value={explanation}
                      busy={busy || !named}
                      label={t.explanationAt(at)}
                      onChange={setExplanation}
                      onCancel={() => {
                        setExplaining(null);
                      }}
                      onSave={() => {
                        rememberName(name.trim());
                        run(
                          api(`/api/videos/${videoId}/annotations`, {
                            method: 'POST',
                            body: { kind: 'note', frame: at, body: explanation, authorName: name },
                          }),
                          () => {
                            setExplaining(null);
                            setExplanation('');
                          },
                        );
                      }}
                    />
                  ) : (
                    <button
                      type="button"
                      className="button--quiet moment__explain"
                      disabled={!named}
                      title={named ? undefined : t.needNameToWrite}
                      onClick={() => {
                        setExplaining(at);
                        setExplanation('');
                      }}
                    >
                      {t.addExplanation}
                    </button>
                  ))}
              </div>
            </li>
          );
        })}
      </ol>
    </section>
  );
}

function EditNote(props: {
  value: string;
  busy: boolean;
  label?: string;
  onChange: (value: string) => void;
  onSave: () => void;
  onCancel: () => void;
}) {
  const t = notesStrings();
  return (
    <form
      className="form"
      onSubmit={(e) => {
        e.preventDefault();
        props.onSave();
      }}
    >
      <textarea
        aria-label={props.label ?? t.edit}
        value={props.value}
        rows={3}
        maxLength={2000}
        autoFocus
        onChange={(e) => {
          props.onChange(e.target.value);
        }}
      />
      <div className="note__actions">
        <button type="submit" disabled={props.busy || props.value.trim() === ''}>
          {t.update}
        </button>
        <button type="button" className="button--quiet" onClick={props.onCancel}>
          {t.cancel}
        </button>
      </div>
    </form>
  );
}
