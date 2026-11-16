import { type SubmitEvent, useEffect, useId, useState } from 'react';
import { exampleCandidatesSchema, type ExampleCandidate } from '../../shared/example-management.ts';
import { api } from '../api.ts';
import type { ClubChoice } from '../auth/useAuth.ts';
import { formatDate, sessionStrings } from '../sessions/strings.ts';
import { ConfirmInline } from '../ui/ConfirmInline.tsx';
import { helpStrings } from './strings.ts';

export function ExamplePicker({
  clubs,
  initialClub,
  onPublished,
}: {
  clubs: readonly ClubChoice[];
  initialClub: string;
  onPublished: () => void;
}) {
  const t = helpStrings();
  const id = useId();
  const [open, setOpen] = useState(false);
  const [clubId, setClubId] = useState(initialClub);
  const [busy, setBusy] = useState(false);
  return (
    <div className="examples__picker">
      {!open ? (
        <button
          type="button"
          disabled={!clubs.length}
          onClick={() => {
            setOpen(true);
          }}
        >
          {t.selectExisting}
        </button>
      ) : (
        <>
          <h3>{t.selectExisting}</h3>
          <label htmlFor={id}>{t.exampleClub}</label>
          <select
            id={id}
            value={clubId}
            disabled={busy}
            onChange={(e) => {
              setClubId(e.target.value);
            }}
          >
            <option value="">{t.chooseExampleClub}</option>
            {clubs.map((club) => (
              <option key={club.id} value={club.id}>
                {club.name}
              </option>
            ))}
          </select>
          {clubs.some((club) => club.id === clubId) && (
            <Candidates
              key={clubId}
              clubId={clubId}
              onBusy={setBusy}
              clubName={clubs.find((club) => club.id === clubId)?.name ?? ''}
              onPublished={() => {
                onPublished();
                setBusy(false);
                setOpen(false);
              }}
              onCancel={() => {
                setOpen(false);
              }}
            />
          )}
          {!clubs.some((club) => club.id === clubId) && (
            <button
              type="button"
              className="button--quiet"
              onClick={() => {
                setOpen(false);
              }}
            >
              {sessionStrings().cancel}
            </button>
          )}
        </>
      )}
    </div>
  );
}

function Candidates({
  clubId,
  clubName,
  onPublished,
  onCancel,
  onBusy,
}: {
  clubId: string;
  clubName: string;
  onPublished: () => void;
  onCancel: () => void;
  onBusy: (busy: boolean) => void;
}) {
  const t = helpStrings();
  const id = useId();
  const [query, setQuery] = useState('');
  const [search, setSearch] = useState('');
  const [revision, setRevision] = useState(0);
  const [cursor, setCursor] = useState<string | null>(null);
  const [next, setNext] = useState<string | null>(null);
  const [rows, setRows] = useState<ExampleCandidate[]>([]);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [selected, setSelected] = useState<ExampleCandidate | null>(null);
  const [busy, setBusy] = useState(false);
  const [publishFailed, setPublishFailed] = useState(false);
  useEffect(() => {
    let stale = false;
    setLoading(true);
    setFailed(false);
    const params = new URLSearchParams({ q: search });
    if (cursor) params.set('before', cursor);
    void api(`/api/example-management/candidates?${params.toString()}`, { clubId })
      .then(async (response) => {
        if (!response.ok) throw new Error();
        const result = exampleCandidatesSchema.parse(await response.json());
        if (stale) return;
        setRows((current) => (cursor ? [...current, ...result.sessions] : result.sessions));
        setNext(result.nextCursor);
      })
      .catch(() => {
        if (!stale) setFailed(true);
      })
      .finally(() => {
        if (!stale) setLoading(false);
      });
    return () => {
      stale = true;
    };
  }, [clubId, search, cursor, revision]);
  const submit = (event: SubmitEvent<HTMLFormElement>) => {
    event.preventDefault();
    setRows([]);
    setSelected(null);
    setCursor(null);
    setSearch(query.trim());
    setRevision((value) => value + 1);
  };
  const publish = () => {
    if (!selected || busy) return;
    setBusy(true);
    onBusy(true);
    setPublishFailed(false);
    void api(`/api/example-management/${selected.id}/publish`, {
      method: 'POST',
      clubId,
      body: { confirm: true },
    })
      .then((response) => {
        if (!response.ok) throw new Error();
        onPublished();
      })
      .catch(() => {
        setPublishFailed(true);
        setBusy(false);
        onBusy(false);
      });
  };
  return (
    <div aria-busy={loading || busy}>
      <form className="form" onSubmit={submit}>
        <label htmlFor={id}>{t.searchExisting}</label>
        <input
          id={id}
          value={query}
          maxLength={120}
          disabled={busy}
          onChange={(e) => {
            setQuery(e.target.value);
          }}
        />
        <button type="submit" disabled={loading || busy}>
          {t.searchExamples}
        </button>
      </form>
      {failed && <p role="alert">{sessionStrings().loadFailed}</p>}
      {!loading && !failed && rows.length === 0 && <p>{t.noCandidates}</p>}
      <ul className="examples__list">
        {rows.map((row) => (
          <li key={row.id}>
            <button
              type="button"
              className="button--quiet"
              disabled={busy}
              onClick={() => {
                setSelected(row);
                setPublishFailed(false);
              }}
            >
              {row.title}
            </button>
            <span className="muted">
              {' '}
              · {formatDate(row.date)} · {t.candidateVideos(row.videoCount)}
            </span>
          </li>
        ))}
      </ul>
      {next && !failed && (
        <button
          type="button"
          disabled={loading || busy}
          onClick={() => {
            setCursor(next);
          }}
        >
          {t.moreCandidates}
        </button>
      )}
      {selected && (
        <>
          <p>{t.selectedExample(selected.title, clubName)}</p>
          {busy ? (
            <p role="status">{t.publishingExample}</p>
          ) : (
            <ConfirmInline
              question={t.confirmPublication}
              yesLabel={t.publishExample}
              onConfirm={publish}
              onCancel={() => {
                setSelected(null);
              }}
            />
          )}
          {publishFailed && <p role="alert">{t.publishFailed}</p>}
        </>
      )}
      <button type="button" className="button--quiet" disabled={busy} onClick={onCancel}>
        {sessionStrings().cancel}
      </button>
    </div>
  );
}
