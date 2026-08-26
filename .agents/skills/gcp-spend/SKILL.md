---
name: gcp-spend
description: GCP cost snapshot — what's running, estimated weekly spend, optimization flags. Runs in ~30s via gcloud CLI.
when_to_use: Weekly review, or anytime you want a quick cost sanity check.
version: 1.0.0
---

# GCP Spend Snapshot

Quick cost audit using gcloud resource inventory + pricing calculation. No BigQuery export needed.

---

## Setup (one-time)

Requires:
- `gcloud auth` logged in as `$GCP_ACCOUNT`
- Project: `gen-lang-client-0869694595`

---

## Workflow

### 1. Gather Resources (run all in parallel)

```bash
GCP_ACCOUNT="$GCP_ACCOUNT"
GCP_PROJECT="gen-lang-client-0869694595"

# VMs
gcloud compute instances list --project=$GCP_PROJECT --account=$GCP_ACCOUNT \
  --format="table(name,machineType.basename(),zone.basename(),status,scheduling.preemptible)"

# Disks
gcloud compute disks list --project=$GCP_PROJECT --account=$GCP_ACCOUNT \
  --format="table(name,sizeGb,type.basename(),zone.basename(),status)"

# Storage buckets with sizes
for bucket in $(gcloud storage buckets list --project=$GCP_PROJECT --account=$GCP_ACCOUNT --format="value(name)" 2>/dev/null); do
  SIZE=$(gcloud storage du gs://$bucket --summarize --account=$GCP_ACCOUNT 2>/dev/null | tail -1 | awk '{print $1}')
  echo "$bucket: ${SIZE:-0} bytes"
done

# Cloud Functions
gcloud functions list --project=$GCP_PROJECT --account=$GCP_ACCOUNT 2>/dev/null

# Cloud Run services (ALL regions) — GPU/always-on are the biggest hidden cost risk.
# Per-field queries: multi-field --format mis-maps when annotations are empty (verified May 2026).
for REGION in us-east4 us-central1 us-east5 europe-west1; do
  gcloud run services list --project=$GCP_PROJECT --account=$GCP_ACCOUNT --region=$REGION \
    --format="value(metadata.name)" 2>/dev/null | while read SVC; do
    [ -z "$SVC" ] && continue
    GPU=$(gcloud run services describe "$SVC" --project=$GCP_PROJECT --account=$GCP_ACCOUNT --region=$REGION --format="value(spec.template.spec.containers[0].resources.limits['nvidia.com/gpu'])" 2>/dev/null)
    MIN=$(gcloud run services describe "$SVC" --project=$GCP_PROJECT --account=$GCP_ACCOUNT --region=$REGION --format="value(spec.template.metadata.annotations['autoscaling.knative.dev/minScale'])" 2>/dev/null)
    THR=$(gcloud run services describe "$SVC" --project=$GCP_PROJECT --account=$GCP_ACCOUNT --region=$REGION --format="value(spec.template.metadata.annotations['run.googleapis.com/cpu-throttling'])" 2>/dev/null)
    echo "  RUN[$REGION]: $SVC gpu=${GPU:-0} minScale=${MIN:-0} cpu-throttle=${THR:-true}"
  done
done

# Cloud Scheduler jobs (a 5-min poll on a GPU/no-throttle Run service = 24/7 GPU bill)
for REGION in us-east4 us-central1; do
  gcloud scheduler jobs list --project=$GCP_PROJECT --account=$GCP_ACCOUNT --location=$REGION \
    --format="table(name.basename(), state, schedule)" 2>/dev/null
done

# Check GCP Recommender for machine rightsizing
ACCESS_TOKEN=$(gcloud auth print-access-token --account=$GCP_ACCOUNT 2>/dev/null)
curl -s \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -H "x-goog-user-project: $GCP_PROJECT" \
  "https://recommender.googleapis.com/v1/projects/$GCP_PROJECT/locations/us-central1-a/recommenders/google.compute.instance.MachineTypeRecommender/recommendations" \
  2>/dev/null | python3 -c "
import sys, json
data = json.load(sys.stdin)
recs = data.get('recommendations', [])
if recs:
    for r in recs:
        print(f'  RIGHTSIZING: {r[\"name\"]} — {r[\"description\"]}')
else:
    print('  No rightsizing recommendations available')
" 2>/dev/null || echo "  Recommender API unavailable"
```

### 2. Calculate Costs

Using resource data from step 1, calculate weekly estimates with this pricing table (us-central1, on-demand):

**Compute (per hour):**
| Machine Type | $/hr |
|---|---|
| e2-micro | $0.0084 |
| e2-small | $0.0168 |
| e2-medium | $0.0335 |
| e2-standard-2 | $0.0670 |
| e2-standard-4 | $0.1340 |
| e2-standard-8 | $0.2681 |
| n1-standard-1 | $0.0475 |

**Disk (per GB/month):**
| Type | $/GB/mo |
|---|---|
| pd-standard | $0.040 |
| pd-balanced | $0.100 |
| pd-ssd | $0.170 |

**Storage (per GB/month):**
| Class | $/GB/mo |
|---|---|
| Standard | $0.020 |
| Nearline | $0.010 |
| Coldline | $0.004 |
| Archive | $0.0012 |

Formula: `weekly_cost = hourly_rate × 168` (VMs), `monthly_cost / 4.33` (disks/storage)

**Known resources (update if new VMs are added):**
- `clarity-agent`: e2-standard-4, 100GB pd-balanced — cloud coding agent + LinkedIn Helper
- `ghost-prod`: e2-small, 20GB pd-standard — Ghost blog server
- `gcs-signed-url`: Cloud Function 2nd gen — minimal cost
- `claritypledge-backups/mac`: 211 GB Restic backup — **Coldline** ($0.004/GB/mo), 90-day lifecycle, ~$0.85/month
- `claritypledge-backups/ghost`: ~0 GB — Ghost content backup, Coldline
- `claritypledge-db-backups`: ~0 GB — Supabase DB backup, 7-day retention

### 3. Output

Present in this format:

```
=== GCP SPEND — Last 7 Days ===
Project: gen-lang-client-0869694595 ($GCP_ACCOUNT)
Budget: €200/month GROSS (excl. credits) | Credits: $25,000 (updated as you track drawdown)

COMPUTE:
  clarity-agent (e2-standard-4): $22.51/week
  ghost-prod (e2-small): $2.92/week
  Disks (100GB pd-balanced + 20GB pd-standard): $2.49/week

STORAGE:
  [bucket name]: X GB = $X.XX/week
  [note if >1GB]

SERVERLESS:
  gcs-signed-url: ~$0.00/week

SUMMARY:
  This week: ~$XX.XX
  Per month: ~$XXX.XX (XX% of €400 budget)
  Credits runway: $25,000 ÷ $XXX/mo = ~XXX months (XX years)

OPTIMIZATION FLAGS:
  [list with ⚡ for actionable, ✅ for confirmed-necessary, ⚠️ for watch]
```

### 4. Optimization Analysis

Always check these patterns:

1. **Large GCS buckets at Standard storage class** — if not accessed frequently, suggest Nearline/Coldline
   - `claritypledge-backups/mac/`: 211 GB Mac backup — Nearline saves ~$2.1/month if accessed <1/month

2. **VMs running 24/7 that could be scheduled** — `ghost-prod` could potentially be stopped overnight if traffic is low

3. **Idle Cloud Functions** — confirm `gcs-signed-url` is actually used; if not, delete it

4. **Recommender API output** — surface any GCP-detected rightsizing opportunities

5. **Credits burn rate** — if monthly burn accelerates (e.g., new services), flag it. Baseline: ~$125/month

6. **`claritypledge-ml-training` bucket** — flag if size grows beyond expected (currently ~0.5 GB)

7. **GPU Cloud Run services** — a `RUN[...]:` line with a GPU count (e.g. `transcribe-session ... 1`) is the highest cost risk on the account. An L4 bills ~€0.80/hr **while allocated**, not while working. Cross-check: if `cpu-throttling=false` AND an enabled scheduler pings it, the GPU is held warm 24/7 (~€500–600/mo gross). This is the May-2026 €1,600 leak pattern — see `docs/decisions.md`.

8. **Always-on services** — any `RUN[...]:` line with `minScale ≥ 1` never idles to zero. Confirm it's intended.

9. **Gross vs net** — the €200 budget tracks GROSS (`EXCLUDE_ALL_CREDITS`) so credit-masked spend surfaces. Don't let a big gross number hide behind "credits cover it" — when credits expire, gross becomes the bill.

### 5. Flags to Surface

| Condition | Flag |
|---|---|
| Gross monthly estimate > €150 | ⚠️ Approaching 75% of €200 gross budget |
| Cloud Run service with a GPU | ⚠️ GPU bills ~€0.80/hr allocated — confirm intended + scales to zero |
| GPU service + `cpu-throttling=false` + enabled scheduler pinging it | 🚨 Keep-warm leak (the €1,600 pattern) — pause the scheduler |
| Any Cloud Run service with `minScale ≥ 1` | ⚠️ Never idles to zero — paying 24/7 |
| Any VM TERMINATED but disk still exists | ⚠️ Orphaned disk (paying for nothing) |
| Storage bucket growing >10% week-over-week | ⚠️ Check retention policy |
| Recommender has rightsizing suggestions | ⚡ Review and apply |
| Credits < $20,000 | 📌 Note remaining runway |

---

## Output Format

```markdown
### GCP Spend

**This week (est.):** $X.XX | **Monthly (est.):** $X.XX (X% of €400 budget)
**Credits runway:** ~XXX months at current burn

| Resource | Type | Cost/week |
|---|---|---|
| clarity-agent | e2-standard-4 VM + 100GB disk | $XX.XX |
| ghost-prod | e2-small VM + 20GB disk | $XX.XX |
| GCS storage | [X GB across N buckets] | $X.XX |

**Optimization flags:**
- ⚡ [actionable — do this]
- ✅ [spending confirmed justified]
- ⚠️ [watch this]

[Console link for actual spend: https://console.cloud.google.com/billing/010089-354936-77CD27/reports]
```

---

## Notes

- **Actual vs estimate**: GCP billing API requires BigQuery export for historical cost breakdown. These are resource-based estimates that match actual within ~5%. For exact numbers, check the console link.
- **Pricing last updated**: Feb 2026. Re-check annually or if machine types change.
- **Credits**: $25k on `$GCP_ACCOUNT` under billing account `010089-354936-77CD27`. Free tier + credits cover Gemini API at current usage.
