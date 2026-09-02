#!/usr/bin/env node

'use strict';

const fs = require('fs');
const http = require('http');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const WATCHED_EXTENSIONS = new Set([
  '.html', '.css', '.js', '.json', '.svg', '.png', '.jpg', '.jpeg',
  '.gif', '.webp', '.ico', '.webmanifest', '.woff', '.woff2', '.ttf'
]);
const IGNORED_DIRECTORIES = new Set([
  '.git', '.codegraph', '.impeccable', 'node_modules', 'scripts',
  'webgl-black-hole'
]);
const MIME_TYPES = {
  '.css': 'text/css; charset=utf-8',
  '.gif': 'image/gif',
  '.html': 'text/html; charset=utf-8',
  '.ico': 'image/x-icon',
  '.jpeg': 'image/jpeg',
  '.jpg': 'image/jpeg',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml; charset=utf-8',
  '.ttf': 'font/ttf',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.webp': 'image/webp',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2'
};

const LIVE_RELOAD_CLIENT = [
  '<script data-local-live-reload>',
  '(() => {',
  "  const endpoint = '/__live_reload';",
  '  let currentVersion = null;',
  '  async function checkForChanges() {',
  '    try {',
  "      const response = await fetch(endpoint, { cache: 'no-store' });",
  '      const nextVersion = await response.text();',
  '      if (currentVersion !== null && nextVersion !== currentVersion) {',
  '        location.reload();',
  '        return;',
  '      }',
  '      currentVersion = nextVersion;',
  '    } catch (_) {}',
  '    setTimeout(checkForChanges, 500);',
  '  }',
  '  checkForChanges();',
  '})();',
  '</script>'
].join('\n');

function parseArguments(argv) {
  const options = { host: '127.0.0.1', port: 8123 };
  for (let index = 0; index < argv.length; index++) {
    if (argv[index] === '--host') options.host = argv[++index];
    else if (argv[index] === '--port') options.port = Number(argv[++index]);
    else throw new Error(`Unknown argument: ${argv[index]}`);
  }
  if (!Number.isInteger(options.port) || options.port < 1 || options.port > 65535) {
    throw new Error('Port must be an integer between 1 and 65535');
  }
  return options;
}

function shouldReload(filename) {
  if (!filename) return false;
  const normalized = String(filename).replace(/\\/g, '/');
  const segments = normalized.split('/');
  if (segments.some(segment => IGNORED_DIRECTORIES.has(segment))) return false;
  return WATCHED_EXTENSIONS.has(path.extname(normalized).toLowerCase());
}

function fileSignature(filePath) {
  try {
    const stats = fs.statSync(filePath);
    return stats.isFile() ? `${stats.mtimeMs}:${stats.size}` : null;
  } catch (_) {
    return null;
  }
}

function collectWatchedSignatures(directory, relativeDirectory, signatures) {
  const entries = fs.readdirSync(directory, { withFileTypes: true });
  for (const entry of entries) {
    const relative = relativeDirectory ? path.join(relativeDirectory, entry.name) : entry.name;
    if (entry.isDirectory()) {
      if (!IGNORED_DIRECTORIES.has(entry.name)) {
        collectWatchedSignatures(path.join(directory, entry.name), relative, signatures);
      }
    } else if (entry.isFile() && shouldReload(relative)) {
      signatures.set(relative.replace(/\\/g, '/'), fileSignature(path.join(directory, entry.name)));
    }
  }
  return signatures;
}

function injectLiveReload(html) {
  if (/<\/body>/i.test(html)) {
    return html.replace(/<\/body>/i, `${LIVE_RELOAD_CLIENT}\n</body>`);
  }
  return `${html}\n${LIVE_RELOAD_CLIENT}\n`;
}

function safeFilePath(urlPathname) {
  const decoded = decodeURIComponent(urlPathname);
  const relative = decoded.replace(/^[/\\]+/, '').replace(/[/\\]+/g, path.sep);
  const resolved = path.resolve(ROOT, relative);
  const rootPrefix = ROOT.toLowerCase() + path.sep;
  if (resolved !== ROOT && !resolved.toLowerCase().startsWith(rootPrefix)) return null;
  return resolved;
}

function sendText(response, statusCode, text, contentType) {
  const body = Buffer.from(text);
  response.writeHead(statusCode, {
    'Cache-Control': 'no-store',
    'Content-Length': body.length,
    'Content-Type': contentType || 'text/plain; charset=utf-8'
  });
  response.end(body);
}

async function serveFile(request, response, pathname) {
  let filePath;
  try {
    filePath = safeFilePath(pathname);
  } catch (_) {
    sendText(response, 400, 'Bad request');
    return;
  }
  if (!filePath) {
    sendText(response, 403, 'Forbidden');
    return;
  }

  let stats;
  try {
    stats = await fs.promises.stat(filePath);
    if (stats.isDirectory()) {
      filePath = path.join(filePath, 'index.html');
      stats = await fs.promises.stat(filePath);
    }
  } catch (_) {
    sendText(response, 404, 'Not found');
    return;
  }
  if (!stats.isFile()) {
    sendText(response, 404, 'Not found');
    return;
  }

  const extension = path.extname(filePath).toLowerCase();
  const contentType = MIME_TYPES[extension] || 'application/octet-stream';
  if (extension === '.html') {
    const html = injectLiveReload(await fs.promises.readFile(filePath, 'utf8'));
    if (request.method === 'HEAD') {
      response.writeHead(200, {
        'Cache-Control': 'no-store',
        'Content-Length': Buffer.byteLength(html),
        'Content-Type': contentType
      });
      response.end();
    } else {
      sendText(response, 200, html, contentType);
    }
    return;
  }

  response.writeHead(200, {
    'Cache-Control': 'no-store',
    'Content-Length': stats.size,
    'Content-Type': contentType
  });
  if (request.method === 'HEAD') response.end();
  else fs.createReadStream(filePath).pipe(response);
}

function startServer(options) {
  let reloadVersion = Date.now();
  let reloadTimer = null;
  const watchedSignatures = collectWatchedSignatures(ROOT, '', new Map());
  const watcher = fs.watch(ROOT, { recursive: true }, (_eventType, filename) => {
    if (!shouldReload(filename)) return;
    const normalized = String(filename).replace(/\\/g, '/');
    const nextSignature = fileSignature(path.resolve(ROOT, normalized));
    const previousSignature = watchedSignatures.get(normalized);
    if (nextSignature === previousSignature) return;
    if (nextSignature === null) watchedSignatures.delete(normalized);
    else watchedSignatures.set(normalized, nextSignature);
    clearTimeout(reloadTimer);
    reloadTimer = setTimeout(() => {
      reloadVersion++;
      console.log(`Reloading after ${normalized} changed`);
    }, 80);
  });

  const server = http.createServer(async (request, response) => {
    const method = request.method || 'GET';
    if (method !== 'GET' && method !== 'HEAD') {
      sendText(response, 405, 'Method not allowed');
      return;
    }

    let pathname;
    try {
      pathname = new URL(request.url, `http://${options.host}:${options.port}`).pathname;
    } catch (_) {
      sendText(response, 400, 'Bad request');
      return;
    }

    if (pathname === '/__live_reload') {
      sendText(response, 200, String(reloadVersion));
      return;
    }

    try {
      await serveFile(request, response, pathname);
    } catch (error) {
      console.error(error);
      if (!response.headersSent) sendText(response, 500, 'Internal server error');
      else response.destroy();
    }
  });

  function shutDown() {
    clearTimeout(reloadTimer);
    watcher.close();
    server.close(() => process.exit(0));
  }

  process.on('SIGINT', shutDown);
  process.on('SIGTERM', shutDown);
  server.on('error', error => {
    watcher.close();
    if (error.code === 'EADDRINUSE') {
      console.error(`Port ${options.port} is already in use.`);
    } else {
      console.error(error);
    }
    process.exitCode = 1;
  });
  server.listen(options.port, options.host, () => {
    console.log(`Site running with live reload at http://${options.host}:${options.port}/`);
    console.log('Press Ctrl+C to stop the server.');
  });
}

try {
  startServer(parseArguments(process.argv.slice(2)));
} catch (error) {
  console.error(error.message || error);
  process.exitCode = 1;
}
