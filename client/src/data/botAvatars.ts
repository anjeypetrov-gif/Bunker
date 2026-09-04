// Портреты/анимации для ботов-демо-игроков. Vite отдаёт
// client/public/avatars/bots/ как есть, поэтому путь — просто
// /avatars/bots/<файл>.
//
// Идентификаторы (bot-avatar-1 .. bot-avatar-17) назначаются ботам на
// сервере в server/src/game/BotManager.ts — там же захардкожено число 17
// (BOT_AVATAR_COUNT), которое должно совпадать с длиной этого списка. Если
// добавляете новые аватары — обновите оба места.
//
// Пространство id намеренно отделено от человеческих 'avatar-1'..'avatar-6'
// (эмодзи-иконки в Lobby.tsx), чтобы не путать выбор игрока с портретом бота.
//
// Каждый бот-аватар — короткий зацикленный видеоролик (предоставлен
// пользователем, 09.09) + статичный кадр-постер на то время, пока видео
// ещё не загрузилось, и на случай, если видео не воспроизведётся (старые
// браузеры, сетевые проблемы). Отдаются два формата видео — webm (VP9) и
// mp4 (H.264) — потому что не все браузеры декодируют оба: обычный
// Chrome/Edge поддерживает H.264, но некоторые сборки Chromium (и
// headless-тесты) — только VP9; Safari почти всегда поддерживает H.264, но
// не всегда VP9. <video> сам выбирает первый поддерживаемый <source>.

const BASE = '/avatars/bots/';

const BOT_AVATAR_IDS = Array.from({ length: 17 }, (_, i) => `bot-avatar-${i + 1}`);

interface BotAvatarVideo {
  webm: string;
  mp4: string;
  poster: string;
}

const BOT_AVATAR_VIDEO: Record<string, BotAvatarVideo> = Object.fromEntries(
  BOT_AVATAR_IDS.map(id => [
    id,
    { webm: `${BASE}${id}.webm`, mp4: `${BASE}${id}.mp4`, poster: `${BASE}${id}.jpg` }
  ])
);

/** Returns the /avatars/bots/... poster (still-frame) URL for a bot's
 * avatar, or null if `avatarId` isn't a bot avatar (e.g. a human player's
 * 'avatar-N' pick). Used as the <video> poster and as the plain-<img>
 * fallback if video playback fails. */
export function getBotAvatarArt(avatarId?: string): string | null {
  if (!avatarId) return null;
  const entry = BOT_AVATAR_VIDEO[avatarId];
  return entry ? entry.poster : null;
}

/** Returns the looping-video sources for a bot's avatar, or null if
 * `avatarId` isn't a bot avatar. */
export function getBotAvatarVideo(avatarId?: string): BotAvatarVideo | null {
  if (!avatarId) return null;
  return BOT_AVATAR_VIDEO[avatarId] ?? null;
}
