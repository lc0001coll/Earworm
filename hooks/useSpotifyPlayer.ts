"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { getAccessToken } from "@/lib/spotify-auth";

type Status =
  | "idle"
  | "loading-sdk"
  | "connecting"
  | "ready"
  | "error";

interface UseSpotifyPlayerOptions {
  enabled: boolean;
}

export interface SpotifyPlayerControls {
  status: Status;
  deviceId: string | null;
  error: string | null;
  isPlaying: boolean;
  position: number; // ms, currently reported by player
  /**
   * Play a track URI from the start, cutting off at maxMs.
   * Resolves once playback has been initiated.
   */
  playClip: (uri: string, maxMs: number) => Promise<void>;
  pause: () => Promise<void>;
  /** Position cap currently in effect (ms). 0 means none. */
  currentCap: number;
}

const SDK_SRC = "https://sdk.scdn.co/spotify-player.js";

function loadSdk(): Promise<void> {
  if (typeof window === "undefined") return Promise.reject(new Error("no window"));
  if (window.Spotify) return Promise.resolve();
  return new Promise((resolve, reject) => {
    // Set the ready callback before injecting the script
    const prevReady = window.onSpotifyWebPlaybackSDKReady;
    window.onSpotifyWebPlaybackSDKReady = () => {
      if (prevReady) {
        try {
          prevReady();
        } catch {
          /* ignore */
        }
      }
      resolve();
    };

    const existing = document.querySelector(
      `script[src="${SDK_SRC}"]`,
    ) as HTMLScriptElement | null;
    if (existing) {
      if (window.Spotify) resolve();
      return;
    }
    const script = document.createElement("script");
    script.src = SDK_SRC;
    script.async = true;
    script.onerror = () => reject(new Error("Failed to load Spotify SDK"));
    document.body.appendChild(script);
  });
}

export function useSpotifyPlayer({
  enabled,
}: UseSpotifyPlayerOptions): SpotifyPlayerControls {
  const [status, setStatus] = useState<Status>("idle");
  const [deviceId, setDeviceId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [position, setPosition] = useState(0);
  const [currentCap, setCurrentCap] = useState(0);

  const playerRef = useRef<Spotify.Player | null>(null);
  const capRef = useRef<number>(0);
  const pollRef = useRef<number | null>(null);
  const enforcingRef = useRef(false);

  // Aggressively poll position and enforce cap, so SDK start latency
  // doesn't let playback exceed the allowed clip length.
  const startPolling = useCallback(() => {
    if (pollRef.current !== null) return;
    const tick = async () => {
      const player = playerRef.current;
      if (!player) return;
      try {
        const state = await player.getCurrentState();
        if (state) {
          setPosition(state.position);
          setIsPlaying(!state.paused);
          if (
            capRef.current > 0 &&
            !state.paused &&
            state.position >= capRef.current
          ) {
            enforcingRef.current = true;
            await player.pause();
            // Seek back to 0 so next "play" starts fresh from the beginning.
            await player.seek(0);
            setPosition(0);
            enforcingRef.current = false;
          }
        }
      } catch {
        /* ignore */
      }
    };
    // ~30ms is fine; the SDK rate-limits internally and this is local.
    pollRef.current = window.setInterval(tick, 30);
  }, []);

  const stopPolling = useCallback(() => {
    if (pollRef.current !== null) {
      window.clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }, []);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    let player: Spotify.Player | null = null;

    (async () => {
      try {
        setStatus("loading-sdk");
        await loadSdk();
        if (cancelled) return;
        if (!window.Spotify) throw new Error("Spotify SDK unavailable");

        setStatus("connecting");
        player = new window.Spotify.Player({
          name: "Earworm",
          getOAuthToken: (cb) => {
            getAccessToken().then((t) => {
              if (t) cb(t);
            });
          },
          volume: 0.7,
        });
        playerRef.current = player;

        player.addListener("ready", ({ device_id }) => {
          setDeviceId(device_id);
          setStatus("ready");
        });
        player.addListener("not_ready", () => {
          setDeviceId(null);
        });
        player.addListener("initialization_error", ({ message }) => {
          setError(message);
          setStatus("error");
        });
        player.addListener("authentication_error", ({ message }) => {
          setError(message);
          setStatus("error");
        });
        player.addListener("account_error", ({ message }) => {
          setError(message);
          setStatus("error");
        });
        player.addListener("playback_error", ({ message }) => {
          setError(message);
        });
        player.addListener("player_state_changed", (state) => {
          if (!state) return;
          setIsPlaying(!state.paused);
          setPosition(state.position);
          // Defensive cap-enforcement on state events too.
          if (
            capRef.current > 0 &&
            !state.paused &&
            state.position >= capRef.current &&
            !enforcingRef.current
          ) {
            enforcingRef.current = true;
            playerRef.current
              ?.pause()
              .then(() => playerRef.current?.seek(0))
              .finally(() => {
                enforcingRef.current = false;
                setPosition(0);
              });
          }
        });

        const connected = await player.connect();
        if (!connected) throw new Error("Failed to connect Spotify player");
        startPolling();
      } catch (e) {
        if (cancelled) return;
        setStatus("error");
        setError(e instanceof Error ? e.message : String(e));
      }
    })();

    return () => {
      cancelled = true;
      stopPolling();
      if (player) {
        try {
          player.disconnect();
        } catch {
          /* ignore */
        }
      }
      playerRef.current = null;
    };
  }, [enabled, startPolling, stopPolling]);

  const transferAndPlay = useCallback(
    async (uri: string) => {
      const token = await getAccessToken();
      if (!token || !deviceId) throw new Error("Player not ready");
      // Start playback of the specific track on our device.
      const res = await fetch(
        `https://api.spotify.com/v1/me/player/play?device_id=${deviceId}`,
        {
          method: "PUT",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ uris: [uri], position_ms: 0 }),
        },
      );
      if (!res.ok && res.status !== 204) {
        const text = await res.text();
        throw new Error(`play failed ${res.status}: ${text}`);
      }
    },
    [deviceId],
  );

  const playClip = useCallback(
    async (uri: string, maxMs: number) => {
      const player = playerRef.current;
      if (!player) throw new Error("Player not initialized");

      capRef.current = maxMs;
      setCurrentCap(maxMs);

      // Ensure we always restart from the beginning of the track.
      const state = await player.getCurrentState();
      const sameTrack =
        state?.track_window?.current_track?.uri === uri && state !== null;

      if (sameTrack) {
        await player.seek(0);
        setPosition(0);
        await player.resume();
      } else {
        await transferAndPlay(uri);
      }
    },
    [transferAndPlay],
  );

  const pause = useCallback(async () => {
    const player = playerRef.current;
    if (!player) return;
    await player.pause();
  }, []);

  return {
    status,
    deviceId,
    error,
    isPlaying,
    position,
    playClip,
    pause,
    currentCap,
  };
}
