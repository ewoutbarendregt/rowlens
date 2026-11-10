import { useEffect, useState } from 'react';
import { appUrl } from './env.ts';

/** Server version from the health endpoint; also proves the API is reachable under the base path. */
export function useAppVersion(): string | null {
  const [version, setVersion] = useState<string | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    fetch(appUrl('/health/live'), { signal: controller.signal })
      .then((res) => (res.ok ? (res.json() as Promise<{ version?: unknown }>) : null))
      .then((body) => {
        if (typeof body?.version === 'string') {
          const build = body.version;
          const release = /^v?\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(build)
            ? build.replace(/^v/, '')
            : `${__ROWLENS_RELEASE__}+${build.replace(/[^0-9A-Za-z.-]/g, '-')}`;
          setVersion(`v${release}`);
        }
      })
      .catch(() => {
        // Version is decorative; the page works without it.
      });
    return () => {
      controller.abort();
    };
  }, []);
  return version;
}
