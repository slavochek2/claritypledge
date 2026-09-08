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
#   scripts/audit-credential-drift.sh --gate-workflows \
#       --workflows-dir DIR [--workflows-dir DIR ...] \
#       --registry FILE [--registry FILE ...]
#       CI-secret registration gate (P1267). Every `secrets.NAME` reference in
#       every workflow file under the given dirs must have a row in some
#       registry. Exit 1 if any does not. Hermetic: no network, no `gh`, no
#       `supabase` — the GitHub secrets STORE is unreachable by design
#       (the agent's token has no Administration scope), so this checks
#       registration, never provisioning. Needs no --env-dir.
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
#   WORKFLOW_REF:<KEY>:<file>:<line>                                   every reference, none dropped
#   WORKFLOW_BUILTIN:<KEY>:<file>:<line>                               platform-provided, unregisterable
#   WORKFLOW_UNREGISTERED:<KEY>:<file>:<line>                          workflow -> registry (gate fails)
#   REGISTRY_LOCATION_NONFILE:<KEY>:<registry-file>:<loc>              location is not a file path
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

# _tier_token CELL — reduce a registry Tier cell to its bare classification
# token, or return 1 if the cell states none (P1153 D-3).
#
# Registry cells carry a token plus an explanatory parenthetical, and the
# two registries word those parentheticals differently for the same tier:
#     `not-a-secret` (domain name + region code)
#     `not-a-secret` (domain name, not a credential)
# Comparing whole cells reported those as drift. Comparing tokens does not.
#
# The token must be a member of the known tier vocabulary. Matching "the
# first backticked span" instead was wrong: real registry cells embed other
# backticked identifiers in their prose — one live cell reads
#   Never (changing it invalidates all existing `request_hash` rows ...)
# — and taking the first span reports `request_hash` as the classification,
# which both states a bogus tier and reintroduces the very false-drift this
# function exists to remove. Found in code review, reproduced against a
# synthetic copy of that shape.
#
# TIER_VOCAB is the whole classification vocabulary. Keeping it closed is
# deliberate: an unrecognised token yields NO token, so the caller reports
# TIER_UNCLASSIFIABLE and a human sees it. That is the correct failure
# direction — a newly-introduced tier surfaces loudly on its first run
# instead of being silently trusted and mis-compared. Extend this list when
# a tier is genuinely added.
TIER_VOCAB="auto-api manual-only never-rotate not-a-secret"

# _tier_token CELL — the cell's tier token, or return 1 if it states none.
# Searches the cell for any vocabulary member, backticked or bare, so both
# the newer `manual-only` style and the older bare manual-only style work,
# and leading prose ("candidate `manual-only` — founder to confirm") does
# not defeat it.
_tier_token() {
  local cell="$1" t
  for t in $TIER_VOCAB; do
    if printf '%s' "$cell" | grep -qE "(^|[^A-Za-z0-9_-])${t}([^A-Za-z0-9_-]|$)"; then
      printf '%s' "$t"
      return 0
    fi
  done
  return 1
}

# _consumer_read_re KEY — an ERE matching an explicit READ of KEY (P1153 D-2).
#
# Used for MARKDOWN only; code files use the whole-word matcher below. See
# _count_live_consumers for why the two tiers exist.
#
# The original matcher was `grep -rl -- "$key"`, a bare substring search,
# which failed in two directions at once:
#   (a) prefix collision — a file reading FOO_KEY_EXTRA counted as a consumer
#       of FOO_KEY, hiding genuine retirement candidates. Every alternative
#       below therefore ends in an explicit non-identifier boundary; the
#       quoted forms get that boundary from their closing quote.
#   (b) prose counted as use — a doc naming a retired credential must not
#       make it read as live.
#
# `[A-Za-z_][A-Za-z0-9_]*\.KEY` covers the object-dereference form this repo
# actually uses (`env.OPS_EMAIL`, `envLocal.PROD_ALIGN_AGENT_PASSWORD`),
# where .env.local is parsed into an object and read as properties rather
# than through process.env. Omitting it produced 5 false retirements against
# real data on the first attempt at this fix.
_consumer_read_re() {
  local k="$1"
  local b="([^A-Za-z0-9_]|$)"
  local q="['\"]"
  printf '%s' "([A-Za-z_][A-Za-z0-9_]*\.${k}${b}\
|process\.env\[${q}${k}${q}\
|Deno\.env\.get\(${q}${k}${q}\
|os\.getenv\(${q}${k}${q}\
|os\.environ\[${q}${k}${q}\
|os\.environ\.get\(${q}${k}${q}\
|getenv\(${q}${k}${q}\
|\\\$\{${k}\}\
|\\\$${k}${b})"
}

# _count_live_consumers KEY — how many files under the scanned surfaces
# actually consume KEY. Two tiers, because "what counts as a read" genuinely
# differs by file type (P1153 D-2):
#
#   CODE  — a whole-word occurrence of the key counts. Code has many valid
#           read forms and inventing a complete list of them is what failed:
#           an explicit-pattern-only matcher missed `env.KEY` dereferences and
#           a regex that extracts the key from raw .env text, reporting 5 live
#           credentials as retirement candidates. A name appearing whole-word
#           in a source file is a sound proxy for use, and word-boundary
#           matching still defeats the prefix collision (`_` is a word
#           character, so KEY does not match inside KEY_EXTRA).
#
#   MARKDOWN — requires an explicit read form. Markdown is where prose lives,
#           and prose naming a credential is not a consumer. This is what lets
#           the scan safely include .claude/commands (skill files that really
#           do read credentials) without every doc mention reading as live.
#
# Counting distinct FILES, matching the previous behaviour, so `documented`
# vs `live` stays comparable across this change.
# Every --include MUST precede the `--` terminator. `--` ends option parsing,
# so an --include placed after it is taken as a FILENAME: BSD grep (what a
# script gets from /usr/bin/grep on macOS) then warns "No such file or
# directory" to stderr — which this function discards — and scans EVERY file
# type anyway. The filters silently do nothing, markdown prose is read as
# code, and the over-widening guard this tier exists to provide is gone.
# Verified against /usr/bin/grep 2.6.0-FreeBSD: flags after `--` scan .md,
# flags before it do not.
_count_live_consumers() {
  local k="$1" code_hits md_hits
  code_hits=$(grep -rlE \
    --include='*.ts' --include='*.tsx' --include='*.js' --include='*.jsx' \
    --include='*.mjs' --include='*.cjs' --include='*.py' --include='*.sh' \
    --include='*.yml' --include='*.yaml' --include='*.toml' --include='*.json' \
    -- "(^|[^A-Za-z0-9_])${k}([^A-Za-z0-9_]|$)" \
    "${CONSUMERS_DIRS[@]}" 2>/dev/null || true)
  md_hits=$(grep -rlE --include='*.md' \
    -- "$(_consumer_read_re "$k")" "${CONSUMERS_DIRS[@]}" 2>/dev/null || true)
  # P1267 — a workflow that reads a secret IS a consumer of it. Without this,
  # correctly registering a CI-only credential immediately reports it as a
  # RETIREMENT_CANDIDATE ("documented, nothing uses it"), because
  # .github/workflows is not a --consumers-dir and cannot become one: the
  # markdown/code tiers above would then match the credential's own registry
  # prose. Measured on the real tree — the first correct backfill under this
  # spec pushed RETIREMENT_CANDIDATE from 28 to 29. Same harm as the is_live
  # gap this spec fixes, reached through a different function, and the reason
  # the before/after diff is one of its acceptance criteria.
  wf_hits=$(printf '%s\n' "${WORKFLOW_FINDINGS:-}" \
    | awk -F: -v k="$k" '$1=="WORKFLOW_REF" && $2==k {print $3}' | grep -v '^$' || true)
  printf '%s\n%s\n%s\n' "$code_hits" "$md_hits" "$wf_hits" | grep -v '^$' | sort -u | grep -c '' || true
}

MODE=""
ENV_DIR=""
CONSUMERS_DIRS=()
REGISTRIES=()
NOT_ENUM=()
WORKFLOWS_DIRS=()
WORKFLOW_FINDINGS=""

# Platform-provided secrets: GitHub Actions injects these into every workflow
# run. They have no registry row because there is nothing to register — no
# human ever created the value and no rotation applies. Flagging one would be
# a false positive on a credential that CANNOT be registered, which is the
# false-positive class epistemic gate 7c exists to catch (P1267 critique C3).
# This repo writes `github.token` today, so nothing here fires yet; the list
# exists so the first workflow written the other way does not block a commit.
# Same reasoning as check-edge-function-secrets.sh excluding the Supabase
# built-ins from its required-secrets set.
WORKFLOW_BUILTINS="GITHUB_TOKEN"

while [ $# -gt 0 ]; do
  case "$1" in
    --parse-only) MODE="parse-only"; shift ;;
    --audit) MODE="audit"; shift ;;
    --gate-workflows) MODE="gate-workflows"; shift ;;
    --workflows-dir) WORKFLOWS_DIRS+=("$2"); shift 2 ;;
    --workflows-dir=*) WORKFLOWS_DIRS+=("${1#--workflows-dir=}"); shift ;;
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
# --gate-workflows reads workflow files and registries only; it never looks at
# an env file, so requiring --env-dir there would be ceremony that also makes
# the gate unrunnable from a checkout that has no env files (CI, a fresh clone).
if [[ "$MODE" != "gate-workflows" ]]; then
  if [[ -z "$ENV_DIR" || ! -d "$ENV_DIR" ]]; then
    _safe_echo "ERROR: --env-dir DIR required and must exist" >&2
    exit 2
  fi
fi
if [[ "$MODE" == "audit" && ${#REGISTRIES[@]} -eq 0 ]]; then
  _safe_echo "ERROR: --audit requires at least one --registry FILE" >&2
  exit 2
fi
if [[ "$MODE" == "gate-workflows" ]]; then
  if [[ ${#REGISTRIES[@]} -eq 0 ]]; then
    _safe_echo "ERROR: --gate-workflows requires at least one --registry FILE" >&2
    exit 2
  fi
  if [[ ${#WORKFLOWS_DIRS[@]} -eq 0 ]]; then
    _safe_echo "ERROR: --gate-workflows requires at least one --workflows-dir DIR" >&2
    exit 2
  fi
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

# Same reasoning for --consumers-dir, and the consequence is worse. The
# consumer grep discards stderr, so a typo'd, stale or unmounted path
# returns empty for EVERY key and every live credential is reported as a
# RETIREMENT_CANDIDATE at exit 0 — a false alarm as indistinguishable from a
# real result as the false all-clear this script was fixed for. Measured
# before this check existed: two live, correctly-read credentials both
# reported for retirement, no error, exit 0. A path may be a directory or a
# single file (e.g. a build config at the repo root), so test -e, not -d.
for c in "${CONSUMERS_DIRS[@]:-}"; do
  [[ -n "$c" ]] || continue
  if [[ ! -e "$c" || ! -r "$c" ]]; then
    _safe_echo "ERROR: --consumers-dir not found or unreadable: $c" >&2
    exit 2
  fi
done

# A missing --workflows-dir must abort, never scan-nothing-and-pass. A gate
# that silently finds zero references reports "all registered" for a repo it
# never read — the all-pass form of the false-clean this script was fixed for
# (P1153), and the one a gate is least likely to have its failure path
# exercised against.
for w in "${WORKFLOWS_DIRS[@]:-}"; do
  [[ -n "$w" ]] || continue
  if [[ ! -e "$w" || ! -r "$w" ]]; then
    _safe_echo "ERROR: --workflows-dir not found or unreadable: $w" >&2
    exit 2
  fi
done

# list_workflow_files DIR — every YAML file under DIR, sorted. A path may be a
# single file as well as a directory, matching --consumers-dir's contract.
list_workflow_files() {
  find "$1" -type f \( -name '*.yml' -o -name '*.yaml' \) 2>/dev/null | sort
}

# parse_workflow_refs — one line per `secrets.NAME` occurrence across every
# --workflows-dir, in file order. Emits WORKFLOW_BUILTIN for platform-provided
# names and WORKFLOW_REF for everything else, so no occurrence is silently
# dropped (same contract as --parse-only: every reachable line accounted for).
#
# find|while rather than `grep -r --include`: on this platform /usr/bin/grep is
# BSD grep, where an --include placed after grep's `--` terminator is read as a
# FILENAME, the warning goes to a discarded stderr, and no filter is applied at
# all — the exact defect P1153 found in this script's consumer scan. Not
# reintroducing the shape is cheaper than re-deriving the flag order.
parse_workflow_refs() {
  local d f ln match key
  for d in "${WORKFLOWS_DIRS[@]}"; do
    while IFS= read -r f; do
      [[ -n "$f" ]] || continue
      while IFS=: read -r ln match; do
        [[ -n "$match" ]] || continue
        # Two spellings, both direct references: `secrets.NAME` and GitHub's
        # equally valid `secrets['NAME']` / `secrets["NAME"]`. Covering only the
        # dot form would leave a one-character evasion that passes the gate
        # silently — not the same thing as the `env.X` indirection this spec
        # explicitly ACCEPTS as out of scope.
        #
        # The match carries its left-boundary character (see the grep below), so
        # strip through the LAST "secrets." / "secrets[" rather than a prefix.
        # Patterns are quoted: an unquoted `secrets[` in a parameter expansion
        # opens an unterminated bracket expression.
        case "$match" in
          *"secrets["*)
            key="${match##*"secrets["}"; key="${key%\]}"
            key="${key#\'}"; key="${key%\'}"; key="${key#\"}"; key="${key%\"}" ;;
          *) key="${match##*secrets.}" ;;
        esac
        if printf '%s\n' $WORKFLOW_BUILTINS | grep -Fxq "$key"; then
          _safe_echo "WORKFLOW_BUILTIN:${key}:${f}:${ln}"
        else
          _safe_echo "WORKFLOW_REF:${key}:${f}:${ln}"
        fi
      # The left boundary excludes `.` and `-` as well as identifier characters,
      # and `\b` is NOT sufficient: in `steps.check-secrets.outputs.value` there
      # IS a word boundary before "secrets" (the hyphen), so `\bsecrets\.` matches
      # `secrets.outputs` and hard-blocks a workflow containing no secret at all.
      # Verified: `\b` rejects `mysecrets.FOO` but still accepts `check-secrets.
      # outputs`, which is the realistic shape — a step id ending in "-secrets"
      # is ordinary Actions style. This false positive would refuse a legitimate
      # commit, the one failure mode this gate's own risk table calls
      # non-negotiable.
      done < <(/usr/bin/grep -noE "(^|[^A-Za-z0-9_.-])secrets\.[A-Za-z_][A-Za-z0-9_]*|(^|[^A-Za-z0-9_.-])secrets\[['\"][A-Za-z_][A-Za-z0-9_]*['\"]\]" "$f" 2>/dev/null || true)
    done < <(list_workflow_files "$d")
  done
}

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

ENV_FILES=""
[[ -n "$ENV_DIR" ]] && ENV_FILES=$(list_env_files "$ENV_DIR")

# reg_keys_from_registries — the registered key set, sentinel rows removed.
# Shared by --gate-workflows and --audit so the two modes can never disagree
# about what "registered" means.
reg_keys_from_registries() {
  local r out raw=""
  for r in "${REGISTRIES[@]}"; do
    out="$(parse_registry "$r")"
    [[ -n "$out" ]] || continue
    raw="${raw}${raw:+$'\n'}${out}"
  done
  printf '%s\n' "$raw" \
    | awk -F'\t' '$2!="__NO_VALUE_COLUMN__" && $2!="__NO_LOCATION_COLUMN__" && $2!="__MULTI_KEY_ROW__" {print $2}' \
    | sort -u | grep -v '^$' || true
}

# ── gate-workflows mode (P1267) ─────────────────────────────────────────
# The one enforced claim: every non-builtin `secrets.NAME` a workflow reads has
# a row in some registry. It CANNOT claim the value exists in GitHub — that
# store returns HTTP 403 to this repo's credential by design (P970/P919
# deliberately withheld Administration scope), and making it readable would
# mean the enforced party could administer its own gate. Registration is what
# is checkable here, so registration is all this says.
if [[ "$MODE" == "gate-workflows" ]]; then
  GATE_REG_KEYS=$(reg_keys_from_registries)
  GATE_REFS=$(parse_workflow_refs)
  _safe_echo "$GATE_REFS" | grep -v '^$' || true

  GATE_FAIL=0
  GATE_SEEN=""
  while IFS= read -r line; do
    [[ -n "$line" ]] || continue
    key=$(printf '%s' "$line" | awk -F: '{print $2}')
    loc=$(printf '%s' "$line" | awk -F: '{print $3":"$4}')
    if printf '%s\n' "$GATE_REG_KEYS" | grep -Fxq "$key"; then
      # Report each registered name once, not once per reference — the
      # allow-set is what gate 7c reads, and a count per call site would
      # bury it.
      if ! printf '%s\n' "$GATE_SEEN" | grep -Fxq "$key"; then
        _safe_echo "WORKFLOW_OK:${key}"
        GATE_SEEN="${GATE_SEEN}${GATE_SEEN:+$'\n'}${key}"
      fi
    else
      _safe_echo "WORKFLOW_UNREGISTERED:${key}:${loc}"
      GATE_FAIL=1
    fi
  done <<< "$(printf '%s\n' "$GATE_REFS" | grep '^WORKFLOW_REF:' || true)"

  if [[ "$GATE_FAIL" -eq 1 ]]; then
    _safe_echo "GATE:FAIL:a workflow reads a secret that no registry documents"
    exit 1
  fi
  _safe_echo "GATE:PASS:every workflow-referenced secret has a registry row"
  exit 0
fi

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

# P1267 (critique C1) — a credential that lives only in the CI secrets store is
# in no env file, so without this it fails the is_live test below and is
# reported REGISTRY_ONLY: "documented credential that lives nowhere". It lives
# somewhere; this script simply could not see there. Registering such a
# credential correctly would therefore have ADDED a drift finding to /weekly
# for every row added — the fix manufacturing the defect it exists to remove
# (the P1173 shape). Widening the live set is also exactly what the
# workflow-unregistered check needs, so one change serves both.
if [[ ${#WORKFLOWS_DIRS[@]} -gt 0 ]]; then
  WORKFLOW_FINDINGS="$(parse_workflow_refs)"
  [[ -n "$WORKFLOW_FINDINGS" ]] && _safe_echo "$WORKFLOW_FINDINGS"
  # Re-shaped as CLASSIFIED so the live set carries a real location: a
  # CONSUMER_ONLY finding for a CI-only key then names the workflow and line
  # that reads it, instead of an empty location cell.
  WF_AS_CLASSIFIED=$(printf '%s\n' "$WORKFLOW_FINDINGS" \
    | grep '^WORKFLOW_REF:' | sed 's/^WORKFLOW_REF:/CLASSIFIED:/' || true)
  if [[ -n "$WF_AS_CLASSIFIED" ]]; then
    LIVE_CLASSIFIED="${LIVE_CLASSIFIED}${LIVE_CLASSIFIED:+$'\n'}${WF_AS_CLASSIFIED}"
  fi
fi

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

# WORKFLOW_UNREGISTERED — a workflow reads a secret no registry documents.
# Informational HERE on purpose: --audit's single enforced guarantee is
# PLAINTEXT_IN_REGISTRY, and /weekly reads that exit code. The blocking form of
# this same check is --gate-workflows, which pre-commit runs. Two modes, one
# definition of "registered" (reg_keys_from_registries), so they cannot drift.
if [[ -n "$WORKFLOW_FINDINGS" ]]; then
  while IFS= read -r line; do
    [[ -n "$line" ]] || continue
    wkey=$(printf '%s' "$line" | awk -F: '{print $2}')
    wloc=$(printf '%s' "$line" | awk -F: '{print $3":"$4}')
    if ! printf '%s\n' "$REG_KEYS" | grep -Fxq "$wkey"; then
      _safe_echo "WORKFLOW_UNREGISTERED:${wkey}:${wloc}"
    fi
  done <<< "$(printf '%s\n' "$WORKFLOW_FINDINGS" | grep '^WORKFLOW_REF:' || true)"
fi

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
  # P1267 (critique C2) — the comparison below resolves the Location cell
  # against a real file under ENV_DIR. That is only meaningful for locations
  # that ARE files. `github-actions`, `keyring`, `oauth`, `browser-auth`,
  # `ai-keys registry` name stores this script cannot open, so comparing them
  # to a basename yields a guaranteed non-match — a false REGISTRY_LOCATION_
  # MISMATCH indistinguishable from real drift, which is precisely the defect
  # class the LOCATION_CHECK_SKIPPED sentinel above was added to prevent.
  # Reported as its own token rather than suppressed: "not checkable here" and
  # "checked, agrees" must not look alike.
  # "Is this Location a file?" must use the SAME predicate list_env_files uses
  # (-name '*.env' -o -name '.env*'), not a narrower ad hoc one. An earlier
  # version tested `(^|/)\.env`, which calls a real suffix-form env file such as
  # `staging.env` a non-file and skips it — silently swallowing the genuine
  # location drift this script exists to catch, including the typo case
  # (`wrong-file.env`) that is the likeliest real instance.
  loc_base="${loc##*/}"
  if [[ "$loc_base" != *.env && "$loc_base" != .env* ]]; then
    _safe_echo "REGISTRY_LOCATION_NONFILE:${key}:${regfile}:${loc}"
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
  tok_a=$(_tier_token "$tier_a" || true)
  row_count=$(printf '%s\n' "$rows" | grep -vc '^$' || true)

  # A row whose tier cell yields no token is UNCLASSIFIABLE, never a match
  # (P1153 D-3). Comparing two token-less cells would let free prose in two
  # registries "agree" in silence — the same silent-skip-equals-clean trap
  # this spec exists to close, in its tier-comparison form.
  if [[ -z "$tok_a" ]]; then
    _safe_echo "TIER_UNCLASSIFIABLE:${key}:${reg_a}"
  fi

  n=2
  while [[ "$n" -le "$row_count" ]]; do
    reg_n=$(printf '%s\n' "$rows" | sed -n "${n}p" | awk -F'\t' '{print $1}')
    tier_n=$(printf '%s\n' "$rows" | sed -n "${n}p" | awk -F'\t' '{print $2}')
    tok_n=$(_tier_token "$tier_n" || true)
    if [[ -n "$reg_n" && -z "$tok_n" ]]; then
      _safe_echo "TIER_UNCLASSIFIABLE:${key}:${reg_n}"
    fi
    # Compare TOKENS, not whole cells. The cell carries an explanatory
    # parenthetical that legitimately differs between registries; comparing
    # cells made identical classifications read as drift (3 of 3 findings on
    # the first real run were of that shape). Only compare when BOTH sides
    # yielded a token — an unclassifiable row is reported above, not
    # silently treated as equal or unequal.
    if [[ -n "$reg_n" && -n "$tok_a" && -n "$tok_n" && "$tok_a" != "$tok_n" ]]; then
      _safe_echo "REGISTRY_MISMATCH:${key}:${reg_a}:tier=${tok_a}:${reg_n}:tier=${tok_n}"
    fi
    n=$((n + 1))
  done
done

# RETIREMENT_CANDIDATE / CONSUMER_LIST_STALE — needs --consumers-dir.
#
# Every finding below is bounded by WHERE this scan looked, and on the first
# real run that boundary WAS the finding: 21 of 41 retirement candidates
# were credentials read at build time, from a service tree, or by a skill
# file — none of which were being scanned. So the surfaces are emitted as
# output, making any future false retirement attributable from the report
# alone instead of requiring someone to re-derive the invocation.
if [[ ${#CONSUMERS_DIRS[@]} -gt 0 ]]; then
  for cdir in "${CONSUMERS_DIRS[@]}"; do
    _safe_echo "CONSUMER_SCAN:${cdir}"
  done
  LIVE_AND_REGISTERED=$(comm -12 <(printf '%s\n' "$LIVE_KEYS") <(printf '%s\n' "$REG_KEYS") 2>/dev/null | grep -v '^$' || true)
  for key in $LIVE_AND_REGISTERED; do
    row=$(printf '%s\n' "$ALL_REG_ROWS" | awk -F'\t' -v k="$key" '$2==k {print; exit}')
    regfile=$(printf '%s' "$row" | awk -F'\t' '{print $1}')
    cons=$(printf '%s' "$row" | awk -F'\t' '{print $4}')
    documented=$(printf '%s\n' "$cons" | awk -F',' '{n=0; for(i=1;i<=NF;i++){t=$i; gsub(/^[ \t]+|[ \t]+$/,"",t); if(t!="") n++} print n}')
    live_n=$(_count_live_consumers "$key")
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
#
# `unclassifiable` counts lines this script could not parse into a key at
# all (P1153 D-1). They are deliberately NOT folded into the ratio: a line
# with no usable key name cannot be "classified" against a registry, so
# adding it to the denominator would make the ratio permanently unclosable
# and would conflate "key nobody registered" with "line nobody could read".
# It is a separate, ALWAYS-PRESENT field instead — always present because a
# field that appears only on failure is a field nobody learns to look for.
#
# Why this exists: the first real run reported COVERAGE:84/84, a perfect
# score, while 10 lines carrying live credentials with non-shell-legal key
# names were dropped from both halves. Per-line reporting was honest the
# whole time (every one produced an UNPARSEABLE: line); only this summary
# could read clean while lines went unexamined. No summary may read fully
# clean when anything was skipped.
TOTAL_REACHABLE=$(printf '%s\n' "$LIVE_KEYS" | grep -v '^$' | wc -l | tr -d ' ')
CLASSIFIED_COUNT=$(comm -12 <(printf '%s\n' "$LIVE_KEYS") <(printf '%s\n' "$REG_KEYS") 2>/dev/null | grep -vc '^$' || true)
UNCLASSIFIABLE_COUNT=$(printf '%s\n' "$ENV_FINDINGS" | grep -c '^UNPARSEABLE:' || true)
_safe_echo "COVERAGE:${CLASSIFIED_COUNT}/${TOTAL_REACHABLE}:not-enumerated=${NOT_ENUM_COUNT}:unclassifiable=${UNCLASSIFIABLE_COUNT}"

if [[ "$HARD_FAIL" -eq 1 ]]; then
  exit 1
fi
exit 0
