#!/usr/bin/env bash
# day-gates.sh — verify /day's CM Events claim from artifacts, not from assertion.
#
# Usage: ./scripts/day-gates.sh [--mode=start|verify]
#   --mode=verify  (default) run AFTER /slava:util:cm-events-update — asserts a push
#                  happened DURING THIS RUN and succeeded.
#   --mode=start   run at the TOP of /day — reports when the calendar last got a real
#                  push, and records that stamp so verify can tell "pushed just now"
#                  from "pushed earlier today".
#
# Exit 0: nothing is wrong. Exit 1: the calendar is not verified / is badly stale.
# Exit 2: usage error or fixture misconfiguration (also NOT a pass).
#
# Why this exists: three times the system reported success it did not achieve —
# a lapsed token unnoticed for 6 days (2026-07-29), an empty scrape reported healthy
# for three weeks (pre-2026-08-11), a dropped Step 8 in a complete-looking report
# (2026-08-13). /day's "✓ calendar refreshed" was agent-composed prose with no
# artifact behind it. This script reads artifacts and emits the verdict itself, the
# same reason scripts/ship-gates.sh exists.
#
# It never refreshes the calendar. The refresh stays with /slava:util:cm-events-update,
# which alone owns the browser scrapes — a verifier that "helpfully" called the pipeline
# directly would orphan them and degrade the calendar to Beeper-only while exiting 0.
# The ONE thing it writes is the seen-stamp below; every other artifact is read-only.
#
# NOISE IS THE FAILURE MODE. The two previous fixes for this bug class died unnoticed,
# so a gate that cries wolf here is worse than none: it launders the next real failure
# as "oh, that always says that". Measured against the real /day cadence (runs on
# 08-07, 08-10, 08-11, 08-13 — gaps of 3d, 1d, 2d), a 36h start-mode window would have
# fired NOT VERIFIED on two of the last three runs. Hence: start mode tolerates days
# off and says so quietly, per-check PASS lines collapse into one summary line, and
# only verify mode — where a push genuinely just happened — is strict.
#
# Output contract: no >, <, or | at word boundaries (shell-safety.md P783).

set -eu

# ── D5: the ledger, from an EXIT trap ───────────────────────────────────────
# ship-gates.sh shipped the opposite defect: set -e aborting mid-run produced zero
# output and a non-zero code no caller distinguished from "not run". Armed FIRST,
# above the argument parsing — it used to sit below, which left usage errors and
# fixture misconfiguration exiting 2 with zero stdout, so an agent told to "relay
# stdout verbatim" relayed an empty string and no verdict existed to contradict a
# summary it composed instead.
MODE="verify"
fail=0
COMPLETED=0
LAST_PUSH_DESC="unknown"

_verdict() {
  local rc=$?
  echo "── CM EVENTS VERDICT ──"
  if [[ "$COMPLETED" != "1" ]]; then
    echo "CALENDAR: NOT VERIFIED — day-gates.sh aborted before completing (rc=${rc}). Treat as failed."
  elif [[ "$fail" -ne 0 ]]; then
    if [[ "$MODE" == "start" ]]; then
      echo "CALENDAR: STALE — the last successful push is too old. Step 8 must refresh it."
    else
      echo "CALENDAR: NOT VERIFIED — do not report the calendar as refreshed."
    fi
  elif [[ "$MODE" == "start" ]]; then
    # At the top of /day nothing has been refreshed yet BY CONSTRUCTION, so this mode
    # must never print words that read as a failed refresh.
    echo "CALENDAR: last push ${LAST_PUSH_DESC}. Step 8 refreshes it. (mode=start)"
  else
    echo "CALENDAR: VERIFIED (mode=verify)"
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

# Healthy checks collapse into ONE summary line. A live healthy run printed 11 lines,
# relayed twice per /day, nine of them byte-identical every day — which is how a reader
# learns to skip the block that carries the one line that matters. WARN and FAIL print
# immediately and in full (and so survive an abort); only the boring ones are collapsed.
SUMMARY=""
_ok() { SUMMARY="${SUMMARY}${SUMMARY:+ · }$1"; }

# ── Fixture seams ───────────────────────────────────────────────────────────
# DAY_GATES_TEST=1 makes an unset seam a hard error instead of silently falling
# back to the live commands. There is no safe default to fall back TO: the token
# script touches the keychain, and the pipeline pushes to an append-only calendar
# with no undo. A test that quietly ran the real thing would be worse than no test.
BEEPER_DIR="${DAY_GATES_BEEPER_DIR:-$HOME/Projects/private/personal/beeper-digest}"
TOKEN_CMD="${DAY_GATES_TOKEN_CMD:-}"

if [[ "${DAY_GATES_TEST:-0}" == "1" ]]; then
  if [[ -z "${DAY_GATES_BEEPER_DIR:-}" || -z "$TOKEN_CMD" ]]; then
    echo "FATAL: DAY_GATES_TEST=1 requires DAY_GATES_BEEPER_DIR and DAY_GATES_TOKEN_CMD" >&2
    exit 2
  fi
fi

# One tmp surface, resolved the same way the pipeline resolves it. If $BEEPER_TMP_DIR
# is exported in a real shell, cadence.TMP_DIR moves and the pipeline writes its receipt
# and caches there — so this must follow, or D3 would grade caches the run never used
# while D1 read a receipt from somewhere else.
TMP_DIR="${BEEPER_TMP_DIR:-${BEEPER_DIR}/tmp}"
RECEIPT="${TMP_DIR}/last-push.json"
SEEN_FILE="${TMP_DIR}/.day-gates-seen"
CADENCE_DIR="${DAY_GATES_CADENCE_DIR:-${BEEPER_DIR}/scripts}"
[[ -n "$TOKEN_CMD" ]] || TOKEN_CMD="python3 ${BEEPER_DIR}/scripts/beeper_token_status.py --read-only"

# verify mode: a push should have happened minutes ago. 6h tolerates a long or
# interrupted run. Freshness alone is NOT sufficient here — see the seen-stamp below.
FRESH_HOURS_VERIFY=6
# start mode: the founder takes days off; the real gaps between /day runs are 1-3 days
# and have been 5. Only a week without any successful push is a real signal. Anything
# shorter is reported as a fact, not raised as an alarm.
STALE_HOURS_START=168

if [[ "$MODE" == "start" ]]; then
  MAX_AGE_H="$STALE_HOURS_START"
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

# ── D1: push receipt exists, is fresh, and is NEW ───────────────────────────
# The receipt is written by pipeline.py's write_push_receipt(). Before it existed the
# only evidence of a push was a stderr line that died with the process.

receipt_ok=0
r_considered=0; r_created=0; r_skipped=0; r_failed=0
r_ts=""; r_degraded=""; r_reason=""; r_age_h=""; r_mode=""

if [[ ! -f "$RECEIPT" ]]; then
  _safe_echo "[D1] FAIL: no push receipt at $(_tilde "$RECEIPT") — the events pipeline has never completed a push here"
  LAST_PUSH_DESC="never"
  fail=1
else
  # `|| rc=$?` MUST sit outside the closing paren. Inside, the assignment happens in
  # the command-substitution subshell and is discarded — the parent kept rc=0, so a
  # malformed receipt (and, in D3, a failed cadence import) sailed through as a PASS.
  rc=0
  parsed="$(PYTHONDONTWRITEBYTECODE=1 python3 - "$RECEIPT" <<'PY'
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
except (ValueError, TypeError):
    print(f"ERR\x1funparseable ts: {ts!r}")
    raise SystemExit(1)
age_h = (datetime.now(timezone.utc) - stamp).total_seconds() / 3600.0
# Fields are joined with \x1f (unit separator), NOT tab. Tab is an IFS *whitespace*
# character, so bash collapses runs of it and drops empty fields: an empty `degraded`
# silently shifted `mode` and `reason` one slot left. \x1f is non-whitespace, so empty
# fields survive. `reason` is free text and goes last regardless.
print("\x1f".join([
    "OK", ts, f"{age_h:.1f}",
    str(int(d.get("considered", 0))),
    str(int(d.get("created", 0))), str(int(d.get("skipped", 0))), str(int(d.get("failed", 0))),
    ",".join(d.get("degraded") or []), str(d.get("mode", "")), str(d.get("reason", "")),
]))
PY
)" || rc=$?
  if [[ "$rc" -ne 0 ]]; then
    _safe_echo "[D1] FAIL: push receipt at $(_tilde "$RECEIPT") is unreadable or malformed"
    fail=1
  else
    IFS=$'\x1f' read -r _tag r_ts r_age_h r_considered r_created r_skipped r_failed \
      r_degraded r_mode r_reason <<< "$parsed"
    LAST_PUSH_DESC="${r_age_h}h ago"
    # Test the SIGN on the string, before truncating. `${r_age_h%%.*}` turns -0.4 into
    # "-0", which bash arithmetic then reads as 0 and accepts — so a receipt up to an
    # hour in the future passed as fresh (reachable after an NTP correction on wake).
    age_int="${r_age_h%%.*}"
    if [[ "$r_age_h" == -* ]]; then
      _safe_echo "[D1] FAIL: push receipt is dated ${r_age_h}h in the FUTURE (${r_ts}) — clock skew, not evidence"
      fail=1
    elif [[ "$age_int" =~ ^[0-9]+$ ]] && [[ "$age_int" -lt "$MAX_AGE_H" ]]; then
      _ok "D1 receipt ${r_age_h}h old"
      receipt_ok=1
    elif [[ "$MODE" == "start" ]]; then
      _safe_echo "[D1] FAIL: no successful push for ${r_age_h}h (${r_ts}) — over a week; the calendar is badly stale"
      fail=1
    else
      _safe_echo "[D1] FAIL: last push was ${r_age_h}h ago (${r_ts}) — no push happened during this run"
      fail=1
    fi
  fi
fi

# The seen-stamp. Freshness alone cannot tell "pushed just now" from "pushed 5h ago by
# an earlier run" — which is exactly the 2026-08-13 incident shape (Step 8 dropped
# entirely) sailing through verify mode whenever any push succeeded earlier that day.
# Start mode records the stamp it saw; verify mode fails if the stamp has not moved.
if [[ "$MODE" == "start" ]]; then
  mkdir -p "$TMP_DIR" 2>/dev/null || true
  printf '%s\n' "$r_ts" 1>"$SEEN_FILE" 2>/dev/null || true
elif [[ "$receipt_ok" == "1" ]]; then
  if [[ -f "$SEEN_FILE" ]]; then
    seen_ts="$(cat "$SEEN_FILE" 2>/dev/null || true)"
    if [[ -n "$seen_ts" && "$seen_ts" == "$r_ts" ]]; then
      _safe_echo "[D1] FAIL: the receipt is unchanged since the start of this run (${r_ts}) — no push happened, whatever the transcript says"
      fail=1
    else
      _ok "D1 receipt is new this run"
    fi
  else
    _ok "D1 no start-stamp to compare"
  fi
fi

# ── D2: the push actually reached the calendar ──────────────────────────────
# "Push complete:" prints unconditionally after the loop, so a run where every write
# was rejected prints the same line as a healthy one.

if [[ "$receipt_ok" == "1" ]]; then
  reached=$(( r_created + r_skipped ))
  total=$(( reached + r_failed ))
  # A single rejected write is a flaky Google response, not a broken calendar — there
  # is no retry anywhere in the push loop, so failing the whole day on one 500 would
  # fire regularly and teach the reader to skip the block.
  if [[ "$r_failed" -ne 0 && ( "$r_failed" -ge 3 || $(( r_failed * 10 )) -gt "$total" ) ]]; then
    _safe_echo "[D2] FAIL: ${r_failed} of ${total} calendar write(s) were REJECTED — the calendar is incomplete"
    fail=1
  elif [[ "$r_failed" -ne 0 ]]; then
    _safe_echo "[D2] WARN: ${r_failed} of ${total} calendar write(s) rejected — under the failure threshold, but check if it repeats"
  fi

  if [[ "$reached" -eq 0 ]]; then
    _safe_echo "[D2] FAIL: nothing reached the calendar (0 created, 0 skipped${r_reason:+, reason: ${r_reason}}) — a real run has dedup skips"
    fail=1
  else
    _ok "D2 ${r_created} created, ${r_skipped} skipped"
  fi

  # The push loop `continue`s WITHOUT incrementing any counter when an event has no
  # title or no date, so events can vanish uncounted between input and output.
  if [[ "$r_considered" -gt 0 && "$total" -lt "$r_considered" ]]; then
    _safe_echo "[D2] WARN: ${r_considered} events entered the push but only ${total} were accounted for — $(( r_considered - total )) vanished before any write"
  fi

  if [[ -n "$r_degraded" ]]; then
    _safe_echo "[D2] NOTE: the run itself reported these sources degraded: ${r_degraded}"
  fi

  # The healthy steady state of a real run is "0 created, N skipped" — everything is
  # already on the calendar. So the counts alone cannot tell a full 4-source refresh
  # from `pipeline.py --push-only` re-pushing a days-old events.json, which reaches a
  # shape-identical receipt in seconds without Beeper, Chrome, or a single adapter.
  # Only enforced in verify mode: at the top of the day, a receipt left by a manual
  # repair push is still a fact worth reporting.
  if [[ "$MODE" == "verify" && "$r_mode" != "full" ]]; then
    _safe_echo "[D2] FAIL: the last push ran in mode '${r_mode:-unknown}', not a full refresh — the sources were never re-read"
    fail=1
  fi
fi

# ── D3: per-source scrape health, read from the caches ──────────────────────
# Skipped in start mode on purpose. A source one day past a one-day cadence is the
# normal state of any morning after a day off, and Step 8's scrape clears it minutes
# later — a warning cleared by the same ritual that raised it is trained dismissal.
# Read from the caches via events.cadence, NOT by grepping the pipeline's stderr: a
# source that prints "skipped" never enters the pipeline's degraded_sources list, so a
# scraper dead for three weeks produces no warning row anywhere in the run output.
# Beeper is absent from cadence.SOURCES and is covered by D4 instead.

if [[ "$MODE" == "verify" ]]; then
  rc=0
  src_report="$(BEEPER_TMP_DIR="$TMP_DIR" PYTHONDONTWRITEBYTECODE=1 python3 - "$CADENCE_DIR" <<'PY'
import sys
sys.path.insert(0, sys.argv[1])
from events import cadence  # noqa: E402

rows, unhealthy, collapsed = [], 0, 0
for name in cadence.SOURCES:
    cad = cadence.SOURCES[name]["cadence_days"]
    age = cadence.cache_age_days(name)
    count = cadence.cache_event_count(name)
    suspect, cnt, floor = cadence.below_floor(name)
    # The verdict comes from cadence.health() — the SAME function the pipeline's own
    # adapters call — so this gate cannot drift from what the pipeline actually does.
    # It did drift: this used `age > cad` while health() skips at `age >= cad`, so a
    # source sitting at exactly its cadence (todo_today every day it is not re-scraped)
    # was dropped by the pipeline and blessed "ok" here.
    # health()'s own reason strings carry ">=" and would trip _safe_echo, so the
    # wording below is composed here; only the verdict is taken from health().
    healthy, _reason = cadence.health(name)
    if healthy:
        rows.append(f"OK\x1f{name}\x1f{count} event(s), cache {age}d old (cadence {cad}d)")
        continue
    unhealthy += 1
    # "Every source is dead" must mean a real collapse, not one ordinary trip: the
    # browser step is skipped whenever Chrome is unavailable, so eight days without a
    # Chrome-capable run puts all three past cadence at once while Beeper keeps
    # publishing fine. Only 2x cadence counts toward the collapse rule.
    if age is None or age > 2 * cad or suspect:
        collapsed += 1
    if age is None:
        rows.append(f"MISSING\x1f{name}\x1fno cache on disk (cadence {cad}d)")
    elif suspect:
        rows.append(f"EMPTY\x1f{name}\x1fcache holds {cnt} event(s), floor is {floor} — the scrape broke")
    else:
        rows.append(f"STALE\x1f{name}\x1fcache is {age}d old, at or past its {cad}d cadence — the pipeline is skipping it")
print(f"TOTAL\x1f{len(cadence.SOURCES)}\x1f{unhealthy}\x1f{collapsed}")
print("\n".join(rows))
PY
)" || rc=$?

  if [[ "$rc" -ne 0 ]]; then
    _safe_echo "[D3] FAIL: could not read source health from $(_tilde "$CADENCE_DIR") (events.cadence import or read failed)"
    fail=1
  else
    total_src=0; unhealthy=0; collapsed=0
    while IFS=$'\x1f' read -r kind a b c; do
      [[ -z "$kind" ]] && continue
      case "$kind" in
        TOTAL) total_src="$a"; unhealthy="$b"; collapsed="$c" ;;
        OK)    : ;;
        *)     _safe_echo "[D3] WARN: source '${a}' ${kind} — ${b}" ;;
      esac
    done <<< "$src_report"
    if [[ "$total_src" -eq 0 ]]; then
      _safe_echo "[D3] FAIL: read zero sources from the cadence registry — that is a broken probe, not a healthy calendar"
      fail=1
    elif [[ "$collapsed" -ge "$total_src" ]]; then
      _safe_echo "[D3] FAIL: all ${total_src} browser-scraped source(s) are far past cadence, empty, or missing — the calendar is running on Beeper alone"
      fail=1
    elif [[ "$unhealthy" -gt 0 ]]; then
      _safe_echo "[D3] note: ${unhealthy} of ${total_src} source(s) need a re-scrape"
    else
      _ok "D3 ${total_src}/${total_src} sources fresh"
    fi
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
# Our own data (the receipt fields above) is NOT sanitized — a redirect token there is
# a contract violation worth aborting on, and the trap still prints the verdict.
_relay_token() {
  while IFS= read -r line; do
    [[ -z "$line" ]] && continue
    _safe_echo "[D4] $(printf '%s' "$line" | sed 's/->/→/g; s/[<>|]/ /g')"
  done <<< "$token_out"
}

case "$token_rc" in
  0) _ok "D4 token valid" ;;
  1) _relay_token
     _safe_echo "[D4] WARN: Beeper token EXPIRING (exit 1) — reconnect before it lapses: /mcp then reconnect 'beeper'" ;;
  2|3)
    _relay_token
    _safe_echo "[D4] FAIL: Beeper token expired or unknown (exit ${token_rc})"
    _safe_echo ""
    _safe_echo "⚠ CM EVENTS: NOT REFRESHED — Beeper token expired/unknown. Calendar is stale."
    _safe_echo "  Run /mcp, reconnect 'beeper', then re-run /day (or just /cm-events-update)."
    _safe_echo ""
    fail=1
    ;;
  *)
    _relay_token
    _safe_echo "[D4] FAIL: token probe exited ${token_rc} — status unknown, treat the calendar as unverified"
    fail=1
    ;;
esac

[[ -z "$SUMMARY" ]] || _safe_echo "checks passed: ${SUMMARY}"

COMPLETED=1
if [[ "$fail" -ne 0 ]]; then
  exit 1
fi
exit 0
