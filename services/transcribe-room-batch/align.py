"""
P1592 D9/D10: the quiet swap's text alignment. Pure: no I/O, no network, no database.

One speaker's live transcription messages in a room (in spoken order) are aligned to that
speaker's cleaned end-of-room text by WORDS, never by time (sentence times are not measurements).
Each message gets the cleaned text that aligns with its own live words, or None = keep live text.

Rules (spec "The quiet swap"):
  * Monotonic: difflib matching blocks keep order in both sequences.
  * End anchors separated from the rest by more than STRAY_GAP cleaned words are trimmed first.
  * A message is accepted only if (a) matched live words / live words >= min_ratio, (b) its
    matched cleaned positions are compact (span <= 2 * live_words + 10: a stray match far away,
    or a lot of foreign words inside the span, rejects it), and (c) it is not ambiguous.
  * Ambiguity test ("could match more than one place"): slide a window of len(live words) over
    the cleaned words and score each window by bag-of-words overlap with the message's live words
    (shared words / live words). `own` = best score among windows starting within L words of the
    message's matched start; `other` = best score among windows starting L or more words away.
    Ambiguous (None) when other >= min_ratio and other >= own. A repeated phrase scores the
    same elsewhere, so every message sharing it is rejected; its unrepeated neighbours are not.
  * Unmatched cleaned words go to the EARLIER neighbour, only when that neighbour is the very
    next message AND both have the same `place` (thread root or conversation). Gap words between
    messages in DIFFERENT places are dropped, never attached to either side (they stay in the
    operator's cleaned transcript). Same-place gaps run up to the next message's first matched
    word; if that next message is rejected, the extension is capped (max(8, L) words) so a stray
    match cannot drag far text in. Leading words go to the first message only if it is message 0;
    trailing words go to the last message only if it is the last one (in both cases the first/last
    message is the only neighbour, so the place is trivially the same). A rejected message never
    receives words. Dropped words are fine.
  * Never returns empty/whitespace text or text over MAX_CHARS (D10): returns None instead.
  * A message made only of invented text matches (almost) nothing -> ratio below min_ratio -> None.
Whitespace in the output is normalised to single spaces (tokens are split on whitespace).
"""

from __future__ import annotations

import re
import unicodedata
from collections import Counter
from difflib import SequenceMatcher
from typing import Optional

MAX_CHARS = 4000
DEFAULT_MIN_RATIO = 0.6
STRAY_GAP = 3  # an end anchor more than this many cleaned words from its neighbour is trimmed

_NON_WORD = re.compile(r"[\W_]+", re.UNICODE)


def _norm(token: str) -> str:
    decomposed = unicodedata.normalize("NFKD", token).casefold()
    return _NON_WORD.sub("", "".join(c for c in decomposed if not unicodedata.combining(c)))


def _window_scores(words: list[str], live: Counter, length: int) -> list[float]:
    """Bag-overlap score of every window of `length` words (index = window start)."""
    n = len(words)
    if length == 0 or n < length:
        return []
    window: Counter = Counter()
    overlap = 0
    scores: list[float] = []
    for i, w in enumerate(words):
        if live[w] > window[w]:
            overlap += 1
        window[w] += 1
        if i >= length:
            old = words[i - length]
            window[old] -= 1
            if live[old] > window[old]:
                overlap -= 1
        if i >= length - 1:
            scores.append(overlap / length)
    return scores


def _ambiguous(words: list[str], live_words: list[str], start: int, min_ratio: float) -> bool:
    length = len(live_words)
    scores = _window_scores(words, Counter(live_words), length)
    own = max((s for i, s in enumerate(scores) if abs(i - start) < length), default=0.0)
    other = max((s for i, s in enumerate(scores) if abs(i - start) >= length), default=0.0)
    return other >= min_ratio and other >= own


def align_messages(messages: list[dict], cleaned_text: str, *, min_ratio: float = DEFAULT_MIN_RATIO) -> list[Optional[str]]:
    n_msg = len(messages)
    result: list[Optional[str]] = [None] * n_msg
    tokens = (cleaned_text or "").split()
    tok_of: list[int] = []  # word index -> token index
    words: list[str] = []
    for ti, tok in enumerate(tokens):
        w = _norm(tok)
        if w:
            words.append(w)
            tok_of.append(ti)
    if not words or n_msg == 0:
        return result

    live_words: list[list[str]] = []
    flat: list[str] = []
    owner: list[int] = []
    for mi, m in enumerate(messages):
        lw = [w for w in (_norm(t) for t in (m.get("live_text") or "").split()) if w]
        live_words.append(lw)
        flat.extend(lw)
        owner.extend([mi] * len(lw))

    anchors: list[list[int]] = [[] for _ in range(n_msg)]  # cleaned word indexes
    sm = SequenceMatcher(None, flat, words, autojunk=False)
    for a, b, size in sm.get_matching_blocks():
        for k in range(size):
            anchors[owner[a + k]].append(b + k)

    for a in anchors:  # a lone match far from the rest (a stray "the") is not part of the message
        while len(a) > 1 and a[1] - a[0] > STRAY_GAP:
            a.pop(0)
        while len(a) > 1 and a[-1] - a[-2] > STRAY_GAP:
            a.pop()

    # A trimmed-away stray anchor can leave the message's own first word just before its span
    # ("the" in "the third ..."). Win back up to 2 such words, never past an earlier anchor.
    prev_last = -1
    for i, a in enumerate(anchors):
        if not a:
            continue
        live_set = set(live_words[i])
        for _ in range(2):
            if a[0] - 1 > prev_last and words[a[0] - 1] in live_set:
                a.insert(0, a[0] - 1)
            else:
                break
        prev_last = a[-1]

    accepted = [False] * n_msg
    for i in range(n_msg):
        length = len(live_words[i])
        if length == 0 or not anchors[i]:
            continue
        if len(anchors[i]) / length < min_ratio:
            continue
        if anchors[i][-1] - anchors[i][0] + 1 > 2 * length + 10:
            continue
        if _ambiguous(words, live_words[i], anchors[i][0], min_ratio):
            continue
        accepted[i] = True

    n_words = len(words)
    for i in range(n_msg):
        if not accepted[i]:
            continue
        start = 0 if i == 0 else anchors[i][0]
        end = anchors[i][-1] + 1
        if i == n_msg - 1:
            end = n_words
        elif anchors[i + 1] and messages[i + 1].get("place") == messages[i].get("place"):
            nxt = anchors[i + 1][0]
            if accepted[i + 1]:
                end = max(end, nxt)
            else:
                end = max(end, min(nxt, end + max(8, len(live_words[i]))))
        t0 = 0 if start == 0 else tok_of[start]
        t1 = len(tokens) if end >= n_words else tok_of[end]
        text = " ".join(tokens[t0:t1]).strip()
        if text and len(text) <= MAX_CHARS:
            result[i] = text
    return result
