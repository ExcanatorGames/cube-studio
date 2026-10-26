import {createServer} from 'node:http';
import {once} from 'node:events';
import {mkdtemp, readFile, readdir, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {DatabaseSync} from 'node:sqlite';
import api from '../../worker/index.js';
import {hashSyncCode, verifySyncCode} from '../../worker/sync-code.js';
import {generateIcons} from '../../scripts/icons.mjs';

export const SYNC_CODE = 'browser-test-only-'.padEnd(43, 'x');

export async function startBrowserServer() {
  const directory = await mkdtemp(join(tmpdir(), 'cube-browser-'));
  const db = new DatabaseSync(':memory:');
  db.exec('CREATE TABLE solves (id TEXT PRIMARY KEY NOT NULL, data TEXT NOT NULL, updated_at INTEGER NOT NULL, deleted INTEGER NOT NULL DEFAULT 0)');
db.exec('CREATE TABLE IF NOT EXISTS lesson_attempts (id TEXT PRIMARY KEY NOT NULL, data TEXT NOT NULL, updated_at INTEGER NOT NULL, deleted INTEGER NOT NULL DEFAULT 0);');
  const env = {
    SYNC_CODE_HASH: await hashSyncCode(SYNC_CODE),
    DB: {
      prepare(sql) {
        const statement = db.prepare(sql);
        let args = [];
        return {
          bind(...values) { args = values; return this; },
          async all() { return {results: statement.all(...args)}; },
          async run() { return statement.run(...args); },
        };
      },
      async batch(statements) {
        db.exec('BEGIN');
        try {
          const results = await Promise.all(statements.map(statement => statement.run()));
          db.exec('COMMIT');
          return results;
        } catch (error) {
          db.exec('ROLLBACK');
          throw error;
        }
      },
    },
  };
  const assets = new Map();
  async function collect(directoryURL, prefix = '') {
    for (const entry of await readdir(directoryURL, {withFileTypes: true})) {
      const path = `${prefix}/${entry.name}`;
      const url = new URL(entry.name + (entry.isDirectory() ? '/' : ''), directoryURL);
      if (entry.isDirectory()) await collect(url, path);
      else assets.set(path, await readFile(url));
    }
  }
  await collect(new URL('../../web/', import.meta.url));
  await generateIcons(directory);
  for (const size of [180, 192, 512]) {
    assets.set(`/icons/icon-${size}.png`, await readFile(join(directory, `icon-${size}.png`)));
  }
  assets.set('/', assets.get('/index.html'));
  const types = {html: 'text/html', css: 'text/css', js: 'text/javascript', webmanifest: 'application/manifest+json', png: 'image/png'};
  let version = 1;
  let rejectedUploads = 0;
  const requests = [];
  const errors = [];
  const server = createServer(async (req, res) => {
    try {
      const url = new URL(req.url, `http://${req.headers.host}`);
      if (url.pathname.startsWith('/api/')) {
        const chunks = [];
        for await (const chunk of req) chunks.push(chunk);
        const body = Buffer.concat(chunks);
        const request = new Request(url, {
          method: req.method,
          headers: req.headers,
          ...(req.method !== 'GET' && req.method !== 'HEAD' ? {body} : {}),
        });
        let response;
        if (!await verifySyncCode(request, env)) response = Response.json({error: 'Connect this test device.'}, {status: 401});
        else if (req.method === 'POST' && rejectedUploads > 0) {
          rejectedUploads--;
          response = Response.json({error: 'Synthetic upload outage'}, {status: 503});
        } else response = await api.fetch(request, env);
        requests.push({method: req.method, path: url.pathname, status: response.status});
        res.writeHead(response.status, Object.fromEntries(response.headers));
        res.end(Buffer.from(await response.arrayBuffer()));
        return;
      }
      let content = assets.get(url.pathname);
      if (!content) { res.writeHead(404); res.end('Not found'); return; }
      if (url.pathname === '/sw.js') content = content.toString().replace('__VERSION__', `browser-${version}`);
      res.writeHead(200, {
        'content-type': types[url.pathname === '/' ? 'html' : url.pathname.split('.').pop()] || 'application/octet-stream',
        'cache-control': 'no-store',
        'content-security-policy': "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; connect-src 'self'",
      });
      res.end(content);
    } catch (error) {
      errors.push(error.message);
      res.writeHead(500); res.end('Browser fixture failed');
    }
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  return {
    url: `http://127.0.0.1:${server.address().port}`,
    requests,
    errors,
    deployUpdate() { version++; },
    rejectNextUploads(count = 1) { rejectedUploads = count; },
    solves() { return db.prepare('SELECT data FROM solves').all().map(row => JSON.parse(row.data)); },
    lessonAttempts() { return db.prepare('SELECT data FROM lesson_attempts').all().map(row => JSON.parse(row.data)); },
    async close() {
      const closed = new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
      server.closeAllConnections();
      await closed;
      db.close();
      await rm(directory, {recursive: true, force: true});
    },
  };
}
