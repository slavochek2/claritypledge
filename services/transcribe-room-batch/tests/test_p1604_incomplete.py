"""P1604 decision 4: a speaker whose audio ended before their own Stop (the phone went away past the 10-minute wait, or the
final chunk arrived after the 2-minute window) is marked incomplete. Pure: no numpy, no GCS."""

import incomplete

END = 10_000_000


def test_audio_that_reaches_the_stop_is_complete():
    assert incomplete.incomplete_member_ids(["a"], {"a": END - 5_000}, {"a": END}, END) == []


def test_audio_that_stops_well_before_the_stop_is_incomplete():
    assert incomplete.incomplete_member_ids(["a"], {"a": END - 5 * 60_000}, {"a": END}, END) == ["a"]


def test_the_grace_is_one_chunk_plus_a_little():
    assert incomplete.TAIL_GRACE_MS >= 60_000
    assert incomplete.incomplete_member_ids(["a"], {"a": END - incomplete.TAIL_GRACE_MS}, {"a": END}, END) == []
    assert incomplete.incomplete_member_ids(["a"], {"a": END - incomplete.TAIL_GRACE_MS - 1}, {"a": END}, END) == ["a"]


def test_a_person_who_stopped_early_is_judged_against_their_own_stop_not_the_room_end():
    own_stop = END - 30 * 60_000
    assert incomplete.incomplete_member_ids(["a"], {"a": own_stop - 1_000}, {"a": own_stop}, END) == []


def test_a_person_still_recording_at_the_end_is_judged_against_the_window_end():
    assert incomplete.incomplete_member_ids(["a"], {"a": END - 10 * 60_000}, {"a": None}, END) == ["a"]
    assert incomplete.incomplete_member_ids(["a"], {"a": END - 1_000}, {}, END) == []


def test_a_stop_after_the_window_end_is_capped_at_the_window_end():
    assert incomplete.incomplete_member_ids(["a"], {"a": END - 1_000}, {"a": END + 3_600_000}, END) == []


def test_only_the_incomplete_ones_are_named_in_a_stable_order():
    got = incomplete.incomplete_member_ids(["c", "a", "b"], {"a": END - 1_000, "b": 1, "c": 2}, {"a": END, "b": END, "c": END}, END)
    assert got == ["b", "c"]


def test_a_seated_member_whose_audio_never_arrived_is_named_when_they_were_there_long_enough():
    # every SEATED member is evaluated, not only those with posted text: a phone that never uploaded has no text at all
    joined = {"a": END - 20 * 60_000}
    assert incomplete.incomplete_member_ids(["a"], {}, {"a": END}, END, joined) == ["a"]


def test_a_member_who_was_there_for_seconds_has_no_audio_and_is_not_incomplete():
    joined = {"a": END - 20_000}
    assert incomplete.incomplete_member_ids(["a"], {}, {"a": END}, END, joined) == []


def test_without_a_join_time_a_member_with_no_audio_is_not_named():
    assert incomplete.incomplete_member_ids(["a"], {}, {"a": END}, END) == []


def test_nobody_seated_is_fine():
    assert incomplete.incomplete_member_ids([], {}, {}, END, {}) == []


def test_it_applies_only_where_everyone_compared_is_also_posted():
    whole = [{"member_ids": ["a", "b"], "compare_ids": ["a", "b"]}]
    seated_out = [{"member_ids": ["a"], "compare_ids": ["a", "b"]}]   # b sat at a table: their words are elsewhere
    assert incomplete.applies_to(whole, kind="room") is True
    assert incomplete.applies_to(seated_out, kind="room") is False
    assert incomplete.applies_to(whole, kind="round") is False
    assert incomplete.applies_to([], kind="room") is False
