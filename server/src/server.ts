import { emitRoom, originAllowed } from './security';
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
import { track, flushEvents, geoLookup, parseUA, hashVisitor, report, Bucket } from './analytics';
import { adminPageHtml } from './adminPage';

const app = express();
app.disable('x-powered-by');
app.set('trust proxy', true);

// Заголовки безопасности (CSP не включаем: страницу и WebRTC легко сломать)
app.use((_req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'camera=(self), microphone=(self), geolocation=(), payment=()');
  next();
});

// Запросы к API принимаем только с наших страниц (и без заголовка Origin — приложение, curl)
app.use(cors((req, cb) => cb(null, {
  origin: originAllowed(req.headers.origin as string | undefined, req.headers.host)
})));
app.use(express.json({ limit: '20kb' }));

// Ошибки не должны ронять процесс: логируем и продолжаем работу
process.on('uncaughtException', e => console.error('[uncaughtException]', e));
process.on('unhandledRejection', e => console.error('[unhandledRejection]', e));

// Serve static client files when built
const clientDist = path.join(__dirname, '../../client/dist');
app.use(express.static(clientDist));

const server = http.createServer(app);

const io = new Server(server, {
  // Сообщения клиента маленькие (чат, сигналы WebRTC) — большие пакеты не нужны
  maxHttpBufferSize: 100_000,
  cors: {
    origin: (origin, cb) => cb(null, originAllowed(origin, undefined)),
    methods: ['GET', 'POST']
  },
  allowRequest: (req, cb) => cb(null, originAllowed(req.headers.origin, req.headers.host))
});

const gameEngine = new GameEngine();
const gameStartedAt = new Map<string, number>();
gameEngine.onGameStart = (room) => {
  stats.gameStarted();
  const players = Object.values(room.players);
  gameStartedAt.set(room.code, Date.now());
  track({
    k: 'start', n: players.length, b: players.filter(p => p.id.startsWith('bot-')).length,
    cat: room.catastrophe?.title, sh: room.shelter?.title
  });
};
gameEngine.onGameOver = (room) => {
  stats.gameFinished();
  const t0 = gameStartedAt.get(room.code);
  gameStartedAt.delete(room.code);
  track({ k: 'over', r: room.currentRound, d: t0 ? Math.round((Date.now() - t0) / 1000) : undefined });
};
registerSocketHandlers(io, gameEngine);

// ---- Восстановление комнат после перезапуска ----
const restored = loadState(gameEngine);
if (restored > 0) {
  console.log(`[Bunker Server] Восстановлено комнат: ${restored}`);
  // Кто не вернулся за 2 минуты, удаляется из комнаты.
  setTimeout(() => {
    for (const { code, id } of gameEngine.listOfflineHumans()) {
      const res = gameEngine.leaveRoom(id);
      if (res.room) emitRoom(io, res.room);
    }
  }, 120000);
}
setInterval(() => saveState(gameEngine), 5000);
setInterval(() => { stats.players(io.engine.clientsCount); stats.save(); }, 10000);
const shutdown = () => { saveState(gameEngine); stats.save(); flushEvents(); process.exit(0); };
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
  track({ k: 'error' });
  console.warn('[ClientError]', entry.msg, '|', entry.url);
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    const f = path.join(DATA_DIR, 'client-errors.jsonl');
    if (fs.existsSync(f) && fs.statSync(f).size > 1_000_000) fs.renameSync(f, f + '.old');
    fs.appendFileSync(f, JSON.stringify(entry) + '\n');
  } catch { /* не критично */ }
  res.status(204).end();
});

const clientIp = (req: express.Request) =>
  String(req.headers['x-forwarded-for'] || req.socket.remoteAddress || '').split(',')[0].trim();

const hitHits = new Map<string, { n: number; reset: number }>();
const hitLimit = (ip: string) => {
  const now = Date.now();
  const h = hitHits.get(ip) || { n: 0, reset: now + 60000 };
  if (now > h.reset) { h.n = 0; h.reset = now + 60000; }
  h.n += 1; hitHits.set(ip, h);
  if (hitHits.size > 5000) hitHits.clear();
  return h.n <= 20;
};

app.post('/api/hit', (req, res) => {
  if (!hitLimit(clientIp(req))) return res.status(429).end();
  stats.visit();
  const b = req.body || {};
  const ua = parseUA(String(req.headers['user-agent'] || ''));
  const geo = geoLookup(clientIp(req));
  let ref = '';
  try { ref = b.ref ? new URL(String(b.ref)).hostname.replace(/^www\./, '') : ''; } catch { /* мусор */ }
  if (ref === String(req.headers.host || '').split(':')[0]) ref = '';
  track({
    k: 'visit',
    vid: b.vid ? hashVisitor(clip(b.vid, 64)) : undefined,
    ret: b.ret === true,
    c: geo.c, city: geo.city, ...ua,
    lang: clip(b.lang, 5).toLowerCase() || undefined,
    ref: ref || undefined
  });
  res.status(204).end();
});

// Итог попытки видеосвязи с другим игроком (ok=false — не удалось соединиться)
app.post('/api/rtc', (req, res) => {
  const ip = clientIp(req);
  const now = Date.now();
  const h = errHits.get('rtc:' + ip) || { n: 0, reset: now + 60000 };
  if (now > h.reset) { h.n = 0; h.reset = now + 60000; }
  h.n += 1; errHits.set('rtc:' + ip, h);
  if (h.n > 30) return res.status(429).end();
  track({ k: 'rtc', ok: req.body?.ok === true });
  res.status(204).end();
});

const adminFails = new Map<string, { n: number; reset: number }>();
const adminOk = (req: express.Request): boolean => {
  const token = process.env.ADMIN_TOKEN;
  if (!token) return false;
  const ip = clientIp(req);
  const now = Date.now();
  const f = adminFails.get(ip);
  if (f && now < f.reset && f.n >= 10) return false; // слишком много неверных попыток — блок на 15 минут
  const given = String(req.query.token || req.headers['x-admin-token'] || '');
  const a = Buffer.from(given), bb = Buffer.from(token);
  const ok = a.length === bb.length && crypto.timingSafeEqual(a, bb);
  if (!ok) {
    const cur = f && now < f.reset ? f : { n: 0, reset: now + 15 * 60000 };
    cur.n += 1; adminFails.set(ip, cur);
    if (adminFails.size > 2000) adminFails.clear();
  }
  return ok;
};
const esc = (s: string) => s.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c] as string));

// Панель администратора: /admin?token=<ADMIN_TOKEN> (если ADMIN_TOKEN не задан — страница недоступна)
app.get(['/api/admin', '/admin'], (req, res) => {
  if (!adminOk(req)) return res.status(404).send('Not found');
  res.type('html').send(adminPageHtml());
});

app.get('/api/admin/report', (req, res) => {
  if (!adminOk(req)) return res.status(404).end();
  const now = Date.now();
  const to = Math.min(now, Number(req.query.to) || now);
  const from = Math.max(0, Number(req.query.from) || to - 7 * 86400000);
  const bucket = (['hour', 'day', 'week', 'month'].includes(String(req.query.bucket)) ? req.query.bucket : 'auto') as Bucket | 'auto';
  const tz = Math.max(-840, Math.min(840, Number(req.query.tz) || 0));
  res.json(report(from, to, bucket, tz));
});

app.get('/api/admin/live', (req, res) => {
  if (!adminOk(req)) return res.status(404).end();
  const roomsMap = gameEngine.exportState().rooms as Record<string, any>;
  const rooms = Object.values(roomsMap).map((r: any) => {
    const ps = Object.values(r.players || {}) as any[];
    return {
      code: r.code, phase: r.phase, round: r.currentRound,
      humans: ps.filter(p => !String(p.id).startsWith('bot-')).length,
      bots: ps.filter(p => String(p.id).startsWith('bot-')).length,
      offline: ps.filter(p => p.isConnected === false).length
    };
  });
  const s = stats.get();
  res.json({
    online: io.engine.clientsCount, rooms, peak: s.peakPlayers, since: s.since,
    errors: recentErrors.slice(0, 40)
  });
});

// Политика конфиденциальности (нужна магазинам приложений). Дублируем под /api/, потому что
// Timeweb может отдавать SPA вместо статики на путях вне /api.
app.get(['/api/privacy', '/privacy'], (_req, res) => {
  res.sendFile(path.join(clientDist, 'privacy.html'), err => { if (err) res.status(404).end(); });
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
