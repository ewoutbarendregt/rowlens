import { createServer, type Server } from 'node:http';
import { stripBasePath } from './config/base-path.ts';

export interface ServerConfig {
  basePath: string;
  version: string;
}

/**
 * M0 placeholder server: proves base-path routing and health checks end to end.
 * Replaced by the Fastify app in M0 "web app skeleton".
 */
export function createAppServer(config: ServerConfig): Server {
  return createServer((req, res) => {
    const url = new URL(req.url ?? '/', 'http://internal');
    const path = stripBasePath(config.basePath, url.pathname);

    if (path === '/health/live' || path === '/health/ready') {
      res.writeHead(200, { 'content-type': 'application/json', 'cache-control': 'no-store' });
      res.end(JSON.stringify({ status: 'ok', version: config.version }));
      return;
    }
    if (path === '/') {
      res.writeHead(200, { 'content-type': 'text/plain; charset=utf-8' });
      res.end('RowLens\n');
      return;
    }
    res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
    res.end('Not found\n');
  });
}
