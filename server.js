import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import { WebSocketServer } from 'ws';
import { createRoom, joinRoom, toggleReady, startMatch, submitChoice, nextMatch, handleDisconnect, sendError, broadcastRoom } from './src/rooms.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server, path: '/ws', maxPayload: 16 * 1024 });
const PORT = Number(process.env.PORT) || 3000;

app.disable('x-powered-by');
app.use(express.static(path.join(__dirname, 'public'), { extensions: ['html'] }));
app.get('/health', (_req, res) => res.status(200).json({ ok: true, service: 'auction-game', timestamp: new Date().toISOString() }));
app.get('/api/info', (_req, res) => res.json({ name: 'Аукцион', minPlayers: 3, maxPlayers: 6, rounds: 5, version: '0.1.0' }));

wss.on('connection', (ws) => {
  let currentRoom = null;
  let currentPlayer = null;
  ws.on('message', (raw) => {
    let message;
    try { message = JSON.parse(raw.toString()); }
    catch { return sendError(currentPlayer, 'Получено некорректное сообщение.'); }
    try {
      if (!message || typeof message.type !== 'string') throw new Error('Некорректный формат команды.');
      switch (message.type) {
        case 'createRoom': {
          if (currentRoom) throw new Error('Ты уже находишься в комнате.');
          const created = createRoom(ws, message.name, message.playerId);
          currentRoom = created.room; currentPlayer = created.player;
          ws.send(JSON.stringify({ type: 'identity', playerId: currentPlayer.id, roomCode: currentRoom.code }));
          broadcastRoom(currentRoom);
          break;
        }
        case 'joinRoom': {
          if (currentRoom) throw new Error('Ты уже находишься в комнате.');
          const joined = joinRoom(ws, message.code, message.name, message.playerId);
          currentRoom = joined.room; currentPlayer = joined.player;
          ws.send(JSON.stringify({ type: 'identity', playerId: currentPlayer.id, roomCode: currentRoom.code, resumed: Boolean(joined.resumed) }));
          broadcastRoom(currentRoom);
          break;
        }
        case 'ready': {
          requireRoom(); toggleReady(currentRoom, currentPlayer); break;
        }
        case 'start': {
          requireRoom(); startMatch(currentRoom, currentPlayer); break;
        }
        case 'bid': {
          requireRoom(); submitChoice(currentRoom, currentPlayer, message.lotId, message.bid); break;
        }
        case 'nextMatch': {
          requireRoom(); nextMatch(currentRoom, currentPlayer); break;
        }
        case 'ping': {
          ws.send(JSON.stringify({ type: 'pong', now: Date.now() })); break;
        }
        default: throw new Error('Неизвестная команда.');
      }
    } catch (error) { sendError(currentPlayer ?? { ws }, error.message || 'Не удалось выполнить действие.'); }
  });
  ws.on('close', () => { if (currentRoom && currentPlayer && currentPlayer.ws === ws) handleDisconnect(currentRoom, currentPlayer); });
  ws.on('error', () => { if (currentRoom && currentPlayer && currentPlayer.ws === ws) handleDisconnect(currentRoom, currentPlayer); });
  function requireRoom() {
    if (!currentRoom || !currentPlayer) throw new Error('Сначала создай комнату или подключись к ней.');
    if (!currentPlayer.online) throw new Error('Подключение потеряно. Перезагрузи страницу.');
  }
});

server.listen(PORT, '0.0.0.0', () => console.log(`Auction Game listening on ${PORT}`));

function shutdown() {
  for (const client of wss.clients) client.close(1001, 'Сервер перезапускается');
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(1), 5000).unref();
}
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
