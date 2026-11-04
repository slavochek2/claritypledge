"""
P1604 decision 4: who is "incomplete". Pure, no numpy / GCS / DB.

A speaker is incomplete when the last audio that reached the archive ends well before the moment their capture ended
(their own Stop, or the sweep's end after ten silent minutes), capped at the end of the cleaned window. That is exactly the
two losses the spec names: audio uploaded later than the 2-minute window after a Stop, and what a phone had not uploaded
when it was away past the 10-minute wait. All times are server-clock milliseconds.
"""

from __future__ import annotations

# One archive chunk is 30 s (config.CHUNK_SECONDS); the tail of a recording is cut mid-chunk. One chunk plus a margin.
TAIL_GRACE_MS = 60_000


def incomplete_member_ids(
    seated_ids: list[str],
    last_audio_end_ms: dict[str, int],
    capture_end_ms: dict[str, int | None],
    window_end_ms: int,
    joined_ms: dict[str, int] | None = None,
) -> list[str]:
    """The seated members whose audio stops short of where their capture ended. Sorted, so a retry is identical.

    EVERY seated member is judged, not only those with text: a phone whose audio never arrived has no text at all. With no
    audio, a member is incomplete only if they were there longer than the grace (joined_ms says when); without a join time
    nobody is named for having no audio.
    """
    out = []
    for member in sorted(set(seated_ids)):
        stop = capture_end_ms.get(member)
        expected = window_end_ms if stop is None else min(stop, window_end_ms)
        last = last_audio_end_ms.get(member)
        if last is None:
            joined = (joined_ms or {}).get(member)
            if joined is not None and expected - joined > TAIL_GRACE_MS:
                out.append(member)
            continue
        if last < expected - TAIL_GRACE_MS:
            out.append(member)
    return out


def applies_to(segments: list[dict], kind: str) -> bool:
    """Only a room job whose every segment posts everyone it compares. A person who sat at a table for part of the window
    has audio the job deliberately did not read, so their "last audio" says nothing about a lost tail."""
    if kind != "room" or not segments:
        return False
    return all(set(s["compare_ids"]) <= set(s["member_ids"]) for s in segments)
