"use client";

import { CLIP_LENGTHS_SEC } from "@/hooks/useHeardleGame";
import type { SpotifyPlayerControls } from "@/hooks/useSpotifyPlayer";

interface ClipPlayerProps {
  player: SpotifyPlayerControls;
  trackUri: string | null;
  clipSec: number;
  revealedClipIndex: number;
  disabled?: boolean;
}

export function ClipPlayer({
  player,
  trackUri,
  clipSec,
  revealedClipIndex,
  disabled,
}: ClipPlayerProps) {
  const totalMaxSec = CLIP_LENGTHS_SEC[CLIP_LENGTHS_SEC.length - 1];
  const elapsedSec = Math.min(player.position / 1000, clipSec);
  const progressPct = (elapsedSec / totalMaxSec) * 100;

  const onClick = async () => {
    if (!trackUri || disabled) return;
    if (player.isPlaying) {
      await player.pause();
    } else {
      await player.playClip(trackUri, clipSec * 1000);
    }
  };

  const notReady = player.status !== "ready";

  return (
    <div className="w-full">
      {/* Progress bar with tick marks for each clip length */}
      <div className="relative h-2 w-full overflow-hidden rounded-full bg-zinc-800">
        {/* Reveal range (allowed clip) */}
        <div
          className="absolute left-0 top-0 h-full bg-zinc-600"
          style={{ width: `${(clipSec / totalMaxSec) * 100}%` }}
        />
        {/* Current playback */}
        <div
          className="absolute left-0 top-0 h-full bg-green-500 transition-[width] duration-75"
          style={{ width: `${progressPct}%` }}
        />
        {/* Tick marks */}
        {CLIP_LENGTHS_SEC.slice(0, -1).map((s, i) => (
          <div
            key={i}
            className="absolute top-0 h-full w-px bg-black"
            style={{ left: `${(s / totalMaxSec) * 100}%` }}
          />
        ))}
      </div>

      <div className="mt-2 flex items-center justify-between text-xs text-zinc-400 tabular-nums">
        <span>{formatTime(elapsedSec)}</span>
        <span>
          {formatTime(clipSec)} · clip {revealedClipIndex + 1}/{CLIP_LENGTHS_SEC.length}
        </span>
      </div>

      <div className="mt-4 flex justify-center">
        <button
          type="button"
          onClick={onClick}
          disabled={!trackUri || notReady || disabled}
          className="flex h-16 w-16 items-center justify-center rounded-full bg-green-500 text-black shadow-lg transition hover:scale-105 disabled:bg-zinc-700 disabled:text-zinc-500 disabled:hover:scale-100"
          aria-label={player.isPlaying ? "Pause" : "Play"}
        >
          {player.isPlaying ? <PauseIcon /> : <PlayIcon />}
        </button>
      </div>

      {notReady && (
        <p className="mt-3 text-center text-xs text-zinc-500">
          {player.status === "error"
            ? `Player error: ${player.error ?? "unknown"}`
            : "Connecting to Spotify…"}
        </p>
      )}
    </div>
  );
}

function formatTime(sec: number) {
  const s = Math.max(0, sec);
  return `0:${s.toFixed(1).padStart(4, "0")}`;
}

function PlayIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-7 w-7 fill-current" aria-hidden>
      <path d="M8 5v14l11-7z" />
    </svg>
  );
}

function PauseIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-7 w-7 fill-current" aria-hidden>
      <path d="M6 5h4v14H6zM14 5h4v14h-4z" />
    </svg>
  );
}
