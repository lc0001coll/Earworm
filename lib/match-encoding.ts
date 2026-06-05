// URL-encoded match payload. No backend — the share URL IS the match.
//
// Encoded shape: base64url(JSON.stringify({ n: name, t: trackIds }))
// 10 tracks × 22-char Spotify IDs + name → ~250 bytes raw, comfortably fits in a URL.

export const MAX_MATCH_TRACKS = 10;

export interface Match {
  name: string;
  trackIds: string[];
}

function base64UrlEncode(str: string): string {
  if (typeof window === "undefined") {
    return Buffer.from(str, "utf-8")
      .toString("base64")
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/, "");
  }
  // utf8 → bytes → base64 → url-safe
  const bytes = new TextEncoder().encode(str);
  let bin = "";
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function base64UrlDecode(s: string): string | null {
  try {
    const padded = s.replace(/-/g, "+").replace(/_/g, "/");
    const pad = padded.length % 4 === 0 ? "" : "=".repeat(4 - (padded.length % 4));
    if (typeof window === "undefined") {
      return Buffer.from(padded + pad, "base64").toString("utf-8");
    }
    const bin = atob(padded + pad);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return new TextDecoder().decode(bytes);
  } catch {
    return null;
  }
}

export function encodeMatch(match: Match): string {
  const trimmed: Match = {
    name: match.name.slice(0, 80),
    trackIds: match.trackIds.slice(0, MAX_MATCH_TRACKS),
  };
  return base64UrlEncode(JSON.stringify({ n: trimmed.name, t: trimmed.trackIds }));
}

export function decodeMatch(encoded: string): Match | null {
  const raw = base64UrlDecode(encoded);
  if (!raw) return null;
  try {
    const obj = JSON.parse(raw);
    if (
      typeof obj !== "object" ||
      obj === null ||
      typeof obj.n !== "string" ||
      !Array.isArray(obj.t)
    ) {
      return null;
    }
    const trackIds = (obj.t as unknown[]).filter(
      (x): x is string => typeof x === "string" && /^[A-Za-z0-9]+$/.test(x),
    );
    if (trackIds.length === 0) return null;
    return {
      name: obj.n,
      trackIds: trackIds.slice(0, MAX_MATCH_TRACKS),
    };
  } catch {
    return null;
  }
}

// Short stable id for keying localStorage. Not cryptographic — collisions on
// distinct matches are vanishingly unlikely for personal use.
export function matchHash(encoded: string): string {
  let h = 5381 >>> 0;
  for (let i = 0; i < encoded.length; i++) {
    h = ((h * 33) ^ encoded.charCodeAt(i)) >>> 0;
  }
  return h.toString(36);
}
