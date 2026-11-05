import React, { useEffect, useState } from 'react';
import { webRTCManager } from './services/webrtc';
import { socket } from './services/socket';
import { RoomState, CardType } from './types/game';
import { Lobby } from './components/Lobby';
import { VideoGrid } from './components/VideoGrid';
import { ShelterInfo } from './components/ShelterInfo';
import { ChatPanel } from './components/ChatPanel';
import { VotingModal } from './components/VotingModal';
import { GameOver } from './components/GameOver';
import { BottomControlBar } from './components/BottomControlBar';
import { FilmEffect } from './components/FilmEffect';
import { VoteReveal } from './components/VoteReveal';
import { sfx } from './utils/sfx';
import { EventBanner } from './components/EventBanner';
import { SpeechBanner } from './components/SpeechBanner';
import { HintBar, HelpSheet } from './components/Hints';
import { useSpeechClock } from './hooks/useSpeechClock';
import { Shield } from './components/icons';
import { saveSession, loadSession, clearSession } from './utils/session';

// Entry/lobby screen background — picked randomly once per page load from
// whichever control-room photos live in public/backgrounds/. Add more files
// there and list them here to grow the rotation.
const ENTRY_BACKGROUNDS = ['/backgrounds/main.jpg', '/backgrounds/main2.jpg'];

export const App: React.FC = () => {
  const [room, setRoom] = useState<RoomState | null>(null);
  const [socketId, setSocketId] = useState<string>('');
  // Mobile (<md): камеры и чат переключаются вкладками вместо двух колонок.
  const [mobileTab, setMobileTab] = useState<'players' | 'chat'>('players');
  const [seenChatCount, setSeenChatCount] = useState(0);
  const chatCount = room?.chatMessages?.length ?? 0;
  useEffect(() => {
    if (mobileTab === 'chat') setSeenChatCount(chatCount);
  }, [mobileTab, chatCount]);
  const unreadChat = mobileTab === 'chat' ? 0 : Math.max(0, chatCount - seenChatCount);
  // Gates the very first render behind an attempted reconnect, so a page
  // refresh mid-game doesn't flash the join screen before snapping back.
  const [helpOpen, setHelpOpen] = useState(false);
  const phaseForSfx = room?.phase;
  useEffect(() => {
    if (phaseForSfx === 'VOTING') sfx.siren();
  }, [phaseForSfx]);
  const [restoring, setRestoring] = useState<boolean>(() => !!loadSession());
  // Picked once with a lazy initializer, not on every render — this
  // component re-renders on every 'room_updated' (i.e. constantly while
  // players sit in the lobby), and re-rolling then would make the
  // background flicker between photos instead of staying put for the visit.
  const [entryBackground] = useState(
    () => ENTRY_BACKGROUNDS[Math.floor(Math.random() * ENTRY_BACKGROUNDS.length)]
  );

  useEffect(() => {
    const handleConnect = () => {
      setSocketId(socket.id || '');

      const session = loadSession();
      if (!session) {
        setRestoring(false);
        return;
      }

      // Fires on the very first connect AND every automatic reconnect
      // (page refresh = new socket entirely, brief network drop = same
      // socket instance gets a new id) — both cases need to re-attach to
      // the existing player slot the same way.
      socket.emit('rejoin_room', session, (res: any) => {
        if (res?.success) {
          setRoom(res.room);
        } else {
          // Room is gone, or the grace window already expired — nothing to
          // rejoin, fall back to the ordinary join screen.
          clearSession();
        }
        setRestoring(false);
      });
    };

    socket.on('connect', handleConnect);

    socket.on('kicked', () => {
      clearSession();
      setRoom(null);
      alert('Хост исключил вас из комнаты.');
    });

    // Ambient-звук можно запускать только после жеста пользователя.
    const startAudio = () => { sfx.startAmbient(); window.removeEventListener('pointerdown', startAudio); };
    window.addEventListener('pointerdown', startAudio);

    socket.on('room_updated', (updatedRoom: RoomState) => {
      setRoom(updatedRoom);
    });

    socket.on('game_started', (startedRoom: RoomState) => {
      setRoom(startedRoom);
    });

    return () => {
      socket.off('connect', handleConnect);
      socket.off('kicked');
      socket.off('room_updated');
      socket.off('game_started');
    };
  }, []);

  const handleCreateRoom = (name: string, avatar: string) => {
    socket.emit('create_room', { name, avatar }, (res: any) => {
      if (res.success) {
        setRoom(res.room);
        saveSession(res.room.code, res.sessionToken);
      }
    });
  };

  const handleJoinRoom = (code: string, name: string, avatar: string) => {
    socket.emit('join_room', { code, name, avatar }, (res: any) => {
      if (res.success) {
        setRoom(res.room);
        saveSession(res.room.code, res.sessionToken);
      } else {
        alert(res.message || 'Ошибка подключения');
      }
    });
  };

  const handleStartGame = () => {
    if (room) {
      socket.emit('start_game', { code: room.code });
    }
  };

  const handleUpdateSettings = (settings: { maxPlayers?: number; turnDuration?: number; secretVoting?: boolean; lineageEnabled?: boolean }) => {
    if (room) {
      socket.emit('update_settings', { code: room.code, settings });
    }
  };

  const handleAddBot = () => {
    if (room) {
      socket.emit('add_bot', { code: room.code });
    }
  };

  const handleFillBots = () => {
    if (room) {
      socket.emit('fill_bots', { code: room.code });
    }
  };

  const handleAdvancePhase = () => {
    if (room) {
      socket.emit('advance_phase', { code: room.code });
    }
  };

  const handleRevealCard = (cardType: CardType) => {
    if (room) {
      socket.emit('reveal_card', { code: room.code, cardType });
    }
  };

  const handleUseActionCard = (targetId?: string) => {
    if (room) {
      socket.emit('use_action_card', { code: room.code, targetId });
    }
  };

  const handleCastVote = (targetId: string) => {
    if (room) {
      socket.emit('cast_vote', { code: room.code, targetId });
    }
  };

  const handleSendMessage = (text: string) => {
    if (room) {
      socket.emit('send_chat', { code: room.code, text });
    }
  };

  const handleToggleMedia = (audioMuted: boolean, videoOff: boolean) => {
    // Реально включаем/выключаем дорожки — единая точка для обеих панелей.
    webRTCManager.toggleAudio(!audioMuted);
    webRTCManager.toggleVideo(!videoOff);
    if (room) {
      socket.emit('toggle_media', { code: room.code, audioMuted, videoOff });
    }
  };

  const handleTogglePause = () => {
    if (room) socket.emit('toggle_pause', { code: room.code });
  };

  const handleKickPlayer = (targetId: string) => {
    if (room) socket.emit('kick_player', { code: room.code, targetId });
  };

  const handleEndSpeech = () => {
    if (room) {
      socket.emit('end_speech', { code: room.code });
    }
  };

  const lineageEmit = (event: string, extra: Record<string, unknown> = {}) => {
    if (room) socket.emit(event, { code: room.code, ...extra });
  };

  const handleRestart = () => {
    if (room) {
      socket.emit('start_game', { code: room.code });
    }
  };

  const handleLeaveGame = () => {
    if (room) {
      socket.emit('leave_room', { code: room.code });
    }
    clearSession();
    setRoom(null);
  };

  const currentSocketId = socketId || socket.id || '';
  const currentPlayer = room?.players[currentSocketId];
  // Хуки вызываются до любых return — room может быть null.
  const speechSeconds = useSpeechClock(room ?? ({ phase: 'LOBBY', speakerId: null, speechRemainingMs: 0 } as any));

  // Screen routing
  if (restoring) {
    return (
      <div className="min-h-screen bg-page text-slate-100 flex items-center justify-center p-4">
        <div className="flex flex-col items-center gap-3 text-slate-400 font-mono text-sm">
          <Shield className="w-8 h-8 text-amber-400 animate-pulse" />
          <span>ВОССТАНОВЛЕНИЕ СЕССИИ...</span>
        </div>
      </div>
    );
  }

  if (!room || room.phase === 'LOBBY') {
    return (
      <div
        className="min-h-screen text-slate-100 p-4 relative bg-page bg-cover bg-center"
        style={{ backgroundImage: `url(${entryBackground})` }}
      >
        {/* Darkening overlay — keeps the entry/waiting-room cards (already
            semi-opaque, bg-slate-900/90) readable over the bright control
            panel photo, and lets the image stay atmospheric rather than
            competing with the UI for attention. */}
        <div className="absolute inset-0 bg-slate-950/75" />
        <FilmEffect />
        <div className="relative z-10">
          <Lobby
            onCreateRoom={handleCreateRoom}
            onJoinRoom={handleJoinRoom}
            onStartGame={handleStartGame}
            onUpdateSettings={handleUpdateSettings}
            onAddBot={handleAddBot}
            onFillBots={handleFillBots}
            onLeaveGame={handleLeaveGame}
            onKickPlayer={handleKickPlayer}
            room={room}
            currentSocketId={currentSocketId}
          />
        </div>
      </div>
    );
  }

  if (room.phase === 'GAME_OVER') {
    return (
      <div className="min-h-screen bg-page text-slate-100 p-4">
        <GameOver
          room={room}
          currentSocketId={currentSocketId}
          onRestart={handleRestart}
          onLeave={handleLeaveGame}
          onStartLineage={() => lineageEmit('start_lineage')}
          onLineageVote={(optionId) => lineageEmit('lineage_vote', { optionId })}
          onLineageResolve={() => lineageEmit('lineage_resolve')}
          onLineageNext={() => lineageEmit('lineage_next')}
        />
      </div>
    );
  }

  // Unified Single Screen Layout (Единый экран игры)
  return (
    <div className="h-[100dvh] w-screen bg-page text-slate-100 flex flex-col overflow-hidden select-none">
      {/* Top Header: Compact Shelter Status Banner */}
      <div className="shrink-0 p-2.5 pb-0">
        <ShelterInfo room={room} currentSocketId={currentSocketId} onAdvancePhase={handleAdvancePhase} />
      </div>

      <EventBanner room={room} />
      <SpeechBanner room={room} currentSocketId={currentSocketId} secondsLeft={speechSeconds} onEndSpeech={handleEndSpeech} />
      <HintBar room={room} currentSocketId={currentSocketId} onOpenHelp={() => setHelpOpen(true)} />
      {helpOpen && <HelpSheet onClose={() => setHelpOpen(false)} />}

      {/* Center Main Area: Left = Cameras Grid, Right = Dedicated Chat Window.
          min-h-0 on this row and both its children is load-bearing, not
          decorative: without it, a flex item's default min-height is "auto"
          (its content's natural size), not 0 — so if either panel's content
          ever needs more room than this row actually has (it did: see
          ChatPanel.tsx history), the row silently grows past its allotted
          space instead of scrolling internally, `overflow-hidden` quietly
          turns it into an unintended scroll container, and the chat's
          autoscroll-to-latest-message then drags this WHOLE row (video grid
          included) up to reveal the new message, clipping the video grid's
          own header and top row of tiles above the viewport. */}
      {/* Mobile tab switcher: cameras / chat */}
      <div className="md:hidden shrink-0 grid grid-cols-2 gap-2 px-2.5 pt-2">
        {([['players', 'ИГРОКИ'], ['chat', 'ЧАТ']] as const).map(([key, label]) => (
          <button
            key={key}
            onClick={() => setMobileTab(key)}
            className={`py-2 notch-sm border text-xs font-mono font-bold flex items-center justify-center gap-2 cursor-pointer transition-colors ${
              mobileTab === key
                ? 'bg-amber-500/15 border-amber-500/60 text-amber-300'
                : 'bg-slate-900 border-slate-800 text-slate-400'
            }`}
          >
            {label}
            {key === 'chat' && unreadChat > 0 && (
              <span className="bg-amber-500 text-slate-950 text-[10px] font-black px-1.5 min-w-[18px] rounded-full">
                {unreadChat > 99 ? '99+' : unreadChat}
              </span>
            )}
          </button>
        ))}
      </div>

      <div className="flex-1 flex overflow-hidden p-2.5 gap-2.5 min-h-0">
        {/* Participants Video Grid */}
        <div className={`flex-1 h-full min-w-0 min-h-0 ${mobileTab === 'chat' ? 'hidden md:block' : ''}`}>
          <VideoGrid
            players={room.players}
            currentSocketId={currentSocketId}
            hostId={room.hostId}
            onKick={handleKickPlayer}
            speakerId={room.phase === 'DISCUSSION' ? room.speakerId : null}
            speechSeconds={speechSeconds}
            onToggleMedia={handleToggleMedia}
          />
        </div>

        {/* Dedicated Chat Window (Right Sidebar) */}
        <div className={`${mobileTab === 'chat' ? 'flex' : 'hidden'} md:flex w-full md:w-80 lg:w-96 md:shrink-0 flex-col h-full min-h-0`}>
          <ChatPanel
            messages={(room.chatMessages || []).filter(m => !m.ghost || !!currentPlayer?.isExiled)}
            ghostMode={!!currentPlayer?.isExiled}
            onSendMessage={handleSendMessage}
            currentSocketId={currentSocketId}
          />
        </div>
      </div>

      {/* Bottom Control Bar: Media Controls, Player Cards Hand, & Phase Actions */}
      {currentPlayer && (
        <BottomControlBar
          player={currentPlayer}
          room={room}
          currentSocketId={currentSocketId}
          onRevealCard={handleRevealCard}
          onUseActionCard={handleUseActionCard}
          onToggleMedia={handleToggleMedia}
          onAdvancePhase={handleAdvancePhase}
          onLeaveGame={handleLeaveGame}
          onTogglePause={handleTogglePause}
        />
      )}

      <VoteReveal room={room} />

      {room.paused && (
        <div className="fixed inset-0 z-[95] bg-slate-950/75 backdrop-blur-sm flex flex-col items-center justify-center gap-4 text-center p-6">
          <div className="text-5xl">⏸</div>
          <div className="text-2xl font-black text-amber-300 tracking-wider font-mono">ПАУЗА</div>
          <div className="text-sm text-slate-300 font-mono">Хост приостановил игру. Таймеры остановлены.</div>
          {room.hostId === currentSocketId && (
            <button onClick={handleTogglePause} className="px-6 py-3 notch-sm bg-amber-500 hover:bg-amber-400 text-slate-950 font-black text-sm uppercase cursor-pointer">
              Продолжить игру
            </button>
          )}
        </div>
      )}

      {/* Voting Modal Overlay */}
      {room.phase === 'VOTING' && (
        <VotingModal
          players={room.players}
          currentSocketId={currentSocketId}
          onCastVote={handleCastVote}
          secretVoting={room.secretVoting !== false}
        />
      )}
    </div>
  );
};

export default App;
