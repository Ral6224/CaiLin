'use strict';

const http = require('node:http');
const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
const { URL } = require('node:url');
const { Store, ValidationError, NotFoundError } = require('./lib/store');
const { createZip, readZip } = require('./lib/zip');
const { parseMultipart } = require('./lib/multipart');

const ROOT = __dirname;
const PUBLIC_DIR = path.join(ROOT, 'public');
const DATA_FILE = path.join(ROOT, 'data', 'materials.json');
const BACKUP_DIR = path.join(ROOT, 'backup');
const APP_VERSION = require('./package.json').version;
const PORT = Number(process.env.PORT) || 9850;
const HOST = process.env.HOST || '127.0.0.1';

const MAX_JSON_BODY = 1024 * 1024;
const MAX_IMPORT_BODY = 27 * 1024 * 1024;
const MAX_IMPORT_FILE = 24 * 1024 * 1024;
const IMPORT_TTL = 15 * 60 * 1000;
const BACKUP_NAME = /^cailin-backup-\d{8}-\d{6}(?:-\d+)?\.zip$/;
const IMPORT_TOKEN = /^[a-f0-9]{32,64}$/;

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2'
};

const store = new Store(DATA_FILE);
const importPreviews = new Map();

function setSecurityHeaders(res) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'same-origin');
  res.setHeader(
    'Content-Security-Policy',
    "default-src 'self'; style-src 'self'; script-src 'self'; img-src 'self' data:; font-src 'self'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'"
  );
}

function sendJson(res, status, body) {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(payload),
    'Cache-Control': 'no-store'
  });
  res.end(payload);
}

function sendError(res, error) {
  const status = error.status || 500;
  if (status >= 500) console.error(error);
  sendJson(res, status, {
    error: status >= 500 ? '服务器暂时无法完成请求。' : error.message
  });
}

function statusError(message, status) {
  const error = new Error(message);
  error.status = status;
  return error;
}

async function readBody(req, limit) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > limit) throw statusError('提交的内容过大。', 413);
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

async function readJsonBody(req) {
  const type = req.headers['content-type'] || '';
  if (!type.includes('application/json')) {
    throw new ValidationError('请使用 JSON 格式提交。');
  }
  const raw = await readBody(req, MAX_JSON_BODY);
  if (!raw.length) throw new ValidationError('请求内容为空。');
  try {
    return JSON.parse(raw.toString('utf8'));
  } catch {
    throw new ValidationError('JSON 格式不正确。');
  }
}

async function readUpload(req) {
  const type = req.headers['content-type'] || '';
  if (!type.toLowerCase().startsWith('multipart/form-data')) {
    throw new ValidationError('请上传 ZIP 文件。');
  }
  const raw = await readBody(req, MAX_IMPORT_BODY);
  return parseMultipart(raw, type);
}

function parseJsonBuffer(buffer, label) {
  let text = buffer.toString('utf8');
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
  try {
    return JSON.parse(text);
  } catch {
    throw new ValidationError(label + ' 不是有效的 JSON。');
  }
}

function normalizeTheme(value) {
  return value === 'dark' || value === 'light' ? value : 'system';
}

function parseBackup(buffer) {
  let entries;
  try {
    entries = readZip(buffer);
  } catch (error) {
    throw new ValidationError('无法读取备份 ZIP：' + error.message);
  }

  const materialsEntry = entries.get('materials.json');
  if (!materialsEntry) throw new ValidationError('备份中缺少 materials.json。');

  const raw = parseJsonBuffer(materialsEntry, 'materials.json');
  const rawItems = Array.isArray(raw) ? raw : raw && raw.materials;
  if (!Array.isArray(rawItems)) throw new ValidationError('备份中的 materials.json 格式不正确。');

  let settings = { theme: 'system' };
  const settingsEntry = entries.get('settings.json');
  if (settingsEntry) {
    const parsed = parseJsonBuffer(settingsEntry, 'settings.json');
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new ValidationError('备份中的 settings.json 格式不正确。');
    }
    settings = { theme: normalizeTheme(parsed.theme) };
  }

  let manifest = {};
  const manifestEntry = entries.get('manifest.json');
  if (manifestEntry) {
    const parsed = parseJsonBuffer(manifestEntry, 'manifest.json');
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) manifest = parsed;
  }

  return { rawItems, settings, manifest };
}

function backupPath(name) {
  if (!BACKUP_NAME.test(name)) throw new NotFoundError('没有找到这份备份。');
  const target = path.join(BACKUP_DIR, name);
  if (path.dirname(target) !== BACKUP_DIR) throw new NotFoundError('没有找到这份备份。');
  return target;
}

async function existingFile(target) {
  try {
    const stat = await fs.stat(target);
    return stat.isFile() ? stat : null;
  } catch (error) {
    if (error.code === 'ENOENT') return null;
    throw error;
  }
}

function localStamp(date) {
  const pad = (value) => String(value).padStart(2, '0');
  return String(date.getFullYear()) + pad(date.getMonth() + 1) + pad(date.getDate()) +
    '-' + pad(date.getHours()) + pad(date.getMinutes()) + pad(date.getSeconds());
}

async function createBackupFile(theme) {
  const snapshot = store.snapshot();
  const createdAt = new Date().toISOString();
  const settings = {
    theme: normalizeTheme(theme),
    appVersion: APP_VERSION
  };
  const manifest = {
    app: 'cailin',
    format: 1,
    version: APP_VERSION,
    createdAt,
    materialCount: snapshot.materials.length
  };
  const archive = createZip([
    { name: 'manifest.json', data: Buffer.from(JSON.stringify(manifest, null, 2) + '\n', 'utf8') },
    { name: 'materials.json', data: Buffer.from(JSON.stringify(snapshot.materials, null, 2) + '\n', 'utf8') },
    { name: 'settings.json', data: Buffer.from(JSON.stringify(settings, null, 2) + '\n', 'utf8') }
  ]);

  await fs.mkdir(BACKUP_DIR, { recursive: true });
  const base = 'cailin-backup-' + localStamp(new Date());
  let name = base + '.zip';
  let index = 2;
  while (await existingFile(path.join(BACKUP_DIR, name))) {
    name = base + '-' + index + '.zip';
    index += 1;
  }

  const target = path.join(BACKUP_DIR, name);
  const tmp = path.join(BACKUP_DIR, '.' + name + '.tmp');
  await fs.writeFile(tmp, archive, { mode: 0o600 });
  await fs.rename(tmp, target);
  const stat = await fs.stat(target);

  return {
    name,
    size: stat.size,
    createdAt,
    materialCount: snapshot.materials.length,
    valid: true
  };
}

async function listBackups() {
  let directory;
  try {
    directory = await fs.readdir(BACKUP_DIR, { withFileTypes: true });
  } catch (error) {
    if (error.code === 'ENOENT') return [];
    throw error;
  }

  const names = directory
    .filter((entry) => entry.isFile() && BACKUP_NAME.test(entry.name))
    .map((entry) => entry.name)
    .sort()
    .reverse()
    .slice(0, 200);

  const items = [];
  for (const name of names) {
    const target = path.join(BACKUP_DIR, name);
    try {
      const stat = await fs.stat(target);
      let materialCount = null;
      let createdAt = stat.mtime.toISOString();
      let valid = true;
      try {
        const parsed = parseBackup(await fs.readFile(target));
        materialCount = parsed.rawItems.length;
        if (parsed.manifest.createdAt) {
          const date = new Date(parsed.manifest.createdAt);
          if (!Number.isNaN(date.getTime())) createdAt = date.toISOString();
        }
      } catch {
        valid = false;
      }
      items.push({ name, size: stat.size, createdAt, materialCount, valid });
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
  }

  items.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  return items;
}

function prunePreviews() {
  const now = Date.now();
  for (const [token, preview] of importPreviews) {
    if (preview.expiresAt <= now) importPreviews.delete(token);
  }
}

function filterMaterials(items, params) {
  const q = (params.get('q') || '').trim().toLowerCase();
  const topic = (params.get('topic') || '').trim();
  const person = (params.get('person') || '').trim();

  return items.filter((item) => {
    if (topic && !item.topics.includes(topic)) return false;
    if (person && item.person !== person) return false;
    if (!q) return true;
    const haystack = [
      item.person,
      item.identity,
      item.deeds,
      item.quote,
      item.source,
      item.spirit,
      item.topics.join(' '),
      item.keywords.join(' ')
    ].join('\n').toLowerCase();
    return haystack.includes(q);
  });
}

function backupRouteName(match) {
  try {
    return decodeURIComponent(match[1]);
  } catch {
    throw new NotFoundError('没有找到这份备份。');
  }
}

async function handleApi(req, res, url) {
  const { pathname, searchParams } = url;

  if (req.method === 'GET' && pathname === '/api/health') {
    return sendJson(res, 200, { ok: true });
  }

  if (req.method === 'GET' && pathname === '/api/materials') {
    const items = filterMaterials(store.list(), searchParams);
    return sendJson(res, 200, {
      materials: items,
      facets: store.facets()
    });
  }

  if (req.method === 'POST' && pathname === '/api/materials') {
    const body = await readJsonBody(req);
    const item = await store.create(body);
    return sendJson(res, 201, { material: item });
  }

  const materialMatch = pathname.match(/^\/api\/materials\/([a-zA-Z0-9-]+)$/);
  if (materialMatch) {
    const id = materialMatch[1];
    if (req.method === 'GET') {
      const item = store.find(id);
      if (!item) throw new NotFoundError('没有找到这则素材。');
      return sendJson(res, 200, { material: item });
    }
    if (req.method === 'PUT') {
      const body = await readJsonBody(req);
      const item = await store.update(id, body);
      return sendJson(res, 200, { material: item });
    }
    if (req.method === 'DELETE') {
      await store.remove(id);
      res.writeHead(204, { 'Cache-Control': 'no-store' });
      return res.end();
    }
  }

  if (pathname === '/api/backups') {
    if (req.method === 'GET') {
      return sendJson(res, 200, {
        backups: await listBackups(),
        stats: store.facets().stats
      });
    }
    if (req.method === 'POST') {
      const body = await readJsonBody(req);
      const backup = await createBackupFile(body.theme);
      return sendJson(res, 201, { backup });
    }
  }

  const backupMatch = pathname.match(/^\/api\/backups\/([^/]+)(?:\/(download|restore))?$/);
  if (backupMatch) {
    const name = backupRouteName(backupMatch);
    const action = backupMatch[2] || '';
    const target = backupPath(name);

    if (req.method === 'GET' && action === 'download') {
      let data;
      try {
        data = await fs.readFile(target);
      } catch (error) {
        if (error.code === 'ENOENT') throw new NotFoundError('没有找到这份备份。');
        throw error;
      }
      res.writeHead(200, {
        'Content-Type': 'application/zip',
        'Content-Length': data.length,
        'Content-Disposition': 'attachment; filename="' + name + '"',
        'Cache-Control': 'no-store'
      });
      return res.end(data);
    }

    if (req.method === 'POST' && action === 'restore') {
      const body = await readJsonBody(req);
      if (body.confirm !== true) throw new ValidationError('请确认覆盖当前数据。');
      let data;
      try {
        data = await fs.readFile(target);
      } catch (error) {
        if (error.code === 'ENOENT') throw new NotFoundError('没有找到这份备份。');
        throw error;
      }
      const parsed = parseBackup(data);
      const result = await store.replaceAll(parsed.rawItems);
      return sendJson(res, 200, {
        materialCount: result.total,
        settings: parsed.settings
      });
    }

    if (req.method === 'DELETE' && !action) {
      try {
        await fs.unlink(target);
      } catch (error) {
        if (error.code === 'ENOENT') throw new NotFoundError('没有找到这份备份。');
        throw error;
      }
      res.writeHead(204, { 'Cache-Control': 'no-store' });
      return res.end();
    }
  }

  if (req.method === 'POST' && pathname === '/api/reset') {
    const body = await readJsonBody(req);
    if (body.confirm !== true) throw new ValidationError('请确认恢复初始设置。');
    const result = await store.resetToDefaults();
    return sendJson(res, 200, { materialCount: result.total });
  }

  if (req.method === 'POST' && pathname === '/api/import/preview') {
    const upload = await readUpload(req);
    const file = upload.files.find((item) => item.field === 'file') || upload.files[0];
    if (!file) throw new ValidationError('请选择要导入的 ZIP 备份。');
    if (file.data.length > MAX_IMPORT_FILE) {
      throw statusError('备份文件过大，最大支持 24 MB。', 413);
    }
    if (file.data.length < 4 || file.data[0] !== 0x50 || file.data[1] !== 0x4b) {
      throw new ValidationError('请选择有效的 ZIP 备份文件。');
    }

    const parsed = parseBackup(file.data);
    const items = store.normalizeSnapshot(parsed.rawItems);
    const comparison = store.compareImport(items);
    const token = crypto.randomBytes(24).toString('hex');
    prunePreviews();
    let finalToken = token;
    while (importPreviews.has(finalToken)) {
      finalToken = crypto.randomBytes(24).toString('hex');
    }
    while (importPreviews.size >= 5) {
      importPreviews.delete(importPreviews.keys().next().value);
    }
    importPreviews.set(finalToken, {
      items,
      settings: parsed.settings,
      filename: file.filename,
      expiresAt: Date.now() + IMPORT_TTL
    });

    return sendJson(res, 200, {
      token: finalToken,
      filename: file.filename,
      materialCount: items.length,
      duplicateCount: comparison.duplicateCount,
      duplicatePeople: comparison.duplicatePeople,
      settings: parsed.settings
    });
  }

  if (req.method === 'POST' && pathname === '/api/import/commit') {
    const body = await readJsonBody(req);
    const token = String(body.token || '');
    if (!IMPORT_TOKEN.test(token)) throw new ValidationError('导入凭证不正确。');
    const preview = importPreviews.get(token);
    if (!preview || preview.expiresAt <= Date.now()) {
      importPreviews.delete(token);
      throw statusError('这次导入已过期，请重新选择备份文件。', 410);
    }
    if (body.mode !== 'merge' && body.mode !== 'overwrite') {
      throw new ValidationError('请选择导入方式。');
    }

    const result = body.mode === 'merge'
      ? await store.mergeAll(preview.items)
      : await store.replaceAll(preview.items);
    importPreviews.delete(token);
    return sendJson(res, 200, {
      mode: body.mode,
      ...result,
      materialCount: result.total,
      settings: preview.settings
    });
  }

  const importCancel = pathname.match(/^\/api\/import\/preview\/([a-f0-9]{32,64})$/);
  if (req.method === 'DELETE' && importCancel) {
    importPreviews.delete(importCancel[1]);
    res.writeHead(204, { 'Cache-Control': 'no-store' });
    return res.end();
  }

  throw new NotFoundError('接口不存在。');
}

async function serveStatic(req, res, url) {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.writeHead(405, { Allow: 'GET, HEAD' });
    return res.end('Method Not Allowed');
  }

  let pathname;
  try {
    pathname = decodeURIComponent(url.pathname);
  } catch {
    res.writeHead(400);
    return res.end('Bad Request');
  }

  const relative = pathname === '/' ? 'index.html' : pathname.replace(/^\/+/, '');
  const filePath = path.resolve(PUBLIC_DIR, relative);
  if (filePath !== PUBLIC_DIR && !filePath.startsWith(PUBLIC_DIR + path.sep)) {
    res.writeHead(403);
    return res.end('Forbidden');
  }

  try {
    const stats = await fs.stat(filePath);
    if (!stats.isFile()) throw Object.assign(new Error('not a file'), { code: 'ENOENT' });
    const data = await fs.readFile(filePath);
    const ext = path.extname(filePath).toLowerCase();
    res.writeHead(200, {
      'Content-Type': MIME_TYPES[ext] || 'application/octet-stream',
      'Content-Length': data.length,
      'Cache-Control': 'no-cache'
    });
    if (req.method === 'HEAD') return res.end();
    res.end(data);
  } catch (error) {
    if (error.code === 'ENOENT' || error.code === 'EISDIR') {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      return res.end('页面不存在');
    }
    throw error;
  }
}

const server = http.createServer(async (req, res) => {
  setSecurityHeaders(res);
  const started = Date.now();
  const url = new URL(req.url, 'http://localhost');

  try {
    if (url.pathname.startsWith('/api/')) {
      await handleApi(req, res, url);
    } else {
      await serveStatic(req, res, url);
    }
  } catch (error) {
    if (res.headersSent) {
      res.end();
    } else {
      sendError(res, error);
    }
  } finally {
    const time = new Date().toISOString();
    console.log(time + ' ' + req.method + ' ' + url.pathname + ' ' + res.statusCode + ' ' + (Date.now() - started) + 'ms');
  }
});

async function main() {
  await fs.mkdir(BACKUP_DIR, { recursive: true });
  await store.init();
  server.listen(PORT, HOST, () => {
    console.log('');
    console.log('  材林——素材之森林 已启动');
    console.log('  地址: http://' + HOST + ':' + PORT);
    console.log('  数据: ' + DATA_FILE);
    console.log('  备份: ' + BACKUP_DIR);
    console.log('  停止: Ctrl + C');
    console.log('');
  });
}

server.on('error', (error) => {
  if (error.code === 'EADDRINUSE') {
    console.error('端口 ' + PORT + ' 已被占用，请设置其他端口后重试，例如：PORT=9851 node server.js');
  } else {
    console.error(error);
  }
  process.exitCode = 1;
});

process.on('SIGINT', () => {
  server.close(() => process.exit(0));
});

main().catch((error) => {
  console.error('启动失败：', error);
  process.exit(1);
});
