"use client";

import { useMemo } from "react";
import type { RoomState } from "@/lib/multiplayer-protocol";

export function Roster({
  room,
  highlightName,
}: {
  room: RoomState;
  highlightName?: string;
}) {
  const ranked = useMemo(
    () =>
      [...room.players].sort(
        (a, b) => b.score - a.score || a.name.localeCompare(b.name),
      ),
    [room.players],
  );

  return (
    <section className="rounded-lg border border-zinc-800 bg-zinc-900/70 p-4">
      <div className="flex items-baseline justify-between">
        <span className="text-xs uppercase tracking-wide text-zinc-400">
          Players
        </span>
        <span className="text-xs text-zinc-500">{ranked.length}</span>
      </div>
      <ul className="mt-2 flex flex-col gap-1.5">
        {ranked.map((p) => {
          const status = p.lockedThisSong
            ? "✅ got it"
            : p.guessedThisLevel
              ? "🟥 missed"
              : room.phase === "song"
                ? "…thinking"
                : "";
          return (
            <li
              key={p.name}
              className={`flex items-center justify-between rounded-md border px-3 py-2 text-sm ${
                highlightName && p.name === highlightName
                  ? "border-green-700 bg-green-900/30"
                  : "border-zinc-800 bg-zinc-900/60"
              }`}
            >
              <span className="text-zinc-200">
                {p.name}
                {!p.connected && (
                  <span className="ml-2 text-xs text-zinc-500">(away)</span>
                )}
              </span>
              <span className="flex items-center gap-3">
                <span className="text-xs text-zinc-400">{status}</span>
                <span className="font-semibold text-green-400 tabular-nums">
                  {p.score}
                </span>
              </span>
            </li>
          );
        })}
        {ranked.length === 0 && (
          <li className="text-center text-sm text-zinc-500">
            Waiting for players…
          </li>
        )}
      </ul>
    </section>
  );
}
