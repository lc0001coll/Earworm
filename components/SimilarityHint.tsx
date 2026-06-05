"use client";

import { useEffect, useState } from "react";
import type { GuessRecord } from "@/hooks/useHeardleGame";

interface EmbeddingsFile {
  vectors: Record<string, number[]>;
  meta: Record<string, { name: string; artists: string[] }>;
}

interface SimilarityHintProps {
  guesses: GuessRecord[];
  answerId: string;
}

function cosine(a: number[], b: number[]): number {
  let dot = 0;
  for (let i = 0; i < a.length; i++) dot += a[i] * b[i];
  return dot;
}

export function SimilarityHint({ guesses, answerId }: SimilarityHintProps) {
  const [data, setData] = useState<EmbeddingsFile | null>(null);
  const [missing, setMissing] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/embeddings");
        if (!res.ok) {
          setMissing(true);
          return;
        }
        const json = (await res.json()) as EmbeddingsFile;
        if (!cancelled) setData(json);
      } catch {
        if (!cancelled) setMissing(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (missing) return null;
  if (!data) return null;

  const answerVec = data.vectors[answerId];
  if (!answerVec) return null;

  const wrongs = guesses.filter(
    (g): g is GuessRecord & { trackId: string } =>
      g.result === "wrong" && !!g.trackId,
  );
  if (wrongs.length === 0) return null;

  const rows = wrongs
    .map((g) => {
      const v = data.vectors[g.trackId];
      if (!v) return null;
      const dist = 1 - cosine(v, answerVec);
      return { id: g.trackId, text: g.guessText ?? g.trackId, dist };
    })
    .filter((r): r is { id: string; text: string; dist: number } => r !== null);

  if (rows.length === 0) return null;

  const closest = rows.reduce((a, b) => (a.dist < b.dist ? a : b));

  return (
    <div className="rounded-md border border-zinc-800 bg-zinc-900/60 p-3 text-sm">
      <p className="text-zinc-300">
        Embedding distance from your guesses to the answer (CLAP space):
      </p>
      <ul className="mt-2 space-y-1 font-mono text-xs text-zinc-200">
        {rows.map((r) => (
          <li key={r.id} className="flex justify-between">
            <span>{r.text}</span>
            <span className={r.id === closest.id ? "text-green-300" : ""}>
              {r.dist.toFixed(3)}
              {r.id === closest.id ? " ← closest" : ""}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
