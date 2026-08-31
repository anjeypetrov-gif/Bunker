import { Server, Socket } from 'socket.io';
import { GameEngine } from '../game/GameEngine';
import { botManager } from '../game/BotManager';

// How long a disconnected player's slot is kept warm before they're
// actually removed from the room. Covers page refreshes and brief network
// drops — both disconnect and reconnect the socket, just very quickly.
const RECONNECT_GRACE_MS = 20000;

export function registerSocketHandlers(io: Server, gameEngine: GameEngine) {
  // Pending "actually remove this player" timers, keyed by the socket id
  // that disconnected. Cleared if that same player reconnects in time.
  const disconnectTimers = new Map<string, NodeJS.Timeout>();

  io.on('connection', (socket: Socket) => {
    console.log(`[Socket] Connected: ${socket.id}`);

    // Create Room
    socket.on('create_room', ({ name, avatar }, callback) => {
      const { room, sessionToken } = gameEngine.createRoom(socket.id, name, avatar);
      socket.join(room.code);
      if (typeof callback === 'function') callback({ success: true, room, sessionToken });
      io.to(room.code).emit('room_updated', room);
    });

    // Join Room
    socket.on('join_room', ({ code, name, avatar }, callback) => {
      const result = gameEngine.joinRoom(code, socket.id, name, avatar);
      if (!result) {
        if (typeof callback === 'function') callback({ success: false, message: 'Комната не найдена или заполнена' });
        return;
      }
      const { room, sessionToken } = result;

      socket.join(room.code);
      if (typeof callback === 'function') callback({ success: true, room, sessionToken });

      // Notify existing players in room for WebRTC peer connection creation
      socket.to(room.code).emit('user_joined_webrtc', { socketId: socket.id, name });
      io.to(room.code).emit('room_updated', room);
    });

    // Rejoin Room — reattaches a reconnecting browser (page refresh, brief
    // network drop) to its existing player slot via its private session
    // token, instead of it being bounced back to the join screen.
    socket.on('rejoin_room', ({ code, sessionToken }, callback) => {
      const result = gameEngine.reconnectPlayer(code, sessionToken, socket.id);
      if (!result) {
        if (typeof callback === 'function') callback({ success: false });
        return;
      }
      const { room, previousSocketId } = result;

      socket.join(room.code);

      const pendingRemoval = disconnectTimers.get(previousSocketId);
      if (pendingRemoval) {
        clearTimeout(pendingRemoval);
        disconnectTimers.delete(previousSocketId);
      }

      if (typeof callback === 'function') callback({ success: true, room });

      // Re-establish WebRTC peers under the new socket id.
      socket.to(room.code).emit('user_left_webrtc', { socketId: previousSocketId });
      socket.to(room.code).emit('user_joined_webrtc', { socketId: socket.id, name: room.players[socket.id]?.name });
      io.to(room.code).emit('room_updated', room);
    });

    // Leave Room — an intentional exit (the player clicked "Leave"), unlike
    // a disconnect: remove them immediately, no reconnect grace period.
    socket.on('leave_room', ({ code }) => {
      const pending = disconnectTimers.get(socket.id);
      if (pending) {
        clearTimeout(pending);
        disconnectTimers.delete(socket.id);
      }

      const result = gameEngine.leaveRoom(socket.id);
      socket.leave(code);

      if (result.code) {
        socket.to(result.code).emit('user_left_webrtc', { socketId: socket.id });
        if (result.room) {
          io.to(result.code).emit('room_updated', result.room);
        }
      }
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

    // Disconnect — don't remove the player immediately. Mark them offline
    // and give the browser a grace window to reconnect (rejoin_room) before
    // actually kicking them out, so a page refresh or a brief network drop
    // doesn't bounce anyone back to the join screen or hand off the host.
    socket.on('disconnect', () => {
      console.log(`[Socket] Disconnected: ${socket.id}`);

      const info = gameEngine.markDisconnected(socket.id);
      if (info) {
        io.to(info.code).emit('room_updated', info.room);
      }

      const timer = setTimeout(() => {
        disconnectTimers.delete(socket.id);
        const { room, code } = gameEngine.leaveRoom(socket.id);
        if (code) {
          socket.to(code).emit('user_left_webrtc', { socketId: socket.id });
          if (room) {
            io.to(code).emit('room_updated', room);
          }
        }
      }, RECONNECT_GRACE_MS);

      disconnectTimers.set(socket.id, timer);
    });
  });
}
