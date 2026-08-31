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

export const App: React.FC = () => {
  const [room, setRoom] = useState<RoomState | null>(null);
  const [socketId, setSocketId] = useState<string>('');

  useEffect(() => {
    socket.on('connect', () => {
      setSocketId(socket.id || '');
    });

    socket.on('room_updated', (updatedRoom: RoomState) => {
      setRoom(updatedRoom);
    });

    socket.on('game_started', (startedRoom: RoomState) => {
      setRoom(startedRoom);
    });

    return () => {
      socket.off('connect');
      socket.off('room_updated');
      socket.off('game_started');
    };
  }, []);

  const handleCreateRoom = (name: string, avatar: string) => {
    socket.emit('create_room', { name, avatar }, (res: any) => {
      if (res.success) {
        setRoom(res.room);
      }
    });
  };

  const handleJoinRoom = (code: string, name: string, avatar: string) => {
    socket.emit('join_room', { code, name, avatar }, (res: any) => {
      if (res.success) {
        setRoom(res.room);
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

  const currentSocketId = socketId || socket.id || '';
  const currentPlayer = room?.players[currentSocketId];

  // Screen routing
  if (!room || room.phase === 'LOBBY') {
    return (
      <div className="min-h-screen bg-[#0b0e14] text-slate-100 p-4">
        <Lobby
          onCreateRoom={handleCreateRoom}
          onJoinRoom={handleJoinRoom}
          onStartGame={handleStartGame}
          onUpdateSettings={handleUpdateSettings}
          onAddBot={handleAddBot}
          onFillBots={handleFillBots}
          room={room}
          currentSocketId={currentSocketId}
        />
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

      {/* Center Main Area: Left = Cameras Grid, Right = Dedicated Chat Window */}
      <div className="flex-1 flex overflow-hidden p-2.5 gap-2.5">
        {/* Participants Video Grid */}
        <div className="flex-1 h-full min-w-0">
          <VideoGrid
            players={room.players}
            currentSocketId={currentSocketId}
            onToggleMedia={handleToggleMedia}
          />
        </div>

        {/* Dedicated Chat Window (Right Sidebar) */}
        <div className="w-80 lg:w-96 shrink-0 hidden md:flex flex-col h-full">
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
