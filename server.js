const express = require('express');
const http    = require('http');
const { Server } = require('socket.io');
const path    = require('path');

const app    = express();
const server = http.createServer(app);
const io     = new Server(server);

app.use(express.static(path.join(__dirname, 'public')));

// ── Constants ──
const VALUES = [200, 400, 600, 800, 1000];
const COLORS = ['#ef4444', '#3b82f6', '#22c55e', '#f59e0b', '#a855f7', '#ec4899'];
const N_CATS = 4;
const N_VALS = 5;
const TOTAL  = N_CATS * N_VALS;

// ── Rooms ──
const rooms = {};

function genCode() {
  return Math.random().toString(36).substr(2, 5).toUpperCase();
}

function newRoom() {
  return {
    players:         [],
    usedCells:       {},
    currentTurn:     0,
    lastAction:      null,
    phase:           'lobby',
    activeCell:      null,
    answerShown:     false,
    submittedAnswer: null,
    votes:           {},   // { playerIdx: 'good' | 'bad' }
  };
}

function roomState(code) {
  const r = rooms[code];
  if (!r) return null;
  return {
    code,
    players:         r.players.map(p => ({ name: p.name, color: p.color, score: p.score, isHost: p.isHost })),
    usedCells:       r.usedCells,
    currentTurn:     r.currentTurn,
    hasUndo:         !!r.lastAction,
    phase:           r.phase,
    activeCell:      r.activeCell,
    answerShown:     r.answerShown,
    submittedAnswer: r.submittedAnswer,
    votes:           r.votes,
  };
}

// ── Helpers: apply score / skip ──
function applyScore(room, code, sign) {
  const { col, row } = room.activeCell;
  const key   = `${col},${row}`;
  const val   = VALUES[row];
  const delta = sign * val;

  room.lastAction      = { key, col, row, playerIdx: room.currentTurn, delta, prevTurn: room.currentTurn };
  room.players[room.currentTurn].score += delta;
  room.usedCells[key]  = true;
  room.activeCell      = null;
  room.answerShown     = false;
  room.submittedAnswer = null;
  room.votes           = {};
  room.currentTurn     = (room.currentTurn + 1) % room.players.length;

  if (Object.keys(room.usedCells).length >= TOTAL) room.phase = 'finished';
  io.to(code).emit('state', roomState(code));
}

function applySkip(room, code) {
  const { col, row } = room.activeCell;
  const key = `${col},${row}`;

  room.lastAction      = { key, col, row, playerIdx: room.currentTurn, delta: 0, prevTurn: room.currentTurn };
  room.usedCells[key]  = true;
  room.activeCell      = null;
  room.answerShown     = false;
  room.submittedAnswer = null;
  room.votes           = {};
  room.currentTurn     = (room.currentTurn + 1) % room.players.length;

  if (Object.keys(room.usedCells).length >= TOTAL) room.phase = 'finished';
  io.to(code).emit('state', roomState(code));
}

// ── Socket logic ──
io.on('connection', (socket) => {
  let myRoom = null;
  let myIdx  = -1;

  socket.on('createRoom', ({ name }, cb) => {
    const code = genCode();
    rooms[code] = newRoom();
    const player = { id: socket.id, name: name || 'Hôte', color: COLORS[0], score: 0, isHost: true };
    rooms[code].players.push(player);
    myRoom = code; myIdx = 0;
    socket.join(code);
    cb({ ok: true, code, myIdx: 0 });
    io.to(code).emit('state', roomState(code));
  });

  socket.on('joinRoom', ({ code, name }, cb) => {
    const room = rooms[code];
    if (!room)                    return cb({ error: 'Salle introuvable' });
    if (room.phase !== 'lobby')   return cb({ error: 'Partie déjà en cours' });
    if (room.players.length >= 6) return cb({ error: 'Salle pleine (max 6)' });

    const idx    = room.players.length;
    const player = { id: socket.id, name: name || `Joueur ${idx + 1}`, color: COLORS[idx], score: 0, isHost: false };
    room.players.push(player);
    myRoom = code; myIdx = idx;
    socket.join(code);
    cb({ ok: true, code, myIdx: idx });
    io.to(code).emit('state', roomState(code));
  });

  socket.on('startGame', () => {
    const room = rooms[myRoom];
    if (!room || room.phase !== 'lobby')  return;
    if (!room.players[myIdx]?.isHost)     return;
    room.phase = 'playing'; room.currentTurn = 0;
    io.to(myRoom).emit('state', roomState(myRoom));
  });

  // Only active player can select
  socket.on('selectCell', ({ col, row }) => {
    const room = rooms[myRoom];
    if (!room || room.phase !== 'playing') return;
    if (room.activeCell) return;
    if (room.usedCells[`${col},${row}`])   return;
    if (room.currentTurn !== myIdx)         return;

    room.activeCell      = { col, row };
    room.answerShown     = false;
    room.submittedAnswer = null;
    room.votes           = {};
    io.to(myRoom).emit('cellOpened', { col, row, playerIdx: room.currentTurn, state: roomState(myRoom) });
  });

  // Active player submits typed answer
  socket.on('submitAnswer', ({ answer }) => {
    const room = rooms[myRoom];
    if (!room || !room.activeCell)  return;
    if (room.currentTurn !== myIdx) return;
    room.submittedAnswer = answer.trim() || '…';
    io.to(myRoom).emit('answerSubmitted', { answer: room.submittedAnswer, state: roomState(myRoom) });
  });

  // Host reveals correct answer → voting phase begins
  socket.on('revealAnswer', () => {
    const room = rooms[myRoom];
    if (!room || !room.activeCell)    return;
    if (!room.players[myIdx]?.isHost) return;
    room.answerShown = true;
    room.votes       = {};
    io.to(myRoom).emit('answerRevealed', { state: roomState(myRoom) });
  });

  // Any player submits a vote
  socket.on('submitVote', ({ vote }) => {
    const room = rooms[myRoom];
    if (!room || !room.activeCell || !room.answerShown) return;
    room.votes[myIdx] = vote; // 'good' | 'bad'

    const total    = room.players.length;
    const votesCast = Object.keys(room.votes).length;
    const good     = Object.values(room.votes).filter(v => v === 'good').length;
    const bad      = Object.values(room.votes).filter(v => v === 'bad').length;

    io.to(myRoom).emit('votesUpdated', { votes: room.votes, good, bad, total, state: roomState(myRoom) });

    // Auto-resolve when everyone has voted and no tie
    if (votesCast >= total && good !== bad) {
      applyScore(room, myRoom, good > bad ? 1 : -1);
    }
    // Tie or waiting for remaining votes → host can still force
  });

  // Host forces score (override or break tie)
  socket.on('scoreAnswer', ({ sign }) => {
    const room = rooms[myRoom];
    if (!room || !room.activeCell)    return;
    if (!room.players[myIdx]?.isHost) return;
    applyScore(room, myRoom, sign);
  });

  // Host skips
  socket.on('skipAnswer', () => {
    const room = rooms[myRoom];
    if (!room || !room.activeCell)    return;
    if (!room.players[myIdx]?.isHost) return;
    applySkip(room, myRoom);
  });

  // Host undoes
  socket.on('undoLast', () => {
    const room = rooms[myRoom];
    if (!room || !room.lastAction)    return;
    if (!room.players[myIdx]?.isHost) return;
    const { key, playerIdx: pIdx, delta, prevTurn } = room.lastAction;
    room.players[pIdx].score -= delta;
    delete room.usedCells[key];
    room.currentTurn = prevTurn;
    room.lastAction  = null;
    room.activeCell  = null;
    room.votes       = {};
    if (room.phase === 'finished') room.phase = 'playing';
    io.to(myRoom).emit('state', roomState(myRoom));
  });

  // Easter egg — broadcast to whole room
  socket.on('playEasterEgg', () => {
    if (!myRoom) return;
    io.to(myRoom).emit('playEasterEgg');
  });

  socket.on('disconnect', () => {
    if (!myRoom || !rooms[myRoom]) return;
    const room = rooms[myRoom];
    if (myIdx >= 0 && room.players[myIdx]) room.players[myIdx].name += ' ✕';
    io.to(myRoom).emit('state', roomState(myRoom));
    if (room.players.every(p => p.name.endsWith(' ✕'))) delete rooms[myRoom];
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`🎯 Jeopardy! → http://localhost:${PORT}`));
