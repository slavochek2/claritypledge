---
name: day-cp
description: ClarityPledge half of the daily run — prod smoke, git/spec health, Supabase + Sentry + Mixpanel user intelligence, repo baseline, RLS and function-grant drift, reflection, goals and branches. Records a status per check, findings and people for the day report.
when_to_use: Invoked by the global /day dispatcher, which owns the timestamp, the gcloud gate and the health block. Run directly only to re-check cp health mid-day.
version: 2.1.0
---

# Day — ClarityPledge (/slava:maintain:day-cp)

The ClarityPledge half of `/day`. Split out of the monolithic `slava/day.md` on
2026-08-28 (pp p48), which had accreted a personal daily driver — and private paths —
inside a public repo.

## Contract with the dispatcher

**This skill is a sub-day. It does not own the frame.**

| Owned by the dispatcher (`~/.claude/commands/day.md`) | Never done here |
|---|---|
| `~/.claude-day-last-run` — read at start, written at end | Do **not** read or write it |
| `$SINCE` and its floor rule | Do **not** compute your own window |
| The gcloud auth gate | Assume gcloud is authenticated; if a gcloud call fails anyway, report `⚠ ... NOT checked`, never clean |
| The day report and its terminal card (P1399) | Record checks, findings and people; print nothing for the founder |
| Every `~/.claude*` marker | No personal state is read **in this file** (weekly/monthly still read their own — known gap) |

**Inputs from the dispatcher:** `$SINCE` (ISO 8601) and `$DUE_VERDICT` (the Due Board
rows, or empty). If `$SINCE` is not supplied — you were invoked directly, not by `/day` —
fall back to `date -u -v-24H` and **say so in the output**, because every delta below is
then a 24h delta rather than a since-last-run delta.

**Output to the dispatcher:** the reflection and goals blocks (the dispatcher's reflection
writer reads them), then the `REPORT FOR THE DISPATCHER` block at the end of Step 1. Until P1399
this was a list of HEALTH rows the dispatcher printed; the founder now reads this sub-day on the
board, through the checks, findings and people it records, so nothing here is printed for him.

**You run in a subagent (P1328).** The dispatcher spawns this sub-day in its own context so
its instructions and tool output do not fill the founder's conversation. Two consequences:
your final reply IS the output — the blocks above, for the dispatcher — and you cannot wait for
the founder. Where a step below has a question for him, record it as a **finding with options**
(the shape is below), and he answers it on the board; there is no mid-run question and no
`QUESTIONS FOR THE FOUNDER` heading any more (P1399). A service that needs his sign-in (Sentry,
Mixpanel) is not a question: it goes in the REPORT block as a connection, which the board shows
with its own Fix. Subagents do
get MCP tools (Sentry, Mixpanel) and can spawn their own subagents; both verified 2026-09-17.

### The step ledger — `$DAY_STEP` (P1324)

The dispatcher also passes **`DAY_STEP`**: an absolute path to the step runner. Use it exactly
as given and **never write a home-directory path here** — that is the contract table above, and
this file is in a public repo. `scripts/day-cp-steps.tsv` is this sub-day's half of the
manifest; the dispatcher discovers and registers it at its Step 1.

Every wave and step below carries an id and records itself:

```bash
"$DAY_STEP" run <step-id> <<'STEP'
<the wave's commands, exactly as written below>
STEP

"$DAY_STEP" attest <step-id> --evidence "what the MCP call RETURNED, in a sentence"
```

Why, in one number: across the 13 real `/day` passes since 2026-08-28, Wave 1 ran 13 times,
Sentry 10, Mixpanel 7, and the privilege-floor check inside Wave 3 eight. Every wave here except
the first has been silently dropped at least once, and nothing could tell that apart from a
clean morning.

**A wave that RAN AND FAILED is recorded and does not hold the pass open** — report the failure
and move on. Only a wave that never executed is missing, and `day-gates.sh --mode=finish` will
name it.

**Export `SINCE`, `DUE_VERDICT` and `DAY_STEP` at the start of every Bash call that runs a step**
(`export SINCE='…' DUE_VERDICT='…' DAY_STEP='…'`). The runner executes each body in a fresh shell,
which sees only exported variables — a body that reads an unexported `$SINCE` queries an empty
window, and one that calls an unexported `"$DAY_STEP"` fails.

**Each check reports its own status (P1399).** One wave is one step, and one step used to be one
ledger row: `cp.w3 ok 0` read clean while the RLS drift inside it exited 1. So each check writes a
machine line, from its own exit code or token — never from prose — to the file the runner hands
the body as `$DAY_CHECK_FILE`, and the runner records it as a row of its own. Stdout is never
parsed for status, because anything a body runs (a test, a dependency, quoted prose) could print a
line that looks like one. When the token is absent nothing is written, and the board reads that
check "not proven". Each line is also `tee`d to stdout so you can read it; that copy is never parsed:

```bash
echo "CHECK <check-id> <ok|problem|not-run|unproven|skipped> <plain detail, under 80 chars>" | tee -a "${DAY_CHECK_FILE:-/dev/null}"
```

Sentry and Mixpanel, which only an MCP call can see, are recorded by you beside their `attest`:

```bash
"$DAY_STEP" check <check-id> <status> --detail "what came back, in plain words" --step <step-id>
```

`scripts/day-cp-checks.tsv` lists every check this file reports and the step that computes it, and
`scripts/test-p1399-day-registry.sh` fails if a check written here is not in it. Do not put `>`, `<`
or `|` in a detail — these lines are relayed. Run without `$DAY_STEP` (directly, not from `/day`),
`$DAY_CHECK_FILE` is unset: the status lines still print, and nothing records them.

**If `DAY_STEP` was not passed**, you were invoked directly rather than by `/day`. Run the
commands as written, and **say so in the output**: nothing this pass does is recorded, exactly
as an unsupplied `$SINCE` is called out above.

**Findings do not stay in this output.** Anything a check finds — drift, a failing guard, a
stranded spec — is recorded where it is found, and the dispatcher files it at its Step 9b:

```bash
"$DAY_STEP" finding --check <check-id> --severity high --store private \
  --fault-key <check-short>:<fixed-slug> \
  --title "the fault in plain words — no ages, counts or dates" \
  --point-a "<where things stand: the consequence>" --obstacle "<what is in the way>" \
  --point-b "<what fixed looks like>" [--first-seen YYYY-MM-DD] [--evidence verified|unverified] <<'BODY'
<what the check returned, and what would settle it>
BODY
```

**The fault key is the fingerprint (P1399)** — `<check>:<fault key>`, never the title. Titles that
carried "62h+" one morning and "13.6 days" the next filed one fault under six fingerprints, and a
decision the founder made on one could not follow it to the next. A key is a fixed lowercase slug
(`rls:new-policies`, `spec:qa:p1234`) — never prose, a count or a date, and never a tool's own
label for the fault (a label can be a misdiagnosis; the key must outlive it). Where a fault is
one of many of a kind, the suffix is a stable **source id** — a spec number, an issue number, a
service name, an inbox ID — lowercased, with anything outside `[a-z0-9._:-]` turned into `-`, and
the whole key cut to 60 characters. `--check` is a check id
from `scripts/day-cp-checks.tsv` where one fits; a finding about something no check covers (a
stranded spec, a stash) names the step it came from.

**A finding only the founder can resolve is a question.** Give it its own options, the one you
recommend, and how sure you are: `--option <id>="<label>"` (repeat), `--recommend <id>`,
`--confidence 0-100`, `--why "<one line>"`. Never recommend `park` — only the founder parks.
Every other finding gets no options; the board offers "Give to the agent" or "Park".

---

## Steps

### 1. Health Checks (3 sequential waves — NOT all in parallel)

**IMPORTANT:** Execute as 3 sequential waves to prevent permission prompt floods.
Each wave = at most 2 tool calls. Process results between waves.

#### Wave 1: Local + Git + Smoke + Cloud (1 bash call)

Combine ALL local operations into a single bash script:

```bash
"$DAY_STEP" run cp.w1 <<'STEP'
cd "$(git rev-parse --show-toplevel)"

echo "=== PROD SMOKE ==="
SMOKE_OUT="$(node scripts/prod-smoke-test.mjs 2>&1)"; SMOKE_RC=$?
printf '%s\n' "$SMOKE_OUT"
[ "$SMOKE_RC" -ne 0 ] && echo "SMOKE_FAILED"
SMOKE_SUM="$(printf '%s\n' "$SMOKE_OUT" | grep -E '^[0-9]+ passed, [0-9]+ failed' | tail -1)"
SMOKE_PASS="$(printf '%s' "$SMOKE_SUM" | awk '{print $1}')"; SMOKE_FAIL="$(printf '%s' "$SMOKE_SUM" | awk '{print $3}')"
if [ -z "$SMOKE_SUM" ]; then echo "CHECK cp.smoke not-run the smoke test did not finish (exit $SMOKE_RC)" | tee -a "${DAY_CHECK_FILE:-/dev/null}"
elif [ "$SMOKE_RC" -eq 0 ] && [ "$SMOKE_FAIL" = "0" ]; then echo "CHECK cp.smoke ok $SMOKE_PASS of $SMOKE_PASS smoke checks pass" | tee -a "${DAY_CHECK_FILE:-/dev/null}"
else echo "CHECK cp.smoke problem $SMOKE_FAIL of $((SMOKE_PASS + SMOKE_FAIL)) smoke checks fail" | tee -a "${DAY_CHECK_FILE:-/dev/null}"; fi

echo "=== GIT LOG ==="
git log --oneline --since="$SINCE" --author-date-order

echo "=== GIT BRANCHES ==="
git branch --format='%(refname:short) %(upstream:track)' | grep -v "^main"
git log --oneline origin/main..HEAD 2>/dev/null | wc -l | tr -d ' '
# P1399: commits on local main that origin/main does not have, read from any worktree (branches are
# shared). The board shows it as a Plan reading; pushing stays the founder's call.
echo "unpushed_commits=$(git rev-list --count origin/main..main 2>/dev/null || echo unknown)"

echo "=== STRANDED SPECS ==="
# P1169: work strands in four distinguishable ways. The old scan saw only the
# first, and searched a `delivery_stage` value features.md marks deprecated —
# so four specs sitting at `qa` (oldest: 58 days) were invisible to it.
echo "-- still building --"
grep -rl "^status: in-progress" features/p*.md 2>/dev/null || echo "none"
echo "-- built, waiting for you (qa) --"
for f in $(grep -rl "^status: qa" features/p*.md 2>/dev/null); do
  d=$(grep -m1 "^created_date:" "$f" | tr -d "'\"" | awk '{print $2}')
  echo "$(basename "$f")  (filed $d)"
done
[ -z "$(grep -rl '^status: qa' features/p*.md 2>/dev/null)" ] && echo "none"
echo "-- closed but never moved out of features/ --"
grep -rlE "^status: (done|all-done)" features/p*.md 2>/dev/null || echo "none"
echo "-- ship started and never finished --"
for j in .claude/worktrees/.ship-journal/*.json; do
  [ -e "$j" ] || { echo "none"; break; }
  python3 -c "
import json,sys
d=json.load(open('$j'))
if not d.get('spec_closed') or not d.get('branch_deleted'):
    pend=[c['source_sha'][:8] for c in d.get('commits',[]) if not c.get('landed_sha')]
    print(f\"{d['p_number']}: started {d.get('started_at','?')}, spec_closed={d.get('spec_closed')}, \"
          f\"branch_deleted={d.get('branch_deleted')}, {len(pend)} commit(s) unlanded \"
          f\"-- resume with: ./scripts/git-ops.sh ship {d['p_number']} --resume\")
" 2>/dev/null
done

echo "=== STASH ==="
git stash list 2>/dev/null || echo "none"

echo "=== KDD CHECK ==="
git log --oneline --since="$SINCE" -- CLAUDE.md .claude/rules/ supabase/migrations/ .env.local .env.prod .mcp.json scripts/ docs/technical/

echo "=== CLAUDE.MD CHANGES ==="
git log --oneline --since="$SINCE" -- CLAUDE.md .claude/rules/

echo "=== ACTIVITY LOG ==="
grep -E "^$(date +%Y-%m-%d)" .private/logs/activity.log 2>/dev/null || echo "no activity log"

echo "=== CLOUD ==="
GCLOUD_OK=1
# A real token, not the account list: `auth list` names an account whose credentials have expired.
if ! gcloud auth print-access-token >/dev/null 2>&1; then
  echo "GCLOUD_NOT_AUTHENTICATED"
  GCLOUD_OK=0
else
  gcloud compute instances list --format="value(name,status,zone)" 2>/dev/null || echo "gcloud unavailable"
fi
GHOST_STATUS="$(curl -s -o /dev/null -w "%{http_code}" https://claritypledge.com/blog --max-time 5)"
echo "ghost_status=$GHOST_STATUS"
case "$GHOST_STATUS" in
  200) echo "CHECK cp.blog ok the blog answers" | tee -a "${DAY_CHECK_FILE:-/dev/null}" ;;
  000|"") echo "CHECK cp.blog problem the blog did not answer within 5 seconds" | tee -a "${DAY_CHECK_FILE:-/dev/null}" ;;
  *) echo "CHECK cp.blog problem the blog answered HTTP $GHOST_STATUS" | tee -a "${DAY_CHECK_FILE:-/dev/null}" ;;
esac
LATEST=$(gcloud storage ls gs://claritypledge-db-backups/ 2>/dev/null | sort | tail -1)
DATE=$(echo "$LATEST" | grep -oE '[0-9]{8}' | head -1)
BACKUP_AGE=""
if [ -n "$DATE" ]; then
  DATE_EPOCH=$(date -j -f "%Y%m%d" "$DATE" +%s 2>/dev/null)
  if [ -n "$DATE_EPOCH" ]; then
    BACKUP_AGE=$(( ( $(date +%s) - DATE_EPOCH ) / 86400 ))
    echo "backup_age_days=$BACKUP_AGE"
  fi
fi
if [ "$GCLOUD_OK" -eq 0 ]; then echo "CHECK cp.backup not-run gcloud is not signed in" | tee -a "${DAY_CHECK_FILE:-/dev/null}"
elif [ -z "$BACKUP_AGE" ]; then echo "CHECK cp.backup unproven no dated backup could be listed" | tee -a "${DAY_CHECK_FILE:-/dev/null}"
elif [ "$BACKUP_AGE" -le 2 ]; then echo "CHECK cp.backup ok the newest database backup is $BACKUP_AGE days old" | tee -a "${DAY_CHECK_FILE:-/dev/null}"
else echo "CHECK cp.backup problem the newest database backup is $BACKUP_AGE days old" | tee -a "${DAY_CHECK_FILE:-/dev/null}"; fi

echo "=== GEMINI PROD KEY (P1162) ==="
# The DEPLOYED key, not an ambient one. `ai-keys --ping-prod` pings whatever $GEMINI_API_KEY is set
# in the shell, which is no ClarityPledge secret — it has exited 2 since it shipped and its coverage
# of this repo is zero. Supabase never returns a secret's value, only its SHA-256 digest, so this
# check asserts the local copy still matches the deployed digest BEFORE pinging it. Without that
# assertion a stale local copy reports a false green, which is the exact error P1162 was written on.
# A dead key is invisible to every spend check above: it spends nothing and looks calm.
GEMKEY_OUT="$(./scripts/check-gemini-prod-key.sh 2>&1)"; GEMKEY_RC=$?
printf '%s\n' "$GEMKEY_OUT"
if [ "$GEMKEY_RC" -ge 2 ]; then
  echo "GEMINI-PROD-KEY-CHECK-DID-NOT-RUN (exit $GEMKEY_RC) — do NOT report clean"
fi
# The reading rules below route on this line; until P1399 they named it and nothing printed it.
echo "gemini_prod_key_exit=$GEMKEY_RC"
# Offline control pass, same reasoning as the privilege-floor check: a green live run proves the
# happy path ran, never that the classifier can still tell a tripped cap from a dead key.
./scripts/check-gemini-prod-key.sh --self-test 2>&1
GEMKEY_SELFTEST_RC=$?
echo "gemini_prod_key_selftest_exit=$GEMKEY_SELFTEST_RC"
GEMKEY_TOKEN="$(printf '%s\n' "$GEMKEY_OUT" | grep -oE 'KEY_[A-Z_]+' | grep -v '^KEY_PING_OK$' | head -1)"
if [ "$GEMKEY_RC" -ge 2 ]; then echo "CHECK cp.gemini not-run the production key check could not run (exit $GEMKEY_RC)" | tee -a "${DAY_CHECK_FILE:-/dev/null}"
elif [ "$GEMKEY_SELFTEST_RC" -ne 0 ]; then echo "CHECK cp.gemini unproven the key classifier failed its self-test" | tee -a "${DAY_CHECK_FILE:-/dev/null}"
elif [ "$GEMKEY_RC" -eq 1 ]; then echo "CHECK cp.gemini problem ${GEMKEY_TOKEN:-the production key check found a fault}" | tee -a "${DAY_CHECK_FILE:-/dev/null}"
else echo "CHECK cp.gemini ok the deployed key matches its digest and answers" | tee -a "${DAY_CHECK_FILE:-/dev/null}"; fi

echo "=== COST TRIPWIRE ==="
# Structural leak detection — catches always-on/GPU resources BEFORE cost accrues.
# (Gross MTD spend is not CLI-readable without BigQuery export; cause-pattern check is the daily signal.
#  Below also emits EST_PER_DAY — a resource-based €/day estimate, NOT billed actuals. Billed €: weekly /gcp-spend.)
GCP_PROJECT="gen-lang-client-0869694595"
# Every `gcloud ... list` is graded on its own exit code (P1399 review): an empty listing piped into a
# loop or a parser read exactly like "no leaks" when the listing itself had failed. TRIP_FAILED
# names each listing that failed; any entry makes the check unproven, never ok.
TRIP_FAILED=""
TRIPWIRE_OUT="$(mktemp)"
{
for REGION in us-east4 us-central1 us-east5 europe-west1; do
  SVCS="$(gcloud run services list --project="$GCP_PROJECT" --region="$REGION" --format="value(metadata.name)" 2>/dev/null)"; LIST_RC=$?
  if [ "$LIST_RC" -ne 0 ]; then TRIP_FAILED="$TRIP_FAILED run-services:$REGION"; echo "RUN_SERVICES_LIST_FAILED: $REGION (exit $LIST_RC)"; continue; fi
  for SVC in $SVCS; do
    # Per-field queries — multi-field --format mis-maps when annotations are empty (verified May 2026)
    GPU=$(gcloud run services describe "$SVC" --project="$GCP_PROJECT" --region="$REGION" --format="value(spec.template.spec.containers[0].resources.limits['nvidia.com/gpu'])" 2>/dev/null) || TRIP_FAILED="$TRIP_FAILED describe:$SVC"
    MIN=$(gcloud run services describe "$SVC" --project="$GCP_PROJECT" --region="$REGION" --format="value(spec.template.metadata.annotations['autoscaling.knative.dev/minScale'])" 2>/dev/null) || TRIP_FAILED="$TRIP_FAILED describe:$SVC"
    # A GPU service is flagged on BILLED hours, not on having a GPU: Cloud Run requires
    # cpu-throttling=false for GPUs, so that annotation carries no signal (cp decisions 2026-10-04).
    [ -n "$GPU" ] && ./scripts/gpu-warm-check.py "$GCP_PROJECT" "$SVC" 3
    { [ -n "$MIN" ] && [ "$MIN" != "0" ]; } && echo "ALWAYS_ON: $SVC ($REGION) minScale=$MIN (never scales to zero)"
  done
done
# Enabled schedulers that target Cloud Run (the keep-warm trap) — selected by target URI and
# shortest gap between runs; rules in scripts/scheduler-warm-check.py (cp INBOX-P50). A listing
# that failed never reaches the parser: an empty list is "no schedulers", which it is not.
for REGION in us-east4 us-central1; do
  JOBS="$(gcloud scheduler jobs list --project="$GCP_PROJECT" --location="$REGION" \
    --filter="state=ENABLED" --format="value(name,schedule,httpTarget.uri)" 2>/dev/null)"; LIST_RC=$?
  if [ "$LIST_RC" -ne 0 ]; then
    TRIP_FAILED="$TRIP_FAILED scheduler:$REGION"
    echo "SCHEDULER_PINGING_RUN: check did NOT run in $REGION (listing exit $LIST_RC) — do not report clean"
    continue
  fi
  SCHED_OUT=$({ [ -n "$JOBS" ] && printf '%s\n' "$JOBS"; } | ./scripts/scheduler-warm-check.py); SCHED_RC=$?
  [ -n "$SCHED_OUT" ] && echo "$SCHED_OUT"
  if [ "$SCHED_RC" -ne 0 ]; then TRIP_FAILED="$TRIP_FAILED scheduler-check:$REGION"; echo "SCHEDULER_PINGING_RUN: check did NOT run in $REGION (exit $SCHED_RC) — do not report clean"
  elif [ -n "$SCHED_OUT" ]; then echo "SCHEDULER_PINGING_RUN: ^ enabled job in $REGION — verify it is not keeping a billable instance warm"; fi
done
} > "$TRIPWIRE_OUT" 2>&1
cat "$TRIPWIRE_OUT"
# €/day estimate + cost since last /day run — resource-based (±5%), NOT billed actuals.
# Snapshot rate × elapsed window: catches PERSISTENT spend. A leak that started-and-stopped
# between runs won't show here (only BigQuery billing history would) — that's what the tripwire above is for.
# Window comes from $SINCE, which the dispatcher owns — this sub-day never reads the
# marker file itself (pp p48). If both halves computed their own window, a half that
# failed would still let the other advance it, and the two would silently disagree.
NOW_EPOCH=$(date +%s)
if [ -n "${SINCE:-}" ]; then
  LR_EPOCH=$(date -j -u -f "%Y-%m-%dT%H:%M:%SZ" "$SINCE" +%s 2>/dev/null || date -d "$SINCE" +%s 2>/dev/null)
  DAYS_ELAPSED=$(python3 -c "print(max(0.04,($NOW_EPOCH-${LR_EPOCH:-$NOW_EPOCH})/86400))")
else
  DAYS_ELAPSED=1
fi
export DAYS_ELAPSED
INSTANCES="$(gcloud compute instances list --project="$GCP_PROJECT" --format="value(name,machineType.basename(),status)" 2>/dev/null)"; LIST_RC=$?
if [ "$LIST_RC" -ne 0 ]; then
  TRIP_FAILED="$TRIP_FAILED compute-instances"
  echo "EST_PER_DAY: not computed — the instance listing failed (exit $LIST_RC)"
else
  printf '%s\n' "$INSTANCES" | python3 -c '
import sys, os
HR={"e2-micro":0.0084,"e2-small":0.0168,"e2-medium":0.0335,"e2-standard-2":0.0670,"e2-standard-4":0.1340,"e2-standard-8":0.2681,"n1-standard-1":0.0475}
usd_day=0.16  # disk+storage baseline/day (from /gcp-spend inventory)
for line in sys.stdin:
    p=line.split()
    if len(p)>=3 and p[2]=="RUNNING":
        usd_day+=HR.get(p[1],0)*24
days=float(os.environ.get("DAYS_ELAPSED","1"))
eur_day=usd_day*0.92  # rough USD->EUR; estimate only
print(f"EST_PER_DAY: ~EUR{round(eur_day,2)}/day  |  EST_SINCE_LAST: ~EUR{round(eur_day*days,2)} over {round(days,1)}d (current resources x elapsed; a warm GPU adds ~EUR19/day)")
'
fi
TRIP_N="$(grep -cE '^(GPU_SERVICE|ALWAYS_ON):|^SCHEDULER_PINGING_RUN: \^' "$TRIPWIRE_OUT")"
TRIP_FAILED="$(printf '%s\n' $TRIP_FAILED | sort -u | tr '\n' ' ' | sed 's/ *$//' | cut -c1-50)"
if [ "$GCLOUD_OK" -eq 0 ]; then echo "CHECK cp.cost not-run gcloud is not signed in" | tee -a "${DAY_CHECK_FILE:-/dev/null}"
elif [ "$TRIP_N" -gt 0 ]; then echo "CHECK cp.cost problem $TRIP_N possible cost leaks: GPU, always-on or a warm-keeping scheduler" | tee -a "${DAY_CHECK_FILE:-/dev/null}"
elif [ -n "$TRIP_FAILED" ]; then echo "CHECK cp.cost unproven listing failed: $TRIP_FAILED" | tee -a "${DAY_CHECK_FILE:-/dev/null}"
else echo "CHECK cp.cost ok no GPU, always-on or warm-keeping scheduler found" | tee -a "${DAY_CHECK_FILE:-/dev/null}"; fi
rm -f "$TRIPWIRE_OUT"
echo "(empty above = no always-on/GPU cost leaks)"
# The wave's exit is the step's; every finding above is a CHECK line, never a failed step.
exit 0
STEP
```

Process Wave 1 results before proceeding. The body has written a status for each of its checks
(`cp.smoke`, `cp.blog`, `cp.backup`, `cp.gemini`, `cp.cost`). Since P1399 nothing below is shown to
the founder as a line: where a rule says *show*, *report*, *flag* or *output*, record a finding —
one per distinct fault, the check's own lines as its body:

| fault | `--check` | `--fault-key` | question for the founder? |
|---|---|---|---|
| smoke failing | cp.smoke | `smoke:failing` (severity high; the first failure in Point A) | no |
| blog not answering | cp.blog | `blog:down` | no |
| backup more than 2 days old | cp.backup | `backup:stale` | no |
| Gemini key finding | cp.gemini | `gemini:<token, lowercased with dashes>`, e.g. `gemini:key-digest-mismatch` | no |
| a tripwire line | cp.cost | `cost:gpu-service:<service>`, `cost:always-on:<service>`, `cost:scheduler-warm:<region>` | no |
| a spec built and waiting for him (`qa`) | cp.w1 | `spec:qa:<pN>` | **yes**: `--option ship="Ship it (/ship pN)" --option later="Leave it in QA for now"`, recommend from the spec's state, with a confidence |
| a spec closed but still in `features/` | cp.w1 | `spec:not-moved:<pN>` | no — the agent runs `/slava:maintain:fix-kanban` |
| a ship started and never finished | cp.w1 | `ship:unfinished:<pN>` (the `--resume` line as Point B) | no |

A stranded spec that is merely `in-progress` is a reading, not a finding. Titles carry no ages or
counts: "P1234 is built and waiting for you", with the `qa` age in the body and `--first-seen` set
to the date it reached `qa` when the spec says so.

**gcloud:** if `GCLOUD_NOT_AUTHENTICATED` appears, the dispatcher's gate (Step 0e of
`~/.claude/commands/day.md`) either did not run or was answered without authenticating.
**Do not prompt from here** — that is the dispatcher's job and prompting twice is the thing
the single gate exists to prevent. Every cloud-dependent check then reads `not-run` from its own
CHECK line, and the REPORT block says gcloud was not signed in. Never clean, never silent.

**Gemini prod key** (`=== GEMINI PROD KEY (P1162) ===`) — read `gemini_prod_key_exit=N`:

- `0` — the local copy matches the deployed prod secret's digest AND the key answered. Report `✓ Gemini prod key: alive`.
- `1` — a finding. Which one matters, they need opposite responses:
  - `KEY_DIGEST_MISMATCH` — the local copy is **not** the deployed key. Nothing is proven about
    prod's key; the ping was correctly refused rather than testing the wrong credential. Either
    `.env.local` is stale, or someone rotated one store and not the other. Resolve before trusting
    any other Gemini reading.
  - `KEY_CAP_TRIPPED` — the budget is spent, the credential is fine. Do **not** debug the key, and
    do **not** lift the cap on its own: a cap lifted within the same billing month does not
    re-enforce unless the amount is raised first, so a bare lift removes the budget for the rest of
    the month. Raise, then lift.
  - `KEY_PING_FAILED` — the deployed key genuinely stopped authenticating. Banner generation is
    degrading to Unsplash/gradient right now.
  - `KEY_PING_MODEL_UNAVAILABLE` — a retired model name. Says nothing about the credential.
  - `KEY_PING_RATE_LIMITED` / `KEY_PING_FORBIDDEN` — quota, or a restriction that is not a cap.
- `2` — **did not run** (`GEMINI-PROD-KEY-CHECK-DID-NOT-RUN`): no local copy of the key, the
  Supabase CLI could not list secrets, or the ping never completed. Report `⚠ Gemini prod key: NOT
  checked this run — [reason]`. Never as clean, never as "the key is fine".
- `gemini_prod_key_selftest_exit` non-zero — the classifier itself is broken. Every verdict above is
  untrustworthy this run, including a `0`.

**Known coverage gap:** the `KEY_CAP_TRIPPED` branch is exercised only against a synthetic 403 body,
because no spend cap exists yet to trip. When P1162's caps are created, re-verify that branch
against a real refusal before treating it as proven.

**Cost tripwire — flag if ANY line appears under `=== COST TRIPWIRE ===`:**
- `GPU_WARM:` → a GPU service was billed more than 3 h in the last 24 h (Cloud Monitoring `billable_instance_time`). GPUs bill ~€0.80/hr while allocated. Normal is ~1 h/day: `tx-job-janitor` wakes `transcribe-session` for ~5 min every 2 h. The May leak read 24 h/day.
- `GPU_CHECK_FAILED:` → the billed-time query did not run. Report it as unchecked, never as clean.
- `GPU_SERVICE_OK:` → informational, not a tripwire. Render it in the spend block, not as a leak.
- `ALWAYS_ON:` → a service has `minScale ≥ 1` and never idles to zero — paying 24/7.
- `SCHEDULER_PINGING_RUN:` → an enabled scheduler hits Cloud Run. A poll on a `cpu-throttle=false`/GPU service holds it warm 24/7 (this is the May-2026 €1,600 transcribe-session leak — see decisions). Verify the target isn't being kept alive needlessly. Allowlisted, by name AND interval: `tx-job-janitor` (P858/P902, every 2 h) and `transcribe-room-sweep` (P1307, hourly since 2026-10-01). Either one firing more often than every 30 min is flagged even though it is listed, because a ping inside the ~15-min idle window keeps a `--no-cpu-throttling` service warm 24/7. Any other scheduler whose target is a `run.app` URL is a leak until shown otherwise. Jobs are selected by target URI, not by name.

**Always record a cost status, even when clean** (silence = "did it leak?" uncertainty, the exact problem this prevents). Since P1399 that is the `cp.cost` CHECK line, and the verdict lines below are the wording of its findings rather than printed lines:
- **Verdict line:**
  - Any tripwire present → one `⚠ COST LEAK: [line]` per `GPU_WARM:` / `GPU_CHECK_FAILED:` / `ALWAYS_ON:` / `SCHEDULER_PINGING_RUN:` line. These are silent money drains the credit-masked budget won't catch until gross thresholds.
  - All clear → `✓ GPU/cost: no leak (GPU billed under threshold, no always-on, no Run-pinging scheduler)`, with each `GPU_SERVICE_OK:` hours figure appended.
- **Spend line (always):** render the `EST_PER_DAY:` / `EST_SINCE_LAST:` output as `Est. spend: ~€X/day · ~€Y since last /day (Nd)`. This is a resource-based estimate (±5%), NOT billed — a warm GPU spikes it ~€19/day above the ~€4/day baseline. For billed-to-the-cent €: weekly `/gcp-spend`.

#### Wave 2: Supabase + Sentry (2 calls max, parallel)

Run these two in parallel:

**a) Sentry MCP** — single call:

**Pre-flight: connect before executing.** Before the query, run ToolSearch for `mcp__sentry__search_issues` to confirm the MCP is live. If the tool is not found, run the **self-repair sequence** (automatic — same mechanism as Mixpanel; Sentry uses the identical `mcp-remote` OAuth cache — verified 2026-07-03):

1. Read the newest Sentry MCP log to diagnose:
   ```bash
   LOGDIR=~/Library/Caches/claude-cli-nodejs/$(git rev-parse --show-toplevel | sed 's#/#-#g')/mcp-logs-sentry
   LOG=$(ls -t "$LOGDIR"/*.jsonl 2>/dev/null | head -1)
   [ -n "$LOG" ] && grep -oE 'connection timed out|Server returned 40[0-9]|invalid_token' "$LOG" | head -3 || echo "no-log"
   ```
   (Patterns are UNQUOTED substrings matching the real log format — e.g. `MCP server "sentry" connection timed out after 30000ms`, `Server returned 403`. The phrase is never wrapped in its own quote pair, so a quoted grep like `'"connection timed out"'` matches nothing — verified against historical logs 2026-07-03.)
2. **Stale-OAuth path** (log contains `connection timed out`, `Server returned 401/403`, or `invalid_token`): clear Sentry's cached token automatically — hash-glob across ALL mcp-remote versions so it survives the `.mcp.json` version pin drifting (Sentry's token has been seen under an older version dir than the pinned one):
   ```bash
   rm -f ~/.mcp-auth/mcp-remote-*/305d49f5*
   ```
   (Hash `305d49f5287a7c289157a704a0ed3b1e` = `md5('https://mcp.sentry.dev/mcp')` — stable, derived from the server URL, NOT the token. This glob clears ONLY Sentry, never Mixpanel's `3065cf…`. Verified 2026-07-03.)
   Then re-run ToolSearch for `mcp__sentry__search_issues`. If tools appear, proceed — repair was silent (note it in the status line).
   If tools still absent after clearing: skip with the loud line below, and report Sentry as `not-connected — auth was stale and cleared, the MCP did not reconnect` in the REPORT block — the board shows it as a connection whose Fix is `/mcp` → reconnect sentry. (You run in a subagent and cannot wait for the reconnect; P1328.)
3. **No log / different error**: skip with the loud line — don't clear auth blindly.

**Query** (once connected): use `mcp__sentry__search_issues`: org `22minds-llc`, project `javascript-react`, unresolved issues first seen since `$SINCE`. Also look for `live_state_update_failed` in results.

**Always record exactly one explicit status** (a skip MUST read differently from "clean" — this is the whole point). The four lines below are its wording; since P1399 they are recorded, not printed:

```bash
"$DAY_STEP" check cp.sentry <ok|problem|not-run> --detail "0 new issues since the last run" --step cp.w2s
```

Clean or self-healed-and-clean is `ok`; new issues are `problem`, plus **one finding per new issue**
(`--check cp.sentry --fault-key sentry:<the issue's short id, lowercased> --severity high`, the
issue title as the title, users affected and event count in the body); skipped is `not-run`, and the
REPORT block carries why.
- `✓ Sentry: clean (0 new since last /day)` — connected, no new issues
- `⚠ Sentry: N new issues — [top title]` — connected, issues found
- `✓ Sentry: self-healed (cleared stale OAuth), clean` — repair succeeded
- `⚠ Sentry: SKIPPED — MCP unreachable after self-heal + reconnect. NOT checked this run. → /mcp reconnect sentry` — genuinely failed; never render as clean

**b) All Supabase queries** — single bash call with all curls:

```bash
"$DAY_STEP" run cp.w2 <<'STEP'
# P1214: every query here is a READ, so it runs on the scoped read-only credential through
# scripts/supabase-readonly-sql.py — never the prod master key or the account-wide platform
# token. The helper refuses to fall back to either, and refuses to return rows if its role
# stops bypassing RLS (counts would silently shrink). Output is the same JSON array shape a
# PostgREST GET returned, so the parsers below are unchanged except where a count moved into SQL.
ro() { python3 "$(git rev-parse --show-toplevel)/scripts/supabase-readonly-sql.py" --env prod "$1"; }
CUTOFF=$(date -u -v-60M +"%Y-%m-%dT%H:%M:%SZ" 2>/dev/null || date -u -d "60 minutes ago" +"%Y-%m-%dT%H:%M:%SZ")

echo "=== SIGNUPS ==="
# P1399: the same query, with the columns the day report's people section needs — slug (to leave out
# agent accounts), linkedin_url, whether the email was confirmed (auth.users, readable through the
# read-only role, which bypasses RLS), and the first event they RSVP'd to, as how they arrived.
ro "SELECT p.id, p.name, p.email, p.slug, p.linkedin_url, p.created_at, (u.email_confirmed_at IS NOT NULL) AS confirmed, (SELECT e.title FROM public.event_rsvps r JOIN public.events e ON e.id = r.event_id WHERE r.profile_id = p.id ORDER BY r.rsvped_at LIMIT 1) AS first_event FROM public.profiles p LEFT JOIN auth.users u ON u.id = p.id WHERE p.created_at > '${SINCE}' AND p.email <> 'test-agent@claritypledge.com' ORDER BY p.created_at DESC"

echo -e "\n=== STORIES ==="
ro "SELECT s.author_id, p.name, p.slug, p.linkedin_url, s.created_at FROM public.stories s LEFT JOIN public.profiles p ON p.id = s.author_id WHERE s.created_at > '${SINCE}' ORDER BY s.created_at DESC"

echo -e "\n=== POSITIONS ==="
ro "SELECT pp.user_id, p.name, p.slug, p.linkedin_url, pp.updated_at FROM public.point_positions pp LEFT JOIN public.profiles p ON p.id = pp.user_id WHERE pp.updated_at > '${SINCE}' ORDER BY pp.updated_at DESC"

echo -e "\n=== VERIFICATIONS ==="
ro "SELECT speaker_id, listener_id, created_at FROM public.story_verifications WHERE created_at > '${SINCE}'"

echo -e "\n=== AGREEMENTS ==="
ro "SELECT creator_profile_id, partner_profile_id, status, created_at FROM public.clarity_agreements WHERE created_at > '${SINCE}' OR partner_signed_at > '${SINCE}'"

# The four funnel counts are computed IN SQL. The PostgREST version took len() of an
# unpaginated response, which plateaus silently at the server's max-rows cap.
echo -e "\n=== FUNNEL: PROFILES ==="
FUNNEL_SIGNUPS=$(ro "SELECT count(*) AS n FROM public.profiles WHERE email <> 'test-agent@claritypledge.com'" | python3 -c "import json,sys;r=json.load(sys.stdin);print(r[0]['n'] if isinstance(r,list) else '?')" 2>/dev/null || echo "?")
echo "$FUNNEL_SIGNUPS"

echo -e "\n=== FUNNEL: STORY AUTHORS ==="
FUNNEL_STORY_USERS=$(ro "SELECT count(DISTINCT author_id) AS n FROM public.stories" | python3 -c "import json,sys;r=json.load(sys.stdin);print(r[0]['n'] if isinstance(r,list) else '?')" 2>/dev/null || echo "?")
echo "$FUNNEL_STORY_USERS"

echo -e "\n=== FUNNEL: POSITION USERS ==="
FUNNEL_POSITION_USERS=$(ro "SELECT count(DISTINCT user_id) AS n FROM public.point_positions" | python3 -c "import json,sys;r=json.load(sys.stdin);print(r[0]['n'] if isinstance(r,list) else '?')" 2>/dev/null || echo "?")
echo "$FUNNEL_POSITION_USERS"

echo -e "\n=== FUNNEL: AGREEMENTS ==="
FUNNEL_AGREEMENTS=$(ro "SELECT count(*) AS n FROM public.clarity_agreements WHERE status = 'active'" | python3 -c "import json,sys;r=json.load(sys.stdin);print(r[0]['n'] if isinstance(r,list) else '?')" 2>/dev/null || echo "?")
echo "$FUNNEL_AGREEMENTS"

echo -e "\n=== UNCONFIRMED SIGN-UPS (P1257 window: older than 24h, newer than 7 days) ==="
# A count only: the addresses stay out of this output (check-stranded-signups.sh's privacy rule).
UNCONF=$(ro "SELECT count(*) AS n FROM auth.users WHERE email_confirmed_at IS NULL AND created_at < now() - interval '24 hours' AND created_at > now() - interval '7 days'" | python3 -c "import json,sys;r=json.load(sys.stdin);print(r[0]['n'] if isinstance(r,list) else '?')" 2>/dev/null || echo "?")
echo "unconfirmed_signups=$UNCONF"
case "$UNCONF" in
  0) echo "CHECK cp.signups ok every sign-up of the last week confirmed their email" | tee -a "${DAY_CHECK_FILE:-/dev/null}" ;;
  ''|*[!0-9]*) echo "CHECK cp.signups not-run the sign-up confirmation query failed" | tee -a "${DAY_CHECK_FILE:-/dev/null}" ;;
  *) echo "CHECK cp.signups problem $UNCONF sign-ups never confirmed their email" | tee -a "${DAY_CHECK_FILE:-/dev/null}" ;;
esac

echo -e "\n=== ORPHANED SESSIONS ==="
ORPH=$(ro "SELECT id, code, created_at, expires_at FROM public.clarity_sessions WHERE joiner_name IS NOT NULL AND expires_at < '${CUTOFF}' AND demo_status <> 'completed' ORDER BY expires_at DESC LIMIT 5")
echo "$ORPH"
ORPH_N=$(printf '%s' "$ORPH" | python3 -c "import json,sys;r=json.load(sys.stdin);print(len(r) if isinstance(r,list) else '?')" 2>/dev/null || echo "?")
case "$ORPH_N" in
  0) echo "CHECK cp.sessions ok no joined live session left without completion" | tee -a "${DAY_CHECK_FILE:-/dev/null}" ;;
  ''|*[!0-9]*) echo "CHECK cp.sessions not-run the session query failed" | tee -a "${DAY_CHECK_FILE:-/dev/null}" ;;
  *) echo "CHECK cp.sessions problem $ORPH_N joined live sessions never completed (5 shown at most)" | tee -a "${DAY_CHECK_FILE:-/dev/null}" ;;
esac

echo -e "\n=== TRANSCRIPTION HEALTH ==="
# P874 tier-0 job health. Uses only columns on prod today (status/created_at/updated_at) —
# NOT `attempts` (a P858 column; add an attempts distribution here once P858's migration is on prod).
# Stale/lost windows are filtered SERVER-SIDE (PostgREST) — never string-compare timestamps client-side
# (prod returns +00:00 offsets that don't sort lexicographically against a Z cutoff).
TX_STALE=$(date -u -v-30M +"%Y-%m-%dT%H:%M:%SZ" 2>/dev/null || date -u -d "30 minutes ago" +"%Y-%m-%dT%H:%M:%SZ")
TX_LOST=$(date -u -v-5M +"%Y-%m-%dT%H:%M:%SZ" 2>/dev/null || date -u -d "5 minutes ago" +"%Y-%m-%dT%H:%M:%SZ")
echo -n "counts: "; ro "SELECT status FROM public.transcription_jobs" | python3 -c "import json,sys;from collections import Counter;r=json.load(sys.stdin);print('query failed:',r.get('message')) if isinstance(r,dict) else print(dict(Counter(x['status'] for x in r)) or {})" 2>/dev/null || echo "?"
TX_STALE_N=$(ro "SELECT id FROM public.transcription_jobs WHERE status = 'processing' AND updated_at < '${TX_STALE}'" | python3 -c "import json,sys;r=json.load(sys.stdin);print(len(r) if isinstance(r,list) else '?')" 2>/dev/null || echo "?")
echo "stale_processing(>30m): $TX_STALE_N"
TX_LOST_N=$(ro "SELECT id FROM public.transcription_jobs WHERE status = 'pending' AND created_at < '${TX_LOST}'" | python3 -c "import json,sys;r=json.load(sys.stdin);print(len(r) if isinstance(r,list) else '?')" 2>/dev/null || echo "?")
echo "lost_pending(>5m): $TX_LOST_N"
case "$TX_STALE_N:$TX_LOST_N" in
  0:0) echo "CHECK cp.transcribe ok no stale or lost transcription jobs" | tee -a "${DAY_CHECK_FILE:-/dev/null}" ;;
  *[!0-9:]*|:*|*:) echo "CHECK cp.transcribe not-run the transcription job queries failed" | tee -a "${DAY_CHECK_FILE:-/dev/null}" ;;
  *) echo "CHECK cp.transcribe problem $TX_STALE_N stale and $TX_LOST_N lost transcription jobs" | tee -a "${DAY_CHECK_FILE:-/dev/null}" ;;
esac

echo -e "\n=== EVENT EMAIL HEALTH ==="
# P1256 tier-0. This is the check that would have caught a THREE-MONTH outage on day one:
# dispatch-event-emails shipped 2026-06-10 and nothing ever invoked it, so every reminder
# and every feedback email silently never sent. Nothing anywhere reported that, because
# "no email was sent" produces no error, no Sentry event and no failed row — the rows just
# sit there correct and unread.
#
# The signal is OVERDUE-AND-UNSENT: a scheduled_at in the past with no Mailgun id. Under a
# working cron this is structurally 0 — the dispatcher hands Mailgun a FUTURE delivery time,
# so it claims every row before its moment arrives. Any non-zero count means the cron is not
# running (or is erroring), and it is also unrecoverable by the cron itself: runDispatch
# filters `scheduled_at > now()`, so a row that goes overdue is invisible to every later run.
# Recover with the backfill (feedback only): POST {"backfill_event_id":"<uuid>"}.
#
# A 30-minute grace on "overdue" absorbs the cron's own */30 cadence, so a row that is merely
# waiting for the next tick does not read as a fault.
# CRON JOB HEALTH comes FIRST, because it is the DIRECT signal and the rows below are
# only a proxy for it. The 2026-06→09 outage was not a silent one: prod's cron job fired
# on schedule 328 times and FAILED all 328, logging an identical `column "Authorization"
# does not exist` into cron.job_run_details each time. A hard, loud, recorded error —
# operationally identical to silence, because nothing ever read that table. Read it.
# The cron's own status is not evidence of delivery, so this asserts a recent successful
# dispatch response instead. Why, and the incident behind it: `.private/docs/` (P1256).
DISPATCH_SQL="SELECT max(created) FILTER (WHERE status_code=200 AND content LIKE '%\"mode\":\"cron\"%') AS last_ok_dispatch, round(extract(epoch FROM now()-max(created) FILTER (WHERE status_code=200 AND content LIKE '%\"mode\":\"cron\"%'))/60) AS mins_since_ok, count(*) FILTER (WHERE status_code<>200 AND created > now()-interval '6 hours') AS non_2xx_6h FROM net._http_response;"
DISPATCH_OUT=$(ro "$DISPATCH_SQL"); DISPATCH_RC=$?
echo "$DISPATCH_OUT"
[ "$DISPATCH_RC" -eq 0 ] || echo "dispatch-delivery check FAILED — read-only query did not run (see message above)"

# Plain single quotes. This line used to carry '"'"' escapes — the single-quoted-string idiom —
# inside a DOUBLE-quoted string, where they break the assignment: CRON_SQL came out empty and
# the API answered `query: Too small`, which printed as a JSON blob with no FAILED marker.
# The daily cron check had not been running (found 2026-09-15, P1214 parity run).
CRON_SQL="SELECT j.jobname, j.active, (SELECT count(*) FROM cron.job_run_details d WHERE d.jobid=j.jobid AND d.status='failed' AND d.start_time > now() - interval '24 hours') AS failed_24h, (SELECT count(*) FROM cron.job_run_details d WHERE d.jobid=j.jobid AND d.status='succeeded' AND d.start_time > now() - interval '24 hours') AS ok_24h, (SELECT d.return_message FROM cron.job_run_details d WHERE d.jobid=j.jobid AND d.status='failed' ORDER BY d.start_time DESC LIMIT 1) AS last_error FROM cron.job j ORDER BY j.jobname;"
CRON_OUT=$(ro "$CRON_SQL"); CRON_RC=$?
echo "$CRON_OUT"
[ "$CRON_RC" -eq 0 ] || echo "cron check FAILED — read-only query did not run (see message above)"

EMAIL_FLOOR="2026-09-07T00:00:00Z"
EMAIL_OVERDUE=$(date -u -v-30M +"%Y-%m-%dT%H:%M:%SZ" 2>/dev/null || date -u -d "30 minutes ago" +"%Y-%m-%dT%H:%M:%SZ")
OVERDUE_FB=$(ro "SELECT id FROM public.event_rsvps WHERE feedback_scheduled_at < '${EMAIL_OVERDUE}' AND feedback_scheduled_at > '${EMAIL_FLOOR}' AND (mailgun_message_ids->>'feedback') IS NULL" | python3 -c "import json,sys;r=json.load(sys.stdin);print(len(r) if isinstance(r,list) else 'query failed: '+str(r.get('message')))" 2>/dev/null || echo "?")
echo "overdue_unsent_feedback(since ${EMAIL_FLOOR}): $OVERDUE_FB"
# LOWER BOUND, not decoration. Every row from the 2026-06→09 outage has a past
# reminder_scheduled_at and an empty mailgun_message_ids, and those rows are
# deliberately NOT recoverable — a "your event is tomorrow" email for an event that
# already happened is worse than silence. Without a floor this counter would sit
# permanently non-zero, i.e. permanently in its own documented alarm state, and a real
# future outage would add +1 to a number already being ignored. That is the alert-fatigue
# failure, in a check written because the last outage hid for three months. The floor is
# the P1256 deploy date: only rows scheduled AFTER the cron was fixed can indict it.
OVERDUE_RM=$(ro "SELECT id FROM public.event_rsvps WHERE reminder_scheduled_at < '${EMAIL_OVERDUE}' AND reminder_scheduled_at > '${EMAIL_FLOOR}' AND (mailgun_message_ids->>'reminder') IS NULL" | python3 -c "import json,sys;r=json.load(sys.stdin);print(len(r) if isinstance(r,list) else 'query failed: '+str(r.get('message')))" 2>/dev/null || echo "?")
echo "overdue_unsent_reminder(since ${EMAIL_FLOOR}): $OVERDUE_RM"
# Stuck PENDING = the dispatcher claimed a row and then died before writing the Mailgun id
# back. Distinct from the above: the cron IS running, but a send is failing mid-flight.
STUCK_FB=$(ro "SELECT id FROM public.event_rsvps WHERE (mailgun_message_ids->>'feedback') = 'PENDING' AND feedback_attempted_at < '${EMAIL_OVERDUE}'" | python3 -c "import json,sys;r=json.load(sys.stdin);print(len(r) if isinstance(r,list) else 'query failed: '+str(r.get('message')))" 2>/dev/null || echo "?")
echo "stuck_pending_feedback: $STUCK_FB"
# One status for the whole block, from the numbers above and the rules below it: silent dispatch
# (no successful cron dispatch in 90 minutes, or a non-2xx in 6h), a failing cron job, an overdue
# or stuck row. Any query that did not return is not-run — never read as zero.
DISPATCH_OUT="$DISPATCH_OUT" CRON_OUT="$CRON_OUT" DISPATCH_RC="$DISPATCH_RC" CRON_RC="$CRON_RC" \
OVERDUE_FB="$OVERDUE_FB" OVERDUE_RM="$OVERDUE_RM" STUCK_FB="$STUCK_FB" python3 -c '
import json, os
e = os.environ.get
def rows(k):
    try:
        r = json.loads(e(k) or "")
        return r if isinstance(r, list) else None
    except ValueError:
        return None
d, c = rows("DISPATCH_OUT"), rows("CRON_OUT")
counts = [e("OVERDUE_FB"), e("OVERDUE_RM"), e("STUCK_FB")]
if e("DISPATCH_RC") != "0" or e("CRON_RC") != "0" or d is None or c is None or not all((x or "").isdigit() for x in counts):
    print("CHECK cp.email not-run an event email or cron query did not return")
    raise SystemExit
why = []
r = d[0] if d else {}
mins = r.get("mins_since_ok")
if mins is None or float(mins) > 90:
    why.append("no successful dispatch in 90 minutes")
if int(r.get("non_2xx_6h") or 0) > 0:
    why.append("dispatch answered non-2xx")
failing = [j.get("jobname") for j in c if int(j.get("failed_24h") or 0) > 0]
if failing:
    why.append("%d scheduled jobs failing" % len(failing))
if int(counts[0]) + int(counts[1]) > 0:
    why.append("emails overdue and unsent")
if int(counts[2]) > 0:
    why.append("sends stuck pending")
print("CHECK cp.email " + ("problem " + ", ".join(why) if why else "ok dispatch delivering, no failing job, nothing overdue"))
' | tee -a "${DAY_CHECK_FILE:-/dev/null}"

echo -e "\n=== FUNNEL CSV ==="
# Pin to the MAIN checkout, not a worktree — .private/ is gitignored, so a worktree
# under .claude/worktrees/wN has no shared file; writing there silently forks the metric.
MAIN_GIT_DIR="$(git rev-parse --path-format=absolute --git-common-dir)"
METRICS_DIR="$(dirname "$MAIN_GIT_DIR")/.private/metrics"
mkdir -p "$METRICS_DIR"
CSV_FILE="$METRICS_DIR/funnel-daily.csv"
# P1399: the funnel as a day-report reading, with the change since the last earlier day's row.
FUNNEL_PREV=$(grep -v '^[[:space:]]*$' "$CSV_FILE" 2>/dev/null | grep -v "^$(date -u +%Y-%m-%d)," | tail -1)
echo "funnel_today=${FUNNEL_SIGNUPS},${FUNNEL_STORY_USERS},${FUNNEL_POSITION_USERS},${FUNNEL_AGREEMENTS}"
echo "funnel_previous_row=${FUNNEL_PREV:-none}"
# Strip any trailing blank line before reading the tail — an empty last line never
# equals today's date, which would otherwise defeat the dedup below on every run.
LAST_CSV_DATE=$(grep -v '^[[:space:]]*$' "$CSV_FILE" 2>/dev/null | tail -1 | cut -d, -f1)
if [ -n "$LAST_CSV_DATE" ]; then
  LAST_CSV_EPOCH=$(date -j -f "%Y-%m-%d" "$LAST_CSV_DATE" +%s 2>/dev/null || date -d "$LAST_CSV_DATE" +%s 2>/dev/null)
  if [ -n "$LAST_CSV_EPOCH" ]; then
    STALE_DAYS=$(( ( $(date +%s) - LAST_CSV_EPOCH ) / 86400 ))
    [ "$STALE_DAYS" -gt 2 ] && echo "⚠ FUNNEL CSV STALE: $STALE_DAYS days since last row ($LAST_CSV_DATE) — check this append is actually firing"
  fi
fi
if [[ "$FUNNEL_SIGNUPS" =~ ^[0-9]+$ ]] && [[ "$FUNNEL_STORY_USERS" =~ ^[0-9]+$ ]] && [[ "$FUNNEL_POSITION_USERS" =~ ^[0-9]+$ ]] && [[ "$FUNNEL_AGREEMENTS" =~ ^[0-9]+$ ]]; then
  TODAY_ROW="$(date -u +%Y-%m-%d)"
  # Same-day re-run: REPLACE the last row rather than skip — the latest snapshot wins.
  # Skipping would make an earlier bad/partial row (e.g. from a since-fixed query
  # failure) permanent for the day, since the CSV has no other correction path.
  if [ "$LAST_CSV_DATE" = "$TODAY_ROW" ]; then
    grep -v '^[[:space:]]*$' "$CSV_FILE" 2>/dev/null | sed '$d' > "${CSV_FILE}.tmp" && mv "${CSV_FILE}.tmp" "$CSV_FILE"
  fi
  echo "${TODAY_ROW},${FUNNEL_SIGNUPS},${FUNNEL_STORY_USERS},${FUNNEL_POSITION_USERS},${FUNNEL_AGREEMENTS}" >> "$CSV_FILE"
  echo "CSV row for $TODAY_ROW written (latest snapshot of the day)"
else
  echo "CSV_APPEND_SKIPPED — one or more funnel counts was non-numeric (query failure): signups=$FUNNEL_SIGNUPS story=$FUNNEL_STORY_USERS pos=$FUNNEL_POSITION_USERS agreements=$FUNNEL_AGREEMENTS"
fi
STEP
```

**This append is mandatory, not optional — it runs inline in the Wave 2b bash script above, using the funnel counts it already computed.** If `CSV_APPEND_SKIPPED` or `⚠ FUNNEL CSV STALE` appears in output, flag it (a query failed, or a prior run silently didn't append) rather than continuing past it. Filter out `test-agent@claritypledge.com` from all results.

**Since P1399 the wave reports its own checks** (`cp.signups`, `cp.sessions`, `cp.transcribe`,
`cp.email`) and the rules below decide the findings rather than printed lines:

| fault | `--check` | `--fault-key` |
|---|---|---|
| sign-ups that never confirmed | cp.signups | `signups:unconfirmed` (the count in the body, never an address) |
| orphaned live sessions | cp.sessions | `sessions:orphaned` |
| stale / lost transcription jobs | cp.transcribe | `transcribe:stale-jobs`, `transcribe:lost-jobs` |
| silent dispatch, a failing cron job, overdue or stuck emails | cp.email | `email:dispatch-silent`, `email:cron-failing:<jobname>`, `email:overdue-unsent`, `email:stuck-pending` |
| a funnel CSV row skipped or stale | cp.w2 | `funnel:csv-skipped`, `funnel:csv-stale` |
| a read-only query failed (`message` instead of rows) | cp.w2 | `supabase:readonly-query-failed` |

Keep `unconfirmed_signups=N` for the REPORT block.

**Closed 2026-09-15 (P1214):** the four funnel counts used to take client-side `len()` of an unpaginated PostgREST response, which plateaus silently at the `max-rows` cap. They now `count(*)` in SQL through the read-only helper, which has no row cap.

If response is a JSON object with `message` key (not array): `⚠ User activity: query failed — <message>`. The usual cause is a missing or expired `SUPABASE_READONLY_TOKEN` (the scoped `Database: Read` token, ~90-day lifetime). **Never "fix" this by switching the block back to the prod master key** — that restores write authority to a read-only report (P1214).

**Transcription health (P874 tier-0) — read `=== TRANSCRIPTION HEALTH ===`. Flag if:**
- `failed` climbing relative to `completed` → pipeline regression (cross-check Sentry + recent `transcription_jobs.error_message`).
- `stale_processing(>30m) > 0` → a job crashed mid-run. The P858 sweeper (`tx-job-janitor`, ~2h) should reset these; **>0 across two consecutive `/day` runs = the sweeper isn't running** — check the scheduler.
- `lost_pending(>5m) > 0` → a trigger was lost (webhook/Cloud Tasks miss); the sweeper is the backstop — same two-run rule applies.
- All zeros (or only `completed`) = healthy / idle. Pre-P858-deploy this is mostly zeros + historical rows — that's the expected baseline.
- Once P858's migration is on prod, add an `attempts` distribution here (`attempts>=3` = retries exhausted → permanent failure).

**Event email health (P1256 tier-0) — read `=== EVENT EMAIL HEALTH ===`.**

**Read `last_ok_dispatch` FIRST — it is the only line that can detect a silent failure.**
`mins_since_ok` should be under ~60 (the job runs every 30 min). Over ~90 minutes, or
`last_ok_dispatch` null, means **nothing is being delivered** — report
`⚠ EVENT EMAIL DISPATCH SILENT: no successful dispatch in N minutes`. `non_2xx_6h > 0`
means dispatches are being refused. **Never conclude the dispatcher is healthy from a green
cron row alone** (the history is in `.private/docs/`, P1256).

**Then read the cron rows — they catch a different failure: the job not running at all.**
Any job with `failed_24h > 0` is broken NOW, and `last_error` says how. A job with
`ok_24h = 0` **and** `failed_24h = 0` is not firing at all — check `active`. Report as
`⚠ CRON JOB FAILING: <jobname> — <last_error>`. **Never treat a scheduled job as healthy
because nothing else looks wrong**: prod's `dispatch-event-emails` job was `active: true`
on a correct schedule and failed all 328 of its runs over three months on a one-character
SQL quoting bug (double quotes around a string literal, so Postgres read it as a column
name). Nothing downstream complained, because a job that dies before its HTTP request
sends no email and writes no failed row anywhere except here.

The healthy reading is **all three zero**, and that is not a soft expectation — under a
working cron it is structural. The dispatcher claims each row and hands Mailgun a *future*
delivery time, so a row should never still be unclaimed after its moment has passed.

- `overdue_unsent_feedback > 0` or `overdue_unsent_reminder > 0` → **the cron is not running.**
  Report as `⚠ EVENT EMAILS NOT DISPATCHING: N feedback / M reminder overdue — the pg_cron job
  `dispatch_event_emails` is not firing`. Check, in this order: the job exists
  (`SELECT * FROM cron.job WHERE jobname='dispatch_event_emails'`), its recent runs
  (`cron.job_run_details`), and both Vault secrets (`dispatch_event_emails_url`,
  `dispatch_event_emails_cron_secret`) — a missing secret makes the tick a logged no-op, which
  looks exactly like a healthy quiet run from the outside.
- **Both counters are floored at the P1256 deploy date, and that floor is load-bearing.**
  `runDispatch` filters `scheduled_at > now()`, so an overdue row is invisible to every
  future tick — fixing the cron does NOT drain the backlog. Feedback rows are recoverable
  with the backfill (`POST {"backfill_event_id":"<uuid>"}` with the CRON_SECRET); missed
  REMINDERS are deliberately never recoverable, since a "your event is tomorrow" email for
  a past event is worse than silence. Without the floor those permanently-unclaimable rows
  would hold this check in its own alarm state forever, which is how the second outage
  hides behind the first. If you ever raise the floor, say so here — an unexplained floor
  is indistinguishable from a check that was quietly muted.
- `stuck_pending_feedback > 0` → different failure: the cron IS running, but a send died
  between claiming the row and writing back the Mailgun id. Check the function logs and
  Mailgun. The dispatcher re-claims rows stuck past its own threshold, so a count that
  persists across two `/day` runs is a real fault, not a race.
- **A count that is non-zero and NOT FALLING across consecutive runs is the alarm**, whatever
  its cause — that is precisely the shape the 2026-06→09 outage had, and nothing reported it
  for three months because a never-sent email produces no error, no Sentry event and no failed
  row. Silence here was indistinguishable from health, which is why this check exists.

Cross-reference: user IDs in activity but NOT in new signups = **returning users**.

Assemble the Supabase summary (Wave 2b enriches this with Mixpanel narratives). Since P1399 it is
not printed: each person in it becomes one record of the people section (step `cp.people`, after
Wave 2c), and the founder reads them on the board:
```
USER INTELLIGENCE (since last /day)
  New:       N signups
    · Name (email) — HH:MM UTC
      [Mixpanel narrative — see Wave 2b Phase 3] [tag]
  Returning: N
    · Name — [narrative from Mixpanel drill] [tag]
  Funnel:    A → B → C → D  (+Δ/+Δ/+Δ/+Δ)
             signup  story  pos  agreement
```

Quiet period (no real users): `Quiet: no real user activity since last /day (founder/test excluded) | Funnel: A → B → C → D`

The daily CSV row was already appended earlier in this wave's bash script (`=== FUNNEL CSV ===` block) — no separate step needed here. If a previous entry exists, show deltas in the funnel line.

Sessions: the `cp.sessions` CHECK line carries it; a non-zero count is the `sessions:orphaned` finding — possible deadlocks, check Sentry for live_state errors.


**Record it** (the Sentry check is recorded first, above):
```bash
"$DAY_STEP" attest cp.w2s --evidence "how many Sentry issues since $SINCE, and the worst one"
```

#### Wave 2b: User Intelligence (Mixpanel MCP — after Wave 2)

Three-phase per-user intelligence. Enriches the Supabase data from Wave 2 with behavioral narratives.

**Pre-flight: connect before executing.** Before any Mixpanel tool call, run ToolSearch for `mcp__mixpanel__Run-Query` to confirm the MCP is live. If the tool is not found:

**Self-repair sequence (automatic — no user prompt needed until repair exhausted):**

0. **Config check FIRST — is the server even registered?** Clearing auth cannot fix a server that does not exist, and a missing entry produces the exact same "tools not found" symptom as stale auth:
   ```bash
   grep -q '"mixpanel"' .mcp.json && echo "configured" || echo "NOT-CONFIGURED"
   ```
   If `NOT-CONFIGURED`: **stop the repair sequence here** — do NOT clear auth, do NOT read logs (the newest log will show a healthy connection from whenever the entry last existed, which reads as a false all-clear). Skip all three phases with: `⚠ Mixpanel: NOT CONFIGURED — no "mixpanel" entry in .mcp.json. Narratives NOT available. → restore the entry, then /mcp reconnect` and move on.
   (This is the Jul-3→Jul-15 failure: the entry vanished from the gitignored `.mcp.json`, permissions and cached tokens survived, and 12 days of runs reported "unavailable" — pointing at auth, which was fine. Verified 2026-07-15.)
1. Read the newest MCP log to diagnose the failure:
   ```bash
   LOGDIR=~/Library/Caches/claude-cli-nodejs/$(git rev-parse --show-toplevel | sed 's#/#-#g')/mcp-logs-mixpanel
   LOG=$(ls -t "$LOGDIR"/*.jsonl 2>/dev/null | head -1)
   [ -n "$LOG" ] && grep -oE 'connection timed out|Server returned 40[0-9]|invalid_token' "$LOG" | head -3 || echo "no-log"
   ```
   (UNQUOTED substrings — the real log reads `MCP server "mixpanel" connection timed out after 30000ms` / `Server returned 403`; a quoted grep matches nothing. Verified 2026-07-03.)
2. **Stale-OAuth path** (log contains `connection timed out`, `Server returned 401/403`, or `invalid_token`): clear cached token automatically:
   ```bash
   rm -f ~/.mcp-auth/mcp-remote-*/3065cf*
   ```
   (The `3065cf…` hash is stable — derived from the Mixpanel server URL, not the token. Verified 2026-06-06.)
   Then re-run ToolSearch for `mcp__mixpanel__Run-Query`. If tools appear now, proceed — repair was silent.
   If tools still absent after clearing: skip all three phases with `⚠ Mixpanel MCP unavailable — user narratives skipped`, and report Mixpanel as `not-connected — auth was stale and cleared, the MCP did not reconnect` in the REPORT block; the board shows it with its Fix, `/mcp` → reconnect mixpanel. (You run in a subagent and cannot wait for the reconnect; P1328.)
3. **No log / different error**: skip with `⚠ Mixpanel MCP unavailable — user narratives skipped` — don't clear auth blindly.

**Always record exactly one explicit Mixpanel status** — a connection failure MUST read differently from a legitimately-idle day (the two look identical otherwise, which is the confusion this prevents). The lines below are its wording; since P1399 it is recorded, not printed — checked or self-healed is `ok`, the quiet day is `skipped`, not configured or unreachable is `not-run` (and a REPORT-block connection), and a magic-link gap is `problem` plus the finding `--check cp.mixpanel --fault-key mixpanel:magic-link-gap`:

```bash
"$DAY_STEP" check cp.mixpanel <ok|skipped|problem|not-run> --detail "4 users looked up" --step cp.w2b
```

- `✓ Mixpanel: checked (N users drilled)` — connected, real users narrated
- `✓ Mixpanel: not called — no real users this run (nothing to drill, not a failure)` — the quiet-day case; connection was never needed
- `✓ Mixpanel: self-healed (cleared stale OAuth), N drilled` — repair succeeded
- `⚠ Mixpanel: NOT CONFIGURED — no "mixpanel" entry in .mcp.json. Narratives NOT available. → restore the entry, then /mcp reconnect` — config gone; distinct from an auth failure, and NOT fixable by reconnecting
- `⚠ Mixpanel: SKIPPED — MCP unreachable after self-heal + reconnect. Narratives NOT available this run. → /mcp reconnect mixpanel` — genuinely failed; never silently omit

##### Phase 1: Classify users

Using the Wave 2 Supabase results already collected (no new queries):

1. Collect all unique user IDs + emails from Wave 2 results (signups `id`, stories `author_id`, positions `user_id`, verifications `speaker_id`/`listener_id`, agreements `creator_profile_id`/`partner_profile_id`)
2. Read `.private/docs/founder-accounts.md` — it contains the founder's Supabase UUIDs and test account emails. Use this to classify users without querying prod.
3. Classify each user:
   - UUID matches a founder UUID from `.private/docs/founder-accounts.md` → **founder** (skip)
   - Email matches a test/founder email from `.private/docs/founder-accounts.md` → **founder/test** (skip)
   - `test-agent@claritypledge.com` → **test** (skip, fallback if file missing)
   - Everything else → **real user** (proceed to Phase 2)
3. If 0 real users and 0 new signups: output `Quiet: no real user activity since last /day (founder/test excluded)` and skip Phase 2.

##### Phase 2: Drill (1 Mixpanel MCP call per real user)

For each real user, call `mcp__mixpanel__Run-Query` (project_id: `3968494`) with key journey events as separate metrics, all filtered by the user's distinct_id:

```json
{
  "report_type": "insights",
  "report": {
    "name": "Journey: <UserName>",
    "metrics": [
      { "eventName": "profile_created", "measurement": { "type": "basic", "math": "total" } },
      { "eventName": "login_complete", "measurement": { "type": "basic", "math": "total" } },
      { "eventName": "story_created", "measurement": { "type": "basic", "math": "total" } },
      { "eventName": "story_viewed", "measurement": { "type": "basic", "math": "total" } },
      { "eventName": "position_recorded", "measurement": { "type": "basic", "math": "total" } },
      { "eventName": "live_session_created", "measurement": { "type": "basic", "math": "total" } },
      { "eventName": "live_session_joined", "measurement": { "type": "basic", "math": "total" } },
      { "eventName": "live_session_completed", "measurement": { "type": "basic", "math": "total" } },
      { "eventName": "live_rating_submitted", "measurement": { "type": "basic", "math": "total" } },
      { "eventName": "profile_page_viewed", "measurement": { "type": "basic", "math": "total" } },
      { "eventName": "landing_page_viewed", "measurement": { "type": "basic", "math": "total" } },
      { "eventName": "agreement_create_success", "measurement": { "type": "basic", "math": "total" } }
    ],
    "chartType": "table",
    "dateRange": { "type": "absolute", "from": "<SINCE as YYYY-MM-DD>", "to": "<today YYYY-MM-DD>" },
    "filters": [{ "type": "string", "propertyName": "$distinct_id", "operator": "equals", "value": "<user-uuid>" }]
  }
}
```

This returns event counts for 12 key journey events for that specific user. Only events with count > 0 appear in results. Identity bridge: Supabase `profiles.id` (UUID) = Mixpanel `distinct_id` (verified in `src/auth/AuthCallbackPage.tsx:416`).

**Live-session positions fire `live_rating_submitted`, NOT `position_recorded`** — `position_recorded` only fires from story/doc detail pages (`story-detail-page.tsx`, `doc-detail-page.tsx`). A user whose positions all came through /live shows 0 `position_recorded`; that is correct, not a tracking gap (verified 2026-06-06).

**Empty drill ≠ inactive user.** If Supabase (Wave 2) shows activity but the Mixpanel drill returns zero events for that UUID, the user's client is likely blocking Mixpanel (ad/tracking blockers — common). Narrate as: "active in DB, no Mixpanel data — likely blocked client" — never tag `[bounced]` on Mixpanel absence when Supabase shows actions. Supabase is ground truth; Mixpanel undercounts.

**Also run the magic-link gap check** (in parallel with first user drill):
- `signup_magic_link_sent` total (last 24h) vs `profile_created` total (last 24h)
- If sends > 0 AND completions = 0: `⚠ MAGIC LINK GAP: N sent, 0 completed — check Brevo logs`
- Otherwise: silent.

**Scaling rules:**
- ≤10 real users → drill each user individually
- 11-20 → drill new signups only; returning users get aggregate summary ("N returning, M took positions")
- >20 → aggregate mode only + flag: "Consider state-transition alerts (t005 Phase 2)"

##### Phase 3: Narrate (LLM synthesis — no tool calls)

For each user with Mixpanel drill results, produce a per-user narrative using the **Event-to-Journey Mapping** (see reference section below).

**Narrative structure** (one block per user, max 3 sentences):
1. **WHO + WHEN:** "Kevin signed up via magic link at 14:32 UTC"
2. **WHAT they did:** using journey stage labels, not event names. "Created a story, took 2 positions, browsed the feed"
3. **WHERE they stopped + SO WHAT:** "Left after viewing the feed once — no content created, no /live session. [bounced]"

**User tags** (append to narrative):
- `[activated]` — completed a live session OR created story + took position
- `[exploring]` — signed up + page views or content views but no creation actions
- `[bounced]` — signed up + zero further meaningful events in the period
- `[engaged]` — returning user with new actions (positions, stories, sessions)
- Do NOT use "churned" — with <10 users and <7 days of data, "paused" is more honest

**Final output format** (the content each person's record carries — Step `cp.people` below; not printed):
```
USER INTELLIGENCE (since last /day)
  New: N signups
    · Kevin (kevin@example.com) — 14:32 UTC
      Signed up via magic link, viewed profile once, left.
      No content created, no /live session. [bounced]
    · Maria (maria@example.com) — 09:15 UTC
      Signed up via Google OAuth, completed a live session (3 checks).
      Reached activation — watch for return visit. [activated]
  Returning: N
    · Alex — took 4 new positions, viewed 2 stories. [engaged]
  Quiet: no real user activity (founder/test excluded).
  Funnel: 67 → 3 → 12 → 1 (+2/+0/+2/+0)
          signup  story  pos  agreement
  ⚠ MAGIC LINK GAP: 3 sent, 0 completed — check Brevo logs
```


**Record it:**
```bash
"$DAY_STEP" attest cp.w2b --evidence "what the Mixpanel queries returned — counts, not that you ran them"
```

#### Wave 2c: Signup Intel (WebSearch — after Wave 2, only if new real-user signups exist)

For each new real-user signup (non-founder, non-test, max 10), run one WebSearch:

```
"{Name} cofounder OR founder OR startup"
```

Synthesize into a single line per person:
- Role/context if findable: "UWaterloo robotics student, Tesla internships. Pre-company."
- If nothing surfaces: "No public record found."

The line becomes that person's `background` in the people section (Step `cp.people`):
```
  · [Signup A] — finance background, pivot to nonprofit/education. No startup record.
  · [Signup B] — engineering student, pre-company stage.
```

**Skip entirely** if: no new real-user signups, or WebSearch MCP unavailable.

---


**Record it:**
```bash
"$DAY_STEP" attest cp.w2c --evidence "what the search found about the new signups"
```
If Wave 2 found no new real-user signups this step does not apply — record that:

```bash
"$DAY_STEP" skip cp.w2c --reason "Wave 2 reported no new real-user signups this window"
```

#### People — recorded for the day report (P1399)

The board's people list is the USER INTELLIGENCE block as data: one record per **real** person who
signed up or came back since `$SINCE`. Never the founder's, test or agent accounts — Phase 1's
classification against `.private/docs/founder-accounts.md`, plus any name starting `Agent · ` or
slug starting `agent-` (the reserved machine namespaces). One block per person, fields one per line,
a blank line between people; leave out any field you do not actually have — never guess one. An
empty list (`[]`) is recorded too: a quiet day is a fact, and an absent section would read "not
collected".

- `id` — the profile id · `name` · `joined_at` — `created_at` from SIGNUPS (new people only)
- `source` — `Event: <first_event>` when SIGNUPS returned one, else leave it out
- `confirmed` — `yes` / `no` from SIGNUPS
- `did` / `stopped_at` — Phase 3's narrative, one line each · `returning` — `yes` for a returning user
- `linkedin_url` · `background` — Wave 2c's line

```bash
"$DAY_STEP" run cp.people <<'STEP'
python3 -c '
import json, re, sys
people, cur, seen = [], {}, set()
def flush():
    global cur
    if cur.get("id") and cur.get("name") and cur["id"] not in seen:
        seen.add(cur["id"])
        people.append(cur)
    elif cur:
        sys.exit("a person block needs an id and a name, once each")
    cur = {}
for line in sys.stdin.read().splitlines():
    if not line.strip():
        flush()
        continue
    k, sep, v = line.partition(":")
    k, v = k.strip(), v.strip()
    if not sep or not v or v.startswith("<"):
        continue
    if k in ("confirmed", "returning"):
        cur[k] = v.lower() in ("yes", "true")
    elif k in ("id", "name", "joined_at", "source", "did", "stopped_at", "linkedin_url", "background"):
        cur[k] = v
flush()
for p in people:
    if not re.fullmatch(r"[A-Za-z0-9._:-]{1,80}", p["id"]):
        sys.exit("not a profile id: " + p["id"][:20])
    if p.get("returning") is False:
        del p["returning"]
json.dump(people, sys.stdout)
' <<'PEOPLE' | "$DAY_STEP" data people
<one block per person, as above; nothing at all when nobody real signed up or came back>
PEOPLE
STEP
```

The step fails, visibly, if a block has no id or name or the runner refuses the section. The
runner records a step once, so fix the block and send the same pipeline again *without* the `run`
wrapper (`… | "$DAY_STEP" data people`) rather than leave the board without people. Count them for
the REPORT block.

#### Wave 3: Repo health + file reads (2-3 calls, after processing Wave 1-2)

**a) Repo health** (1 bash call):
```bash
"$DAY_STEP" run cp.w3 <<'STEP'
cd "$(git rev-parse --show-toplevel)"
echo "=== LINT ==="
LINT_OUT="$(npm run lint 2>&1)"; LINT_RC=$?
LINT_N="$(printf '%s\n' "$LINT_OUT" | grep -c "error")"
echo "$LINT_N"
echo "=== TEST ==="
TEST_OUT="$(npm test -- --run 2>&1)"; TEST_RC=$?
printf '%s\n' "$TEST_OUT" | tail -5
TESTS_PASSED="$(printf '%s\n' "$TEST_OUT" | sed -n 's/^ *Tests  *\([0-9][0-9]*\) passed.*/\1/p' | tail -1)"
if [ "$LINT_RC" -eq 0 ] && [ "$TEST_RC" -eq 0 ]; then echo "CHECK cp.baseline ok ${TESTS_PASSED:-all} tests pass, lint clean" | tee -a "${DAY_CHECK_FILE:-/dev/null}"
else echo "CHECK cp.baseline problem lint exit $LINT_RC with $LINT_N error lines, tests exit $TEST_RC" | tee -a "${DAY_CHECK_FILE:-/dev/null}"; fi
echo "=== OPS ISSUES ==="
OPS_OUT="$(gh issue list --state open --limit 50 2>&1)"; OPS_RC=$?
printf '%s\n' "$OPS_OUT"
if [ "$OPS_RC" -ne 0 ]; then echo "OPS-ISSUES-CHECK-FAILED (exit $OPS_RC)"; echo "CHECK cp.ops not-run the GitHub issue list could not be read (exit $OPS_RC)" | tee -a "${DAY_CHECK_FILE:-/dev/null}"
else
  # Every open issue in this repo is a scheduled gate's alert (P866 find-or-append pattern).
  OPS_N="$(printf '%s\n' "$OPS_OUT" | grep -c .)"
  if [ "$OPS_N" -eq 0 ]; then echo "CHECK cp.ops ok no open alert issues on GitHub" | tee -a "${DAY_CHECK_FILE:-/dev/null}"
  else echo "CHECK cp.ops problem $OPS_N open alert issues on GitHub" | tee -a "${DAY_CHECK_FILE:-/dev/null}"; fi
fi
echo "=== RLS DRIFT ==="
# Pin to the MAIN checkout, same reason as the funnel CSV below: the baseline lives
# under .private/ (gitignored, so absent in worktrees), and a worktree on an older
# branch may not have the script at all. Resolving from --git-common-dir works
# identically whether /day is run from w0 or a worktree.
RLS_MAIN_ROOT="$(dirname "$(git rev-parse --path-format=absolute --git-common-dir)")"
python3 "$RLS_MAIN_ROOT/scripts/rls-drift-check.py" --summary 2>&1
RLS_RC=$?
# This used to end `|| true`, which threw away a deliberately three-way signal:
# 0 clean, 1 NEW drift (the alarm), 2 "The check did NOT run. This is not a clean
# result." — the script's own words, on three separate paths. With the code discarded,
# "did not run" and "ran clean" were indistinguishable in the output, which is the
# same class of bug ~/.claude/scripts/day-gates.sh exists to close, sitting on live
# security signal. (That script moved out of this public repo 2026-08-28, pp p48.)
# Printing the code unconditionally means the agent cannot infer clean from silence.
if [ "$RLS_RC" -ge 2 ]; then
  echo "RLS-DRIFT-CHECK-DID-NOT-RUN (exit $RLS_RC) — do NOT report clean"
fi
echo "rls_drift_exit=$RLS_RC"
case "$RLS_RC" in
  0) echo "CHECK cp.rls ok no policy outside the recorded baseline" | tee -a "${DAY_CHECK_FILE:-/dev/null}" ;;
  1) echo "CHECK cp.rls problem new policies on a live database, not in the baseline" | tee -a "${DAY_CHECK_FILE:-/dev/null}" ;;
  *) echo "CHECK cp.rls not-run the RLS drift check did not run (exit $RLS_RC)" | tee -a "${DAY_CHECK_FILE:-/dev/null}" ;;
esac
echo "=== FUNCTION GRANT DRIFT ==="
# Same main-checkout pinning and same three-way exit contract as the RLS check
# above. Separate script because it reads a different catalog (EXECUTE grants on
# pg_proc, not pg_policies) — the RLS check is blind to the entire P1063 class.
FGD_OUT="$(python3 "$RLS_MAIN_ROOT/scripts/function-grant-drift-check.py" --summary 2>&1)"
FGD_RC=$?
printf '%s\n' "$FGD_OUT"
if [ "$FGD_RC" -ge 2 ]; then
  echo "FUNCTION-GRANT-CHECK-DID-NOT-RUN (exit $FGD_RC) — do NOT report clean"
fi
echo "function_grant_exit=$FGD_RC"
if [ "$FGD_RC" -ge 2 ]; then echo "CHECK cp.grants not-run the function grant check did not run (exit $FGD_RC)" | tee -a "${DAY_CHECK_FILE:-/dev/null}"
elif [ "$FGD_RC" -eq 1 ]; then echo "CHECK cp.grants problem a function became callable without sign-in, or the databases disagree" | tee -a "${DAY_CHECK_FILE:-/dev/null}"
elif printf '%s\n' "$FGD_OUT" | grep -q 'BLIND'; then echo "CHECK cp.grants unproven grants match, but the guard probe could not run" | tee -a "${DAY_CHECK_FILE:-/dev/null}"
else echo "CHECK cp.grants ok no function grant outside the recorded baseline" | tee -a "${DAY_CHECK_FILE:-/dev/null}"; fi
echo "=== PRIVILEGE FLOOR (P1207) ==="
# Third catalog, third blind spot closed. The RLS check reads pg_policies and the function-grant
# check reads EXECUTE on pg_proc; NEITHER reads table/column privileges or pg_default_acl, so
# both were structurally blind to P1207's F6 — anon and authenticated holding TRUNCATE on 50
# prod tables, a privilege RLS does not govern at all.
# Same main-checkout pinning and the same three-way exit contract as the two checks above.
# Runs against prod here: test is fixed by migration, prod only after a ship.
python3 "$RLS_MAIN_ROOT/scripts/check-p1207-privilege-floor.py" prod 2>&1
PF_RC=$?
if [ "$PF_RC" -ge 2 ]; then
  echo "PRIVILEGE-FLOOR-CHECK-DID-NOT-RUN (exit $PF_RC) — do NOT report clean"
fi
echo "privilege_floor_exit=$PF_RC"
# Offline control pass. Costs nothing and answers the question the live run cannot: is the
# detector still able to TELL the difference? An adversarial review defeated the first version
# of this detector with `true AND true`, so a green live run is not evidence the check works.
python3 "$RLS_MAIN_ROOT/scripts/check-p1207-privilege-floor.py" --self-test 2>&1
PF_SELFTEST_RC=$?
echo "privilege_floor_selftest_exit=$PF_SELFTEST_RC"
if [ "$PF_RC" -ge 2 ]; then echo "CHECK cp.floor not-run the privilege floor check did not run (exit $PF_RC)" | tee -a "${DAY_CHECK_FILE:-/dev/null}"
elif [ "$PF_SELFTEST_RC" -ne 0 ]; then echo "CHECK cp.floor unproven the detector failed its self-test, so its verdict proves nothing" | tee -a "${DAY_CHECK_FILE:-/dev/null}"
elif [ "$PF_RC" -eq 1 ]; then echo "CHECK cp.floor problem a banned privilege is back on prod" | tee -a "${DAY_CHECK_FILE:-/dev/null}"
else echo "CHECK cp.floor ok no banned privilege on prod" | tee -a "${DAY_CHECK_FILE:-/dev/null}"; fi
# The wave's exit is the step's; every finding above is a CHECK line, never a failed step.
exit 0
STEP
```
Each check above has printed its status (`cp.baseline`, `cp.ops`, `cp.rls`, `cp.grants`, `cp.floor`).
Since P1399 the reading rules below decide **findings**, not printed lines — where one says *report*,
*surface* or *flag*, record:

| fault | `--check` | `--fault-key` |
|---|---|---|
| lint errors / failing tests | cp.baseline | `baseline:lint-errors`, `baseline:tests-failing` — "fix before starting new work" is its Point B |
| an open ops alert issue | cp.ops | `ops:issue-<number>` — the issue's title and its fix command; `--first-seen` = the issue's creation date |
| NEW RLS drift | cp.rls | `rls:new-policies` (severity high; the named table and policy in the body) |
| NEW function grant drift / guards not refusing anon | cp.grants | `grants:new-anon-execute`, `grants:guard-not-refusing` |
| a privilege-floor violation / a failed self-test | cp.floor | `floor:violations`, `floor:selftest-failed` |

Known-open backlog counts stay what they were — **not** findings, and not re-litigated daily. Every
security finding stays `--store private` (it names live, unpatched objects).

**RLS drift** (`=== RLS DRIFT ===`, P1048): read-only three-way diff of live prod vs live test vs migration files. This is the check that would have caught P1046, where four permissive policies sat live on prod — one of them an unauthenticated read of private data — invisible to every file-based audit in the repo. It runs here rather than in CI because it needs both projects' credentials and they already exist locally; putting a full-account Supabase token into GitHub Actions to buy a daily email was judged the wrong trade (P1048).

Read the one line it prints:

- `RLS drift: clean` — nothing unallowlisted. Report `✓ RLS drift: clean`.
- `RLS drift: N known-open` — the recorded backlog, unchanged. Report `✓ RLS drift: N known-open (no change)`. **Do not re-litigate these daily** — they are tracked in `.private/docs/security-log.md` and each needs its own spec. Mentioning them every morning is how this signal gets tuned out.
- `RLS DRIFT: N NEW ...` (capitalised) — **a policy has appeared on a live database that was not there when the backlog was recorded.** This is the alarm. Surface the named table/policy prominently, treat it as potential live exposure, and offer to investigate now. An out-of-band policy means someone or something wrote directly to a live database outside the migration path.
- `N resolved since baseline` — findings that are now gone. Offer `python3 scripts/rls-drift-check.py --update-baseline` to re-record.

**Privilege floor** (`=== PRIVILEGE FLOOR (P1207) ===`): the third catalog. The RLS check reads `pg_policies`; the function-grant check reads EXECUTE on `pg_proc`. Neither reads **table/column privileges or `pg_default_acl`**, so both were structurally blind to P1207's F6 — `anon` and `authenticated` holding `TRUNCATE` on 50 production tables, a privilege **row-level security does not govern at all**. Read two lines:

- `ok (prod/…)` with `privilege_floor_exit=0` — the floor holds. Report `✓ Privilege floor: clean`.
- `FAIL (prod/…): N privilege-floor violation(s)` — a banned privilege is back, or a write policy stopped consulting caller identity. Surface it like a NEW RLS drift: it means a `GRANT` or a policy landed outside the migration path.
- `note:` lines about a `supabase_admin`-owned default ACL are **expected and not actionable** — that entry is outside this repo's control and is printed rather than hidden so it cannot be mistaken for coverage. Do not re-litigate it daily.
- `privilege_floor_selftest_exit=0` — the detector still discriminates (11 known-bad predicates flagged, 4 known-good passed). **A non-zero self-test means the live green above is worthless**, whatever it said: an adversarial review defeated the first version of this detector with `true AND true`, and a passing live run looked identical before and after. Treat a self-test failure as louder than a live failure.
- `RLS-DRIFT-CHECK-DID-NOT-RUN (exit N)` — the check **did not run** (missing credentials, API error, malformed allowlist, unreadable baseline). Flag `⚠ RLS drift: NOT checked this run` and never render it as clean. Exit 2 is deliberately distinct from exit 1 for exactly this reason.

**Read `rls_drift_exit=N`, which is always printed — do not infer the outcome from the prose alone.** `0` clean · `1` NEW drift, treat as the alarm above · `2` did not run. If that line is absent from the output entirely, the wave did not complete and the RLS check is unverified — say so rather than omitting the row.

The backlog file is `.private/rls-drift-baseline.json` — gitignored, because it names live unpatched policies. If it is missing the check reports every finding as NEW, which is noisy but never silently quiet. **The baseline is not an allowlist**: baselined findings are still printed in the full report (`python3 scripts/rls-drift-check.py` with no flags), they are just not re-alarmed. Only `scripts/rls-drift-allowlist.txt` marks a divergence as permanently expected, and every entry there needs a reason and a date.

**Function grant drift** (`=== FUNCTION GRANT DRIFT ===`, P1065): the RLS check above reads **policies** and is structurally blind to who may EXECUTE a function. That blindness is why P1063 — four RPCs reachable by unauthenticated callers on prod, each carrying a lockdown in its own migration that had never taken effect — was found by accident rather than by a gate. This check reads live EXECUTE privileges on both projects and diffs them against `scripts/anon-execute-allowlist.txt` (P1064).

Read the line it prints:

- `Function grants: clean` — report `✓ Function grants: clean`.
- `Function grants: N known-open` — the recorded backlog, unchanged. Report `✓ Function grants: N known-open (no change)`. **Do not re-litigate these daily** — they are in `.private/docs/security-log.md` and each needs its own spec.
- `FUNCTION GRANT DRIFT: N NEW ...` (capitalised) — **a function became reachable by an anonymous caller, or prod and test stopped agreeing on who may execute one.** This is the alarm. Surface the named signatures and offer to investigate now.
- `M guard(s) did not refuse anon` — functions that, invoked with no identity on test, returned instead of refusing. **This appears alongside exit 0 by design** and is the highest-signal half of the output: a finding only exists in the conjunction of a live anon grant and a non-refusing guard. Report the count. It is report-only because the probe passes NULL arguments and under-reports — never treat its silence as proof a guard is correct.
- `guard probe BLIND (not run)` — the probe could not tell refusal from success, so the guard half is **unverified**, not clean. Say so.
- `FUNCTION-GRANT-CHECK-DID-NOT-RUN (exit N)` — flag `⚠ Function grants: NOT checked this run` and never render it as clean.

**Read `function_grant_exit=N`, always printed** — `0` clean or backlog-unchanged · `1` NEW drift, the alarm · `2` did not run. Absent line = the wave did not complete; say the check is unverified rather than omitting the row. Note that `0` does NOT mean the guard probe found nothing — read the prose for that.

The backlog is `.private/function-grant-baseline.json` (gitignored — it names live unpatched functions). Not an allowlist: baselined findings still print on every full run. Only `scripts/anon-execute-allowlist.txt` marks an anon grant as deliberate, and every entry there needs a real anon call site as `file:line`.

**Ops issues** (`=== OPS ISSUES ===`): scheduled workflows alert via find-or-append GitHub issues instead of failure emails (P866 pattern — prod-health-smoke, check-deploy-drift, backup-staleness). An open "Deploy drift detected on prod" issue means a merged migration/function is not deployed — surface it with the fix command from the issue body and offer to resolve now (prod migrate = ALWAYS-ASK). An open "Prod health smoke" issue means a public route is erroring. An open "Backup stale or unverified" issue means the newest prod DB backup has no `.verified` marker or is >25h old — likely the daily backup workflow stopped running or was disabled; check `db-backup.yml`'s run history, surface the object name from the issue body, do NOT attempt a manual backup or restore inline (ALWAYS-ASK). No relevant open issue = healthy as of the last cron run (drift: daily 6am UTC; prod-health: 6-hourly; backup-staleness: daily 6:15am UTC). `OPS-ISSUES-CHECK-FAILED` or any gh stderr (rate limit, auth) = flag ⚠, don't report healthy, don't silently skip.

**b) Read goals** (1 Read call):
- `docs/goals.md`

**c) Video summaries — auto-heal** (1 bash call, P1373). Every public prod story video must have a
summary (founder, 2026-09-29; anon reads cannot see shared-link or author-only stories). This drafts and checks the missing ones on test (Gemini writes, Codex checks,
≤3 revise rounds, 5 per run) and never confirms or publishes — that needs the founder's yes:

```bash
"$DAY_STEP" run cp.vsum <<'STEP'
cd "$(git rev-parse --show-toplevel)"
VS_OUT="$(node scripts/video-summary.mjs heal 5 2>&1)"; rc=$?
printf '%s\n' "$VS_OUT"
[ $rc -ne 0 ] && echo "VIDEO-SUMMARY-HEAL-FAILED (exit $rc)"
VS_READY="$(printf '%s\n' "$VS_OUT" | sed -n 's/^READY FOR YOUR YES (\([0-9]*\)).*/\1/p' | tail -1)"
VS_FAILED="$(printf '%s\n' "$VS_OUT" | sed -n 's/^FAILED (\([0-9]*\)).*/\1/p' | tail -1)"
case "$rc" in
  0) echo "CHECK cp.video ok summary heal ran, ${VS_READY:-0} summaries wait for your yes" | tee -a "${DAY_CHECK_FILE:-/dev/null}" ;;
  1) echo "CHECK cp.video problem ${VS_FAILED:-some} video summaries failed to draft or check" | tee -a "${DAY_CHECK_FILE:-/dev/null}" ;;
  *) echo "CHECK cp.video not-run the summary heal could not run (exit $rc)" | tee -a "${DAY_CHECK_FILE:-/dev/null}" ;;
esac
exit $rc
STEP
```

The counts are in the `cp.video` CHECK line. `READY FOR YOUR YES` (one or more) is a question only the
founder can answer — record it as a finding, not a mid-run question: `--check cp.video --fault-key
video:ready-for-yes --severity medium --title "Video summaries are written and checked, waiting for
your yes" --option read="Read them on localhost first (feed, Read video summary)" --option
publish="Publish them" --recommend read --confidence 80`, the ids and titles in the body. Never
recommend `publish`: publishing is his call after reading, never a preselected default.
**This step stops at the question — it never confirms or promotes.** On the yes, in the
main session: `confirm <id> --approved-in-chat` for each, then one
`promote <ids…>`. `FAILED` rows and `VIDEO-SUMMARY-HEAL-FAILED` (the step exits non-zero) are findings
(`--fault-key video:heal-failed`) — never render them as clean. `COOLING DOWN` rows failed within 7 days and are not retried until then; list them.

#### Every check reported — and the REPORT block for the dispatcher (P1399)

Until P1399 this sub-day returned HEALTH rows for the dispatcher to print. The rule those rows
carried still holds — a skipped check must read differently from a clean one, and a check is
**never omitted**, because an absent row is indistinguishable from a healthy one — but the
mechanism moved: every check in `scripts/day-cp-checks.tsv` now has a status of its own, and a
registered check nobody reported reads "not proven" on the board.

Before moving on, walk that registry once. Every check should have written or recorded a status
(the Sentry and Mixpanel ones are yours to record); every `problem` should have a finding with a
fault key; Sentry's `not-run` and Mixpanel's `not called (no users)` stay distinct (`not-run` vs
`skipped`). The GCP credits, AI keys and Agent VM checks are **not** yours — they are personal and
the dispatcher records them.

```bash
"$DAY_STEP" attest cp.health --evidence "N of 17 checks reported a status; M problems, each with a finding; not reported: ..."
```

End your reply with this block — the dispatcher reads it and records it (its Step 9d); nothing in
it is printed for the founder. Leave a line out rather than guess it:

```
REPORT FOR THE DISPATCHER
  sentry: <ok|not-connected|failed> — <why, when not ok>
  mixpanel: <ok|not-connected|failed> — <why, when not ok>
  gcloud: <ok|not-connected> — <not-connected when Wave 1 printed GCLOUD_NOT_AUTHENTICATED>
  reviews: <weekly|monthly|none — the review Step 5 ran inside this pass>
  unpushed_commits: <N, from Wave 1's unpushed_commits= line>
  unconfirmed_signups: <N, from Wave 2's unconfirmed_signups= line>
  funnel_signups: <N> (<+change since funnel_previous_row, when it is a row>)
  funnel_story_authors: <N> (<+change>)
  funnel_position_users: <N> (<+change>)
  funnel_agreements: <N> (<+change>)
  people: <N recorded>
```

The four funnel lines come from Wave 2's `funnel_today=` (signups, story authors, position users,
agreements, in that order) and the change from `funnel_previous_row=` (its columns 2–5); a `?` or
`none` leaves the change, or the line, out.

---

### 2. Reflection (since last /day)

This section looks backward at what happened since `$SINCE`. Gather data, then synthesize.

**2a. Gather**

Use the git log, activity log, KDD check, and CLAUDE.md change data already collected in Wave 1 (no additional tool calls needed).
If CLAUDE.md/rules were changed (per Wave 1 output), spawn a single `/slava:maintain:claude-md` subagent (`model: "sonnet"`). Get: VALID / NEEDS REVISION + recommendation.
**Delivery:** a background subagent's reply is silently lost, and a lost verdict here reads as
VALID. Have it **Write** the verdict + recommendation to a parent-supplied scratchpad path and also
reply; read the **file**. No file ⟹ the check did not run — report that, never a pass.

**2b. KDD reminder check**

Scan git log since `$SINCE` for commits touching:
- `supabase/migrations/`
- `.env.local`, `.env.prod`, `.env*`
- `.mcp.json`, `mcp-*.json`
- `.claude/rules/`, `CLAUDE.md`
- `scripts/` (new or significant rewrites)
- `docs/technical/`

If infra-touching commits exist AND no KDD capture since last run → include KDD REMINDER in output,
and record it as a finding so it reaches the board as agent work: `--check cp.reflect --fault-key
kdd:uncaptured --severity low --title "Infra changes since the last run have no KDD capture"`. A
`NEEDS REVISION` verdict from the CLAUDE.md gate is the same: `--fault-key claude-md:needs-revision`.

**2c. Synthesize and output** — the output is the first part of your reply to the dispatcher, whose
reflection writer turns it into the board's statements (P1399). It is not printed for the founder.

**Language rules (critical):**
- Translate into user value and business impact. Never use ticket numbers (P413), engineering terms (RLS, schema, migration, e2e), or internal jargon.
- "P413 closed" → "users can now see how calibrated their communication is"
- "RLS locked down" → "your data is private"
- If something shipped with no user-facing impact: describe what it enables or protects.

Output — bullet-driven, tight, no padding:
```
SINCE LAST /day ([N hours ago] · [N commits])
• [what users can do now — one line each]
• [designs, plans count as real work]
• [infra/reliability: what it protects]

BUSINESS  (skip if nothing moved)
• [progress toward pilot / milestone gate]

INSIGHT  (skip if nothing real)
• [one thing learned about users, product, or yourself]

CHALLENGE  (skip if nothing real)
• [real obstacle — what it revealed]

ATTENTION  (skip if <2 status checks or nothing notable)
• [attention shifts, persistent blockers]

AGENT CONFIG  (skip if CLAUDE.md/rules unchanged)
• [what changed — plain English]
• /slava:maintain:claude-md verdict: VALID ✅ / NEEDS REVISION ⚠️

METRICS  (skip if no signups and no sentry issues)
• [N new signups since last /day]
• [N new Sentry issues since last /day]

KDD REMINDER  (skip if no uncaptured infra work)
• [what was touched]
• Run `/kdd` to capture before context is lost.

TOMORROW
→ [one clear next move + why it matters now]
```

If git log is empty: "No commits since last /day." Reflect on non-code work from KDD/milestone reads.

---

**Record it:**
```bash
"$DAY_STEP" attest cp.reflect --evidence "what the reflection covered since $SINCE"
```

### 3. Goals & Milestone

**Primary source: `docs/goals.md`**

1. Read `docs/goals.md`
2. **Auto-crossout**: For each `[ ] P<N>` in Next Steps, check if the spec is done:
   - File exists in `features/done/` (any subfolder): mark `[x]`
   - File exists in `features/` with `status: done` or `status: all-done`: mark `[x]`
   - File exists in `features/archive/` with `status: rejected`: mark `[x]` and append `(rejected)`
   If any items were crossed out, edit `docs/goals.md` silently (no confirmation needed).
3. Parse `## Next Steps` — identify `[ ]` (not done) vs `[x]` (done)
4. Show max 5 upcoming (not done). Never show done items.
5. Parse `## Dos` and `## Don'ts` — compact reminders.
6. **If none of `## Next Steps`, `## Dos`, `## Don'ts` exist in the file, do NOT print an empty WHAT'S NEXT block.** Print instead:
   `WHAT'S NEXT: unavailable — docs/goals.md has no Next Steps/Dos/Don'ts sections (found: <list the ## headings that ARE there>). The parser and the doc have drifted.`
   An empty block reads as "nothing queued"; the two states must not look alike. Record it too:
   `--check cp.goals --fault-key goals:unparseable --severity low`. Same signal the kanban Goals page returns as `structureNotFound` (`tools/kanban/server/api.ts`, `/api/goals-strategic`).

```
WHAT'S NEXT (from goals.md):
  → [step N] [text]       ← immediate next
  ○ [step N+1] [text]
  ○ [step N+2] [text]

DO: [comma-separated one-liners]
DON'T: [comma-separated one-liners]
```

---

**Record it:**
```bash
"$DAY_STEP" attest cp.goals --evidence "the milestone state and what moved"
```

### 4. Branch Status

Use the branch, stranded spec, and stash data already collected in Wave 1 (no additional tool calls).

Output:
```
BRANCHES
  main: [N commits ahead / clean and in sync]
  feature/pN-name  ← [ready to /ship? / in-progress / no spec — stale?]
```

Rules: `status: qa` → "ready to /ship?" (branch or not — since P1169 `/ship` closes direct-to-main
specs too). `in-progress` → "in-progress". `done`/`all-done` still in `features/` → "run
/slava:maintain:fix-kanban". Unfinished ship journal → print its `--resume` line verbatim. No spec →
"stale?"

**Report the `qa` age.** A spec that has been *built, waiting for you* for a week is the signal;
that it exists is not. Sort oldest first.

**4c. Stash check:**
```bash
"$DAY_STEP" run cp.branch <<'STEP'
git stash list
STEP
```
If non-empty, print all entries (max 10; if more, note "N more — run `git stash list` to see all"):
```
⚠ STASHES (invisible to git status — address before starting work):
  · stash@{0}: [message]
```
Note: stash message includes the branch it was created on — apply only if you are on that branch.

The question "Apply, drop, or continue?" is the founder's, so it is a finding with options (you run in
a subagent and cannot wait, and since P1399 there is no question heading): `--check cp.branch
--fault-key stash:present --severity low --title "Stashed changes are waiting" --option apply="Apply
them on their branch" --option drop="Drop them" --option keep="Keep them for now" --recommend keep
--confidence 50`, the stash list in the body.

---
### 5. Due Board — act on the dispatcher's verdict

**You do not read the markers.** `~/.claude_weekly_last_run` and
`~/.claude_monthly_last_run` are personal state and belong to the dispatcher (pp p48);
this sub-day reads no home-directory state. (Scoped deliberately: `/slava:maintain:weekly`
and `/slava:maintain:monthly` in this same public repo still read *and write* their own
`~/.claude_*_last_run` markers. That is a known inconsistency with p48's marker-ownership
rule, not an oversight here — see pp `tasks/p48` "Done when". Do not read this line as a
claim about the whole repo; it was written as one on 2026-08-28 and was false.)
The dispatcher passes
`$DUE_VERDICT` — zero or more rows in this shape:

```
DUE BOARD
  weekly    — last done Apr 11 (52d ago)  OVERDUE (>7d)   → running now
  monthly   — last done Mar 30 (64d ago)  OVERDUE (>28d)  → next /day run
```

Empty verdict → nothing to do. Otherwise (the rows are no longer printed — P1399; the board shows
the review's issues and its badge instead):

1. **Max one review per run.** If both are OVERDUE, run the one with more days past its
   threshold and name the other: "monthly is also overdue — it'll run on the next /day."
2. **Announce, then invoke** — no y/n gate:
   > weekly is Nd overdue — running it now.
   (The dispatcher announced this before spawning you, which is the only point where the founder
   could still interrupt it — a "skip" cannot reach you inside the subagent. P1328.)
   Then immediately invoke `/slava:maintain:weekly` or `/slava:maintain:monthly` here, in this
   sub-day's subagent (its own subagent fan-out works from here). These are cp skills, which is why the *acting* half lives here while the
   *marker* half lives in the dispatcher.
3. **Skip is conversational, and belongs to the dispatcher's conversation.** You cannot hear a
   "skip" from inside the subagent; the founder stops the pass there. If the founder says "skip", stop. Markers are written only
   on review completion (by the review skill itself), so a skipped run stays overdue and
   resurfaces on the next `/day`.
4. **Never-run rows are not auto-run** — the dispatcher marks those `never run`; offer only, as a
   finding (`--check cp.due --fault-key due:<weekly|monthly>-never-run --option run="Run it on the
   next /day" --option later="Not now" --recommend run`).
5. **Inside `/day` the review asks nothing (P1399).** Both skills check for `$DAY_STEP`: when it is
   set, `/slava:maintain:monthly` records each proposed change, and `/slava:maintain:weekly` each
   process-debt close offer, as a finding with options tagged `--review monthly|weekly`, and the
   founder answers on the board. Name the review that ran in the REPORT block's `reviews:` line —
   the dispatcher records it, so the board shows the run's review badge — and put the review's
   ACTIONS and pattern lines (or its programme-health verdict) at the end of your reflection
   block: they are the reflection writer's input.

Reviews are auto-run rather than printed as commands because printed commands never got
copy-pasted and the reviews simply did not happen (P900).

---


**Record it:**
```bash
"$DAY_STEP" attest cp.due --evidence "the Due Board verdict and what was done about it"
```

### 6. Notes — what used to be printed, kept for the board (P1399)

Some of this sub-day's output is not a check, a finding or a person, and when the terminal stopped
printing it, it reached nobody. It is recorded as notes, which the board shows one step away — plain
text, at most 4000 characters each (longer is cut), one note per heading below, and only the ones
this pass has content for:

| id | title | content |
|---|---|---|
| `shipped` | Shipped since the last run | Step 2c's SINCE LAST /day, BUSINESS, INSIGHT and CHALLENGE lines, in user-value words |
| `whats-next` | What's next | Step 3's WHAT'S NEXT (or its "unavailable" line), DO and DON'T |
| `branches` | Branches and specs | Step 4's BRANCHES block and the stranded-spec list from Wave 1 |
| `cloud-spend` | Cloud spend estimate | Wave 1's `EST_PER_DAY` / `EST_SINCE_LAST` line, as "about €X a day, €Y since the last run (an estimate from running resources, not billed)" |
| `weekly-review` | Weekly review | the review's measurements: Metrics, product pulse, user health, SEO pulse, GCP spend, Evidence Signals (review `weekly`) |
| `monthly-review` | Monthly review | the synthesis' measurements and the programme-health verdict (review `monthly`) |

A header line `@@ <id> [weekly|monthly] :: <title>` starts each note; every line after it, up to the
next header, is its body.

```bash
"$DAY_STEP" run cp.notes <<'STEP'
python3 -c '
import json, re, sys
IDS = ("shipped", "whats-next", "branches", "cloud-spend", "weekly-review", "monthly-review")
notes, cur = [], None
for line in sys.stdin.read().splitlines():
    m = re.match(r"^@@ ([a-z-]+)(?: (weekly|monthly))? :: (.+)$", line)
    if m:
        if m.group(1) not in IDS:
            sys.exit("not a note id: " + m.group(1))
        cur = {"id": m.group(1), "title": m.group(3).strip(), "lines": []}
        if m.group(2):
            cur["review"] = m.group(2)
        notes.append(cur)
    elif cur is not None:
        cur["lines"].append(line)
out = []
for n in notes:
    body = "\n".join(n.pop("lines")).strip()
    if not body or body.startswith("<"):
        continue
    n["body"] = body if len(body) <= 4000 else body[:3990] + "\n(cut)"
    out.append(n)
if len({n["id"] for n in out}) != len(out):
    sys.exit("a note id appears twice")
json.dump(out, sys.stdout)
' <<'NOTES' | "$DAY_STEP" data notes
@@ shipped :: Shipped since the last run
<lines>
@@ whats-next :: What's next
<lines>
@@ branches :: Branches and specs
<lines>
@@ cloud-spend :: Cloud spend estimate
<line>
NOTES
STEP
```

Add the `@@ weekly-review weekly :: Weekly review` or `@@ monthly-review monthly :: Monthly review`
note when Step 5 ran one. The dispatcher adds its own notes to the same section later (it merges by
id), so record this one even when the pass goes on to fail.

## Event-to-Journey Mapping (Wave 2b reference)

Used by Phase 3 (Narrate) to translate Mixpanel event names into journey stages.

| Stage | Events | Narrative label |
|-------|--------|----------------|
| ARRIVAL | `landing_page_viewed`, `signup_page_viewed`, `about_page_viewed`, `sign_pledge_page_viewed` | "visited site" |
| SIGNUP | `signup_magic_link_sent`, `google_auth_initiated`, `profile_created`, `login_complete` | "signed up via [method]" / "logged in" |
| ONBOARDING | `profile_page_viewed` (own), `settings_page_viewed`, `welcome_dialog_shown` | "viewed profile" |
| CONTENT | `story_created`, `story_viewed`, `point_created`, `position_recorded`, `feed_tag_filtered` | "created story" / "took N positions" / "browsed feed" |
| LIVE | `live_session_created`, `live_session_joined`, `live_rating_submitted`, `live_session_completed` | "started /live session" / "completed session (N checks)" |
| SOCIAL | `agreement_create_success`, `share_link_copied`, `share_linkedin_clicked`, `witness_submitted` | "signed agreement" / "shared profile" |

**Skip in narrative** (noise events): `nav_*`, `pwa_*`, `live_state_drift_detected`, `audio_chunk_*`, `$mp_*` (Mixpanel autocapture), `$session_start`, `$session_end`

**Auth method detection** (from `profile_created` properties): `auth_method = 'google'` → "via Google OAuth", `auth_method = 'magic_link'` → "via magic link"

---
## Tone

- Direct. Warm. No fluff.
- Celebrate real progress, not effort theater.
- The goals section should feel like clarity + pull, not a to-do list.
- Total reflection output: ~15-20 lines. Dense and useful.
- Health + goals + branches: concise (~15 lines). Signup list exempt — show all.

## Notes

- Never show done steps in goals. Only what's coming.
- No step here waits for the founder (this runs in a subagent). His decisions are findings with options (P1399): the stash (step 4c), a spec waiting in QA (Wave 1), video summaries ready for his yes, and the reviews' proposals. A Sentry or Mixpanel MCP that did not reconnect is a connection in the REPORT block, not a question.
- **A new check needs three things (P1399):** a row in `scripts/day-cp-checks.tsv`, a `CHECK` line written to `$DAY_CHECK_FILE` from its exit code or token, and a fault key for what it finds.
- Run data gathering in sequential waves (Wave 1: local/git, Wave 2: Supabase+Sentry,
  Wave 2b: Mixpanel, Wave 2c: Signup Intel, Wave 3: lint/test+file reads). Max 2-3 tool
  calls per wave to prevent permission prompt floods.
- **This file is in a PUBLIC repo.** Nothing personal goes here: no `~/Projects/private/`
  paths, no home-directory state files, no personal accounts or balances. If a new morning
  check is personal, it belongs in `~/.claude/commands/day.md` instead. `pre-commit-checks.sh`
  enforces the path half of this mechanically (pp p48); the judgement half is yours.

## This file's Due Board is NOT the end of /day — return to the dispatcher

Steps 2, 3, 4, 8, 8b, 8.5, 9 and 11 of `~/.claude/commands/day.md` have not run when you
reach the end of this file. Do not stop here, and do not write anything that reads like a
final `/day` summary — this file's Due Board is the midpoint of `/day`, not the end.

**The dispatcher checks this mechanically (P1205), so this note is a pointer, not the
mechanism.** Its Step 1 runs `day-gates.sh --mode=subday-return` the moment this file
returns and prints what is still owed; its Step 11 closes the pass with `--mode=finish`,
which records what the pass actually achieved judged on the calendar push receipt; and its
Step 0d fails the *next* `/day` pass outright if this one never recorded that completion.
All three live in the dispatcher's own script, which is why nothing here reads a
home-directory marker — the contract table at the top still holds.
