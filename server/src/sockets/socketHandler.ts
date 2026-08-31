import { Server, Socket } from 'socket.io';
import { GameEngine } from '../game/GameEngine';
import { botManager } from '../game/BotManager';

export function registerSocketHandlers(io: Server, gameEngine: GameEngine) {
  io.on('connection', (socket: Socket) => {
    console.log(`[Socket] Connected: ${socket.id}`);

    // Create Room
    socket.on('create_room', ({ name, avatar }, callback) => {
      const room = gameEngine.createRoom(socket.id, name, avatar);
      socket.join(room.code);
      if (typeof callback === 'function') callback({ success: true, room });
      io.to(room.code).emit('room_updated', room);
    });

    // Join Room
    socket.on('join_room', ({ code, name, avatar }, callback) => {
      const room = gameEngine.joinRoom(code, socket.id, name, avatar);
      if (!room) {
        if (typeof callback === 'function') callback({ success: false, message: 'Комната не найдена или заполнена' });
        return;
      }

      socket.join(room.code);
      if (typeof callback === 'function') callback({ success: true, room });

      // Notify existing players in room for WebRTC peer connection creation
      socket.to(room.code).emit('user_joined_webrtc', { socketId: socket.id, name });
      io.to(room.code).emit('room_updated', room);
    });

    // Add Single Bot (Host control)
    socket.on('add_bot', ({ code }) => {
      const room = gameEngine.getRoom(code);
      if (room && room.hostId === socket.id) {
        const updated = botManager.addBot(room, gameEngine);
        if (updated) {
          io.to(code).emit('room_updated', updated);
        }
      }
    });

    // Fill Room With Bots (Host control)
    socket.on('fill_bots', ({ code }) => {
      const room = gameEngine.getRoom(code);
      if (room && room.hostId === socket.id) {
        const updated = botManager.fillWithBots(room, gameEngine, 6);
        io.to(code).emit('room_updated', updated);
      }
    });

    // WebRTC Peer-to-Peer Signaling
    socket.on('send_signal', ({ targetId, signalData }) => {
      io.to(targetId).emit('receive_signal', {
        callerId: socket.id,
        signalData
      });
    });

    socket.on('return_signal', ({ callerId, signalData }) => {
      io.to(callerId).emit('signal_returned', {
        id: socket.id,
        signalData
      });
    });

    // Media Status Toggle (Mic / Camera)
    socket.on('toggle_media', ({ code, audioMuted, videoOff }) => {
      const room = gameEngine.getRoom(code);
      if (room && room.players[socket.id]) {
        room.players[socket.id].audioMuted = audioMuted;
        room.players[socket.id].videoOff = videoOff;
        io.to(code).emit('room_updated', room);
      }
    });

    // Settings Update
    socket.on('update_settings', ({ code, settings }) => {
      const room = gameEngine.updateSettings(code, socket.id, settings);
      if (room) {
        io.to(code).emit('room_updated', room);
      }
    });

    // Start Game
    socket.on('start_game', ({ code }) => {
      const room = gameEngine.startGame(code, socket.id);
      if (room) {
        io.to(code).emit('game_started', room);
        io.to(code).emit('room_updated', room);
        botManager.handlePhaseAutomation(room, gameEngine, io);
      }
    });

    // Reveal Card
    socket.on('reveal_card', ({ code, cardType }) => {
      const room = gameEngine.revealCard(code, socket.id, cardType);
      if (room) {
        io.to(code).emit('room_updated', room);
      }
    });

    // Cast Vote
    socket.on('cast_vote', ({ code, targetId }) => {
      const room = gameEngine.castVote(code, socket.id, targetId);
      if (room) {
        io.to(code).emit('room_updated', room);
      }
    });

    // Use Special Action Card
    socket.on('use_action_card', ({ code, targetId }) => {
      const room = gameEngine.useActionCard(code, socket.id, targetId);
      if (room) {
        io.to(code).emit('room_updated', room);
      }
    });

    // Advance Game Phase
    socket.on('advance_phase', ({ code }) => {
      const room = gameEngine.getRoom(code);
      if (room && room.hostId === socket.id) {
        const updatedRoom = gameEngine.advancePhase(code);
        if (updatedRoom) {
          io.to(code).emit('room_updated', updatedRoom);
          botManager.handlePhaseAutomation(updatedRoom, gameEngine, io);
        }
      }
    });

    // Chat Message
    socket.on('send_chat', ({ code, text }) => {
      const room = gameEngine.addChatMessage(code, socket.id, text);
      if (room) {
        io.to(code).emit('room_updated', room);
      }
    });

    // Disconnect
    socket.on('disconnect', () => {
      console.log(`[Socket] Disconnected: ${socket.id}`);
      const { room, code } = gameEngine.leaveRoom(socket.id);
      if (code) {
        socket.to(code).emit('user_left_webrtc', { socketId: socket.id });
        if (room) {
          io.to(code).emit('room_updated', room);
        }
      }
    });
  });
}
