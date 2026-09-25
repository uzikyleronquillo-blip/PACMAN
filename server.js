const path = require("path");
const http = require("http");
const express = require("express");
const { Server } = require("socket.io");
const QRCode = require("qrcode");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// Serve files from the ROOT of the project
app.use(express.static(__dirname));

const rooms = new Map();

const COLORS = [
  "#ffd92f",
  "#35a7ff",
  "#55d66b",
  "#ff69b4",
  "#ff9f43"
];

function makeCode() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code;

  do {
    code = Array.from(
      { length: 5 },
      () => chars[Math.floor(Math.random() * chars.length)]
    ).join("");
  } while (rooms.has(code));

  return code;
}

function makePlayerId() {
  return Math.random().toString(36).slice(2, 9);
}

function publicPlayers(room) {
  return [...room.players.values()].map(p => ({
    id: p.id,
    name: p.name,
    color: p.color,
    score: p.score,
    answer: p.answer,
    answeredAt: p.answeredAt
  }));
}

function broadcastLobby(room) {
  io.to(room.code).emit("lobby:update", {
    code: room.code,
    players: publicPlayers(room),
    maxPlayers: 5,
    started: room.started
  });
}

function resetRound(room) {
  room.round = {
    index: room.round.index,
    startedAt: Date.now(),
    answers: [],
    locked: false
  };

  for (const p of room.players.values()) {
    p.answer = null;
    p.answeredAt = null;
    p.x = p.spawn.x;
    p.y = p.spawn.y;
  }
}

function questionPayload(room) {
  return {
    index: room.round.index,
    question: room.questions[room.round.index],
    duration: 20000
  };
}

function createRoom() {
  const code = makeCode();

  const room = {
    code,
    players: new Map(),
    hostSocket: null,
    started: false,
    round: {
      index: 0,
      startedAt: 0,
      answers: [],
      locked: false
    },

    // questions.js is in the ROOT folder
    questions: require("./questions.js")
  };

  rooms.set(code, room);

  return room;
}

// Health check for Render
app.get("/health", (req, res) => {
  res.json({
    status: "ok",
    game: "Pac-style Career Maze"
  });
});

io.on("connection", socket => {

  // =========================
  // HOST CREATE ROOM
  // =========================

  socket.on("host:create", async (_, cb) => {
    try {
      const room = createRoom();

      room.hostSocket = socket.id;
      socket.join(room.code);

      const protocol =
        socket.handshake.headers["x-forwarded-proto"] || "http";

      const host =
        socket.handshake.headers.host ||
        `localhost:${process.env.PORT || 10000}`;

      const origin = `${protocol}://${host}`;

      const joinUrl = `${origin}/?room=${room.code}`;

      const qr = await QRCode.toDataURL(joinUrl, {
        margin: 1,
        width: 320
      });

      socket.emit("host:created", {
        code: room.code,
        joinUrl,
        qr
      });

      broadcastLobby(room);

    } catch (error) {
      console.error("Room creation error:", error);
    }
  });

  // =========================
  // PLAYER JOIN
  // =========================

  socket.on("player:join", ({ code, name }, cb) => {

    const room = rooms.get(
      String(code || "").toUpperCase()
    );

    if (!room) {
      return cb?.({
        ok: false,
        error: "Room not found."
      });
    }

    if (room.started) {
      return cb?.({
        ok: false,
        error: "This game has already started."
      });
    }

    if (room.players.size >= 5) {
      return cb?.({
        ok: false,
        error: "The room is full."
      });
    }

    const cleanName = String(name || "")
      .trim()
      .slice(0, 18);

    if (!cleanName) {
      return cb?.({
        ok: false,
        error: "Enter a player name."
      });
    }

    if (
      [...room.players.values()].some(
        p => p.name.toLowerCase() === cleanName.toLowerCase()
      )
    ) {
      return cb?.({
        ok: false,
        error: "That player name is already used."
      });
    }

    const used = new Set(
      [...room.players.values()].map(p => p.color)
    );

    const color =
      COLORS.find(c => !used.has(c)) || COLORS[0];

    const n = room.players.size;

    const spawns = [
      { x: 2, y: 2 },
      { x: 17, y: 2 },
      { x: 2, y: 17 },
      { x: 17, y: 17 },
      { x: 10, y: 17 }
    ];

    const p = {
      id: makePlayerId(),
      socketId: socket.id,
      name: cleanName,
      color,
      score: 0,
      answer: null,
      answeredAt: null,
      x: spawns[n].x,
      y: spawns[n].y,
      spawn: spawns[n]
    };

    room.players.set(p.id, p);

    socket.join(room.code);

    socket.data.room = room.code;
    socket.data.playerId = p.id;

    cb?.({
      ok: true,
      player: {
        id: p.id,
        name: p.name,
        color: p.color
      },
      code: room.code
    });

    broadcastLobby(room);
  });

  // =========================
  // START GAME
  // =========================

  socket.on("host:start", ({ code }) => {

    const room = rooms.get(code);

    if (
      !room ||
      room.hostSocket !== socket.id ||
      room.players.size < 1
    ) {
      return;
    }

    room.started = true;
    room.round.index = 0;

    resetRound(room);

    io.to(room.code).emit(
      "game:started",
      questionPayload(room)
    );
  });

  // =========================
  // PLAYER MOVEMENT
  // =========================

  socket.on("player:move", ({ dx, dy }) => {

    const room = rooms.get(socket.data.room);

    if (
      !room ||
      !room.started ||
      room.round.locked
    ) {
      return;
    }

    const p = room.players.get(
      socket.data.playerId
    );

    if (!p) return;

    p.x = Math.max(
      1,
      Math.min(19, p.x + Math.sign(dx || 0))
    );

    p.y = Math.max(
      1,
      Math.min(19, p.y + Math.sign(dy || 0))
    );

    io.to(room.code).emit(
      "players:positions",
      publicPlayers(room).map(x => ({
        id: x.id,
        x: room.players.get(x.id).x,
        y: room.players.get(x.id).y
      }))
    );
  });

  // =========================
  // PLAYER ANSWER
  // =========================

  socket.on("player:answer", ({ choice }) => {

    const room = rooms.get(socket.data.room);

    if (
      !room ||
      !room.started ||
      room.round.locked
    ) {
      return;
    }

    const p = room.players.get(
      socket.data.playerId
    );

    if (!p || p.answer !== null) {
      return;
    }

    const valid = ["A", "B", "C"].includes(choice);

    if (!valid) return;

    p.answer = choice;
    p.answeredAt = Date.now();

    room.round.answers.push({
      id: p.id,
      choice,
      time: p.answeredAt
    });

    const q =
      room.questions[room.round.index];

    if (choice === q.correct) {

      const correctBefore =
        room.round.answers.filter(
          a =>
            a.choice === q.correct &&
            a.id !== p.id
        ).length;

      p.score +=
        correctBefore === 0 ? 2 : 1;
    }

    io.to(room.code).emit(
      "player:answered",
      {
        id: p.id,
        choice,
        players: publicPlayers(room)
      }
    );

    if (
      room.round.answers.length ===
      room.players.size
    ) {
      finishRound(room);
    }
  });

  // =========================
  // NEXT QUESTION
  // =========================

  socket.on("host:next", ({ code }) => {

    const room = rooms.get(code);

    if (
      !room ||
      room.hostSocket !== socket.id
    ) {
      return;
    }

    if (
      room.round.index >=
      room.questions.length - 1
    ) {

      io.to(room.code).emit(
        "game:finished",
        {
          players: publicPlayers(room)
        }
      );

      return;
    }

    room.round.index++;

    resetRound(room);

    io.to(room.code).emit(
      "round:next",
      questionPayload(room)
    );
  });

  // =========================
  // RESET GAME
  // =========================

  socket.on("host:reset", ({ code }) => {

    const room = rooms.get(code);

    if (
      !room ||
      room.hostSocket !== socket.id
    ) {
      return;
    }

    room.started = false;
    room.round.index = 0;

    for (const p of room.players.values()) {
      p.score = 0;
      p.answer = null;
      p.answeredAt = null;
    }

    broadcastLobby(room);
  });

  // =========================
  // DISCONNECT
  // =========================

  socket.on("disconnect", () => {

    const code = socket.data.room;
    const room = rooms.get(code);

    if (!room) return;

    if (room.hostSocket === socket.id) {

      io.to(code).emit("room:closed");

      rooms.delete(code);

      return;
    }

    if (socket.data.playerId) {
      room.players.delete(
        socket.data.playerId
      );
    }

    broadcastLobby(room);
  });
});

// =========================
// ROUND FINISH
// =========================

function finishRound(room) {

  if (room.round.locked) return;

  room.round.locked = true;

  const q =
    room.questions[room.round.index];

  const results =
    [...room.players.values()]
      .map(p => ({
        id: p.id,
        name: p.name,
        choice: p.answer,
        score: p.score,
        correct: p.answer === q.correct
      }))
      .sort(
        (a, b) => b.score - a.score
      );

  io.to(room.code).emit(
    "round:result",
    {
      correct: q.correct,
      explanation: q.explanation,
      players: publicPlayers(room),
      results
    }
  );
}

// =========================
// 20-SECOND TIMER
// =========================

setInterval(() => {

  for (const room of rooms.values()) {

    if (
      !room.started ||
      room.round.locked
    ) {
      continue;
    }

    if (
      Date.now() -
      room.round.startedAt >=
      20000
    ) {
      finishRound(room);
    }
  }

}, 250);

// =========================
// RENDER SERVER
// =========================

const PORT =
  process.env.PORT || 10000;

server.listen(
  PORT,
  "0.0.0.0",
  () => {
    console.log(
      `Pac-style Career Maze running on port ${PORT}`
    );
  }
);
