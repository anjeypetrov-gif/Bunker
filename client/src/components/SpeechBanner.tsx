import React, { useEffect, useRef } from 'react';
import { RoomState } from '../types/game';
import { Clock } from './icons';

interface Props {
  room: RoomState;
  currentSocketId: string;
  secondsLeft: number;
  onEndSpeech: () => void;
}

function beep(freq: number, ms: number) {
  try {
    const Ctx = window.AudioContext || (window as any).webkitAudioContext;
    const ctx = new Ctx();
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.frequency.value = freq;
    g.gain.value = 0.08;
    o.connect(g); g.connect(ctx.destination);
    o.start();
    setTimeout(() => { o.stop(); ctx.close(); }, ms);
  } catch { /* звук необязателен */ }
}

export const SpeechBanner: React.FC<Props> = ({ room, currentSocketId, secondsLeft, onEndSpeech }) => {
  const speaker = room.speakerId ? room.players[room.speakerId] : null;
  const isMe = room.speakerId === currentSocketId;
  const total = Math.max(1, room.speechDuration || room.turnDuration || 1);
  const pct = Math.min(100, Math.max(0, (secondsLeft / total) * 100));
  const danger = secondsLeft <= 5;
  const queueLeft = (room.speakerQueue || []).length;
  const lastBeep = useRef<number>(-1);

  // Ваш ход: один сигнал при начале, и по тику на последних 3 секундах.
  useEffect(() => {
    if (!isMe) { lastBeep.current = -1; return; }
    if (lastBeep.current === -1) beep(880, 250);
    if (secondsLeft <= 3 && secondsLeft > 0 && lastBeep.current !== secondsLeft) beep(520, 120);
    lastBeep.current = secondsLeft;
  }, [isMe, secondsLeft, room.speakerId]);

  if (room.phase !== 'DISCUSSION' || !speaker) return null;

  return (
    <div
      className={`shrink-0 mx-2.5 mt-2 p-2 md:p-2.5 notch-sm border font-mono transition-colors ${
        isMe
          ? danger ? 'bg-red-950/60 border-red-500/70' : 'bg-amber-500/15 border-amber-400/70'
          : 'bg-slate-900/90 border-slate-700'
      }`}
    >
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="text-[10px] uppercase tracking-wider text-slate-400">
            {isMe ? 'ВАШЕ СЛОВО' : 'ГОВОРИТ'}
            {queueLeft > 0 && <span className="ml-2 text-slate-500">· дальше: {queueLeft}</span>}
          </div>
          <div className={`text-sm md:text-base font-black truncate ${isMe ? 'text-amber-300' : 'text-slate-100'}`}>
            {speaker.name}
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <div className={`flex items-center gap-1.5 ${danger ? 'text-red-400 animate-pulse' : 'text-amber-400'}`}>
            <Clock className="w-4 h-4" />
            <span className="text-2xl md:text-3xl font-black tabular-nums leading-none">{secondsLeft}</span>
          </div>
          {(isMe || room.hostId === currentSocketId) && (
            <button
              onClick={onEndSpeech}
              className="px-3 py-2 notch-sm bg-amber-500 hover:bg-amber-400 text-slate-950 text-[11px] font-black uppercase cursor-pointer"
            >
              {isMe ? 'Закончил' : 'Пропустить'}
            </button>
          )}
        </div>
      </div>
      <div className="mt-2 h-1.5 bg-slate-800 overflow-hidden">
        <div
          className={`h-full transition-[width] duration-300 ${danger ? 'bg-red-500' : 'bg-amber-400'}`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
};
