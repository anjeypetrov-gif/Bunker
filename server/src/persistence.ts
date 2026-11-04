import fs from 'fs';
import path from 'path';
import { DATA_DIR } from './stats';
import { GameEngine } from './game/GameEngine';

// Снимок состояния комнат на диск: после перезапуска сервера партии не пропадают.
// Игроки переподключаются сами (sessionToken в браузере), игра встаёт на паузу.

const FILE = path.join(DATA_DIR, 'state.json');
const MAX_AGE_MS = 6 * 60 * 60 * 1000; // комнатам старше 6 часов нет смысла

export function loadState(engine: GameEngine): number {
  try {
    if (!fs.existsSync(FILE)) return 0;
    const snap = JSON.parse(fs.readFileSync(FILE, 'utf8'));
    if (!snap || Date.now() - (snap.savedAt || 0) > MAX_AGE_MS) return 0;
    return engine.importState(snap);
  } catch (e) {
    console.warn('[Persistence] не удалось восстановить состояние:', (e as Error).message);
    return 0;
  }
}

let last = '';
export function saveState(engine: GameEngine) {
  try {
    const snap = engine.exportState();
    if (Object.keys(snap.rooms).length === 0) {
      if (last !== '') { try { fs.unlinkSync(FILE); } catch { /* нет файла */ } last = ''; }
      return;
    }
    const text = JSON.stringify({ ...snap, savedAt: 0 });
    if (text === last) return; // ничего не изменилось
    last = text;
    fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.writeFileSync(FILE + '.tmp', JSON.stringify({ ...snap, savedAt: Date.now() }));
    fs.renameSync(FILE + '.tmp', FILE);
  } catch (e) {
    console.warn('[Persistence] save failed:', (e as Error).message);
  }
}
