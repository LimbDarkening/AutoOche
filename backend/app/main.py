from __future__ import annotations

import os
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse

from .engine import checkout_suggestion, resolve_turn
from .models import ParseRequest, ParseResponse, ResolveRequest, ResolveResponse
from .parser import parse_transcript

app = FastAPI(title="Auto Oche API", version="1.0.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/api/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.post("/api/score/parse", response_model=ParseResponse)
def parse_score(request: ParseRequest) -> ParseResponse:
    return parse_transcript(request.transcript)


@app.post("/api/turns/resolve", response_model=ResolveResponse)
def resolve(request: ResolveRequest) -> ResolveResponse:
    return resolve_turn(request.snapshot, request.entry)


@app.get("/api/checkouts/{remaining}")
def checkout(remaining: int) -> dict[str, str | None]:
    return {"suggestion": checkout_suggestion(remaining)}


STATIC_DIR = Path(os.getenv("STATIC_DIR", Path(__file__).resolve().parents[2] / "frontend" / "dist"))


@app.get("/{path:path}", include_in_schema=False)
def frontend(path: str):
    requested = STATIC_DIR / path
    if path and requested.is_file():
        return FileResponse(requested)
    index = STATIC_DIR / "index.html"
    if index.is_file():
        return FileResponse(index)
    return {"message": "Auto Oche API is running. Build the frontend to see the app."}
