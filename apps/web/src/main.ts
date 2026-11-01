import { normalizeBasePath } from './config/base-path.ts';
import { createAppServer } from './server.ts';

const basePath = normalizeBasePath(process.env['BASE_PATH'] ?? '/projects/rowlens');
const port = Number(process.env['PORT'] ?? '3000');
const version = process.env['APP_VERSION'] ?? 'dev';

const server = createAppServer({ basePath, version });
server.listen(port, '0.0.0.0', () => {
  console.log(JSON.stringify({ level: 'info', msg: 'listening', port, basePath, version }));
});

for (const signal of ['SIGTERM', 'SIGINT'] as const) {
  process.on(signal, () => {
    server.close(() => process.exit(0));
  });
}
