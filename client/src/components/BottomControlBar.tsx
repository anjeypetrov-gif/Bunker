import React, { useState } from 'react';
import {
  Mic,
  MicOff,
  Video,
  VideoOff,
  Eye,
  Lock,
  Briefcase,
  HeartPulse,
  User,
  Smile,
  ShieldAlert,
  Package,
  Key,
  Sparkles,
  ArrowRight,
  Shield,
  ShieldCheck,
  Zap,
  RefreshCw,
  Shuffle,
  LayoutGrid
} from './icons';
import { Card, CardType, Player, RoomState } from '../types/game';
import { CharacterCards } from './CharacterCards';
import { getCardArt } from '../data/cardArt';

interface BottomControlBarProps {
  player: Player;
  room: RoomState;
  currentSocketId: string;
  onRevealCard: (cardType: CardType) => void;
  onUseActionCard: (targetId?: string) => void;
  onToggleMedia: (audioMuted: boolean, videoOff: boolean) => void;
  onAdvancePhase: () => void;
}

const CARD_MINI_CONFIG: Record<CardType, { label: string; icon: any }> = {
  profession: { label: 'ПРОФЕССИЯ', icon: Briefcase },
  health: { label: 'ЗДОРОВЬЕ', icon: HeartPulse },
  biology: { label: 'БИОЛОГИЯ', icon: User },
  hobby: { label: 'ХОББИ', icon: Smile },
  trait: { label: 'ЧЕРТА', icon: ShieldAlert },
  baggage: { label: 'БАГАЖ', icon: Package },
  secret: { label: 'СЕКРЕТ', icon: Key },
  actionCard: { label: 'СПЕЦКАРТА', icon: Sparkles }
};

const EFFECT_ICON: Record<string, any> = {
  IMMUNITY: ShieldCheck,
  DOUBLE_VOTE: Zap,
  REVOTE: RefreshCw,
  FORCE_HEALTH_REVEAL: HeartPulse,
  SWAP_PROFESSION: Shuffle
};

const NEEDS_TARGET = new Set(['FORCE_HEALTH_REVEAL', 'SWAP_PROFESSION']);

export const BottomControlBar: React.FC<BottomControlBarProps> = ({
  player,
  room,
  currentSocketId,
  onRevealCard,
  onUseActionCard,
  onToggleMedia,
  onAdvancePhase
}) => {
  const [audioMuted, setAudioMuted] = useState(player.audioMuted || false);
  const [videoOff, setVideoOff] = useState(player.videoOff || false);
  const [selectedCardType, setSelectedCardType] = useState<CardType | null>(null);
  const [actionCardOpen, setActionCardOpen] = useState(false);
  const [actionTarget, setActionTarget] = useState<string | null>(null);
  const [dossierOpen, setDossierOpen] = useState(false);
  const [artFailed, setArtFailed] = useState<Partial<Record<CardType, boolean>>>({});

  const isHost = room.hostId === currentSocketId;
  const canReveal = room.phase === 'CARD_REVEAL' && !player.isExiled && !player.revealedThisRound;
  const infoCardKeys: CardType[] = ['profession', 'health', 'biology', 'hobby', 'trait', 'baggage', 'secret'];

  const handleToggleMic = () => {
    const nextMuted = !audioMuted;
    setAudioMuted(nextMuted);
    onToggleMedia(nextMuted, videoOff);
  };

  const handleToggleCam = () => {
    const nextCamOff = !videoOff;
    setVideoOff(nextCamOff);
    onToggleMedia(audioMuted, nextCamOff);
  };

  const selectedCard = selectedCardType ? player.cards[selectedCardType] : null;
  const selectedCardConfig = selectedCardType ? CARD_MINI_CONFIG[selectedCardType] : null;

  const actionCard = player.cards.actionCard;
  const actionEffect: string | undefined = actionCard?.meta?.effect;
  const ActionEffectIcon = actionEffect ? EFFECT_ICON[actionEffect] || Sparkles : Sparkles;
  const actionUsable = !player.isExiled && !player.actionCardUsed && ['CARD_REVEAL', 'DISCUSSION', 'VOTING'].includes(room.phase);
  const actionNeedsTarget = actionEffect ? NEEDS_TARGET.has(actionEffect) : false;

  const otherActivePlayers = Object.values(room.players).filter(p => !p.isExiled && p.id !== currentSocketId);

  const confirmActionCard = () => {
    if (actionNeedsTarget) {
      if (!actionTarget) return;
      onUseActionCard(actionTarget);
    } else {
      onUseActionCard();
    }
    setActionCardOpen(false);
    setActionTarget(null);
  };

  return (
    <>
      <div className="bg-slate-950 border-t border-slate-800 p-2.5 px-4 flex flex-wrap items-center justify-between gap-3 shrink-0 shadow-2xl z-20">

        {/* Left: Media Toggles & Profile Status */}
        <div className="flex items-center gap-2">
          <button
            onClick={handleToggleMic}
            className={`p-2.5 notch-sm border flex items-center gap-1.5 text-xs font-mono font-bold transition-all cursor-pointer ${
              audioMuted
                ? 'bg-red-500/20 border-red-500/40 text-red-400'
                : 'bg-slate-900 border-slate-700 text-emerald-400 hover:bg-slate-800'
            }`}
            title="Переключить микрофон"
          >
            {audioMuted ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
            <span className="hidden sm:inline">{audioMuted ? 'МИК ВЫКЛ' : 'МИК ВКЛ'}</span>
          </button>

          <button
            onClick={handleToggleCam}
            className={`p-2.5 notch-sm border flex items-center gap-1.5 text-xs font-mono font-bold transition-all cursor-pointer ${
              videoOff
                ? 'bg-red-500/20 border-red-500/40 text-red-400'
                : 'bg-slate-900 border-slate-700 text-amber-400 hover:bg-slate-800'
            }`}
            title="Переключить камеру"
          >
            {videoOff ? <VideoOff className="w-4 h-4" /> : <Video className="w-4 h-4" />}
            <span className="hidden sm:inline">{videoOff ? 'КАМЕРА ВЫКЛ' : 'КАМЕРА ВКЛ'}</span>
          </button>

          {player.role && (
            <div className="hidden lg:flex items-center gap-1.5 px-3 py-1.5 bg-slate-900 border border-amber-500/30 notch-sm text-xs font-mono text-amber-300">
              <Shield className="w-3.5 h-3.5 text-amber-400" />
              <span className="font-bold truncate max-w-[120px]">{player.role.title}</span>
            </div>
          )}
        </div>

        {/* Center: Hand of Playing Cards Selector */}
        <div className="flex-1 flex items-center justify-start gap-1.5 overflow-x-auto py-0.5 px-2 min-w-0">
          <button
            onClick={() => setDossierOpen(true)}
            className="flex items-center gap-1.5 px-2.5 py-1.5 notch-sm border border-slate-700 bg-slate-900 text-slate-300 hover:bg-slate-800 text-xs font-mono shrink-0 cursor-pointer"
            title="Открыть полный планшет персонажа"
          >
            <LayoutGrid className="w-3.5 h-3.5 text-amber-400" />
            <span className="hidden md:inline">ПЛАНШЕТ</span>
          </button>

          {infoCardKeys.map(key => {
            const card: Card = player.cards[key];
            if (!card) return null;
            const config = CARD_MINI_CONFIG[key];
            const Icon = config.icon;
            const art = getCardArt(key, card.title);
            const showArt = art && !artFailed[key];

            return (
              <button
                key={key}
                onClick={() => setSelectedCardType(key)}
                className={`flex items-center gap-1.5 px-2.5 py-1.5 notch-sm border transition-all text-xs font-mono shrink-0 cursor-pointer ${
                  card.isRevealed
                    ? 'bg-slate-900 border-emerald-500/50 text-emerald-300 shadow-sm'
                    : 'bg-slate-900 border-slate-700 text-slate-300 hover:border-amber-500/50'
                }`}
              >
                {showArt ? (
                  <img
                    src={art!}
                    alt=""
                    className="w-6 h-6 notch-sm object-cover shrink-0"
                    onError={() => setArtFailed(prev => ({ ...prev, [key]: true }))}
                  />
                ) : (
                  <Icon className={`w-3.5 h-3.5 ${card.isRevealed ? 'text-emerald-400' : 'text-amber-400'}`} />
                )}
                <div className="text-left">
                  <span className="text-[9px] text-slate-500 block font-sans font-bold leading-none">{config.label}</span>
                  <span className="font-bold truncate max-w-[90px] block leading-snug">{card.title}</span>
                </div>
                {card.isRevealed ? (
                  <Eye className="w-3 h-3 text-emerald-400 ml-0.5" />
                ) : (
                  <Lock className="w-3 h-3 text-slate-500 ml-0.5" />
                )}
              </button>
            );
          })}

          {actionCard && (() => {
            const actionArt = getCardArt('actionCard', actionCard.title);
            const showActionArt = actionArt && !artFailed.actionCard;
            return (
              <button
                onClick={() => setActionCardOpen(true)}
                className={`flex items-center gap-1.5 px-2.5 py-1.5 notch-sm border transition-all text-xs font-mono shrink-0 cursor-pointer ${
                  player.actionCardUsed
                    ? 'bg-slate-900 border-slate-800 text-slate-600'
                    : 'bg-amber-500/10 border-amber-500/50 text-amber-300 hover:bg-amber-500/20'
                }`}
              >
                {showActionArt ? (
                  <img
                    src={actionArt!}
                    alt=""
                    className="w-6 h-6 notch-sm object-cover shrink-0"
                    onError={() => setArtFailed(prev => ({ ...prev, actionCard: true }))}
                  />
                ) : (
                  <ActionEffectIcon className="w-3.5 h-3.5" />
                )}
                <div className="text-left">
                  <span className="text-[9px] text-slate-500 block font-sans font-bold leading-none">СПЕЦКАРТА</span>
                  <span className="font-bold truncate max-w-[90px] block leading-snug">{actionCard.title}</span>
                </div>
              </button>
            );
          })()}
        </div>

        {/* Right: Host Controls & Next Phase Button */}
        <div className="flex items-center gap-2">
          {isHost ? (
            <button
              onClick={onAdvancePhase}
              className="py-2.5 px-4 bg-amber-500 hover:bg-amber-400 text-slate-950 font-black text-xs uppercase tracking-wider notch-sm shadow-lg shadow-amber-500/20 flex items-center gap-2 cursor-pointer transition-all active:scale-98 font-mono"
            >
              <span>СЛЕДУЮЩИЙ ЭТАП</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          ) : (
            <div className="px-3 py-1.5 bg-slate-900 border border-slate-800 text-slate-400 font-mono text-xs notch-sm flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-amber-400 animate-ping" />
              <span>ИГРА ИДЕТ</span>
            </div>
          )}
        </div>
      </div>

      {/* Card Inspection Modal (informational cards) */}
      {selectedCardType && selectedCard && selectedCardConfig && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-md z-50 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-amber-500/40 notch p-6 max-w-sm w-full shadow-2xl space-y-4 relative">

            <button
              onClick={() => setSelectedCardType(null)}
              className="absolute top-4 right-4 text-slate-400 hover:text-white font-mono text-sm font-bold p-1 cursor-pointer"
            >
              ✕
            </button>

            {(() => {
              const art = getCardArt(selectedCardType, selectedCard.title);
              const showArt = art && !artFailed[selectedCardType];
              return showArt ? (
                <div className="w-full aspect-square notch-sm bg-slate-950/60 border border-slate-800/80 overflow-hidden">
                  <img
                    src={art!}
                    alt=""
                    className="w-full h-full object-cover"
                    onError={() => setArtFailed(prev => ({ ...prev, [selectedCardType]: true }))}
                  />
                </div>
              ) : null;
            })()}

            <div className="flex items-center gap-2">
              <span className="p-2 notch-sm border border-amber-500/40 bg-amber-500/10">
                <selectedCardConfig.icon className="w-5 h-5 text-amber-300" />
              </span>
              <div>
                <span className="text-[10px] font-mono text-slate-400 uppercase tracking-widest">{selectedCardConfig.label}</span>
                <h3 className="text-lg font-black text-white font-mono">{selectedCard.title}</h3>
              </div>
            </div>

            <div className="p-3 bg-slate-950/80 border border-slate-800 notch-sm text-xs text-slate-300 leading-relaxed font-sans">
              {selectedCard.description}
            </div>

            <div className="flex items-center justify-between text-xs font-mono pt-1">
              <span className="text-slate-400">СТАТУС КАРТЫ:</span>
              {selectedCard.isRevealed ? (
                <span className="text-emerald-400 font-bold flex items-center gap-1">
                  <Eye className="w-3.5 h-3.5" /> ОТКРЫТА ГРУППЕ
                </span>
              ) : (
                <span className="text-slate-500 font-bold flex items-center gap-1">
                  <Lock className="w-3.5 h-3.5" /> СКРЫТА
                </span>
              )}
            </div>

            {!selectedCard.isRevealed && (
              <button
                disabled={!canReveal}
                onClick={() => {
                  onRevealCard(selectedCardType);
                  setSelectedCardType(null);
                }}
                className={`w-full py-3 px-4 notch-sm text-xs font-black uppercase tracking-wider flex items-center justify-center gap-2 transition-all ${
                  canReveal
                    ? 'bg-amber-500 hover:bg-amber-400 text-slate-950 font-black shadow-lg shadow-amber-500/20 cursor-pointer'
                    : 'bg-slate-800 text-slate-500 border border-slate-700 cursor-not-allowed'
                }`}
              >
                <Eye className="w-4 h-4" /> РАСКРЫТЬ КАРТУ ГРУППЕ
              </button>
            )}
            {!selectedCard.isRevealed && room.phase === 'CARD_REVEAL' && player.revealedThisRound && (
              <p className="text-[11px] text-amber-300 font-mono text-center">
                В этом раунде уже открыта одна характеристика. Следующую можно будет открыть в следующем раунде.
              </p>
            )}
          </div>
        </div>
      )}

      {/* Action Card Use Modal */}
      {actionCardOpen && actionCard && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-md z-50 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-amber-500/40 notch p-6 max-w-sm w-full shadow-2xl space-y-4 relative">
            <button
              onClick={() => { setActionCardOpen(false); setActionTarget(null); }}
              className="absolute top-4 right-4 text-slate-400 hover:text-white font-mono text-sm font-bold p-1 cursor-pointer"
            >
              ✕
            </button>

            {(() => {
              const art = getCardArt('actionCard', actionCard.title);
              const showArt = art && !artFailed.actionCard;
              return showArt ? (
                <div className="w-full aspect-square notch-sm bg-slate-950/60 border border-slate-800/80 overflow-hidden">
                  <img
                    src={art!}
                    alt=""
                    className="w-full h-full object-cover"
                    onError={() => setArtFailed(prev => ({ ...prev, actionCard: true }))}
                  />
                </div>
              ) : null;
            })()}

            <div className="flex items-center gap-2">
              <span className="p-2 notch-sm border border-amber-500/40 bg-amber-500/10">
                <ActionEffectIcon className="w-5 h-5 text-amber-300" />
              </span>
              <div>
                <span className="text-[10px] font-mono text-slate-400 uppercase tracking-widest">СПЕЦКАРТА ДЕЙСТВИЯ</span>
                <h3 className="text-lg font-black text-white font-mono">{actionCard.title}</h3>
              </div>
            </div>

            <div className="p-3 bg-slate-950/80 border border-slate-800 notch-sm text-xs text-slate-300 leading-relaxed font-sans">
              {actionCard.description}
            </div>

            {player.actionCardUsed ? (
              <div className="text-center py-2 text-[11px] font-mono text-slate-500 border border-slate-800 notch-sm">
                ЭТА КАРТА УЖЕ ИСПОЛЬЗОВАНА
              </div>
            ) : !actionUsable ? (
              <div className="text-center py-2 text-[11px] font-mono text-slate-500 border border-slate-800 notch-sm">
                Карту нельзя использовать в текущей фазе игры
              </div>
            ) : (
              <>
                {actionNeedsTarget && (
                  <div className="space-y-2">
                    <div className="text-[11px] font-mono text-slate-400 uppercase tracking-wider">Выберите цель:</div>
                    <div className="grid grid-cols-2 gap-2 max-h-40 overflow-y-auto pr-1">
                      {otherActivePlayers.map(p => (
                        <button
                          key={p.id}
                          onClick={() => setActionTarget(p.id)}
                          className={`p-2 notch-sm border text-xs font-mono text-left transition-all cursor-pointer ${
                            actionTarget === p.id
                              ? 'bg-amber-500/20 border-amber-500 text-amber-200'
                              : 'bg-slate-950/60 border-slate-800 text-slate-300 hover:border-slate-600'
                          }`}
                        >
                          {p.name}
                        </button>
                      ))}
                      {otherActivePlayers.length === 0 && (
                        <div className="col-span-2 text-[11px] text-slate-500 font-mono text-center py-2">Нет доступных целей</div>
                      )}
                    </div>
                  </div>
                )}

                <button
                  disabled={actionNeedsTarget && !actionTarget}
                  onClick={confirmActionCard}
                  className={`w-full py-3 px-4 notch-sm text-xs font-black uppercase tracking-wider flex items-center justify-center gap-2 transition-all ${
                    !actionNeedsTarget || actionTarget
                      ? 'bg-amber-500 hover:bg-amber-400 text-slate-950 shadow-lg shadow-amber-500/20 cursor-pointer'
                      : 'bg-slate-800 text-slate-500 border border-slate-700 cursor-not-allowed'
                  }`}
                >
                  <ActionEffectIcon className="w-4 h-4" /> ИСПОЛЬЗОВАТЬ КАРТУ
                </button>
              </>
            )}
          </div>
        </div>
      )}

      {/* Full character dossier */}
      {dossierOpen && (
        <CharacterCards
          player={player}
          onRevealCard={onRevealCard}
          onClose={() => setDossierOpen(false)}
          canReveal={canReveal}
        />
      )}
    </>
  );
};
