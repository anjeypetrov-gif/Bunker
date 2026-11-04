import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Mic, MicOff, Video, VideoOff, Skull, Crown, ShieldCheck, Eye, X } from './icons';
import { Card, CardType, Player } from '../types/game';
import { webRTCManager } from '../services/webrtc';
import { getCardArt } from '../data/cardArt';
import { getBotAvatarArt, getBotAvatarVideo } from '../data/botAvatars';

const CARD_TYPE_LABELS: Record<CardType, string> = {
  profession: 'ПРОФЕССИЯ',
  health: 'ЗДОРОВЬЕ',
  biology: 'БИОЛОГИЯ',
  hobby: 'ХОББИ / НАВЫК',
  trait: 'ЧЕРТА ХАРАКТЕРА',
  baggage: 'БАГАЖ',
  secret: 'СЕКРЕТНЫЙ ФАКТ',
  condition: 'УСЛОВИЕ / БОНУС',
  actionCard: 'СПЕЦКАРТА ДЕЙСТВИЯ'
};

interface VideoGridProps {
  players: Record<string, Player>;
  currentSocketId: string;
  speakerId?: string | null;
  speechSeconds?: number;
  onToggleMedia: (audioMuted: boolean, videoOff: boolean) => void;
}

export const VideoGrid: React.FC<VideoGridProps> = ({
  players,
  currentSocketId,
  speakerId = null,
  speechSeconds = 0,
  onToggleMedia
}) => {
  const [remoteStreams, setRemoteStreams] = useState<Record<string, MediaStream>>({});
  const [peerStates, setPeerStates] = useState<Record<string, string>>({});
  // Состояние микрофона/камеры берём из комнаты (единый источник для всех панелей).
  const me = players[currentSocketId];
  const audioMuted = !!me?.audioMuted;
  const videoOff = !!me?.videoOff;
  const [inspected, setInspected] = useState<{ playerName: string; card: Card } | null>(null);
  const [inspectedArtFailed, setInspectedArtFailed] = useState<Record<string, boolean>>({});

  const localVideoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    let mounted = true;

    // Wire up WebRTC signaling relayed through the server socket.
    webRTCManager.setCallbacks(
      (socketId, stream) => {
        setRemoteStreams(prev => ({ ...prev, [socketId]: stream }));
      },
      (socketId) => {
        setRemoteStreams(prev => {
          const next = { ...prev };
          delete next[socketId];
          return next;
        });
      },
      (socketId, state) => {
        setPeerStates(prev => {
          const next = { ...prev };
          if (state) next[socketId] = state; else delete next[socketId];
          return next;
        });
      }
    );

    // Только локальный поток: сигналинг (offer/answer/candidate) обрабатывает
    // сам webRTCManager, а соединения создаёт syncPeers (см. эффект ниже).
    webRTCManager.getLocalStream(true, true).then(stream => {
      if (!mounted) return;
      if (stream && localVideoRef.current) {
        localVideoRef.current.srcObject = stream;
      }
    });

    return () => {
      mounted = false;
      webRTCManager.destroy();
    };
  }, []);

  // Подключаемся ко всем живым игрокам при входе в игру и при любом изменении состава
  // (вход, выход, переподключение с новым socket.id).
  const peerKey = Object.values(players)
    .filter(p => !p.id.startsWith('bot-') && p.isConnected !== false)
    .map(p => p.id)
    .sort()
    .join(',');
  useEffect(() => {
    webRTCManager.getLocalStream(true, true).then(() => {
      webRTCManager.syncPeers(currentSocketId, Object.values(players));
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [peerKey, currentSocketId]);

  const handleToggleAudio = () => {
    onToggleMedia(!audioMuted, videoOff);
  };

  const handleToggleVideo = () => {
    onToggleMedia(audioMuted, !videoOff);
  };

  const playerList = Object.values(players);

  return (
    <div className="flex flex-col h-full overflow-hidden bg-slate-900/80 border border-slate-800 notch p-2.5 md:p-3.5 shadow-2xl">
      <div className="flex items-center justify-between mb-2.5 border-b border-slate-800 pb-2 shrink-0">
        <h3 className="text-xs font-bold text-slate-300 uppercase tracking-wider flex items-center gap-2 font-mono">
          <Video className="w-4 h-4 text-amber-400" /> <span className="hidden sm:inline">ТРАНСЛЯЦИЯ ИЗ КАМЕР БУНКЕРА</span><span className="sm:hidden">КАМЕРЫ</span> ({playerList.length})
        </h3>

        {/* Local Quick Media Controls (на телефоне — только в нижней панели) */}
        <div className="hidden md:flex items-center gap-2">
          <button
            onClick={handleToggleAudio}
            className={`p-1.5 px-2.5 notch-sm text-xs font-mono font-semibold flex items-center gap-1.5 transition-all cursor-pointer ${
              audioMuted ? 'bg-red-500/20 text-red-400 border border-red-500/40' : 'bg-slate-800 text-slate-200 hover:bg-slate-700'
            }`}
          >
            {audioMuted ? <MicOff className="w-3.5 h-3.5" /> : <Mic className="w-3.5 h-3.5 text-emerald-400" />}
            <span>{audioMuted ? 'МИК ВЫКЛ' : 'МИК ВКЛ'}</span>
          </button>

          <button
            onClick={handleToggleVideo}
            className={`p-1.5 px-2.5 notch-sm text-xs font-mono font-semibold flex items-center gap-1.5 transition-all cursor-pointer ${
              videoOff ? 'bg-red-500/20 text-red-400 border border-red-500/40' : 'bg-slate-800 text-slate-200 hover:bg-slate-700'
            }`}
          >
            {videoOff ? <VideoOff className="w-3.5 h-3.5" /> : <Video className="w-3.5 h-3.5 text-amber-400" />}
            <span>{videoOff ? 'КАМЕРА ВЫКЛ' : 'КАМЕРА ВКЛ'}</span>
          </button>
        </div>
      </div>

      {/* Grid of Players */}
      <div className="flex-1 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2.5 overflow-y-auto pr-1 content-start">
        {playerList.map(player => {
          const isSelf = player.id === currentSocketId;
          const remoteStream = remoteStreams[player.id];

          return (
            <PlayerVideoCard
              key={player.id}
              player={player}
              isSelf={isSelf}
              localVideoRef={isSelf ? localVideoRef : undefined}
              remoteStream={!isSelf ? remoteStream : undefined}
              peerState={!isSelf ? peerStates[player.id] : undefined}
              isSpeaker={speakerId === player.id}
              speechSeconds={speechSeconds}
              onCardClick={(card) => setInspected({ playerName: player.name, card })}
            />
          );
        })}
      </div>

      {/* Revealed-card detail popup — shows what a pill only had room to hint at.
          Rendered through a portal straight into <body>: this panel's own
          notch (clip-path) would otherwise visually clip a "fixed" child to
          the panel's box instead of the full viewport. */}
      {inspected && createPortal(
        <div
          className="fixed inset-0 bg-slate-950/80 backdrop-blur-md z-50 flex items-center justify-center p-4"
          onClick={() => setInspected(null)}
        >
          <div
            className="bg-slate-900 border border-amber-500/40 notch p-6 max-w-sm w-full max-h-[90vh] overflow-y-auto shadow-2xl space-y-3 relative"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              onClick={() => setInspected(null)}
              className="absolute top-4 right-4 text-slate-400 hover:text-white p-1 cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
            {(() => {
              const art = getCardArt(inspected.card.type, inspected.card.title);
              return art && !inspectedArtFailed[inspected.card.id] ? (
                <img
                  src={art}
                  alt=""
                  className="w-full aspect-square object-cover notch-sm border border-slate-800"
                  onError={() => setInspectedArtFailed(prev => ({ ...prev, [inspected.card.id]: true }))}
                />
              ) : null;
            })()}
            <div className="flex items-center gap-2 text-[10px] font-mono text-slate-400 uppercase tracking-widest">
              <Eye className="w-3.5 h-3.5 text-emerald-400" />
              {inspected.playerName} · раскрыл(а) {CARD_TYPE_LABELS[inspected.card.type]}
            </div>
            <h3 className="text-lg font-black text-amber-200 font-mono">{inspected.card.title}</h3>
            <p className="text-sm text-slate-300 leading-relaxed font-sans">{inspected.card.description}</p>
          </div>
        </div>,
        document.body
      )}
    </div>

  );
};

interface PlayerVideoCardProps {
  player: Player;
  isSelf: boolean;
  localVideoRef?: React.RefObject<HTMLVideoElement>;
  remoteStream?: MediaStream;
  peerState?: string;
  isSpeaker?: boolean;
  speechSeconds?: number;
  onCardClick: (card: Card) => void;
}

const PlayerVideoCard: React.FC<PlayerVideoCardProps> = ({
  player,
  isSelf,
  localVideoRef,
  remoteStream,
  peerState,
  isSpeaker = false,
  speechSeconds = 0,
  onCardClick
}) => {
  const remoteVideoRef = useRef<HTMLVideoElement>(null);
  const [soundBlocked, setSoundBlocked] = useState(false);
  const [avatarArtFailed, setAvatarArtFailed] = useState(false);
  const [avatarVideoFailed, setAvatarVideoFailed] = useState(false);
  const botAvatarArt = getBotAvatarArt(player.avatar);
  const botAvatarVideo = getBotAvatarVideo(player.avatar);

  // player.videoOff в зависимостях: когда собеседник выключает и снова включает камеру,
  // <video> пересоздаётся пустым и поток нужно привязать заново.
  useEffect(() => {
    const el = remoteVideoRef.current;
    if (isSelf || !remoteStream || !el) return;
    el.srcObject = remoteStream;
    el.play().catch(() => {
      // Автовоспроизведение со звуком заблокировано (iOS/Safari) — стартуем без звука.
      el.muted = true;
      setSoundBlocked(true);
      el.play().catch(() => {});
    });
  }, [isSelf, remoteStream, player.videoOff]);

  const isBotPlayer = player.id.startsWith('bot-');
  const linkLabel =
    !isSelf && !isBotPlayer && !remoteStream && !player.isExiled && player.isConnected
      ? peerState === 'failed'
        ? 'НЕТ СВЯЗИ'
        : peerState === 'disconnected'
        ? 'СВЯЗЬ ПРЕРВАНА…'
        : 'СОЕДИНЕНИЕ…'
      : null;

  return (
    <div
      className={`relative aspect-video overflow-hidden bg-slate-950 border transition-all ${
        player.isExiled
          ? 'border-red-950 opacity-60 grayscale'
          : isSpeaker
          ? 'border-amber-400 ring-2 ring-amber-400 shadow-lg shadow-amber-400/30'
          : isSelf
          ? 'border-amber-500/60 shadow-md shadow-amber-500/10'
          : 'border-slate-800'
      }`}
    >
      {isSpeaker && (
        <div className="absolute top-1.5 left-1.5 z-20 flex items-center gap-1 bg-amber-400 text-slate-950 px-2 py-0.5 text-[11px] font-black font-mono notch-sm shadow">
          <span className="w-1.5 h-1.5 rounded-full bg-red-600 animate-pulse" />
          ГОВОРИТ · {speechSeconds}с
        </div>
      )}

      {/* Video element or Avatar placeholder */}
      {isSelf ? (
        <video
          ref={localVideoRef}
          autoPlay
          playsInline
          muted
          className={`w-full h-full object-cover ${player.videoOff ? 'hidden' : 'block'}`}
        />
      ) : remoteStream && !player.videoOff ? (
        <video
          ref={remoteVideoRef}
          autoPlay
          playsInline
          className="w-full h-full object-cover"
        />
      ) : null}

      {/* Fallback when video is off — bots (always videoOff) show their
          looping avatar clip here instead of the generic biohazard icon.
          Three-tier fallback: looping <video> (webm first, mp4 second —
          browsers pick whichever they can decode) -> static poster <img>
          if video playback itself fails -> generic icon if even the
          poster 404s. Everyone else (real players with camera off) just
          gets the icon, since they have no avatar art at all. */}
      {(player.videoOff || (!isSelf && !remoteStream)) && (
        <div className="w-full h-full flex flex-col items-center justify-center bg-slate-950 text-slate-600">
          {botAvatarVideo && !avatarVideoFailed ? (
            <video
              key={botAvatarVideo.webm}
              autoPlay
              loop
              muted
              playsInline
              poster={botAvatarVideo.poster}
              className="w-full h-full object-cover"
              onError={() => setAvatarVideoFailed(true)}
            >
              <source src={botAvatarVideo.webm} type="video/webm" />
              <source src={botAvatarVideo.mp4} type="video/mp4" />
            </video>
          ) : botAvatarArt && !avatarArtFailed ? (
            <img
              src={botAvatarArt}
              alt=""
              className="w-full h-full object-cover"
              onError={() => setAvatarArtFailed(true)}
            />
          ) : (
            <>
              <div className="text-3xl mb-1">☣️</div>
              <span className="text-[10px] font-mono text-slate-500">СИГНАЛ ВИДЕО ОГРАНИЧЕН</span>
            </>
          )}
        </div>
      )}

      {/* Exiled Overlay */}
      {player.isExiled && (
        <div className="absolute inset-0 bg-red-950/80 backdrop-blur-sm flex flex-col items-center justify-center text-red-400 font-bold">
          <Skull className="w-8 h-8 mb-1 animate-bounce" />
          <span className="text-xs uppercase tracking-widest font-black">ИЗГНАН СНАРУЖИ</span>
        </div>
      )}

      {/* Reconnecting Overlay — player's socket dropped (refresh / brief
          network blip); their slot and cards are kept warm server-side for
          a short grace window rather than removing them immediately. */}
      {!player.isConnected && !player.isExiled && (
        <div className="absolute inset-0 bg-slate-950/70 backdrop-blur-sm flex flex-col items-center justify-center text-amber-300 font-bold">
          <span className="w-2.5 h-2.5 rounded-full bg-amber-400 animate-ping mb-2" />
          <span className="text-[11px] uppercase tracking-widest font-black">ПЕРЕПОДКЛЮЧЕНИЕ...</span>
        </div>
      )}

      {linkLabel && (
        <div className="absolute top-9 inset-x-0 flex justify-center pointer-events-none z-10">
          <span className={`text-[10px] font-mono font-bold px-2 py-0.5 notch-sm border ${
            peerState === 'failed'
              ? 'bg-red-950/80 border-red-500/50 text-red-300'
              : 'bg-slate-950/80 border-amber-500/40 text-amber-300'
          }`}>
            {linkLabel}
          </span>
        </div>
      )}

      {soundBlocked && !isSelf && remoteStream && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            if (remoteVideoRef.current) { remoteVideoRef.current.muted = false; remoteVideoRef.current.play().catch(() => {}); }
            setSoundBlocked(false);
          }}
          className="absolute top-9 inset-x-0 mx-auto w-fit z-10 text-[10px] font-mono font-bold px-2 py-1 notch-sm bg-amber-500 text-slate-950 cursor-pointer"
        >
          ВКЛЮЧИТЬ ЗВУК
        </button>
      )}

      {/* Top badges */}
      <div className="absolute top-2 left-2 right-2 flex items-center justify-between pointer-events-none">
        <div className="flex items-center gap-1">
          {player.isHost && (
            <span className="bg-amber-500/90 text-slate-950 p-1 notch-sm text-[10px] font-black flex items-center gap-0.5">
              <Crown className="w-3 h-3" /> ХОСТ
            </span>
          )}
          {player.hasImmunity && !player.isExiled && (
            <span className="bg-emerald-500/90 text-slate-950 p-1 notch-sm text-[10px] font-black flex items-center gap-0.5">
              <ShieldCheck className="w-3 h-3" /> ИММУНИТЕТ
            </span>
          )}
          {isSelf && (
            <span className="bg-amber-500/20 border border-amber-500/40 text-amber-300 px-1.5 py-0.5 notch-sm text-[10px] font-black">
              ВЫ
            </span>
          )}
        </div>

        <div className="flex items-center gap-1 bg-slate-900/80 px-1.5 py-0.5 notch-sm backdrop-blur-sm text-[10px]">
          {player.audioMuted ? (
            <MicOff className="w-3 h-3 text-red-400" />
          ) : (
            <Mic className="w-3 h-3 text-emerald-400" />
          )}
        </div>
      </div>

      {/* Revealed Cards Pills Overlay — click a pill to read the full card.
          z-10 so it always paints above the name overlay below, even where
          the two visually overlap (e.g. a wrapped role name pushes the
          name block taller than expected) — otherwise the name overlay,
          despite having no clickable content of its own, would sit on top
          in the DOM stack and silently swallow clicks meant for a pill. */}
      {player.cards && (
        <div className="absolute bottom-10 left-2 right-2 z-10 flex flex-wrap gap-1 max-h-12 overflow-hidden">
          {Object.values(player.cards).filter(c => c && c.isRevealed && c.type !== 'actionCard').map(c => (
            <button
              key={c.id}
              onClick={(e) => { e.stopPropagation(); onCardClick(c); }}
              title="Показать описание карты"
              className="text-[9px] font-mono font-bold bg-amber-400/90 hover:bg-amber-300 text-slate-950 px-1.5 py-0.5 notch-sm shadow-sm border border-amber-300/40 truncate max-w-[120px] cursor-pointer transition-colors"
            >
              {c.title}
            </button>
          ))}
        </div>
      )}

      {/* Bottom Name overlay — purely informational (no clickable content),
          so pointer-events-none lets clicks fall through to the card pills
          above whenever the two visually overlap. */}
      <div className="absolute bottom-0 inset-x-0 bg-gradient-to-t from-slate-950 via-slate-950/80 to-transparent p-2 pt-4 flex items-center justify-between pointer-events-none">
        <div>
          <span className="text-xs font-bold text-slate-100 truncate block">{player.name}</span>
          {player.role && (
            <span className="text-[9px] font-mono text-amber-300 font-semibold block truncate">
              {player.role.title}
            </span>
          )}
        </div>
        {player.votesCount > 0 && !player.isExiled && (
          <span className="text-[10px] font-mono bg-red-600/30 border border-red-500/40 text-red-300 px-1.5 py-0.5 notch-sm font-bold">
            {player.votesCount} ГОЛОСОВ
          </span>
        )}
      </div>


    </div>
  );
};
