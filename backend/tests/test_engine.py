from app.engine import checkout_suggestion, resolve_turn
from app.models import Dart, GameSnapshot, PlayerState, ScoreEntry


def snapshot(remaining: int = 501) -> GameSnapshot:
    return GameSnapshot(players=[PlayerState(id="a", name="Ada", remaining=remaining), PlayerState(id="b", name="Ben", remaining=501)])


def test_score_rotates_to_next_player():
    result = resolve_turn(snapshot(), ScoreEntry(kind="total", total=100))
    assert result.status == "accepted"
    assert result.snapshot.players[0].remaining == 401
    assert result.snapshot.current_player == 1


def test_three_dart_voice_visit_deducts_its_total():
    entry = ScoreEntry(kind="darts", darts=[
        Dart(label="Triple 20", value=60),
        Dart(label="Triple 20", value=60),
        Dart(label="Double 11", value=22, is_double=True),
    ])
    result = resolve_turn(snapshot(), entry)
    assert result.status == "accepted"
    assert result.snapshot.players[0].remaining == 359


def test_bust_restores_score():
    game = snapshot(32)
    game.players[0].points_scored = 120
    game.players[0].darts_thrown = 9
    result = resolve_turn(game, ScoreEntry(kind="total", total=31))
    assert result.status == "bust"
    assert result.snapshot.players[0].remaining == 32
    assert result.snapshot.players[0].points_scored == 120
    assert result.snapshot.players[0].darts_thrown == 12


def test_dart_checkout_requires_double():
    entry = ScoreEntry(kind="darts", darts=[Dart(label="Single 20", value=20)])
    assert resolve_turn(snapshot(20), entry).status == "bust"
    entry = ScoreEntry(kind="darts", darts=[Dart(label="Double 10", value=20, is_double=True)])
    assert resolve_turn(snapshot(20), entry).status == "finished"


def test_total_checkout_is_trusted():
    assert resolve_turn(snapshot(40), ScoreEntry(kind="total", total=40)).status == "finished"


def test_checkout_suggestion():
    assert checkout_suggestion(40) == "D20"
