import { type SubmitEvent, useId, useState } from 'react';
import { api } from '../api.ts';
import { formatFrameTime } from '../player/frames.ts';
import { notesStrings } from './strings.ts';

export interface Note {
  id: string;
  frame: number;
  body: string;
  authorName: string;
  createdAt: string;
}

const NAME_KEY = 'rowlens.authorName';

// The name is a convenience on this device only (the pilot has no accounts); storage may be off.
function rememberedName(): string {
  try {
    return localStorage.getItem(NAME_KEY) ?? '';
  } catch {
    return '';
  }
}
function rememberName(name: string): void {
  try {
    localStorage.setItem(NAME_KEY, name);
  } catch {
    // Private mode: the name is just asked again next time.
  }
}

interface NotesPanelProps {
  videoId: string;
  fps: number;
  frame: number;
  notes: Note[];
  onChanged: () => void;
  onJump: (frame: number) => void;
  onWriting: () => void;
}

/** Notes pinned to a frame (#59): write at the current frame, jump, edit, delete. */
export function NotesPanel({
  videoId,
  fps,
  frame,
  notes,
  onChanged,
  onJump,
  onWriting,
}: NotesPanelProps) {
  const t = notesStrings();
  const id = useId();
  const [body, setBody] = useState('');
  const [name, setName] = useState(rememberedName);
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
        onChanged();
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
        body: { frame, body, authorName: name },
      }),
      () => {
        setBody('');
      },
    );
  };

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
          onFocus={onWriting}
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
            setName(e.target.value);
          }}
          required
        />
        <button type="submit" disabled={busy || body.trim() === '' || name.trim() === ''}>
          {t.save}
        </button>
        {failed && (
          <p role="alert" className="error">
            {t.failed}
          </p>
        )}
      </form>

      {notes.length === 0 && <p className="muted">{t.none}</p>}
      <ol className="list" data-testid="notes">
        {notes.map((n) => {
          const time = formatFrameTime(n.frame, fps);
          const here = n.frame === frame;
          return (
            <li
              key={n.id}
              className={`list__item note${here ? ' note--here' : ''}`}
              data-testid="note"
            >
              <div>
                <button
                  type="button"
                  className="note__jump"
                  aria-label={t.jump(n.frame, time)}
                  onClick={() => {
                    onJump(n.frame);
                  }}
                >
                  Frame {n.frame} · {time}
                  {here && <span className="muted"> · {t.here}</span>}
                </button>
                <span className="muted">{n.authorName}</span>
                {editing?.id === n.id ? (
                  <form
                    className="form"
                    onSubmit={(e) => {
                      e.preventDefault();
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
                  >
                    <textarea
                      aria-label={t.edit}
                      value={editing.body}
                      rows={3}
                      maxLength={2000}
                      onChange={(e) => {
                        setEditing({ id: n.id, body: e.target.value });
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
                  <p className="note__body">{n.body}</p>
                )}
              </div>
              {editing?.id !== n.id && (
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
                        run(api(`/api/annotations/${n.id}`, { method: 'DELETE' }), () => undefined);
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
