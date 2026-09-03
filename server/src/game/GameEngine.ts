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
  ACTION_CARDS,
  SPECIAL_ROLES
} from '../data/decks';

// Card types that represent revealable personal information.
// The action card is handled separately through useActionCard() and does
// not count against the "one reveal per round" limit.
export const REVEALABLE_CARD_TYPES: CardType[] = [
  'profession', 'health', 'biology', 'hobby', 'trait', 'baggage', 'secret', 'condition'
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

export class GameEngine {
  private rooms: Record<string, RoomState> = {};

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
      bunkerCapacity: 4,
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
      revealedCountInRound: 0
    };

    this.rooms[code] = room;

    const sessionToken = this.generateSessionToken();
    this.tokenMap[sessionToken] = { code, socketId: hostSocketId };

    return { room, sessionToken };
  }

  public joinRoom(code: string, socketId: string, name: string, avatar: string): { room: RoomState; sessionToken: string } | null {
    const room = this.rooms[code.toUpperCase()];
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
    room.bunkerCapacity = Math.max(1, Math.floor(Object.keys(room.players).length / 2));

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
    if (!entry || entry.code !== code.toUpperCase()) return null;

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

  public leaveRoom(socketId: string): { room: RoomState | null; code: string | null } {
    for (const token in this.tokenMap) {
      if (this.tokenMap[token].socketId === socketId) delete this.tokenMap[token];
    }

    for (const code in this.rooms) {
      const room = this.rooms[code];
      if (room.players[socketId]) {
        const playerName = room.players[socketId].name;
        delete room.players[socketId];
        room.turnOrder = room.turnOrder.filter(id => id !== socketId);

        if (Object.keys(room.players).length === 0) {
          delete this.rooms[code];
          return { room: null, code };
        }

        if (room.hostId === socketId) {
          const nextHostId = Object.keys(room.players)[0];
          room.hostId = nextHostId;
          room.players[nextHostId].isHost = true;
          this.addSystemMessage(room, `Новым лидером бункера назначен ${room.players[nextHostId].name}.`);
        }

        this.addSystemMessage(room, `${playerName} покинул комнату.`);
        return { room, code };
      }
    }
    return { room: null, code: null };
  }

  public getRoom(code: string): RoomState | null {
    return this.rooms[code.toUpperCase()] || null;
  }

  public updateSettings(code: string, socketId: string, settings: { maxPlayers?: number; turnDuration?: number }): RoomState | null {
    const room = this.rooms[code];
    if (!room || room.hostId !== socketId || room.phase !== 'LOBBY') return null;

    if (settings.maxPlayers) room.maxPlayers = settings.maxPlayers;
    if (settings.turnDuration) room.turnDuration = settings.turnDuration;
    return room;
  }

  public startGame(code: string, socketId: string): RoomState | null {
    const room = this.rooms[code];
    if (!room || room.hostId !== socketId) return null;
    // Allow starting fresh from the lobby, or starting a brand new game
    // after a previous one ended (the "Play again" flow).
    if (room.phase !== 'LOBBY' && room.phase !== 'GAME_OVER') return null;
    if (Object.keys(room.players).length < 2) return null;

    // Pick Catastrophe and Shelter
    room.catastrophe = this.getRandomItem(CATASTROPHES);
    room.shelter = this.getRandomItem(SHELTERS);

    // Deal Character Cards & Roles
    const playerIds = Object.keys(room.players);
    room.bunkerCapacity = Math.max(1, Math.floor(playerIds.length / 2));

    const availableRoles = [...SPECIAL_ROLES];

    // Deal each card category from its own shuffled deck so players in the
    // same room don't receive duplicate cards unless the room has more
    // players than the deck has unique entries (only then do decks reshuffle
    // and start repeating).
    const pickProfession = this.createDeckPicker(PROFESSIONS);
    const pickHealth = this.createDeckPicker(HEALTH_STATUSES);
    const pickBio = this.createDeckPicker(BIOLOGY_DESCS);
    const pickHobby = this.createDeckPicker(HOBBIES);
    const pickTrait = this.createDeckPicker(TRAITS);
    const pickBaggage = this.createDeckPicker(BAGGAGES);
    const pickSecret = this.createDeckPicker(SECRET_FACTS);
    const pickCondition = this.createDeckPicker(CONDITIONS);
    const pickActionCard = this.createDeckPicker(ACTION_CARDS);

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

      // Assign random Role
      const roleIndex = Math.floor(Math.random() * availableRoles.length);
      p.role = availableRoles[roleIndex] || SPECIAL_ROLES[SPECIAL_ROLES.length - 1];
      if (availableRoles.length > 1) {
        availableRoles.splice(roleIndex, 1);
      }

      const prof = pickProfession();

      const health = pickHealth();
      const bio = pickBio();
      const hobby = pickHobby();
      const trait = pickTrait();
      const baggage = pickBaggage();
      const secret = pickSecret();
      const condition = pickCondition();
      const actCard = pickActionCard();

      // Стаж работы (1..24 года) — прибавляется к описанию профессии как
      // отдельная, но неразрывно связанная с ней характеристика.
      const stagYears = 1 + Math.floor(Math.random() * 24);
      const professionDesc = `${prof.desc} Стаж: ${formatYears(stagYears)}.`;

      p.cards = {
        profession: { id: `prof-${id}`, type: 'profession', title: prof.title, description: professionDesc, isRevealed: false },
        health: { id: `health-${id}`, type: 'health', title: health.title, description: health.desc, isRevealed: false },
        biology: { id: `bio-${id}`, type: 'biology', title: `${bio.sex}, ${bio.age} лет`, description: bio.fertility, isRevealed: false },
        hobby: { id: `hobby-${id}`, type: 'hobby', title: hobby.title, description: hobby.desc, isRevealed: false },
        trait: { id: `trait-${id}`, type: 'trait', title: trait.title, description: trait.desc, isRevealed: false },
        baggage: { id: `baggage-${id}`, type: 'baggage', title: baggage.title, description: baggage.desc, isRevealed: false },
        secret: { id: `secret-${id}`, type: 'secret', title: secret.title, description: secret.desc, isRevealed: false },
        condition: { id: `cond-${id}`, type: 'condition', title: condition.title, description: condition.desc, isRevealed: false },
        actionCard: { id: `act-${id}`, type: 'actionCard', title: actCard.title, description: actCard.desc, isRevealed: false, meta: { effect: actCard.effect } }
      };

      p.actionCards = [p.cards.actionCard];
    });

    room.votes = {};
    room.lastExiledPlayerId = null;
    room.phase = 'INTRO';
    room.currentRound = 1;
    room.activePlayerIndex = 0;
    room.revealedCountInRound = 0;
    this.addSystemMessage(room, `Глобальная катастрофа произошла! ${room.catastrophe.title}. Бункер готов к приему ${room.bunkerCapacity} выживших.`);
    return room;
  }

  private resetRoundFlags(room: RoomState) {
    Object.values(room.players).forEach(p => {
      p.revealedThisRound = false;
      p.hasImmunity = false;
    });
    room.revealedCountInRound = 0;
  }

  public advancePhase(code: string): RoomState | null {
    const room = this.rooms[code];
    if (!room) return null;

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
      this.addSystemMessage(room, `Фаза обсуждения! Убедите группу в своей полезности для бункера.`);
    } else if (room.phase === 'DISCUSSION') {
      if (room.currentRound === 1) {
        // Первый раунд ознакомительный — пропускаем голосование и изгнание,
        // сразу переходим к раскрытию карт второго раунда.
        room.currentRound += 1;
        room.phase = 'CARD_REVEAL';
        this.resetRoundFlags(room);
        this.addSystemMessage(room, `Первый раунд был вступительным — никто не изгнан. Раунд ${room.currentRound}. Откройте следующую характеристику своего персонажа.`);
      } else {
        room.phase = 'VOTING';
        room.votes = {};
        Object.values(room.players).forEach(p => {
          p.hasVoted = false;
          p.votesCount = 0;
          p.voteWeight = 1;
        });
        this.addSystemMessage(room, `Фаза голосования! Проголосуйте за игрока, которого вы хотите изгнать из бункера.`);
      }
    } else if (room.phase === 'VOTE_RESULTS') {
      const activePlayers = Object.values(room.players).filter(p => !p.isExiled);
      if (activePlayers.length <= room.bunkerCapacity) {
        room.phase = 'GAME_OVER';
        this.addSystemMessage(room, `Игра завершена! Бункер запечатан. Оставшиеся выжившие отправляются восстанавливать цивилизацию.`);
      } else {
        room.currentRound += 1;
        room.phase = 'CARD_REVEAL';
        this.resetRoundFlags(room);
        this.addSystemMessage(room, `Раунд ${room.currentRound}. Откройте следующую характеристику своего персонажа.`);
      }
    }

    return room;
  }

  public revealCard(code: string, socketId: string, cardType: CardType): RoomState | null {
    const room = this.rooms[code];
    if (!room || room.phase !== 'CARD_REVEAL') return null;
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

  public castVote(code: string, voterId: string, targetId: string): RoomState | null {
    const room = this.rooms[code];
    if (!room || room.phase !== 'VOTING') return null;

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
    if (!room) return null;

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
        if (room.phase !== 'VOTING' || player.hasVoted) return null;
        player.voteWeight = 2;
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
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
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
