import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { DATA_DIR } from './stats';

// Журнал событий для админки: каждое событие — одна строка JSON в DATA_DIR/events.jsonl.
// Хранятся только анонимные данные: IP не сохраняется (только страна/город, определённые на лету),
// посетитель — случайный id из браузера, дополнительно «посолен» на сервере.

export type EvKind = 'visit' | 'room' | 'join' | 'start' | 'over' | 'error' | 'rtc' | 'choice';
export type Mode = 'classic' | 'chronicle' | '3d';

export interface Ev {
  t: number;          // unix ms
  k: EvKind;
  vid?: string;       // анонимный id посетителя
  ret?: boolean;      // посетитель возвращался (по данным браузера)
  c?: string;         // страна (ISO-2)
  city?: string;
  dev?: string;       // mobile | tablet | desktop
  br?: string;        // браузер
  os?: string;
  lang?: string;
  ref?: string;       // домен-источник
  n?: number;         // игроков в партии (люди + боты)
  b?: number;         // из них ботов
  r?: number;         // раундов сыграно
  d?: number;         // длительность партии, сек
  cat?: string;       // катастрофа
  sh?: string;        // бункер
  sv?: number;        // шанс выживания, %
  fail?: boolean;     // провальная партия (шанс < 40%)
  ok?: boolean;       // для rtc: связь установлена
  mode?: Mode;        // режим игры; нет поля = классический
  th?: string;        // тема/сценарий (Хроника, 3D)
  prof?: string;      // профессия (3D)
  res?: string;       // итог: вердикт Хроники / win|lose в 3D
  g?: number;         // оценка итога (Хроника 0..3)
  sc?: number;        // очки (3D)
  fx?: number;        // 3D: починено аварий; Хроника: выжило жителей
  evid?: string;      // Хроника: id события
  ch?: number;        // Хроника: номер выбранного варианта
  win?: boolean;      // успешен ли выбор / победа
}

const FILE = path.join(DATA_DIR, 'events.jsonl');
const KEEP_MS = 180 * 24 * 3600 * 1000; // храним полгода
const MAX_EVENTS = 300000;
let events: Ev[] = [];
let pending: string[] = [];
const SALT = process.env.ADMIN_TOKEN || 'bunker';

// ---------- загрузка / сохранение ----------
(function load() {
  try {
    if (!fs.existsSync(FILE)) return;
    const cutoff = Date.now() - KEEP_MS;
    const lines = fs.readFileSync(FILE, 'utf8').split('\n');
    for (const l of lines) {
      if (!l) continue;
      try { const e = JSON.parse(l) as Ev; if (e && e.t >= cutoff) events.push(e); } catch { /* битая строка */ }
    }
    if (events.length > MAX_EVENTS) events = events.slice(-MAX_EVENTS);
    // компактный перезапис без старых записей
    fs.writeFileSync(FILE + '.tmp', events.map(e => JSON.stringify(e)).join('\n') + (events.length ? '\n' : ''));
    fs.renameSync(FILE + '.tmp', FILE);
  } catch (e) { console.warn('[Analytics] не удалось прочитать events.jsonl:', (e as Error).message); }
})();

export function flushEvents() {
  if (!pending.length) return;
  const chunk = pending.join('\n') + '\n';
  pending = [];
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.appendFileSync(FILE, chunk);
  } catch (e) { console.warn('[Analytics] save failed', (e as Error).message); }
}
setInterval(flushEvents, 5000).unref();

export function track(e: Omit<Ev, 't'> & { t?: number }) {
  const ev: Ev = { t: Date.now(), ...e };
  events.push(ev);
  if (events.length > MAX_EVENTS) events.shift();
  pending.push(JSON.stringify(ev));
}

// ---------- гео и устройство ----------
let geoip: any = null;
try { geoip = require('geoip-lite'); } catch { /* модуль не установлен — география будет «неизвестно» */ }

export function geoLookup(ip: string): { c?: string; city?: string } {
  if (!geoip || !ip) return {};
  try {
    const clean = ip.replace(/^::ffff:/, '');
    const g = geoip.lookup(clean);
    return g ? { c: g.country || undefined, city: g.city || undefined } : {};
  } catch { return {}; }
}

export function parseUA(ua: string): { dev: string; br: string; os: string } {
  const u = ua || '';
  const dev = /iPad|Tablet/i.test(u) ? 'tablet' : /Mobi|Android|iPhone/i.test(u) ? 'mobile' : 'desktop';
  const br = /YaBrowser/i.test(u) ? 'Yandex' : /Edg\//.test(u) ? 'Edge' : /OPR\/|Opera/i.test(u) ? 'Opera'
    : /SamsungBrowser/i.test(u) ? 'Samsung' : /Firefox|FxiOS/i.test(u) ? 'Firefox'
    : /Chrome|CriOS/i.test(u) ? 'Chrome' : /Safari/i.test(u) ? 'Safari' : 'Другой';
  const os = /Windows/i.test(u) ? 'Windows' : /Android/i.test(u) ? 'Android' : /iPhone|iPad|iOS/i.test(u) ? 'iOS'
    : /Mac OS X|Macintosh/i.test(u) ? 'macOS' : /Linux/i.test(u) ? 'Linux' : 'Другая';
  return { dev, br, os };
}

export const hashVisitor = (vid: string) =>
  crypto.createHash('sha256').update(SALT + '|' + vid).digest('hex').slice(0, 16);

// ---------- агрегаты ----------
export type Bucket = 'hour' | 'day' | 'week' | 'month';

const HOUR = 3600 * 1000;
const DAY = 24 * HOUR;

function bucketKey(t: number, bucket: Bucket, off: number): number {
  const x = t + off;
  if (bucket === 'hour') return Math.floor(x / HOUR) * HOUR - off;
  if (bucket === 'day') return Math.floor(x / DAY) * DAY - off;
  if (bucket === 'week') {
    const day = Math.floor(x / DAY);
    const monday = Math.floor((day + 3) / 7) * 7 - 3; // 1970-01-01 — четверг
    return monday * DAY - off;
  }
  const d = new Date(x);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1) - off;
}
function nextKey(k: number, bucket: Bucket, off: number): number {
  if (bucket === 'hour') return k + HOUR;
  if (bucket === 'day') return k + DAY;
  if (bucket === 'week') return k + 7 * DAY;
  const d = new Date(k + off);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1) - off;
}

const modeOf = (e: Ev): Mode => e.mode || 'classic';

const countBy = <T>(arr: T[], f: (x: T) => string | undefined, top = 15) => {
  const m = new Map<string, number>();
  for (const x of arr) { const k = f(x); if (k) m.set(k, (m.get(k) || 0) + 1); }
  return [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, top).map(([name, n]) => ({ name, n }));
};

function countryName(code?: string): string {
  if (!code) return 'Неизвестно';
  try { return new (Intl as any).DisplayNames(['ru'], { type: 'region' }).of(code) || code; } catch { return code; }
}

function totals(list: Ev[]) {
  const visits = list.filter(e => e.k === 'visit');
  const vids = new Set(visits.map(e => e.vid).filter(Boolean));
  const retVids = new Set(visits.filter(e => e.ret).map(e => e.vid).filter(Boolean));
  const starts = list.filter(e => e.k === 'start');
  const overs = list.filter(e => e.k === 'over');
  const avg = (a: number[]) => (a.length ? a.reduce((s, x) => s + x, 0) / a.length : 0);
  const rtc = list.filter(e => e.k === 'rtc');
  return {
    visits: visits.length,
    uniques: vids.size,
    returning: retVids.size,
    newVisitors: Math.max(0, vids.size - retVids.size),
    rooms: list.filter(e => e.k === 'room').length,
    joins: list.filter(e => e.k === 'join').length,
    starts: starts.length,
    overs: overs.length,
    errors: list.filter(e => e.k === 'error').length,
    avgPlayers: avg(starts.map(e => e.n || 0)),
    avgBots: avg(starts.map(e => e.b || 0)),
    withBotsPct: starts.length ? (100 * starts.filter(e => (e.b || 0) > 0).length) / starts.length : 0,
    avgDurationMin: avg(overs.map(e => (e.d || 0) / 60)),
    avgRounds: avg(overs.map(e => e.r || 0)),
    failedGames: overs.filter(e => e.fail).length,
    failedPct: overs.length ? (100 * overs.filter(e => e.fail).length) / overs.length : 0,
    avgSurvival: avg(overs.filter(e => e.sv != null).map(e => e.sv as number)),
    completionPct: starts.length ? Math.min(100, (100 * overs.length) / starts.length) : 0,
    rtcTotal: rtc.length,
    rtcFailPct: rtc.length ? (100 * rtc.filter(e => e.ok === false).length) / rtc.length : 0
  };
}

export function report(from: number, to: number, bucketIn: Bucket | 'auto', tzMin: number) {
  const off = tzMin * 60000;
  const sFrom = Math.max(from, events.length ? events[0].t : to - DAY); // ряд не начинаем раньше первого события
  const effSpan = Math.max(1, to - sFrom);
  const bucket: Bucket = bucketIn !== 'auto' ? bucketIn
    : effSpan <= 2 * DAY ? 'hour' : effSpan <= 60 * DAY ? 'day' : effSpan <= 200 * DAY ? 'week' : 'month';
  // общий отчёт: игровые события только классического режима (альфа-режимы — в modesReport)
  const classicOnly = (e: Ev) => !(e.mode && (e.k === 'start' || e.k === 'over' || e.k === 'choice'));
  const inRange = events.filter(e => e.t >= from && e.t <= to && classicOnly(e));
  const span = Math.max(1, to - from);
  const prevList = events.filter(e => e.t >= from - span && e.t < from && classicOnly(e));

  // ряд по периодам (с нулями в пустых интервалах)
  const maxBuckets = 400;
  const series: Array<{ t: number; visits: number; uniques: number; rooms: number; starts: number; overs: number; errors: number }> = [];
  const idx = new Map<number, number>();
  let k = bucketKey(sFrom, bucket, off);
  while (k <= to && series.length < maxBuckets) {
    idx.set(k, series.length);
    series.push({ t: k, visits: 0, uniques: 0, rooms: 0, starts: 0, overs: 0, errors: 0 });
    k = nextKey(k, bucket, off);
  }
  const uniqSets: Array<Set<string>> = series.map(() => new Set());
  for (const e of inRange) {
    const i = idx.get(bucketKey(e.t, bucket, off));
    if (i === undefined) continue;
    const s = series[i];
    if (e.k === 'visit') { s.visits++; if (e.vid) uniqSets[i].add(e.vid); }
    else if (e.k === 'room') s.rooms++;
    else if (e.k === 'start') s.starts++;
    else if (e.k === 'over') s.overs++;
    else if (e.k === 'error') s.errors++;
  }
  series.forEach((s, i) => { s.uniques = uniqSets[i].size; });

  const visits = inRange.filter(e => e.k === 'visit');
  const starts = inRange.filter(e => e.k === 'start');
  const byHour = new Array(24).fill(0);
  const byWeekday = new Array(7).fill(0); // пн..вс
  for (const e of visits) {
    const d = new Date(e.t + off);
    byHour[d.getUTCHours()]++;
    byWeekday[(d.getUTCDay() + 6) % 7]++;
  }
  const playersHist: Record<string, number> = {};
  for (const e of starts) { const n = String(e.n || 0); playersHist[n] = (playersHist[n] || 0) + 1; }

  return {
    from, to, bucket,
    totals: totals(inRange),
    prev: totals(prevList),
    series,
    byHour, byWeekday,
    countries: countBy(visits, e => countryName(e.c)),
    cities: countBy(visits, e => (e.city ? e.city + (e.c ? ', ' + e.c : '') : undefined)),
    devices: countBy(visits, e => e.dev),
    browsers: countBy(visits, e => e.br),
    oses: countBy(visits, e => e.os),
    langs: countBy(visits, e => e.lang),
    referrers: countBy(visits, e => e.ref || 'Прямой заход'),
    catastrophes: countBy(starts, e => e.cat),
    shelters: countBy(starts, e => e.sh),
    playersHist,
    eventsTotal: events.length,
    firstEventAt: events.length ? events[0].t : null
  };
}


// ---------- статистика по режимам ----------
const avgOf = (a: number[]) => (a.length ? a.reduce((s, x) => s + x, 0) / a.length : 0);

function modeTotals(list: Ev[], mode: Mode) {
  const L = list.filter(e => modeOf(e) === mode);
  const visits = L.filter(e => e.k === 'visit');
  const vids = new Set(visits.map(e => e.vid).filter(Boolean));
  const starts = L.filter(e => e.k === 'start');
  const overs = L.filter(e => e.k === 'over');
  return {
    visits: visits.length, uniques: vids.size, starts: starts.length, overs: overs.length,
    completionPct: starts.length ? Math.min(100, (100 * overs.length) / starts.length) : 0,
    avgDurationMin: avgOf(overs.map(e => (e.d || 0) / 60)),
    avgRounds: avgOf(overs.map(e => e.r || 0)),
    avgPlayers: avgOf(starts.map(e => e.n || 0)),
    avgSurvivors: avgOf(overs.filter(e => e.fx != null).map(e => e.fx as number)),
    avgScore: avgOf(overs.filter(e => e.sc != null).map(e => e.sc as number)),
    winPct: overs.length ? (100 * overs.filter(e => e.win).length) / overs.length : 0,
    avgSurvival: avgOf(overs.filter(e => e.sv != null).map(e => e.sv as number)),
    errors: L.filter(e => e.k === 'error').length
  };
}

export function modesReport(from: number, to: number, bucketIn: Bucket | 'auto', tzMin: number) {
  const off = tzMin * 60000;
  const span = Math.max(1, to - from);
  const inRange = events.filter(e => e.t >= from && e.t <= to);
  const prevList = events.filter(e => e.t >= from - span && e.t < from);
  const sFrom = Math.max(from, events.length ? events[0].t : to - DAY);
  const effSpan = Math.max(1, to - sFrom);
  const bucket: Bucket = bucketIn !== 'auto' ? bucketIn
    : effSpan <= 2 * DAY ? 'hour' : effSpan <= 60 * DAY ? 'day' : effSpan <= 200 * DAY ? 'week' : 'month';
  const modes: Mode[] = ['classic', 'chronicle', '3d'];
  const out: Record<string, any> = {};

  // ряд: заходы и старты партий по режимам
  const keys: number[] = [];
  const idx = new Map<number, number>();
  let k = bucketKey(sFrom, bucket, off);
  while (k <= to && keys.length < 400) { idx.set(k, keys.length); keys.push(k); k = nextKey(k, bucket, off); }

  for (const m of modes) {
    const L = inRange.filter(e => modeOf(e) === m);
    const starts = L.filter(e => e.k === 'start');
    const overs = L.filter(e => e.k === 'over');
    const series = keys.map(t => ({ t, visits: 0, starts: 0, overs: 0 }));
    for (const e of L) {
      const i = idx.get(bucketKey(e.t, bucket, off)); if (i === undefined) continue;
      if (e.k === 'visit') series[i].visits++; else if (e.k === 'start') series[i].starts++; else if (e.k === 'over') series[i].overs++;
    }
    const o: Record<string, any> = {
      totals: modeTotals(inRange, m), prev: modeTotals(prevList, m), series
    };
    if (m === 'classic') {
      o.catastrophes = countBy(starts, e => e.cat);
      o.shelters = countBy(starts, e => e.sh);
      const hist: Record<string, number> = {};
      for (const e of starts) { const n = String(e.n || 0); hist[n] = (hist[n] || 0) + 1; }
      o.playersHist = hist;
    } else if (m === 'chronicle') {
      o.themes = countBy(starts, e => e.th);
      o.verdicts = countBy(overs, e => e.res);
      o.daysHist = countBy(overs, e => (e.r != null ? String(e.r) : undefined), 40).sort((a, b) => Number(a.name) - Number(b.name));
      const ch = L.filter(e => e.k === 'choice');
      // по событиям: сколько раз выпало, какой вариант выбирают, процент успеха
      const byEv = new Map<string, { n: number; ok: number; ch: Map<number, number> }>();
      for (const e of ch) {
        if (!e.evid) continue;
        const x = byEv.get(e.evid) || { n: 0, ok: 0, ch: new Map() };
        x.n++; if (e.win) x.ok++;
        x.ch.set(e.ch || 0, (x.ch.get(e.ch || 0) || 0) + 1);
        byEv.set(e.evid, x);
      }
      o.events = [...byEv.entries()].sort((a, b) => b[1].n - a[1].n).slice(0, 40).map(([id, x]) => ({
        id, n: x.n, okPct: x.n ? Math.round((100 * x.ok) / x.n) : 0,
        choices: [...x.ch.entries()].sort((a, b) => a[0] - b[0]).map(([i, n]) => ({ i, n }))
      }));
    } else {
      o.themes = countBy(starts, e => e.th);
      o.profs = countBy(starts, e => e.prof);
      o.results = countBy(overs, e => (e.res === 'win' ? 'Все шаги пройдены' : 'Бункер потерян'));
      o.themeWin = countBy(overs.filter(e => e.win), e => e.th);
    }
    out[m] = o;
  }
  return { from, to, bucket, modes: out };
}
