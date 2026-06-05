"use client";

import {
  MAX_ATTEMPTS,
  type HeardleState,
} from "@/hooks/useHeardleGame";

interface ProgressStripProps {
  state: HeardleState;
}

export function ProgressStrip({ state }: ProgressStripProps) {
  return (
    <ul className="flex w-full flex-col gap-2">
      {Array.from({ length: MAX_ATTEMPTS }).map((_, i) => {
        const g = state.guesses[i];
        const base =
          "flex h-10 items-center rounded-md border px-3 text-sm";
        if (!g) {
          return (
            <li
              key={i}
              className={`${base} border-zinc-800 bg-zinc-900 text-zinc-600`}
            >
              <span>—</span>
            </li>
          );
        }
        if (g.result === "correct") {
          return (
            <li
              key={i}
              className={`${base} border-green-700 bg-green-900/40 text-green-200`}
            >
              <span>🟩 {g.guessText}</span>
            </li>
          );
        }
        if (g.result === "wrong") {
          return (
            <li
              key={i}
              className={`${base} border-red-800 bg-red-900/40 text-red-100`}
            >
              <span>🟥 {g.guessText}</span>
            </li>
          );
        }
        return (
          <li
            key={i}
            className={`${base} border-zinc-700 bg-zinc-800 text-zinc-300`}
          >
            <span>⬛ Skipped</span>
          </li>
        );
      })}
    </ul>
  );
}
