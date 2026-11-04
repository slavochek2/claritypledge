"""P1604 Resolved Decision 10: a job's stale-claim limit must exceed the longest run, or a re-send repeats the spend."""

import importlib.util
import pathlib

import re

import config

# round_clean imports numpy, which this test does not need: read its two constants from the source instead, so a drift
# between it and config.py is still caught.
_SRC = (pathlib.Path(__file__).parent.parent / "round_clean.py").read_text()
MAX_PARALLEL_CALLS = int(re.search(r"^MAX_PARALLEL_CALLS = (\d+)", _SRC, re.M).group(1))
MAX_WINDOW_S = eval(re.search(r"^MAX_WINDOW_S = ([0-9 *]+)", _SRC, re.M).group(1))  # noqa: S307 — "3 * 3600" from our own file


def _storage():
    spec = importlib.util.spec_from_file_location("storage_p1604", pathlib.Path(__file__).parent.parent / "storage.py")
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


def test_config_mirrors_the_cleaners_parallelism():
    assert config.CLEAN_PARALLEL_CALLS == MAX_PARALLEL_CALLS


def test_the_longest_run_is_computed_from_the_roll_and_the_parallelism():
    # 176-minute room (the sweep's roll), one 60 s chunk per minute per mic, MAX_PARALLEL_CALLS at once
    minutes = config.longest_round_run_minutes(members=10, seconds_per_call=10)
    calls = 10 * 176
    assert minutes == calls * 10 / MAX_PARALLEL_CALLS / 60


def test_a_3_hour_one_mic_session_is_about_180_calls():
    assert config.calls_for_session(members=1) == 176
    assert 170 <= config.calls_for_session(members=1) <= 180


def test_round_stale_limit_exceeds_the_longest_run_of_a_full_room():
    assert config.ROUND_STALE_PROCESSING_MINUTES > config.longest_round_run_minutes(members=10, seconds_per_call=10)
    # and the older pass' own limit is not what governs clean jobs
    assert config.ROUND_STALE_PROCESSING_MINUTES > config.STALE_PROCESSING_MINUTES


def test_the_roll_keeps_a_room_inside_the_cleaners_window_limit():
    assert config.ROOM_ROLL_MINUTES * 60 + 2 * 60 < MAX_WINDOW_S   # even with a 2-minute sweep


def test_reset_uses_the_round_limit(monkeypatch):
    storage = _storage()
    calls = []

    class Fake:
        def rpc(self, name, args):
            calls.append((name, args))
            return self

        def execute(self):
            class R:
                data = 0
            return R()

    monkeypatch.setattr(storage, "_db", lambda: Fake())
    storage.reset_stale_round_jobs()
    assert calls[0][1]["p_stale_minutes"] == config.ROUND_STALE_PROCESSING_MINUTES
