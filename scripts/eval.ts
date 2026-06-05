/**
 * Offline eval: how often does a CLAP-NN classifier pick the correct song
 * from a clip of length L? Computes acc@1 and acc@5 per Heardle clip length.
 *
 * Run:  npm run eval
 *
 * Requires data/embeddings.json (run `npm run embed:playlist` first) and a
 * running embed-service for the clip-length re-embedding pass.
 */
import { promises as fs } from "node:fs";
import path from "node:path";
import "dotenv/config";

const ROOT = process.cwd();
const DATA_DIR = path.join(ROOT, "data");
const EMBED_URL = process.env.EMBED_SERVICE_URL ?? "http://127.0.0.1:8000";

const CLIP_LENGTHS_SEC = [1, 2, 4, 7, 11, 16];

interface EmbedFile {
  dim: number;
  vectors: Record<string, number[]>;
  meta: Record<string, { name: string; artists: string[]; album: string }>;
}

interface TrackStats {
  preview_urls: Record<string, string>;
}

interface EmbedResp {
  vector: number[];
}

async function loadEmbeddings(): Promise<EmbedFile> {
  const raw = await fs.readFile(path.join(DATA_DIR, "embeddings.json"), "utf8");
  return JSON.parse(raw) as EmbedFile;
}

async function loadPreviewUrls(): Promise<Record<string, string>> {
  // Re-fetch preview_urls from the saved embed run. The embed script doesn't
  // currently persist these, so we ask the user to keep .spotify-token.json
  // and re-derive them from the playlist. For simplicity, we instead require
  // a sidecar file produced by embed-playlist next pass.
  try {
    const raw = await fs.readFile(path.join(DATA_DIR, "preview-urls.json"), "utf8");
    return (JSON.parse(raw) as TrackStats).preview_urls;
  } catch {
    throw new Error(
      "Missing data/preview-urls.json. Re-run npm run embed:playlist after pulling latest.",
    );
  }
}

function cosine(a: number[], b: number[]): number {
  let dot = 0;
  for (let i = 0; i < a.length; i++) dot += a[i] * b[i];
  return dot;
}

async function embedClip(url: string, maxSec: number): Promise<number[]> {
  const res = await fetch(`${EMBED_URL}/embed_url`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ url, max_seconds: maxSec }),
  });
  if (!res.ok) throw new Error(`embed ${res.status}: ${await res.text()}`);
  return ((await res.json()) as EmbedResp).vector;
}

function topK(
  query: number[],
  corpus: Record<string, number[]>,
  k: number,
): string[] {
  const scored: { id: string; score: number }[] = [];
  for (const [id, vec] of Object.entries(corpus)) {
    scored.push({ id, score: cosine(query, vec) });
  }
  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, k).map((s) => s.id);
}

async function main() {
  const embeds = await loadEmbeddings();
  const previewUrls = await loadPreviewUrls();
  const ids = Object.keys(embeds.vectors).filter((id) => previewUrls[id]);
  console.log(`> evaluating on ${ids.length} tracks`);

  const results: { sec: number; acc1: number; acc5: number }[] = [];

  for (const sec of CLIP_LENGTHS_SEC) {
    let hit1 = 0;
    let hit5 = 0;
    for (let i = 0; i < ids.length; i++) {
      const id = ids[i];
      process.stdout.write(`  ${sec}s [${i + 1}/${ids.length}]\r`);
      try {
        const clipVec = await embedClip(previewUrls[id], sec);
        const top = topK(clipVec, embeds.vectors, 5);
        if (top[0] === id) hit1++;
        if (top.includes(id)) hit5++;
      } catch (e) {
        console.warn(`\n  failed on ${id}: ${(e as Error).message}`);
      }
    }
    const acc1 = hit1 / ids.length;
    const acc5 = hit5 / ids.length;
    results.push({ sec, acc1, acc5 });
    console.log(
      `\n  ${sec}s — acc@1 ${acc1.toFixed(3)}  acc@5 ${acc5.toFixed(3)}`,
    );
  }

  let md = "# CLAP nearest-neighbor accuracy by clip length\n\n";
  md += `Corpus: ${ids.length} tracks.\n\n`;
  md += "| Clip (s) | acc@1 | acc@5 |\n|---|---|---|\n";
  for (const r of results) {
    md += `| ${r.sec} | ${r.acc1.toFixed(3)} | ${r.acc5.toFixed(3)} |\n`;
  }
  await fs.writeFile(path.join(DATA_DIR, "eval.md"), md);
  console.log(`> wrote data/eval.md`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
