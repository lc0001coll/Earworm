"use client";

import { useEffect, useRef, useState } from "react";
import {
  getPlaylistTracks,
  parsePlaylistId,
  type Track,
} from "@/lib/spotify-api";
import { useSpotifyPlayer } from "@/hooks/useSpotifyPlayer";
import { useHeardleGame } from "@/hooks/useHeardleGame";
import { useDailyPick, appendPriorGame } from "@/hooks/useDailyPick";
import { ClipPlayer } from "./ClipPlayer";
import { GuessInput } from "./GuessInput";
import { ProgressStrip } from "./ProgressStrip";
import { EndScreen } from "./EndScreen";
import { CurationCard } from "./CurationCard";
import { SimilarityHint } from "./SimilarityHint";

interface HeardleGameProps {
  playlistUrl: string;
}

export function HeardleGame({ playlistUrl }: HeardleGameProps) {
  const [tracks, setTracks] = useState<Track[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const playlistId = parsePlaylistId(playlistUrl);

  useEffect(() => {
    if (!playlistId) {
      setLoadError("Invalid playlist URL or ID in NEXT_PUBLIC_PLAYLIST_URL");
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const list = await getPlaylistTracks(playlistId);
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
  }, [playlistId]);

  const { pick, loading: pickLoading } = useDailyPick(tracks);
  const answer: Track | null =
    tracks && pick ? tracks.find((t) => t.id === pick.trackId) ?? null : null;

  const game = useHeardleGame({ answer });
  const player = useSpotifyPlayer({ enabled: true });

  // Persist the result of today's game exactly once, when the game ends.
  const loggedRef = useRef(false);
  useEffect(() => {
    if (loggedRef.current) return;
    if (!answer || game.state.status === "playing") return;
    loggedRef.current = true;
    appendPriorGame({
      date: game.state.date,
      answerId: answer.id,
      answerName: `${answer.name} — ${answer.artists.join(", ")}`,
      result: game.state.status === "won" ? "won" : "lost",
      attempts: game.state.guesses.length,
    });
  }, [answer, game.state]);

  if (loadError) {
    return (
      <div className="rounded-md border border-red-800 bg-red-950/60 p-4 text-sm text-red-100">
        {loadError}
      </div>
    );
  }

  if (!tracks || pickLoading || !pick) {
    return (
      <div className="rounded-md border border-zinc-800 bg-zinc-900/60 p-4 text-sm text-zinc-300">
        {pickLoading ? "Curation agent picking today's song…" : "Loading playlist…"}
      </div>
    );
  }

  if (!answer) {
    return (
      <div className="rounded-md border border-zinc-800 bg-zinc-900/60 p-4 text-sm text-zinc-300">
        Playlist has no playable tracks.
      </div>
    );
  }

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
          tracks={tracks}
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
        <>
          <EndScreen
            status={game.state.status as "won" | "lost"}
            answer={answer}
            shareGrid={game.shareGrid}
          />
          <CurationCard rationale={pick.rationale} source={pick.source} />
          <SimilarityHint guesses={game.state.guesses} answerId={answer.id} />
        </>
      )}
    </div>
  );
}
