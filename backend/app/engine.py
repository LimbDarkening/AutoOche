from __future__ import annotations

from copy import deepcopy

from .models import Dart, GameSnapshot, ResolveResponse, ScoreEntry, TurnRecord


def checkout_suggestion(remaining: int) -> str | None:
    """Return a concise, valid route that ends on a double or inner bull."""
    if remaining < 2 or remaining > 170:
        return None
    finishes = [(50, "Bull")] + [(number * 2, f"D{number}") for number in range(20, 0, -1)]
    scoring = [(number * 3, f"T{number}") for number in range(20, 0, -1)]
    scoring += [(50, "Bull"), (25, "25")]
    scoring += [(number, str(number)) for number in range(20, 0, -1)]
    for darts_before in range(0, 3):
        if darts_before == 0:
            prefixes = [([], 0)]
        elif darts_before == 1:
            prefixes = [([label], value) for value, label in scoring]
        else:
            prefixes = [([first_label, second_label], first_value + second_value)
                        for first_value, first_label in scoring
                        for second_value, second_label in scoring]
        for labels, subtotal in prefixes:
            for finish_value, finish_label in finishes:
                if subtotal + finish_value == remaining:
                    return " ".join(labels + [finish_label])
    return None


def _entry_score(entry: ScoreEntry) -> int | None:
    if entry.kind == "total":
        return entry.total
    if not entry.darts or len(entry.darts) > 3:
        return None
    return sum(dart.value for dart in entry.darts)


def resolve_turn(snapshot: GameSnapshot, entry: ScoreEntry) -> ResolveResponse:
    if snapshot.winner_id:
        return ResolveResponse(status="rejected", snapshot=snapshot,
                               announcement="This game has already finished.", message="Start a new game to continue.")
    if snapshot.current_player >= len(snapshot.players):
        return ResolveResponse(status="rejected", snapshot=snapshot,
                               announcement="Game state is invalid.", message="Current player is missing.")
    score = _entry_score(entry)
    if score is None or score < 0 or score > 180:
        return ResolveResponse(status="rejected", snapshot=snapshot,
                               announcement="That score is not valid.", message="A visit must be between 0 and 180, with up to three darts.")

    result = snapshot.model_copy(deep=True)
    player = result.players[result.current_player]
    before_players = deepcopy(result.players)
    before_current_player = result.current_player
    prospective = player.remaining - score
    final_dart_is_double = entry.kind == "total" or bool(entry.darts and entry.darts[-1].is_double)
    bust = prospective < 0 or prospective == 1 or (prospective == 0 and not final_dart_is_double)

    darts_used = len(entry.darts) if entry.kind == "darts" else 3
    player.darts_thrown += darts_used
    player.visits += 1
    if bust:
        result.turns.append(TurnRecord(
            player_id=player.id, player_name=player.name, score=score, entry=entry,
            outcome="bust", remaining_after=player.remaining, before_players=before_players,
            before_current_player=before_current_player,
        ))
        result.current_player = (result.current_player + 1) % len(result.players)
        return ResolveResponse(status="bust", snapshot=result,
                               announcement=f"Bust. {player.name} remains on {player.remaining}.",
                               checkout_suggestion=checkout_suggestion(result.players[result.current_player].remaining))

    # A bust uses darts but scores no points, so it must not inflate the average.
    player.points_scored += score
    player.remaining = prospective
    outcome = "checkout" if prospective == 0 else "scored"
    result.turns.append(TurnRecord(
        player_id=player.id, player_name=player.name, score=score, entry=entry,
        outcome=outcome, remaining_after=prospective, before_players=before_players,
        before_current_player=before_current_player,
    ))
    if prospective == 0:
        result.winner_id = player.id
        return ResolveResponse(status="finished", snapshot=result,
                               announcement=f"Game shot and the match, {player.name}!",
                               message=f"{player.name} wins.")
    result.current_player = (result.current_player + 1) % len(result.players)
    next_player = result.players[result.current_player]
    return ResolveResponse(
        status="accepted", snapshot=result,
        announcement=f"{player.name} scored {score}. {player.remaining} remaining. {next_player.name} to throw.",
        checkout_suggestion=checkout_suggestion(next_player.remaining),
    )
