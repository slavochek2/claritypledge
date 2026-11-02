"""P1596: clean-round jobs run one at a time per instance (memory: each decodes several mics' audio).

A single process-wide asyncio.Lock. The HTTP handler returns 202 at once and the job waits its turn in the
background; room jobs never touch this lock.
"""

import asyncio
from typing import Callable

_round_lock: asyncio.Lock | None = None


def round_lock() -> asyncio.Lock:
    global _round_lock
    if _round_lock is None:
        _round_lock = asyncio.Lock()
    return _round_lock


async def run_round_serialized(fn: Callable, *args):
    """Run fn(*args) in a worker thread, but only after every earlier round-clean job on this instance finished."""
    async with round_lock():
        return await asyncio.to_thread(fn, *args)
