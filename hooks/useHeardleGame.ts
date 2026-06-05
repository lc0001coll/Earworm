"use client";

import { useCallback, useEffect, useState } from "react";
import type { Track } from "@/lib/spotify-api";
import { todayString } from "@/lib/spotify-api";

export const CLIP_LENGTHS_SEC = [1, 2, 4, 7, 11, 16] as const;
export const MAX_ATTEMPTS = CLIP_LENGTHS_SEC.length;

export type GuessResult = "correct" | "wrong" | "skip";

export interface GuessRecord {
  result: GuessResult;
  // Spotify track id for wrong guesses, undefined for skip
  trackId?: string;
  guessText?: string;
}

export interface HeardleState {
  date: string;
  guesses: GuessRecord[];
  status: "playing" | "won" | "lost";
}

const STATE_KEY_PREFIX = "heardle:state:";
const MATCH_KEY_PREFIX = "heardle:match-round:";

function storageKey(sessionId: string | undefined, date: string): string {
  return sessionId ? MATCH_KEY_PREFIX + sessionId : STATE_KEY_PREFIX + date;
}

function loadState(key: string): HeardleState | null {
  if (typeof window === "undefined") return null;
  const raw = localStorage.getItem(key);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as HeardleState;
  } catch {
    return null;
  }
}

function saveState(key: string, state: HeardleState, dailyMode: boolean) {
  localStorage.setItem(key, JSON.stringify(state));
  if (!dailyMode) return;
  // Daily mode: remove stale states from previous days.
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (!k) continue;
    if (k.startsWith(STATE_KEY_PREFIX) && k !== key) {
      localStorage.removeItem(k);
      i--;
    }
  }
}

export interface UseHeardleGameArgs {
  answer: Track | null;
  /** When set, persist under a non-daily key (used by custom matches). */
  sessionId?: string;
}

export function useHeardleGame({ answer, sessionId }: UseHeardleGameArgs) {
  const date = todayString();
  const key = storageKey(sessionId, date);
  const dailyMode = !sessionId;
  const [state, setState] = useState<HeardleState>(() => {
    if (typeof window === "undefined") {
      return { date, guesses: [], status: "playing" };
    }
    const existing = loadState(key);
    if (existing) {
      // For daily mode, reset if the date rolled over.
      if (dailyMode && existing.date !== date) {
        return { date, guesses: [], status: "playing" };
      }
      return existing;
    }
    return { date, guesses: [], status: "playing" };
  });

  // Persist on every change
  useEffect(() => {
    if (typeof window === "undefined") return;
    saveState(key, state, dailyMode);
  }, [key, state, dailyMode]);

  const attemptIndex = state.guesses.length;
  const revealedClipIndex = Math.min(attemptIndex, MAX_ATTEMPTS - 1);
  const currentClipSec = CLIP_LENGTHS_SEC[revealedClipIndex];

  const submitGuess = useCallback(
    (track: Track, guessText: string) => {
      if (!answer || state.status !== "playing") return;
      const correct = track.id === answer.id;
      setState((prev) => {
        if (prev.status !== "playing") return prev;
        const guesses = [
          ...prev.guesses,
          {
            result: correct ? "correct" : "wrong",
            trackId: track.id,
            guessText,
          } as GuessRecord,
        ];
        const status: HeardleState["status"] = correct
          ? "won"
          : guesses.length >= MAX_ATTEMPTS
            ? "lost"
            : "playing";
        return { ...prev, guesses, status };
      });
    },
    [answer, state.status],
  );

  const skip = useCallback(() => {
    if (!answer || state.status !== "playing") return;
    setState((prev) => {
      if (prev.status !== "playing") return prev;
      const guesses = [
        ...prev.guesses,
        { result: "skip" as GuessResult },
      ];
      const status: HeardleState["status"] =
        guesses.length >= MAX_ATTEMPTS ? "lost" : "playing";
      return { ...prev, guesses, status };
    });
  }, [answer, state.status]);

  const reset = useCallback(() => {
    setState({ date, guesses: [], status: "playing" });
  }, [date]);

  const shareGrid = buildShareGrid(state);

  return {
    state,
    attemptIndex,
    revealedClipIndex,
    currentClipSec,
    currentClipMs: currentClipSec * 1000,
    submitGuess,
    skip,
    reset,
    shareGrid,
  };
}

export function buildShareGrid(state: HeardleState): string {
  const cells: string[] = [];
  for (let i = 0; i < MAX_ATTEMPTS; i++) {
    const g = state.guesses[i];
    if (!g) {
      cells.push("⬜");
    } else if (g.result === "correct") {
      cells.push("🟩");
    } else if (g.result === "wrong") {
      cells.push("🟥");
    } else {
      cells.push("⬛");
    }
  }
  const header = `Earworm ${state.date}`;
  return `${header}\n${cells.join("")}`;
}
