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
}
export function Examples() {
  const { state } = useAuth();
  const actor = state.kind === 'open' ? state.user.id : null;
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
  }, [actor]);
  const t = helpStrings();
  return (
    <section className="card examples" data-testid="examples">
      <h2>{t.examples}</h2>
      <p>
        {t.exampleIntro} <Link to="/help">{t.help}</Link>
      </p>
      {failed && <p role="alert">{sessionStrings().loadFailed}</p>}
      {!loading && !failed && rows.length === 0 && <p className="muted">{t.noExamples}</p>}
      <ul>
        {rows.map((s) => (
          <li key={s.id}>
            <Link to={`/examples/${s.id}`}>{s.title}</Link>
            <span className="muted">
              {' '}
              · {formatDate(s.date)} · {s.clubName}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
