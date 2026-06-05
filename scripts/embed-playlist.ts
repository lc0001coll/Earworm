/**
 * Batch-embed every preview clip in the playlist with the local CLAP service,
 * then write data/embeddings.json + data/track-stats.json.
 *
 * Run:  npm run embed:playlist
 *
 * Auth: reads .spotify-token.json from repo root (copy the contents of the
 * `heardle:spotify:token` localStorage key from the running app).
 */
import { promises as fs } from "node:fs";
import path from "node:path";
import "dotenv/config";

interface StoredToken {
  access_token: string;
}

interface SpotifyTrack {
  id: string;
  name: string;
  is_local?: boolean;
  preview_url: string | null;
  artists: { name: string }[];
  album: { name: string };
}

interface PlaylistResp {
  items: { track: SpotifyTrack | null }[];
  next: string | null;
}

interface EmbedResp {
  vector: number[];
  dim: number;
}

const ROOT = process.cwd();
const DATA_DIR = path.join(ROOT, "data");
const TOKEN_FILE = path.join(ROOT, ".spotify-token.json");
const EMBED_URL = process.env.EMBED_SERVICE_URL ?? "http://127.0.0.1:8000";

function parsePlaylistId(input: string): string {
  const m = input.match(/playlist[/:]([A-Za-z0-9]+)/);
  if (m) return m[1];
  if (/^[A-Za-z0-9]+$/.test(input)) return input;
  throw new Error(`Cannot parse playlist URL: ${input}`);
}

async function loadToken(): Promise<string> {
  try {
    const raw = await fs.readFile(TOKEN_FILE, "utf8");
    const parsed = JSON.parse(raw) as StoredToken;
    if (!parsed.access_token) throw new Error("no access_token in file");
    return parsed.access_token;
  } catch (e) {
    throw new Error(
      `Could not read ${TOKEN_FILE}. In the running app, open DevTools → Application → ` +
        `Local Storage, copy the value of "heardle:spotify:token", and paste it into ` +
        `.spotify-token.json at the repo root.\n  cause: ${(e as Error).message}`,
    );
  }
}

async function fetchAllTracks(playlistId: string, token: string) {
  const tracks: SpotifyTrack[] = [];
  let url:
    | string
    | null = `https://api.spotify.com/v1/playlists/${playlistId}/tracks?limit=100&fields=items(track(id,name,is_local,preview_url,artists(name),album(name))),next`;
  while (url) {
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) throw new Error(`Spotify ${res.status}: ${await res.text()}`);
    const data = (await res.json()) as PlaylistResp;
    for (const item of data.items) {
      if (item.track && !item.track.is_local && item.track.id) {
        tracks.push(item.track);
      }
    }
    url = data.next;
  }
  return tracks;
}

async function embed(url: string): Promise<number[]> {
  const res = await fetch(`${EMBED_URL}/embed_url`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ url }),
  });
  if (!res.ok) throw new Error(`embed ${res.status}: ${await res.text()}`);
  const json = (await res.json()) as EmbedResp;
  return json.vector;
}

function cosine(a: number[], b: number[]): number {
  let dot = 0;
  for (let i = 0; i < a.length; i++) dot += a[i] * b[i];
  return dot; // vectors are L2-normalized
}

function distinctiveness(
  vectors: Record<string, number[]>,
): Record<string, number> {
  const ids = Object.keys(vectors);
  const stats: Record<string, number> = {};
  for (const id of ids) {
    let sumDist = 0;
    let n = 0;
    for (const other of ids) {
      if (other === id) continue;
      sumDist += 1 - cosine(vectors[id], vectors[other]);
      n++;
    }
    stats[id] = n > 0 ? sumDist / n : 0;
  }
  return stats;
}

async function main() {
  const playlistUrl = process.env.NEXT_PUBLIC_PLAYLIST_URL;
  if (!playlistUrl) throw new Error("NEXT_PUBLIC_PLAYLIST_URL not set in .env.local");
  const playlistId = parsePlaylistId(playlistUrl);

  console.log(`> Loading Spotify token from ${TOKEN_FILE}`);
  const token = await loadToken();
  console.log(`> Fetching playlist ${playlistId}`);
  const tracks = await fetchAllTracks(playlistId, token);
  console.log(`> ${tracks.length} tracks total`);

  const previewable = tracks.filter((t) => t.preview_url);
  console.log(`> ${previewable.length} have preview_url; embedding...`);

  await fs.mkdir(DATA_DIR, { recursive: true });
  const vectors: Record<string, number[]> = {};
  const meta: Record<string, { name: string; artists: string[]; album: string }> = {};
  const previewUrls: Record<string, string> = {};

  for (let i = 0; i < previewable.length; i++) {
    const t = previewable[i];
    process.stdout.write(`  [${i + 1}/${previewable.length}] ${t.name} ... `);
    try {
      vectors[t.id] = await embed(t.preview_url!);
      meta[t.id] = {
        name: t.name,
        artists: t.artists.map((a) => a.name),
        album: t.album.name,
      };
      previewUrls[t.id] = t.preview_url!;
      console.log("ok");
    } catch (e) {
      console.log(`FAIL (${(e as Error).message})`);
    }
  }

  await fs.writeFile(
    path.join(DATA_DIR, "preview-urls.json"),
    JSON.stringify({ preview_urls: previewUrls }),
  );

  await fs.writeFile(
    path.join(DATA_DIR, "embeddings.json"),
    JSON.stringify({ dim: Object.values(vectors)[0]?.length ?? 0, vectors, meta }),
  );

  console.log("> computing distinctiveness");
  const stats = distinctiveness(vectors);
  // also include tracks we couldn't embed, so the agent sees them
  for (const t of tracks) {
    if (!(t.id in stats)) stats[t.id] = 0;
  }
  await fs.writeFile(
    path.join(DATA_DIR, "track-stats.json"),
    JSON.stringify({
      distinctiveness: stats,
      embedded: Object.keys(vectors),
    }),
  );

  console.log(
    `> wrote ${Object.keys(vectors).length} embeddings to data/embeddings.json`,
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
