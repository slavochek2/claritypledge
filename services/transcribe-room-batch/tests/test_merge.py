"""P1307 Decision 5: one room timeline, cross-member duplicates kept and labelled."""

import merge

A = "aaaaaaaa-0000-4000-8000-000000000000"
B = "bbbbbbbb-0000-4000-8000-000000000000"


def entry(member, start_ms, text):
    return {"member_id": member, "start_ms": start_ms, "end_ms": start_ms + 1000, "text": text}


def test_sentences_are_spread_across_the_segment_in_order():
    out = merge.sentences_with_times(A, "Hello there. How are you today?", start_ms=10_000, duration_ms=30_000)
    assert [e["text"] for e in out] == ["Hello there.", "How are you today?"]
    assert out[0]["start_ms"] == 10_000
    assert out[0]["end_ms"] <= out[1]["start_ms"]
    assert out[1]["end_ms"] <= 40_000
    assert all(e["member_id"] == A for e in out)


def test_an_empty_segment_produces_no_entries():
    assert merge.sentences_with_times(A, "   ", 0, 300_000) == []


def test_members_are_interleaved_in_time_order():
    segments, notes = merge.merge_entries(
        [entry(B, 5_000, "Second thing."), entry(A, 1_000, "First thing."), entry(A, 9_000, "Third thing.")],
        window_ms=15_000, min_similarity=0.6,
    )
    assert [s["text"] for s in segments] == ["First thing.", "Second thing.", "Third thing."]
    assert notes == []


def test_the_same_sentence_heard_by_two_phones_is_kept_twice_and_the_later_copy_is_labelled():
    sentence = "Form a view on the four statements before we vote."
    segments, notes = merge.merge_entries(
        [entry(A, 10_000, sentence), entry(B, 12_000, sentence.lower())],
        window_ms=15_000, min_similarity=0.6,
    )
    assert len(segments) == 2, "never delete a copy — mis-attribution by deletion is unrecoverable"
    assert "also_heard_by" not in segments[0]
    assert segments[1]["member_id"] == B
    assert segments[1]["also_heard_by"] == [A]
    assert notes == [{"segment_index": 1, "duplicate_of_index": 0, "member_id": B, "also_heard_by": A}]


def test_similar_text_outside_the_window_is_not_labelled():
    sentence = "Form a view on the four statements before we vote."
    segments, notes = merge.merge_entries(
        [entry(A, 0, sentence), entry(B, 40_000, sentence)], window_ms=15_000, min_similarity=0.6,
    )
    assert notes == []
    assert all("also_heard_by" not in s for s in segments)


def test_one_member_repeating_themselves_is_not_a_cross_member_duplicate():
    segments, notes = merge.merge_entries(
        [entry(A, 0, "Can everyone hear me now please?"), entry(A, 3_000, "Can everyone hear me now please?")],
        window_ms=15_000, min_similarity=0.6,
    )
    assert notes == []


def test_short_agreements_from_two_people_are_not_collapsed_into_one_overheard_voice():
    _, notes = merge.merge_entries([entry(A, 0, "Yes."), entry(B, 2_000, "Okay.")], window_ms=15_000, min_similarity=0.6)
    assert notes == []


def test_remerging_a_member_replaces_their_entries_and_is_idempotent():
    first, _ = merge.merge_entries([entry(A, 0, "Alpha one two three."), entry(B, 1_000, "Beta four five six.")], 15_000, 0.6)
    again, notes = merge.remerge_member(first, B, [entry(B, 2_000, "Beta four five six.")], 15_000, 0.6)
    twice, _ = merge.remerge_member(again, B, [entry(B, 2_000, "Beta four five six.")], 15_000, 0.6)
    assert [s["member_id"] for s in again] == [A, B]
    assert again == twice
    assert notes == []


def test_merge_is_deterministic_regardless_of_input_order():
    items = [entry(B, 5_000, "x y z w."), entry(A, 5_000, "x y z w."), entry(A, 1_000, "start here now.")]
    forward, fnotes = merge.merge_entries(items, 15_000, 0.6)
    backward, bnotes = merge.merge_entries(list(reversed(items)), 15_000, 0.6)
    assert forward == backward
    assert fnotes == bnotes
