import { NextResponse } from "next/server";
import { promises as fs } from "node:fs";
import path from "node:path";
import { pickSong, type PickInput, type PriorGame } from "@/lib/agent";
import type { TrackLite } from "@/lib/spotify-api";

interface ReqBody {
  date: string;
  candidates: TrackLite[];
  topTracks: TrackLite[];
  recent: TrackLite[];
  priorGames: PriorGame[];
}

interface TrackStats {
  distinctiveness: Record<string, number>;
}

async function loadStats(): Promise<Record<string, number> | undefined> {
  try {
    const raw = await fs.readFile(
      path.join(process.cwd(), "data", "track-stats.json"),
      "utf8",
    );
    return (JSON.parse(raw) as TrackStats).distinctiveness;
  } catch {
    return undefined;
  }
}

export async function POST(req: Request) {
  let body: ReqBody;
  try {
    body = (await req.json()) as ReqBody;
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }

  if (!body.date || !Array.isArray(body.candidates) || body.candidates.length === 0) {
    return NextResponse.json(
      { error: "missing date or candidates" },
      { status: 400 },
    );
  }

  const distinctiveness = await loadStats();

  const input: PickInput = {
    date: body.date,
    candidates: body.candidates,
    topTracks: body.topTracks ?? [],
    recent: body.recent ?? [],
    priorGames: body.priorGames ?? [],
    distinctiveness,
  };

  try {
    const out = await pickSong(input);
    return NextResponse.json({ ...out, source: "agent" });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 500 },
    );
  }
}
