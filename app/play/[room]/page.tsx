"use client";

import { use, useEffect, useState } from "react";
import Link from "next/link";
import { isLoggedIn } from "@/lib/spotify-auth";
import { searchTracks } from "@/lib/spotify-search";
import { CLIP_LENGTHS_SEC } from "@/hooks/useHeardleGame";
import { useRoom } from "@/hooks/useRoom";
import type { PlayerState, RoomState } from "@/lib/multiplayer-protocol";
import { GuessInput } from "@/components/GuessInput";
import { Roster } from "@/components/Roster";
import { Leaderboard } from "@/components/Leaderboard";

interface PlayPageProps {
  params: Promise<{ room: string }>;
}

export default function PlayPage({ params }: PlayPageProps) {
  const { room: roomParam } = use(params);
  const roomCode = roomParam.toUpperCase();
  const room = useRoom();

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-xl flex-col gap-6 px-4 py-8">
      <header className="flex items-center justify-between">
        <h1 className="text-xl font-bold tracking-tight">Live match</h1>
        <Link href="/" className="text-xs text-zinc-400 hover:text-zinc-200">
          Home
        </Link>
      </header>

      {room.hostLeft ? (
        <div className="rounded-md border border-red-800 bg-red-950/60 p-4 text-sm text-red-100">
          The host left — this room is closed.
        </div>
      ) : !room.joinedName ? (
        <JoinForm
          roomCode={roomCode}
          status={room.status}
          error={room.error}
          onJoin={(name) =>
            room.send({ type: "join", roomCode, name })
          }
        />
      ) : room.state ? (
        <GuestGame
          state={room.state}
          myName={room.joinedName}
          lastPoints={room.lastGuess}
          send={room.send}
        />
      ) : (
        <p className="text-sm text-zinc-400">Joining…</p>
      )}
    </main>
  );
}

function JoinForm({
  roomCode,
  status,
  error,
  onJoin,
}: {
  roomCode: string;
  status: string;
  error: string | null;
  onJoin: (name: string) => void;
}) {
  const [name, setName] = useState("");
  return (
    <div className="rounded-lg border border-zinc-800 bg-zinc-900/70 p-5">
      <p className="text-sm text-zinc-300">
        Joining room{" "}
        <span className="font-mono font-semibold text-green-400">
          {roomCode}
        </span>
        . Pick a nickname — no Spotify account needed.
      </p>
      <div className="mt-3 flex gap-2">
        <input
          type="text"
          value={name}
          maxLength={24}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && name.trim()) onJoin(name.trim());
          }}
          placeholder="Nickname"
          className="flex-1 rounded-md border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-500 focus:border-green-500 focus:outline-none"
        />
        <button
          type="button"
          onClick={() => name.trim() && onJoin(name.trim())}
          disabled={!name.trim() || status !== "open"}
          className="rounded-md bg-green-500 px-4 py-2 text-sm font-semibold text-black hover:bg-green-400 disabled:bg-zinc-700 disabled:text-zinc-500"
        >
          Join
        </button>
      </div>
      {status !== "open" && (
        <p className="mt-2 text-xs text-zinc-500">
          Connecting to the multiplayer server…
        </p>
      )}
      {error && <p className="mt-2 text-xs text-red-300">{error}</p>}
    </div>
  );
}

function findMe(state: RoomState, myName: string): PlayerState | undefined {
  const key = myName.trim().toLowerCase();
  return state.players.find((p) => p.name.trim().toLowerCase() === key);
}

function GuestGame({
  state,
  myName,
  lastPoints,
  send,
}: {
  state: RoomState;
  myName: string;
  lastPoints: { correct: boolean; points: number } | null;
  send: ReturnType<typeof useRoom>["send"];
}) {
  const me = findMe(state, myName);

  if (state.phase === "over") {
    return <Leaderboard room={state} highlightName={me?.name} />;
  }

  if (state.phase === "lobby") {
    return (
      <div className="flex flex-col gap-4">
        <div className="rounded-lg border border-zinc-800 bg-zinc-900/70 p-5 text-center text-sm text-zinc-300">
          You&apos;re in! Waiting for the host to start{" "}
          <span className="font-semibold text-zinc-100">{state.matchName}</span>
          …
        </div>
        <Roster room={state} highlightName={me?.name} />
      </div>
    );
  }

  const clipSec = CLIP_LENGTHS_SEC[state.hintLevel - 1];

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between text-sm">
        <span className="font-semibold text-zinc-100">
          Song {state.currentIdx + 1} / {state.total}
        </span>
        <span className="text-zinc-400">
          Hint {state.hintLevel} · {clipSec}s clip
        </span>
      </div>

      {state.phase === "revealed" ? (
        <div className="rounded-lg border border-zinc-800 bg-zinc-900/70 p-4 text-center">
          <p className="text-sm text-zinc-400">The answer was</p>
          <p className="mt-1 text-lg font-semibold text-zinc-100">
            {state.revealed?.name}
          </p>
          <p className="text-sm text-zinc-300">
            {state.revealed?.artists.join(", ")}
          </p>
        </div>
      ) : (
        <GuessArea state={state} me={me} lastPoints={lastPoints} send={send} />
      )}

      <Roster room={state} highlightName={me?.name} />
    </div>
  );
}

function GuessArea({
  state,
  me,
  lastPoints,
  send,
}: {
  state: RoomState;
  me: PlayerState | undefined;
  lastPoints: { correct: boolean; points: number } | null;
  send: ReturnType<typeof useRoom>["send"];
}) {
  const [authed, setAuthed] = useState(false);
  const [text, setText] = useState("");

  useEffect(() => {
    setAuthed(isLoggedIn());
  }, []);

  if (me?.lockedThisSong) {
    return (
      <div className="rounded-lg border border-green-700 bg-green-900/30 p-4 text-center text-sm text-green-200">
        You got it! {lastPoints ? `+${lastPoints.points} points` : ""} Waiting
        for the host to move on.
      </div>
    );
  }

  if (me?.guessedThisLevel) {
    return (
      <div className="rounded-lg border border-zinc-800 bg-zinc-900/70 p-4 text-center text-sm text-zinc-300">
        Guess locked in. Waiting for the host to advance the hint…
      </div>
    );
  }

  // Signed-in guests get full-catalog autocomplete; everyone else types
  // free text matched against the match's own track list, server-side.
  if (authed) {
    return (
      <GuessInput
        searchTracks={searchTracks}
        onSubmit={(t, guessText) =>
          send({ type: "submit_guess", trackId: t.id, text: guessText })
        }
        onSkip={() => send({ type: "submit_guess", text: "" })}
      />
    );
  }

  return (
    <div className="flex gap-2">
      <input
        type="text"
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && text.trim()) {
            send({ type: "submit_guess", text: text.trim() });
            setText("");
          }
        }}
        placeholder="Type the song title"
        className="flex-1 rounded-md border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-500 focus:border-green-500 focus:outline-none"
      />
      <button
        type="button"
        onClick={() => send({ type: "submit_guess", text: "" })}
        className="rounded-md border border-zinc-700 px-3 py-2 text-sm text-zinc-300 hover:bg-zinc-800"
      >
        Skip
      </button>
      <button
        type="button"
        onClick={() => {
          send({ type: "submit_guess", text: text.trim() });
          setText("");
        }}
        disabled={!text.trim()}
        className="rounded-md bg-green-500 px-4 py-2 text-sm font-semibold text-black hover:bg-green-400 disabled:bg-zinc-700 disabled:text-zinc-500"
      >
        Submit
      </button>
    </div>
  );
}
