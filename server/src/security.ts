import type { Server, Socket } from 'socket.io';
import type { Card, ChatMessage, Player, RoomState } from './types/game';

// ---------------------------------------------------------------------------
// Защита информации
//
// 1. Клиент получает НЕ полное состояние комнаты, а его «вид»: чужие закрытые
//    карты, секретные цели, чужие голоса и сообщения призраков не покидают
//    сервер (раньше всё это уходило всем в room_updated, и в консоли браузера
//    можно было прочитать карты соперников).
// 2. Входящие данные проверяются и ограничиваются по длине.
// 3. Частота событий ограничена, ошибки в обработчиках не роняют сервер.
// ---------------------------------------------------------------------------

export const LIMITS = {
  name: 24,
  chat: 300,
  avatar: 24,
  code: 8,
  signal: 20000,
  maxPlayers: 12,
  minPlayers: 2,
  minTurn: 15,
  maxTurn: 300
};

/** Убирает управляющие символы, схлопывает пробелы, режет по длине. */
export function cleanText(v: unknown, max: number): string {
  if (typeof v !== 'string') return '';
  // eslint-disable-next-line no-control-regex
  return v.replace(/[\u0000-\u001f\u007f​-‏‪-‮⁦-⁩]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max);
}

export function cleanAvatar(v: unknown): string {
  const s = typeof v === 'string' ? v : '';
  return /^[A-Za-z0-9_-]{1,24}$/.test(s) ? s : '';
}

export function cleanCode(v: unknown): string {
  const s = typeof v === 'string' ? v.trim().toUpperCase() : '';
  return /^[A-Z0-9]{3,8}$/.test(s) ? s : '';
}

export const isPlainObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

// ---- Вид комнаты для конкретного игрока -----------------------------------

const hiddenCard = (c: Card): Card => ({
  id: c.id,
  type: c.type,
  title: '???',
  description: '',
  isRevealed: false
});

function maskPlayer(p: Player): Player {
  const cards: Record<string, Card> = {};
  for (const [k, c] of Object.entries(p.cards || {})) {
    cards[k] = c.isRevealed ? c : hiddenCard(c);
  }
  return {
    ...p,
    // Название роли видно всем (так задумано), а описание и тайная цель — только владельцу.
    role: p.role ? { ...p.role, description: '', goal: '' } : p.role,
    cards: cards as Player['cards'],
    actionCards: []
  };
}

/** Что именно игрок `viewerId` имеет право видеть в комнате. */
export function sanitizeRoomFor(room: RoomState, viewerId: string): RoomState {
  const finished = room.phase === 'GAME_OVER';
  const viewer = room.players[viewerId];
  const viewerIsGhost = !!viewer && viewer.isExiled && room.phase !== 'LOBBY';
  const secret = room.secretVoting !== false;
  const showVotes = !secret && (room.phase === 'VOTE_RESULTS' || finished);
  const showCounts = room.phase !== 'VOTING' || !secret;

  const players: Record<string, Player> = {};
  for (const [id, p] of Object.entries(room.players)) {
    // После конца партии карты открываются всем; на время игры — только своё.
    const base = id === viewerId || finished ? p : maskPlayer(p);
    players[id] = showCounts ? base : { ...base, votesCount: 0 };
  }

  // Голоса: свой — всегда, чужие — только в открытом режиме после подсчёта.
  const votes: Record<string, string> = {};
  if (showVotes) Object.assign(votes, room.votes);
  else if (room.votes && room.votes[viewerId]) votes[viewerId] = room.votes[viewerId];

  // Сообщения призраков видят только изгнанные.
  const chatMessages: ChatMessage[] = viewerIsGhost || finished
    ? room.chatMessages
    : room.chatMessages.filter(m => !m.ghost);

  return {
    ...room,
    players,
    votes,
    chatMessages,
    // геттер, вычисляемый на сервере, превращаем в обычное число
    speechRemainingMs: room.speechRemainingMs
  };
}

/** Рассылает каждому участнику комнаты его собственный вид состояния. */
export function emitRoom(io: Server, room: RoomState, event: 'room_updated' | 'game_started' = 'room_updated') {
  const ids = io.sockets.adapter.rooms.get(room.code);
  if (!ids) return;
  for (const id of ids) {
    const s = io.sockets.sockets.get(id);
    if (s) s.emit(event, sanitizeRoomFor(room, id));
  }
}

// ---- Ограничение частоты ---------------------------------------------------

type Bucket = { n: number; reset: number };

export class RateLimiter {
  private buckets = new Map<string, Bucket>();
  constructor(private max: number, private windowMs: number) {
    setInterval(() => {
      const now = Date.now();
      for (const [k, b] of this.buckets) if (now > b.reset) this.buckets.delete(k);
    }, 60_000).unref();
  }
  /** true — событие разрешено. */
  take(key: string): boolean {
    const now = Date.now();
    const b = this.buckets.get(key);
    if (!b || now > b.reset) {
      this.buckets.set(key, { n: 1, reset: now + this.windowMs });
      return true;
    }
    b.n += 1;
    return b.n <= this.max;
  }
}

export function clientIp(socket: Socket): string {
  const fwd = socket.handshake.headers['x-forwarded-for'];
  const raw = Array.isArray(fwd) ? fwd[0] : fwd;
  return String(raw || socket.handshake.address || '').split(',')[0].trim();
}

// ---- Допустимые источники запросов (CORS) --------------------------------

const EXTRA_ORIGINS = (process.env.ALLOWED_ORIGINS || '').split(',').map(s => s.trim()).filter(Boolean);

export function originAllowed(origin: string | undefined, host: string | undefined): boolean {
  if (!origin) return true; // не браузер или тот же источник без заголовка
  try {
    const u = new URL(origin);
    if (host && u.host === host) return true;
    if (u.hostname === 'localhost' || u.hostname === '127.0.0.1') return true;
    if (u.hostname === '24bunkerpro.ru' || u.hostname.endsWith('.24bunkerpro.ru')) return true;
    if (u.hostname.endsWith('.twc1.net')) return true;
    return EXTRA_ORIGINS.includes(origin);
  } catch {
    return false;
  }
}
