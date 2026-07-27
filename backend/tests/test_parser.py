from app.parser import parse_transcript


def test_parses_spoken_total():
    response = parse_transcript("one hundred and forty")
    assert response.status == "parsed"
    assert response.candidates[0].kind == "total"
    assert response.candidates[0].total == 140


def test_parses_dart_calls():
    response = parse_transcript("triple twenty, triple twenty, bull")
    assert response.status == "parsed"
    assert [dart.value for dart in response.candidates[0].darts] == [60, 60, 50]


def test_parses_consecutive_spoken_dart_calls_without_commas():
    response = parse_transcript("triple twenty triple twenty double eleven")
    assert response.status == "parsed"
    assert [dart.value for dart in response.candidates[0].darts] == [60, 60, 22]
    assert sum(dart.value for dart in response.candidates[0].darts) == 142


def test_parses_unprefixed_numbers_as_singles_in_a_multi_dart_call():
    response = parse_transcript("twenty triple twenty twenty")
    assert response.status == "parsed"
    assert [dart.value for dart in response.candidates[0].darts] == [20, 60, 20]
    assert [dart.label for dart in response.candidates[0].darts] == ["Single 20", "Triple 20", "Single 20"]


def test_parses_all_bare_dart_numbers_as_singles():
    response = parse_transcript("twenty twenty twenty")
    assert response.status == "parsed"
    assert [dart.value for dart in response.candidates[0].darts] == [20, 20, 20]


def test_rejects_out_of_range_total():
    assert parse_transcript("two hundred").status == "unrecognized"
