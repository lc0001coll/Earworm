"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  DEFAULT_MULTIPLAYER_URL,
  type ClientMessage,
  type RoomState,
  type ServerMessage,
} from "@/lib/multiplayer-protocol";

export type ConnStatus = "connecting" | "open" | "closed";

export interface GuessResult {
  correct: boolean;
  points: number;
}

export interface UseRoom {
  status: ConnStatus;
  state: RoomState | null;
  roomCode: string | null;
  joinedName: string | null;
  hostLeft: boolean;
  error: string | null;
  lastGuess: GuessResult | null;
  send: (msg: ClientMessage) => void;
}

const WS_URL =
  process.env.NEXT_PUBLIC_MULTIPLAYER_URL ?? DEFAULT_MULTIPLAYER_URL;

export function useRoom(): UseRoom {
  const [status, setStatus] = useState<ConnStatus>("connecting");
  const [state, setState] = useState<RoomState | null>(null);
  const [roomCode, setRoomCode] = useState<string | null>(null);
  const [joinedName, setJoinedName] = useState<string | null>(null);
  const [hostLeft, setHostLeft] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastGuess, setLastGuess] = useState<GuessResult | null>(null);
  const wsRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    const ws = new WebSocket(WS_URL);
    wsRef.current = ws;
    ws.onopen = () => setStatus("open");
    ws.onclose = () => setStatus("closed");
    ws.onerror = () => setError("Could not reach the multiplayer server.");
    ws.onmessage = (ev) => {
      let msg: ServerMessage;
      try {
        msg = JSON.parse(ev.data) as ServerMessage;
      } catch {
        return;
      }
      switch (msg.type) {
        case "room_created":
          setRoomCode(msg.roomCode);
          break;
        case "joined":
          setJoinedName(msg.name);
          break;
        case "room_state":
          setState(msg.state);
          setRoomCode(msg.state.roomCode);
          break;
        case "guess_result":
          setLastGuess({ correct: msg.correct, points: msg.points });
          break;
        case "host_left":
          setHostLeft(true);
          break;
        case "error":
          setError(msg.message);
          break;
      }
    };
    return () => {
      ws.onclose = null;
      ws.close();
      wsRef.current = null;
    };
  }, []);

  const send = useCallback((msg: ClientMessage) => {
    const ws = wsRef.current;
    if (ws && ws.readyState === WebSocket.OPEN) {
      setError(null);
      ws.send(JSON.stringify(msg));
    }
  }, []);

  return {
    status,
    state,
    roomCode,
    joinedName,
    hostLeft,
    error,
    lastGuess,
    send,
  };
}
