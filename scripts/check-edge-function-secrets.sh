#!/bin/bash
# scripts/check-edge-function-secrets.sh — P834 deploy-time guard.
#
# Output contract (shell-safety): every status line uses ':' as separator.
# Never emit '>', '<', or '|' as separators — those tokens get re-parsed
# as redirects if a caller pipes us into eval. See .claude/rules/shell-safety.md.
#
# Usage:
#   ./scripts/check-edge-function-secrets.sh --parse-only [--scan-dir DIR]
#       Static scan only. No network. Exits 0 always; lists vars by class.
#       Wired into pre-commit to catch parse regressions early.
#
#   ./scripts/check-edge-function-secrets.sh --env test|prod
#   ./scripts/check-edge-function-secrets.sh --project-ref REF
#       Static scan + diffs required vars against `supabase secrets list`.
#       Exits non-zero if any required var is missing on the target project.
#       Run before `supabase functions deploy`.
#
#   ./scripts/check-edge-function-secrets.sh --self-test
#       Hermetic regression check. Builds a fixture with a fake required var,
#       runs --parse-only, asserts the fake var is in the REQUIRED bucket.

set -e

# Shell-safety enforcement (P783): route every status line through this helper.
# Aborts with exit 3 if any output contains '>', '<', or '|' anywhere — those
# tokens re-lex as redirects if a caller routes our stdout through eval.
# See .claude/rules/shell-safety.md.
_safe_echo() {
  local line="$1"
  if [[ "$line" == *'>'* || "$line" == *'<'* || "$line" == *'|'* ]]; then
    echo "FATAL: check-edge-function-secrets.sh attempted unsafe output: $line" >&2
    exit 3
  fi
  echo "$line"
}

SCAN_DIR=""
MODE="check"   # check | parse-only | self-test
ENV_NAME=""
PROJECT_REF=""

while [ $# -gt 0 ]; do
  case "$1" in
    --parse-only) MODE="parse-only"; shift ;;
    --self-test)  MODE="self-test"; shift ;;
    --scan-dir)   SCAN_DIR="$2"; shift 2 ;;
    --scan-dir=*) SCAN_DIR="${1#--scan-dir=}"; shift ;;
    --env)        ENV_NAME="$2"; shift 2 ;;
    --env=*)      ENV_NAME="${1#--env=}"; shift ;;
    --project-ref) PROJECT_REF="$2"; shift 2 ;;
    --project-ref=*) PROJECT_REF="${1#--project-ref=}"; shift ;;
    -h|--help)
      sed -n '1,30p' "$0" | grep -E '^#( |!)' | sed 's/^# \{0,1\}//'
      exit 0
      ;;
    *)
      _safe_echo "ERROR: unknown arg: $1" >&2
      exit 2
      ;;
  esac
done

# Supabase auto-provisions these for every edge function — they always
# exist at runtime regardless of `supabase secrets list` output, so we
# exclude them from the required-on-target check.
SUPABASE_BUILTINS="SUPABASE_URL SUPABASE_ANON_KEY SUPABASE_SERVICE_ROLE_KEY SUPABASE_DB_URL"

is_builtin() {
  local name="$1"
  case " $SUPABASE_BUILTINS " in
    *" $name "*) return 0 ;;
    *) return 1 ;;
  esac
}

# parse_functions <dir>
# Emits one line per Deno.env.get call:
#   <classification>:<var_name>:<file>:<line>
# Where classification is one of:
#   required       — no `?? ...` fallback (hard-fail on undefined)
#   required-empty — `?? ''` or `?? ""` (degraded — empty string is unusable)
#   optional       — `?? '<real-default>'` (safe fallback)
parse_functions() {
  local dir="$1"
  # Pure POSIX-awk parser. Reads each .ts file as a single buffer (multiline)
  # so that `?? '...'` on a continuation line is still classified correctly.
  # Classification by what follows the closing paren of Deno.env.get(NAME):
  #   nothing significant      → required
  #   ?? '' or ?? ""           → required-empty
  #   ?? '<non-empty default>' → optional
  local files
  files=$(find "$dir" -type f -name '*.ts' 2>/dev/null)
  [ -z "$files" ] && return 0

  for f in $files; do
    awk -v fname="$f" '
      # Slurp the whole file into one string with literal "\n" between lines.
      { buf = (NR == 1 ? $0 : buf "\n" $0) }
      END {
        content = buf;
        # Track absolute character offset to recover line number.
        # We rebuild line index lazily.
        while ((idx = index(content, "Deno.env.get(")) > 0) {
          # Compute line number for the start of this match in the ORIGINAL buf.
          consumed_total = length(buf) - length(content) + idx - 1;
          # Walk consumed_total newlines from beginning of buf.
          prefix = substr(buf, 1, consumed_total);
          n = 1;
          for (i = 1; i <= length(prefix); i++) {
            if (substr(prefix, i, 1) == "\n") n++;
          }

          rest = substr(content, idx + length("Deno.env.get("));
          quote = substr(rest, 1, 1);
          if (quote != "\x27" && quote != "\x22") {
            content = substr(content, idx + 1);
            continue;
          }
          after_quote = substr(rest, 2);
          close_idx = index(after_quote, quote);
          if (close_idx == 0) {
            content = substr(content, idx + 1);
            continue;
          }
          name = substr(after_quote, 1, close_idx - 1);
          tail = substr(after_quote, close_idx + 1);
          if (substr(tail, 1, 1) != ")") {
            content = substr(content, idx + 1);
            continue;
          }
          tail = substr(tail, 2);
          # Collapse leading whitespace AND newlines so `?? ...` on next line counts.
          sub(/^[ \t\n]+/, "", tail);
          cls = "required";
          if (substr(tail, 1, 2) == "??") {
            after_qq = substr(tail, 3);
            sub(/^[ \t\n]+/, "", after_qq);
            if (substr(after_qq, 1, 2) == "\x27\x27" || substr(after_qq, 1, 2) == "\x22\x22") {
              cls = "required-empty";
            } else {
              cls = "optional";
            }
          }
          if (name ~ /^[A-Z_][A-Z0-9_]*$/) {
            print cls ":" name ":" fname ":" n;
          }
          content = substr(content, idx + length("Deno.env.get("));
        }
      }
    ' "$f"
  done | sort -u
}

emit_summary() {
  local parsed="$1"
  local required required_empty optional
  required=$(echo "$parsed" | awk -F: '$1=="required" {print $2}' | sort -u)
  required_empty=$(echo "$parsed" | awk -F: '$1=="required-empty" {print $2}' | sort -u)
  optional=$(echo "$parsed" | awk -F: '$1=="optional" {print $2}' | sort -u)

  _safe_echo "REQUIRED (no fallback): $(echo "$required" | grep -v '^$' | tr '\n' ' ' | sed 's/ $//')"
  _safe_echo "REQUIRED-EMPTY (?? empty-string): $(echo "$required_empty" | grep -v '^$' | tr '\n' ' ' | sed 's/ $//')"
  _safe_echo "OPTIONAL (?? default): $(echo "$optional" | grep -v '^$' | tr '\n' ' ' | sed 's/ $//')"
}

# --- self-test mode ---
if [ "$MODE" = "self-test" ]; then
  _safe_echo "self-test: building fixture in temp dir"
  TMPDIR_FIXTURE=$(mktemp -d)
  trap 'rm -rf "$TMPDIR_FIXTURE"' EXIT
  mkdir -p "$TMPDIR_FIXTURE/fake-fn"
  cat > "$TMPDIR_FIXTURE/fake-fn/index.ts" <<'TS_EOF'
// Fixture for check-edge-function-secrets.sh --self-test
const required = Deno.env.get('FAKE_REQUIRED_P834');
const requiredEmpty = Deno.env.get('FAKE_REQUIRED_EMPTY_P834') ?? '';
const optional = Deno.env.get('FAKE_OPTIONAL_P834') ?? 'default-value';
TS_EOF

  parsed=$(parse_functions "$TMPDIR_FIXTURE")
  _safe_echo "self-test: parser output:"
  # $parsed is single-script-emitted content (file:line tuples from our parser);
  # route through _safe_echo line-by-line so any regression containing a
  # redirect token aborts immediately rather than slipping through.
  while IFS= read -r line; do
    _safe_echo "$line"
  done <<< "$parsed"

  fail=0
  if ! echo "$parsed" | grep -q '^required:FAKE_REQUIRED_P834:'; then
    _safe_echo "FAIL: FAKE_REQUIRED_P834 not classified as required"
    fail=1
  fi
  if ! echo "$parsed" | grep -q '^required-empty:FAKE_REQUIRED_EMPTY_P834:'; then
    _safe_echo "FAIL: FAKE_REQUIRED_EMPTY_P834 not classified as required-empty"
    fail=1
  fi
  if ! echo "$parsed" | grep -q '^optional:FAKE_OPTIONAL_P834:'; then
    _safe_echo "FAIL: FAKE_OPTIONAL_P834 not classified as optional"
    fail=1
  fi

  if [ "$fail" -ne 0 ]; then
    _safe_echo "self-test: FAILED"
    exit 1
  fi
  _safe_echo "self-test: PASS"
  exit 0
fi

# --- default scan dir ---
if [ -z "$SCAN_DIR" ]; then
  ROOT=$(git -C "$(pwd)" rev-parse --show-toplevel 2>/dev/null || pwd)
  SCAN_DIR="$ROOT/supabase/functions"
fi

if [ ! -d "$SCAN_DIR" ]; then
  _safe_echo "ERROR: scan dir not found: $SCAN_DIR" >&2
  exit 2
fi

PARSED=$(parse_functions "$SCAN_DIR")

if [ -z "$PARSED" ]; then
  _safe_echo "WARN: no Deno.env.get calls found under $SCAN_DIR"
  exit 0
fi

emit_summary "$PARSED"

# --- parse-only mode: stop here ---
if [ "$MODE" = "parse-only" ]; then
  exit 0
fi

# --- check mode: query supabase secrets list and diff ---
# Resolve project ref + access token.
if [ -n "$ENV_NAME" ] && [ -z "$PROJECT_REF" ]; then
  ROOT=$(git -C "$(pwd)" rev-parse --show-toplevel 2>/dev/null || pwd)
  if [ "$ENV_NAME" = "prod" ]; then
    ENV_FILE="$ROOT/.env.prod"
    [ ! -f "$ENV_FILE" ] && ENV_FILE="$(dirname "$ROOT")/.env.prod"
    [ ! -f "$ENV_FILE" ] && ENV_FILE="$(git rev-parse --git-common-dir 2>/dev/null)/../.env.prod"
  else
    ENV_FILE="$ROOT/.env.local"
  fi
  if [ ! -f "$ENV_FILE" ]; then
    _safe_echo "ERROR: env file not found for --env $ENV_NAME (looked for $ENV_FILE)" >&2
    exit 2
  fi
  SUPABASE_URL_VAL=$(grep "^VITE_SUPABASE_URL=" "$ENV_FILE" | cut -d= -f2-)
  PROJECT_REF=$(echo "$SUPABASE_URL_VAL" | sed 's|https://||' | cut -d. -f1)
  PAT=$(grep "^SUPABASE_ACCESS_TOKEN=" "$ENV_FILE" | cut -d= -f2- || true)
  if [ -z "$PAT" ]; then
    PAT_RAW=$(security find-generic-password -s "Supabase CLI" -w 2>/dev/null || true)
    if [ -n "$PAT_RAW" ]; then
      PAT=$(echo "$PAT_RAW" | sed 's/go-keyring-base64://' | base64 -d 2>/dev/null || true)
    fi
  fi
  export SUPABASE_ACCESS_TOKEN="$PAT"
fi

if [ -z "$PROJECT_REF" ]; then
  _safe_echo "ERROR: need --env test or --env prod or --project-ref REF for check mode" >&2
  exit 2
fi

if ! command -v supabase >/dev/null 2>&1; then
  _safe_echo "ERROR: supabase CLI not found in PATH" >&2
  exit 2
fi

_safe_echo "Querying secrets on project: $PROJECT_REF"
# supabase secrets list emits a table with the NAME column. Extract names.
SECRETS_RAW=$(supabase secrets list --project-ref "$PROJECT_REF" 2>&1) || {
  _safe_echo "ERROR: supabase secrets list failed:" >&2
  # Foreign output may contain anything; print raw to stderr without _safe_echo
  # so we still surface diagnostics even if the response is malformed.
  printf '%s\n' "$SECRETS_RAW" >&2
  exit 2
}

# Parse secret names — supports both JSON ({"secrets":[{"name":"X",...}]}) and
# legacy table output (NAME column header + rows). JSON is the current CLI format.
if echo "$SECRETS_RAW" | grep -q '"secrets"'; then
  # JSON format: extract "name":"VALUE" entries
  SECRETS_PRESENT=$(echo "$SECRETS_RAW" | grep -o '"name":"[^"]*"' | cut -d'"' -f4)
else
  # Legacy table format: skip header and separator rows
  SECRETS_PRESENT=$(echo "$SECRETS_RAW" | awk '
    /^[[:space:]]*NAME[[:space:]]/ { in_table=1; next }
    /^[[:space:]]*[-=][-=]/ { next }
    in_table && /^[[:space:]]*[A-Z_]+/ {
      name=$1; sub(/[[:space:]].*/, "", name);
      if (length(name) > 0) print name;
    }
  ')
fi

# Build the required-on-target list = REQUIRED (no fallback) ∪ REQUIRED-EMPTY,
# minus Supabase built-ins.
TO_VERIFY=$(echo "$PARSED" | awk -F: '$1=="required" || $1=="required-empty" {print $2}' | sort -u)

MISSING=""
for var in $TO_VERIFY; do
  if is_builtin "$var"; then
    continue
  fi
  if ! echo "$SECRETS_PRESENT" | grep -qx "$var"; then
    MISSING="$MISSING $var"
  fi
done

MISSING=$(echo "$MISSING" | sed 's/^ //')

if [ -n "$MISSING" ]; then
  _safe_echo ""
  _safe_echo "FAIL: required edge function secrets missing on project $PROJECT_REF:"
  for var in $MISSING; do
    # Show one referencing site per var.
    site=$(echo "$PARSED" | awk -F: -v v="$var" '$2==v {print $3":"$4; exit}')
    _safe_echo "  - $var (referenced at $site)"
  done
  _safe_echo ""
  _safe_echo "Set with: SUPABASE_ACCESS_TOKEN=... supabase secrets set VAR=value --project-ref $PROJECT_REF"
  exit 1
fi

_safe_echo ""
_safe_echo "OK: all required edge function secrets present on $PROJECT_REF"
exit 0
