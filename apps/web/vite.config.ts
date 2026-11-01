import react from '@vitejs/plugin-react';
import { defineConfig, type Plugin } from 'vite';
import { normalizeBasePath } from './src/shared/base-path.ts';

// The client is built for one base path (ADR-0003); the server checks build-info.json at startup.
const basePath = normalizeBasePath(process.env['BASE_PATH'] ?? '/projects/rowlens');
const apiTarget = `http://127.0.0.1:${process.env['PORT'] ?? '3000'}`;

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

export default defineConfig({
  base: `${basePath}/`,
  plugins: [react(), buildInfo()],
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
