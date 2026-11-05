import React from 'react';
import { RoomState } from '../types/game';

interface Props {
  room: RoomState;
  currentSocketId: string;
  onStart: () => void;
  onVote: (optionId: string) => void;
  onResolve: () => void;
  onNext: () => void;
}

const OUTCOME = {
  great: { label: 'УСПЕХ', cls: 'text-emerald-400 border-emerald-500/40' },
  ok: { label: 'С ПОТЕРЯМИ', cls: 'text-amber-300 border-amber-500/40' },
  bad: { label: 'ПРОВАЛ', cls: 'text-red-400 border-red-500/40' }
} as const;

/** «Продолжить род»: поколения прошедших в бункер. */
export const LineagePanel: React.FC<Props> = ({ room, currentSocketId, onStart, onVote, onResolve, onNext }) => {
  const isHost = room.hostId === currentSocketId;
  const l = room.lineage;
  const survivors = Object.values(room.players).filter(p => !p.isExiled);

  if (!l) {
    if (!survivors.length) return null;
    return (
      <div className="bg-slate-950 p-5 notch border border-amber-500/30 text-center space-y-3">
        <div className="text-xs font-mono text-amber-400 uppercase tracking-widest">ПРОДОЛЖИТЬ РОД</div>
        <p className="text-sm text-slate-300 leading-relaxed max-w-xl mx-auto">
          Бункер закрыт, но история не закончена. Прошедшие в бункер проживут несколько поколений: перед ними встанут кризисы, и судьбу рода решат их карты и ваши решения.
        </p>
        {isHost ? (
          <button onClick={onStart} className="py-3 px-6 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold notch inline-flex items-center gap-2 uppercase tracking-wider text-xs cursor-pointer">
            Начать новое поколение
          </button>
        ) : (
          <p className="text-xs text-slate-500 font-mono">Ждём, когда организатор запустит продолжение...</p>
        )}
      </div>
    );
  }

  const imAlive = l.survivorIds.includes(currentSocketId);
  const myVote = l.votes[currentSocketId];
  const voted = l.survivorIds.filter(id => !!l.votes[id]).length;
  const last = l.history[l.history.length - 1];
  const finished = l.step === 'DONE';

  return (
    <div className="bg-slate-950 p-5 notch border border-amber-500/30 space-y-4">
      <div className="flex items-center justify-between font-mono text-xs">
        <span className="text-amber-400 uppercase tracking-widest">ПРОДОЛЖИТЬ РОД</span>
        <span className="text-slate-400">Поколение {Math.min(l.generation, l.maxGenerations)} из {l.maxGenerations} · Численность: <strong className="text-slate-100">{l.population}</strong></span>
      </div>

      {l.step === 'CHOOSE' && l.event && (
        <div className="space-y-3">
          <div>
            <div className="text-lg font-black text-slate-100 uppercase font-display">{l.event.title}</div>
            <p className="text-sm text-slate-300">{l.event.desc}</p>
          </div>
          <div className="grid gap-2">
            {l.event.options.map(o => (
              <button
                key={o.id}
                disabled={!imAlive || !!myVote}
                onClick={() => onVote(o.id)}
                className={`text-left p-3 border notch-sm transition-colors ${
                  myVote === o.id ? 'border-amber-400 bg-amber-500/10' : 'border-slate-700 bg-slate-900 hover:border-amber-500/50'
                } ${!imAlive || myVote ? 'cursor-default opacity-90' : 'cursor-pointer'}`}
              >
                <div className="font-bold text-slate-100 text-sm">{o.label}</div>
                <div className="text-[11px] text-slate-400">{o.hint}</div>
              </button>
            ))}
          </div>
          <div className="text-xs font-mono text-slate-400 flex items-center justify-between">
            <span>{imAlive ? (myVote ? 'Ваш выбор принят' : 'Выберите реакцию рода') : 'Вы изгнаны и только наблюдаете'}</span>
            <span>Проголосовали: {voted}/{l.survivorIds.length}</span>
          </div>
          {isHost && (
            <button onClick={onResolve} className="py-2 px-4 border border-amber-500/40 text-amber-300 hover:bg-amber-500/10 text-xs font-bold uppercase cursor-pointer">
              Подвести итог сейчас
            </button>
          )}
        </div>
      )}

      {(l.step === 'RESULT' || finished) && last && (
        <div className={`p-3 border notch-sm space-y-1 ${OUTCOME[last.outcome].cls}`}>
          <div className="text-[11px] font-mono uppercase">{last.title} · {OUTCOME[last.outcome].label}</div>
          <div className="text-sm text-slate-100">Выбор: {last.choice}</div>
          <div className="text-sm text-slate-300">{last.text}</div>
          <div className="text-xs font-mono text-slate-400">Численность рода: {last.population}</div>
        </div>
      )}

      {l.step === 'RESULT' && (
        isHost
          ? <button onClick={onNext} className="py-3 px-6 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold notch text-xs uppercase tracking-wider cursor-pointer">Следующее поколение</button>
          : <p className="text-xs text-slate-500 font-mono">Ждём следующего поколения...</p>
      )}

      {finished && (
        <div className="text-center space-y-1 pt-2">
          <div className={`text-xl font-black uppercase font-display ${l.extinct ? 'text-red-400' : 'text-emerald-400'}`}>
            {l.extinct ? 'Род угас' : 'Род продолжается'}
          </div>
          <p className="text-sm text-slate-300">
            {l.extinct
              ? `От ${l.startPopulation} человек остались единицы. Бункер опустел.`
              : `За ${l.maxGenerations} поколений род вырос с ${l.startPopulation} до ${l.population} человек и готов выйти на поверхность.`}
          </p>
        </div>
      )}

      {l.history.length > 0 && (
        <div className="space-y-1 border-t border-slate-800 pt-3">
          <div className="text-[10px] font-mono text-slate-500 uppercase">Летопись</div>
          {l.history.map(h => (
            <div key={h.generation} className="text-xs text-slate-400 flex justify-between gap-2">
              <span>{h.generation}. {h.title}: {h.choice}</span>
              <span className={OUTCOME[h.outcome].cls.split(' ')[0]}>{h.population}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
