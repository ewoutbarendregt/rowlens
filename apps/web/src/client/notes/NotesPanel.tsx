import { type SubmitEvent, useId, useState } from 'react';
import { api } from '../api.ts';
import { angleDegrees, type DrawingKind, type Point, type Size } from '../drawing/geometry.ts';
import { formatFrameTime } from '../player/frames.ts';
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
export function NotesPanel(props: NotesPanelProps) {
  const { videoId, fps, frame, size, annotations, name } = props;
  const t = notesStrings();
  const id = useId();
  const [body, setBody] = useState('');
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const [editing, setEditing] = useState<{ id: string; body: string } | null>(null);

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
        {annotations.map((a) => {
          const time = formatFrameTime(a.frame, fps);
          const here = a.frame === frame;
          const isNote = a.kind === 'note';
          return (
            <li
              key={a.id}
              className={`list__item note${here ? ' note--here' : ''}`}
              data-testid={isNote ? 'note' : 'drawing'}
            >
              <div>
                <button
                  type="button"
                  className="note__jump"
                  aria-label={t.jump(a.frame, time)}
                  onClick={() => {
                    props.onJump(a.frame);
                  }}
                >
                  Frame {a.frame} · {time}
                  {here && <span className="muted"> · {t.here}</span>}
                </button>
                <span className="muted">{a.authorName}</span>
                {!isNote && <strong className="note__drawing">{describeDrawing(a, size)}</strong>}
                {editing?.id === a.id ? (
                  <form
                    className="form"
                    onSubmit={(e) => {
                      e.preventDefault();
                      run(
                        api(`/api/annotations/${a.id}`, {
                          method: 'PATCH',
                          body: { body: editing.body },
                        }),
                        () => {
                          setEditing(null);
                        },
                      );
                    }}
                  >
                    <textarea
                      aria-label={t.edit}
                      value={editing.body}
                      rows={3}
                      maxLength={2000}
                      onChange={(e) => {
                        setEditing({ id: a.id, body: e.target.value });
                      }}
                    />
                    <div className="note__actions">
                      <button type="submit" disabled={busy || editing.body.trim() === ''}>
                        {t.update}
                      </button>
                      <button
                        type="button"
                        className="button--quiet"
                        onClick={() => {
                          setEditing(null);
                        }}
                      >
                        {t.cancel}
                      </button>
                    </div>
                  </form>
                ) : (
                  a.body !== '' && <p className="note__body">{a.body}</p>
                )}
              </div>
              {editing?.id !== a.id && (
                <div className="note__actions">
                  {isNote && (
                    <button
                      type="button"
                      className="button--quiet"
                      onClick={() => {
                        setEditing({ id: a.id, body: a.body });
                      }}
                    >
                      {t.edit}
                    </button>
                  )}
                  <button
                    type="button"
                    className="button--quiet"
                    onClick={() => {
                      if (window.confirm(t.confirmDelete)) {
                        run(api(`/api/annotations/${a.id}`, { method: 'DELETE' }), () => undefined);
                      }
                    }}
                  >
                    {t.delete}
                  </button>
                </div>
              )}
            </li>
          );
        })}
      </ol>
    </section>
  );
}
