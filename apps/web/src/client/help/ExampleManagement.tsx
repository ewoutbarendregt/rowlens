import { type SubmitEvent, useId, useState } from 'react';
import { Link } from 'react-router';
import { BOAT_CLASS_NAMES, type BoatClass } from '../../shared/boats.ts';
import { api } from '../api.ts';
import { type ClubChoice } from '../auth/useAuth.ts';
import { sessionStrings } from '../sessions/strings.ts';
import { clubStrings } from '../clubs/strings.ts';
import { helpStrings } from './strings.ts';
import { originalTrainingUrl } from './example-links.ts';

export function ExampleActions({
  example,
  onRenamed,
}: {
  example: { id: string; title: string; clubId: string };
  onRenamed: (title: string) => void;
}) {
  const t = helpStrings(),
    st = sessionStrings();
  const inputId = useId();
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(example.title);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const rename = (event: SubmitEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (busy || !title.trim()) return;
    setBusy(true);
    setFailed(false);
    void api(`/api/sessions/${example.id}`, {
      method: 'PATCH',
      clubId: example.clubId,
      body: { title },
    })
      .then(async (response) => {
        if (!response.ok) throw new Error();
        const result = (await response.json()) as { title: string };
        onRenamed(result.title);
        setEditing(false);
      })
      .catch(() => {
        setFailed(true);
      })
      .finally(() => {
        setBusy(false);
      });
  };
  return (
    <>
      <div className="examples__actions">
        <a href={originalTrainingUrl(example.id, example.clubId)}>{t.editExample}</a>
        {!editing && (
          <button
            type="button"
            className="button--quiet"
            onClick={() => {
              setTitle(example.title);
              setFailed(false);
              setEditing(true);
            }}
          >
            {st.rename}
          </button>
        )}
      </div>
      {editing && (
        <form
          className="form examples__rename"
          onSubmit={rename}
          aria-label={t.renameExample(example.title)}
          aria-busy={busy}
        >
          <label htmlFor={inputId}>{st.renameLabel}</label>
          <input
            id={inputId}
            value={title}
            onChange={(e) => {
              setTitle(e.target.value);
            }}
            maxLength={120}
            required
            disabled={busy}
          />
          <span className="form__actions">
            <button type="submit" disabled={busy || !title.trim()}>
              {st.save}
            </button>
            <button
              type="button"
              className="button--quiet"
              disabled={busy}
              onClick={() => {
                setEditing(false);
              }}
            >
              {st.cancel}
            </button>
          </span>
          {failed && <p role="alert">{st.renameFailed}</p>}
        </form>
      )}
    </>
  );
}

/** A shortcut to ordinary creation/editing; publication still uses the protected server trigger. */
export function ExampleCreate({
  clubs,
  initialClub,
  defaultBoat,
}: {
  clubs: readonly ClubChoice[];
  initialClub: string;
  defaultBoat: BoatClass | null;
}) {
  const t = helpStrings(),
    st = sessionStrings();
  const formId = useId();
  const [open, setOpen] = useState(false);
  const [clubId, setClubId] = useState(initialClub);
  const [title, setTitle] = useState('');
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [boatType, setBoatType] = useState<BoatClass>(defaultBoat ?? 'C4x+');
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const validClub = clubs.some((c) => c.id === clubId);
  const create = (event: SubmitEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (busy || !title.trim() || !validClub) return;
    setBusy(true);
    setFailed(false);
    void api('/api/sessions', { method: 'POST', clubId, body: { title, date, boatType } })
      .then(async (response) => {
        if (!response.ok) throw new Error();
        const result = (await response.json()) as { id: string };
        window.location.assign(originalTrainingUrl(result.id, clubId));
      })
      .catch(() => {
        setFailed(true);
        setBusy(false);
      });
  };
  if (!clubs.length)
    return (
      <p>
        {t.exampleClubRequired} <Link to="/clubs">{clubStrings().clubs}</Link>
      </p>
    );
  return (
    <>
      {!open && (
        <button
          type="button"
          onClick={() => {
            setOpen(true);
            setFailed(false);
          }}
        >
          {t.newExample}
        </button>
      )}
      {open && (
        <form
          className="form examples__create"
          onSubmit={create}
          aria-labelledby={`${formId}-heading`}
          aria-busy={busy}
        >
          <h3 id={`${formId}-heading`}>{t.newExample}</h3>
          <p>{t.publicationNotice}</p>
          <label htmlFor={`${formId}-club`}>{t.exampleClub}</label>
          <select
            id={`${formId}-club`}
            value={clubId}
            onChange={(e) => {
              setClubId(e.target.value);
            }}
            required
            disabled={busy}
          >
            <option value="">{t.chooseExampleClub}</option>
            {clubs.map((club) => (
              <option value={club.id} key={club.id}>
                {club.name}
              </option>
            ))}
          </select>
          <label htmlFor={`${formId}-title`}>{st.title}</label>
          <input
            id={`${formId}-title`}
            value={title}
            onChange={(e) => {
              setTitle(e.target.value);
            }}
            maxLength={120}
            required
            disabled={busy}
          />
          <label htmlFor={`${formId}-date`}>{st.date}</label>
          <input
            id={`${formId}-date`}
            type="date"
            value={date}
            onChange={(e) => {
              setDate(e.target.value);
            }}
            required
            disabled={busy}
          />
          <label htmlFor={`${formId}-boat`}>{st.boat}</label>
          <select
            id={`${formId}-boat`}
            value={boatType}
            onChange={(e) => {
              setBoatType(e.target.value as BoatClass);
            }}
            disabled={busy}
          >
            {BOAT_CLASS_NAMES.map((boat) => (
              <option key={boat} value={boat}>
                {boat}
              </option>
            ))}
          </select>
          <span className="form__actions">
            <button type="submit" disabled={busy || !title.trim() || !validClub}>
              {t.createExample}
            </button>
            <button
              type="button"
              className="button--quiet"
              disabled={busy}
              onClick={() => {
                setOpen(false);
              }}
            >
              {st.cancel}
            </button>
          </span>
          {failed && <p role="alert">{t.createExampleFailed}</p>}
        </form>
      )}
    </>
  );
}
