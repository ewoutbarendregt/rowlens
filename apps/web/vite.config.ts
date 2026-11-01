import react from '@vitejs/plugin-react';
import { defineConfig, type Plugin } from 'vite';
import { normalizeBasePath } from './src/shared/base-path.ts';

// The client is built for one base path (ADR-0003); the server checks build-info.json at startup.
const basePath = normalizeBasePath(process.env['BASE_PATH'] ?? '/projects/rowlens');
// API_PORT, not PORT: dev tooling often sets PORT for Vite itself.
const apiTarget = `http://127.0.0.1:${process.env['API_PORT'] ?? '3000'}`;

function buildInfo(): Plugin {
  return {
    name: 'rowlens-build-info',
    apply: 'build',
    generateBundle() {
      this.emitFile({
        type: 'asset',
        fileName: 'build-info.json',
        source: JSON.stringify({ basePath }),
      });
    },
  };
}

/**
 * Rolldown still emits a chunk for a dynamic import that dead-code elimination removed (e.g. a page
 * behind a disabled feature flag), and still lists it in the importer's metadata. Drop every chunk the
 * entry's code can't reach, so disabled features don't ship at all, not even as an unreferenced file.
 */
function dropUnreachableChunks(): Plugin {
  return {
    name: 'rowlens-drop-unreachable-chunks',
    apply: 'build',
    generateBundle(_options, bundle) {
      const chunks = Object.values(bundle).filter((f) => f.type === 'chunk');
      const reachable = new Set<string>();
      const visit = (fileName: string) => {
        if (reachable.has(fileName)) return;
        reachable.add(fileName);
        const chunk = chunks.find((c) => c.fileName === fileName);
        if (chunk === undefined) return;
        for (const next of chunk.imports) visit(next);
        // Rolldown keeps eliminated dynamic imports in the metadata; only follow ones the code still has.
        for (const next of chunk.dynamicImports) {
          if (chunk.code.includes(next.split('/').pop() ?? next)) visit(next);
        }
      };
      for (const chunk of chunks) if (chunk.isEntry) visit(chunk.fileName);
      for (const chunk of chunks) {
        if (reachable.has(chunk.fileName)) continue;
        Reflect.deleteProperty(bundle, chunk.fileName);
        Reflect.deleteProperty(bundle, `${chunk.fileName}.map`);
      }
    },
  };
}

export default defineConfig({
  base: `${basePath}/`,
  plugins: [react(), buildInfo(), dropUnreachableChunks()],
  build: {
    outDir: 'dist/client',
    emptyOutDir: true,
    sourcemap: 'hidden', // maps for error decoding, not linked from public bundles
  },
  server: {
    // `pnpm dev:client` + `pnpm dev:server`: Vite serves the SPA, Fastify the API and health.
    proxy: {
      [`${basePath}/api`]: apiTarget,
      [`${basePath}/health`]: apiTarget,
    },
  },
});
