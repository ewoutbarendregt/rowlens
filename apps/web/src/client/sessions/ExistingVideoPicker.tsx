import { useEffect, useRef, useState } from 'react';
import { api } from '../api.ts';
import { activeClub } from '../club-context.ts';
import { reuseStrings } from './reuse-strings.ts';
import { videoDisplayName } from './displayName.ts';

interface AvailableVideo {
  id: string;
  sessionTitle: string;
  filename: string;
  seq: number | null;
  recordedAt: string | null;
  durationMs: number | null;
}
export function ExistingVideoPicker({
  sessionId,
  onAdded,
}: {
  sessionId: string;
  onAdded: () => void;
}) {
  const t = reuseStrings();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const [rows, setRows] = useState<AvailableVideo[]>([]);
  const [next, setNext] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const generation = useRef(0);
  const clubId = activeClub();
  useEffect(() => {
    if (!open) return;
    const current = ++generation.current;
    setRows([]);
    setNext(null);
    setBusy(true);
    setFailed(false);
    const params = new URLSearchParams({ q });
    void api(`/api/sessions/${sessionId}/available-videos?${params}`, { clubId })
      .then(async (r) => {
        if (!r.ok) throw new Error();
        return r.json() as Promise<{ videos: AvailableVideo[]; next: string | null }>;
      })
      .then((r) => {
        if (current === generation.current) {
          setRows(r.videos);
          setNext(r.next);
        }
      })
      .catch(() => {
        if (current === generation.current) setFailed(true);
      })
      .finally(() => {
        if (current === generation.current) setBusy(false);
      });
    return () => {
      ++generation.current;
    };
  }, [open, sessionId, q, clubId]);
  const more = async () => {
    if (!next) return;
    const current = generation.current;
    setBusy(true);
    setFailed(false);
    try {
      const params = new URLSearchParams({ q, after: next });
      const r = await api(`/api/sessions/${sessionId}/available-videos?${params}`, { clubId });
      if (!r.ok) throw new Error();
      const body = (await r.json()) as { videos: AvailableVideo[]; next: string | null };
      if (current === generation.current) {
        setRows((r) => [...r, ...body.videos]);
        setNext(body.next);
      }
    } catch {
      if (current === generation.current) setFailed(true);
    } finally {
      if (current === generation.current) setBusy(false);
    }
  };
  const add = async (sourceVideoId: string) => {
    const current = generation.current;
    setBusy(true);
    setFailed(false);
    try {
      const r = await api(`/api/sessions/${sessionId}/reuse-video`, {
        method: 'POST',
        body: { sourceVideoId },
        clubId,
      });
      if (!r.ok) throw new Error();
      if (current === generation.current) {
        onAdded();
        setOpen(false);
      }
    } catch {
      if (current === generation.current) setFailed(true);
    } finally {
      if (current === generation.current) setBusy(false);
    }
  };
  return (
    <div className="video-reuse" data-testid="existing-video-picker">
      <button
        type="button"
        className="button--quiet"
        aria-expanded={open}
        onClick={() => {
          setOpen((v) => !v);
        }}
      >
        {open ? t.cancel : t.addVideo}
      </button>
      {open && (
        <div className="video-reuse__body form" aria-busy={busy}>
          <p className="muted">{t.videoHint}</p>
          <label>
            {t.search}
            <input
              type="search"
              value={q}
              maxLength={120}
              placeholder={t.searchHint}
              onChange={(e) => {
                setQ(e.target.value);
              }}
            />
          </label>
          {failed && <p role="alert">{t.failed}</p>}
          {!busy && !failed && rows.length === 0 && <p>{t.noVideos}</p>}
          <ul className="list">
            {rows.map((r) => (
              <li key={r.id} className="video-reuse__item">
                <div>
                  <strong>{videoDisplayName(r)}</strong>
                  <span className="muted">
                    {r.sessionTitle} · {r.filename}
                  </span>
                </div>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => {
                    void add(r.id);
                  }}
                >
                  {t.add}
                </button>
              </li>
            ))}
          </ul>
          {next && (
            <button
              type="button"
              disabled={busy}
              onClick={() => {
                void more();
              }}
            >
              {t.more}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
