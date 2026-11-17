// Локальная имитация PhotoUpload.gs (выполняет тот же файл). Для разработки с эмуляторами Firebase.
//   AUTH_BASE=http://127.0.0.1:9099/identitytoolkit.googleapis.com FIREBASE_API_KEY=demo-key node gas/photo-mock.mjs
// → NEXT_PUBLIC_GAS_UPLOAD_URL=http://localhost:8787/exec ; фото отдаются с /thumbnail?id=…
import http from 'node:http'; import fs from 'node:fs'; import vm from 'node:vm'; import crypto from 'node:crypto'; import { execFileSync } from 'node:child_process';
import path from 'node:path'; import { fileURLToPath } from 'node:url';
const dir = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT || 8787);
const files = {}; const props = { FIREBASE_API_KEY: process.env.FIREBASE_API_KEY || 'demo-key', AUTH_BASE: process.env.AUTH_BASE || '' }; const cache = {};
const iter = a => { let i = 0; return { hasNext: () => i < a.length, next: () => a[i++] }; };
const folder = { getId: () => 'f1', getName: () => 'College_Threads_Media', isTrashed: () => false,
  createFile: b => { const id = crypto.randomUUID().replace(/-/g, ''); files[id] = b; return { getId: () => id, setSharing: () => {} }; } };
const sb = {
  DriveApp: { Access: {}, Permission: {}, getFolderById: () => folder, getFoldersByName: () => iter([folder]), createFolder: () => folder },
  Utilities: { base64Decode: s => Buffer.from(s, 'base64'), newBlob: (bytes, mime) => ({ bytes, mime }),
    computeDigest: (_a, s) => crypto.createHash('sha256').update(s).digest(), base64EncodeWebSafe: b => Buffer.from(b).toString('base64url'), DigestAlgorithm: {} },
  CacheService: { getScriptCache: () => ({ get: k => cache[k] || null, put: (k, v) => { cache[k] = v; } }) },
  PropertiesService: { getScriptProperties: () => ({ getProperty: k => props[k] || null, setProperty: (k, v) => { props[k] = v; } }) },
  UrlFetchApp: { fetch: (url, o) => { // синхронный HTTP, как в Apps Script
    const out = execFileSync('curl', ['-s', '-w', '\n%{http_code}', '-X', 'POST', '-H', 'Content-Type: application/json', '--data-binary', o.payload, url], { encoding: 'utf8' });
    const i = out.lastIndexOf('\n'); return { getResponseCode: () => Number(out.slice(i + 1)), getContentText: () => out.slice(0, i) }; } },
  ContentService: { MimeType: {}, createTextOutput: s => ({ content: s, setMimeType() { return this; } }) },
};
vm.createContext(sb); vm.runInContext(fs.readFileSync(path.join(dir, 'PhotoUpload.gs'), 'utf8'), sb);
http.createServer((req, res) => {
  const url = new URL(req.url, 'http://x'); const cors = { 'Access-Control-Allow-Origin': '*' };
  if (url.pathname === '/thumbnail') { const f = files[url.searchParams.get('id')]; res.writeHead(f ? 200 : 404, { ...cors, 'Content-Type': f?.mime || 'text/plain' }); return res.end(f?.bytes); }
  let body = ''; req.on('data', c => (body += c)); req.on('end', () => {
    const out = req.method === 'POST' ? sb.doPost({ postData: { contents: body } }) : sb.doGet();
    res.writeHead(200, { ...cors, 'Content-Type': 'application/json' }); res.end(out.content);
  });
}).listen(PORT, () => console.log(`PhotoUpload mock → http://localhost:${PORT}/exec`));
