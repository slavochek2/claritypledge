#!/usr/bin/env python3
"""Flag a GPU Cloud Run service only when it was actually billed for long — not because a GPU is attached.

Usage: gpu-warm-check.py <project> <service> [threshold_hours=3]

Prints exactly one line and exits 0:
  GPU_SERVICE_OK:   <svc> billed X.XXh in last 24h (threshold Th)
  GPU_WARM:         <svc> billed X.XXh in last 24h (threshold Th) — held warm?
  GPU_CHECK_FAILED: <svc> <reason> — do not report clean
Exits non-zero only on usage error. A failed query never reads as clean.

Why (cp decisions 2026-10-04): the old rule printed GPU_SERVICE for every service with a GPU,
which /day rendered as COST LEAK daily. A GPU service MUST run with cpu-throttling=false
(Cloud Run requires instance-based billing for GPUs), so that flag carries no signal. Billed
instance time does: 24h/day during the May keep-warm leak, ~1h/day from the 2-hourly
tx-job-janitor wake. It also catches keep-warm causes that are not a scheduler.
"""
import json, subprocess, sys, urllib.parse, urllib.request
from datetime import datetime, timedelta, timezone

if len(sys.argv) < 3:
    print(__doc__, file=sys.stderr); sys.exit(2)
project, svc = sys.argv[1], sys.argv[2]
threshold = float(sys.argv[3]) if len(sys.argv) > 3 else 3.0

def fail(reason):
    print(f"GPU_CHECK_FAILED: {svc} {reason} — do not report clean"); sys.exit(0)

try:
    tok = subprocess.run(["gcloud", "auth", "print-access-token"], capture_output=True, text=True, timeout=30)
    if tok.returncode != 0 or not tok.stdout.strip():
        fail("no gcloud access token")
    end = datetime.now(timezone.utc); start = end - timedelta(hours=24)
    q = urllib.parse.urlencode({
        "filter": f'metric.type="run.googleapis.com/container/billable_instance_time" AND resource.labels.service_name="{svc}"',
        "interval.startTime": start.strftime("%Y-%m-%dT%H:%M:%SZ"),
        "interval.endTime": end.strftime("%Y-%m-%dT%H:%M:%SZ"),
        "aggregation.alignmentPeriod": "86400s",
        "aggregation.perSeriesAligner": "ALIGN_SUM",
        "aggregation.crossSeriesReducer": "REDUCE_SUM",
    })
    req = urllib.request.Request(f"https://monitoring.googleapis.com/v3/projects/{project}/timeSeries?{q}",
                                 headers={"Authorization": f"Bearer {tok.stdout.strip()}"})
    data = json.load(urllib.request.urlopen(req, timeout=30))
except SystemExit:
    raise
except Exception as e:  # network, HTTP 4xx/5xx, bad JSON
    fail(f"query error ({type(e).__name__})")

# No series = no billed time in the window (scaled to zero all day) — that is a real 0, not blindness:
# the API returns an error, not an empty list, for a bad project or filter.
secs = sum(p["value"].get("doubleValue", 0) for ts in data.get("timeSeries", []) for p in ts.get("points", []))
hours = secs / 3600
tag = "GPU_WARM:" if hours > threshold else "GPU_SERVICE_OK:"
tail = " — held warm?" if hours > threshold else ""
print(f"{tag} {svc} billed {hours:.2f}h in last 24h (threshold {threshold:g}h){tail}")
