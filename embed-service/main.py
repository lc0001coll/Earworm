"""CLAP audio embedding microservice.

Run:  uvicorn main:app --port 8000
"""
from __future__ import annotations

import io
from typing import Optional

import httpx
import librosa
import numpy as np
import torch
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
from transformers import ClapModel, ClapProcessor

MODEL_NAME = "laion/clap-htsat-unfused"
SAMPLE_RATE = 48000  # CLAP expects 48k

app = FastAPI(title="self-heardle embed-service")

device = "cuda" if torch.cuda.is_available() else "cpu"
print(f"[embed-service] loading {MODEL_NAME} on {device}...")
processor = ClapProcessor.from_pretrained(MODEL_NAME)
model = ClapModel.from_pretrained(MODEL_NAME).to(device).eval()
print("[embed-service] ready.")


class EmbedUrlRequest(BaseModel):
    url: str
    # If set, only embed the first `max_seconds` of audio. Useful for the eval
    # script to simulate Heardle clip lengths.
    max_seconds: Optional[float] = None


class EmbedResponse(BaseModel):
    vector: list[float]
    dim: int


def _embed_pcm(samples: np.ndarray) -> list[float]:
    inputs = processor(
        audios=samples,
        sampling_rate=SAMPLE_RATE,
        return_tensors="pt",
    ).to(device)
    with torch.no_grad():
        feats = model.get_audio_features(**inputs)
    # L2-normalize so cosine == dot
    feats = feats / feats.norm(dim=-1, keepdim=True).clamp(min=1e-12)
    return feats[0].cpu().tolist()


@app.post("/embed_url", response_model=EmbedResponse)
def embed_url(req: EmbedUrlRequest) -> EmbedResponse:
    try:
        resp = httpx.get(req.url, timeout=20.0, follow_redirects=True)
        resp.raise_for_status()
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"fetch failed: {e}") from e

    try:
        samples, _ = librosa.load(
            io.BytesIO(resp.content), sr=SAMPLE_RATE, mono=True,
        )
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"decode failed: {e}") from e

    if req.max_seconds is not None and req.max_seconds > 0:
        n = int(req.max_seconds * SAMPLE_RATE)
        samples = samples[:n]
    if len(samples) < SAMPLE_RATE // 2:
        # CLAP needs a reasonable amount of audio; pad if too short.
        samples = np.pad(samples, (0, SAMPLE_RATE // 2 - len(samples)))

    vec = _embed_pcm(samples)
    return EmbedResponse(vector=vec, dim=len(vec))


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok", "model": MODEL_NAME, "device": device}
