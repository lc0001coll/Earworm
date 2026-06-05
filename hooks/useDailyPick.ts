"use client";

import { useEffect, useState } from "react";
import { dailyIndex, todayString, type Track } from "@/lib/spotify-api";
import { fetchTopTracks, fetchRecentlyPlayed } from "@/lib/spotify-history";

export interface DailyPick {
  trackId: string;
  rationale: string | null;
  source: "agent" | "fallback";
}

interface PriorGame {
  date: string;
  answerId: string;
  answerName: string;
  result: "won" | "lost";
  attempts: number;
}

const PICK_KEY_PREFIX = "heardle:pick:";
const PRIOR_KEY = "heardle:prior-games";

export function readPriorGames(): PriorGame[] {
  if (typeof window === "undefined") return [];
  const raw = localStorage.getItem(PRIOR_KEY);
  if (!raw) return [];
  try {
    return (JSON.parse(raw) as PriorGame[]).slice(-30);
  } catch {
    return [];
  }
}

export function appendPriorGame(g: PriorGame) {
  if (typeof window === "undefined") return;
  const all = readPriorGames();
  // Replace any existing entry for the same date (mid-game updates etc.)
  const filtered = all.filter((x) => x.date !== g.date);
  filtered.push(g);
  localStorage.setItem(PRIOR_KEY, JSON.stringify(filtered.slice(-30)));
}

function readCachedPick(date: string): DailyPick | null {
  if (typeof window === "undefined") return null;
  const raw = localStorage.getItem(PICK_KEY_PREFIX + date);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as DailyPick;
  } catch {
    return null;
  }
}

function writeCachedPick(date: string, pick: DailyPick) {
  localStorage.setItem(PICK_KEY_PREFIX + date, JSON.stringify(pick));
  // Drop stale picks from other days.
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (!key) continue;
    if (key.startsWith(PICK_KEY_PREFIX) && key !== PICK_KEY_PREFIX + date) {
      localStorage.removeItem(key);
      i--;
    }
  }
}

function fallbackPick(tracks: Track[]): DailyPick {
  const idx = dailyIndex(todayString(), tracks.length);
  return { trackId: tracks[idx].id, rationale: null, source: "fallback" };
}

export function useDailyPick(tracks: Track[] | null): {
  pick: DailyPick | null;
  loading: boolean;
} {
  const [pick, setPick] = useState<DailyPick | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!tracks || tracks.length === 0) return;
    const date = todayString();

    const cached = readCachedPick(date);
    if (cached && tracks.some((t) => t.id === cached.trackId)) {
      setPick(cached);
      setLoading(false);
      return;
    }

    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const [topTracks, recent] = await Promise.all([
          fetchTopTracks().catch(() => []),
          fetchRecentlyPlayed().catch(() => []),
        ]);

        const res = await fetch("/api/agent/pick", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            date,
            candidates: tracks.map((t) => ({
              id: t.id,
              name: t.name,
              artists: t.artists,
              album: t.album,
            })),
            topTracks,
            recent,
            priorGames: readPriorGames(),
          }),
        });

        if (!res.ok) throw new Error(`agent ${res.status}`);
        const json = (await res.json()) as {
          trackId: string;
          rationale: string;
          source: "agent";
        };
        const chosen = tracks.find((t) => t.id === json.trackId);
        if (!chosen) throw new Error("agent returned unknown track");

        const next: DailyPick = {
          trackId: chosen.id,
          rationale: json.rationale,
          source: "agent",
        };
        if (cancelled) return;
        writeCachedPick(date, next);
        setPick(next);
      } catch {
        if (cancelled) return;
        const fb = fallbackPick(tracks);
        writeCachedPick(date, fb);
        setPick(fb);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [tracks]);

  return { pick, loading };
}
