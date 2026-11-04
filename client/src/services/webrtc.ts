import { socket } from './socket';

// Опциональный TURN (relay) — задаётся переменными окружения на этапе сборки:
// VITE_TURN_URL (например turn:turn.example.com:3478), VITE_TURN_USER, VITE_TURN_PASS
const env = ((import.meta as any).env || {}) as Record<string, string | undefined>;

const ICE_SERVERS: RTCIceServer[] = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' }
];
if (env.VITE_TURN_URL) {
  ICE_SERVERS.push({
    urls: env.VITE_TURN_URL.split(',').map(s => s.trim()),
    username: env.VITE_TURN_USER,
    credential: env.VITE_TURN_PASS
  });
}

const isBotId = (id: string) => id.startsWith('bot-');

export class WebRTCManager {
  private localStream: MediaStream | null = null;
  private localStreamPromise: Promise<MediaStream | null> | null = null;
  private peerConnections: Record<string, RTCPeerConnection> = {};
  private remoteStreams: Record<string, MediaStream> = {};
  private pendingCandidates: Record<string, RTCIceCandidateInit[]> = {};
  private creating: Record<string, Promise<void>> = {};
  private onRemoteStreamCallback: ((socketId: string, stream: MediaStream) => void) | null = null;
  private onPeerRemoveCallback: ((socketId: string) => void) | null = null;
  private onPeerStateCallback: ((socketId: string, state: string) => void) | null = null;
  private peerStates: Record<string, string> = {};
  private retries: Record<string, number> = {};
  private lastSelfId = '';
  private lastRoster: { id: string; isConnected?: boolean }[] = [];

  constructor() {
    // Слушатели живут на уровне менеджера, а не React-компонента: сигналы
    // (offer/answer/candidate) могут прийти раньше, чем смонтируется VideoGrid.
    socket.on('receive_signal', ({ callerId, signalData }: { callerId: string; signalData: any }) => {
      this.handleIncomingSignal(callerId, signalData).catch(e => console.error('[WebRTC] signal error', e));
    });
    socket.on('signal_returned', ({ id, signalData }: { id: string; signalData: any }) => {
      this.handleIncomingSignal(id, signalData).catch(e => console.error('[WebRTC] signal error', e));
    });
    socket.on('user_left_webrtc', ({ socketId }: { socketId: string }) => {
      this.removePeer(socketId);
    });
    // После (пере)подключения сокета у нас новый socket.id: старые соединения мертвы,
    // сбрасываем их, а syncPeers построит заново (локальная камера остаётся).
    socket.on('connect', () => {
      Object.keys(this.peerConnections).forEach(id => this.removePeer(id));
      this.retries = {};
    });
  }

  public getLocalStream(audio = true, video = true): Promise<MediaStream | null> {
    if (this.localStream) return Promise.resolve(this.localStream);
    if (this.localStreamPromise) return this.localStreamPromise;

    this.localStreamPromise = (async () => {
      try {
        this.localStream = await navigator.mediaDevices.getUserMedia({
          audio,
          video: video ? { width: { ideal: 640 }, height: { ideal: 480 }, frameRate: { ideal: 24 } } : false
        });
      } catch (err) {
        console.warn('[WebRTC] Could not access real camera/mic, fallback stream will be generated.', err);
        this.localStream = this.createDummyStream();
      }
      return this.localStream;
    })();
    return this.localStreamPromise;
  }

  private createDummyStream(): MediaStream {
    const canvas = document.createElement('canvas');
    canvas.width = 320;
    canvas.height = 240;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.fillStyle = '#1e293b';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.fillStyle = '#ef4444';
      ctx.font = '16px monospace';
      ctx.fillText('СИГНАЛ БУНКЕРА', 80, 125);
    }
    return canvas.captureStream(10);
  }

  public setCallbacks(
    onRemoteStream: (socketId: string, stream: MediaStream) => void,
    onPeerRemove: (socketId: string) => void,
    onPeerState?: (socketId: string, state: string) => void
  ) {
    this.onRemoteStreamCallback = onRemoteStream;
    this.onPeerRemoveCallback = onPeerRemove;
    this.onPeerStateCallback = onPeerState || null;
    if (onPeerState) Object.entries(this.peerStates).forEach(([id, st]) => onPeerState(id, st));
    // Потоки, пришедшие до монтирования VideoGrid, отдаём сразу.
    Object.entries(this.remoteStreams).forEach(([id, s]) => onRemoteStream(id, s));
  }

  /**
   * Приводит набор соединений в соответствие со списком игроков комнаты.
   * Чтобы не было "двойных" offer (glare), инициатор — тот, у кого socket.id меньше.
   */
  private setState(id: string, state: string) {
    if (state) this.peerStates[id] = state; else delete this.peerStates[id];
    this.onPeerStateCallback?.(id, state);
  }

  // Соединение умерло (failed / долгий disconnected): сносим и пробуем ещё раз, не более 3 раз.
  private scheduleRetry(id: string, pc: RTCPeerConnection) {
    if (this.peerConnections[id] !== pc) return;
    const n = (this.retries[id] || 0) + 1;
    this.retries[id] = n;
    this.removePeer(id);
    if (n <= 3) {
      this.setState(id, 'checking');
      setTimeout(() => this.syncPeers(this.lastSelfId, this.lastRoster), 1500 * n);
    } else {
      this.setState(id, 'failed');
    }
  }

  public syncPeers(selfId: string, players: { id: string; isConnected?: boolean }[]) {
    this.lastSelfId = selfId;
    this.lastRoster = players;
    const wanted = new Set<string>();
    players.forEach(p => {
      if (p.id === selfId || isBotId(p.id) || p.isConnected === false) return;
      wanted.add(p.id);
      if (!this.peerConnections[p.id] && !this.creating[p.id] && selfId < p.id) {
        this.createPeer(p.id, true).catch(e => console.error('[WebRTC] createPeer error', e));
      }
    });
    Object.keys(this.peerConnections).forEach(id => {
      if (!wanted.has(id)) this.removePeer(id);
    });
  }

  public createPeer(targetSocketId: string, isInitiator: boolean): Promise<void> {
    if (this.peerConnections[targetSocketId]) return Promise.resolve();
    if (this.creating[targetSocketId]) return this.creating[targetSocketId];

    const task = (async () => {
      // Ждём локальный поток ДО создания соединения, чтобы треки попали в offer/answer.
      await this.getLocalStream();
      if (this.peerConnections[targetSocketId]) return;

      const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
      this.peerConnections[targetSocketId] = pc;

      this.localStream?.getTracks().forEach(track => pc.addTrack(track, this.localStream!));

      pc.ontrack = (event) => {
        const stream = event.streams[0] || new MediaStream([event.track]);
        this.remoteStreams[targetSocketId] = stream;
        this.onRemoteStreamCallback?.(targetSocketId, stream);
      };

      pc.onicecandidate = (event) => {
        if (!event.candidate) return;
        const signalData = { type: 'candidate', candidate: event.candidate };
        if (isInitiator) socket.emit('send_signal', { targetId: targetSocketId, signalData });
        else socket.emit('return_signal', { callerId: targetSocketId, signalData });
      };

      pc.oniceconnectionstatechange = () => {
        const st = pc.iceConnectionState;
        console.log(`[WebRTC] ${targetSocketId} ice=${st} conn=${pc.connectionState}`);
        if (this.peerConnections[targetSocketId] !== pc) return;
        this.setState(targetSocketId, st);
        if (st === 'connected' || st === 'completed') this.retries[targetSocketId] = 0;
        if (st === 'failed') this.scheduleRetry(targetSocketId, pc);
        if (st === 'disconnected') {
          setTimeout(() => {
            if (this.peerConnections[targetSocketId] === pc && pc.iceConnectionState === 'disconnected') {
              this.scheduleRetry(targetSocketId, pc);
            }
          }, 6000);
        }
      };

      if (isInitiator) {
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        socket.emit('send_signal', { targetId: targetSocketId, signalData: { type: 'offer', sdp: offer } });
      }
    })();

    this.creating[targetSocketId] = task;
    task.finally(() => { delete this.creating[targetSocketId]; });
    return task;
  }

  private async flushCandidates(id: string, pc: RTCPeerConnection) {
    const queue = this.pendingCandidates[id] || [];
    delete this.pendingCandidates[id];
    for (const c of queue) {
      try { await pc.addIceCandidate(new RTCIceCandidate(c)); } catch (e) { console.error('[WebRTC] Candidate error', e); }
    }
  }

  public async handleIncomingSignal(callerId: string, signalData: any) {
    if (signalData.type === 'offer') {
      // Новый offer от пира, у которого уже есть соединение (например, после рестарта) — пересоздаём.
      if (this.peerConnections[callerId]) this.removePeer(callerId, true);
      await this.createPeer(callerId, false);
      const pc = this.peerConnections[callerId];
      if (!pc) return;
      await pc.setRemoteDescription(new RTCSessionDescription(signalData.sdp));
      await this.flushCandidates(callerId, pc);
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      socket.emit('return_signal', { callerId, signalData: { type: 'answer', sdp: answer } });
      return;
    }

    if (this.creating[callerId]) await this.creating[callerId].catch(() => {});
    const pc = this.peerConnections[callerId];

    if (signalData.type === 'answer' && pc) {
      await pc.setRemoteDescription(new RTCSessionDescription(signalData.sdp));
      await this.flushCandidates(callerId, pc);
    } else if (signalData.type === 'candidate') {
      if (pc && pc.remoteDescription) {
        try { await pc.addIceCandidate(new RTCIceCandidate(signalData.candidate)); } catch (e) { console.error('[WebRTC] Candidate error', e); }
      } else {
        (this.pendingCandidates[callerId] ||= []).push(signalData.candidate);
      }
    }
  }

  public removePeer(socketId: string, silent = false) {
    if (this.peerConnections[socketId]) {
      this.peerConnections[socketId].close();
      delete this.peerConnections[socketId];
    }
    delete this.pendingCandidates[socketId];
    if (!silent) {
      this.setState(socketId, '');
      delete this.remoteStreams[socketId];
      this.onPeerRemoveCallback?.(socketId);
    }
  }

  public toggleAudio(enabled: boolean) {
    this.localStream?.getAudioTracks().forEach(t => { t.enabled = enabled; });
  }

  public toggleVideo(enabled: boolean) {
    this.localStream?.getVideoTracks().forEach(t => { t.enabled = enabled; });
  }

  public destroy() {
    Object.keys(this.peerConnections).forEach(id => this.removePeer(id));
    this.remoteStreams = {};
    this.localStream?.getTracks().forEach(t => t.stop());
    this.localStream = null;
    this.localStreamPromise = null;
  }
}

export const webRTCManager = new WebRTCManager();
