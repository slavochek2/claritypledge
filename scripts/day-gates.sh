#!/usr/bin/env bash
# day-gates.sh — verify /day's CM Events claim from artifacts, not from assertion.
#
# Usage: ./scripts/day-gates.sh [--mode=start|verify]
#   --mode=verify  (default) run AFTER /slava:util:cm-events-update — asserts the
#                  calendar was actually pushed to, just now, successfully.
#   --mode=start   run at the TOP of /day — reports the outcome of the last push,
#                  so a run that was skipped yesterday is visible today. Today's
#                  run cannot change yesterday's outcome, so this mode's exit code
#                  is informational; the loud block is the payload.
#
# Exit 0: the calendar is verified. Exit 1: it is NOT — do not report it as refreshed.
# Exit 2: usage error or fixture misconfiguration (also NOT a pass).
#
# Why this exists: three times the system reported success it did not achieve —
# a lapsed token unnoticed for 6 days (2026-07-29), an empty scrape reported healthy
# for three weeks (pre-2026-08-11), a dropped Step 8 in a complete-looking report
# (2026-08-13). /day's "✓ calendar refreshed" was agent-composed prose with no
# artifact behind it. This script reads artifacts and emits the verdict itself, the
# same reason scripts/ship-gates.sh exists.
#
# Read-only over every artifact it touches: it never refreshes the calendar. The
# refresh stays with /slava:util:cm-events-update, which alone owns the browser
# scrapes — a verifier that "helpfully" called the pipeline directly would orphan
# them and degrade the calendar to Beeper-only while still exiting 0.
#
# Output contract: no >, <, or | at word boundaries (shell-safety.md P783).

set -eu

# ── D5: the ledger, from an EXIT trap ───────────────────────────────────────
# ship-gates.sh shipped the opposite defect: set -e aborting mid-run produced zero
# output and a non-zero code no caller distinguished from "not run". A gate that
# can exit silently is the worst failure mode for a gate, so the verdict line is
# emitted from a trap and therefore survives any abort above it.
#
# Armed FIRST, above the argument parsing. It used to sit below, which left the
# usage-error and fixture-misconfig exits printing nothing at all: an agent told to
# "relay stdout verbatim" would relay an empty string, and no CALENDAR: line would
# exist to contradict a summary it composed instead. That is precisely the defect
# the trap was written to prevent, surviving above the trap.
MODE="verify"
fail=0
COMPLETED=0

_verdict() {
  local rc=$?
  echo "── CM EVENTS VERDICT ──"
  if [[ "$COMPLETED" != "1" ]]; then
    echo "CALENDAR: NOT VERIFIED — day-gates.sh aborted before completing (rc=${rc}). Treat as failed."
  elif [[ "$fail" -ne 0 ]]; then
    echo "CALENDAR: NOT VERIFIED — do not report the calendar as refreshed."
  else
    echo "CALENDAR: VERIFIED (mode=${MODE})"
  fi
}
trap _verdict EXIT

for arg in "$@"; do
  case "$arg" in
    --mode=start)  MODE="start" ;;
    --mode=verify) MODE="verify" ;;
    *) echo "Usage: $0 [--mode=start|verify]" >&2; exit 2 ;;
  esac
done

# /day relays this stdout verbatim into a report that can end up in a public doc, so
# paths print $HOME-relative — an absolute /Users/<name>/ path would carry the
# founder's name into it (CLAUDE.md, Private vs Public Files).
_tilde() { local t="~"; printf '%s' "${1/#$HOME/$t}"; }

_safe_echo() {
  local line="$1"
  if [[ "$line" == *'>'* || "$line" == *'<'* || "$line" == *'|'* ]]; then
    echo "FATAL: day-gates.sh attempted unsafe output: $line" >&2
    exit 3
  fi
  echo "$line"
}

# ── Fixture seams ───────────────────────────────────────────────────────────
# DAY_GATES_TEST=1 makes an unset seam a hard error instead of silently falling
# back to the live commands. There is no safe default here to fall back TO: the
# token script touches the keychain, and the pipeline pushes to an append-only
# calendar with no undo. A test that quietly ran the real thing would be worse
# than no test.
BEEPER_DIR="${DAY_GATES_BEEPER_DIR:-$HOME/Projects/private/personal/beeper-digest}"
TOKEN_CMD="${DAY_GATES_TOKEN_CMD:-}"

if [[ "${DAY_GATES_TEST:-0}" == "1" ]]; then
  if [[ -z "${DAY_GATES_BEEPER_DIR:-}" || -z "$TOKEN_CMD" ]]; then
    echo "FATAL: DAY_GATES_TEST=1 requires DAY_GATES_BEEPER_DIR and DAY_GATES_TOKEN_CMD" >&2
    exit 2
  fi
fi

RECEIPT="${BEEPER_DIR}/tmp/last-push.json"
CADENCE_DIR="${DAY_GATES_CADENCE_DIR:-${BEEPER_DIR}/scripts}"
[[ -n "$TOKEN_CMD" ]] || TOKEN_CMD="python3 ${BEEPER_DIR}/scripts/beeper_token_status.py --read-only"

# verify mode: the push should have happened minutes ago. 6h tolerates a long or
# interrupted run while never reaching back to yesterday's — a same-day second
# /day still re-pushes, because cm-events-update gates only the Beeper digest
# refresh on state.json, never the pipeline push itself.
FRESH_HOURS_VERIFY=6
# start mode: yesterday's daily run is fine, a fully missed day is not. Hours, not
# calendar days: the receipt stamp is UTC and the founder is at +07, so a date
# comparison would call a 06:00-local push "yesterday".
FRESH_HOURS_START=36

if [[ "$MODE" == "start" ]]; then
  MAX_AGE_H="$FRESH_HOURS_START"
else
  MAX_AGE_H="$FRESH_HOURS_VERIFY"
fi

_safe_echo "day-gates.sh mode=${MODE} — verifying the CM Events calendar from artifacts"

if [[ ! -d "$BEEPER_DIR" ]]; then
  _safe_echo "[D0] FAIL: beeper-digest not found at $(_tilde "$BEEPER_DIR") — cannot verify anything"
  fail=1
  COMPLETED=1
  exit 1
fi

# ── D1: push receipt exists and is fresh ────────────────────────────────────
# The receipt is written by pipeline.py's write_push_receipt() on every push path,
# including the ones that push nothing. Before it existed, the only evidence of a
# push was a stderr line that died with the process.

receipt_ok=0
r_created=0; r_skipped=0; r_failed=0; r_ts=""; r_degraded=""; r_reason=""; r_age_h=""; r_mode=""

if [[ ! -f "$RECEIPT" ]]; then
  _safe_echo "[D1] FAIL: no push receipt at $(_tilde "$RECEIPT") — the events pipeline has never completed a push here"
  fail=1
else
  # `|| rc=$?` MUST sit outside the closing paren. Inside, the assignment happens in
  # the command-substitution subshell and is discarded — the parent kept rc=0, so a
  # malformed receipt (and, in D3, a failed cadence import) sailed through as a PASS.
  rc=0
  parsed="$(python3 - "$RECEIPT" <<'PY' 
import json, sys
from datetime import datetime, timezone
try:
    with open(sys.argv[1], encoding="utf-8") as fh:
        d = json.load(fh)
except Exception as exc:
    print(f"ERR\x1f{exc}")
    raise SystemExit(1)
ts = d.get("ts", "")
try:
    stamp = datetime.strptime(ts, "%Y-%m-%dT%H:%M:%SZ").replace(tzinfo=timezone.utc)
except ValueError:
    print(f"ERR\x1funparseable ts: {ts!r}")
    raise SystemExit(1)
age_h = (datetime.now(timezone.utc) - stamp).total_seconds() / 3600.0
# Fields are joined with \x1f (unit separator), NOT tab. Tab is an IFS *whitespace*
# character, so bash collapses runs of it and drops empty fields: an empty `degraded`
# silently shifted `mode` and `reason` one slot left. \x1f is non-whitespace, so empty
# fields survive. `reason` is free text and goes last regardless.
print("\x1f".join([
    "OK", ts, f"{age_h:.1f}",
    str(int(d.get("created", 0))), str(int(d.get("skipped", 0))), str(int(d.get("failed", 0))),
    ",".join(d.get("degraded") or []), str(d.get("mode", "")), str(d.get("reason", "")),
]))
PY
)" || rc=$?
  if [[ "$rc" -ne 0 ]]; then
    _safe_echo "[D1] FAIL: push receipt at $(_tilde "$RECEIPT") is unreadable or malformed"
    fail=1
  else
    IFS=$'\x1f' read -r _tag r_ts r_age_h r_created r_skipped r_failed r_degraded r_mode r_reason <<< "$parsed"
    # Integer compare on whole hours; a receipt from the future (clock skew) is
    # not evidence either, so a negative age fails the same way.
    age_int="${r_age_h%%.*}"
    if [[ "$age_int" =~ ^-?[0-9]+$ ]] && [[ "$age_int" -ge 0 ]] && [[ "$age_int" -lt "$MAX_AGE_H" ]]; then
      _safe_echo "[D1] PASS: push receipt is ${r_age_h}h old (${r_ts}), within the ${MAX_AGE_H}h window"
      receipt_ok=1
    else
      _safe_echo "[D1] FAIL: last push was ${r_age_h}h ago (${r_ts}) — older than the ${MAX_AGE_H}h window for mode=${MODE}"
      fail=1
    fi
  fi
fi

# ── D2: the push actually reached the calendar ──────────────────────────────
# "Push complete:" prints unconditionally after the loop, so a run where every
# single write was rejected prints the same line as a healthy one. Both halves
# are needed: failed=0 alone passes a run that pushed nothing at all, which is
# incident #2 (an empty scrape reported healthy) in miniature.

if [[ "$receipt_ok" == "1" ]]; then
  reached=$(( r_created + r_skipped ))
  if [[ "$r_failed" -ne 0 ]]; then
    _safe_echo "[D2] FAIL: ${r_failed} calendar write(s) were REJECTED (${r_created} created, ${r_skipped} skipped) — the calendar is incomplete"
    fail=1
  elif [[ "$reached" -eq 0 ]]; then
    _safe_echo "[D2] FAIL: nothing reached the calendar (0 created, 0 skipped, 0 failed${r_reason:+, reason: ${r_reason}}) — a real run always has dedup skips"
    fail=1
  else
    _safe_echo "[D2] PASS: ${r_created} created, ${r_skipped} skipped (dedup), 0 failed"
  fi
  if [[ -n "$r_degraded" ]]; then
    _safe_echo "[D2] NOTE: the run itself reported these sources degraded: ${r_degraded}"
  fi

  # The healthy steady state of a real run is "0 created, N skipped" — everything is
  # already on the calendar. So the counts alone cannot tell a full 4-source refresh
  # from `pipeline.py --push-only` re-pushing a days-old events.json, which reaches a
  # shape-identical receipt in seconds without Beeper, Chrome, or a single adapter.
  # `mode` is what separates them. Only enforced in verify mode: at the top of the
  # day, a receipt left by a manual repair push is still a fact worth reporting.
  if [[ "$MODE" == "verify" && "$r_mode" != "full" ]]; then
    _safe_echo "[D2] FAIL: the last push ran in mode '${r_mode:-unknown}', not a full refresh — the sources were never re-read"
    fail=1
  fi
fi

# ── D3: per-source scrape health, read from the caches ──────────────────────
# Read from the caches via events.cadence, NOT by grepping the pipeline's stderr.
# A source that prints "skipped" falls through without ever entering the
# pipeline's degraded_sources list, so a scraper dead for three weeks produces no
# warning row anywhere in the run output. The cache is the only artifact that
# says whether the scrape worked. Beeper is absent from cadence.SOURCES and is
# covered by D4 instead.

rc=0
src_report="$(BEEPER_TMP_DIR="${BEEPER_DIR}/tmp" python3 - "$CADENCE_DIR" <<'PY' 
import sys
sys.path.insert(0, sys.argv[1])
from events import cadence  # noqa: E402

rows, unhealthy = [], 0
for name in cadence.SOURCES:
    cad = cadence.SOURCES[name]["cadence_days"]
    age = cadence.cache_age_days(name)
    count = cadence.cache_event_count(name)
    suspect, cnt, floor = cadence.below_floor(name)
    # The verdict comes from cadence.health() — the SAME function the pipeline's own
    # adapters call — so this gate cannot drift from what the pipeline actually does.
    # It did drift: this used `age > cad` while health() skips at `age >= cad`, so a
    # source sitting at exactly its cadence (todo_today every single day it is not
    # re-scraped) was dropped by the pipeline and blessed "ok" here.
    # health()'s own reason strings carry ">=" and would trip _safe_echo, so the
    # wording below is composed here; only the verdict is taken from health().
    healthy, _reason = cadence.health(name)
    if healthy:
        rows.append(f"OK\x1f{name}\x1f{count} event(s), cache {age}d old (cadence {cad}d)")
        continue
    unhealthy += 1
    if age is None:
        rows.append(f"MISSING\x1f{name}\x1fno cache on disk (cadence {cad}d)")
    elif suspect:
        rows.append(f"EMPTY\x1f{name}\x1fcache holds {cnt} event(s), floor is {floor} — the scrape broke")
    else:
        rows.append(f"STALE\x1f{name}\x1fcache is {age}d old, at or past its {cad}d cadence — the pipeline is skipping it")
print(f"TOTAL\x1f{len(cadence.SOURCES)}\x1f{unhealthy}")
print("\n".join(rows))
PY
)" || rc=$?

if [[ "$rc" -ne 0 ]]; then
  _safe_echo "[D3] FAIL: could not read source health from $(_tilde "$CADENCE_DIR") (events.cadence import or read failed)"
  fail=1
else
  total=0; unhealthy=0
  while IFS=$'\x1f' read -r kind a b; do
    [[ -z "$kind" ]] && continue
    case "$kind" in
      TOTAL) total="$a"; unhealthy="$b" ;;
      OK)    _safe_echo "[D3] ok: ${a} — ${b}" ;;
      *)     _safe_echo "[D3] WARN: source '${a}' ${kind} — ${b}" ;;
    esac
  done <<< "$src_report"
  if [[ "$total" -eq 0 ]]; then
    _safe_echo "[D3] FAIL: read zero sources from the cadence registry — that is a broken probe, not a healthy calendar"
    fail=1
  elif [[ "$unhealthy" -ge "$total" ]]; then
    _safe_echo "[D3] FAIL: all ${total} browser-scraped source(s) are stale, empty, or missing — the calendar is running on Beeper alone"
    fail=1
  elif [[ "$unhealthy" -gt 0 ]]; then
    _safe_echo "[D3] WARN: ${unhealthy} of ${total} browser-scraped source(s) need a re-scrape"
  else
    _safe_echo "[D3] PASS: all ${total} browser-scraped source(s) within cadence and above floor"
  fi
fi

# ── D4: Beeper token ────────────────────────────────────────────────────────
# Read-only invocation. The healing write to .env and the observation-log append
# belong to /day's one pre-flight call, not to a verifier that runs twice a day.

token_rc=0
token_out="$($TOKEN_CMD 2>&1)" || token_rc=$?
# Sanitize FOREIGN output before relaying it. beeper_token_status.py's expired-token
# message is full of "-> /mcp then reconnect" action lines, so relaying it raw would
# trip _safe_echo and abort this script on precisely the path that must be loudest.
# Our own data (the receipt fields below) is NOT sanitized — a redirect token there is
# a contract violation worth aborting on, and the trap still prints the verdict.
while IFS= read -r line; do
  [[ -z "$line" ]] && continue
  _safe_echo "[D4] $(printf '%s' "$line" | sed 's/->/→/g; s/[<>|]/ /g')"
done <<< "$token_out"

case "$token_rc" in
  0) _safe_echo "[D4] PASS: Beeper token valid (exit 0)" ;;
  1) _safe_echo "[D4] WARN: Beeper token EXPIRING (exit 1) — reconnect before it lapses: /mcp then reconnect 'beeper'" ;;
  2|3)
    _safe_echo "[D4] FAIL: Beeper token expired or unknown (exit ${token_rc})"
    _safe_echo ""
    _safe_echo "⚠ CM EVENTS: NOT REFRESHED — Beeper token expired/unknown. Calendar is stale."
    _safe_echo "  Run /mcp, reconnect 'beeper', then re-run /day (or just /cm-events-update)."
    _safe_echo ""
    fail=1
    ;;
  *)
    _safe_echo "[D4] FAIL: token probe exited ${token_rc} — status unknown, treat the calendar as unverified"
    fail=1
    ;;
esac

COMPLETED=1
if [[ "$fail" -ne 0 ]]; then
  exit 1
fi
exit 0
