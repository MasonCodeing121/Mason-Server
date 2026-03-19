const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: '*' }
});

const PORT = process.env.PORT || 5000;

const rooms = {};
const legacyConnections = {}; // For legacy protocol support

function getRoomSummaries() {
  return Object.values(rooms).map(r => ({
    id: r.id,
    name: r.name,
    playerCount: Object.keys(r.players).length,
    maxPlayers: r.maxPlayers,
    state: r.state,
    createdAt: r.createdAt
  }));
}

function getServerStats() {
  const totalPlayers = Object.values(rooms).reduce(
    (sum, r) => sum + Object.keys(r.players).length, 0
  );
  return {
    totalRooms: Object.keys(rooms).length,
    totalPlayers,
    rooms: getRoomSummaries(),
    uptime: Math.floor(process.uptime())
  };
}

io.on('connection', (socket) => {
  console.log(`[connect] ${socket.id}`);

  socket.emit('server:stats', getServerStats());

  // --- ROOM-BASED PROTOCOL ---

  socket.on('room:create', ({ roomId, name, maxPlayers = 8, gameData = {} } = {}) => {
    const id = roomId || `room_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    if (rooms[id]) {
      return socket.emit('error', { message: 'Room already exists', roomId: id });
    }
    rooms[id] = {
      id,
      name: name || id,
      maxPlayers,
      players: {},
      state: 'waiting',
      gameData,
      createdAt: Date.now()
    };
    console.log(`[room:create] ${id}`);
    io.emit('server:stats', getServerStats());
    socket.emit('room:created', rooms[id]);
  });

  socket.on('room:join', ({ roomId, playerName, playerData = {} } = {}) => {
    const room = rooms[roomId];
    if (!room) return socket.emit('error', { message: 'Room not found', roomId });
    if (Object.keys(room.players).length >= room.maxPlayers) {
      return socket.emit('error', { message: 'Room is full', roomId });
    }
    const player = {
      id: socket.id,
      name: playerName || `Player_${socket.id.slice(0, 5)}`,
      data: playerData,
      joinedAt: Date.now()
    };
    room.players[socket.id] = player;
    socket.join(roomId);
    socket.data.roomId = roomId;
    console.log(`[room:join] ${player.name} -> ${roomId}`);
    socket.emit('room:joined', { room, player });
    socket.to(roomId).emit('room:player_joined', { room, player });
    io.emit('server:stats', getServerStats());
  });

  socket.on('room:leave', ({ roomId } = {}) => {
    const rid = roomId || socket.data.roomId;
    leaveRoom(socket, rid);
  });

  socket.on('game:start', ({ roomId } = {}) => {
    const rid = roomId || socket.data.roomId;
    const room = rooms[rid];
    if (!room) return socket.emit('error', { message: 'Room not found' });
    room.state = 'playing';
    io.to(rid).emit('game:started', { room });
    io.emit('server:stats', getServerStats());
    console.log(`[game:start] ${rid}`);
  });

  socket.on('game:end', ({ roomId } = {}) => {
    const rid = roomId || socket.data.roomId;
    const room = rooms[rid];
    if (!room) return socket.emit('error', { message: 'Room not found' });
    room.state = 'ended';
    io.to(rid).emit('game:ended', { room });
    io.emit('server:stats', getServerStats());
    console.log(`[game:end] ${rid}`);
  });

  socket.on('game:update', ({ roomId, payload } = {}) => {
    const rid = roomId || socket.data.roomId;
    if (!rooms[rid]) return socket.emit('error', { message: 'Room not found' });
    socket.to(rid).emit('game:update', { senderId: socket.id, payload });
  });

  socket.on('game:event', ({ roomId, event, payload } = {}) => {
    const rid = roomId || socket.data.roomId;
    if (!rooms[rid]) return socket.emit('error', { message: 'Room not found' });
    io.to(rid).emit('game:event', { senderId: socket.id, event, payload });
  });

  socket.on('chat:message', ({ roomId, message } = {}) => {
    const rid = roomId || socket.data.roomId;
    const room = rooms[rid];
    if (!room) return;
    const player = room.players[socket.id];
    const name = player ? player.name : socket.id;
    io.to(rid).emit('chat:message', { senderId: socket.id, senderName: name, message, ts: Date.now() });
  });

  socket.on('room:list', () => {
    socket.emit('room:list', getRoomSummaries());
  });

  socket.on('room:destroy', ({ roomId } = {}) => {
    const rid = roomId || socket.data.roomId;
    const room = rooms[rid];
    if (!room) return socket.emit('error', { message: 'Room not found' });
    io.to(rid).emit('room:destroyed', { roomId: rid });
    delete rooms[rid];
    io.emit('server:stats', getServerStats());
    console.log(`[room:destroy] ${rid}`);
  });

  socket.on('admin:kick', ({ targetId, roomId } = {}) => {
    const targetSocket = io.sockets.sockets.get(targetId);
    if (targetSocket) {
      const rid = roomId || targetSocket.data.roomId;
      leaveRoom(targetSocket, rid);
      targetSocket.emit('admin:kicked', { message: 'You were kicked by an admin.' });
    }
  });

  socket.on('admin:broadcast', ({ message } = {}) => {
    io.emit('admin:broadcast', { message, ts: Date.now() });
    console.log(`[admin:broadcast] ${message}`);
  });

  // --- LEGACY PROTOCOL SUPPORT (
