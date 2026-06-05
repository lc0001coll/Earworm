"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { isLoggedIn, startLogin, clearToken } from "@/lib/spotify-auth";
import { HeardleGame } from "@/components/HeardleGame";

export default function Home() {
  const [authed, setAuthed] = useState<boolean | null>(null);
  const playlistUrl = process.env.NEXT_PUBLIC_PLAYLIST_URL ?? "";
  const clientId = process.env.NEXT_PUBLIC_SPOTIFY_CLIENT_ID ?? "";

  useEffect(() => {
    setAuthed(isLoggedIn());
  }, []);

  const missingConfig = !clientId || !playlistUrl;

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-xl flex-col gap-6 px-4 py-8">
      <header className="flex items-center justify-between">
        <h1 className="text-xl font-bold tracking-tight">Earworm</h1>
        <div className="flex items-center gap-3 text-xs text-zinc-400">
          <Link href="/create" className="hover:text-zinc-200">
            Build a match
          </Link>
          <Link href="/host" className="hover:text-zinc-200">
            Host a live match
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

      {missingConfig && (
        <div className="rounded-md border border-yellow-700 bg-yellow-900/40 p-4 text-sm text-yellow-100">
          Set <code>NEXT_PUBLIC_SPOTIFY_CLIENT_ID</code> and{" "}
          <code>NEXT_PUBLIC_PLAYLIST_URL</code> in <code>.env.local</code>, then
          restart <code>npm run dev</code>. See the README for details.
        </div>
      )}

      {!missingConfig && authed === false && (
        <div className="rounded-lg border border-zinc-800 bg-zinc-900/70 p-5">
          <p className="text-sm text-zinc-300">
            Sign in with Spotify Premium to play. We use Authorization Code with
            PKCE — no secrets in the browser.
          </p>
          <button
            type="button"
            onClick={() => startLogin()}
            className="mt-3 rounded-md bg-green-500 px-4 py-2 text-sm font-semibold text-black hover:bg-green-400"
          >
            Connect Spotify
          </button>
        </div>
      )}

      {!missingConfig && authed && <HeardleGame playlistUrl={playlistUrl} />}
    </main>
  );
}
