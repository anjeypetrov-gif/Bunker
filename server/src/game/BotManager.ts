import { Server } from 'socket.io';
import { GameEngine } from './GameEngine';
import { RoomState, CardType } from '../types/game';

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

const BOT_SPEECHES = [
  'У меня важная профессия для замкнутого цикла бункера, я необходим группе!',
  'Посмотрите на мое состояние здоровья — я смогу выдерживать физические нагрузки.',
  'У меня в багаже полезные предметы для системы фильтрации воды.',
  'Предлагаю изгнать тех, у кого скрыты ключевые характеристики!',
  'Бункеру нужен медик и техник, давайте головать рационально.',
  'Я готов работать по 12 часов в сутки на благо убежища.'
];

export class BotManager {
  private getRandomItem<T>(arr: T[]): T {
    return arr[Math.floor(Math.random() * arr.length)];
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
      avatar: `avatar-${(Object.keys(room.players).length % 6) + 1}`,
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

  public handlePhaseAutomation(room: RoomState, gameEngine: GameEngine, io: Server) {
    if (!room) return;

    const activeBots = Object.values(room.players).filter(p => p.id.startsWith('bot-') && !p.isExiled);
    if (activeBots.length === 0) return;

    // 1. CARD_REVEAL Phase
    if (room.phase === 'CARD_REVEAL') {
      const cardTypes: CardType[] = ['profession', 'health', 'biology', 'hobby', 'trait', 'baggage', 'secret'];

      activeBots.forEach((bot, idx) => {
        setTimeout(() => {
          const currentRoom = gameEngine.getRoom(room.code);
          if (!currentRoom || currentRoom.phase !== 'CARD_REVEAL') return;

          const currentBot = currentRoom.players[bot.id];
          if (!currentBot || currentBot.isExiled || currentBot.revealedThisRound) return;

          // Find an unrevealed card
          const unrevealedKeys = cardTypes.filter(k => currentBot.cards[k] && !currentBot.cards[k].isRevealed);
          if (unrevealedKeys.length > 0) {
            const keyToReveal = this.getRandomItem(unrevealedKeys);
            gameEngine.revealCard(room.code, bot.id, keyToReveal);
            io.to(room.code).emit('room_updated', currentRoom);
          }
        }, (idx + 1) * 1200);
      });
    }

    // 2. DISCUSSION Phase
    if (room.phase === 'DISCUSSION') {
      const bot = this.getRandomItem(activeBots);
      if (bot) {
        setTimeout(() => {
          const speech = this.getRandomItem(BOT_SPEECHES);
          gameEngine.addChatMessage(room.code, bot.id, speech);
          const updated = gameEngine.getRoom(room.code);
          if (updated) io.to(room.code).emit('room_updated', updated);
        }, 2000);
      }
    }

    // 3. VOTING Phase
    if (room.phase === 'VOTING') {
      const eligibleTargets = Object.values(room.players).filter(p => !p.isExiled);

      activeBots.forEach((bot, idx) => {
        setTimeout(() => {
          const currentRoom = gameEngine.getRoom(room.code);
          if (!currentRoom || currentRoom.phase !== 'VOTING') return;

          const currentBot = currentRoom.players[bot.id];
          if (!currentBot || currentBot.isExiled || currentBot.hasVoted) return;

          // Pick target other than self
          const otherTargets = eligibleTargets.filter(p => p.id !== bot.id);
          if (otherTargets.length > 0) {
            const target = this.getRandomItem(otherTargets);
            gameEngine.castVote(room.code, bot.id, target.id);
            const updated = gameEngine.getRoom(room.code);
            if (updated) io.to(room.code).emit('room_updated', updated);
          }
        }, (idx + 1) * 1500);
      });
    }
  }
}

export const botManager = new BotManager();
