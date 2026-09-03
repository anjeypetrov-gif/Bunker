// Портреты для ботов-демо-игроков. Vite отдаёт client/public/avatars/bots/
// как есть, поэтому путь — просто /avatars/bots/<файл>.
//
// Идентификаторы (bot-avatar-1 .. bot-avatar-10) назначаются ботам на
// сервере в server/src/game/BotManager.ts — там же захардкожено число 10
// (BOT_AVATAR_COUNT), которое должно совпадать с длиной этого списка. Если
// добавляете новые портреты — обновите оба места.
//
// Пространство id намеренно отделено от человеческих 'avatar-1'..'avatar-6'
// (эмодзи-иконки в Lobby.tsx), чтобы не путать выбор игрока с портретом бота.

const BASE = '/avatars/bots/';

const BOT_AVATAR_FILES: Record<string, string> = {
  'bot-avatar-1': 'bot-avatar-1.jpg',
  'bot-avatar-2': 'bot-avatar-2.jpg',
  'bot-avatar-3': 'bot-avatar-3.jpg',
  'bot-avatar-4': 'bot-avatar-4.jpg',
  'bot-avatar-5': 'bot-avatar-5.jpg',
  'bot-avatar-6': 'bot-avatar-6.jpg',
  'bot-avatar-7': 'bot-avatar-7.jpg',
  'bot-avatar-8': 'bot-avatar-8.jpg',
  'bot-avatar-9': 'bot-avatar-9.jpg',
  'bot-avatar-10': 'bot-avatar-10.jpg'
};

/** Returns the /avatars/bots/... URL for a bot's portrait, or null if
 * `avatarId` isn't a bot avatar (e.g. a human player's 'avatar-N' pick). */
export function getBotAvatarArt(avatarId?: string): string | null {
  if (!avatarId) return null;
  const file = BOT_AVATAR_FILES[avatarId];
  return file ? BASE + file : null;
}
