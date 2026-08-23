#!/usr/bin/env bash
# scripts/audit-credential-drift.sh — P1147 read-only credential drift audit.
#
# Reads local env files and the private credential registries and reports
# drift in three directions: a live key nobody classified, a documented
# credential that lives nowhere (or claims a location it does not occupy),
# and the same key described two different ways across registries.
#
# This script never writes a credential value anywhere, never mints, never
# changes, never invalidates one. It reads, compares, and reports.
#
# Usage:
#   scripts/audit-credential-drift.sh --parse-only --env-dir DIR
#       Static line-by-line scan of every env file in DIR. Every non-blank,
#       non-comment line produces CLASSIFIED:<KEY>:<file>:<line> or
#       UNPARSEABLE:<file>:<line> — zero lines silently dropped. Exit 0.
#
#   scripts/audit-credential-drift.sh --audit --env-dir DIR \
#       --registry FILE [--registry FILE ...] [--consumers-dir DIR ...] \
#       [--not-enumerated NAME:REASON ...]
#       Full three-direction drift report. Exit 1 if any registry row carries
#       an inline plaintext value (the one hard-fail finding class); exit 0
#       otherwise — every other finding is informational.
#
# Output tokens (one per line):
#   CLASSIFIED:<KEY>:<file>:<line>
#   UNPARSEABLE:<file>:<line>
#   CONSUMER_ONLY:<KEY>:<file>:<line>                                  consumer -> registry
#   REGISTRY_ONLY:<KEY>:<registry-file>                                registry -> consumer, missing everywhere
#   REGISTRY_LOCATION_MISMATCH:<KEY>:<registry-file>:claimed=<f>:found=<f>
#   REGISTRY_MISMATCH:<KEY>:<reg-a>:tier=<v>:<reg-b>:tier=<v>          registry -> registry
#   RETIREMENT_CANDIDATE:<KEY>:<registry-file>
#   CONSUMER_LIST_STALE:<KEY>:<registry-file>:documented=<n>:live=<n>
#   NOT_ENUMERATED:<surface>:<reason>                                  excluded from COVERAGE
#   PLAINTEXT_IN_REGISTRY:<KEY>:<registry-file>:fingerprint=<fp>       hard fail
#   PLAINTEXT_CHECK_SKIPPED:<registry-file>:<reason>                  no Value-like column resolved
#   LOCATION_CHECK_SKIPPED:<registry-file>:<reason>                   no Location-like column resolved
#   MULTI_KEY_ROW_BUNDLED:<registry-file>:<KEY_A>/<KEY_B>             shared tier/value, flagged
#   COVERAGE:<classified>/<total-reachable>:not-enumerated=<n>
#
# Fingerprint format: first2…last2(length), e.g. Fa…12(27). A raw secret
# value never appears in this script's output — registry rows are compared
# by fingerprint only, and live env values are never read into a variable
# at all (only key names are parsed out of env files).
#
# Output contract: no >, <, or | at word boundaries (shell-safety.md P783).
# This script is read-only end to end — it never sources an env file (that
# is the mechanism of the 2026-08-21 incident this spec exists to prevent),
# never passes a secret-shaped value as a command argument, and never
# writes, changes, or invalidates a credential anywhere.

# Deliberately -u only, not -e (unlike check-edge-function-secrets.sh /
# day-gates.sh): this script's audit-mode logic is built on `$(cmd || true)`
# for every comm/grep call whose empty-result exit code is expected and
# handled explicitly (e.g. `comm -23 ... || true`) — `set -e` would abort
# on those same expected-empty results, which is exactly the failure mode
# the rest of this script goes out of its way to avoid (see the
# LOCATION_CHECK_SKIPPED/PLAINTEXT_CHECK_SKIPPED sentinels). A missing
# `--registry` file is still caught loudly by its own explicit check
# above, not by relying on `set -e`.
set -u

_safe_echo() {
  local line="$1"
  if [[ "$line" == *'>'* || "$line" == *'<'* || "$line" == *'|'* ]]; then
    echo "FATAL: audit-credential-drift.sh attempted unsafe output: $line" >&2
    exit 3
  fi
  echo "$line"
}

MODE=""
ENV_DIR=""
CONSUMERS_DIRS=()
REGISTRIES=()
NOT_ENUM=()

while [ $# -gt 0 ]; do
  case "$1" in
    --parse-only) MODE="parse-only"; shift ;;
    --audit) MODE="audit"; shift ;;
    --env-dir) ENV_DIR="$2"; shift 2 ;;
    --env-dir=*) ENV_DIR="${1#--env-dir=}"; shift ;;
    --registry) REGISTRIES+=("$2"); shift 2 ;;
    --registry=*) REGISTRIES+=("${1#--registry=}"); shift ;;
    --consumers-dir) CONSUMERS_DIRS+=("$2"); shift 2 ;;
    --consumers-dir=*) CONSUMERS_DIRS+=("${1#--consumers-dir=}"); shift ;;
    --not-enumerated) NOT_ENUM+=("$2"); shift 2 ;;
    --not-enumerated=*) NOT_ENUM+=("${1#--not-enumerated=}"); shift ;;
    -h|--help)
      sed -n '1,50p' "$0" | grep -E '^#( |!)' | sed 's/^# \{0,1\}//'
      exit 0
      ;;
    *)
      _safe_echo "ERROR: unknown arg: $1" >&2
      exit 2
      ;;
  esac
done

if [[ -z "$MODE" ]]; then
  _safe_echo "ERROR: pass --parse-only or --audit" >&2
  exit 2
fi
if [[ -z "$ENV_DIR" || ! -d "$ENV_DIR" ]]; then
  _safe_echo "ERROR: --env-dir DIR required and must exist" >&2
  exit 2
fi
if [[ "$MODE" == "audit" && ${#REGISTRIES[@]} -eq 0 ]]; then
  _safe_echo "ERROR: --audit requires at least one --registry FILE" >&2
  exit 2
fi
# A missing/unreadable --registry path must abort loudly, not silently
# degrade to "0 registered keys" (indistinguishable from an empty-but-
# real registry, and the exact shape a stale/typo'd/unmounted path
# produces).
for r in "${REGISTRIES[@]:-}"; do
  [[ -n "$r" ]] || continue
  if [[ ! -f "$r" || ! -r "$r" ]]; then
    _safe_echo "ERROR: --registry file not found or unreadable: $r" >&2
    exit 2
  fi
done

# list_env_files DIR — every file that looks like a local env file, sorted.
list_env_files() {
  find "$1" -maxdepth 1 -type f \( -name '*.env' -o -name '.env*' \) 2>/dev/null | sort
}

# parse_env_file FILE — one CLASSIFIED or UNPARSEABLE line per non-blank,
# non-comment line. A well-formed-key regex is the only classifier: no
# `source`, no eval, the value half of the line is never inspected.
parse_env_file() {
  local f="$1" n=0 line key
  while IFS= read -r line || [[ -n "$line" ]]; do
    n=$((n + 1))
    if [[ "$line" =~ ^[[:space:]]*$ ]]; then
      continue
    fi
    if [[ "$line" =~ ^[[:space:]]*# ]]; then
      continue
    fi
    if [[ "$line" =~ ^[A-Z_][A-Z0-9_]*= ]]; then
      key="${line%%=*}"
      _safe_echo "CLASSIFIED:${key}:${f}:${n}"
    else
      _safe_echo "UNPARSEABLE:${f}:${n}"
    fi
  done < "$f"
}

# parse_registry FILE — one tab-separated row per classified data row,
# per KEY (a row whose identifier cell holds multiple `KEY_A` / `KEY_B`
# names emits one output row per key, sharing the row's other columns —
# a single-key parse would silently drop the second key, the same failure
# class Done-When forbids for env files). Output: regfile, key, loc,
# consumers, tier, interval, lastrotated, status, value.
#
# Header-driven, not fixed-position: this file may hold more than one
# markdown table, and different registries (and different tables within
# one registry) use different column sets/orders for the same concept
# (`Env var` vs `Secret`; `Consumers` vs `Referenced by` vs `Where used`).
# Each header+separator pair seen resets the active column map; a column
# this table doesn't have resolves to empty, not an error. (awk's -F
# option does not reliably expand a \x1f-style hex escape on this
# platform's awk — a literal tab is the portable output delimiter and
# none of these columns legitimately contain one.)
parse_registry() {
  local regfile="$1"
  awk -F'|' -v regfile="$regfile" '
    function trim(s) { gsub(/^[ \t]+|[ \t]+$/, "", s); return s }
    function striptick(s) { gsub(/`/, "", s); return s }
    # desafe — every free-text field goes through this before it ever
    # leaves parse_registry, so no downstream _safe_echo call can be
    # killed by ordinary table prose (an arrow "->", a "<name>"
    # placeholder). Structurally the only char that needs handling here
    # is < / > — a literal "|" inside a cell already cannot survive the
    # -F"|" split above (it becomes a field boundary, not cell content).
    function desafe(s) { gsub(/[<>]/, "-", s); return s }
    function is_sep(line,    t) {
      t = line; gsub(/[ \t]/, "", t)
      return (t ~ /^\|?[-:|]+\|?$/)
    }
    # resolve NAMES — NAMES is a "|"-separated priority list of candidate
    # header substrings (e.g. "consumers|referenced by|where used"); returns
    # the column index of the first header (in left-to-right header order)
    # containing the first candidate that matches ANY header, or 0 if none
    # of the candidates appear in this table at all. Substring, not exact
    # match, because real headers are verbose ("Value (must be empty)").
    function resolve(names,    i, j, n, nm) {
      n = split(names, parts, "|")
      for (i = 1; i <= n; i++) {
        nm = parts[i]
        for (j = 1; j <= ncols; j++) {
          if (index(hlow[j], nm) > 0) return j
        }
      }
      return 0
    }
    function cell(rowfields, idx) {
      if (idx == 0) return ""
      return trim(rowfields[idx])
    }
    {
      line = $0
      if (pending_header && is_sep(line)) {
        ncols = split(pendingline, hf, "|")
        delete hlow
        for (i = 1; i <= ncols; i++) hlow[i] = tolower(trim(hf[i]))
        keycol = resolve("env var|secret|key")
        loccol = resolve("location|stored elsewhere")
        conscol = resolve("consumers|referenced by|where used")
        tiercol = resolve("tier")
        intcol = resolve("interval")
        lastcol = resolve("last rotated|first set")
        statcol = resolve("status")
        valcol = resolve("value")
        in_table = 1
        pending_header = 0
        # No Value-like column resolved for this table: the plaintext
        # hard-fail check has nothing to scan here. That is
        # indistinguishable from "checked, found nothing" unless this
        # sentinel row makes it visible (CRITICAL finding: a table
        # renamed "Value" to "Secret"/"Plaintext" silently switched the
        # one hard-fail check off with zero signal).
        if (valcol == 0) {
          printf "%s\t__NO_VALUE_COLUMN__\t\t\t\t\t\t\t\n", regfile
        }
        # Same failure shape for Location: if this table has no
        # resolvable Location-like column, every row in it gets loc=""
        # — which would make REGISTRY_LOCATION_MISMATCH fire for every
        # live+registered key in the table (claimed="$ENV_DIR/" can
        # never match any real basename), a guaranteed false positive
        # indistinguishable from a real drift finding (HIGH finding,
        # /finish code review).
        if (loccol == 0) {
          printf "%s\t__NO_LOCATION_COLUMN__\t\t\t\t\t\t\t\n", regfile
        }
        next
      }
      if (line ~ /^[ \t]*\|/) {
        if (!in_table) {
          pendingline = line
          pending_header = 1
          next
        }
        pending_header = 0
        n = split(line, rf, "|")
        keyraw = striptick(cell(rf, keycol))
        if (keyraw == "") next
        kn = split(keyraw, keys, "/")
        loc = desafe(striptick(cell(rf, loccol)))
        cons = desafe(striptick(cell(rf, conscol)))
        tier = desafe(cell(rf, tiercol))
        interval = desafe(cell(rf, intcol))
        lastrot = desafe(cell(rf, lastcol))
        status = desafe(cell(rf, statcol))
        val = desafe(striptick(cell(rf, valcol)))
        # Count only VALID keys before deciding this is a bundled row —
        # a "/" in the identifier cell is not always a key separator (e.g.
        # "OAuth via ~/.config/gws/" splits on "/" too; every piece fails
        # the key-shape regex, so this must not read as bundling).
        valid_n = 0; valid_list = ""
        for (i = 1; i <= kn; i++) {
          key = trim(keys[i])
          if (key !~ /^[A-Z_][A-Z0-9_]*$/) continue
          valid_n++
          valid_list = (valid_list == "" ? key : valid_list "/" key)
        }
        # A row bundling multiple keys ("`KEY_A` / `KEY_B`") shares this
        # one Tier/Value across keys of different sensitivity by
        # construction — surface it rather than let a wrong-but-
        # internally-consistent tier hide on an ordinary multi-key row.
        if (valid_n > 1) {
          printf "%s\t__MULTI_KEY_ROW__\t%s\t\t\t\t\t\t\n", regfile, valid_list
        }
        for (i = 1; i <= kn; i++) {
          key = trim(keys[i])
          if (key !~ /^[A-Z_][A-Z0-9_]*$/) continue
          printf "%s\t%s\t%s\t%s\t%s\t%s\t%s\t%s\t%s\n", regfile, key, loc, cons, tier, interval, lastrot, status, val
        }
        next
      }
      in_table = 0
      pending_header = 0
    }
  ' "$regfile"
}

# fingerprint VALUE — first2…last2(length). Never the raw value.
# For length <= 4, first2+last2 overlap or cover the whole string (e.g.
# "ab" -> "ab…ab(2)" is the literal value twice) — mask fully instead.
fingerprint() {
  local val="$1" n=${#val}
  if [[ "$n" -le 4 ]]; then
    printf '***(%s)' "$n"
  else
    printf '%s\xe2\x80\xa6%s(%s)' "${val:0:2}" "${val: -2}" "$n"
  fi
}

ENV_FILES=$(list_env_files "$ENV_DIR")

if [[ "$MODE" == "parse-only" ]]; then
  for f in $ENV_FILES; do
    parse_env_file "$f"
  done
  exit 0
fi

# ── audit mode ──────────────────────────────────────────────────────────
ENV_FINDINGS=""
for f in $ENV_FILES; do
  out="$(parse_env_file "$f")"
  [[ -n "$out" ]] || continue
  ENV_FINDINGS="${ENV_FINDINGS}${ENV_FINDINGS:+$'\n'}${out}"
  _safe_echo "$out"
done

LIVE_CLASSIFIED=$(printf '%s\n' "$ENV_FINDINGS" | grep '^CLASSIFIED:' || true)
LIVE_KEYS=$(printf '%s\n' "$LIVE_CLASSIFIED" | awk -F: '{print $2}' | sort -u | grep -v '^$' || true)

ALL_REG_ROWS_RAW=""
for r in "${REGISTRIES[@]}"; do
  out="$(parse_registry "$r")"
  [[ -n "$out" ]] || continue
  ALL_REG_ROWS_RAW="${ALL_REG_ROWS_RAW}${ALL_REG_ROWS_RAW:+$'\n'}${out}"
done

# Sentinel rows (__NO_VALUE_COLUMN__, __NO_LOCATION_COLUMN__,
# __MULTI_KEY_ROW__) carry signal for the findings below but must never
# enter the real key-matching logic (REG_KEYS, CONSUMER_ONLY,
# REGISTRY_ONLY, REGISTRY_MISMATCH, retirement/stale, PLAINTEXT_IN_REGISTRY)
# — they are not credentials. Known low-likelihood collision: all three
# sentinel strings match the real key-shape regex (^[A-Z_][A-Z0-9_]*$), so
# a registry row whose actual Env var cell was literally one of these
# strings would be swept in here and vanish from every other check with no
# error. Not guarded against — the name shape is unusual enough that this
# is judged not worth the added complexity of a reserved-name check.
NO_VALUE_COL_ROWS=$(printf '%s\n' "$ALL_REG_ROWS_RAW" | awk -F'\t' '$2=="__NO_VALUE_COLUMN__" {print}' || true)
NO_LOC_COL_ROWS=$(printf '%s\n' "$ALL_REG_ROWS_RAW" | awk -F'\t' '$2=="__NO_LOCATION_COLUMN__" {print}' || true)
NO_LOC_REGFILES=$(printf '%s\n' "$NO_LOC_COL_ROWS" | awk -F'\t' '{print $1}' | grep -v '^$' || true)
MULTI_KEY_ROWS=$(printf '%s\n' "$ALL_REG_ROWS_RAW" | awk -F'\t' '$2=="__MULTI_KEY_ROW__" {print}' || true)
ALL_REG_ROWS=$(printf '%s\n' "$ALL_REG_ROWS_RAW" | awk -F'\t' '$2!="__NO_VALUE_COLUMN__" && $2!="__NO_LOCATION_COLUMN__" && $2!="__MULTI_KEY_ROW__" {print}' || true)
REG_KEYS=$(printf '%s\n' "$ALL_REG_ROWS" | awk -F'\t' '{print $2}' | sort -u | grep -v '^$' || true)

# PLAINTEXT_IN_REGISTRY — hard fail, runs FIRST. This is the tool's one
# enforced guarantee: it must complete and report before any other finding
# class gets a chance to abort the run on unrelated free text (CRITICAL
# finding from adversarial review — an ordinary "->" in some other row's
# Tier/Location cell used to be able to kill the whole script, via
# _safe_echo, before this check ever ran).
HARD_FAIL=0
while IFS= read -r row; do
  [[ -n "$row" ]] || continue
  regfile=$(printf '%s' "$row" | awk -F'\t' '{print $1}')
  key=$(printf '%s' "$row" | awk -F'\t' '{print $2}')
  val=$(printf '%s' "$row" | awk -F'\t' '{print $9}')
  if [[ -n "$val" ]]; then
    fp=$(fingerprint "$val")
    _safe_echo "PLAINTEXT_IN_REGISTRY:${key}:${regfile}:fingerprint=${fp}"
    HARD_FAIL=1
  fi
done <<< "$ALL_REG_ROWS"

# PLAINTEXT_CHECK_SKIPPED — a table with no Value-like column resolved is
# NOT the same as a table that was checked and found clean; say so instead
# of letting the two look identical (the other half of the CRITICAL finding
# above — a "Value" column renamed to "Secret"/"Plaintext" used to switch
# the hard-fail check off with zero signal).
while IFS= read -r row; do
  [[ -n "$row" ]] || continue
  regfile=$(printf '%s' "$row" | awk -F'\t' '{print $1}')
  _safe_echo "PLAINTEXT_CHECK_SKIPPED:${regfile}:no Value-like column resolved for one of its tables"
done <<< "$NO_VALUE_COL_ROWS"

# LOCATION_CHECK_SKIPPED — same shape as the Value-column case above: a
# table with no Location-like column resolved would otherwise leave loc=""
# for every one of its rows, which makes REGISTRY_LOCATION_MISMATCH fire
# for every live+registered key in that table — a guaranteed false
# positive indistinguishable from a real drift finding (HIGH finding,
# /finish code review). NO_LOC_REGFILES (built above) is what the
# REGISTRY_ONLY/REGISTRY_LOCATION_MISMATCH loop below skips against.
while IFS= read -r row; do
  [[ -n "$row" ]] || continue
  regfile=$(printf '%s' "$row" | awk -F'\t' '{print $1}')
  _safe_echo "LOCATION_CHECK_SKIPPED:${regfile}:no Location-like column resolved for one of its tables"
done <<< "$NO_LOC_COL_ROWS"

# MULTI_KEY_ROW_BUNDLED — a row bundling multiple keys shares one Tier
# across keys that may have different sensitivity; surface it so a wrong-
# but-internally-consistent tier on a bundled row doesn't hide silently.
while IFS= read -r row; do
  [[ -n "$row" ]] || continue
  regfile=$(printf '%s' "$row" | awk -F'\t' '{print $1}')
  bundled=$(printf '%s' "$row" | awk -F'\t' '{print $3}')
  _safe_echo "MULTI_KEY_ROW_BUNDLED:${regfile}:${bundled}"
done <<< "$MULTI_KEY_ROWS"

# CONSUMER_ONLY — live key, in no registry at all.
CONSUMER_ONLY_KEYS=$(comm -23 <(printf '%s\n' "$LIVE_KEYS") <(printf '%s\n' "$REG_KEYS") 2>/dev/null | grep -v '^$' || true)
for key in $CONSUMER_ONLY_KEYS; do
  loc=$(printf '%s\n' "$LIVE_CLASSIFIED" | awk -F: -v k="$key" '$2==k {print $3":"$4; exit}')
  _safe_echo "CONSUMER_ONLY:${key}:${loc}"
done

# REGISTRY_ONLY / REGISTRY_LOCATION_MISMATCH — per registry row.
while IFS= read -r row; do
  [[ -n "$row" ]] || continue
  regfile=$(printf '%s' "$row" | awk -F'\t' '{print $1}')
  key=$(printf '%s' "$row" | awk -F'\t' '{print $2}')
  loc=$(printf '%s' "$row" | awk -F'\t' '{print $3}')
  is_live=$(printf '%s\n' "$LIVE_KEYS" | grep -Fxq "$key" && echo yes || echo no)
  if [[ "$is_live" == "no" ]]; then
    _safe_echo "REGISTRY_ONLY:${key}:${regfile}"
    continue
  fi
  if printf '%s\n' "$NO_LOC_REGFILES" | grep -Fxq "$regfile"; then
    continue
  fi
  claimed="${ENV_DIR}/${loc}"
  found_matches=$(printf '%s\n' "$LIVE_CLASSIFIED" | awk -F: -v k="$key" '$2==k {print $3}')
  location_ok="no"
  for fpath in $found_matches; do
    if [[ "$(basename "$fpath")" == "$loc" ]]; then
      location_ok="yes"
      break
    fi
  done
  if [[ "$location_ok" == "no" ]]; then
    found_first=$(printf '%s\n' "$found_matches" | head -1)
    _safe_echo "REGISTRY_LOCATION_MISMATCH:${key}:${regfile}:claimed=${claimed}:found=${found_first}"
  fi
done <<< "$ALL_REG_ROWS"

# REGISTRY_MISMATCH — same key, differing tier, across ALL registries that
# carry it (not just the first two — an earlier version only ever compared
# rows 1 and 2, silently dropping a 3rd+ registry's disagreement).
DUP_KEYS=$(printf '%s\n' "$ALL_REG_ROWS" | awk -F'\t' '{print $2}' | sort | uniq -d | grep -v '^$' || true)
for key in $DUP_KEYS; do
  rows=$(printf '%s\n' "$ALL_REG_ROWS" | awk -F'\t' -v k="$key" '$2==k {print $1"\t"$5}')
  reg_a=$(printf '%s\n' "$rows" | sed -n '1p' | awk -F'\t' '{print $1}')
  tier_a=$(printf '%s\n' "$rows" | sed -n '1p' | awk -F'\t' '{print $2}')
  row_count=$(printf '%s\n' "$rows" | grep -vc '^$' || true)
  n=2
  while [[ "$n" -le "$row_count" ]]; do
    reg_n=$(printf '%s\n' "$rows" | sed -n "${n}p" | awk -F'\t' '{print $1}')
    tier_n=$(printf '%s\n' "$rows" | sed -n "${n}p" | awk -F'\t' '{print $2}')
    if [[ -n "$reg_n" && "$tier_a" != "$tier_n" ]]; then
      _safe_echo "REGISTRY_MISMATCH:${key}:${reg_a}:tier=${tier_a}:${reg_n}:tier=${tier_n}"
    fi
    n=$((n + 1))
  done
done

# RETIREMENT_CANDIDATE / CONSUMER_LIST_STALE — needs --consumers-dir.
if [[ ${#CONSUMERS_DIRS[@]} -gt 0 ]]; then
  LIVE_AND_REGISTERED=$(comm -12 <(printf '%s\n' "$LIVE_KEYS") <(printf '%s\n' "$REG_KEYS") 2>/dev/null | grep -v '^$' || true)
  for key in $LIVE_AND_REGISTERED; do
    row=$(printf '%s\n' "$ALL_REG_ROWS" | awk -F'\t' -v k="$key" '$2==k {print; exit}')
    regfile=$(printf '%s' "$row" | awk -F'\t' '{print $1}')
    cons=$(printf '%s' "$row" | awk -F'\t' '{print $4}')
    documented=$(printf '%s\n' "$cons" | awk -F',' '{n=0; for(i=1;i<=NF;i++){t=$i; gsub(/^[ \t]+|[ \t]+$/,"",t); if(t!="") n++} print n}')
    live_n=$(grep -rl -- "$key" "${CONSUMERS_DIRS[@]}" 2>/dev/null | wc -l | tr -d ' ')
    if [[ "$live_n" -eq 0 ]]; then
      _safe_echo "RETIREMENT_CANDIDATE:${key}:${regfile}"
    elif [[ "$live_n" != "$documented" ]]; then
      _safe_echo "CONSUMER_LIST_STALE:${key}:${regfile}:documented=${documented}:live=${live_n}"
    fi
  done
fi

# NOT_ENUMERATED — operator-declared unreachable surfaces.
for pair in "${NOT_ENUM[@]:-}"; do
  [[ -n "$pair" ]] || continue
  name="${pair%%:*}"
  reason="${pair#*:}"
  _safe_echo "NOT_ENUMERATED:${name}:${reason}"
done
NOT_ENUM_COUNT=${#NOT_ENUM[@]}

# COVERAGE — total-reachable is every live key seen; classified is the
# subset also found in a registry. Not-enumerated surfaces are declared
# separately and never credited into either half of the ratio.
TOTAL_REACHABLE=$(printf '%s\n' "$LIVE_KEYS" | grep -v '^$' | wc -l | tr -d ' ')
CLASSIFIED_COUNT=$(comm -12 <(printf '%s\n' "$LIVE_KEYS") <(printf '%s\n' "$REG_KEYS") 2>/dev/null | grep -vc '^$' || true)
_safe_echo "COVERAGE:${CLASSIFIED_COUNT}/${TOTAL_REACHABLE}:not-enumerated=${NOT_ENUM_COUNT}"

if [[ "$HARD_FAIL" -eq 1 ]]; then
  exit 1
fi
exit 0
