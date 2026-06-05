"use client";

import { useCallback, useEffect, useState } from "react";
import type { Match } from "@/lib/match-encoding";

export interface RoundResult {
  trackId: string;
  status: "won" | "lost";
  attempts: number;
}

export interface MatchProgress {
  results: RoundResult[];
  currentRoundIdx: number;
}

const PROGRESS_KEY_PREFIX = "heardle:match:";

function loadProgress(hash: string, total: number): MatchProgress {
  if (typeof window === "undefined") {
    return { results: [], currentRoundIdx: 0 };
  }
  const raw = localStorage.getItem(PROGRESS_KEY_PREFIX + hash);
  if (!raw) return { results: [], currentRoundIdx: 0 };
  try {
    const parsed = JSON.parse(raw) as MatchProgress;
    // Clamp in case the URL changed under us.
    return {
      results: Array.isArray(parsed.results) ? parsed.results.slice(0, total) : [],
      currentRoundIdx: Math.min(
        Math.max(0, parsed.currentRoundIdx ?? 0),
        total,
      ),
    };
  } catch {
    return { results: [], currentRoundIdx: 0 };
  }
}

function saveProgress(hash: string, progress: MatchProgress) {
  localStorage.setItem(PROGRESS_KEY_PREFIX + hash, JSON.stringify(progress));
}

function clearMatchKeys(hash: string, total: number) {
  localStorage.removeItem(PROGRESS_KEY_PREFIX + hash);
  for (let i = 0; i < total; i++) {
    localStorage.removeItem(`heardle:match-round:${hash}:${i}`);
  }
}

export function useMatchSession(match: Match | null, hash: string | null) {
  const total = match?.trackIds.length ?? 0;

  const [progress, setProgress] = useState<MatchProgress>(() => {
    if (!hash) return { results: [], currentRoundIdx: 0 };
    return loadProgress(hash, total);
  });

  useEffect(() => {
    if (!hash) return;
    saveProgress(hash, progress);
  }, [hash, progress]);

  const recordRound = useCallback(
    (result: RoundResult) => {
      setProgress((prev) => {
        // Don't double-record the same round.
        if (prev.results[prev.currentRoundIdx]) return prev;
        const results = [...prev.results];
        results[prev.currentRoundIdx] = result;
        return { ...prev, results };
      });
    },
    [],
  );

  const advance = useCallback(() => {
    setProgress((prev) => ({
      ...prev,
      currentRoundIdx: Math.min(prev.currentRoundIdx + 1, total),
    }));
  }, [total]);

  const reset = useCallback(() => {
    if (!hash) return;
    clearMatchKeys(hash, total);
    setProgress({ results: [], currentRoundIdx: 0 });
  }, [hash, total]);

  const isComplete = progress.currentRoundIdx >= total;
  const currentRoundIdx = Math.min(progress.currentRoundIdx, total - 1);
  const sessionId =
    hash && !isComplete ? `${hash}:${progress.currentRoundIdx}` : null;

  return {
    progress,
    currentRoundIdx,
    sessionId,
    isComplete,
    total,
    recordRound,
    advance,
    reset,
  };
}

export function buildMatchShareGrid(
  matchName: string,
  results: RoundResult[],
  attemptsPerRound: number,
): string {
  const lines = [`Self Heardle · ${matchName}`];
  for (let i = 0; i < results.length; i++) {
    const r = results[i];
    if (!r) continue;
    const filled = r.status === "won" ? r.attempts - 1 : attemptsPerRound;
    let line = "";
    for (let j = 0; j < attemptsPerRound; j++) {
      if (j < filled) line += "🟥";
      else if (j === filled && r.status === "won") line += "🟩";
      else line += "⬜";
    }
    lines.push(`${i + 1}. ${line}`);
  }
  return lines.join("\n");
}
