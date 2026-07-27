from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field


class Dart(BaseModel):
    label: str
    value: int = Field(ge=0, le=60)
    is_double: bool = False


class ScoreEntry(BaseModel):
    kind: Literal["total", "darts"]
    total: int | None = Field(default=None, ge=0, le=180)
    darts: list[Dart] = Field(default_factory=list, max_length=3)


class PlayerState(BaseModel):
    id: str
    name: str
    remaining: int = Field(default=501, ge=0, le=501)
    darts_thrown: int = Field(default=0, ge=0)
    visits: int = Field(default=0, ge=0)
    points_scored: int = Field(default=0, ge=0)


class TurnRecord(BaseModel):
    player_id: str
    player_name: str
    score: int
    entry: ScoreEntry
    outcome: Literal["scored", "bust", "checkout"]
    remaining_after: int
    before_players: list[PlayerState]
    before_current_player: int


class GameSnapshot(BaseModel):
    start_score: int = 501
    players: list[PlayerState] = Field(min_length=1, max_length=2)
    current_player: int = Field(default=0, ge=0)
    turns: list[TurnRecord] = Field(default_factory=list)
    winner_id: str | None = None


class ParseRequest(BaseModel):
    transcript: str = Field(min_length=1, max_length=200)


class ParseResponse(BaseModel):
    status: Literal["parsed", "ambiguous", "unrecognized"]
    candidates: list[ScoreEntry] = Field(default_factory=list)
    message: str


class ResolveRequest(BaseModel):
    snapshot: GameSnapshot
    entry: ScoreEntry


class ResolveResponse(BaseModel):
    status: Literal["accepted", "bust", "rejected", "finished"]
    snapshot: GameSnapshot
    announcement: str
    checkout_suggestion: str | None = None
    message: str | None = None
