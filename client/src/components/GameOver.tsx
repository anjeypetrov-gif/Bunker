import React from 'react';
import { Trophy, Skull, Home, RefreshCw } from './icons';
import { RoomState } from '../types/game';

interface GameOverProps {
  room: RoomState;
  currentSocketId: string;
  onRestart: () => void;
}

export const GameOver: React.FC<GameOverProps> = ({
  room,
  currentSocketId,
  onRestart
}) => {
  const isHost = room.hostId === currentSocketId;
  const survivors = Object.values(room.players).filter(p => !p.isExiled);
  const exiled = Object.values(room.players).filter(p => p.isExiled);

  // Evaluate survival chance based on professions
  const professionsList = survivors.map(p => p.cards.profession?.title || '');
  const hasDoctor = professionsList.some(p => p.includes('Врач') || p.includes('хирург') || p.includes('доктор'));
  const hasEngineer = professionsList.some(p => p.includes('Инженер') || p.includes('Сантехник') || p.includes('Механик') || p.includes('Строитель'));
  const hasAgronomist = professionsList.some(p => p.includes('Агроном') || p.includes('Биолог') || p.includes('Повар'));

  let survivalChance = 50;
  if (hasDoctor) survivalChance += 20;
  if (hasEngineer) survivalChance += 15;
  if (hasAgronomist) survivalChance += 15;
  if (survivors.length < room.bunkerCapacity) survivalChance -= 20;
  survivalChance = Math.min(99, Math.max(10, survivalChance));

  return (
    <div className="max-w-4xl mx-auto my-8 p-6 bg-slate-900 border border-slate-800 notch shadow-2xl space-y-6">
      <div className="text-center space-y-2 border-b border-slate-800 pb-6">
        <div className="inline-flex p-4 bg-amber-500/10 border border-amber-500/30 notch mb-2 bunker-glow">
          <Trophy className="w-12 h-12 text-amber-400" />
        </div>
        <h1 className="text-3xl font-black text-slate-100 tracking-wider uppercase font-display">
          БУНКЕР УСПЕШНО ЗАПЕЧАТАН!
        </h1>
        <p className="text-sm text-slate-400 font-mono">
          Двери закрыты. Группа изоляции готова к выживанию в течение {room.catastrophe?.durationYears || 10} лет.
        </p>
      </div>

      {/* Survival Rating Card */}
      <div className="bg-slate-950 p-6 notch border border-slate-800 text-center space-y-3">
        <div className="text-xs font-mono text-slate-400 uppercase tracking-widest">
          ШАНС НА ВОЗРОЖДЕНИЕ ЧЕЛОВЕЧЕСТВА
        </div>
        <div className="text-5xl font-black font-mono text-amber-400">
          {survivalChance}%
        </div>
        <div className="flex justify-center gap-4 text-xs font-mono text-slate-400 pt-2">
          <span>Врачебный уход: <strong className={hasDoctor ? 'text-emerald-400' : 'text-red-400'}>{hasDoctor ? 'ЕСТЬ' : 'НЕТ'}</strong></span>
          <span>Инженерный блок: <strong className={hasEngineer ? 'text-emerald-400' : 'text-red-400'}>{hasEngineer ? 'ЕСТЬ' : 'НЕТ'}</strong></span>
          <span>Продовольствие: <strong className={hasAgronomist ? 'text-emerald-400' : 'text-red-400'}>{hasAgronomist ? 'ЕСТЬ' : 'НЕТ'}</strong></span>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Survivors inside */}
        <div className="bg-emerald-950/20 border border-emerald-900/40 p-4 notch-sm space-y-3">
          <h3 className="text-xs font-bold text-emerald-400 uppercase tracking-wider flex items-center gap-2">
            <Home className="w-4 h-4" /> В БУНКЕРЕ ({survivors.length})
          </h3>
          <div className="space-y-2">
            {survivors.map(p => (
              <div key={p.id} className="p-3 bg-slate-900 notch-sm border border-slate-800 text-xs space-y-1">
                <div className="font-bold text-white text-sm flex items-center justify-between">
                  <span>{p.name}</span>
                  <span className="text-[10px] text-emerald-400 font-mono">ВЫЖИЛ</span>
                </div>
                <div className="text-slate-400">Профессия: <span className="text-amber-300 font-semibold">{p.cards.profession?.title}</span></div>
                <div className="text-slate-400">Здоровье: <span className="text-slate-200">{p.cards.health?.title}</span></div>
                <div className="text-slate-400">Багаж: <span className="text-amber-200">{p.cards.baggage?.title}</span></div>
              </div>
            ))}
          </div>
        </div>

        {/* Exiled outside */}
        <div className="bg-red-950/20 border border-red-900/40 p-4 notch-sm space-y-3">
          <h3 className="text-xs font-bold text-red-400 uppercase tracking-wider flex items-center gap-2">
            <Skull className="w-4 h-4" /> ИЗГНАНО СНАРУЖИ ({exiled.length})
          </h3>
          <div className="space-y-2">
            {exiled.map(p => (
              <div key={p.id} className="p-3 bg-slate-900/60 notch-sm border border-slate-800/80 text-xs space-y-1 opacity-75">
                <div className="font-bold text-slate-300 text-sm flex items-center justify-between">
                  <span>{p.name}</span>
                  <span className="text-[10px] text-red-400 font-mono">ИЗГНАН</span>
                </div>
                <div className="text-slate-400">Профессия: <span className="text-slate-300">{p.cards.profession?.title}</span></div>
                <div className="text-slate-400">Здоровье: <span className="text-slate-300">{p.cards.health?.title}</span></div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {isHost && (
        <div className="pt-4 border-t border-slate-800 text-center">
          <button
            onClick={onRestart}
            className="py-4 px-8 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold notch shadow-lg shadow-amber-500/30 inline-flex items-center gap-3 uppercase tracking-wider text-sm transition-all cursor-pointer"
          >
            <RefreshCw className="w-5 h-5" /> СЫГРАТЬ ЕЩЕ РАЗ
          </button>
        </div>
      )}
    </div>
  );
};
