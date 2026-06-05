"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { Track } from "@/lib/spotify-api";
import type { Match } from "@/lib/match-encoding";
import { fetchTracksByIds, searchTracks } from "@/lib/spotify-search";
import { useSpotifyPlayer } from "@/hooks/useSpotifyPlayer";
import { useHeardleGame, MAX_ATTEMPTS } from "@/hooks/useHeardleGame";
import {
  useMatchSession,
  buildMatchShareGrid,
  type RoundResult,
} from "@/hooks/useMatchSession";
import { ClipPlayer } from "./ClipPlayer";
import { GuessInput } from "./GuessInput";
import { ProgressStrip } from "./ProgressStrip";

interface MatchGameProps {
  match: Match;
  hash: string;
}

export function MatchGame({ match, hash }: MatchGameProps) {
  const [tracks, setTracks] = useState<Track[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const list = await fetchTracksByIds(match.trackIds);
        if (cancelled) return;
        setTracks(list);
      } catch (e) {
        if (cancelled) return;
        setLoadError(e instanceof Error ? e.message : String(e));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [match.trackIds]);

  const session = useMatchSession(match, hash);
  const player = useSpotifyPlayer({ enabled: true });

  if (loadError) {
    return (
      <div className="rounded-md border border-red-800 bg-red-950/60 p-4 text-sm text-red-100">
        {loadError}
      </div>
    );
  }

  if (!tracks) {
    return (
      <div className="rounded-md border border-zinc-800 bg-zinc-900/60 p-4 text-sm text-zinc-300">
        Loading match…
      </div>
    );
  }

  if (session.isComplete) {
    return (
      <MatchSummary
        match={match}
        tracks={tracks}
        results={session.progress.results}
        onReset={session.reset}
      />
    );
  }

  const currentTrack = tracks[session.currentRoundIdx];
  if (!currentTrack) {
    return (
      <div className="rounded-md border border-zinc-800 bg-zinc-900/60 p-4 text-sm text-zinc-300">
        Track {session.currentRoundIdx + 1} couldn&apos;t be loaded. Skipping…
        <button
          type="button"
          onClick={session.advance}
          className="ml-2 rounded-md bg-zinc-700 px-3 py-1 text-xs text-zinc-100 hover:bg-zinc-600"
        >
          Skip
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <header className="flex items-center justify-between text-sm">
        <span className="font-semibold text-zinc-100">{match.name}</span>
        <span className="text-zinc-400">
          Round {session.currentRoundIdx + 1} / {session.total}
        </span>
      </header>
      <MatchRound
        key={session.sessionId ?? session.currentRoundIdx}
        sessionId={session.sessionId ?? ""}
        answer={currentTrack}
        player={player}
        onComplete={(result) => {
          session.recordRound(result);
        }}
        onNext={session.advance}
      />
    </div>
  );
}

interface MatchRoundProps {
  sessionId: string;
  answer: Track;
  player: ReturnType<typeof useSpotifyPlayer>;
  onComplete: (result: RoundResult) => void;
  onNext: () => void;
}

function MatchRound({
  sessionId,
  answer,
  player,
  onComplete,
  onNext,
}: MatchRoundProps) {
  const game = useHeardleGame({ answer, sessionId });
  const reported = useRef(false);

  useEffect(() => {
    if (reported.current) return;
    if (game.state.status === "playing") return;
    reported.current = true;
    onComplete({
      trackId: answer.id,
      status: game.state.status === "won" ? "won" : "lost",
      attempts: game.state.guesses.length,
    });
  }, [game.state, answer.id, onComplete]);

  const isOver = game.state.status !== "playing";

  return (
    <div className="flex flex-col gap-6">
      <ProgressStrip state={game.state} />

      <ClipPlayer
        player={player}
        trackUri={answer.uri}
        clipSec={game.currentClipSec}
        revealedClipIndex={game.revealedClipIndex}
        disabled={isOver}
      />

      {!isOver ? (
        <GuessInput
          searchTracks={searchTracks}
          disabled={isOver}
          onSubmit={(t, text) => {
            game.submitGuess(t, text);
            player.pause();
          }}
          onSkip={() => {
            game.skip();
            player.pause();
          }}
        />
      ) : (
        <div className="rounded-lg border border-zinc-800 bg-zinc-900/70 p-4 text-center">
          <p
            className={`text-lg font-semibold ${
              game.state.status === "won" ? "text-green-400" : "text-red-400"
            }`}
          >
            {game.state.status === "won" ? "Got it!" : "So close."}
          </p>
          <p className="mt-1 text-sm text-zinc-300">
            <span className="font-semibold text-zinc-100">{answer.name}</span> —{" "}
            <span className="text-zinc-300">{answer.artists.join(", ")}</span>
          </p>
          <button
            type="button"
            onClick={() => {
              player.pause();
              onNext();
            }}
            className="mt-3 rounded-md bg-green-500 px-4 py-2 text-sm font-semibold text-black hover:bg-green-400"
          >
            Next round →
          </button>
        </div>
      )}
    </div>
  );
}

interface MatchSummaryProps {
  match: Match;
  tracks: Track[];
  results: RoundResult[];
  onReset: () => void;
}

function MatchSummary({ match, tracks, results, onReset }: MatchSummaryProps) {
  const [copied, setCopied] = useState(false);

  const grid = useMemo(
    () => buildMatchShareGrid(match.name, results, MAX_ATTEMPTS),
    [match.name, results],
  );

  const wins = results.filter((r) => r?.status === "won").length;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(grid);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      /* ignore */
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="rounded-lg border border-zinc-800 bg-zinc-900/70 p-5 text-center">
        <h2 className="text-2xl font-bold text-zinc-100">Match complete</h2>
        <p className="mt-1 text-sm text-zinc-300">
          {wins} / {results.length} correct on{" "}
          <span className="font-semibold">{match.name}</span>
        </p>
        <pre className="mt-4 whitespace-pre-wrap rounded-md bg-zinc-950 p-3 text-left font-mono text-base text-zinc-100">
          {grid}
        </pre>
        <div className="mt-3 flex justify-center gap-2">
          <button
            type="button"
            onClick={copy}
            className="rounded-md bg-green-500 px-4 py-2 text-sm font-semibold text-black hover:bg-green-400"
          >
            {copied ? "Copied!" : "Copy result"}
          </button>
          <button
            type="button"
            onClick={onReset}
            className="rounded-md border border-zinc-700 px-4 py-2 text-sm text-zinc-200 hover:bg-zinc-800"
          >
            Replay
          </button>
        </div>
      </div>

      <ul className="flex flex-col gap-2">
        {results.map((r, i) => {
          const t = tracks[i];
          if (!t || !r) return null;
          return (
            <li
              key={i}
              className="flex items-center justify-between rounded-md border border-zinc-800 bg-zinc-900/60 px-3 py-2 text-sm"
            >
              <span className="text-zinc-200">
                <span className="mr-2 text-zinc-500">{i + 1}.</span>
                {t.name} — {t.artists.join(", ")}
              </span>
              <span
                className={
                  r.status === "won" ? "text-green-400" : "text-red-400"
                }
              >
                {r.status === "won"
                  ? `🟩 ${r.attempts}/${MAX_ATTEMPTS}`
                  : "🟥 lost"}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
