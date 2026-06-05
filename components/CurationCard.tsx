"use client";

interface CurationCardProps {
  rationale: string | null;
  source: "agent" | "fallback";
}

export function CurationCard({ rationale, source }: CurationCardProps) {
  if (source !== "agent" || !rationale) return null;
  return (
    <details className="rounded-md border border-zinc-800 bg-zinc-900/60 p-3 text-sm text-zinc-300">
      <summary className="cursor-pointer text-zinc-100">
        Why this song? <span className="ml-1 text-xs text-zinc-500">(curation agent)</span>
      </summary>
      <p className="mt-2 whitespace-pre-wrap text-zinc-300">{rationale}</p>
    </details>
  );
}
