import { getAccessToken } from "./spotify-auth";
import type { TrackLite } from "./spotify-api";

interface SpotifyHistoryTrack {
  id: string;
  name: string;
  artists: { name: string }[];
  album?: { name: string };
}

interface TopResponse {
  items: SpotifyHistoryTrack[];
}

interface RecentResponse {
  items: { track: SpotifyHistoryTrack; played_at: string }[];
}

async function get<T>(url: string): Promise<T> {
  const token = await getAccessToken();
  if (!token) throw new Error("Not authenticated");
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) throw new Error(`Spotify API ${res.status}: ${await res.text()}`);
  return res.json() as Promise<T>;
}

function toLite(t: SpotifyHistoryTrack): TrackLite {
  return {
    id: t.id,
    name: t.name,
    artists: t.artists.map((a) => a.name),
    album: t.album?.name,
  };
}

export async function fetchTopTracks(): Promise<TrackLite[]> {
  const data = await get<TopResponse>(
    "https://api.spotify.com/v1/me/top/tracks?limit=50&time_range=medium_term",
  );
  return data.items.map(toLite);
}

export async function fetchRecentlyPlayed(): Promise<TrackLite[]> {
  const data = await get<RecentResponse>(
    "https://api.spotify.com/v1/me/player/recently-played?limit=50",
  );
  return data.items.map((i) => toLite(i.track));
}
