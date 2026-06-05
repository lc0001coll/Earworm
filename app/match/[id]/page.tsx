"use client";

import { use, useEffect, useState } from "react";
import Link from "next/link";
import { isLoggedIn, startLogin, clearToken } from "@/lib/spotify-auth";
import { decodeMatch, matchHash } from "@/lib/match-encoding";
import { MatchGame } from "@/components/MatchGame";

interface MatchPageProps {
  params: Promise<{ id: string }>;
}

export default function MatchPage({ params }: MatchPageProps) {
  const { id } = use(params);
  const [authed, setAuthed] = useState<boolean | null>(null);

  useEffect(() => {
    setAuthed(isLoggedIn());
  }, []);

  const match = decodeMatch(id);
  const hash = match ? matchHash(id) : null;

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-xl flex-col gap-6 px-4 py-8">
      <header className="flex items-center justify-between">
        <h1 className="text-xl font-bold tracking-tight">
          {match ? match.name : "Self Heardle Match"}
        </h1>
        <div className="flex items-center gap-3 text-xs text-zinc-400">
          <Link href="/" className="hover:text-zinc-200">
            Home
          </Link>
          {authed && (
            <button
              type="button"
              onClick={() => {
                clearToken();
                setAuthed(false);
              }}
              className="hover:text-zinc-200"
            >
              Sign out
            </button>
          )}
        </div>
      </header>

      {!match && (
        <div className="rounded-md border border-red-800 bg-red-950/60 p-4 text-sm text-red-100">
          This match link is invalid or corrupted.
        </div>
      )}

      {match && authed === false && (
        <div className="rounded-lg border border-zinc-800 bg-zinc-900/70 p-5">
          <p className="text-sm text-zinc-300">
            Sign in with Spotify Premium to play this match — clips stream from
            Spotify, so you need an account to listen.
          </p>
          <button
            type="button"
            onClick={() => startLogin(`/match/${id}`)}
            className="mt-3 rounded-md bg-green-500 px-4 py-2 text-sm font-semibold text-black hover:bg-green-400"
          >
            Connect Spotify
          </button>
        </div>
      )}

      {match && hash && authed && <MatchGame match={match} hash={hash} />}
    </main>
  );
}
