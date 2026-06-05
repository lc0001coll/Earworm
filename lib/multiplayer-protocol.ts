// Shared message contract + scoring rules for host-driven multiplayer matches.
// Imported by the Next client (hooks/useRoom, host/play pages) AND by the
// standalone WebSocket relay in multiplayer-service/.
//
// The relay is the single source of truth for room state, the
// one-guess-per-hint-level rule, and scoring.

import { MAX_ATTEMPTS } from "@/hooks/useHeardleGame";

export { MAX_ATTEMPTS };

export const DEFAULT_MULTIPLAYER_URL = "ws://127.0.0.1:8787";

/** Resolved track metadata the host sends when creating a room. */
export interface TrackMeta {
  id: string;
  name: string;
  artists: string[];
}

export interface PlayerState {
  name: string;
  score: number;
  /** True once this player has used their single guess at the current level. */
  guessedThisLevel: boolean;
  /** True once this player has guessed correctly for the current song. */
  lockedThisSong: boolean;
  connected: boolean;
}

export type Phase = "lobby" | "song" | "revealed" | "over";

/** Public room state broadcast to everyone. The answer is only included once
 * the host reveals it, so guests never learn it early. */
export interface RoomState {
  roomCode: string;
  matchName: string;
  total: number;
  /** -1 in lobby, 0..total-1 during play, total when over. */
  currentIdx: number;
  /** 1..MAX_ATTEMPTS. */
  hintLevel: number;
  phase: Phase;
  players: PlayerState[];
  /** Set only when phase === "revealed". */
  revealed?: TrackMeta | null;
}

export type ClientMessage =
  | { type: "create_room"; matchName: string; tracks: TrackMeta[] }
  | { type: "join"; roomCode: string; name: string }
  | { type: "start_song" }
  | { type: "set_hint_level"; level: number }
  | { type: "submit_guess"; trackId?: string; text?: string }
  | { type: "reveal" }
  | { type: "next_song" };

export type ServerMessage =
  | { type: "room_created"; roomCode: string }
  | { type: "joined"; name: string }
  | { type: "room_state"; state: RoomState }
  | { type: "guess_result"; correct: boolean; points: number }
  | { type: "host_left" }
  | { type: "error"; message: string };

/** Scoring: a correct guess at 1-based hint level L is worth MAX_ATTEMPTS − L,
 * so hint 1 = 5 points and hint 6 = 0. */
export function pointsForHintLevel(level: number): number {
  return Math.max(0, MAX_ATTEMPTS - level);
}

function normalize(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
}

/** Resolve a guest's free-text guess to one of the match's tracks. Used when a
 * guest is not signed in to Spotify and has no autocomplete. */
export function matchGuessText(
  text: string,
  tracks: TrackMeta[],
): TrackMeta | null {
  const q = normalize(text);
  if (!q) return null;
  for (const t of tracks) {
    if (normalize(t.name) === q) return t;
  }
  const tokens = q.split(/\s+/);
  for (const t of tracks) {
    const hay = normalize(`${t.name} ${t.artists.join(" ")}`);
    if (tokens.every((tok) => hay.includes(tok))) return t;
  }
  return null;
}

const CODE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

export function generateRoomCode(): string {
  let s = "";
  for (let i = 0; i < 4; i++) {
    s += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)];
  }
  return s;
}
