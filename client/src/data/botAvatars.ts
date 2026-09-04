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
//
// Помимо статичного jpg у каждого бота есть зацикленное 60-секундное видео
// (плавный zoom-in/zoom-out «дыхание» + лёгкий шум/виньетка под стиль камеры
// видеонаблюдения) — используется как «живая» замена статичному кадру на
// плитках видео-грида. jpg остаётся: он служит poster-кадром видео (виден,
// пока видео грузится) и фолбэком в лобби/на случай ошибки загрузки видео.
//
// Формат — два файла на бота, не один: headless/некоторые сборки Chromium
// (и не только — лицензионные ограничения H.264 бьют по части браузеров/ОС)
// не умеют декодировать H.264, только патентно-свободные кодеки. Поэтому
// webm/VP9 идёт первым источником (компактнее, работает в Chrome/Firefox/
// Edge), а mp4/H.264 — вторым, как фолбэк для Safari, который наоборот часто
// не тянет VP9. <video> сам выбирает первый поддерживаемый <source>.

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

const BOT_IDS = Object.keys(BOT_AVATAR_FILES);

/** Returns the /avatars/bots/... URL for a bot's portrait, or null if
 * `avatarId` isn't a bot avatar (e.g. a human player's 'avatar-N' pick). */
export function getBotAvatarArt(avatarId?: string): string | null {
  if (!avatarId) return null;
  const file = BOT_AVATAR_FILES[avatarId];
  return file ? BASE + file : null;
}

export interface BotAvatarVideoSources {
  webm: string;
  mp4: string;
}

/** Returns the {webm, mp4} URLs for a bot's looping "живой" video, or null
 * if `avatarId` isn't a bot avatar. Both files share the same basename as
 * the jpg — see the format note above for why there are two. */
export function getBotAvatarVideo(avatarId?: string): BotAvatarVideoSources | null {
  if (!avatarId || !BOT_IDS.includes(avatarId)) return null;
  return { webm: `${BASE}${avatarId}.webm`, mp4: `${BASE}${avatarId}.mp4` };
}
