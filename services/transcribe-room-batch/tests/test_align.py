"""P1592 quiet swap: pure text alignment of live messages to the cleaned transcript."""

from align import MAX_CHARS, align_messages


def msgs(*texts):
    return [{"id": f"m{i}", "place": "p", "live_text": t} for i, t in enumerate(texts)]


def test_clean_one_to_one_preserves_case_and_punctuation():
    out = align_messages(msgs("hello there how are you", "i am fine thanks"), "Hello there, how are you? I am fine, thanks.")
    assert out == ["Hello there, how are you?", "I am fine, thanks."]


def test_boundary_words_shifted_and_missed_words_go_to_earlier_message():
    live = msgs("we should meet tomorrow at the office", "bring the laptop and the charger please")
    cleaned = "We should meet tomorrow at the office around nine. Bring the laptop and the charger, please."
    out = align_messages(live, cleaned)
    assert out[0] == "We should meet tomorrow at the office around nine."
    assert out[1] == "Bring the laptop and the charger, please."


def test_repeated_phrase_rejects_only_the_affected_messages():
    live = msgs("okay sure", "the budget needs another review before friday", "okay sure", "let us close the topic here")
    cleaned = "Okay, sure. The budget needs another review before Friday. Okay, sure. Let us close the topic here."
    out = align_messages(live, cleaned)
    assert out[0] is None and out[2] is None
    assert out[1] is not None and "budget" in out[1]
    assert out[3] is not None and out[3].endswith("topic here.")
    # the rejected message never receives words
    assert "Okay" not in (out[1] or "")


def test_crosstalk_does_not_break_neighbours():
    live = msgs("i think we start with the pricing page", "then we test it with five users")
    cleaned = "I think we start with the pricing page. yeah right exactly mm-hmm. Then we test it with five users."
    out = align_messages(live, cleaned)
    assert out[1] == "Then we test it with five users."
    assert out[0].startswith("I think we start with the pricing page.")


def test_invented_text_on_silence_keeps_live_text():
    invented = " ".join(["thank you for watching this video"] * 14)
    live = msgs("good morning everyone", invented, "see you all next week")
    cleaned = "Good morning everyone. See you all next week."
    out = align_messages(live, cleaned)
    assert out[1] is None
    assert out[0] == "Good morning everyone."
    assert out[2] == "See you all next week."


def test_invented_only_even_when_cleaned_shares_common_words():
    live = msgs("thank you for watching", "the plan is to ship on monday")
    cleaned = "The plan is to ship on Monday. Thank you."
    out = align_messages(live, cleaned)
    assert out[0] is None
    assert out[1] is not None and out[1].startswith("The plan is to ship on Monday")


def test_missing_live_slice_goes_to_the_earlier_message():
    live = msgs("the first point is cost", "the third point is risk")
    cleaned = "The first point is cost. The second point is quality and speed. The third point is risk."
    out = align_messages(live, cleaned)
    assert out[0] == "The first point is cost. The second point is quality and speed."
    assert out[1] == "The third point is risk."


def test_rejected_middle_message_receives_nothing_and_neighbours_do_not_absorb_its_gap():
    live = msgs("we begin with the intro today", "zzz qqq xxx yyy", "and we end with the summary now")
    cleaned = "We begin with the intro today. Something totally different was said here at length. And we end with the summary now."
    out = align_messages(live, cleaned)
    assert out[1] is None
    assert out[0] == "We begin with the intro today."
    assert out[2] == "And we end with the summary now."


def test_result_over_4000_chars_is_none():
    long_gap = " ".join(["filler"] * 900)
    live = msgs("alpha beta gamma delta epsilon", "zeta eta theta iota kappa")
    cleaned = f"Alpha beta gamma delta epsilon {long_gap} zeta eta theta iota kappa"
    out = align_messages(live, cleaned)
    assert out[0] is None  # message 0 + the huge gap exceeds the cap
    assert out[1] == "zeta eta theta iota kappa"
    assert all(o is None or len(o) <= MAX_CHARS for o in out)


def test_empty_cleaned_text_is_all_none():
    assert align_messages(msgs("a b c", "d e f"), "") == [None, None]
    assert align_messages(msgs("a b c"), "   ") == [None]
    assert align_messages([], "text") == []


def test_unicode_and_punctuation_differences_still_match():
    live = msgs("das ist schon gut", "naive cafe plan for tomorrow")
    cleaned = "Das ist schön gut... “Naïve café plan” for tomorrow!"
    out = align_messages(live, cleaned)
    # "schön-gut" vs "schon gut": diacritics are folded: all 4 live words match
    assert out[0] is not None and out[0].startswith("Das ist")
    assert out[1] is None or "tomorrow" in out[1]


def test_never_empty_or_whitespace():
    out = align_messages(msgs("one two three four"), "one two three four")
    assert all(o is None or o.strip() for o in out)


def test_unmatched_leading_words_go_to_first_message():
    out = align_messages(msgs("we ship on monday for sure"), "Um, so, we ship on Monday for sure")
    assert out == ["Um, so, we ship on Monday for sure"]
