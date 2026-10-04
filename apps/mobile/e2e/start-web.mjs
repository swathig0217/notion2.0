// Builds the web app against the local Supabase stack and serves it with SPA fallback.
// Usage: node e2e/start-web.mjs  (requires `pnpm db:start`)
import { execFileSync } from 'node:child_process';
import { createReadStream, existsSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, join, resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const out = join(root, 'dist-e2e');
const port = Number(process.env.PORT ?? 8081);

const status = JSON.parse(
  execFileSync('npx', ['supabase', 'status', '-o', 'json'], {
    cwd: resolve(root, '../..'),
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'ignore'],
  }),
);

execFileSync('npx', ['expo', 'export', '--platform', 'web', '--clear', '--output-dir', out], {
  cwd: root,
  stdio: 'inherit',
  env: {
    ...process.env,
    CI: '1',
    EXPO_PUBLIC_SUPABASE_URL: status.API_URL,
    EXPO_PUBLIC_SUPABASE_ANON_KEY: status.ANON_KEY,
    EXPO_PUBLIC_INBOUND_EMAIL_DOMAIN: 'in.notion2.test',
  },
});

const types = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.ttf': 'font/ttf',
};

createServer((req, res) => {
  const path = decodeURIComponent(new URL(req.url ?? '/', 'http://x').pathname);
  let file = join(out, path);
  if (!file.startsWith(out) || !existsSync(file) || statSync(file).isDirectory()) {
    file = join(out, 'index.html');
  }
  res.writeHead(200, { 'content-type': types[extname(file)] ?? 'application/octet-stream' });
  createReadStream(file).pipe(res);
}).listen(port, () => process.stdout.write(`e2e web server on http://localhost:${port}\n`));
