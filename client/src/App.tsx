import React, { useEffect, useState } from 'react';
import { socket } from './services/socket';
import { RoomState, CardType } from './types/game';
import { Lobby } from './components/Lobby';
import { VideoGrid } from './components/VideoGrid';
import { ShelterInfo } from './components/ShelterInfo';
import { ChatPanel } from './components/ChatPanel';
import { VotingModal } from './components/VotingModal';
import { GameOver } from './components/GameOver';
import { BottomControlBar } from './components/BottomControlBar';
import { Shield } from './components/icons';
import { saveSession, loadSession, clearSession } from './utils/session';

export const App: React.FC = () => {
  const [room, setRoom] = useState<RoomState | null>(null);
  const [socketId, setSocketId] = useState<string>('');
  // Gates the very first render behind an attempted reconnect, so a page
  // refresh mid-game doesn't flash the join screen before snapping back.
  const [restoring, setRestoring] = useState<boolean>(() => !!loadSession());

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

    socket.on('room_updated', (updatedRoom: RoomState) => {
      setRoom(updatedRoom);
    });

    socket.on('game_started', (startedRoom: RoomState) => {
      setRoom(startedRoom);
    });

    return () => {
      socket.off('connect', handleConnect);
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

  const handleUpdateSettings = (settings: { maxPlayers?: number; turnDuration?: number }) => {
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
    if (room) {
      socket.emit('toggle_media', { code: room.code, audioMuted, videoOff });
    }
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

  // Screen routing
  if (restoring) {
    return (
      <div className="min-h-screen bg-[#0b0e14] text-slate-100 flex items-center justify-center p-4">
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
        className="min-h-screen text-slate-100 p-4 relative bg-[#0b0e14] bg-cover bg-center"
        style={{ backgroundImage: "url(/backgrounds/main2.jpg)" }}
      >
        {/* Darkening overlay — keeps the entry/waiting-room cards (already
            semi-opaque, bg-slate-900/90) readable over the bright control
            panel photo, and lets the image stay atmospheric rather than
            competing with the UI for attention. */}
        <div className="absolute inset-0 bg-slate-950/75" />
        <div className="relative z-10">
          <Lobby
            onCreateRoom={handleCreateRoom}
            onJoinRoom={handleJoinRoom}
            onStartGame={handleStartGame}
            onUpdateSettings={handleUpdateSettings}
            onAddBot={handleAddBot}
            onFillBots={handleFillBots}
            onLeaveGame={handleLeaveGame}
            room={room}
            currentSocketId={currentSocketId}
          />
        </div>
      </div>
    );
  }

  if (room.phase === 'GAME_OVER') {
    return (
      <div className="min-h-screen bg-[#0b0e14] text-slate-100 p-4">
        <GameOver room={room} currentSocketId={currentSocketId} onRestart={handleRestart} />
      </div>
    );
  }

  // Unified Single Screen Layout (Единый экран игры)
  return (
    <div className="h-screen w-screen bg-[#0b0e14] text-slate-100 flex flex-col overflow-hidden select-none">
      {/* Top Header: Compact Shelter Status Banner */}
      <div className="shrink-0 p-2.5 pb-0">
        <ShelterInfo room={room} currentSocketId={currentSocketId} onAdvancePhase={handleAdvancePhase} />
      </div>

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
      <div className="flex-1 flex overflow-hidden p-2.5 gap-2.5 min-h-0">
        {/* Participants Video Grid */}
        <div className="flex-1 h-full min-w-0 min-h-0">
          <VideoGrid
            players={room.players}
            currentSocketId={currentSocketId}
            onToggleMedia={handleToggleMedia}
          />
        </div>

        {/* Dedicated Chat Window (Right Sidebar) */}
        <div className="w-80 lg:w-96 shrink-0 hidden md:flex flex-col h-full min-h-0">
          <ChatPanel
            messages={room.chatMessages || []}
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
        />
      )}

      {/* Voting Modal Overlay */}
      {room.phase === 'VOTING' && (
        <VotingModal
          players={room.players}
          currentSocketId={currentSocketId}
          onCastVote={handleCastVote}
        />
      )}
    </div>
  );
};

export default App;
