import React, { useEffect, useState } from 'react';
import { RoomState } from '../types/game';

/** Событие раунда: показывается со 2-го раунда над игровой областью. */
export const EventBanner: React.FC<{ room: RoomState }> = ({ room }) => {
  const ev = room.roundEvent;
  const key = ev ? `${room.currentRound}:${ev.title}` : '';
  const [hidden, setHidden] = useState('');
  useEffect(() => { setHidden(''); }, [key]);
  if (!ev || hidden === key) return null;
  if (!['CARD_REVEAL', 'DISCUSSION', 'VOTING'].includes(room.phase)) return null;
  return (
    <div className="shrink-0 mx-2.5 mt-2 p-2 notch-sm border border-red-500/40 bg-red-950/30 text-[11px] md:text-xs font-sans text-red-100 flex items-start gap-2">
      <span className="text-red-300 font-black font-mono shrink-0">⚠ СОБЫТИЕ</span>
      <span className="flex-1 leading-snug">
        <b className="text-red-200">{ev.title}.</b> {ev.desc}{' '}
        <span className="text-red-300/80">Пригодятся: {ev.needs}.</span>
      </span>
      <button onClick={() => setHidden(key)} className="shrink-0 text-red-300 font-mono cursor-pointer" title="Скрыть">✕</button>
    </div>
  );
};
