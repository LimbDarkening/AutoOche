from __future__ import annotations

import re

from .models import Dart, ParseResponse, ScoreEntry


UNITS = {
    "zero": 0, "oh": 0, "one": 1, "two": 2, "three": 3, "four": 4,
    "five": 5, "six": 6, "seven": 7, "eight": 8, "nine": 9, "ten": 10,
    "eleven": 11, "twelve": 12, "thirteen": 13, "fourteen": 14,
    "fifteen": 15, "sixteen": 16, "seventeen": 17, "eighteen": 18,
    "nineteen": 19,
}
TENS = {
    "twenty": 20, "thirty": 30, "forty": 40, "fifty": 50,
    "sixty": 60, "seventy": 70, "eighty": 80, "ninety": 90,
}
NUMBER_WORDS = set(UNITS) | set(TENS) | {"hundred"}


def normalise(text: str) -> str:
    text = text.lower().replace("-", " ")
    text = re.sub(r"[^a-z0-9, ]", " ", text)
    text = re.sub(r"\s+", " ", text).strip()
    return text


def number_from_words(text: str) -> int | None:
    tokens = [token for token in text.split() if token != "and"]
    if not tokens:
        return None
    total = 0
    current = 0
    for token in tokens:
        if token.isdigit():
            current += int(token)
        elif token in UNITS:
            current += UNITS[token]
        elif token in TENS:
            current += TENS[token]
        elif token == "hundred":
            if current == 0:
                current = 1
            current *= 100
        else:
            return None
    return total + current


def _number_at(tokens: list[str], start: int) -> tuple[int | None, int]:
    if start >= len(tokens):
        return None, start
    token = tokens[start]
    if token.isdigit():
        return int(token), start + 1
    if token in UNITS or token in TENS:
        value = UNITS.get(token, TENS.get(token))
        if start + 1 < len(tokens) and token in TENS and tokens[start + 1] in UNITS:
            value += UNITS[tokens[start + 1]]
            return value, start + 2
        return value, start + 1
    return None, start


def _dart_from_phrase(phrase: str) -> Dart | None:
    tokens = [token for token in phrase.split() if token not in {"a", "the"}]
    if not tokens:
        return None
    if tokens in (["miss"], ["zero"]):
        return Dart(label="Miss", value=0)
    if tokens in (["bull"], ["inner", "bull"]):
        return Dart(label="Bull", value=50, is_double=True)
    if tokens == ["outer", "bull"]:
        return Dart(label="Outer bull", value=25)

    multiplier = 1
    prefix = "Single"
    position = 0
    if tokens[0] in {"single", "double", "triple"}:
        prefix = tokens[0].title()
        multiplier = {"single": 1, "double": 2, "triple": 3}[tokens[0]]
        position = 1
    number, position = _number_at(tokens, position)
    if number is None or position != len(tokens) or not 1 <= number <= 20:
        return None
    return Dart(label=f"{prefix} {number}", value=multiplier * number, is_double=multiplier == 2)


def _parse_dart_sequence(text: str) -> list[Dart] | None:
    """Parse consecutive dart calls, including the natural no-comma voice form.

    For example: ``triple twenty triple twenty double eleven``.
    """
    tokens = re.findall(r"[a-z]+|\d+", text)
    darts: list[Dart] = []
    index = 0
    while index < len(tokens):
        token = tokens[index]
        if token in {"and", "then"}:
            index += 1
            continue
        if token == "miss":
            darts.append(Dart(label="Miss", value=0))
            index += 1
            continue
        if token == "outer" and index + 1 < len(tokens) and tokens[index + 1] == "bull":
            darts.append(Dart(label="Outer bull", value=25))
            index += 2
            continue
        if token in {"bull", "inner"}:
            if token == "inner" and (index + 1 >= len(tokens) or tokens[index + 1] != "bull"):
                return None
            darts.append(Dart(label="Bull", value=50, is_double=True))
            index += 2 if token == "inner" else 1
            continue

        multiplier = 1
        prefix = "Single"
        if token in {"single", "double", "triple"}:
            multiplier = {"single": 1, "double": 2, "triple": 3}[token]
            prefix = token.title()
            index += 1
        number, next_index = _number_at(tokens, index)
        if number is None or not 1 <= number <= 20:
            return None
        darts.append(Dart(label=f"{prefix} {number}", value=multiplier * number, is_double=multiplier == 2))
        index = next_index

    return darts if 1 <= len(darts) <= 3 else None


def parse_transcript(transcript: str) -> ParseResponse:
    text = normalise(transcript)
    if not text:
        return ParseResponse(status="unrecognized", message="I did not hear a score.")

    dart_markers = {"single", "double", "triple", "bull", "miss"}
    has_dart_marker = any(word in dart_markers for word in text.split())
    has_comma = "," in text
    darts = _parse_dart_sequence(text)
    # Two or three board-sized numbers are darts even when no multiplier was spoken.
    # A single number phrase (for example, "one hundred and forty") remains a visit total.
    is_bare_dart_sequence = darts is not None and len(darts) > 1
    if has_dart_marker or has_comma or is_bare_dart_sequence:
        if darts:
            return ParseResponse(
                status="parsed",
                candidates=[ScoreEntry(kind="darts", darts=darts)],
                message=f"Parsed {sum(dart.value for dart in darts)} from dart calls.",
            )
        return ParseResponse(
            status="unrecognized",
            message="Try a total such as 'one hundred and forty', or dart calls separated by commas.",
        )

    value = number_from_words(text)
    if value is not None and 0 <= value <= 180:
        return ParseResponse(
            status="parsed",
            candidates=[ScoreEntry(kind="total", total=value)],
            message=f"Parsed {value}.",
        )
    return ParseResponse(
        status="unrecognized",
        message="That is not a darts score between zero and one hundred and eighty.",
    )
