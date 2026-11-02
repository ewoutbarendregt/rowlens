import { useCallback, useEffect, useRef, useState } from 'react';
import { type DetailedError, Upload } from 'tus-js-client';
import { csrfToken } from '../api.ts';
import { appUrl } from '../env.ts';
import type { Perspective, UploadError } from './strings.ts';

/** 16 MB: well under Caddy's 64 MB body limit and the server's chunk cap (ADR-0003). */
const CHUNK_BYTES = 16 * 1024 * 1024;
const KNOWN_ERRORS = new Set<string>([
  'not_a_video',
  'too_large',
  'media_cap',
  'disk_full',
  'too_many_uploads',
]);

/** Worth another try later; a file that isn't a video or is too big stays refused. */
export const retryable = (f: QueuedFile) =>
  f.state === 'error' && f.error !== 'not_a_video' && f.error !== 'too_large';

export interface QueuedFile {
  id: string;
  file: File;
  perspective: Perspective;
  state: 'pending' | 'uploading' | 'done' | 'error';
  progress: number;
  error?: UploadError | undefined;
}

/**
 * Upload queue for one session: tus with 16 MB chunks, one file at a time. tus-js-client remembers
 * each upload's URL per file (localStorage), so choosing the same file again after a reload or a
 * lost connection continues where it stopped instead of starting over.
 */
export function useUploads(sessionId: string, onFinished: () => void) {
  const [queue, setQueue] = useState<QueuedFile[]>([]);
  /** True from "Upload" until the queue has nothing pending. */
  const [go, setGo] = useState(false);
  const running = useRef<Upload | null>(null);
  const finished = useRef(onFinished);
  finished.current = onFinished;

  const update = (id: string, patch: Partial<QueuedFile>) => {
    setQueue((q) => q.map((f) => (f.id === id ? { ...f, ...patch } : f)));
  };

  const add = useCallback((files: FileList | File[]) => {
    const added = Array.from(files, (file): QueuedFile => ({
      id: `${file.name}-${String(file.size)}-${String(file.lastModified)}-${String(Math.random())}`,
      file,
      perspective: 'boat',
      state: 'pending',
      progress: 0,
    }));
    setQueue((q) => [...q, ...added]);
  }, []);

  const setPerspective = useCallback((id: string, perspective: Perspective) => {
    update(id, { perspective });
  }, []);

  const remove = useCallback((id: string) => {
    setQueue((q) => q.filter((f) => f.id !== id || f.state === 'uploading'));
  }, []);

  const startNext = useCallback(
    (q: QueuedFile[]) => {
      if (running.current !== null) return;
      const next = q.find((f) => f.state === 'pending');
      if (next === undefined) {
        setGo(false);
        return;
      }
      update(next.id, { state: 'uploading', error: undefined });
      const upload = new Upload(next.file, {
        endpoint: appUrl('/api/uploads'),
        headers: { 'x-csrf-token': csrfToken() ?? '' },
        chunkSize: CHUNK_BYTES,
        retryDelays: [0, 3_000, 10_000, 30_000, 60_000],
        removeFingerprintOnSuccess: true,
        metadata: {
          filename: next.file.name,
          filetype: next.file.type,
          sessionId,
          perspective: next.perspective,
        },
        // Retry what a better connection can fix; not refusals (type, size, cap, full disk).
        onShouldRetry: (err) => {
          const status = err.originalResponse?.getStatus() ?? 0;
          return (
            status === 0 || status === 409 || status === 423 || (status >= 500 && status !== 507)
          );
        },
        onProgress: (sent, total) => {
          update(next.id, { progress: total === 0 ? 0 : Math.floor((sent / total) * 100) });
        },
        onSuccess: () => {
          running.current = null;
          update(next.id, { state: 'done', progress: 100 });
          finished.current();
        },
        onError: (err) => {
          running.current = null;
          update(next.id, { state: 'error', error: errorCode(err) });
          finished.current();
        },
      });
      running.current = upload;
      void upload.findPreviousUploads().then((previous) => {
        const last = previous[0];
        if (last !== undefined) upload.resumeFromPreviousUpload(last);
        upload.start();
      });
    },
    [sessionId],
  );

  const start = useCallback(() => {
    setQueue((q) => q.map((f) => (retryable(f) ? { ...f, state: 'pending' as const } : f)));
    setGo(true);
  }, []);

  // One at a time: whenever nothing runs, the next pending file starts.
  useEffect(() => {
    if (go && running.current === null) startNext(queue);
  }, [go, queue, startNext]);

  const active = queue.some((f) => f.state === 'uploading');

  // Leaving the page stops the upload (it can be resumed), so ask first; keep the phone awake.
  useEffect(() => {
    if (!active) return;
    const warn = (e: BeforeUnloadEvent) => {
      e.preventDefault();
    };
    window.addEventListener('beforeunload', warn);
    let lock: WakeLockSentinel | null = null;
    // Not in every browser yet (older iOS), whatever the types say.
    if ('wakeLock' in navigator)
      void navigator.wakeLock.request('screen').then(
        (l) => {
          lock = l;
        },
        () => undefined,
      );
    return () => {
      window.removeEventListener('beforeunload', warn);
      void lock?.release();
    };
  }, [active]);

  useEffect(
    () => () => {
      void running.current?.abort();
    },
    [],
  );

  return { queue, add, setPerspective, remove, start, active };
}

function errorCode(err: Error): UploadError {
  try {
    const body = (err as DetailedError).originalResponse?.getBody();
    const code = body === undefined ? undefined : (JSON.parse(body) as { error?: string }).error;
    if (code !== undefined && KNOWN_ERRORS.has(code)) return code as UploadError;
    if (code === 'chunk_too_large') return 'too_large';
  } catch {
    // Not JSON: a network error or a proxy page.
  }
  return 'failed';
}
