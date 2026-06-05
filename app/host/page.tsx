"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import type { Track } from "@/lib/spotify-api";
import { decodeMatch, type Match } from "@/lib/match-encoding";
import { fetchTracksByIds } from "@/lib/spotify-search";
import { isLoggedIn, startLogin, clearToken } from "@/lib/spotify-auth";
import { useSpotifyPlayer } from "@/hooks/useSpotifyPlayer";
import { CLIP_LENGTHS_SEC, MAX_ATTEMPTS } from "@/hooks/useHeardleGame";
import { useRoom } from "@/hooks/useRoom";
import type { RoomState, TrackMeta } from "@/lib/multiplayer-protocol";
import { ClipPlayer } from "@/components/ClipPlayer";
import { Roster } from "@/components/Roster";
import { Leaderboard } from "@/components/Leaderboard";

function parseEncoded(input: string): string {
  const trimmed = input.trim();
  const idx = trimmed.indexOf("/match/");
  const raw = idx >= 0 ? trimmed.slice(idx + "/match/".length) : trimmed;
  return raw.split(/[?#]/)[0];
}

export default function HostPage() {
  const [authed, setAuthed] = useState<boolean | null>(null);

  useEffect(() => {
    setAuthed(isLoggedIn());
  }, []);

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-xl flex-col gap-6 px-4 py-8">
      <header className="flex items-center justify-between">
        <h1 className="text-xl font-bold tracking-tight">Host a live match</h1>
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

      {authed === false && (
        <div className="rounded-lg border border-zinc-800 bg-zinc-900/70 p-5">
          <p className="text-sm text-zinc-300">
            Sign in with Spotify Premium to host — you play each clip aloud, so
            your account streams the audio. Guests need nothing.
          </p>
          <button
            type="button"
            onClick={() => startLogin("/host")}
            className="mt-3 rounded-md bg-green-500 px-4 py-2 text-sm font-semibold text-black hover:bg-green-400"
          >
            Connect Spotify
          </button>
        </div>
      )}

      {authed && <HostFlow />}
    </main>
  );
}

function HostFlow() {
  const [encodedInput, setEncodedInput] = useState("");
  const [match, setMatch] = useState<Match | null>(null);
  const [tracks, setTracks] = useState<Track[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const room = useRoom();
  const player = useSpotifyPlayer({ enabled: tracks !== null });
  const createdRef = useRef(false);

  // Create the room once tracks are loaded and the socket is open.
  useEffect(() => {
    if (createdRef.current) return;
    if (!match || !tracks || room.status !== "open") return;
    createdRef.current = true;
    const meta: TrackMeta[] = tracks.map((t) => ({
      id: t.id,
      name: t.name,
      artists: t.artists,
    }));
    room.send({ type: "create_room", matchName: match.name, tracks: meta });
  }, [match, tracks, room]);

  const loadMatch = async () => {
    setLoadError(null);
    const encoded = parseEncoded(encodedInput);
    const decoded = decodeMatch(encoded);
    if (!decoded) {
      setLoadError("That doesn't look like a valid match link or code.");
      return;
    }
    setLoading(true);
    try {
      const list = await fetchTracksByIds(decoded.trackIds);
      if (list.length === 0) {
        setLoadError("Couldn't load any tracks for this match.");
        return;
      }
      setMatch(decoded);
      setTracks(list);
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  };

  if (!match || !tracks) {
    return (
      <section className="flex flex-col gap-3">
        <label className="text-xs uppercase tracking-wide text-zinc-400">
          Match link or code
        </label>
        <textarea
          value={encodedInput}
          onChange={(e) => setEncodedInput(e.target.value)}
          rows={3}
          placeholder="Paste a /match/… URL or the encoded match string from Build a match"
          className="rounded-md border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-500 focus:border-green-500 focus:outline-none"
        />
        {loadError && <p className="text-xs text-red-300">{loadError}</p>}
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={loadMatch}
            disabled={loading || !encodedInput.trim()}
            className="rounded-md bg-green-500 px-4 py-2 text-sm font-semibold text-black hover:bg-green-400 disabled:bg-zinc-700 disabled:text-zinc-500"
          >
            {loading ? "Loading…" : "Load match"}
          </button>
          <Link href="/create" className="text-xs text-zinc-400 hover:text-zinc-200">
            Build a match →
          </Link>
        </div>
      </section>
    );
  }

  if (room.status === "closed" && !room.roomCode) {
    return (
      <div className="rounded-md border border-red-800 bg-red-950/60 p-4 text-sm text-red-100">
        Lost connection to the multiplayer server. Make sure it&apos;s running,
        then reload.
      </div>
    );
  }

  if (!room.roomCode || !room.state) {
    return (
      <div className="rounded-md border border-zinc-800 bg-zinc-900/60 p-4 text-sm text-zinc-300">
        Starting room…
      </div>
    );
  }

  return (
    <HostRoom room={room.state} tracks={tracks} player={player} send={room.send} />
  );
}

interface HostRoomProps {
  room: RoomState;
  tracks: Track[];
  player: ReturnType<typeof useSpotifyPlayer>;
  send: ReturnType<typeof useRoom>["send"];
}

function HostRoom({ room, tracks, player, send }: HostRoomProps) {
  const joinUrl = useMemo(() => {
    if (typeof window === "undefined") return `/play/${room.roomCode}`;
    return `${window.location.origin}/play/${room.roomCode}`;
  }, [room.roomCode]);

  const currentTrack =
    room.currentIdx >= 0 && room.currentIdx < tracks.length
      ? tracks[room.currentIdx]
      : null;

  // Stop audio whenever the host reveals or moves on.
  useEffect(() => {
    if (room.phase !== "song") player.pause();
  }, [room.phase, room.currentIdx, player]);

  return (
    <div className="flex flex-col gap-5">
      <section className="rounded-lg border border-zinc-800 bg-zinc-900/70 p-4">
        <div className="flex items-baseline justify-between">
          <span className="text-xs uppercase tracking-wide text-zinc-400">
            Room code
          </span>
          <span className="text-xs text-zinc-500">
            {room.matchName} · {room.total} songs
          </span>
        </div>
        <div className="mt-1 font-mono text-3xl font-bold tracking-[0.3em] text-green-400">
          {room.roomCode}
        </div>
        <p className="mt-2 break-all text-xs text-zinc-400">
          Guests join at <span className="text-zinc-200">{joinUrl}</span>
        </p>
      </section>

      {room.phase === "lobby" && (
        <div className="rounded-lg border border-zinc-800 bg-zinc-900/70 p-4 text-center">
          <p className="text-sm text-zinc-300">
            {room.players.length} guest{room.players.length === 1 ? "" : "s"} in
            the lobby.
          </p>
          <button
            type="button"
            onClick={() => send({ type: "start_song" })}
            className="mt-3 rounded-md bg-green-500 px-4 py-2 text-sm font-semibold text-black hover:bg-green-400"
          >
            Start first song
          </button>
        </div>
      )}

      {(room.phase === "song" || room.phase === "revealed") && currentTrack && (
        <section className="flex flex-col gap-4">
          <div className="flex items-center justify-between text-sm">
            <span className="font-semibold text-zinc-100">
              Song {room.currentIdx + 1} / {room.total}
            </span>
            <span className="text-zinc-400">
              Hint {room.hintLevel} / {MAX_ATTEMPTS}
            </span>
          </div>

          <ClipPlayer
            player={player}
            trackUri={currentTrack.uri}
            clipSec={CLIP_LENGTHS_SEC[room.hintLevel - 1]}
            revealedClipIndex={room.hintLevel - 1}
            disabled={room.phase !== "song"}
          />

          <p className="text-center text-xs text-zinc-500">
            Answer (host only):{" "}
            <span className="text-zinc-300">
              {currentTrack.name} — {currentTrack.artists.join(", ")}
            </span>
          </p>

          {room.phase === "song" ? (
            <div className="flex justify-center gap-2">
              <button
                type="button"
                onClick={() =>
                  send({ type: "set_hint_level", level: room.hintLevel + 1 })
                }
                disabled={room.hintLevel >= MAX_ATTEMPTS}
                className="rounded-md border border-zinc-700 px-4 py-2 text-sm text-zinc-200 hover:bg-zinc-800 disabled:opacity-40"
              >
                Advance hint →
              </button>
              <button
                type="button"
                onClick={() => send({ type: "reveal" })}
                className="rounded-md bg-green-500 px-4 py-2 text-sm font-semibold text-black hover:bg-green-400"
              >
                Reveal answer
              </button>
            </div>
          ) : (
            <div className="rounded-lg border border-zinc-800 bg-zinc-900/70 p-4 text-center">
              <p className="text-sm text-zinc-300">
                Answer:{" "}
                <span className="font-semibold text-zinc-100">
                  {currentTrack.name}
                </span>{" "}
                — {currentTrack.artists.join(", ")}
              </p>
              <button
                type="button"
                onClick={() => send({ type: "next_song" })}
                className="mt-3 rounded-md bg-green-500 px-4 py-2 text-sm font-semibold text-black hover:bg-green-400"
              >
                {room.currentIdx + 1 >= room.total
                  ? "Finish & show leaderboard"
                  : "Next song →"}
              </button>
            </div>
          )}
        </section>
      )}

      {room.phase === "over" ? (
        <Leaderboard room={room} canCopy />
      ) : (
        <Roster room={room} />
      )}
    </div>
  );
}
