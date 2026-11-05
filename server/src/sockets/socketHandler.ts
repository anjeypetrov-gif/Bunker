import { emitRoom, sanitizeRoomFor, cleanText, cleanAvatar, cleanCode, isPlainObject, RateLimiter, clientIp, LIMITS } from '../security';
import { Server, Socket } from 'socket.io';
import { GameEngine } from '../game/GameEngine';
import { botManager } from '../game/BotManager';
import { stats } from '../stats';
import { track } from '../analytics';

// How long a disconnected player's slot is kept warm before they're
// actually removed from the room. Covers page refreshes and brief network
// drops — both disconnect and reconnect the socket, just very quickly.
export const RECONNECT_GRACE_MS = 20000;

export function registerSocketHandlers(io: Server, gameEngine: GameEngine) {
  // Pending "actually remove this player" timers, keyed by the socket id
  // that disconnected. Cleared if that same player reconnects in time.
  const disconnectTimers = new Map<string, NodeJS.Timeout>();

  // Движок сам переключает говорящего по таймеру — здесь только рассылка
  // состояния и запуск реплик ботов.
  gameEngine.onSpeakerChange = (room) => {
    emitRoom(io, room);
    botManager.scheduleBotSpeech(room, gameEngine, io);
  };

  // Ограничения частоты: общий поток событий, создание/вход в комнаты по IP, чат.
  const generalLimit = new RateLimiter(150, 10_000);   // событий на сокет за 10 с
  const roomEntryLimit = new RateLimiter(20, 60_000);   // создание/вход по IP за минуту
  const chatLimit = new RateLimiter(10, 10_000);        // сообщений чата за 10 с

  io.on('connection', (socket: Socket) => {
    console.log(`[Socket] Connected: ${socket.id}`);
    const ip = clientIp(socket);

    // Безопасная подписка: проверяет форму данных, ограничивает частоту и не даёт
    // ошибке в обработчике уронить весь сервер.
    const on = (event: string, fn: (payload: any, cb?: any) => void) => {
      socket.on(event, (...args: any[]) => {
        try {
          if (!generalLimit.take(socket.id)) return;
          const raw = args[0];
          const payload: Record<string, any> = isPlainObject(raw) ? { ...raw } : {};
          if ('code' in payload) payload.code = cleanCode(payload.code);
          if ('targetId' in payload) payload.targetId = typeof payload.targetId === 'string' ? payload.targetId.slice(0, 64) : '';
          if ('cardType' in payload) payload.cardType = typeof payload.cardType === 'string' ? payload.cardType.slice(0, 24) : '';
          const cb = typeof args[args.length - 1] === 'function' ? args[args.length - 1] : undefined;
          fn(payload, cb);
        } catch (e) {
          console.error(`[Socket] Ошибка в обработчике ${event}:`, e);
        }
      });
    };

    // Create Room
    on('create_room', ({ name, avatar }, callback) => {
      if (!roomEntryLimit.take('c:' + ip)) { if (typeof callback === 'function') callback({ success: false, message: 'Слишком часто. Подождите минуту.' }); return; }
      const { room, sessionToken } = gameEngine.createRoom(socket.id, cleanText(name, LIMITS.name), cleanAvatar(avatar));
      stats.room();
      track({ k: 'room' });
      socket.join(room.code);
      if (typeof callback === 'function') callback({ success: true, room: sanitizeRoomFor(room, socket.id), sessionToken });
      emitRoom(io, room);
    });

    // Join Room
    on('join_room', ({ code, name, avatar }, callback) => {
      if (!roomEntryLimit.take('j:' + ip)) { if (typeof callback === 'function') callback({ success: false, message: 'Слишком много попыток. Подождите минуту.' }); return; }
      const result = gameEngine.joinRoom(code, socket.id, cleanText(name, LIMITS.name), cleanAvatar(avatar));
      if (!result) {
        if (typeof callback === 'function') callback({ success: false, message: 'Комната не найдена или заполнена' });
        return;
      }
      const { room, sessionToken } = result;
      track({ k: 'join' });

      socket.join(room.code);
      if (typeof callback === 'function') callback({ success: true, room: sanitizeRoomFor(room, socket.id), sessionToken });

      // Notify existing players in room for WebRTC peer connection creation
      socket.to(room.code).emit('user_joined_webrtc', { socketId: socket.id, name });
      emitRoom(io, room);
    });

    // Rejoin Room — reattaches a reconnecting browser (page refresh, brief
    // network drop) to its existing player slot via its private session
    // token, instead of it being bounced back to the join screen.
    on('rejoin_room', ({ code, sessionToken }, callback) => {
      if (typeof sessionToken !== 'string' || sessionToken.length > 64) { if (typeof callback === 'function') callback({ success: false }); return; }
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

      if (typeof callback === 'function') callback({ success: true, room: sanitizeRoomFor(room, socket.id) });

      // Re-establish WebRTC peers under the new socket id.
      socket.to(room.code).emit('user_left_webrtc', { socketId: previousSocketId });
      socket.to(room.code).emit('user_joined_webrtc', { socketId: socket.id, name: room.players[socket.id]?.name });
      emitRoom(io, room);
    });

    // Leave Room — an intentional exit (the player clicked "Leave"), unlike
    // a disconnect: remove them immediately, no reconnect grace period.
    on('leave_room', ({ code }) => {
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
          emitRoom(io, result.room);
        }
      }
    });

    // Add Single Bot (Host control)
    on('add_bot', ({ code }) => {
      const room = gameEngine.getRoom(code);
      if (room && room.hostId === socket.id) {
        const updated = botManager.addBot(room, gameEngine);
        if (updated) {
          emitRoom(io, updated);
        }
      }
    });

    // Fill Room With Bots (Host control)
    on('fill_bots', ({ code }) => {
      const room = gameEngine.getRoom(code);
      if (room && room.hostId === socket.id) {
        const updated = botManager.fillWithBots(room, gameEngine, 6);
        emitRoom(io, updated);
      }
    });

    // WebRTC Peer-to-Peer Signaling
    const sameRoom = (a: string, b: string): boolean => {
      const r = gameEngine.getRoomBySocket(a);
      return !!r && !!r.players[b];
    };
    const signalOk = (d: unknown) => { try { return JSON.stringify(d ?? null).length <= LIMITS.signal; } catch { return false; } };
    on('send_signal', ({ targetId, signalData }) => {
      if (!targetId || !sameRoom(socket.id, targetId) || !signalOk(signalData)) return;
      io.to(targetId).emit('receive_signal', {
        callerId: socket.id,
        signalData
      });
    });

    on('return_signal', ({ callerId, signalData }) => {
      if (typeof callerId !== 'string' || !sameRoom(socket.id, callerId) || !signalOk(signalData)) return;
      io.to(callerId).emit('signal_returned', {
        id: socket.id,
        signalData
      });
    });

    // Media Status Toggle (Mic / Camera)
    on('toggle_media', ({ code, audioMuted, videoOff }) => {
      const room = gameEngine.getRoom(code);
      if (room && room.players[socket.id]) {
        room.players[socket.id].audioMuted = audioMuted === true;
        room.players[socket.id].videoOff = videoOff === true;
        emitRoom(io, room);
      }
    });

    // Settings Update
    on('update_settings', ({ code, settings }) => {
      const st = isPlainObject(settings) ? settings : {};
      const int = (v: unknown, lo: number, hi: number) => (typeof v === 'number' && Number.isFinite(v) ? Math.min(hi, Math.max(lo, Math.round(v))) : undefined);
      const room = gameEngine.updateSettings(code, socket.id, {
        maxPlayers: int(st.maxPlayers, LIMITS.minPlayers, LIMITS.maxPlayers),
        turnDuration: int(st.turnDuration, LIMITS.minTurn, LIMITS.maxTurn),
        secretVoting: typeof st.secretVoting === 'boolean' ? st.secretVoting : undefined,
        lineageEnabled: typeof st.lineageEnabled === 'boolean' ? st.lineageEnabled : undefined
      });
      if (room) {
        emitRoom(io, room);
      }
    });

    // Start Game
    on('start_game', ({ code }) => {
      const room = gameEngine.startGame(code, socket.id);
      if (room) {
        emitRoom(io, room, 'game_started');
        emitRoom(io, room);
        botManager.handlePhaseAutomation(room, gameEngine, io);
      }
    });

    // Reveal Card
    on('reveal_card', ({ code, cardType }) => {
      const room = gameEngine.revealCard(code, socket.id, cardType);
      if (room) {
        emitRoom(io, room);
      }
    });

    // Cast Vote
    on('cast_vote', ({ code, targetId }) => {
      const room = gameEngine.castVote(code, socket.id, targetId);
      if (room) {
        emitRoom(io, room);
        // Re-runs bot automation for whatever phase this vote left the room
        // in — harmless while still VOTING (handlePhaseAutomation guards
        // against rescheduling bot votes twice), and is what lets bots
        // react in chat when a human's vote is the one that completes the
        // round and flips the phase to VOTE_RESULTS.
        botManager.handlePhaseAutomation(room, gameEngine, io);
      }
    });

    // Use Special Action Card
    on('use_action_card', ({ code, targetId }) => {
      const room = gameEngine.useActionCard(code, socket.id, targetId);
      if (room) {
        emitRoom(io, room);
      }
    });

    // Advance Game Phase
    on('advance_phase', ({ code }) => {
      const room = gameEngine.getRoom(code);
      if (room && room.hostId === socket.id) {
        const updatedRoom = gameEngine.advancePhase(code);
        if (updatedRoom) {
          emitRoom(io, updatedRoom);
          botManager.handlePhaseAutomation(updatedRoom, gameEngine, io);
        }
      }
    });

    // «Продолжить род»
    on('start_lineage', ({ code }) => {
      const room = gameEngine.beginLineage(cleanCode(code), socket.id);
      if (room) emitRoom(io, room);
    });
    on('lineage_vote', ({ code, optionId }) => {
      const room = gameEngine.voteLineage(cleanCode(code), socket.id, cleanText(optionId, 24));
      if (room) emitRoom(io, room);
    });
    on('lineage_resolve', ({ code }) => {
      const room = gameEngine.resolveLineage(cleanCode(code), socket.id);
      if (room) emitRoom(io, room);
    });
    on('lineage_next', ({ code }) => {
      const room = gameEngine.nextLineage(cleanCode(code), socket.id);
      if (room) emitRoom(io, room);
    });

    // Хост: пауза / продолжение
    on('toggle_pause', ({ code }) => {
      const room = gameEngine.togglePause(code, socket.id);
      if (room) {
        emitRoom(io, room);
        if (!room.paused) botManager.handlePhaseAutomation(room, gameEngine, io);
      }
    });

    // Хост: исключить игрока (или бота)
    on('kick_player', ({ code, targetId }) => {
      const room = gameEngine.getRoom(code);
      if (!room || room.hostId !== socket.id || targetId === socket.id || !room.players[targetId]) return;
      const result = gameEngine.leaveRoom(targetId, 'kicked');
      const targetSocket = io.sockets.sockets.get(targetId);
      if (targetSocket) {
        targetSocket.emit('kicked');
        targetSocket.leave(code);
      }
      io.to(code).emit('user_left_webrtc', { socketId: targetId });
      if (result.room) emitRoom(io, result.room);
    });

    // Досрочное завершение выступления (говорящий или хост)
    on('end_speech', ({ code }) => {
      gameEngine.endSpeech(code, socket.id);
    });

    // Chat Message
    on('send_chat', ({ code, text }) => {
      const clean = cleanText(text, LIMITS.chat);
      if (!clean || !chatLimit.take(socket.id)) return;
      const room = gameEngine.addChatMessage(code, socket.id, clean);
      if (room) {
        emitRoom(io, room);
        // Gives a random active bot a chance to reply to a real player's
        // message, so the chat reads as an actual back-and-forth instead
        // of bots only ever speaking on their own schedule.
        botManager.handleHumanChat(room, gameEngine, io, socket.id);
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
        emitRoom(io, info.room);
      }

      const timer = setTimeout(() => {
        disconnectTimers.delete(socket.id);
        const { room, code } = gameEngine.leaveRoom(socket.id);
        if (code) {
          socket.to(code).emit('user_left_webrtc', { socketId: socket.id });
          if (room) {
            emitRoom(io, room);
          }
        }
      }, RECONNECT_GRACE_MS);

      disconnectTimers.set(socket.id, timer);
    });
  });
}
