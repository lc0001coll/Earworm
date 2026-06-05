"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import type { Track } from "@/lib/spotify-api";
import { searchTracks } from "@/lib/spotify-search";
import { isLoggedIn, startLogin } from "@/lib/spotify-auth";
import {
  encodeMatch,
  MAX_MATCH_TRACKS,
  type Match,
} from "@/lib/match-encoding";

export default function CreatePage() {
  const [authed, setAuthed] = useState<boolean | null>(null);
  const [name, setName] = useState("");
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Track[]>([]);
  const [searching, setSearching] = useState(false);
  const [selected, setSelected] = useState<Track[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setAuthed(isLoggedIn());
  }, []);

  useEffect(() => {
    if (!authed) return;
    const q = query.trim();
    if (!q) {
      setResults([]);
      return;
    }
    let cancelled = false;
    setSearching(true);
    const handle = window.setTimeout(async () => {
      try {
        const r = await searchTracks(q, 10);
        if (!cancelled) setResults(r);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      } finally {
        if (!cancelled) setSearching(false);
      }
    }, 250);
    return () => {
      cancelled = true;
      window.clearTimeout(handle);
    };
  }, [query, authed]);

  const selectedIds = useMemo(
    () => new Set(selected.map((t) => t.id)),
    [selected],
  );

  const canAdd = selected.length < MAX_MATCH_TRACKS;

  const shareUrl = useMemo(() => {
    if (selected.length === 0 || !name.trim()) return null;
    const match: Match = {
      name: name.trim(),
      trackIds: selected.map((t) => t.id),
    };
    const encoded = encodeMatch(match);
    if (typeof window === "undefined") return `/match/${encoded}`;
    return `${window.location.origin}/match/${encoded}`;
  }, [name, selected]);

  if (authed === null) {
    return (
      <main className="mx-auto max-w-xl px-4 py-8">
        <p className="text-sm text-zinc-400">Loading…</p>
      </main>
    );
  }

  if (!authed) {
    return (
      <main className="mx-auto flex max-w-xl flex-col gap-4 px-4 py-8">
        <Header />
        <div className="rounded-lg border border-zinc-800 bg-zinc-900/70 p-5">
          <p className="text-sm text-zinc-300">
            Sign in with Spotify to search the catalog for your match.
          </p>
          <button
            type="button"
            onClick={() => startLogin()}
            className="mt-3 rounded-md bg-green-500 px-4 py-2 text-sm font-semibold text-black hover:bg-green-400"
          >
            Connect Spotify
          </button>
        </div>
      </main>
    );
  }

  return (
    <main className="mx-auto flex max-w-xl flex-col gap-6 px-4 py-8">
      <Header />

      <section className="flex flex-col gap-2">
        <label className="text-xs uppercase tracking-wide text-zinc-400">
          Match name
        </label>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value.slice(0, 80))}
          placeholder="e.g. Summer 2025 bangers"
          className="rounded-md border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-500 focus:border-green-500 focus:outline-none"
        />
      </section>

      <section className="flex flex-col gap-2">
        <div className="flex items-baseline justify-between">
          <label className="text-xs uppercase tracking-wide text-zinc-400">
            Songs ({selected.length} / {MAX_MATCH_TRACKS})
          </label>
        </div>

        {selected.length > 0 && (
          <ul className="flex flex-col gap-1.5">
            {selected.map((t, i) => (
              <li
                key={t.id}
                className="flex items-center justify-between rounded-md border border-zinc-800 bg-zinc-900/60 px-3 py-2 text-sm"
              >
                <span className="text-zinc-200">
                  <span className="mr-2 text-zinc-500">{i + 1}.</span>
                  {t.name} — {t.artists.join(", ")}
                </span>
                <button
                  type="button"
                  onClick={() =>
                    setSelected((cur) => cur.filter((x) => x.id !== t.id))
                  }
                  className="text-xs text-zinc-400 hover:text-red-400"
                  aria-label={`Remove ${t.name}`}
                >
                  Remove
                </button>
              </li>
            ))}
          </ul>
        )}

        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={
            canAdd ? "Search Spotify for a song or artist" : "Match is full"
          }
          disabled={!canAdd}
          className="rounded-md border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-500 focus:border-green-500 focus:outline-none disabled:opacity-50"
        />

        {error && (
          <p className="text-xs text-red-300">{error}</p>
        )}

        {canAdd && results.length > 0 && (
          <ul className="overflow-hidden rounded-md border border-zinc-800">
            {results.map((t) => {
              const already = selectedIds.has(t.id);
              return (
                <li
                  key={t.id}
                  className="flex items-center justify-between border-t border-zinc-800 bg-zinc-900/60 px-3 py-2 text-sm first:border-t-0"
                >
                  <span className="text-zinc-200">
                    {t.name} —{" "}
                    <span className="text-zinc-400">
                      {t.artists.join(", ")}
                    </span>
                  </span>
                  <button
                    type="button"
                    disabled={already}
                    onClick={() => {
                      setSelected((cur) =>
                        cur.length < MAX_MATCH_TRACKS ? [...cur, t] : cur,
                      );
                    }}
                    className="rounded-md bg-green-500 px-3 py-1 text-xs font-semibold text-black hover:bg-green-400 disabled:bg-zinc-700 disabled:text-zinc-400"
                  >
                    {already ? "Added" : "Add"}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
        {searching && (
          <p className="text-xs text-zinc-500">Searching…</p>
        )}
      </section>

      <section className="flex flex-col gap-2">
        <label className="text-xs uppercase tracking-wide text-zinc-400">
          Share link
        </label>
        {shareUrl ? (
          <ShareLink url={shareUrl} />
        ) : (
          <p className="text-sm text-zinc-500">
            Pick at least one song and add a match name.
          </p>
        )}
      </section>
    </main>
  );
}

function Header() {
  return (
    <header className="flex items-center justify-between">
      <h1 className="text-xl font-bold tracking-tight">Build a match</h1>
      <Link
        href="/"
        className="text-xs text-zinc-400 hover:text-zinc-200"
      >
        ← Home
      </Link>
    </header>
  );
}

function ShareLink({ url }: { url: string }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      /* ignore */
    }
  };
  return (
    <div className="flex flex-col gap-2">
      <div className="break-all rounded-md border border-zinc-800 bg-zinc-950 p-3 font-mono text-xs text-zinc-200">
        {url}
      </div>
      <div className="flex gap-2">
        <button
          type="button"
          onClick={copy}
          className="rounded-md bg-green-500 px-4 py-2 text-sm font-semibold text-black hover:bg-green-400"
        >
          {copied ? "Copied!" : "Copy link"}
        </button>
        <Link
          href={url.replace(/^https?:\/\/[^/]+/, "")}
          className="rounded-md border border-zinc-700 px-4 py-2 text-sm text-zinc-200 hover:bg-zinc-800"
        >
          Preview
        </Link>
      </div>
    </div>
  );
}
