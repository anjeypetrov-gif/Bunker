import { Server } from 'socket.io';
import { GameEngine, REVEALABLE_CARD_TYPES } from './GameEngine';
import { RoomState, Player } from '../types/game';
import {
  CARD_TYPE_LABELS_RU,
  SELF_ARGUMENT_TEMPLATES,
  CONDITION_TEMPLATES,
  CONTEXT_TEMPLATES,
  ATTACK_NO_CARDS_TEMPLATES,
  ATTACK_WITH_CARD_TEMPLATES,
  ALLIANCE_TEMPLATES,
  DEFENSE_TEMPLATES,
  VOTE_REASON_WITH_CARDS_TEMPLATES,
  VOTE_REASON_NO_CARDS_TEMPLATES,
  RESULT_EXILED_TEMPLATES,
  RESULT_NONE_TEMPLATES,
  HUMAN_REACTION_AGREE_TEMPLATES,
  HUMAN_REACTION_DISAGREE_TEMPLATES,
  FILLER_TEMPLATES
} from '../data/botPhrases';

const BOT_NAMES = [
  'Бот Алексей (Инженер)',
  'Бот Мария (Врач)',
  'Бот Виктор (Тактик)',
  'Бот Елена (Агроном)',
  'Бот Дмитрий (Механик)',
  'Бот Ольга (Ученый)',
  'Бот Сергей (Пожарный)',
  'Бот Анна (Психолог)'
];

// Число портретов ботов в client/src/data/botAvatars.ts
// (bot-avatar-1 .. bot-avatar-N) — держим в синхроне вручную, как и остальные
// клиент/сервер дубликаты в этом проекте (см. CardType в types/game.ts).
const BOT_AVATAR_COUNT = 17;

// Категории реплик, из которых боты собирают свои сообщения в чате
// обсуждения. Держим здесь, а не в самих функциях, чтобы можно было
// избегать повторения одной и той же категории подряд у одного бота.
type DiscussionCategory = 'self' | 'attack' | 'context' | 'condition' | 'alliance' | 'defense';

export class BotManager {
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

  // Не даёт одному и тому же боту дважды подряд выбрать одну и ту же
  // категорию реплики — иначе он мог бы два раунда подряд "давить" одним
  // и тем же доводом.
  private lastCategoryByBot = new Map<string, DiscussionCategory>();

  private pickCategory(candidates: DiscussionCategory[], botId: string): DiscussionCategory {
    const last = this.lastCategoryByBot.get(botId);
    const filtered = candidates.length > 1 ? candidates.filter(c => c !== last) : candidates;
    const pool = filtered.length > 0 ? filtered : candidates;
    const choice = this.getRandomItem(pool);
    this.lastCategoryByBot.set(botId, choice);
    return choice;
  }

  // Гасит повторный запуск ботовского голосования при каждом отдельном
  // cast_vote (люди и боты голосуют по одному, а обработчик сокета
  // перезапускает автоматизацию после каждого голоса) — иначе на одну и
  // ту же фазу VOTING могли бы наслоиться десятки лишних таймеров.
  private votingScheduled = new Set<string>();

  private countRevealed(player: Player): number {
    return REVEALABLE_CARD_TYPES.filter(k => player.cards[k] && player.cards[k].isRevealed).length;
  }

  // Имена ботов вида "Бот Виктор (Тактик)" отлично смотрятся в системных
  // сообщениях ("Бот Виктор (Тактик) открыл карту..."), но внутри реплики
  // чата — "Голосую против Бот Виктор (Тактик)" — читаются коряво. Для
  // прямой речи используем только имя. У живых игроков префикса/скобок
  // обычно нет, так что для них строка просто возвращается как есть.
  private displayName(name: string): string {
    const stripped = name.replace(/^Бот\s+/, '').replace(/\s*\([^)]*\)\s*$/, '').trim();
    return stripped || name;
  }

  // Собирает одну реплику для фазы обсуждения на основе реальных данных
  // текущей партии: своих уже раскрытых карт, других живых игроков,
  // катастрофы/бункера, своей карты "Условие/бонус" и последней реплики
  // в чате (для эффекта настоящего диалога, а не монолога).
  private buildDiscussionLine(bot: Player, room: RoomState): string {
    const revealedOwnKeys = REVEALABLE_CARD_TYPES.filter(k => bot.cards[k] && bot.cards[k].isRevealed);
    const others = Object.values(room.players).filter(p => !p.isExiled && p.id !== bot.id);
    const lastMsg = [...room.chatMessages].reverse().find(m => !m.isSystem && m.senderId !== bot.id);
    const revealedCondition = bot.cards.condition && bot.cards.condition.isRevealed ? bot.cards.condition : null;

    const categories: DiscussionCategory[] = [];
    if (revealedOwnKeys.length > 0) categories.push('self', 'self');
    if (others.length > 0) categories.push('attack');
    if (room.catastrophe && room.shelter) categories.push('context');
    if (revealedCondition) categories.push('condition');
    if (lastMsg) categories.push('alliance');
    categories.push('defense');

    const category = this.pickCategory(categories, bot.id);

    switch (category) {
      case 'self': {
        if (revealedOwnKeys.length === 0) return this.getRandomItem(FILLER_TEMPLATES);
        const key = this.getRandomItem(revealedOwnKeys);
        const card = bot.cards[key];
        const label = CARD_TYPE_LABELS_RU[key];
        return this.getRandomItem(SELF_ARGUMENT_TEMPLATES)(label, card.title, card.description);
      }
      case 'attack': {
        if (others.length === 0) return this.getRandomItem(FILLER_TEMPLATES);
        const target = this.getRandomItem(others);
        const targetRevealedCount = this.countRevealed(target);
        if (targetRevealedCount === 0) {
          return this.getRandomItem(ATTACK_NO_CARDS_TEMPLATES)(this.displayName(target.name));
        }
        return this.getRandomItem(ATTACK_WITH_CARD_TEMPLATES)(this.displayName(target.name), targetRevealedCount);
      }
      case 'context': {
        if (!room.catastrophe || !room.shelter) return this.getRandomItem(FILLER_TEMPLATES);
        const problem = room.shelter.problems.length > 0 ? this.getRandomItem(room.shelter.problems) : undefined;
        return this.getRandomItem(CONTEXT_TEMPLATES)(
          room.catastrophe.title,
          room.shelter.title,
          room.bunkerCapacity,
          room.shelter.foodWaterYears,
          problem
        );
      }
      case 'condition': {
        if (!revealedCondition) return this.getRandomItem(FILLER_TEMPLATES);
        return this.getRandomItem(CONDITION_TEMPLATES)(revealedCondition.title, revealedCondition.description);
      }
      case 'alliance': {
        if (!lastMsg) return this.getRandomItem(FILLER_TEMPLATES);
        return this.getRandomItem(ALLIANCE_TEMPLATES)(this.displayName(lastMsg.senderName));
      }
      case 'defense':
      default:
        return this.getRandomItem(DEFENSE_TEMPLATES);
    }
  }

  private buildVoteReasonLine(target: Player): string {
    const revealedCount = this.countRevealed(target);
    const name = this.displayName(target.name);
    if (revealedCount === 0) {
      return this.getRandomItem(VOTE_REASON_NO_CARDS_TEMPLATES)(name);
    }
    return this.getRandomItem(VOTE_REASON_WITH_CARDS_TEMPLATES)(name, revealedCount);
  }

  private buildResultReactionLine(room: RoomState): string {
    if (room.lastExiledPlayerId) {
      const exiled = room.players[room.lastExiledPlayerId];
      if (exiled) return this.getRandomItem(RESULT_EXILED_TEMPLATES)(this.displayName(exiled.name));
    }
    return this.getRandomItem(RESULT_NONE_TEMPLATES);
  }

  private buildHumanReactionLine(humanName: string): string {
    const pool = Math.random() < 0.5 ? HUMAN_REACTION_AGREE_TEMPLATES : HUMAN_REACTION_DISAGREE_TEMPLATES;
    return this.getRandomItem(pool)(this.displayName(humanName));
  }

  // Присваивает боту id портрета из отдельного пространства 'bot-avatar-N'
  // (не пересекается с человеческими 'avatar-N' emoji-иконками в Lobby.tsx).
  // Именованным ботам (BOT_NAMES) портрет закреплён по имени — один и тот
  // же бот всегда выглядит одинаково между партиями; безымянным "Бот #NNN"
  // достаётся портрет по текущему количеству игроков в комнате.
  private pickBotAvatar(botName: string, fallbackIndex: number): string {
    const nameIndex = BOT_NAMES.indexOf(botName);
    const index = nameIndex >= 0 ? nameIndex : fallbackIndex;
    return `bot-avatar-${(index % BOT_AVATAR_COUNT) + 1}`;
  }

  public addBot(room: RoomState, gameEngine: GameEngine): RoomState | null {
    if (room.phase !== 'LOBBY') return null;
    if (Object.keys(room.players).length >= room.maxPlayers) return null;

    const existingNames = new Set(Object.values(room.players).map(p => p.name));
    const availableNames = BOT_NAMES.filter(n => !existingNames.has(n));
    const botName = availableNames.length > 0 ? availableNames[0] : `Бот #${Math.floor(Math.random() * 900 + 100)}`;
    const botId = `bot-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`;

    const botPlayer = {
      id: botId,
      socketId: botId,
      name: botName,
      avatar: this.pickBotAvatar(botName, Object.keys(room.players).length),
      isHost: false,
      isExiled: false,
      cards: {} as any,
      actionCards: [],
      votesCount: 0,
      hasVoted: false,
      audioMuted: false,
      videoOff: true,
      revealedThisRound: false,
      actionCardUsed: false,
      hasImmunity: false,
      voteWeight: 1,
      isConnected: true
    };

    room.players[botId] = botPlayer;
    room.turnOrder.push(botId);
    room.bunkerCapacity = Math.max(1, Math.floor(Object.keys(room.players).length / 2));

    gameEngine['addSystemMessage'](room, `🤖 ${botName} вошел в шлюз как демо-игрок.`);
    return room;
  }

  public fillWithBots(room: RoomState, gameEngine: GameEngine, targetCount = 6): RoomState {
    while (Object.keys(room.players).length < targetCount && Object.keys(room.players).length < room.maxPlayers) {
      this.addBot(room, gameEngine);
    }
    return room;
  }

  // Реакция бота на сообщение живого игрока в чате — создаёт ощущение
  // настоящего диалога, а не параллельных монологов. Вызывается из
  // socketHandler при каждом send_chat от реального игрока.
  public handleHumanChat(room: RoomState, gameEngine: GameEngine, io: Server, humanSenderId: string) {
    if (!room) return;
    if (!['CARD_REVEAL', 'DISCUSSION', 'VOTING'].includes(room.phase)) return;

    const human = room.players[humanSenderId];
    if (!human || human.isExiled || human.id.startsWith('bot-')) return;

    const activeBots = Object.values(room.players).filter(p => p.id.startsWith('bot-') && !p.isExiled);
    if (activeBots.length === 0) return;
    if (Math.random() > 0.45) return;

    const bot = this.getRandomItem(activeBots);
    const delay = 1500 + Math.random() * 1800;

    setTimeout(() => {
      const currentRoom = gameEngine.getRoom(room.code);
      if (!currentRoom) return;
      const currentBot = currentRoom.players[bot.id];
      const currentHuman = currentRoom.players[humanSenderId];
      if (!currentBot || currentBot.isExiled || !currentHuman) return;

      const line = this.buildHumanReactionLine(currentHuman.name);
      gameEngine.addChatMessage(room.code, bot.id, line);
      const updated = gameEngine.getRoom(room.code);
      if (updated) io.to(room.code).emit('room_updated', updated);
    }, delay);
  }

  public handlePhaseAutomation(room: RoomState, gameEngine: GameEngine, io: Server) {
    if (!room) return;
    if (room.phase !== 'VOTING') this.votingScheduled.delete(room.code);

    const activeBots = Object.values(room.players).filter(p => p.id.startsWith('bot-') && !p.isExiled);
    if (activeBots.length === 0) return;

    // 1. CARD_REVEAL Phase
    if (room.phase === 'CARD_REVEAL') {
      activeBots.forEach((bot, idx) => {
        setTimeout(() => {
          const currentRoom = gameEngine.getRoom(room.code);
          if (!currentRoom || currentRoom.phase !== 'CARD_REVEAL') return;

          const currentBot = currentRoom.players[bot.id];
          if (!currentBot || currentBot.isExiled || currentBot.revealedThisRound) return;

          const unrevealedKeys = REVEALABLE_CARD_TYPES.filter(k => currentBot.cards[k] && !currentBot.cards[k].isRevealed);
          if (unrevealedKeys.length > 0) {
            const keyToReveal = this.getRandomItem(unrevealedKeys);
            gameEngine.revealCard(room.code, bot.id, keyToReveal);
            const updated = gameEngine.getRoom(room.code);
            if (updated) io.to(room.code).emit('room_updated', updated);
          }
        }, (idx + 1) * 1200);
      });
    }

    // 2. DISCUSSION Phase — несколько ботов высказываются по очереди
    // (а не один случайный бот раз в раунд), каждый строит реплику из
    // реальных данных партии: своих раскрытых карт, других игроков,
    // катастрофы/бункера, карты "Условие/бонус" или последней реплики в
    // чате — получается что-то похожее на настоящий спор, а не один и
    // тот же набор из 6 заготовленных фраз.
    if (room.phase === 'DISCUSSION') {
      const speakerCount = Math.min(
        activeBots.length,
        activeBots.length <= 4 ? activeBots.length : 3 + Math.floor(Math.random() * 2)
      );
      const speakers = this.shuffle(activeBots).slice(0, speakerCount);

      speakers.forEach((bot, idx) => {
        const delay = 1800 + idx * (2000 + Math.random() * 1000);
        setTimeout(() => {
          const currentRoom = gameEngine.getRoom(room.code);
          if (!currentRoom || currentRoom.phase !== 'DISCUSSION') return;

          const currentBot = currentRoom.players[bot.id];
          if (!currentBot || currentBot.isExiled) return;

          const line = this.buildDiscussionLine(currentBot, currentRoom);
          gameEngine.addChatMessage(room.code, bot.id, line);
          const updated = gameEngine.getRoom(room.code);
          if (updated) io.to(room.code).emit('room_updated', updated);
        }, delay);
      });
    }

    // 3. VOTING Phase — голосует и в большинстве случаев объясняет выбор
    // в чате (со ссылкой на реальное число раскрытых карт цели).
    // votingScheduled не даёт повторно расставить эти же таймеры на
    // каждый отдельный cast_vote, пока фаза не сменится.
    if (room.phase === 'VOTING') {
      if (this.votingScheduled.has(room.code)) return;
      this.votingScheduled.add(room.code);

      const eligibleTargets = Object.values(room.players).filter(p => !p.isExiled);

      activeBots.forEach((bot, idx) => {
        setTimeout(() => {
          const currentRoom = gameEngine.getRoom(room.code);
          if (!currentRoom || currentRoom.phase !== 'VOTING') return;

          const currentBot = currentRoom.players[bot.id];
          if (!currentBot || currentBot.isExiled || currentBot.hasVoted) return;

          const otherTargets = eligibleTargets.filter(p => p.id !== bot.id);
          if (otherTargets.length === 0) return;

          const target = this.getRandomItem(otherTargets);
          gameEngine.castVote(room.code, bot.id, target.id);
          const updated = gameEngine.getRoom(room.code);
          if (updated) io.to(room.code).emit('room_updated', updated);

          // If THIS bot's vote was the one that completed the round (the
          // human host doesn't always cast the deciding vote), the phase
          // just flipped to VOTE_RESULTS — re-run automation so the
          // "reaction to the outcome" branch below actually fires instead
          // of only triggering when a human happens to cast the last vote.
          if (updated && updated.phase === 'VOTE_RESULTS') {
            this.handlePhaseAutomation(updated, gameEngine, io);
          }

          if (Math.random() < 0.7) {
            setTimeout(() => {
              const reasonRoom = gameEngine.getRoom(room.code);
              if (!reasonRoom) return;
              const targetNow = reasonRoom.players[target.id];
              if (!targetNow) return;

              const reason = this.buildVoteReasonLine(targetNow);
              gameEngine.addChatMessage(room.code, bot.id, reason);
              const reasonUpdated = gameEngine.getRoom(room.code);
              if (reasonUpdated) io.to(room.code).emit('room_updated', reasonUpdated);
            }, 400 + Math.random() * 700);
          }
        }, (idx + 1) * 1500);
      });
    }

    // 4. VOTE_RESULTS Phase — один бот комментирует итог голосования.
    if (room.phase === 'VOTE_RESULTS') {
      const bot = this.getRandomItem(activeBots);
      setTimeout(() => {
        const currentRoom = gameEngine.getRoom(room.code);
        if (!currentRoom || currentRoom.phase !== 'VOTE_RESULTS') return;

        const currentBot = currentRoom.players[bot.id];
        if (!currentBot || currentBot.isExiled) return;

        const line = this.buildResultReactionLine(currentRoom);
        gameEngine.addChatMessage(room.code, bot.id, line);
        const updated = gameEngine.getRoom(room.code);
        if (updated) io.to(room.code).emit('room_updated', updated);
      }, 1500);
    }
  }
}

export const botManager = new BotManager();
