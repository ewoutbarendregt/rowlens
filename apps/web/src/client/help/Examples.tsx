import { ExamplePicker } from './ExamplePicker.tsx';
import { ExampleActions, ExampleCreate } from './ExampleManagement.tsx';
import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import { api } from '../api.ts';
import { useAuth } from '../auth/useAuth.ts';
import { helpStrings } from './strings.ts';
import { sessionStrings, formatDate } from '../sessions/strings.ts';
interface Example {
  id: string;
  title: string;
  date: string;
  clubName: string;
  clubId: string;
}
export function Examples({ manage = false }: { manage?: boolean }) {
  const { state } = useAuth();
  const manager = manage && state.kind === 'open' && state.user.platformAdmin === true;
  const actor = state.kind === 'open' ? state.user.id : null;
  const [revision, setRevision] = useState(0);
  const [published, setPublished] = useState(false);
  const [rows, setRows] = useState<Example[]>([]);
  const [failed, setFailed] = useState(false);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    let stale = false;
    setRows([]);
    setFailed(false);
    setLoading(true);
    void api('/api/examples', { clubId: null })
      .then(async (r) => {
        if (!r.ok) throw new Error();
        const body = (await r.json()) as { examples: Example[] };
        if (!stale) {
          setRows(body.examples);
          setLoading(false);
        }
      })
      .catch(() => {
        if (!stale) {
          setFailed(true);
          setLoading(false);
        }
      });
    return () => {
      stale = true;
    };
  }, [actor, revision]);
  const t = helpStrings();
  return (
    <section className="card examples" data-testid="examples">
      <h2>{t.examples}</h2>
      <p>
        {t.exampleIntro} <Link to="/help">{t.help}</Link>
      </p>
      {failed && <p role="alert">{sessionStrings().loadFailed}</p>}
      {!loading && !failed && rows.length === 0 && <p className="muted">{t.noExamples}</p>}
      {manager && (
        <ExampleCreate
          key={`create:${actor ?? ''}`}
          clubs={state.clubs ?? []}
          initialClub={state.club.id ?? ''}
          defaultBoat={state.user.defaultBoatType}
        />
      )}
      {manager && (
        <ExamplePicker
          key={`picker:${actor ?? ''}`}
          clubs={state.clubs ?? []}
          initialClub={state.club.id ?? ''}
          onPublished={() => {
            setPublished(true);
            setRevision((value) => value + 1);
          }}
        />
      )}
      {manager && published && <p role="status">{t.examplePublished}</p>}
      <ul className="examples__list">
        {rows.map((s) => (
          <li key={s.id} className="examples__item">
            <div className="examples__description">
              <Link to={`/examples/${s.id}`}>{s.title}</Link>
              <span className="muted">
                {' '}
                · {formatDate(s.date)} · {s.clubName}
              </span>
            </div>
            {manager && (
              <ExampleActions
                key={`${actor ?? ''}:${s.id}`}
                example={s}
                onRenamed={(title) => {
                  setRows((current) =>
                    current.map((row) => (row.id === s.id ? { ...row, title } : row)),
                  );
                }}
              />
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
