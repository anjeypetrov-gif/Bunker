import { useEffect, useRef, useState } from 'react';
import { RoomState } from '../types/game';

/**
 * Секунды, оставшиеся у текущего выступающего. Сервер присылает
 * speechRemainingMs в каждом room_updated; между обновлениями считаем
 * локально по performance.now(), так что часы клиента не важны.
 */
export function useSpeechClock(room: RoomState): number {
  const base = useRef({ ms: room.speechRemainingMs ?? 0, at: performance.now() });
  const [, force] = useState(0);

  useEffect(() => {
    base.current = { ms: room.speechRemainingMs ?? 0, at: performance.now() };
    force(n => n + 1);
  }, [room.speechRemainingMs, room.speakerId, room.phase, room.paused]);

  useEffect(() => {
    if (room.phase !== 'DISCUSSION' || !room.speakerId || room.paused) return;
    const t = setInterval(() => force(n => n + 1), 250);
    return () => clearInterval(t);
  }, [room.phase, room.speakerId, room.paused]);

  if (room.phase !== 'DISCUSSION' || !room.speakerId) return 0;
  const left = room.paused ? base.current.ms : base.current.ms - (performance.now() - base.current.at);
  return Math.max(0, Math.ceil(left / 1000));
}
