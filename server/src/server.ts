import express from 'express';
import http from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import { GameEngine } from './game/GameEngine';
import { registerSocketHandlers } from './sockets/socketHandler';

import path from 'path';

const app = express();
app.use(cors());
app.use(express.json());

// Serve static client files when built
const clientDist = path.join(__dirname, '../../client/dist');
app.use(express.static(clientDist));

const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  }
});

const gameEngine = new GameEngine();
registerSocketHandlers(io, gameEngine);

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', time: new Date().toISOString() });
});

app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api') || req.path.startsWith('/socket.io')) return next();
  res.sendFile(path.join(clientDist, 'index.html'), (err) => {
    if (err) next();
  });
});


const PORT = process.env.PORT || 3001;

server.listen(PORT, () => {
  console.log(`[Bunker Server] Listening on http://localhost:${PORT}`);
});
