"use client";

import { useMemo, useState } from "react";
import type { RoomState } from "@/lib/multiplayer-protocol";

export function Leaderboard({
  room,
  canCopy = false,
  highlightName,
}: {
  room: RoomState;
  canCopy?: boolean;
  highlightName?: string;
}) {
  const [copied, setCopied] = useState(false);
  const ranked = useMemo(
    () =>
      [...room.players].sort(
        (a, b) => b.score - a.score || a.name.localeCompare(b.name),
      ),
    [room.players],
  );

  const summary = useMemo(() => {
    const lines = [`Earworm · ${room.matchName}`];
    ranked.forEach((p, i) => lines.push(`${i + 1}. ${p.name} — ${p.score}`));
    return lines.join("\n");
  }, [ranked, room.matchName]);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(summary);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      /* ignore */
    }
  };

  return (
    <section className="rounded-lg border border-zinc-800 bg-zinc-900/70 p-5">
      <h2 className="text-center text-2xl font-bold text-zinc-100">
        Final leaderboard
      </h2>
      <ul className="mt-4 flex flex-col gap-2">
        {ranked.map((p, i) => (
          <li
            key={p.name}
            className={`flex items-center justify-between rounded-md border px-3 py-2 text-sm ${
              highlightName && p.name === highlightName
                ? "border-green-700 bg-green-900/30"
                : "border-zinc-800 bg-zinc-900/60"
            }`}
          >
            <span className="text-zinc-200">
              <span className="mr-2 text-zinc-500">{i + 1}.</span>
              {p.name}
            </span>
            <span className="font-semibold text-green-400 tabular-nums">
              {p.score}
            </span>
          </li>
        ))}
        {ranked.length === 0 && (
          <li className="text-center text-sm text-zinc-500">No players.</li>
        )}
      </ul>
      {canCopy && (
        <div className="mt-4 flex justify-center">
          <button
            type="button"
            onClick={copy}
            className="rounded-md bg-green-500 px-4 py-2 text-sm font-semibold text-black hover:bg-green-400"
          >
            {copied ? "Copied!" : "Copy summary"}
          </button>
        </div>
      )}
    </section>
  );
}
