"""P1596: stale round jobs reset through ONE rpc, not a select plus N updates."""

import importlib.util
import pathlib

spec = importlib.util.spec_from_file_location("storage_real", pathlib.Path(__file__).parent.parent / "storage.py")
storage_real = importlib.util.module_from_spec(spec)
spec.loader.exec_module(storage_real)


class Fake:
    def __init__(self):
        self.calls = []

    def rpc(self, name, args):
        self.calls.append((name, args))
        return self

    def table(self, *a):
        raise AssertionError("no table access: one rpc only")

    def execute(self):
        class R:
            data = 3
        return R()


def test_reset_is_a_single_rpc_with_the_worker_limits(monkeypatch):
    fake = Fake()
    monkeypatch.setattr(storage_real, "_db", lambda: fake)
    assert storage_real.reset_stale_round_jobs() == 3
    assert fake.calls == [("reset_stale_round_jobs", {
        "p_stale_minutes": storage_real.STALE_PROCESSING_MINUTES, "p_max_attempts": storage_real.MAX_ATTEMPTS})]
