import fs from 'fs';
import path from 'path';

// Лёгкая собственная статистика без внешних сервисов и cookies.
// Хранится в DATA_DIR/stats.json (на Timeweb файловая система может очищаться
// при новом деплое — это нормально, счётчики просто начнутся заново).

export const DATA_DIR = process.env.DATA_DIR || path.join(process.cwd(), 'data');

interface DayStats { visits: number; rooms: number; gamesStarted: number; gamesFinished: number; errors: number }
interface StatsData {
  since: string;
  total: DayStats;
  peakPlayers: number;
  days: Record<string, DayStats>;
}

const empty = (): DayStats => ({ visits: 0, rooms: 0, gamesStarted: 0, gamesFinished: 0, errors: 0 });
const FILE = path.join(DATA_DIR, 'stats.json');
let data: StatsData = { since: new Date().toISOString(), total: empty(), peakPlayers: 0, days: {} };
let dirty = false;

try {
  if (fs.existsSync(FILE)) data = { ...data, ...JSON.parse(fs.readFileSync(FILE, 'utf8')) };
} catch (e) {
  console.warn('[Stats] не удалось прочитать stats.json, начинаем заново');
}

function bump(key: keyof DayStats) {
  const day = new Date().toISOString().slice(0, 10);
  const d = (data.days[day] ||= empty());
  d[key] += 1; data.total[key] += 1; dirty = true;
  // храним не больше 60 дней
  const keys = Object.keys(data.days).sort();
  while (keys.length > 60) delete data.days[keys.shift() as string];
}

export const stats = {
  visit: () => bump('visits'),
  room: () => bump('rooms'),
  gameStarted: () => bump('gamesStarted'),
  gameFinished: () => bump('gamesFinished'),
  error: () => bump('errors'),
  players(n: number) { if (n > data.peakPlayers) { data.peakPlayers = n; dirty = true; } },
  get: () => data,
  save() {
    if (!dirty) return;
    try {
      fs.mkdirSync(DATA_DIR, { recursive: true });
      fs.writeFileSync(FILE + '.tmp', JSON.stringify(data));
      fs.renameSync(FILE + '.tmp', FILE);
      dirty = false;
    } catch (e) { console.warn('[Stats] save failed', (e as Error).message); }
  }
};
