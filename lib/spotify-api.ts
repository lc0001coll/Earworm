import { getAccessToken } from "./spotify-auth";

export interface Track {
  id: string;
  uri: string;
  name: string;
  artists: string[];
  album: string;
  preview_url?: string | null;
}

// Compact shape sent to the agent route — keeps the prompt small.
export interface TrackLite {
  id: string;
  name: string;
  artists: string[];
  album?: string;
}

interface SpotifyApiTrack {
  id: string;
  uri: string;
  name: string;
  is_local?: boolean;
  artists: { name: string }[];
  album: { name: string };
  preview_url?: string | null;
}

interface PlaylistTracksResponse {
  items: { track: SpotifyApiTrack | null }[];
  next: string | null;
}

async function api<T>(url: string): Promise<T> {
  const token = await getAccessToken();
  if (!token) throw new Error("Not authenticated");
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    throw new Error(`Spotify API ${res.status}: ${await res.text()}`);
  }
  return res.json() as Promise<T>;
}

export function parsePlaylistId(input: string): string | null {
  if (!input) return null;
  // Accept full URL, spotify:playlist:ID, or raw ID
  const urlMatch = input.match(/playlist[/:]([A-Za-z0-9]+)/);
  if (urlMatch) return urlMatch[1];
  if (/^[A-Za-z0-9]+$/.test(input)) return input;
  return null;
}

export async function fetchPlaylistTracks(playlistId: string): Promise<Track[]> {
  const tracks: Track[] = [];
  let url:
    | string
    | null = `https://api.spotify.com/v1/playlists/${playlistId}/tracks?limit=100&fields=items(track(id,uri,name,is_local,preview_url,artists(name),album(name))),next`;

  while (url) {
    const data: PlaylistTracksResponse = await api(url);
    for (const item of data.items) {
      const t = item.track;
      if (!t || t.is_local || !t.id || !t.uri) continue;
      tracks.push({
        id: t.id,
        uri: t.uri,
        name: t.name,
        artists: t.artists.map((a) => a.name),
        album: t.album?.name ?? "",
        preview_url: t.preview_url ?? null,
      });
    }
    url = data.next;
  }
  return tracks;
}

const CACHE_KEY_PREFIX = "heardle:playlist:";
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;

interface PlaylistCache {
  fetched_at: number;
  tracks: Track[];
}

export function getCachedTracks(playlistId: string): Track[] | null {
  if (typeof window === "undefined") return null;
  const raw = localStorage.getItem(CACHE_KEY_PREFIX + playlistId);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as PlaylistCache;
    if (Date.now() - parsed.fetched_at > CACHE_TTL_MS) return null;
    return parsed.tracks;
  } catch {
    return null;
  }
}

export function cacheTracks(playlistId: string, tracks: Track[]) {
  const payload: PlaylistCache = { fetched_at: Date.now(), tracks };
  localStorage.setItem(CACHE_KEY_PREFIX + playlistId, JSON.stringify(payload));
}

export async function getPlaylistTracks(playlistId: string): Promise<Track[]> {
  const cached = getCachedTracks(playlistId);
  if (cached) return cached;
  const tracks = await fetchPlaylistTracks(playlistId);
  cacheTracks(playlistId, tracks);
  return tracks;
}

// Deterministic daily index from YYYY-MM-DD
export function dailyIndex(dateStr: string, count: number): number {
  if (count <= 0) return 0;
  let hash = 0;
  for (let i = 0; i < dateStr.length; i++) {
    hash = (hash * 31 + dateStr.charCodeAt(i)) | 0;
  }
  return Math.abs(hash) % count;
}

export function todayString(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}
