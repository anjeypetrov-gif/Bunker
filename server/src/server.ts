import express from 'express';
import http from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import { GameEngine } from './game/GameEngine';
import { registerSocketHandlers } from './sockets/socketHandler';

import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import { stats, DATA_DIR } from './stats';
import { loadState, saveState } from './persistence';

const app = express();
app.use(cors());
app.use(express.json());

// Serve static client files when built
const clientDist = path.join(__dirname, '../../client/dist');
app.use(express.static(clientDist));

const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  }
});

const gameEngine = new GameEngine();
gameEngine.onGameStart = () => stats.gameStarted();
gameEngine.onGameOver = () => stats.gameFinished();
registerSocketHandlers(io, gameEngine);

// ---- Восстановление комнат после перезапуска ----
const restored = loadState(gameEngine);
if (restored > 0) {
  console.log(`[Bunker Server] Восстановлено комнат: ${restored}`);
  // Кто не вернулся за 2 минуты, удаляется из комнаты.
  setTimeout(() => {
    for (const { code, id } of gameEngine.listOfflineHumans()) {
      const res = gameEngine.leaveRoom(id);
      if (res.room) io.to(code).emit('room_updated', res.room);
    }
  }, 120000);
}
setInterval(() => saveState(gameEngine), 5000);
setInterval(() => { stats.players(io.engine.clientsCount); stats.save(); }, 10000);
const shutdown = () => { saveState(gameEngine); stats.save(); process.exit(0); };
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

// ---- Ошибки клиента и статистика ----
interface ClientErr { t: string; msg: string; stack?: string; url?: string; ua?: string }
const recentErrors: ClientErr[] = [];
const errHits = new Map<string, { n: number; reset: number }>();
const clip = (v: unknown, n: number) => String(v ?? '').slice(0, n);

app.post('/api/client-error', (req, res) => {
  const ip = String(req.headers['x-forwarded-for'] || req.socket.remoteAddress || '').split(',')[0].trim();
  const now = Date.now();
  const h = errHits.get(ip) || { n: 0, reset: now + 60000 };
  if (now > h.reset) { h.n = 0; h.reset = now + 60000; }
  h.n += 1; errHits.set(ip, h);
  if (h.n > 20) return res.status(429).end();
  const b = req.body || {};
  const entry: ClientErr = {
    t: new Date().toISOString(), msg: clip(b.message, 500), stack: clip(b.stack, 2000),
    url: clip(b.url, 200), ua: clip(req.headers['user-agent'], 200)
  };
  recentErrors.unshift(entry); if (recentErrors.length > 200) recentErrors.pop();
  stats.error();
  console.warn('[ClientError]', entry.msg, '|', entry.url);
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    const f = path.join(DATA_DIR, 'client-errors.jsonl');
    if (fs.existsSync(f) && fs.statSync(f).size > 1_000_000) fs.renameSync(f, f + '.old');
    fs.appendFileSync(f, JSON.stringify(entry) + '\n');
  } catch { /* не критично */ }
  res.status(204).end();
});

app.post('/api/hit', (_req, res) => { stats.visit(); res.status(204).end(); });

const adminOk = (req: express.Request): boolean => {
  const token = process.env.ADMIN_TOKEN;
  if (!token) return false;
  const given = String(req.query.token || req.headers['x-admin-token'] || '');
  const a = Buffer.from(given), bb = Buffer.from(token);
  return a.length === bb.length && crypto.timingSafeEqual(a, bb);
};
const esc = (s: string) => s.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c] as string));

// Панель администратора: /admin?token=<ADMIN_TOKEN> (если ADMIN_TOKEN не задан — страница недоступна)
app.get('/admin', (req, res) => {
  if (!adminOk(req)) return res.status(404).send('Not found');
  const s = stats.get();
  const days = Object.keys(s.days).sort().reverse().slice(0, 14);
  const online = io.engine.clientsCount;
  const rooms = gameEngine.exportState().rooms;
  res.send(`<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Бункер — админка</title>
<style>body{font:14px system-ui;background:#0b0e14;color:#e2e8f0;margin:20px;max-width:900px}h1,h2{color:#fbbf24}
table{border-collapse:collapse;width:100%}td,th{border:1px solid #334155;padding:6px 8px;text-align:right}th:first-child,td:first-child{text-align:left}
pre{background:#111827;padding:8px;overflow:auto;white-space:pre-wrap}.k{color:#94a3b8}</style>
<h1>Бункер: статистика</h1>
<p class="k">С ${esc(s.since)} · онлайн сейчас: <b>${online}</b> · комнат: <b>${Object.keys(rooms).length}</b> · пик подключений: <b>${s.peakPlayers}</b></p>
<table><tr><th>Дата</th><th>Заходы</th><th>Комнаты</th><th>Игры начаты</th><th>Игры завершены</th><th>Ошибки</th></tr>
<tr><th>Всего</th><td>${s.total.visits}</td><td>${s.total.rooms}</td><td>${s.total.gamesStarted}</td><td>${s.total.gamesFinished}</td><td>${s.total.errors}</td></tr>
${days.map(d => `<tr><td>${d}</td><td>${s.days[d].visits}</td><td>${s.days[d].rooms}</td><td>${s.days[d].gamesStarted}</td><td>${s.days[d].gamesFinished}</td><td>${s.days[d].errors}</td></tr>`).join('')}</table>
<h2>Последние ошибки клиентов (${recentErrors.length})</h2>
${recentErrors.slice(0, 30).map(e => `<pre><b>${esc(e.t)}</b> ${esc(e.msg)}\n${esc(e.url || '')}\n${esc(e.ua || '')}\n${esc(e.stack || '')}</pre>`).join('') || '<p class="k">Пока ошибок нет.</p>'}`);
});

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', time: new Date().toISOString() });
});

app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api') || req.path.startsWith('/socket.io')) return next();
  res.sendFile(path.join(clientDist, 'index.html'), (err) => {
    if (err) next();
  });
});


const PORT = process.env.PORT || 3001;

server.listen(PORT, () => {
  console.log(`[Bunker Server] Listening on http://localhost:${PORT}`);
});
