import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router';
import { api } from '../api.ts';
import { activeClub } from '../club-context.ts';
import type { Annotation } from '../notes/NotesPanel.tsx';
import { reuseStrings } from './reuse-strings.ts';

interface SourceAnnotation extends Annotation {
  layerId: string;
  sourceVideoId: string;
  sourceSessionId: string;
  sourceSessionTitle: string;
  linked: boolean;
}
function storedHidden(key: string): string[] {
  try {
    const data: unknown = JSON.parse(localStorage.getItem(key) ?? '[]');
    return Array.isArray(data) ? data.filter((s): s is string => typeof s === 'string') : [];
  } catch {
    return [];
  }
}

export function useSourceAnnotations(videoId: string, identity: string) {
  const clubId = activeClub();
  const scope = `${identity}:${clubId ?? ''}:${videoId}`;
  const scopeRef = useRef(scope);
  scopeRef.current = scope;
  const [data, setData] = useState<{ scope: string; rows: SourceAnnotation[] }>({
    scope,
    rows: [],
  });
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState<string | null>(null);
  const [visibility, setVisibility] = useState<{ scope: string; hidden: string[] }>({
    scope,
    hidden: [],
  });
  const storageKey = `rowlens.sourceLayers:${scope}`;
  const hidden = visibility.scope === scope ? visibility.hidden : storedHidden(storageKey);
  const generation = useRef(0);
  const reload = useCallback(async () => {
    if (!videoId) return;
    const request = ++generation.current;
    try {
      const r = await api(`/api/videos/${videoId}/source-annotations`, { clubId });
      if (!r.ok) throw new Error();
      const body = (await r.json()) as { annotations: SourceAnnotation[] };
      if (scopeRef.current === scope && request === generation.current) {
        setData({ scope, rows: body.annotations });
        setError(null);
      }
    } catch {
      if (scopeRef.current === scope && request === generation.current) {
        // Fail closed: do not keep source content visible after a failed permission recheck.
        setData({ scope, rows: [] });
        setError(scope);
      }
    }
  }, [videoId, clubId, scope]);
  useEffect(() => {
    if (!videoId) return;
    setData({ scope, rows: [] });
    setSaving(null);
    setVisibility({ scope, hidden: storedHidden(storageKey) });
    void reload();
    const refresh = () => {
      void reload();
    };
    window.addEventListener('focus', refresh);
    const timer = window.setInterval(refresh, 15000);
    return () => {
      ++generation.current;
      window.removeEventListener('focus', refresh);
      window.clearInterval(timer);
    };
  }, [reload, scope, storageKey, videoId]);
  const rows = data.scope === scope ? data.rows : [];
  const annotations = useMemo(
    () =>
      rows
        .filter((a) => a.linked && !hidden.includes(a.layerId))
        .map((a): Annotation => ({
          ...a,
          id: `source:${a.id}`,
          canEdit: false,
          mine: false,
          authorName: reuseStrings().layer(a.authorName, a.sourceSessionTitle),
        })),
    [rows, hidden],
  );
  const toggle = (layer: string) => {
    const next = hidden.includes(layer) ? hidden.filter((s) => s !== layer) : [...hidden, layer];
    setVisibility({ scope, hidden: next });
    try {
      localStorage.setItem(storageKey, JSON.stringify(next));
    } catch {
      /* Page choice remains usable. */
    }
  };
  const link = async (a: SourceAnnotation) => {
    setSaving(scope);
    setError(null);
    try {
      const r = await api(`/api/videos/${videoId}/annotation-references/${a.id}`, {
        method: a.linked ? 'DELETE' : 'PUT',
        clubId,
      });
      if (!r.ok) throw new Error();
      if (scopeRef.current === scope) await reload();
    } catch {
      if (scopeRef.current === scope) setError(scope);
    } finally {
      if (scopeRef.current === scope) setSaving(null);
    }
  };
  return {
    rows,
    annotations,
    hidden,
    toggle,
    link,
    reload,
    failed: error === scope,
    busy: saving === scope,
  };
}

export function SourceAnnotations({
  model,
  canEdit,
  onJump,
  filtered,
}: {
  model: ReturnType<typeof useSourceAnnotations>;
  canEdit: boolean;
  onJump: (frame: number) => void;
  filtered: boolean;
}) {
  const t = reuseStrings();
  const layers = new Map<string, SourceAnnotation[]>();
  for (const a of model.rows) layers.set(a.layerId, [...(layers.get(a.layerId) ?? []), a]);
  return (
    <details className="source-annotations" data-testid="source-annotations">
      <summary>
        {t.sources} · {t.available(model.rows.length)}
      </summary>
      <p className="muted">{t.references}</p>
      {filtered && <p className="muted">{t.hiddenByFilter}</p>}
      {model.failed && (
        <p role="alert">
          {t.failed}{' '}
          <button
            type="button"
            onClick={() => {
              void model.reload();
            }}
          >
            {t.retry}
          </button>
        </p>
      )}
      {!model.failed && layers.size === 0 && <p className="muted">{t.none}</p>}
      {[...layers].map(([key, items]) => {
        const first = items[0];
        if (!first) return null;
        return (
          <section key={key} className="source-annotations__layer" data-testid="source-layer">
            <h3>{t.layer(first.authorName, first.sourceSessionTitle)}</h3>
            <label className="filters__check">
              <input
                type="checkbox"
                checked={!model.hidden.includes(key)}
                onChange={() => {
                  model.toggle(key);
                }}
              />
              {t.show}
            </label>
            <Link to={`/sessions/${first.sourceSessionId}`}>{t.original}</Link>
            <ul className="list">
              {items.map((a) => (
                <li key={a.id} className="source-annotations__item" data-testid="source-annotation">
                  <button
                    type="button"
                    className="button--quiet"
                    onClick={() => {
                      onJump(a.frame);
                    }}
                  >
                    {t.frame(a.frame)} · {t.kinds[a.kind]}
                  </button>
                  {a.body && <p>{a.body}</p>}
                  {canEdit ? (
                    <button
                      type="button"
                      className="button--quiet"
                      disabled={model.busy}
                      aria-pressed={a.linked}
                      onClick={() => {
                        void model.link(a);
                      }}
                    >
                      {a.linked ? t.unlink : t.link}
                    </button>
                  ) : (
                    a.linked && <span>{t.linked}</span>
                  )}
                </li>
              ))}
            </ul>
          </section>
        );
      })}
    </details>
  );
}
