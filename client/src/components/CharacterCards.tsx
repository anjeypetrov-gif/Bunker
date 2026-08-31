import React, { useState } from 'react';
import { Briefcase, HeartPulse, User, Smile, ShieldAlert, Package, Key, Sparkles, Eye, Lock, X } from './icons';
import { Card, CardType, Player } from '../types/game';
import { getCardArt } from '../data/cardArt';

interface CharacterCardsProps {
  player: Player;
  onRevealCard: (cardType: CardType) => void;
  onClose: () => void;
  canReveal: boolean;
}

const CARD_ICONS: Record<CardType, any> = {
  profession: Briefcase,
  health: HeartPulse,
  biology: User,
  hobby: Smile,
  trait: ShieldAlert,
  baggage: Package,
  secret: Key,
  actionCard: Sparkles
};

const CARD_LABELS: Record<CardType, string> = {
  profession: 'ПРОФЕССИЯ',
  health: 'ЗДОРОВЬЕ',
  biology: 'БИОЛОГИЯ',
  hobby: 'ХОББИ / НАВЫК',
  trait: 'ЧЕРТА ХАРАКТЕРА',
  baggage: 'БАГАЖ',
  secret: 'СЕКРЕТНЫЙ ФАКТ',
  actionCard: 'СПЕЦКАРТА ДЕЙСТВИЯ'
};

export const CharacterCards: React.FC<CharacterCardsProps> = ({
  player,
  onRevealCard,
  onClose,
  canReveal
}) => {
  const [artFailed, setArtFailed] = useState<Partial<Record<CardType, boolean>>>({});

  if (!player || !player.cards) return null;

  const cardKeys: CardType[] = ['profession', 'health', 'biology', 'hobby', 'trait', 'baggage', 'secret', 'actionCard'];

  return (
    <div className="fixed inset-0 bg-slate-950/85 backdrop-blur-md z-50 flex items-center justify-center p-4">
      <div className="bg-slate-900/95 border border-slate-800 notch p-5 shadow-2xl space-y-4 max-w-4xl w-full max-h-[90vh] overflow-y-auto relative">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-slate-400 hover:text-white p-1 cursor-pointer"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-800 pb-3 pr-8">
          <div>
            <h3 className="text-sm font-black text-slate-100 uppercase tracking-wider flex items-center gap-2 font-mono">
              <Key className="w-5 h-5 text-amber-400" /> ЛИЧНЫЙ ПЛАНШЕТ: {player.name}
            </h3>
            <p className="text-[11px] text-slate-400 font-mono">
              Ваши личные характеристики. Каждому участнику отображаются только его собственные карты.
            </p>
          </div>
          <span className="text-[11px] font-mono px-3 py-1 bg-amber-500/10 border border-amber-500/30 text-amber-300 notch-sm shrink-0">
            {player.revealedThisRound ? 'КАРТА ОТКРЫТА В ЭТОМ РАУНДЕ' : 'МОЖНО ОТКРЫТЬ 1 КАРТУ'}
          </span>
        </div>

        {/* Role Banner Card */}
        {player.role && (
          <div className="bg-slate-950/60 border border-amber-500/30 p-4 notch space-y-2 relative overflow-hidden">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-amber-300 uppercase tracking-widest font-mono flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-amber-400" /> НАЗНАЧЕННАЯ РОЛЬ: {player.role.title}
              </span>
              <span className="text-[10px] px-2.5 py-0.5 bg-slate-900 text-slate-400 font-mono font-bold notch-sm border border-slate-700 uppercase tracking-wider">
                СЕКРЕТНОЕ НАЗНАЧЕНИЕ
              </span>
            </div>
            <p className="text-xs text-slate-300 leading-relaxed font-sans">{player.role.description}</p>
            <div className="text-xs text-amber-200 bg-amber-500/10 border border-amber-500/20 p-2.5 notch-sm flex items-start gap-2.5">
              <ShieldAlert className="w-4 h-4 shrink-0 text-amber-400 mt-0.5" />
              <div>
                <strong className="block text-amber-400 uppercase text-[10px] tracking-wider mb-0.5">ГЛАВНАЯ ЦЕЛЬ В БУНКЕРЕ:</strong>
                <span>{player.role.goal}</span>
              </div>
            </div>
          </div>
        )}

        {/* Visualized Playing Cards Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
          {cardKeys.map(key => {
            const card: Card = player.cards[key];
            if (!card) return null;
            const Icon = CARD_ICONS[key];
            const isActionCard = key === 'actionCard';
            const locked = !card.isRevealed;
            const art = getCardArt(key, card.title);
            const showArt = art && !artFailed[key];

            return (
              <div
                key={key}
                className={`group relative flex flex-col justify-between p-4 notch border transition-all duration-200 bg-slate-950/60 ${
                  locked ? 'border-slate-800' : 'border-amber-500/50 ring-1 ring-amber-500/20'
                }`}
              >
                <div>
                  <div className="flex items-center justify-between mb-3 border-b border-slate-800/80 pb-2">
                    <span className={`text-[10px] font-black tracking-wider px-2 py-0.5 notch-sm border flex items-center gap-1 font-mono uppercase ${
                      locked ? 'bg-slate-800/80 border-slate-700 text-slate-400' : 'bg-amber-500/20 border-amber-500/30 text-amber-300'
                    }`}>
                      <Icon className="w-3.5 h-3.5" /> {CARD_LABELS[key]}
                    </span>
                    {!isActionCard && (
                      card.isRevealed ? (
                        <span className="text-[10px] font-mono text-emerald-400 font-bold flex items-center gap-1 px-1.5 py-0.5 bg-emerald-500/10 border border-emerald-500/20 notch-sm">
                          <Eye className="w-3 h-3" /> ОТКРЫТО
                        </span>
                      ) : (
                        <span className="text-[10px] font-mono text-slate-400 font-bold flex items-center gap-1 px-1.5 py-0.5 bg-slate-800/80 border border-slate-700 notch-sm">
                          <Lock className="w-3 h-3 text-slate-400" /> СКРЫТО
                        </span>
                      )
                    )}
                  </div>

                  <div className={`w-full notch-sm bg-slate-950/60 border border-slate-800/80 flex items-center justify-center mb-3 relative overflow-hidden ${showArt ? 'aspect-square' : 'h-16'}`}>
                    {showArt ? (
                      <img
                        src={art!}
                        alt=""
                        className={`w-full h-full object-cover ${locked ? 'opacity-60 grayscale-[35%]' : ''}`}
                        onError={() => setArtFailed(prev => ({ ...prev, [key]: true }))}
                      />
                    ) : (
                      <Icon className={`w-8 h-8 ${locked ? 'text-slate-500' : 'text-amber-300'} opacity-90 group-hover:scale-110 transition-transform`} />
                    )}
                  </div>

                  {/* Owners always see their own card content — isRevealed only controls
                      whether the REST of the group can see it (shown via the badge above). */}
                  <h4 className="text-sm font-bold text-amber-200 mb-1.5 leading-snug font-mono">{card.title}</h4>
                  <p className="text-xs text-slate-300 leading-relaxed font-sans">{card.description}</p>
                  {!isActionCard && !card.isRevealed && (
                    <p className="text-[10px] text-slate-500 leading-relaxed font-sans mt-1.5 italic">Пока скрыто от остальных выживших — видно только вам.</p>
                  )}
                </div>

                {!isActionCard && (
                  <div className="mt-4 pt-3 border-t border-slate-800/60">
                    {!card.isRevealed ? (
                      <button
                        disabled={!canReveal}
                        onClick={() => onRevealCard(key)}
                        className={`w-full py-2 px-3 notch-sm text-xs font-bold uppercase tracking-wider flex items-center justify-center gap-1.5 transition-all shadow-md ${
                          canReveal
                            ? 'bg-amber-500 hover:bg-amber-400 text-slate-950 font-black shadow-amber-500/20 cursor-pointer active:scale-98'
                            : 'bg-slate-800/80 text-slate-500 border border-slate-700/60 cursor-not-allowed'
                        }`}
                      >
                        <Eye className="w-4 h-4" /> РАСКРЫТЬ ГРУППЕ
                      </button>
                    ) : (
                      <div className="text-center py-1.5 text-[11px] font-mono text-emerald-400 font-semibold flex items-center justify-center gap-1 bg-emerald-500/10 notch-sm border border-emerald-500/20">
                        <Eye className="w-3.5 h-3.5 text-emerald-400" /> ВИДНО ВСЕМ В БУНКЕРЕ
                      </div>
                    )}
                  </div>
                )}

                {isActionCard && (
                  <div className="mt-4 pt-3 border-t border-slate-800/60 text-center py-1.5 text-[11px] font-mono notch-sm border border-amber-500/20 bg-amber-500/10 text-amber-300">
                    {player.actionCardUsed ? 'КАРТА УЖЕ ИСПОЛЬЗОВАНА' : 'ИСПОЛЬЗУЕТСЯ ИЗ ПАНЕЛИ УПРАВЛЕНИЯ'}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
