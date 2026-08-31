import { io, Socket } from 'socket.io-client';

const URL = process.env.NODE_ENV === 'production' ? '' : 'http://localhost:3001';

export const socket: Socket = io(URL, {
  autoConnect: true,
  transports: ['websocket', 'polling']
});
