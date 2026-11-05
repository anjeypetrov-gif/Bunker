import React, { useEffect, useState } from 'react';
import { RoomState } from '../types/game';
import { sfx } from '../utils/sfx';

/** Драматичное раскрытие итогов голосования: голоса по одному, затем вердикт. */
export const VoteReveal: React.FC<{ room: RoomState }> = ({ room }) => {
  const key = `${room.currentRound}`;
  const [dismissed, setDismissed] = useState('');
  const [shown, setShown] = useState(0);
  const [verdict, setVerdict] = useState(false);

  const rows = Object.values(room.players)
    .filter(p => (p.votesCount || 0) > 0)
    .sort((a, b) => (a.votesCount || 0) - (b.votesCount || 0));
  const maxVotes = Math.max(1, ...rows.map(r => r.votesCount || 0));
  const votersOf = (id: string) =>
    Object.entries(room.votes || {}).filter(([, t]) => t === id).map(([v]) => room.players[v]?.name).filter(Boolean) as string[];
  const exiled = room.lastExiledPlayerId ? room.players[room.lastExiledPlayerId] : null;

  const active = room.phase === 'VOTE_RESULTS' && dismissed !== key;

  useEffect(() => {
    if (!active) { setShown(0); setVerdict(false); return; }
    setShown(0); setVerdict(false);
    let i = 0;
    const timers: number[] = [];
    const step = () => {
      if (i < rows.length) {
        i += 1; setShown(i); sfx.vote();
        timers.push(window.setTimeout(step, 1300));
      } else {
        timers.push(window.setTimeout(() => { setVerdict(true); sfx.gong(); }, 900));
      }
    };
    timers.push(window.setTimeout(step, 800));
    return () => timers.forEach(clearTimeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, key]);

  if (!active) return null;

  return (
    <div className="fixed inset-0 z-[90] bg-black/85 backdrop-blur-sm flex items-center justify-center p-4" onClick={() => verdict && setDismissed(key)}>
      <div className="w-full max-w-md space-y-4 font-mono" onClick={e => e.stopPropagation()}>
        <div className="text-center text-xs tracking-[0.3em] text-slate-400">ИТОГИ ГОЛОСОВАНИЯ{room.secretVoting !== false && <span className="block mt-1 text-[10px] tracking-widest text-slate-500">ТАЙНОЕ ГОЛОСОВАНИЕ</span>}</div>
        <div className="space-y-2">
          {rows.map((p, idx) => (
            <div
              key={p.id}
              className={`p-3 border notch-sm transition-all duration-500 ${idx < shown ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-3'} ${
                verdict && exiled?.id === p.id ? 'border-red-500 bg-red-950/50' : 'border-slate-700 bg-slate-900/80'
              }`}
            >
              <div className="flex items-center justify-between text-sm">
                <span className="font-bold text-slate-100">{p.name}</span>
                <span className="text-amber-300 font-black text-lg">{p.votesCount}</span>
              </div>
              <div className="mt-1.5 h-1.5 bg-slate-800 overflow-hidden">
                <div className="h-full bg-amber-400 transition-all duration-700" style={{ width: idx < shown ? `${((p.votesCount || 0) / maxVotes) * 100}%` : '0%' }} />
              </div>
              {room.secretVoting === false && <div className="mt-1 text-[10px] text-slate-500 truncate">{votersOf(p.id).join(', ')}</div>}
            </div>
          ))}
          {rows.length === 0 && <div className="text-center text-slate-500 text-sm py-4">Голосов не было</div>}
        </div>
        {verdict && (
          <div className="text-center space-y-3">
            <div className={`text-2xl md:text-3xl font-black uppercase tracking-wider ${exiled ? 'text-red-400' : 'text-emerald-400'}`}>
              {exiled ? `${exiled.name} изгнан` : 'Никто не изгнан'}
            </div>
            <button onClick={() => setDismissed(key)} className="px-5 py-2.5 notch-sm bg-amber-500 hover:bg-amber-400 text-slate-950 font-black text-xs uppercase cursor-pointer">
              Продолжить
            </button>
          </div>
        )}
        {!verdict && (
          <div className="text-center">
            <button onClick={() => setDismissed(key)} className="text-[11px] text-slate-500 hover:text-slate-300 cursor-pointer underline">Пропустить</button>
          </div>
        )}
      </div>
    </div>
  );
};
