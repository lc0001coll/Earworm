// Spotify Authorization Code with PKCE flow.
// Tokens are stored in localStorage (personal, single-player use only).

const TOKEN_KEY = "heardle:spotify:token";
const VERIFIER_KEY = "heardle:spotify:verifier";
const STATE_KEY = "heardle:spotify:state";
const RETURN_KEY = "heardle:spotify:return";

const AUTH_URL = "https://accounts.spotify.com/authorize";
const TOKEN_URL = "https://accounts.spotify.com/api/token";

export const SCOPES = [
  "streaming",
  "user-read-email",
  "user-read-private",
  "playlist-read-private",
  "playlist-read-collaborative",
  "user-top-read",
  "user-read-recently-played",
];

export interface StoredToken {
  access_token: string;
  refresh_token: string;
  expires_at: number; // epoch ms
  token_type: string;
  scope: string;
}

function getClientId(): string {
  const id = process.env.NEXT_PUBLIC_SPOTIFY_CLIENT_ID;
  if (!id) throw new Error("NEXT_PUBLIC_SPOTIFY_CLIENT_ID is not set");
  return id;
}

function getRedirectUri(): string {
  if (typeof window === "undefined") return "";
  return `${window.location.origin}/callback`;
}

function base64UrlEncode(bytes: ArrayBuffer): string {
  const bin = String.fromCharCode(...new Uint8Array(bytes));
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function randomString(length: number): string {
  const arr = new Uint8Array(length);
  crypto.getRandomValues(arr);
  let s = "";
  const chars =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~";
  for (let i = 0; i < arr.length; i++) {
    s += chars[arr[i] % chars.length];
  }
  return s;
}

async function sha256(input: string): Promise<ArrayBuffer> {
  const data = new TextEncoder().encode(input);
  return crypto.subtle.digest("SHA-256", data);
}

export async function startLogin(returnPath?: string): Promise<void> {
  const verifier = randomString(64);
  const challenge = base64UrlEncode(await sha256(verifier));
  const state = randomString(16);

  localStorage.setItem(VERIFIER_KEY, verifier);
  localStorage.setItem(STATE_KEY, state);
  if (returnPath && returnPath.startsWith("/")) {
    localStorage.setItem(RETURN_KEY, returnPath);
  } else {
    localStorage.removeItem(RETURN_KEY);
  }

  const params = new URLSearchParams({
    response_type: "code",
    client_id: getClientId(),
    scope: SCOPES.join(" "),
    code_challenge_method: "S256",
    code_challenge: challenge,
    redirect_uri: getRedirectUri(),
    state,
  });

  window.location.href = `${AUTH_URL}?${params.toString()}`;
}

export async function handleCallback(
  code: string,
  state: string | null,
): Promise<void> {
  const storedState = localStorage.getItem(STATE_KEY);
  const verifier = localStorage.getItem(VERIFIER_KEY);
  if (!verifier) throw new Error("Missing PKCE verifier");
  if (storedState && state !== storedState) throw new Error("State mismatch");

  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code,
    redirect_uri: getRedirectUri(),
    client_id: getClientId(),
    code_verifier: verifier,
  });

  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Token exchange failed: ${res.status} ${text}`);
  }

  const json = await res.json();
  saveToken({
    access_token: json.access_token,
    refresh_token: json.refresh_token,
    expires_at: Date.now() + (json.expires_in - 60) * 1000,
    token_type: json.token_type,
    scope: json.scope,
  });

  localStorage.removeItem(VERIFIER_KEY);
  localStorage.removeItem(STATE_KEY);
}

export function consumeReturnPath(): string | null {
  if (typeof window === "undefined") return null;
  const v = localStorage.getItem(RETURN_KEY);
  if (v) localStorage.removeItem(RETURN_KEY);
  return v && v.startsWith("/") ? v : null;
}

function saveToken(token: StoredToken) {
  localStorage.setItem(TOKEN_KEY, JSON.stringify(token));
}

export function getStoredToken(): StoredToken | null {
  if (typeof window === "undefined") return null;
  const raw = localStorage.getItem(TOKEN_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as StoredToken;
  } catch {
    return null;
  }
}

export function clearToken() {
  localStorage.removeItem(TOKEN_KEY);
}

let refreshPromise: Promise<StoredToken | null> | null = null;

async function refreshToken(refresh_token: string): Promise<StoredToken | null> {
  const body = new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token,
    client_id: getClientId(),
  });
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  if (!res.ok) return null;
  const json = await res.json();
  const next: StoredToken = {
    access_token: json.access_token,
    // Spotify may or may not return a new refresh token
    refresh_token: json.refresh_token ?? refresh_token,
    expires_at: Date.now() + (json.expires_in - 60) * 1000,
    token_type: json.token_type,
    scope: json.scope,
  };
  saveToken(next);
  return next;
}

export async function getAccessToken(): Promise<string | null> {
  const stored = getStoredToken();
  if (!stored) return null;
  if (Date.now() < stored.expires_at) return stored.access_token;

  if (!refreshPromise) {
    refreshPromise = refreshToken(stored.refresh_token).finally(() => {
      refreshPromise = null;
    });
  }
  const next = await refreshPromise;
  return next?.access_token ?? null;
}

export function isLoggedIn(): boolean {
  return getStoredToken() !== null;
}
