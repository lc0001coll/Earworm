import { NextResponse } from "next/server";
import { promises as fs } from "node:fs";
import path from "node:path";

export async function GET() {
  try {
    const raw = await fs.readFile(
      path.join(process.cwd(), "data", "embeddings.json"),
      "utf8",
    );
    return new NextResponse(raw, {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        // Embeddings change only on re-run of embed:playlist; cache for an hour.
        "Cache-Control": "public, max-age=3600",
      },
    });
  } catch {
    return NextResponse.json(
      { error: "embeddings not generated yet; run npm run embed:playlist" },
      { status: 404 },
    );
  }
}
