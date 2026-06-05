// Standalone WebSocket relay for host-driven multiplayer matches.
// In-memory only; the single source of truth for room state, the
// one-guess-per-hint-level rule, and scoring. No database, no third party.
//
//   cd multiplayer-service && npm install && npm start
//
// Listens on PORT (default 8787) — match NEXT_PUBLIC_MULTIPLAYER_URL.

import { WebSocketServer, WebSocket } from "ws";
import {
  MAX_ATTEMPTS,
  generateRoomCode,
  matchGuessText,
  pointsForHintLevel,
  type ClientMessage,
  type Phase,
  type RoomState,
  type ServerMessage,
  type TrackMeta,
} from "@/lib/multiplayer-protocol";

interface Player {
  name: string;
  score: number;
  guessedThisLevel: boolean;
  lockedThisSong: boolean;
  ws: WebSocket | null; // null while disconnected
}

interface Room {
  code: string;
  matchName: string;
  tracks: TrackMeta[];
  host: WebSocket;
  currentIdx: number;
  hintLevel: number;
  phase: Phase;
  players: Map<string, Player>; // keyed by normalized nickname
}

interface ConnMeta {
  roomCode: string;
  role: "host" | "guest";
  name?: string; // for guests, the normalized key
}

const rooms = new Map<string, Room>();
const conns = new Map<WebSocket, ConnMeta>();

const PORT = Number(process.env.PORT ?? 8787);
const wss = new WebSocketServer({ port: PORT });
console.log(`multiplayer relay listening on ws://127.0.0.1:${PORT}`);

function send(ws: WebSocket, msg: ServerMessage) {
  if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(msg));
}

function nameKey(name: string): string {
  return name.trim().toLowerCase();
}

function buildState(room: Room): RoomState {
  return {
    roomCode: room.code,
    matchName: room.matchName,
    total: room.tracks.length,
    currentIdx: room.currentIdx,
    hintLevel: room.hintLevel,
    phase: room.phase,
    players: [...room.players.values()].map((p) => ({
      name: p.name,
      score: p.score,
      guessedThisLevel: p.guessedThisLevel,
      lockedThisSong: p.lockedThisSong,
      connected: p.ws !== null,
    })),
    revealed:
      room.phase === "revealed" ? (room.tracks[room.currentIdx] ?? null) : null,
  };
}

function broadcast(room: Room) {
  const msg: ServerMessage = { type: "room_state", state: buildState(room) };
  send(room.host, msg);
  for (const p of room.players.values()) {
    if (p.ws) send(p.ws, msg);
  }
}

function resetForNewSong(room: Room) {
  for (const p of room.players.values()) {
    p.guessedThisLevel = false;
    p.lockedThisSong = false;
  }
}

function handleHostMessage(ws: WebSocket, room: Room, msg: ClientMessage) {
  switch (msg.type) {
    case "start_song": {
      if (room.phase !== "lobby") return;
      room.currentIdx = 0;
      room.hintLevel = 1;
      room.phase = "song";
      resetForNewSong(room);
      broadcast(room);
      return;
    }
    case "set_hint_level": {
      if (room.phase !== "song") return;
      const level = Math.max(1, Math.min(MAX_ATTEMPTS, Math.floor(msg.level)));
      room.hintLevel = level;
      // Each guest gets a fresh guess at the new level (locked players stay done).
      for (const p of room.players.values()) p.guessedThisLevel = false;
      broadcast(room);
      return;
    }
    case "reveal": {
      if (room.phase !== "song") return;
      room.phase = "revealed";
      broadcast(room);
      return;
    }
    case "next_song": {
      if (room.phase !== "revealed") return;
      if (room.currentIdx + 1 >= room.tracks.length) {
        room.currentIdx = room.tracks.length;
        room.phase = "over";
      } else {
        room.currentIdx += 1;
        room.hintLevel = 1;
        room.phase = "song";
        resetForNewSong(room);
      }
      broadcast(room);
      return;
    }
    default:
      return;
  }
}

function handleGuess(
  ws: WebSocket,
  room: Room,
  player: Player,
  msg: Extract<ClientMessage, { type: "submit_guess" }>,
) {
  if (room.phase !== "song") return;
  if (player.lockedThisSong || player.guessedThisLevel) return;

  const answer = room.tracks[room.currentIdx];
  if (!answer) return;

  let guessedId: string | null = null;
  if (msg.trackId) {
    guessedId = msg.trackId;
  } else if (msg.text) {
    guessedId = matchGuessText(msg.text, room.tracks)?.id ?? null;
  }

  const correct = guessedId !== null && guessedId === answer.id;
  player.guessedThisLevel = true;

  let points = 0;
  if (correct) {
    points = pointsForHintLevel(room.hintLevel);
    player.score += points;
    player.lockedThisSong = true;
  }

  send(ws, { type: "guess_result", correct, points });
  broadcast(room);
}

function onCreateRoom(
  ws: WebSocket,
  msg: Extract<ClientMessage, { type: "create_room" }>,
) {
  if (conns.has(ws)) return; // already in a room
  let code = generateRoomCode();
  while (rooms.has(code)) code = generateRoomCode();

  const room: Room = {
    code,
    matchName: msg.matchName,
    tracks: msg.tracks,
    host: ws,
    currentIdx: -1,
    hintLevel: 1,
    phase: "lobby",
    players: new Map(),
  };
  rooms.set(code, room);
  conns.set(ws, { roomCode: code, role: "host" });
  send(ws, { type: "room_created", roomCode: code });
  broadcast(room);
}

function onJoin(
  ws: WebSocket,
  msg: Extract<ClientMessage, { type: "join" }>,
) {
  const code = msg.roomCode.trim().toUpperCase();
  const room = rooms.get(code);
  if (!room) {
    send(ws, { type: "error", message: "Room not found." });
    return;
  }
  const name = msg.name.trim().slice(0, 24);
  if (!name) {
    send(ws, { type: "error", message: "Enter a nickname." });
    return;
  }
  const key = nameKey(name);
  const existing = room.players.get(key);
  if (existing) {
    // Reconnect: only allowed if the previous socket is gone.
    if (existing.ws && existing.ws.readyState === WebSocket.OPEN) {
      send(ws, { type: "error", message: "That nickname is taken." });
      return;
    }
    existing.ws = ws;
  } else {
    room.players.set(key, {
      name,
      score: 0,
      guessedThisLevel: false,
      lockedThisSong: false,
      ws,
    });
  }
  conns.set(ws, { roomCode: code, role: "guest", name: key });
  send(ws, { type: "joined", name });
  broadcast(room);
}

function onClose(ws: WebSocket) {
  const meta = conns.get(ws);
  conns.delete(ws);
  if (!meta) return;
  const room = rooms.get(meta.roomCode);
  if (!room) return;

  if (meta.role === "host") {
    for (const p of room.players.values()) {
      if (p.ws) send(p.ws, { type: "host_left" });
    }
    rooms.delete(room.code);
    return;
  }
  // Guest: keep their state for reconnect, just mark disconnected.
  if (meta.name) {
    const p = room.players.get(meta.name);
    if (p && p.ws === ws) p.ws = null;
  }
  broadcast(room);
}

wss.on("connection", (ws: WebSocket) => {
  ws.on("message", (data) => {
    let msg: ClientMessage;
    try {
      msg = JSON.parse(data.toString()) as ClientMessage;
    } catch {
      send(ws, { type: "error", message: "Bad message." });
      return;
    }

    if (msg.type === "create_room") {
      onCreateRoom(ws, msg);
      return;
    }
    if (msg.type === "join") {
      onJoin(ws, msg);
      return;
    }

    const meta = conns.get(ws);
    if (!meta) {
      send(ws, { type: "error", message: "Not in a room." });
      return;
    }
    const room = rooms.get(meta.roomCode);
    if (!room) {
      send(ws, { type: "error", message: "Room closed." });
      return;
    }

    if (meta.role === "host") {
      handleHostMessage(ws, room, msg);
      return;
    }

    if (msg.type === "submit_guess" && meta.name) {
      const player = room.players.get(meta.name);
      if (player) handleGuess(ws, room, player, msg);
    }
  });

  ws.on("close", () => onClose(ws));
  ws.on("error", () => onClose(ws));
});
