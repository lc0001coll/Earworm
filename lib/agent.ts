/**
 * Anthropic SDK wrapper used only in server-side route handlers.
 * The Anthropic API key never leaves the server.
 */
import Anthropic from "@anthropic-ai/sdk";
import type { TrackLite } from "./spotify-api";

export interface PriorGame {
  date: string;
  answerId: string;
  answerName: string;
  result: "won" | "lost";
  attempts: number;
}

export interface PickInput {
  date: string;
  candidates: TrackLite[];
  topTracks: TrackLite[];
  recent: TrackLite[];
  priorGames: PriorGame[];
  // optional: per-track distinctiveness from data/track-stats.json
  distinctiveness?: Record<string, number>;
}

export interface PickOutput {
  trackId: string;
  rationale: string;
  difficultyTarget: "easy" | "medium" | "hard";
}

const MODEL = "claude-sonnet-4-5";

const SYSTEM = `You are the curation agent for a personal Heardle clone. Each day you pick one
song from a fixed playlist that the player should be challenged with.

Selection heuristics (in priority order):
1. The pick MUST be one of the candidates by id.
2. Prefer songs whose artist or album also appears in the user's topTracks —
   they are more likely to recognize it.
3. Avoid songs that appear in "recent" (already top of mind).
4. Calibrate difficulty using priorGames: after losses, prefer easier picks
   (higher distinctiveness = sounds more unique = easier); after wins, harder.
5. Don't repeat answer ids from priorGames within the last 30 days.

Write a 1-2 sentence rationale explaining the pick (NEVER reveal the title or
artist — the rationale is shown only after the round ends).

Respond by calling the pick_song tool exactly once.`;

const PICK_TOOL = {
  name: "pick_song",
  description: "Choose today's song.",
  input_schema: {
    type: "object" as const,
    required: ["track_id", "rationale", "difficulty_target"],
    properties: {
      track_id: { type: "string" },
      rationale: { type: "string" },
      difficulty_target: {
        type: "string",
        enum: ["easy", "medium", "hard"],
      },
    },
  },
};

export async function pickSong(input: PickInput): Promise<PickOutput> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY not set");

  const client = new Anthropic({ apiKey });

  // Compact the candidate list with distinctiveness for the prompt.
  const candidates = input.candidates.map((c) => ({
    id: c.id,
    name: c.name,
    artists: c.artists,
    album: c.album,
    distinctiveness: input.distinctiveness?.[c.id] ?? null,
  }));

  const userMsg = JSON.stringify(
    {
      date: input.date,
      candidates,
      topTracks: input.topTracks.map((t) => ({
        id: t.id,
        name: t.name,
        artists: t.artists,
      })),
      recent: input.recent.map((t) => ({
        id: t.id,
        name: t.name,
        artists: t.artists,
      })),
      priorGames: input.priorGames,
    },
    null,
    0,
  );

  const res = await client.messages.create({
    model: MODEL,
    max_tokens: 1024,
    system: SYSTEM,
    tools: [PICK_TOOL],
    tool_choice: { type: "tool", name: "pick_song" },
    messages: [{ role: "user", content: userMsg }],
  });

  const toolUse = res.content.find((b) => b.type === "tool_use");
  if (!toolUse || toolUse.type !== "tool_use") {
    throw new Error("Agent did not produce a tool call");
  }
  const args = toolUse.input as {
    track_id: string;
    rationale: string;
    difficulty_target: "easy" | "medium" | "hard";
  };

  // Defensive: ensure the chosen id actually exists in the candidate set.
  const valid = candidates.some((c) => c.id === args.track_id);
  if (!valid) throw new Error(`Agent picked invalid track id: ${args.track_id}`);

  return {
    trackId: args.track_id,
    rationale: args.rationale,
    difficultyTarget: args.difficulty_target,
  };
}
