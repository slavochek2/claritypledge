#!/usr/bin/env python3
"""p1608-rule-off-control.py: P1608's control for the "zero strays" result.

If the clean pass is run WITHOUT its loudest-mic rule, a phrase must show up under more than one person (the quiet copy
of each speaker bleeds into the others' microphones). If it does not, the zero-strays result of the real run proves
nothing, because the test could not have told the rule on from the rule off.

This runs the REAL worker code (services/transcribe-room-batch: round_clean.clean_round, or pipeline.process_round_job
for a whole job) with ONE change: round_clean.loudest_masks returns an all-ones mask. Nothing is written anywhere.

  python3 scripts/p1608-rule-off-control.py --selftest [--clips-dir DIR]
      Free. Runs the real clean_round on the corpus clips with a fake transcriber that reports how many seconds each
      person's track still carries, rule on versus rule off. Proves the patch point works and the bleed is there.
  python3 scripts/p1608-rule-off-control.py --job <clean job id>
      PAID (one more Gemini clean of that job, about $0.054 for the 12 mic-minutes). Reads the job's recorded chunks
      from the bucket and prints {member_id: text} as JSON on stdout. Needs SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY,
      GCS_BUCKET and GEMINI_BATCH_API_KEY in the environment (never read from files here) and Google application
      credentials. The test maps member ids to people and runs the matcher's rule-off verdict on it.

Needs the worker's Python dependencies (numpy etc.). Run it with an interpreter that has them.
"""
from __future__ import annotations

import argparse
import json
import os
import sys
import wave
from pathlib import Path

REPO = Path(__file__).resolve().parent.parent
WORKER = REPO / "services" / "transcribe-room-batch"
sys.path.insert(0, str(WORKER))


def _all_ones(tracks):  # the rule OFF: every mic stays open the whole time
    import numpy as np
    return {k: np.ones(len(v), np.float32) for k, v in tracks.items()}


def selftest(clips_dir: Path) -> int:
    import numpy as np
    import round_clean

    members, names = {}, []
    corpus = json.loads((REPO / "e2e" / "p1608" / "corpus.json").read_text())
    for who, spec in sorted(corpus["speakers"].items()):
        with wave.open(str(clips_dir / spec["clip"]["file"])) as w:
            pcm = w.readframes(w.getnframes())
        step = 30 * 16000 * 2
        # one piece per 30 s chunk, each placed by its end time, as the worker places uploaded chunks
        members[who] = [((i + step if i + step < len(pcm) else len(pcm)) // 2 * 1000 // 16000, pcm[i:i + step]) for i in range(0, len(pcm), step)]
        names.append(who)

    def active_seconds(wav: bytes) -> str:
        with wave.open(__import__("io").BytesIO(wav)) as w:
            x = np.frombuffer(w.readframes(w.getnframes()), dtype="<i2").astype(np.float32)
        n = len(x) // 16000
        return str(int(np.sum(np.sqrt(np.mean(x[: n * 16000].reshape(n, 16000) ** 2, axis=1)) > 3.0)))

    window_end = 240_000
    on = round_clean.clean_round(members, 0, window_end, active_seconds)
    original = round_clean.loudest_masks
    round_clean.loudest_masks = _all_ones
    try:
        off = round_clean.clean_round(members, 0, window_end, active_seconds)
    finally:
        round_clean.loudest_masks = original
    total = lambda r: {m: sum(int(c.text) for c in cs) for m, cs in r.texts.items()}  # noqa: E731
    t_on, t_off = total(on), total(off)
    print(json.dumps({"rule_on_active_seconds": t_on, "rule_off_active_seconds": t_off}))
    ok = all(t_off[m] > t_on[m] for m in names)
    print("selftest:", "PASS: with the rule off every person's track carries more audio (the others' bleed)" if ok
          else "FAIL: the rule off did not add audio on every track, the control cannot show a stray")
    return 0 if ok else 1


def live(job_id: str) -> int:
    for k in ("SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY", "GCS_BUCKET", "GEMINI_BATCH_API_KEY"):
        if not os.environ.get(k):
            print(f"missing environment variable {k}", file=sys.stderr)
            return 2
    if os.environ.get("P1608_GCS_TOKEN"):  # no application-default login needed: use a short-lived gcloud access token
        import google.auth
        from google.oauth2.credentials import Credentials
        token = Credentials(os.environ["P1608_GCS_TOKEN"])
        google.auth.default = lambda *a, **k: (token, os.environ.get("P1608_GCP_PROJECT"))
    import gemini_client
    import pipeline
    import round_clean
    import storage

    job = storage._db().table("transcribe_round_clean_jobs").select("*").eq("id", job_id).single().execute().data
    captured: list[dict] = []
    storage.post_clean_round = lambda jid, attempts, items, partial=False: captured.extend(items) or len(items)  # nothing is posted
    pipeline._finish_round = lambda *a, **k: None                                                           # nothing is written
    for name in ("finish_round_job", "defer_round_job", "claim_round_job", "reset_stale_round_jobs"):
        setattr(storage, name, lambda *a, **k: None)  # every write the job path can reach, including failure paths
    round_clean.loudest_masks = _all_ones
    # `now` far in the future: the job is long past its readiness deadline, never deferred
    pipeline.process_round_job(job, transcribe=gemini_client.transcribe_verbatim_argon, now_ms=10 ** 15)
    out: dict[str, str] = {}
    for item in sorted(captured, key=lambda i: i["chunk_ms"]):
        out[item["member_id"]] = (out.get(item["member_id"], "") + " " + item["text"]).strip()
    print(json.dumps(out))
    return 0


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--selftest", action="store_true")
    ap.add_argument("--clips-dir", default=os.path.expanduser(os.path.join(os.environ.get("P1608_CACHE", "~/.cache/cp-p1608-ami"), "clips")))
    ap.add_argument("--job")
    a = ap.parse_args()
    if a.selftest:
        return selftest(Path(a.clips_dir))
    if a.job:
        return live(a.job)
    ap.error("give --selftest or --job")
    return 2


if __name__ == "__main__":
    sys.exit(main())
