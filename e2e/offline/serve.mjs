/**
 * P1369 offline harness: a static server that behaves like the Vercel deployment for the
 * properties the offline work depends on.
 *
 *  - /assets/*          -> immutable (`public, max-age=31536000, immutable`); 404 when absent,
 *                          exactly as a new Vercel deployment 404s the previous build's chunks.
 *  - any other file     -> `public, max-age=0, must-revalidate` (Vercel's default for sw.js/HTML).
 *  - unknown path       -> index.html (SPA fallback), same revalidation header.
 *  - global headers     -> copied from vercel.json's "/(.*)" rule (CSP etc.).
 *
 * Which build is served is read on EVERY request from `<OFFLINE_BUILD_ROOT>/current`
 * ("a" or "b"), so a test can "deploy" build B mid-test by writing that file.
 */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';

const PORT = Number(process.env.OFFLINE_PORT);
const ROOT = process.env.OFFLINE_BUILD_ROOT;
if (!PORT || !ROOT) {
  console.error('serve.mjs: OFFLINE_PORT and OFFLINE_BUILD_ROOT are required');
  process.exit(2);
}

const vercel = JSON.parse(fs.readFileSync(path.resolve(process.cwd(), 'vercel.json'), 'utf8'));
const globalHeaders = (vercel.headers || []).find((h) => h.source === '/(.*)')?.headers || [];

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.mjs': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8',
  '.xml': 'application/xml',
  '.mp3': 'audio/mpeg',
  '.mp4': 'video/mp4',
  '.map': 'application/json',
};

function currentDir() {
  let which = 'a';
  try {
    which = fs.readFileSync(path.join(ROOT, 'current'), 'utf8').trim() || 'a';
  } catch {
    /* default a */
  }
  return path.join(ROOT, which);
}

function send(res, status, file, cacheControl) {
  for (const h of globalHeaders) res.setHeader(h.key, h.value);
  res.setHeader('Cache-Control', cacheControl);
  res.setHeader('Content-Type', MIME[path.extname(file)] || 'application/octet-stream');
  res.writeHead(status);
  fs.createReadStream(file).pipe(res);
}

const server = http.createServer((req, res) => {
  const urlPath = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  if (urlPath === '/__bench/health') {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('ok');
    return;
  }
  // "Network down": the harness's offline switch. Destroying the socket makes every request —
  // including ones the service worker makes itself, which Playwright's setOffline does not block —
  // fail as a network error.
  if (fs.existsSync(path.join(ROOT, 'down'))) {
    req.socket.destroy();
    return;
  }
  const dir = currentDir();
  const indexFile = path.join(dir, 'index.html');
  if (!fs.existsSync(indexFile)) {
    res.writeHead(503, { 'Content-Type': 'text/plain' });
    res.end(`build not ready: ${dir}`);
    return;
  }
  const file = path.normalize(path.join(dir, urlPath));
  if (!file.startsWith(dir)) {
    res.writeHead(400);
    res.end();
    return;
  }
  const isFile = fs.existsSync(file) && fs.statSync(file).isFile();
  if (urlPath.startsWith('/assets/')) {
    if (!isFile) {
      for (const h of globalHeaders) res.setHeader(h.key, h.value);
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('not found');
      return;
    }
    send(res, 200, file, 'public, max-age=31536000, immutable');
    return;
  }
  if (isFile) {
    send(res, 200, file, 'public, max-age=0, must-revalidate');
    return;
  }
  send(res, 200, indexFile, 'public, max-age=0, must-revalidate');
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`p1369 offline server on http://localhost:${PORT} serving ${ROOT}/<current>`);
});
