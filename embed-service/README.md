# embed-service

Tiny FastAPI app that embeds audio with [CLAP](https://huggingface.co/laion/clap-htsat-unfused).
Called by `npm run embed:playlist` to populate `data/embeddings.json`, and by
`npm run eval` to compute the clip-length accuracy table.

## Setup

```bash
cd embed-service
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn main:app --port 8000
```

First start downloads ~2GB of model weights. On Apple Silicon it runs on CPU by
default (fast enough for ~100 tracks); CUDA is auto-detected.

## Endpoints

- `POST /embed_url` — body `{ url: string, max_seconds?: number }` → `{ vector: number[], dim: number }`. Vector is L2-normalized so cosine == dot.
- `GET /health`

## Notes

- Spotify's `preview_url` returns a 30-second MP3 of the track. Some tracks have
  no preview (`null`); the batch script skips those.
