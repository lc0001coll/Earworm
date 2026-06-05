"use client";

import { useState } from "react";
import type { Track } from "@/lib/spotify-api";

interface EndScreenProps {
  status: "won" | "lost";
  answer: Track;
  shareGrid: string;
}

export function EndScreen({ status, answer, shareGrid }: EndScreenProps) {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(shareGrid);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      /* ignore */
    }
  };

  return (
    <div className="rounded-lg border border-zinc-800 bg-zinc-900/70 p-5 text-center">
      <h2
        className={`text-2xl font-bold ${
          status === "won" ? "text-green-400" : "text-red-400"
        }`}
      >
        {status === "won" ? "Got it!" : "So close."}
      </h2>
      <p className="mt-2 text-zinc-300">
        The song was{" "}
        <span className="font-semibold text-zinc-100">{answer.name}</span> by{" "}
        <span className="text-zinc-200">{answer.artists.join(", ")}</span>.
      </p>

      <pre className="mt-4 whitespace-pre-wrap rounded-md bg-zinc-950 p-3 font-mono text-base text-zinc-100">
        {shareGrid}
      </pre>

      <button
        type="button"
        onClick={copy}
        className="mt-3 rounded-md bg-green-500 px-4 py-2 text-sm font-semibold text-black hover:bg-green-400"
      >
        {copied ? "Copied!" : "Copy result"}
      </button>
    </div>
  );
}
