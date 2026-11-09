// Helpers shared by the local patch services (Vite dev/preview server middleware).
import fs from 'node:fs/promises';
import path from 'node:path';
import { execFile } from 'node:child_process';

const MAX_BODY = 64 * 1024 * 1024;
const LOCAL_ORIGIN = /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/i;

export const exists = async (p) => {
  try { await fs.access(p); return true; } catch { return false; }
};

// Steam library folders that may contain `steamapps/common/<dirName>`.
export async function steamGameCandidates(dirName) {
  const steamRoots = ['C:\\Program Files (x86)\\Steam', 'C:\\Program Files\\Steam'];
  const candidates = [];
  for (const steam of steamRoots) {
    candidates.push(path.join(steam, 'steamapps', 'common', dirName));
    try {
      const vdf = await fs.readFile(path.join(steam, 'steamapps', 'libraryfolders.vdf'), 'utf8');
      for (const m of vdf.matchAll(/"path"\s+"([^"]+)"/g)) {
        candidates.push(path.join(m[1].replace(/\\\\/g, '\\'), 'steamapps', 'common', dirName));
      }
    } catch { /* no vdf here */ }
  }
  return [...new Set(candidates)];
}

export function isProcessRunning(imageName) {
  if (process.platform !== 'win32') return Promise.resolve(false);
  return new Promise((resolve) => {
    execFile('tasklist', ['/FI', `IMAGENAME eq ${imageName}`, '/NH'], { windowsHide: true }, (err, stdout) => {
      resolve(!err && (stdout || '').toLowerCase().includes(imageName.toLowerCase()));
    });
  });
}

export function send(res, status, data) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(data));
}

export function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (c) => {
      size += c.length;
      if (size > MAX_BODY) { reject(new Error('İstek çok büyük.')); req.destroy(); return; }
      chunks.push(c);
    });
    req.on('end', () => {
      try { resolve(chunks.length ? JSON.parse(Buffer.concat(chunks).toString('utf8')) : {}); }
      catch { reject(new Error('Geçersiz JSON.')); }
    });
    req.on('error', reject);
  });
}

// Wraps a router `(route, body) => data` into a Vite plugin serving `${base}/...`.
// GET requests get `body = null`; POST requests must be JSON. Only local pages may call it.
export function createApiPlugin(name, base, router) {
  const handle = async (req, res) => {
    const origin = req.headers.origin;
    if (origin && !LOCAL_ORIGIN.test(origin)) return send(res, 403, { error: 'Yalnızca yerel istekler kabul edilir.' });
    const route = req.url.slice(base.length).split('?')[0];
    let body = null;
    if (req.method === 'POST') {
      if (!/application\/json/i.test(req.headers['content-type'] || '')) return send(res, 415, { error: 'JSON bekleniyor.' });
      body = await readBody(req);
    } else if (req.method !== 'GET') {
      return send(res, 405, { error: 'Method not allowed' });
    }
    const data = await router(route, body, req.method);
    if (data === undefined) return send(res, 404, { error: 'Bilinmeyen istek.' });
    return send(res, 200, data);
  };
  const middleware = (req, res, next) => {
    if (!req.url || !req.url.startsWith(base + '/')) return next();
    handle(req, res).catch((err) => send(res, 500, { error: err.message || String(err) }));
  };
  return {
    name,
    configureServer(server) { server.middlewares.use(middleware); },
    configurePreviewServer(server) { server.middlewares.use(middleware); },
  };
}
