# multiplayer-service

Minimal standalone WebSocket relay for host-driven live matches. Holds all room
state in memory and is the single source of truth for scoring and the
one-guess-per-hint-level rule. No database, no third-party realtime vendor.

## Run

```bash
cd multiplayer-service
npm install
npm start            # ws://127.0.0.1:8787 (override with PORT=...)
```

Point the web app at it via `NEXT_PUBLIC_MULTIPLAYER_URL` in `.env.local`
(defaults to `ws://127.0.0.1:8787`).

## Protocol

Message types are shared with the client in `../lib/multiplayer-protocol.ts`.
The host creates a room and drives it; guests join with a room code + nickname
and submit at most one guess per hint level. Scoring:
`points = MAX_ATTEMPTS − hintLevel` (hint 1 = 5, hint 6 = 0).

State is in-memory only — restarting the relay clears all rooms.
