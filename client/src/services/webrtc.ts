import { socket } from './socket';

export class WebRTCManager {
  private localStream: MediaStream | null = null;
  private peerConnections: Record<string, RTCPeerConnection> = {};
  private onRemoteStreamCallback: ((socketId: string, stream: MediaStream) => void) | null = null;
  private onPeerRemoveCallback: ((socketId: string) => void) | null = null;

  public async getLocalStream(audio = true, video = true): Promise<MediaStream | null> {
    try {
      if (this.localStream) {
        return this.localStream;
      }
      this.localStream = await navigator.mediaDevices.getUserMedia({
        audio: audio,
        video: video ? { width: { ideal: 640 }, height: { ideal: 480 }, frameRate: { ideal: 24 } } : false
      });
      return this.localStream;
    } catch (err) {
      console.warn('[WebRTC] Could not access real camera/mic, fallback stream will be generated.', err);
      this.localStream = this.createDummyStream();
      return this.localStream;
    }
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
    const stream = canvas.captureStream(10);
    return stream;
  }

  public setCallbacks(
    onRemoteStream: (socketId: string, stream: MediaStream) => void,
    onPeerRemove: (socketId: string) => void
  ) {
    this.onRemoteStreamCallback = onRemoteStream;
    this.onPeerRemoveCallback = onPeerRemove;
  }

  public async createPeer(targetSocketId: string, isInitiator: boolean) {
    if (this.peerConnections[targetSocketId]) return;

    const pc = new RTCPeerConnection({
      iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' }
      ]
    });

    this.peerConnections[targetSocketId] = pc;

    if (this.localStream) {
      this.localStream.getTracks().forEach(track => {
        pc.addTrack(track, this.localStream!);
      });
    }

    pc.ontrack = (event) => {
      if (event.streams && event.streams[0] && this.onRemoteStreamCallback) {
        this.onRemoteStreamCallback(targetSocketId, event.streams[0]);
      }
    };

    pc.onicecandidate = (event) => {
      if (event.candidate) {
        if (isInitiator) {
          socket.emit('send_signal', {
            targetId: targetSocketId,
            signalData: { type: 'candidate', candidate: event.candidate }
          });
        } else {
          socket.emit('return_signal', {
            callerId: targetSocketId,
            signalData: { type: 'candidate', candidate: event.candidate }
          });
        }
      }
    };

    if (isInitiator) {
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      socket.emit('send_signal', {
        targetId: targetSocketId,
        signalData: { type: 'offer', sdp: offer }
      });
    }
  }

  public async handleIncomingSignal(callerId: string, signalData: any) {
    let pc = this.peerConnections[callerId];

    if (signalData.type === 'offer') {
      if (!pc) {
        await this.createPeer(callerId, false);
        pc = this.peerConnections[callerId];
      }
      await pc.setRemoteDescription(new RTCSessionDescription(signalData.sdp));
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      socket.emit('return_signal', {
        callerId,
        signalData: { type: 'answer', sdp: answer }
      });
    } else if (signalData.type === 'answer' && pc) {
      await pc.setRemoteDescription(new RTCSessionDescription(signalData.sdp));
    } else if (signalData.type === 'candidate' && pc) {
      try {
        await pc.addIceCandidate(new RTCIceCandidate(signalData.candidate));
      } catch (e) {
        console.error('[WebRTC] Candidate error', e);
      }
    }
  }

  public removePeer(socketId: string) {
    if (this.peerConnections[socketId]) {
      this.peerConnections[socketId].close();
      delete this.peerConnections[socketId];
    }
    if (this.onPeerRemoveCallback) {
      this.onPeerRemoveCallback(socketId);
    }
  }

  public toggleAudio(enabled: boolean) {
    if (this.localStream) {
      this.localStream.getAudioTracks().forEach(track => {
        track.enabled = enabled;
      });
    }
  }

  public toggleVideo(enabled: boolean) {
    if (this.localStream) {
      this.localStream.getVideoTracks().forEach(track => {
        track.enabled = enabled;
      });
    }
  }

  public destroy() {
    Object.keys(this.peerConnections).forEach(id => this.removePeer(id));
    if (this.localStream) {
      this.localStream.getTracks().forEach(t => t.stop());
      this.localStream = null;
    }
  }
}

export const webRTCManager = new WebRTCManager();
