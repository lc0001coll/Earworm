import { getAccessToken } from "./spotify-auth";
import type { Track } from "./spotify-api";

interface SpotifyApiTrack {
  id: string;
  uri: string;
  name: string;
  is_local?: boolean;
  is_playable?: boolean;
  artists: { name: string }[];
  album: { name: string };
  preview_url?: string | null;
}

interface SearchResponse {
  tracks: { items: SpotifyApiTrack[] };
}

interface TracksResponse {
  tracks: (SpotifyApiTrack | null)[];
}

function toTrack(t: SpotifyApiTrack): Track {
  return {
    id: t.id,
    uri: t.uri,
    name: t.name,
    artists: t.artists.map((a) => a.name),
    album: t.album?.name ?? "",
    preview_url: t.preview_url ?? null,
  };
}

export async function searchTracks(
  query: string,
  limit = 10,
): Promise<Track[]> {
  const q = query.trim();
  if (!q) return [];
  const token = await getAccessToken();
  if (!token) throw new Error("Not authenticated");
  const url = `https://api.spotify.com/v1/search?type=track&limit=${limit}&q=${encodeURIComponent(q)}`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    throw new Error(`Spotify search ${res.status}: ${await res.text()}`);
  }
  const data = (await res.json()) as SearchResponse;
  return data.tracks.items
    .filter((t) => t && !t.is_local && t.id && t.uri)
    .map(toTrack);
}

// Fetch tracks by ID in chunks of 50 (Spotify's limit).
export async function fetchTracksByIds(ids: string[]): Promise<Track[]> {
  if (ids.length === 0) return [];
  const token = await getAccessToken();
  if (!token) throw new Error("Not authenticated");
  const out: Track[] = [];
  for (let i = 0; i < ids.length; i += 50) {
    const chunk = ids.slice(i, i + 50);
    const url = `https://api.spotify.com/v1/tracks?ids=${chunk.join(",")}`;
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) {
      throw new Error(`Spotify tracks ${res.status}: ${await res.text()}`);
    }
    const data = (await res.json()) as TracksResponse;
    for (const t of data.tracks) {
      if (t && t.id && t.uri) out.push(toTrack(t));
    }
  }
  // Preserve caller's ID order.
  const byId = new Map(out.map((t) => [t.id, t]));
  return ids.map((id) => byId.get(id)).filter((t): t is Track => Boolean(t));
}
