"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { Track } from "@/lib/spotify-api";

interface GuessInputProps {
  /** Static candidate pool (used when `searchTracks` is not provided). */
  tracks?: Track[];
  /**
   * Optional async search function. When provided, query suggestions come from
   * here (debounced) instead of filtering `tracks` locally.
   */
  searchTracks?: (query: string) => Promise<Track[]>;
  disabled?: boolean;
  onSubmit: (track: Track, text: string) => void;
  onSkip: () => void;
}

function normalize(s: string): string {
  return s.toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g, "");
}

function trackLabel(t: Track) {
  return `${t.name} — ${t.artists.join(", ")}`;
}

function matches(track: Track, query: string): boolean {
  if (!query) return false;
  const q = normalize(query);
  const haystack = normalize(`${track.name} ${track.artists.join(" ")}`);
  // Simple substring fuzzy: every space-separated token must be a substring
  return q.split(/\s+/).every((tok) => haystack.includes(tok));
}

export function GuessInput({
  tracks,
  searchTracks,
  disabled,
  onSubmit,
  onSkip,
}: GuessInputProps) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(0);
  const [selected, setSelected] = useState<Track | null>(null);
  const [remoteResults, setRemoteResults] = useState<Track[]>([]);
  const containerRef = useRef<HTMLDivElement | null>(null);

  // Local-filter suggestions from a static pool.
  const localSuggestions = useMemo(() => {
    if (searchTracks || !tracks) return [];
    if (!query.trim()) return [];
    return tracks.filter((t) => matches(t, query)).slice(0, 8);
  }, [tracks, query, searchTracks]);

  // Debounced remote search.
  useEffect(() => {
    if (!searchTracks) return;
    const q = query.trim();
    if (!q) {
      setRemoteResults([]);
      return;
    }
    let cancelled = false;
    const handle = window.setTimeout(async () => {
      try {
        const res = await searchTracks(q);
        if (!cancelled) setRemoteResults(res.slice(0, 8));
      } catch {
        if (!cancelled) setRemoteResults([]);
      }
    }, 200);
    return () => {
      cancelled = true;
      window.clearTimeout(handle);
    };
  }, [query, searchTracks]);

  const suggestions = searchTracks ? remoteResults : localSuggestions;

  useEffect(() => {
    setHighlight(0);
  }, [query]);

  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (!containerRef.current) return;
      if (!containerRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, []);

  const pick = (t: Track) => {
    setSelected(t);
    setQuery(trackLabel(t));
    setOpen(false);
  };

  const submit = () => {
    if (disabled) return;
    const choice =
      selected && trackLabel(selected) === query
        ? selected
        : (suggestions[0] ?? null);
    if (!choice) return;
    onSubmit(choice, query);
    setQuery("");
    setSelected(null);
  };

  return (
    <div ref={containerRef} className="relative w-full">
      <div className="flex gap-2">
        <input
          type="text"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setSelected(null);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={(e) => {
            if (!open || suggestions.length === 0) {
              if (e.key === "Enter") submit();
              return;
            }
            if (e.key === "ArrowDown") {
              e.preventDefault();
              setHighlight((h) => Math.min(h + 1, suggestions.length - 1));
            } else if (e.key === "ArrowUp") {
              e.preventDefault();
              setHighlight((h) => Math.max(h - 1, 0));
            } else if (e.key === "Enter") {
              e.preventDefault();
              const t = suggestions[highlight];
              if (t) pick(t);
            } else if (e.key === "Escape") {
              setOpen(false);
            } else if (e.key === "Tab") {
              const t = suggestions[highlight];
              if (t) {
                e.preventDefault();
                pick(t);
              }
            }
          }}
          placeholder={disabled ? "Game over" : "Know it? Search for a title or artist"}
          disabled={disabled}
          className="flex-1 rounded-md border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-500 focus:border-green-500 focus:outline-none disabled:opacity-50"
        />
        <button
          type="button"
          onClick={onSkip}
          disabled={disabled}
          className="rounded-md border border-zinc-700 px-3 py-2 text-sm text-zinc-300 hover:bg-zinc-800 disabled:opacity-50"
        >
          Skip
        </button>
        <button
          type="button"
          onClick={submit}
          disabled={disabled || (!selected && suggestions.length === 0)}
          className="rounded-md bg-green-500 px-4 py-2 text-sm font-semibold text-black hover:bg-green-400 disabled:bg-zinc-700 disabled:text-zinc-500"
        >
          Submit
        </button>
      </div>

      {open && suggestions.length > 0 && (
        <ul className="absolute z-10 mt-1 max-h-72 w-full overflow-auto rounded-md border border-zinc-700 bg-zinc-900 shadow-lg">
          {suggestions.map((t, i) => (
            <li
              key={t.id}
              className={`cursor-pointer px-3 py-2 text-sm ${
                i === highlight ? "bg-zinc-800" : ""
              }`}
              onMouseEnter={() => setHighlight(i)}
              onMouseDown={(e) => {
                e.preventDefault();
                pick(t);
              }}
            >
              <div className="text-zinc-100">{t.name}</div>
              <div className="text-xs text-zinc-400">{t.artists.join(", ")}</div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
