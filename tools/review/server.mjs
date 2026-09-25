#!/usr/bin/env node
// Outil de revue (dev) : mini serveur local, en lecture seule, qui sert la
// page tools/review/ et les sources du jeu, et prévient la page quand un
// fichier change (elle se recharge seule). Sans dépendance, en écoute sur
// 127.0.0.1 uniquement. Lancement : scripts/review.sh (voir docs/dev-workflow.md).

import http from 'node:http';
import { readFile, readdir, stat } from 'node:fs/promises';
import { watch } from 'node:fs';
import { dirname, extname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

import { resolvePath, HOME } from './paths.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const WATCHED = ['core', 'packs', 'po', 'extension', 'tools/review'];
const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.wav': 'audio/wav',
  '.po': 'text/plain; charset=utf-8',
};

const portArg = process.argv.indexOf('--port');
const PORT = portArg > 0 ? Number(process.argv[portArg + 1]) : 8765;

/** Pages ouvertes qui écoutent les changements de fichiers. */
const listeners = new Set();
let pending = null;

function notifyChange(file) {
  clearTimeout(pending);
  pending = setTimeout(() => {
    for (const res of listeners) res.write(`event: change\ndata: ${JSON.stringify(file)}\n\n`);
  }, 200); // anti-rebond : un enregistrement produit souvent plusieurs événements
}

for (const dir of WATCHED) {
  try {
    watch(join(ROOT, dir), { recursive: true }, (_event, name) => notifyChange(`${dir}/${name ?? ''}`));
  } catch (e) {
    console.warn(`Surveillance impossible de ${dir} (${e.message}) : pas de rechargement automatique.`);
  }
}

async function listFiles(dir, base = dir) {
  const out = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...(await listFiles(path, base)));
    else out.push(relative(base, path));
  }
  return out;
}

function send(res, status, body, type = 'text/plain; charset=utf-8') {
  res.writeHead(status, { 'Content-Type': type, 'Cache-Control': 'no-store' });
  res.end(body);
}

const json = (res, data) => send(res, 200, JSON.stringify(data), TYPES['.json']);

async function handle(req, res) {
  if (req.method !== 'GET') return send(res, 405, 'Lecture seule.');
  const url = new URL(req.url, 'http://127.0.0.1');
  const path = url.pathname;

  if (path === '/') {
    res.writeHead(302, { Location: HOME });
    return res.end();
  }
  if (path === '/api/packs') {
    const ids = [];
    for (const entry of await readdir(join(ROOT, 'packs'), { withFileTypes: true })) {
      if (entry.isDirectory() && (await stat(join(ROOT, 'packs', entry.name, 'pack.json')).catch(() => null))) ids.push(entry.name);
    }
    return json(res, ids.sort());
  }
  if (path === '/api/files') {
    const pack = url.searchParams.get('pack') ?? '';
    if (!/^[a-z0-9-]+$/.test(pack)) return send(res, 400, 'Pack invalide.');
    const files = await listFiles(join(ROOT, 'packs', pack)).catch(() => null);
    return files ? json(res, files.sort()) : send(res, 404, 'Pack inconnu.');
  }
  if (path === '/api/events') {
    res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-store', Connection: 'keep-alive' });
    res.write(': connecté\n\n');
    listeners.add(res);
    const keepAlive = setInterval(() => res.write(': ping\n\n'), 25_000);
    req.on('close', () => {
      clearInterval(keepAlive);
      listeners.delete(res);
    });
    return undefined;
  }

  const file = resolvePath(ROOT, path);
  if (!file) return send(res, 404, 'Introuvable.');
  try {
    const body = await readFile(file);
    return send(res, 200, body, TYPES[extname(file)] ?? 'application/octet-stream');
  } catch {
    return send(res, 404, 'Introuvable.');
  }
}

http
  .createServer((req, res) => {
    handle(req, res).catch((e) => send(res, 500, `Erreur : ${e.message}`));
  })
  .listen(PORT, '127.0.0.1', () => {
    console.log(`Outil de revue : http://127.0.0.1:${PORT}${HOME}  (Ctrl+C pour arrêter)`);
  });
