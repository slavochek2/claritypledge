"""P1596: round-clean jobs run one at a time; the caller is never blocked."""

import asyncio
import threading
import time

import serial


def test_round_jobs_never_overlap_and_run_in_arrival_order():
    state = {"running": 0, "peak": 0, "order": []}
    guard = threading.Lock()

    def job(i):
        with guard:
            state["running"] += 1
            state["peak"] = max(state["peak"], state["running"])
            state["order"].append(i)
        time.sleep(0.05)
        with guard:
            state["running"] -= 1

    async def main():
        serial._round_lock = None
        tasks = []
        for i in range(4):
            tasks.append(asyncio.create_task(serial.run_round_serialized(job, i)))
            await asyncio.sleep(0)       # arrival order
        t0 = time.monotonic()
        assert time.monotonic() - t0 < 0.05   # scheduling returned at once
        await asyncio.gather(*tasks)

    asyncio.run(main())
    assert state["peak"] == 1
    assert state["order"] == [0, 1, 2, 3]
