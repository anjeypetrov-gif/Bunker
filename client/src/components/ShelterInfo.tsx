import React, { useEffect, useState } from 'react';
import { AlertTriangle, Home, Clock, ArrowRight, ShieldAlert } from './icons';
import { RoomState } from '../types/game';

interface ShelterInfoProps {
  room: RoomState;
  currentSocketId: string;
  onAdvancePhase: () => void;
}

export const ShelterInfo: React.FC<ShelterInfoProps> = ({
  room,
  currentSocketId,
  onAdvancePhase
}) => {
  const [timeLeft, setTimeLeft] = useState(room.turnDuration);

  useEffect(() => {
    setTimeLeft(room.turnDuration);
    const interval = setInterval(() => {
      setTimeLeft(prev => (prev > 0 ? prev - 1 : 0));
    }, 1000);
    return () => clearInterval(interval);
  }, [room.phase, room.currentRound, room.turnDuration]);

  const isHost = room.hostId === currentSocketId;
  const activePlayers = Object.values(room.players).filter(p => !p.isExiled);
  const totalActive = activePlayers.length;
  const revealedCount = room.revealedCountInRound || 0;

  const phaseTitles: Record<string, string> = {
    LOBBY: 'ОЖИДАНИЕ В ЛОББИ',
    INTRO: 'КАТАСТРОФА И БУНКЕР',
    CARD_REVEAL: `РАУНД ${room.currentRound}: РАСКРЫТИЕ ХАРАКТЕРИСТИК`,
    DISCUSSION: `РАУНД ${room.currentRound}: ОБСУЖДЕНИЕ И АРГУМЕНТАЦИЯ`,
    VOTING: `РАУНД ${room.currentRound}: ГОЛОСОВАНИЕ НА ИЗГНАНИЕ`,
    VOTE_RESULTS: 'ИТОГИ ГОЛОСОВАНИЯ',
    GAME_OVER: 'ИТОГ МИССИИ БУНКЕРА'
  };

  return (
    <div className="bg-slate-900/90 border border-slate-800 notch p-4 shadow-xl space-y-4">
      {/* Top Banner: Phase & Host Action */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-3 bg-slate-950/80 p-3 notch-sm border border-slate-800">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-amber-500/10 border border-amber-500/30 notch-sm text-amber-400 font-bold">
            <ShieldAlert className="w-6 h-6" />
          </div>
          <div>
            <div className="text-[10px] font-mono text-slate-400 uppercase tracking-widest">ТЕКУЩАЯ СТАДИЯ ИГРЫ</div>
            <h2 className="text-base font-black text-slate-100 tracking-wider font-display">
              {phaseTitles[room.phase] || room.phase}
            </h2>
          </div>
        </div>

        <div className="flex items-center gap-4">
          {room.phase === 'CARD_REVEAL' && (
            <div className="flex items-center gap-2 font-mono bg-slate-900 px-3 py-1.5 notch-sm border border-slate-800 text-xs text-slate-300">
              <span>ОТКРЫТО КАРТ:</span>
              <span className="text-amber-400 font-bold">{revealedCount} / {totalActive}</span>
            </div>
          )}

          {/* Speech Timer */}
          <div className="flex items-center gap-2 font-mono bg-slate-900 px-3 py-1.5 notch-sm border border-slate-800">
            <Clock className="w-4 h-4 text-amber-400" />
            <span className="text-sm font-bold text-amber-400">{timeLeft}s</span>
          </div>

          {/* Host Next Phase Control */}
          {isHost && room.phase !== 'GAME_OVER' && (
            <button
              onClick={onAdvancePhase}
              className="py-2 px-4 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs uppercase tracking-wider notch-sm shadow-md shadow-amber-500/20 flex items-center gap-2 transition-all cursor-pointer"
            >
              <span>СЛЕДУЮЩИЙ ЭТАП</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {/* Catastrophe & Shelter Detail Row */}
      {room.catastrophe && room.shelter && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs font-mono">
          {/* Catastrophe Card */}
          <div className="bg-red-950/20 border border-red-900/40 p-3 notch-sm space-y-1">
            <div className="flex items-center gap-2 text-red-400 font-bold uppercase tracking-wider">
              <AlertTriangle className="w-4 h-4" /> КАТАСТРОФА: {room.catastrophe.title}
            </div>
            <p className="text-slate-300 leading-relaxed font-sans">{room.catastrophe.description}</p>
            <div className="flex items-center gap-4 text-[11px] text-slate-400 pt-1">
              <span>Разрушения: <strong className="text-red-400">{room.catastrophe.destructionPercent}%</strong></span>
              <span>Выжило: <strong className="text-amber-400">{room.catastrophe.survivorsPercent}%</strong></span>
              <span>Срок изол.: <strong className="text-amber-400">{room.catastrophe.durationYears} лет</strong></span>
            </div>
          </div>

          {/* Shelter Card */}
          <div className="bg-emerald-950/20 border border-emerald-900/40 p-3 notch-sm space-y-1">
            <div className="flex items-center justify-between text-emerald-400 font-bold uppercase tracking-wider">
              <span className="flex items-center gap-2"><Home className="w-4 h-4" /> БУНКЕР: {room.shelter.title}</span>
              <span className="text-xs bg-emerald-500/20 border border-emerald-500/30 text-emerald-300 px-2 py-0.5 notch-sm">
                МЕСТ: {room.bunkerCapacity}
              </span>
            </div>
            <p className="text-slate-300 leading-relaxed font-sans">{room.shelter.description}</p>
            <div className="flex flex-wrap items-center gap-2 text-[11px] text-slate-400 pt-1">
              <span>Оснащение: <strong className="text-emerald-300">{room.shelter.equipment.slice(0, 2).join(', ')}</strong></span>
              <span>Осталось в живых: <strong className="text-white font-bold">{activePlayers.length}</strong></span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
