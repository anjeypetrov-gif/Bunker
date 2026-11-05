import { computeSurvival, computeRoleResults } from './survival';
import { startLineage, lineageVote, allLineageVoted, resolveGeneration, nextGeneration } from './lineage';
import { randomUUID } from 'crypto';
import {
  RoomState,
  Player,
  Card,
  CardType,
  GamePhase,
  ChatMessage
} from '../types/game';
import {
  CATASTROPHES,
  SHELTERS,
  PROFESSIONS,
  HEALTH_STATUSES,
  BIOLOGY_DESCS,
  HOBBIES,
  TRAITS,
  BAGGAGES,
  SECRET_FACTS,
  CONDITIONS,
  PHOBIAS,
  KNOWLEDGE,
  ACTION_CARDS,
  SPECIAL_ROLES, ROUND_EVENTS } from '../data/decks';

// Card types that represent revealable personal information.
// The action card is handled separately through useActionCard() and does
// not count against the "one reveal per round" limit.
export const REVEALABLE_CARD_TYPES: CardType[] = [
  'profession', 'health', 'biology', 'hobby', 'trait', 'baggage', 'secret', 'condition', 'phobia', 'knowledge'
];

// Grammatically correct "N год/года/лет" for the profession card's
// randomly-rolled work experience (1..24 years).
function formatYears(n: number): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return `${n} год`;
  if ([2, 3, 4].includes(mod10) && ![12, 13, 14].includes(mod100)) return `${n} года`;
  return `${n} лет`;
}


const HOBBY_LEVELS = ['любитель', 'уверенный практик', 'мастер своего дела'];
const BAGGAGE_STATES = ['новое, в упаковке', 'б/у, но исправно', 'потёртое, но рабочее', 'с небольшим дефектом'];

function profLevel(years: number): string {
  if (years <= 4) return 'младший специалист';
  if (years <= 10) return 'специалист';
  if (years <= 17) return 'ведущий специалист';
  return 'признанный эксперт';
}

function randInt(min: number, max: number): number {
  return min + Math.floor(Math.random() * (max - min + 1));
}

function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n));
}

export class GameEngine {
  private rooms: Record<string, RoomState> = {};

  // Память о прошлых партиях комнаты: для каждой категории карт запоминаем,
  // в какой по счёту игре вариант выпадал в последний раз. Следующая раздача
  // берёт сначала то, что не выпадало вообще или давно (случайно среди
  // равных), поэтому при «Сыграть ещё раз» наборы заметно отличаются.
  private dealMemory: Record<string, { games: number; used: Record<string, Record<string, number>> }> = {};

  // Очередь выступлений в фазе обсуждения (сервер — единственный источник
  // правды: клиенты только показывают отсчёт).
  private speechEnds: Record<string, number> = {};
  private speechTimers: Record<string, NodeJS.Timeout> = {};
  public onSpeakerChange: ((room: RoomState) => void) | null = null;

  // Maps a private per-player session token (never sent to other clients,
  // never part of RoomState/Player so it can't leak through room_updated
  // broadcasts) to that player's current room + socket id. Lets a browser
  // that reconnects (page refresh, brief network drop) re-attach to its
  // existing player slot instead of being treated as a stranger and bounced
  // back to the join screen.
  private tokenMap: Record<string, { code: string; socketId: string }> = {};

  private generateSessionToken(): string {
    return randomUUID();
  }

  private getRandomItem<T>(arr: T[]): T {
    return arr[Math.floor(Math.random() * arr.length)];
  }

  private shuffle<T>(arr: T[]): T[] {
    const copy = [...arr];
    for (let i = copy.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [copy[i], copy[j]] = [copy[j], copy[i]];
    }
    return copy;
  }

  // Returns a picker function that hands out every item of `pool` exactly
  // once (in shuffled order) before any item repeats. This keeps card
  // deals unique across players in the same room whenever the room size
  // does not exceed the pool size, and only reuses a value once every
  // other option has already been dealt.
  private createDeckPicker<T>(pool: T[]): () => T {
    let deck: T[] = [];
    return () => {
      if (deck.length === 0) {
        deck = this.shuffle(pool);
      }
      return deck.pop() as T;
    };
  }

  private freshnessOrder<T>(pool: T[], keyOf: (t: T) => string, used: Record<string, number>): T[] {
    return pool
      .map(item => ({ item, last: used[keyOf(item)] ?? 0, r: Math.random() }))
      .sort((a, b) => a.last - b.last || a.r - b.r)
      .map(x => x.item);
  }

  // Раздаёт варианты из колоды «самые свежие первыми»; запоминает номер
  // игры для каждого выпавшего варианта.
  private createFreshPicker<T>(pool: T[], keyOf: (t: T) => string, used: Record<string, number>, game: number): () => T {
    let deck: T[] = [];
    return () => {
      if (deck.length === 0) deck = this.freshnessOrder(pool, keyOf, used);
      const item = deck.shift() as T;
      used[keyOf(item)] = game;
      return item;
    };
  }

  private rollBiology(taken: Set<string>): { sex: string; age: number; fertility: string } {
    for (let attempt = 0; attempt < 20; attempt++) {
      const male = Math.random() < 0.5;
      const sex = male ? 'Мужчина' : 'Женщина';
      const age = randInt(18, male ? 60 : 55);
      const key = `${sex}${age}`;
      if (taken.has(key) && attempt < 19) continue;
      taken.add(key);

      let base: string;
      if (age <= 25) base = 'Высокая фертильность, молодой организм';
      else if (age <= 35) base = male ? 'Фертилен, хорошая физическая форма' : 'Фертильна, хорошая физическая форма';
      else if (age <= 45) base = 'Умеренная фертильность';
      else base = 'Низкая фертильность, большой жизненный опыт';

      const extras: string[] = [];
      if (Math.random() < 0.35) {
        if (age >= 30) {
          const kids = randInt(1, 3);
          const kidsText = kids === 1 ? 'ребёнка' : `${kids} детей`;
          extras.push(`${male ? 'Отец' : 'Мать'} ${kidsText} (остались снаружи)`);
        } else {
          extras.push(this.getRandomItem(['Занимался спортом', 'Отличная физическая форма', 'Есть опыт выживания']));
        }
      } else if (Math.random() < 0.25) {
        extras.push(this.getRandomItem(['Невысокая выносливость', 'Быстро устаёт, но быстро восстанавливается', 'Крепкое телосложение']));
      }
      return { sex, age, fertility: [base, ...extras].join('. ') };
    }
    return { sex: 'Мужчина', age: 30, fertility: 'Фертилен, хорошая физическая форма' };
  }

  private generateCode(): string {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let code = '';
    for (let i = 0; i < 6; i++) {
      code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return code;
  }

  private makeFreshPlayer(id: string, name: string, avatar: string, isHost: boolean): Player {
    return {
      id,
      socketId: id,
      name,
      avatar,
      isHost,
      isExiled: false,
      cards: {} as any,
      actionCards: [],
      votesCount: 0,
      hasVoted: false,
      audioMuted: false,
      videoOff: false,
      revealedThisRound: false,
      actionCardUsed: false,
      hasImmunity: false,
      voteWeight: 1,
      isConnected: true
    };
  }

  public createRoom(hostSocketId: string, hostName: string, hostAvatar: string): { room: RoomState; sessionToken: string } {
    let code = this.generateCode();
    while (this.rooms[code]) {
      code = this.generateCode();
    }

    const hostPlayer = this.makeFreshPlayer(
      hostSocketId,
      hostName || 'Командир Бункера',
      hostAvatar || 'avatar-1',
      true
    );

    const room: RoomState = {
      code,
      hostId: hostSocketId,
      maxPlayers: 8,
      bunkerCapacity: 1,
      turnDuration: 60,
      currentRound: 1,
      phase: 'LOBBY',
      activePlayerIndex: 0,
      catastrophe: null,
      shelter: null,
      players: { [hostSocketId]: hostPlayer },
      turnOrder: [hostSocketId],
      votes: {},
      lastExiledPlayerId: null,
      chatMessages: [],
      revealedCountInRound: 0,
      speakerId: null,
      speakerQueue: [],
      roundEvent: null,
      paused: false,
      speechDuration: 60,
      speechRemainingMs: 0,
      secretVoting: true,
      lineageEnabled: false
    };
    this.attachSpeechClock(room);

    this.rooms[code] = room;

    const sessionToken = this.generateSessionToken();
    this.tokenMap[sessionToken] = { code, socketId: hostSocketId };

    return { room, sessionToken };
  }

  public joinRoom(code: string, socketId: string, name: string, avatar: string): { room: RoomState; sessionToken: string } | null {
    const room = this.rooms[String(code || "").toUpperCase()];
    if (!room) return null;
    if (Object.keys(room.players).length >= room.maxPlayers) return null;
    if (room.phase !== 'LOBBY') return null;

    const newPlayer = this.makeFreshPlayer(
      socketId,
      name || `Выживший #${Object.keys(room.players).length + 1}`,
      avatar || `avatar-${(Object.keys(room.players).length % 6) + 1}`,
      false
    );

    room.players[socketId] = newPlayer;
    room.turnOrder.push(socketId);

    // Dynamic bunker capacity update (50% of players)
    room.bunkerCapacity = Math.max(1, Math.floor(Object.keys(room.players).length * 0.4));

    this.addSystemMessage(room, `${newPlayer.name} присоединился к убежищу.`);

    const sessionToken = this.generateSessionToken();
    this.tokenMap[sessionToken] = { code: room.code, socketId };

    return { room, sessionToken };
  }

  // Marks a player as temporarily offline (socket disconnected) WITHOUT
  // removing them from the room yet — gives the browser a window to
  // reconnect (page refresh, brief network drop) via reconnectPlayer()
  // before the caller falls back to actually removing them with leaveRoom().
  public markDisconnected(socketId: string): { room: RoomState; code: string } | null {
    for (const code in this.rooms) {
      const room = this.rooms[code];
      const player = room.players[socketId];
      if (player) {
        player.isConnected = false;
        return { room, code };
      }
    }
    return null;
  }

  // Re-attaches a reconnecting browser (identified by its private session
  // token) to its existing player slot under the new socket id, migrating
  // every place the old socket id was referenced (map key, host id, turn
  // order, votes, last-exiled marker). Returns the previous socket id too,
  // so the caller can cancel any pending grace-period removal timer for it.
  public reconnectPlayer(code: string, sessionToken: string, newSocketId: string): { room: RoomState; previousSocketId: string } | null {
    const entry = this.tokenMap[sessionToken];
    if (!entry || entry.code !== String(code || "").toUpperCase()) return null;

    const room = this.rooms[entry.code];
    if (!room) {
      delete this.tokenMap[sessionToken];
      return null;
    }

    const oldSocketId = entry.socketId;
    const player = room.players[oldSocketId];
    if (!player) {
      delete this.tokenMap[sessionToken];
      return null;
    }

    if (oldSocketId !== newSocketId) {
      delete room.players[oldSocketId];
      player.id = newSocketId;
      player.socketId = newSocketId;
      room.players[newSocketId] = player;

      room.turnOrder = room.turnOrder.map(id => (id === oldSocketId ? newSocketId : id));
      room.speakerQueue = room.speakerQueue.map(id => (id === oldSocketId ? newSocketId : id));
      if (room.speakerId === oldSocketId) room.speakerId = newSocketId;
      if (room.hostId === oldSocketId) room.hostId = newSocketId;
      if (room.lastExiledPlayerId === oldSocketId) room.lastExiledPlayerId = newSocketId;

      const remappedVotes: Record<string, string> = {};
      Object.entries(room.votes).forEach(([voterId, targetId]) => {
        const v = voterId === oldSocketId ? newSocketId : voterId;
        const t = targetId === oldSocketId ? newSocketId : targetId;
        remappedVotes[v] = t;
      });
      room.votes = remappedVotes;

      entry.socketId = newSocketId;
    }

    player.isConnected = true;
    return { room, previousSocketId: oldSocketId };
  }

  public leaveRoom(socketId: string, reason: 'left' | 'kicked' = 'left'): { room: RoomState | null; code: string | null } {
    for (const token in this.tokenMap) {
      if (this.tokenMap[token].socketId === socketId) delete this.tokenMap[token];
    }

    for (const code in this.rooms) {
      const room = this.rooms[code];
      if (room.players[socketId]) {
        const playerName = room.players[socketId].name;
        delete room.players[socketId];
        room.turnOrder = room.turnOrder.filter(id => id !== socketId);

        if (Object.values(room.players).every(p => p.id.startsWith('bot-'))) {
          this.stopSpeeches(room);
          delete this.rooms[code];
          delete this.dealMemory[code];
          return { room: null, code };
        }

        if (room.phase === 'DISCUSSION' && room.speakerId === socketId) {
          this.advanceSpeaker(room, true);
        }

        if (room.hostId === socketId) {
          const nextHostId = Object.keys(room.players)[0];
          room.hostId = nextHostId;
          room.players[nextHostId].isHost = true;
          this.addSystemMessage(room, `Новым лидером бункера назначен ${room.players[nextHostId].name}.`);
        }

        this.addSystemMessage(room, reason === 'kicked' ? `${playerName} исключён из комнаты хостом.` : `${playerName} покинул комнату.`);
        return { room, code };
      }
    }
    return { room: null, code: null };
  }

  public getRoom(code: string): RoomState | null {
    return this.rooms[String(code || "").toUpperCase()] || null;
  }

  public updateSettings(
    code: string,
    socketId: string,
    settings: { maxPlayers?: number; turnDuration?: number; secretVoting?: boolean; lineageEnabled?: boolean }
  ): RoomState | null {
    const room = this.rooms[code];
    if (!room || room.hostId !== socketId || room.phase !== 'LOBBY') return null;

    if (settings.maxPlayers) room.maxPlayers = Math.max(settings.maxPlayers, Object.keys(room.players).length);
    if (settings.turnDuration) room.turnDuration = settings.turnDuration;
    if (typeof settings.secretVoting === 'boolean') room.secretVoting = settings.secretVoting;
    if (typeof settings.lineageEnabled === 'boolean') room.lineageEnabled = settings.lineageEnabled;
    return room;
  }

  /** Комната, в которой состоит этот сокет (или null). */
  public getRoomBySocket(socketId: string): RoomState | null {
    for (const code in this.rooms) {
      if (this.rooms[code].players[socketId]) return this.rooms[code];
    }
    return null;
  }

  public startGame(code: string, socketId: string): RoomState | null {
    const room = this.rooms[code];
    if (!room || room.hostId !== socketId) return null;
    // Allow starting fresh from the lobby, or starting a brand new game
    // after a previous one ended (the "Play again" flow).
    if (room.phase !== 'LOBBY' && room.phase !== 'GAME_OVER') return null;
    if (Object.keys(room.players).length < 2) return null;

    this.stopSpeeches(room);
    room.lineage = undefined;
    room.roleResults = undefined;
    room.survivalChance = undefined;
    room.gameFailed = undefined;

    const mem = this.getMemory(code);
    mem.games += 1;
    const game = mem.games;
    const usedFor = (cat: string) => (mem.used[cat] ||= {});

    // Pick Catastrophe and Shelter (not repeating the previous games' ones
    // while there are fresher options), then lightly vary their numbers so
    // even a repeated scenario plays a bit differently.
    const baseCat = this.createFreshPicker(CATASTROPHES, c => c.id, usedFor('catastrophe'), game)();
    room.catastrophe = {
      ...baseCat,
      destructionPercent: clamp(baseCat.destructionPercent + randInt(-3, 3), 40, 99),
      survivorsPercent: clamp(baseCat.survivorsPercent + randInt(-1, 2), 1, 30),
      durationYears: Math.max(2, baseCat.durationYears + randInt(-2, 2))
    };
    const baseShelter = this.createFreshPicker(SHELTERS, sh => sh.id, usedFor('shelter'), game)();
    room.shelter = {
      ...baseShelter,
      areaSqM: Math.round(baseShelter.areaSqM * (0.9 + Math.random() * 0.2)),
      foodWaterYears: Math.max(2, baseShelter.foodWaterYears + randInt(-2, 2)),
      equipment: this.shuffle(baseShelter.equipment),
      problems: this.shuffle(baseShelter.problems)
    };

    // Deal Character Cards & Roles
    const playerIds = Object.keys(room.players);
    const n = playerIds.length;
    // Чем меньше игроков, тем меньше мест: ~40% от числа игроков, у больших компаний иногда +1.
    const baseCapacity = Math.max(1, Math.floor(n * 0.4));
    const capacityShift = n >= 6 ? this.getRandomItem([0, 0, 0, 1]) : 0;
    room.bunkerCapacity = n <= 2 ? 1 : clamp(baseCapacity + capacityShift, 1, n - 1);

    // Each category deals from its own deck, freshest variants first:
    // unique within the room (unless the room outgrows the deck) and, across
    // consecutive games of the same room, not repeating until the whole
    // deck has been cycled through.
    const pickRole = this.createFreshPicker(SPECIAL_ROLES, r => r.id, usedFor('role'), game);
    const pickProfession = this.createFreshPicker(PROFESSIONS, c => c.title, usedFor('profession'), game);
    const pickHealth = this.createFreshPicker(HEALTH_STATUSES, c => c.title, usedFor('health'), game);
    const pickHobby = this.createFreshPicker(HOBBIES, c => c.title, usedFor('hobby'), game);
    const pickTrait = this.createFreshPicker(TRAITS, c => c.title, usedFor('trait'), game);
    const pickBaggage = this.createFreshPicker(BAGGAGES, c => c.title, usedFor('baggage'), game);
    const pickSecret = this.createFreshPicker(SECRET_FACTS, c => c.title, usedFor('secret'), game);
    const pickCondition = this.createFreshPicker(CONDITIONS, c => c.title, usedFor('condition'), game);
    const pickPhobia = this.createFreshPicker(PHOBIAS, c => c.title, usedFor('phobia'), game);
    const pickKnowledge = this.createFreshPicker(KNOWLEDGE, c => c.title, usedFor('knowledge'), game);
    const pickActionCard = this.createFreshPicker(ACTION_CARDS, c => c.effect, usedFor('action'), game);
    const takenBio = new Set<string>();

    playerIds.forEach(id => {
      const p = room.players[id];

      // Reset any state left over from a previous game (restart flow).
      p.isExiled = false;
      p.hasVoted = false;
      p.votesCount = 0;
      p.revealedThisRound = false;
      p.actionCardUsed = false;
      p.hasImmunity = false;
      p.voteWeight = 1;

      p.role = pickRole();

      const prof = pickProfession();
      const health = pickHealth();
      const bio = this.rollBiology(takenBio);
      const hobby = pickHobby();
      const trait = pickTrait();
      const baggage = pickBaggage();
      const secret = pickSecret();
      const condition = pickCondition();
      const phobia = pickPhobia();
      const knowledge = pickKnowledge();
      const actCard = pickActionCard();

      // Стаж и квалификация идут вместе с профессией; уровень хобби и
      // состояние багажа тоже каждый раз выпадают разные — так даже
      // повторившаяся карта звучит по-новому.
      const stagYears = randInt(1, 24);
      const professionDesc = `${prof.desc} Стаж: ${formatYears(stagYears)}. Квалификация: ${profLevel(stagYears)}.`;
      const hobbyDesc = `${hobby.desc} Уровень: ${this.getRandomItem(HOBBY_LEVELS)}.`;
      const baggageDesc = `${baggage.desc} Состояние: ${this.getRandomItem(BAGGAGE_STATES)}.`;

      p.cards = {
        profession: { id: `prof-${id}`, type: 'profession', title: prof.title, description: professionDesc, isRevealed: false },
        health: { id: `health-${id}`, type: 'health', title: health.title, description: health.desc, isRevealed: false },
        biology: { id: `bio-${id}`, type: 'biology', title: `${bio.sex}, ${formatYears(bio.age)}`, description: bio.fertility, isRevealed: false },
        hobby: { id: `hobby-${id}`, type: 'hobby', title: hobby.title, description: hobbyDesc, isRevealed: false },
        trait: { id: `trait-${id}`, type: 'trait', title: trait.title, description: trait.desc, isRevealed: false },
        baggage: { id: `baggage-${id}`, type: 'baggage', title: baggage.title, description: baggageDesc, isRevealed: false },
        secret: { id: `secret-${id}`, type: 'secret', title: secret.title, description: secret.desc, isRevealed: false },
        condition: { id: `cond-${id}`, type: 'condition', title: condition.title, description: condition.desc, isRevealed: false },
        phobia: { id: `phobia-${id}`, type: 'phobia', title: phobia.title, description: phobia.desc, isRevealed: false },
        knowledge: { id: `know-${id}`, type: 'knowledge', title: knowledge.title, description: knowledge.desc, isRevealed: false },
        actionCard: { id: `act-${id}`, type: 'actionCard', title: actCard.title, description: actCard.desc, isRevealed: false, meta: { effect: actCard.effect } }
      };

      p.actionCards = [p.cards.actionCard];
    });

    room.votes = {};
    room.lastExiledPlayerId = null;
    room.roundEvent = null;
    room.paused = false;
    delete this.pausedLeft[room.code];
    delete this.eventsUsed[room.code];
    room.phase = 'INTRO';
    if (this.onGameStart) this.onGameStart(room);
    room.currentRound = 1;
    room.activePlayerIndex = 0;
    room.revealedCountInRound = 0;
    this.addSystemMessage(room, `Глобальная катастрофа произошла! ${room.catastrophe.title}. Бункер готов к приему ${room.bunkerCapacity} выживших.`);
    return room;
  }

  private getMemory(code: string) {
    return (this.dealMemory[code] ||= { games: 0, used: {} });
  }

  // ---------- Очередь выступлений (фаза DISCUSSION) ----------

  public onGameStart?: (room: RoomState) => void;
  public onGameOver?: (room: RoomState) => void;

  // ---- Сохранение / восстановление состояния (см. persistence.ts) ----
  public exportState() {
    return {
      savedAt: Date.now(),
      rooms: this.rooms,
      tokenMap: this.tokenMap,
      dealMemory: this.dealMemory,
      eventsUsed: this.eventsUsed,
    };
  }

  /** Возвращает число восстановленных комнат. Игры в процессе ставятся на паузу. */
  public importState(snap: any): number {
    let n = 0;
    this.tokenMap = snap.tokenMap || {};
    this.dealMemory = snap.dealMemory || {};
    this.eventsUsed = snap.eventsUsed || {};
    for (const code of Object.keys(snap.rooms || {})) {
      const room: RoomState = snap.rooms[code];
      if (!room || !room.players) continue;
      const left = Number((room as any).speechRemainingMs) || 0;
      delete (room as any).speechRemainingMs;
      this.attachSpeechClock(room);
      Object.values(room.players).forEach(p => { if (!p.id.startsWith('bot-')) p.isConnected = false; });
      if (['CARD_REVEAL', 'DISCUSSION', 'VOTING'].includes(room.phase)) {
        room.paused = true;
        if (room.phase === 'DISCUSSION' && room.speakerId) {
          this.pausedLeft[code] = left > 0 ? left : room.speechDuration * 1000;
        }
        this.addSystemMessage(room, '♻ Сервер перезапускался. Игра на паузе: хост, нажмите «Продолжить», когда все вернутся.');
      }
      this.rooms[code] = room;
      n++;
    }
    return n;
  }

  /** Игроки, которые так и не вернулись после перезапуска. */
  public listOfflineHumans(): Array<{ code: string; id: string }> {
    const out: Array<{ code: string; id: string }> = [];
    for (const code in this.rooms) {
      for (const p of Object.values(this.rooms[code].players)) {
        if (!p.id.startsWith('bot-') && !p.isConnected) out.push({ code, id: p.id });
      }
    }
    return out;
  }

  private pausedLeft: Record<string, number> = {};

  private attachSpeechClock(room: RoomState) {
    Object.defineProperty(room, 'speechRemainingMs', {
      enumerable: true,
      configurable: true,
      get: () => {
        const frozen = this.pausedLeft[room.code];
        if (frozen != null) return frozen;
        const end = this.speechEnds[room.code];
        return end ? Math.max(0, end - Date.now()) : 0;
      }
    });
  }

  private stopSpeeches(room: RoomState) {
    const t = this.speechTimers[room.code];
    if (t) clearTimeout(t);
    delete this.speechTimers[room.code];
    delete this.speechEnds[room.code];
    delete this.pausedLeft[room.code];
    room.speakerId = null;
    room.speakerQueue = [];
  }

  private eventsUsed: Record<string, number[]> = {};

  /** Выбирает событие нового раунда (без повторов, пока есть свежие). */
  private rollRoundEvent(room: RoomState) {
    const used = (this.eventsUsed[room.code] ||= []);
    let pool = ROUND_EVENTS.map((_, i) => i).filter(i => !used.includes(i));
    if (pool.length === 0) { used.length = 0; pool = ROUND_EVENTS.map((_, i) => i); }
    const idx = pool[Math.floor(Math.random() * pool.length)];
    used.push(idx);
    const ev = ROUND_EVENTS[idx];
    room.roundEvent = { title: ev.title, desc: ev.desc, needs: ev.needs };
    this.addSystemMessage(room, `⚠ Событие раунда: «${ev.title}». ${ev.desc} Могут пригодиться: ${ev.needs}.`);
  }

  private startSpeeches(room: RoomState) {
    this.stopSpeeches(room);
    const active = room.turnOrder.filter(id => room.players[id] && !room.players[id].isExiled);
    if (active.length === 0) return;
    const shift = (room.currentRound - 1) % active.length;
    room.speakerQueue = [...active.slice(shift), ...active.slice(0, shift)];
    room.speechDuration = Math.max(10, room.turnDuration);
    this.advanceSpeaker(room, false);
  }

  private advanceSpeaker(room: RoomState, notify: boolean) {
    const old = this.speechTimers[room.code];
    if (old) clearTimeout(old);
    delete this.speechTimers[room.code];

    let next: string | undefined;
    while (room.speakerQueue.length > 0) {
      const id = room.speakerQueue.shift() as string;
      if (room.players[id] && !room.players[id].isExiled) { next = id; break; }
    }

    if (!next) {
      room.speakerId = null;
      delete this.speechEnds[room.code];
      this.addSystemMessage(room, 'Все высказались. Можно обсудить спорные моменты и переходить к голосованию.');
    } else {
      room.speakerId = next;
      const ms = room.speechDuration * 1000;
      if (room.paused) {
        // Игра на паузе: время нового говорящего ждёт возобновления.
        this.pausedLeft[room.code] = ms;
      } else {
        this.armSpeechTimer(room, next, ms);
      }
    }
    if (notify && this.onSpeakerChange) this.onSpeakerChange(room);
  }

  private armSpeechTimer(room: RoomState, speakerId: string, ms: number) {
    this.speechEnds[room.code] = Date.now() + ms;
    this.speechTimers[room.code] = setTimeout(() => {
      const current = this.rooms[room.code];
      if (!current || current.phase !== 'DISCUSSION' || current.speakerId !== speakerId || current.paused) return;
      this.advanceSpeaker(current, true);
    }, ms + 150);
  }

  // Хост ставит игру на паузу / снимает с паузы.
  public togglePause(code: string, socketId: string): RoomState | null {
    const room = this.rooms[code];
    if (!room || room.hostId !== socketId) return null;
    if (!['CARD_REVEAL', 'DISCUSSION', 'VOTING'].includes(room.phase)) return null;
    if (!room.paused) {
      room.paused = true;
      const end = this.speechEnds[code];
      if (end && room.speakerId) {
        this.pausedLeft[code] = Math.max(0, end - Date.now());
        const t = this.speechTimers[code];
        if (t) clearTimeout(t);
        delete this.speechTimers[code];
        delete this.speechEnds[code];
      }
      this.addSystemMessage(room, '⏸ Хост поставил игру на паузу.');
    } else {
      room.paused = false;
      const left = this.pausedLeft[code];
      delete this.pausedLeft[code];
      if (room.speakerId && room.phase === 'DISCUSSION') {
        this.armSpeechTimer(room, room.speakerId, left ?? room.speechDuration * 1000);
      }
      this.addSystemMessage(room, '▶ Игра продолжается.');
    }
    return room;
  }

  // Говорящий (или хост) досрочно завершает выступление.
  public endSpeech(code: string, socketId: string): RoomState | null {
    const room = this.rooms[code];
    if (!room || room.phase !== 'DISCUSSION' || !room.speakerId || room.paused) return null;
    if (socketId !== room.speakerId && socketId !== room.hostId) return null;
    this.advanceSpeaker(room, true);
    return room;
  }

  private resetRoundFlags(room: RoomState) {
    Object.values(room.players).forEach(p => {
      p.revealedThisRound = false;
      p.hasImmunity = false;
      p.voteWeight = 1;
    });
    room.revealedCountInRound = 0;
  }

  public advancePhase(code: string): RoomState | null {
    const room = this.rooms[code];
    if (!room || room.paused) return null;

    this.stopSpeeches(room);

    if (room.phase === 'INTRO') {
      room.phase = 'CARD_REVEAL';
      this.resetRoundFlags(room);

      if (room.currentRound === 1) {
        // Вводный раунд: голосования не будет, поэтому профессия каждого
        // выжившего раскрывается сразу и автоматически — это ознакомительный
        // раунд, а не проверка на изгнание.
        const activePlayers = Object.values(room.players).filter(p => !p.isExiled);
        activePlayers.forEach(p => {
          if (p.cards.profession && !p.cards.profession.isRevealed) {
            p.cards.profession.isRevealed = true;
          }
          p.revealedThisRound = true;
        });
        room.revealedCountInRound = activePlayers.length;
        this.addSystemMessage(room, `Раунд 1 — вступительный. Карты профессий всех выживших открыты автоматически, голосования в этом раунде не будет.`);
      } else {
        this.addSystemMessage(room, `Раунд ${room.currentRound}. Каждому выжившему необходимо открыть одну из своих характеристик.`);
      }
    } else if (room.phase === 'CARD_REVEAL') {
      room.phase = 'DISCUSSION';
      this.addSystemMessage(room, `Фаза обсуждения! Каждый выступает по очереди, на слово — ${Math.max(10, room.turnDuration)} сек. Убедите группу в своей полезности для бункера.`);
      this.startSpeeches(room);
    } else if (room.phase === 'DISCUSSION') {
      if (room.currentRound === 1) {
        // Первый раунд ознакомительный — пропускаем голосование и изгнание,
        // сразу переходим к раскрытию карт второго раунда.
        room.currentRound += 1;
        room.phase = 'CARD_REVEAL';
        this.resetRoundFlags(room);
        this.addSystemMessage(room, `Первый раунд был вступительным — никто не изгнан. Раунд ${room.currentRound}. Откройте следующую характеристику своего персонажа.`);
        this.rollRoundEvent(room);
      } else {
        room.phase = 'VOTING';
        room.votes = {};
        Object.values(room.players).forEach(p => {
          p.hasVoted = false;
          p.votesCount = 0;
        });
        this.addSystemMessage(room, `Фаза голосования! Проголосуйте за игрока, которого вы хотите изгнать из бункера.`);
      }
    } else if (room.phase === 'VOTE_RESULTS') {
      const activePlayers = Object.values(room.players).filter(p => !p.isExiled);
      if (activePlayers.length <= room.bunkerCapacity) {
        room.phase = 'GAME_OVER';
        const sv = computeSurvival(room);
        room.survivalChance = sv.chance;
        room.gameFailed = sv.failed;
        room.roleResults = computeRoleResults(room);
        for (const rr of room.roleResults) {
          if (rr.roleTitle === 'Тайный Зараженный') {
            this.addSystemMessage(room, rr.achieved
              ? `ТРЕВОГА! Среди выживших был ${rr.playerName}: Тайный Зараженный пробрался в бункер и выполнил свою цель.`
              : `${rr.playerName} был Тайным Зараженным, но не попал в бункер.`);
          }
        }
        if (this.onGameOver) this.onGameOver(room);
        this.addSystemMessage(room, `Игра завершена! Бункер запечатан. Оставшиеся выжившие отправляются восстанавливать цивилизацию.`);
      } else {
        room.currentRound += 1;
        room.phase = 'CARD_REVEAL';
        this.resetRoundFlags(room);
        this.addSystemMessage(room, `Раунд ${room.currentRound}. Откройте следующую характеристику своего персонажа.`);
        this.rollRoundEvent(room);
      }
    }

    return room;
  }

  public revealCard(code: string, socketId: string, cardType: CardType): RoomState | null {
    const room = this.rooms[code];
    if (!room || room.phase !== 'CARD_REVEAL' || room.paused) return null;
    if (!REVEALABLE_CARD_TYPES.includes(cardType)) return null;

    const player = room.players[socketId];
    if (!player || player.isExiled) return null;
    if (player.revealedThisRound) return null;

    if (player.cards[cardType] && !player.cards[cardType].isRevealed) {
      player.cards[cardType].isRevealed = true;
      player.revealedThisRound = true;
      room.revealedCountInRound = (room.revealedCountInRound || 0) + 1;
      this.addSystemMessage(room, `${player.name} открыл карту [${player.cards[cardType].title}] (${cardType.toUpperCase()}).`);
    }

    return room;
  }

  // ---- «Продолжить род» ----
  public beginLineage(code: string, socketId: string): RoomState | null {
    const room = this.rooms[code];
    if (!room || room.hostId !== socketId || room.lineage) return null;
    return startLineage(room) ? room : null;
  }

  public voteLineage(code: string, socketId: string, optionId: string): RoomState | null {
    const room = this.rooms[code];
    if (!room || !lineageVote(room, socketId, optionId)) return null;
    if (allLineageVoted(room)) resolveGeneration(room);
    return room;
  }

  public resolveLineage(code: string, socketId: string): RoomState | null {
    const room = this.rooms[code];
    if (!room || room.hostId !== socketId) return null;
    return resolveGeneration(room) ? room : null;
  }

  public nextLineage(code: string, socketId: string): RoomState | null {
    const room = this.rooms[code];
    if (!room || room.hostId !== socketId) return null;
    return nextGeneration(room) ? room : null;
  }

  public castVote(code: string, voterId: string, targetId: string): RoomState | null {
    const room = this.rooms[code];
    if (!room || room.phase !== 'VOTING' || room.paused) return null;

    const voter = room.players[voterId];
    const target = room.players[targetId];
    if (!voter || voter.isExiled || voter.hasVoted) return null;
    if (!target || target.isExiled) return null;
    if (targetId === voterId) return null;

    room.votes[voterId] = targetId;
    voter.hasVoted = true;
    const weight = voter.voteWeight || 1;
    target.votesCount = (target.votesCount || 0) + weight;

    // Check if all non-exiled players have voted
    const activePlayers = Object.values(room.players).filter(p => !p.isExiled);
    const allVoted = activePlayers.every(p => p.hasVoted);

    if (allVoted) {
      this.tallyVotes(room);
    }

    return room;
  }

  private tallyVotes(room: RoomState) {
    const counts: Record<string, number> = {};
    Object.entries(room.votes).forEach(([voterId, targetId]) => {
      const weight = room.players[voterId]?.voteWeight || 1;
      counts[targetId] = (counts[targetId] || 0) + weight;
    });

    // Immune players cannot be exiled this round, even if they top the vote.
    let maxVotes = 0;
    let topCandidates: string[] = [];
    Object.entries(counts).forEach(([id, count]) => {
      const candidate = room.players[id];
      if (!candidate || candidate.hasImmunity) return;
      if (count > maxVotes) {
        maxVotes = count;
        topCandidates = [id];
      } else if (count === maxVotes && count > 0) {
        topCandidates.push(id);
      }
    });

    if (topCandidates.length === 1) {
      const exiledId = topCandidates[0];
      room.players[exiledId].isExiled = true;
      room.lastExiledPlayerId = exiledId;
      this.addSystemMessage(room, `Группа приняла решение! ${room.players[exiledId].name} изгнан из бункера!`);
    } else if (topCandidates.length > 1) {
      const exiledId = this.getRandomItem(topCandidates);
      room.players[exiledId].isExiled = true;
      room.lastExiledPlayerId = exiledId;
      this.addSystemMessage(room, `Ничья между ${topCandidates.length} игроками! Жребий решил: ${room.players[exiledId].name} изгнан из бункера.`);
    } else {
      room.lastExiledPlayerId = null;
      this.addSystemMessage(room, `Никто не изгнан в этом раунде — лидеры голосования защищены иммунитетом или голоса не были поданы.`);
    }

    room.phase = 'VOTE_RESULTS';
  }

  public useActionCard(code: string, socketId: string, targetId?: string): RoomState | null {
    const room = this.rooms[code];
    if (!room || room.paused) return null;

    const player = room.players[socketId];
    if (!player || player.isExiled) return null;
    if (player.actionCardUsed) return null;
    if (!['CARD_REVEAL', 'DISCUSSION', 'VOTING'].includes(room.phase)) return null;

    const card = player.cards.actionCard;
    const effect = card?.meta?.effect;
    if (!card || !effect) return null;

    switch (effect) {
      case 'IMMUNITY': {
        player.hasImmunity = true;
        this.addSystemMessage(room, `${player.name} активировал спецкарту «Иммунитет раунда» — его нельзя изгнать в этом раунде.`);
        break;
      }
      case 'DOUBLE_VOTE': {
        player.voteWeight = 2;
        // Если уже проголосовал — добавляем второй голос к своему выбору.
        if (room.phase === 'VOTING' && player.hasVoted) {
          const t = room.players[room.votes[player.id]];
          if (t) t.votesCount = (t.votesCount || 0) + 1;
        }
        this.addSystemMessage(room, `${player.name} активировал спецкарту «Удвоение голоса» — его голос в этом раунде считается за двоих.`);
        break;
      }
      case 'REVOTE': {
        if (room.phase !== 'VOTING') return null;
        room.votes = {};
        Object.values(room.players).forEach(p => {
          p.hasVoted = false;
          p.votesCount = 0;
        });
        this.addSystemMessage(room, `${player.name} активировал спецкарту «Второй шанс» — голосование этого раунда аннулировано и начато заново!`);
        break;
      }
      case 'FORCE_HEALTH_REVEAL': {
        const target = targetId ? room.players[targetId] : null;
        if (!target || target.isExiled || target.id === player.id) return null;
        if (target.cards.health && !target.cards.health.isRevealed) {
          target.cards.health.isRevealed = true;
        }
        this.addSystemMessage(room, `${player.name} активировал спецкарту «Проверка здоровья» — ${target.name} вынужден(а) раскрыть карту Здоровья!`);
        break;
      }
      case 'SWAP_PROFESSION': {
        const target = targetId ? room.players[targetId] : null;
        if (!target || target.isExiled || target.id === player.id) return null;
        const myProf = player.cards.profession;
        const theirProf = target.cards.profession;
        if (myProf && theirProf) {
          const tmpTitle = myProf.title;
          const tmpDesc = myProf.description;
          myProf.title = theirProf.title;
          myProf.description = theirProf.description;
          theirProf.title = tmpTitle;
          theirProf.description = tmpDesc;
        }
        this.addSystemMessage(room, `${player.name} активировал спецкарту «Обмен профессией» с игроком ${target.name}!`);
        break;
      }
      default:
        return null;
    }

    player.actionCardUsed = true;
    return room;
  }

  public addChatMessage(code: string, senderId: string, text: string): RoomState | null {
    const room = this.rooms[code];
    if (!room) return null;

    const player = room.players[senderId];
    if (!player) return null;

    const msg: ChatMessage = {
      id: `msg-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
      senderId,
      senderName: player.name,
      text,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      // Изгнанные общаются в своём чате и не влияют на живых игроков.
      ...(player.isExiled && room.phase !== 'LOBBY' && room.phase !== 'GAME_OVER' ? { ghost: true } : {})
    };

    room.chatMessages.push(msg);
    if (room.chatMessages.length > 100) room.chatMessages.shift();
    return room;
  }

  private addSystemMessage(room: RoomState, text: string) {
    const msg: ChatMessage = {
      id: `sys-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
      senderId: 'SYSTEM',
      senderName: 'Бункер ИИ',
      text,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      isSystem: true
    };
    room.chatMessages.push(msg);
  }
}
