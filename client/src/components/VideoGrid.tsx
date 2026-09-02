import React, { useEffect, useRef, useState } from 'react';
import { Mic, MicOff, Video, VideoOff, Skull, Crown, ShieldCheck, Eye, X } from './icons';
import { Card, CardType, Player } from '../types/game';
import { webRTCManager } from '../services/webrtc';
import { socket } from '../services/socket';
import { getCardArt } from '../data/cardArt';

const CARD_TYPE_LABELS: Record<CardType, string> = {
  profession: 'ПРОФЕССИЯ',
  health: 'ЗДОРОВЬЕ',
  biology: 'БИОЛОГИЯ',
  hobby: 'ХОББИ / НАВЫК',
  trait: 'ЧЕРТА ХАРАКТЕРА',
  baggage: 'БАГАЖ',
  secret: 'СЕКРЕТНЫЙ ФАКТ',
  actionCard: 'СПЕЦКАРТА ДЕЙСТВИЯ'
};

interface VideoGridProps {
  players: Record<string, Player>;
  currentSocketId: string;
  onToggleMedia: (audioMuted: boolean, videoOff: boolean) => void;
}

export const VideoGrid: React.FC<VideoGridProps> = ({
  players,
  currentSocketId,
  onToggleMedia
}) => {
  const [remoteStreams, setRemoteStreams] = useState<Record<string, MediaStream>>({});
  const [audioMuted, setAudioMuted] = useState(false);
  const [videoOff, setVideoOff] = useState(false);
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
      }
    );

    const handleUserJoined = ({ socketId }: { socketId: string }) => {
      // Existing peers initiate the connection towards the newcomer.
      webRTCManager.createPeer(socketId, true);
    };
    const handleReceiveSignal = ({ callerId, signalData }: { callerId: string; signalData: any }) => {
      webRTCManager.handleIncomingSignal(callerId, signalData);
    };
    const handleSignalReturned = ({ id, signalData }: { id: string; signalData: any }) => {
      webRTCManager.handleIncomingSignal(id, signalData);
    };
    const handleUserLeft = ({ socketId }: { socketId: string }) => {
      webRTCManager.removePeer(socketId);
    };

    // Only start signaling once our own local stream (camera/mic or the
    // fallback dummy stream) is ready, so outgoing offers already carry tracks.
    webRTCManager.getLocalStream(true, true).then(stream => {
      if (!mounted) return;
      if (stream && localVideoRef.current) {
        localVideoRef.current.srcObject = stream;
      }

      socket.on('user_joined_webrtc', handleUserJoined);
      socket.on('receive_signal', handleReceiveSignal);
      socket.on('signal_returned', handleSignalReturned);
      socket.on('user_left_webrtc', handleUserLeft);
    });

    return () => {
      mounted = false;
      socket.off('user_joined_webrtc', handleUserJoined);
      socket.off('receive_signal', handleReceiveSignal);
      socket.off('signal_returned', handleSignalReturned);
      socket.off('user_left_webrtc', handleUserLeft);
      webRTCManager.destroy();
    };
  }, []);

  const handleToggleAudio = () => {
    const nextMuted = !audioMuted;
    setAudioMuted(nextMuted);
    webRTCManager.toggleAudio(!nextMuted);
    onToggleMedia(nextMuted, videoOff);
  };

  const handleToggleVideo = () => {
    const nextVideoOff = !videoOff;
    setVideoOff(nextVideoOff);
    webRTCManager.toggleVideo(!nextVideoOff);
    onToggleMedia(audioMuted, nextVideoOff);
  };

  const playerList = Object.values(players);

  return (
    <div className="flex flex-col h-full overflow-hidden bg-slate-900/80 border border-slate-800 notch p-3.5 shadow-2xl">
      <div className="flex items-center justify-between mb-2.5 border-b border-slate-800 pb-2 shrink-0">
        <h3 className="text-xs font-bold text-slate-300 uppercase tracking-wider flex items-center gap-2 font-mono">
          <Video className="w-4 h-4 text-amber-400" /> ТРАНСЛЯЦИЯ ИЗ КАМЕР БУНКЕРА ({playerList.length})
        </h3>

        {/* Local Quick Media Controls */}
        <div className="flex items-center gap-2">
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
      <div className="flex-1 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2.5 overflow-y-auto pr-1">
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
              onCardClick={(card) => setInspected({ playerName: player.name, card })}
            />
          );
        })}
      </div>

      {/* Revealed-card detail popup — shows what a pill only had room to hint at */}
      {inspected && (
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
        </div>
      )}
    </div>

  );
};

interface PlayerVideoCardProps {
  player: Player;
  isSelf: boolean;
  localVideoRef?: React.RefObject<HTMLVideoElement>;
  remoteStream?: MediaStream;
  onCardClick: (card: Card) => void;
}

const PlayerVideoCard: React.FC<PlayerVideoCardProps> = ({
  player,
  isSelf,
  localVideoRef,
  remoteStream,
  onCardClick
}) => {
  const remoteVideoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    if (!isSelf && remoteStream && remoteVideoRef.current) {
      remoteVideoRef.current.srcObject = remoteStream;
    }
  }, [isSelf, remoteStream]);

  return (
    <div
      className={`relative aspect-video overflow-hidden bg-slate-950 border transition-all ${
        player.isExiled
          ? 'border-red-950 opacity-60 grayscale'
          : isSelf
          ? 'border-amber-500/60 shadow-md shadow-amber-500/10'
          : 'border-slate-800'
      }`}
    >
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

      {/* Fallback when video is off */}
      {(player.videoOff || (!isSelf && !remoteStream)) && (
        <div className="w-full h-full flex flex-col items-center justify-center bg-slate-950 text-slate-600">
          <div className="text-3xl mb-1">☣️</div>
          <span className="text-[10px] font-mono text-slate-500">СИГНАЛ ВИДЕО ОГРАНИЧЕН</span>
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

      {/* Revealed Cards Pills Overlay — click a pill to read the full card */}
      {player.cards && (
        <div className="absolute bottom-10 left-2 right-2 flex flex-wrap gap-1 max-h-12 overflow-hidden">
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

      {/* Bottom Name overlay */}
      <div className="absolute bottom-0 inset-x-0 bg-gradient-to-t from-slate-950 via-slate-950/80 to-transparent p-2 pt-4 flex items-center justify-between">
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
