import React, { useState } from 'react';
import { Skull, Vote, CheckCircle, AlertCircle } from './icons';
import { Player } from '../types/game';

interface VotingModalProps {
  players: Record<string, Player>;
  currentSocketId: string;
  onCastVote: (targetId: string) => void;
}

export const VotingModal: React.FC<VotingModalProps> = ({
  players,
  currentSocketId,
  onCastVote
}) => {
  const [selectedTargetId, setSelectedTargetId] = useState<string | null>(null);

  const currentPlayer = players[currentSocketId];
  const isExiled = currentPlayer?.isExiled;
  const hasVoted = currentPlayer?.hasVoted;

  const eligibleTargets = Object.values(players).filter(p => !p.isExiled && p.id !== currentSocketId);

  return (
    <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-md z-50 flex items-center justify-center p-4">
      <div className="bg-slate-900 border border-slate-800 notch max-w-lg w-full max-h-[90vh] overflow-y-auto p-6 shadow-2xl space-y-5">
        <div className="text-center space-y-2 border-b border-slate-800 pb-4">
          <div className="inline-flex p-3 bg-red-500/10 border border-red-500/30 notch-sm text-red-500 mb-1">
            <Vote className="w-8 h-8" />
          </div>
          <h2 className="text-2xl font-black text-slate-100 uppercase tracking-wider font-display">ГОЛОСОВАНИЕ НА ИЗГНАНИЕ</h2>
          <p className="text-xs text-slate-400 font-mono">
            Выберите игрока, чье присутствие в бункере наименее полезно для выживания человечества.
          </p>
          {currentPlayer?.voteWeight === 2 && !hasVoted && (
            <p className="text-[11px] text-amber-300 font-mono bg-amber-500/10 border border-amber-500/30 notch-sm py-1 px-2 inline-block">
              Ваш голос в этом раунде считается за двоих
            </p>
          )}
        </div>

        {isExiled ? (
          <div className="text-center py-6 text-red-400 font-mono text-sm space-y-2">
            <AlertCircle className="w-8 h-8 mx-auto" />
            <p>Вы изгнаны из бункера и не принимаете участия в голосовании.</p>
          </div>
        ) : hasVoted ? (
          <div className="text-center py-8 text-emerald-400 font-mono text-sm space-y-2">
            <CheckCircle className="w-10 h-10 mx-auto animate-pulse" />
            <p className="font-bold text-base">ВАШ ГОЛОС ПРИНЯТ СЕРВЕРОМ</p>
            <p className="text-xs text-slate-400">Ожидание остальных участников бункера...</p>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-h-60 overflow-y-auto pr-1">
              {eligibleTargets.map(target => {
                const isSelected = selectedTargetId === target.id;
                return (
                  <button
                    key={target.id}
                    onClick={() => setSelectedTargetId(target.id)}
                    className={`p-3 notch-sm border flex items-center justify-between text-left transition-all cursor-pointer ${
                      isSelected
                        ? 'bg-red-600/20 border-red-500 text-white shadow-md shadow-red-500/10'
                        : 'bg-slate-950/60 border-slate-800 text-slate-300 hover:bg-slate-800'
                    }`}
                  >
                    <div>
                      <div className="font-bold text-sm flex items-center gap-1.5">
                        {target.name}
                        {target.hasImmunity && (
                          <span className="text-[9px] text-emerald-400 font-mono border border-emerald-500/40 px-1 py-0.5 notch-sm">ИММУНИТЕТ</span>
                        )}
                      </div>
                      <div className="text-[11px] text-slate-400">
                        {target.cards.profession?.isRevealed ? target.cards.profession.title : 'Профессия скрыта'}
                      </div>
                    </div>
                    {isSelected && <Skull className="w-5 h-5 text-red-500" />}
                  </button>
                );
              })}
            </div>

            <button
              disabled={!selectedTargetId}
              onClick={() => {
                if (selectedTargetId) onCastVote(selectedTargetId);
              }}
              className={`w-full py-3.5 px-4 notch-sm font-bold uppercase tracking-wider text-sm flex items-center justify-center gap-2 shadow-lg transition-all ${
                selectedTargetId
                  ? 'bg-red-600 hover:bg-red-500 text-white shadow-red-600/30 cursor-pointer'
                  : 'bg-slate-800 text-slate-500 cursor-not-allowed'
              }`}
            >
              <Skull className="w-4 h-4" /> ПОДТВЕРДИТЬ ГОЛОС
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
