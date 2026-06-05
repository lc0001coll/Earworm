# Earworm

Guess the song from progressively longer clips — an AI-curated, Spotify-powered
music game with custom matches and live multiplayer. Each round reveals up to six
growing snippets (1s → 2s → 4s → 7s → 11s → 16s); the sooner you name the track,
the better you score. Built with Next.js (App Router), TypeScript, Tailwind CSS,
and the Spotify Web Playback SDK.

## Features

- Spotify OAuth (Authorization Code with PKCE) — no client secret in the browser.
- **Curation agent** (Claude Sonnet 4.5) picks each day's song from your top
  tracks + recent listens + prior-game history. Falls back to a deterministic
  hash when offline.
- **Audio embedding layer** — local CLAP service embeds preview clips once,
  powering (a) per-track difficulty signals fed into the agent, (b) post-game
  cosine-distance "closest miss" hints, and (c) an offline eval table
  measuring NN classifier accuracy by clip length (the demo metric).
- Custom audio UI with hard cutoff enforced from real playback position (not
  just `setTimeout`).
- Autocomplete guess input filtered against the playlist.
- Win/loss state with a shareable emoji grid (🟩 🟥 ⬛).
- Game state + last 30 game results persisted in `localStorage`.

## Spotify setup

1. Go to <https://developer.spotify.com/dashboard> and create a new app.
2. Open the app's **Settings** and add a Redirect URI:
   `http://127.0.0.1:3000/callback` (exactly — no trailing slash, no `https`).
   Spotify does **not** allow `localhost` as a redirect URI; you must use the
   explicit loopback IP `127.0.0.1` (or `[::1]`).
3. Copy the **Client ID** from the dashboard.
4. Pick or create a Spotify playlist with the songs you want to play with.
   Copy its share URL, e.g. `https://open.spotify.com/playlist/abc123...`.
5. Create `.env.local` from the example and fill in values:

   ```env
   NEXT_PUBLIC_SPOTIFY_CLIENT_ID=xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
   NEXT_PUBLIC_PLAYLIST_URL=https://open.spotify.com/playlist/abc123...
   ```

   These env vars must be prefixed with `NEXT_PUBLIC_` because they're read in
   the browser. The Client ID is not a secret in the PKCE flow.

6. **Important:** Spotify treats unverified apps as "development mode" and only
   allows users explicitly added under *Settings → Users and Access* to log in.
   Add your own Spotify account email there.

The Spotify scopes requested are:
`streaming`, `user-read-email`, `user-read-private`, `playlist-read-private`,
`playlist-read-collaborative`, `user-top-read`, `user-read-recently-played`.

## Run

```bash
npm install
npm run dev
```

Open <http://127.0.0.1:3000> (not `localhost`! the redirect URI must match
exactly), click **Connect Spotify**, and complete OAuth. Tokens are stored in
`localStorage` and refreshed automatically.

> Requires **Spotify Premium** — the Web Playback SDK won't produce audio on
> Free accounts.

## Frontier-lab mode

The base game works without any AI. Turn it into the CS 153 demo with three
additional steps.

### 1. Start the local CLAP embed-service

```bash
cd embed-service
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
uvicorn main:app --port 8000
```

First start downloads ~2GB of `laion/clap-htsat-unfused`. See
`embed-service/README.md`.

### 2. Batch-embed the playlist

This populates `data/embeddings.json` (per-track CLAP vectors) and
`data/track-stats.json` (per-track distinctiveness used by the agent).

```bash
# 1. log in to the app once at http://127.0.0.1:3000
# 2. in DevTools → Application → Local Storage, copy the JSON value of the
#    "heardle:spotify:token" key into ./.spotify-token.json
npm run embed:playlist
```

Tracks without a `preview_url` are skipped (Spotify omits previews for some).

### 3. Set ANTHROPIC_API_KEY and restart

```env
ANTHROPIC_API_KEY=sk-ant-...
```

With it set, the daily song is now picked by Claude Sonnet 4.5 with full
visibility into your top tracks, recent plays, prior wins/losses, and per-track
distinctiveness. The agent's rationale is shown at the end of each round. If
the key is missing or the call fails, the game silently falls back to the
deterministic hash.

### 4. Run the eval (demo metric)

```bash
npm run eval
```

Writes `data/eval.md` — acc@1 / acc@5 of a CLAP nearest-neighbor classifier on
clips of length 1s, 2s, 4s, 7s, 11s, 16s. Compare those numbers against your
own win/loss log (from `localStorage["heardle:prior-games"]`) for the writeup.

## Multiplayer mode

Run a match live for a group: the **host** plays each clip aloud (in person or
over screen-share) and drives the hints; **guests** just see the current hint
level and a guess box — no Spotify account or Premium required.

### 1. Start the relay

A tiny standalone WebSocket server holds room state and enforces scoring.

```bash
cd multiplayer-service
npm install
npm start            # ws://127.0.0.1:8787
```

Set `NEXT_PUBLIC_MULTIPLAYER_URL` in `.env.local` if you change the port
(defaults to `ws://127.0.0.1:8787`).

### 2. Host a room

1. Build a match at `/create` and copy its link.
2. Open **Host a live match** (`/host`), sign in with Spotify Premium, and paste
   the match link or encoded string.
3. Share the room code (or `/play/CODE` link) with your guests.
4. Press **Start first song**, play the clip aloud, then **Advance hint** to
   lengthen the clip or **Reveal answer** to move on.

### 3. Guests play

Guests open `/play/CODE`, pick a unique nickname, and submit at most **one guess
per hint level**. A correct guess at hint level *L* scores `6 − L` points (hint 1
= 5, hint 6 = 0) and locks the guest for that song. Signed-in guests get
full-catalog autocomplete; everyone else types a free-text title matched against
the match's own songs. After the last song, everyone sees the same leaderboard.

The relay keeps state in memory only — if the host disconnects the room closes;
a guest who reconnects with the same nickname rejoins with their score intact.

## How it works

- `lib/spotify-auth.ts` — PKCE flow, token storage and refresh.
- `lib/spotify-api.ts` — playlist fetching (with pagination + 24h cache); the
  deterministic `dailyIndex` hash is kept as the agent fallback.
- `lib/spotify-history.ts` — fetches top tracks and recently-played for the agent.
- `lib/agent.ts` — server-side Anthropic SDK wrapper + the `pick_song` tool schema.
- `hooks/useSpotifyPlayer.ts` — Spotify Web Playback SDK wrapper. Polls
  position at ~30ms and listens for `player_state_changed`; whenever
  `position >= cap`, it pauses *and* seeks to 0, so subsequent plays restart
  from the start.
- `hooks/useHeardleGame.ts` — pure game state machine.
- `hooks/useDailyPick.ts` — calls `/api/agent/pick`; caches the choice
  per-day; falls back to the hash.
- `app/api/agent/pick/route.ts` — Claude Sonnet 4.5 tool-use call; reads
  `data/track-stats.json` server-side for difficulty hints.
- `app/api/embeddings/route.ts` — serves `data/embeddings.json` so the
  post-game similarity hint can compute cosine distances client-side.
- `embed-service/main.py` — FastAPI + CLAP, exposes `POST /embed_url`.
- `scripts/embed-playlist.ts` — batch embed of every preview clip.
- `scripts/eval.ts` — clip-length accuracy table.

## Project structure

```
app/
  layout.tsx
  page.tsx                       // entry: sign-in or <HeardleGame />
  callback/page.tsx              // PKCE redirect target
  api/
    agent/pick/route.ts          // Claude picks today's song
    embeddings/route.ts          // serves data/embeddings.json
components/
  HeardleGame.tsx, ClipPlayer.tsx, GuessInput.tsx,
  ProgressStrip.tsx, EndScreen.tsx, CurationCard.tsx, SimilarityHint.tsx
hooks/
  useSpotifyPlayer.ts, useHeardleGame.ts, useDailyPick.ts
lib/
  spotify-auth.ts, spotify-api.ts, spotify-history.ts, agent.ts
scripts/
  embed-playlist.ts, eval.ts
embed-service/
  main.py, requirements.txt
data/                            // gitignored; produced by embed:playlist + eval
```

## Notes / out of scope

- No persistent backend or database; the multiplayer relay holds room state in
  memory only and forgets it when the host disconnects.
- No accounts beyond Spotify OAuth (and guests need none).
- Desktop browser only; mobile layout isn't tuned.
