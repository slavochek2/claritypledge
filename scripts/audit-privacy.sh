#!/bin/bash
# scripts/audit-privacy.sh — privacy audit for any git range / staged changes / message file.
# Exit 0 = clean, 1 = hits found, 2 = bad input.
# Modes:
#   --staged                    # scan staged diff (for pre-commit)
#   --msg <file>                # scan a commit-message file (for commit-msg hook)
#   <range>                     # scan git log -p <range> (for pre-push and manual audits)

# No `set -euo pipefail` — we catch errors explicitly. `|| true` on grep is intentional.

REPO_ROOT="$(git rev-parse --show-toplevel 2>/dev/null)" || { echo "Not a git repo"; exit 2; }
ALLOWLIST="$REPO_ROOT/.privacy-allowlist"
# Address-level allowlist for the general third-party-email check (P936). Distinct from
# ALLOWLIST above (which is path-based). Fail-OPEN: if absent/empty the email check is skipped
# (mirrors the .privacy-allowlist [ -s ] convention; see features/p936 D2 note). The email
# check runs on DIFF CONTENT ONLY — never commit messages (they carry Co-Authored-By trailers).
EMAIL_ALLOWLIST="$REPO_ROOT/.privacy-email-allowlist"
EMAIL_RE='[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}'

# Hard patterns. Word boundaries use the POSIX-portable anchors (^|[^[:alnum:]_]) ... ([^[:alnum:]_]|$)
# — NOT the BSD-grep extension [[:<:]]...[[:>:]]. GNU grep (Linux — the privacy-scan.yml CI runner,
# P919) does NOT support [[:<:]]: those patterns silently never match there, leaving the primary
# identifiers undetected server-side. macOS BSD grep hides this (it accepts [[:<:]]), so the gap only
# surfaces on the CI runner. Caught by the P919 privacy-scan CI run; do not reintroduce [[:<:]].
# Single-line each — no literal spaces that could trip command-line parsing.
# NOTE: `Kaka Mukaka` has a literal space — handled as a separate grep call below.
read -r -d '' HARD_PATTERNS <<'EOF' || true
(^|[^[:alnum:]_])slavochek@(googlemail|gmail)\.com([^[:alnum:]_]|$)
slavochek[+][a-zA-Z0-9]+@(googlemail|gmail)\.com
(^|[^[:alnum:]_])slavochek246([^[:alnum:]_]|$)
/Users/slavochek/
CLARITYPLEDGE-CANARY-DO-NOT-MERGE
EOF
# CLARITYPLEDGE-CANARY-DO-NOT-MERGE (P919/D6): a SYNTHETIC sentinel matching no real
# identifier. It exists solely to falsify the server-side privacy gate (the
# privacy-scan.yml required check) on a throwaway branch — proving the gate FIRES
# without ever planting real PII on the public remote. Any commit containing this
# literal is blocked by design. This very file + scripts/test-audit-privacy.sh are
# allowlisted in .privacy-allowlist, so defining the sentinel here does not block its
# own commit. Do not remove without retiring the Layer-A falsification harness.

# @inguro.com: allow slava@inguro.com only
INGURO_EXTRA='[a-zA-Z0-9._-]+@inguro\.com'
INGURO_ALLOW='slava@inguro\.com'

MODE="${1:-}"
MSGS=""  # commit messages for range mode (scanned separately, no allowlist)
case "$MODE" in
  --staged)
    DIFF=$(git diff --cached -- . ':(exclude)package-lock.json' ':(exclude)*.lock' 2>/dev/null)
    ;;
  --msg)
    shift
    MSG_FILE="${1:-}"
    [ -f "$MSG_FILE" ] || { echo "audit-privacy: message file not found: $MSG_FILE" >&2; exit 2; }
    DIFF=$(cat "$MSG_FILE")
    ;;
  '' | --help | -h)
    echo "Usage: $0 <range> | --staged | --msg <file>"
    exit 2
    ;;
  *)
    # Validate the range
    git rev-parse --verify "$MODE" >/dev/null 2>&1 || {
      # It could be a range like A..B — extract endpoints and verify each
      BASE="${MODE%..*}"
      TIP="${MODE#*..}"
      [ -n "$BASE" ] && [ -n "$TIP" ] && \
        git rev-parse --verify "$BASE" >/dev/null 2>&1 && \
        git rev-parse --verify "$TIP" >/dev/null 2>&1 || {
          echo "audit-privacy: invalid range '$MODE'" >&2
          exit 2
        }
    }
    DIFF=$(git log -p "$MODE" -- . ':(exclude)package-lock.json' ':(exclude)*.lock' 2>/dev/null)
    # Commit messages are not prefixed with + in git log -p output — scan them separately
    MSGS=$(git log --format='%B' "$MODE" 2>/dev/null | tr -d '\r')
    ;;
esac

# Strip CR (defends against CRLF files bypassing ^[+] match)
DIFF=$(printf '%s' "$DIFF" | tr -d '\r')

# For --msg mode: the whole file is the target, no ^[+] filter
if [ "$MODE" = "--msg" ]; then
  ADDED="$DIFF"
else
  ADDED=$(printf '%s\n' "$DIFF" | grep -E '^[+]' | grep -v '^+++' || true)
fi

# Apply allowlist: drop lines whose source file matches any allowlisted path.
# Security: a real `+++ b/<path>` header is ALWAYS preceded by a `--- ` line in unified diff.
# We track the previous line type to reject content lines that start with `+++ b/`
# (which would otherwise be parsed as a fake header, granting allowlist to lines below).
if [ -f "$ALLOWLIST" ] && [ -s "$ALLOWLIST" ] && [ "$MODE" != "--msg" ]; then
  FILTERED=""
  CURRENT_FILE=""
  SKIP=0
  PREV_KIND=""  # "dash" after seeing "--- " line; anything else resets
  while IFS= read -r line; do
    case "$line" in
      '--- '*)
        PREV_KIND="dash"
        ;;
      '+++ b/'*)
        if [ "$PREV_KIND" = "dash" ]; then
          # Real file header — update current file and allowlist check
          CURRENT_FILE="${line#+++ b/}"
          SKIP=0
          while IFS= read -r allowed_path; do
            [ -z "$allowed_path" ] && continue
            case "$allowed_path" in '#'*) continue ;; esac
            # Exact file match OR directory prefix (not substring — prevents .sh.bak bypass)
            case "$CURRENT_FILE" in
              "$allowed_path"|"$allowed_path"/*) SKIP=1; break ;;
            esac
          done < "$ALLOWLIST"
          PREV_KIND=""
        else
          # Content line that starts with `+++ b/` — treat as added content, not a header
          [ "$SKIP" != "1" ] && FILTERED="${FILTERED}${line}"$'\n'
          PREV_KIND=""
        fi
        ;;
      '+'*)
        [ "$SKIP" != "1" ] && FILTERED="${FILTERED}${line}"$'\n'
        PREV_KIND=""
        ;;
      *)
        PREV_KIND=""
        ;;
    esac
  done < <(printf '%s\n' "$DIFF")
  ADDED="$FILTERED"
fi

# Scan helper: run all hard patterns against a string, collect hits
scan_content() {
  local content="$1"
  local local_hits=""
  while IFS= read -r pat; do
    [ -z "$pat" ] && continue
    MATCH=$(printf '%s\n' "$content" | grep -iE "$pat" || true)
    [ -n "$MATCH" ] && local_hits="${local_hits}${MATCH}"$'\n'
  done <<< "$HARD_PATTERNS"
  KAKA=$(printf '%s\n' "$content" | grep -iF 'Kaka Mukaka' || true)
  [ -n "$KAKA" ] && local_hits="${local_hits}${KAKA}"$'\n'
  INGURO_ALL=$(printf '%s\n' "$content" | grep -iE "$INGURO_EXTRA" || true)
  INGURO_HITS=$(printf '%s\n' "$INGURO_ALL" | grep -ivE "$INGURO_ALLOW" || true)
  [ -n "$INGURO_HITS" ] && local_hits="${local_hits}${INGURO_HITS}"$'\n'
  printf '%s' "$local_hits"
}

# General third-party email detection (P936). Returns email tokens in $1 that match NO entry
# in EMAIL_ALLOWLIST, one per line. Fail-open: no allowlist file => returns nothing (skip).
# Grammar per entry (case-insensitive; '#' comments; blank lines ignored):
#   bare.domain        -> exact domain match (e.g. example.com)
#   *.suffix           -> domain ends with .suffix (e.g. *.example.com)
#   localpart@*        -> any address with that local part (e.g. noreply@*)
#   full@address.tld   -> exact address match
scan_unknown_emails() {
  local content="$1"
  [ -f "$EMAIL_ALLOWLIST" ] && [ -s "$EMAIL_ALLOWLIST" ] || return 0
  # Strip the leading diff '+' marker per line so it is not slurped into the local part,
  # then extract + lowercase + dedupe the email tokens.
  local tokens
  tokens=$(printf '%s\n' "$content" | sed 's/^+//' | grep -ioE "$EMAIL_RE" | tr 'A-Z' 'a-z' | sort -u || true)
  [ -z "$tokens" ] && return 0
  local hits="" tok lpart dpart entry suf elocal safe
  while IFS= read -r tok; do
    [ -z "$tok" ] && continue
    lpart="${tok%@*}"
    dpart="${tok#*@}"
    safe=0
    while IFS= read -r entry; do
      [ -z "$entry" ] && continue
      case "$entry" in '#'*) continue ;; esac
      entry=$(printf '%s' "$entry" | tr 'A-Z' 'a-z')
      case "$entry" in
        '*.'*)            suf="${entry#\*}"; case ".$dpart" in *"$suf") safe=1 ;; esac ;;
        *'@*')            elocal="${entry%@*}"; [ "$lpart" = "$elocal" ] && safe=1 ;;
        *@*)              [ "$tok" = "$entry" ] && safe=1 ;;
        *)                [ "$dpart" = "$entry" ] && safe=1 ;;
      esac
      [ "$safe" = "1" ] && break
    done < "$EMAIL_ALLOWLIST"
    [ "$safe" = "0" ] && hits="${hits}${tok}"$'\n'
  done <<< "$tokens"
  printf '%s' "$hits"
}

# Known-names check (P1438). Arbitrary person names cannot be regex-detected, so this matches the
# names cp's own private files already hold. Sources live in the MAIN checkout's .private/ (its own
# gitignored repo; absent in worktrees, clones and CI), resolved through git-common-dir:
#   - .private/docs/privacy-names.txt — hand-kept seed, one name per line, '#' comments
#   - .private/crm/opportunities/*.md — derived: filenames of 2+ hyphen tokens ("first-last")
# Single-token names are matched only from the seed file (a derived "kai" would flag every "Kai").
# Absent sources => skipped with a stderr note, never a silent pass. Hit output prints the NAME,
# which is fine: it goes to the local terminal only.
resolve_private_dir() {
  local common
  common="$(git rev-parse --path-format=absolute --git-common-dir 2>/dev/null)" || return 1
  [ -d "$(dirname "$common")/.private" ] && printf '%s' "$(dirname "$common")/.private"
}
known_names() {
  local priv="$1" f base
  if [ -f "$priv/docs/privacy-names.txt" ]; then
    grep -vE '^[[:space:]]*(#|$)' "$priv/docs/privacy-names.txt" \
      | sed -E 's/^[[:space:]]+//; s/[[:space:]]+$//' || true
  fi
  for f in "$priv"/crm/opportunities/*.md; do
    [ -e "$f" ] || continue
    base="$(basename "$f" .md)"
    case "$base" in *-*) printf '%s\n' "$base" | tr '-' ' ' ;; esac
  done
}
# Literal bytes (bash 3.2 $'' supports \x, grep ERE does not): NBSP and U+2010..U+2015 dashes.
NAME_SEP="([[:space:][:punct:]]|"$'\xc2\xa0'
for _b in 90 91 92 93 94 95; do NAME_SEP="${NAME_SEP}|"$'\xe2\x80'"$(printf "\\x$_b")"; done
NAME_SEP="${NAME_SEP}){1,3}"
scan_known_names() {
  local content="$1" priv name pat hits=""
  priv="$(resolve_private_dir)" || priv=""
  if [ -z "$priv" ]; then
    echo "audit-privacy: .private/ not found — known-names check skipped" >&2
    return 0
  fi
  local names
  names="$(known_names "$priv" | sort -u)"
  if [ -z "$names" ]; then
    echo "audit-privacy: .private/ has no known names (privacy-names.txt, crm/opportunities) — known-names check found nothing to match" >&2
    return 0
  fi
  while IFS= read -r name; do
    [ -z "$name" ] && continue
    # Between tokens: any run of 1-3 whitespace/punctuation chars (space, tab, hyphen, comma,
    # underscore, dashes, NBSP). Word-bounded both ends. Not covered: a name split across lines,
    # decomposed-Unicode spellings — the agent's own read stays the primary gate.
    pat=$(printf '%s' "$name" | sed -E 's/[][\.*^$+?(){}|/]/\\&/g; s/[[:space:]]+/ /g')
    pat="${pat// /$NAME_SEP}"
    if grep -qiE "(^|[^[:alnum:]_])${pat}([^[:alnum:]_]|$)" < <(printf '%s\n' "$content"); then
      hits="${hits}known name from .private: ${name}"$'\n'
    fi
  done <<< "$names"
  printf '%s' "$hits"
}

HITS=$(scan_content "$ADDED")
NAME_HITS=$(scan_known_names "$ADDED")
[ -n "$NAME_HITS" ] && HITS="${HITS}${NAME_HITS}"

# Diff-only third-party email check: never on commit messages (--msg / MSGS) — they carry
# Co-Authored-By trailers that would otherwise be flagged with no allowlist applied.
if [ "$MODE" != "--msg" ]; then
  EMAIL_HITS=$(scan_unknown_emails "$ADDED")
  [ -n "$EMAIL_HITS" ] && HITS="${HITS}${EMAIL_HITS}"
fi

# Also scan commit messages for range mode (no allowlist — messages have no file path)
if [ -n "$MSGS" ]; then
  MSG_HITS=$(scan_content "$MSGS")
  [ -n "$MSG_HITS" ] && HITS="${HITS}${MSG_HITS}"
  MSG_NAME_HITS=$(scan_known_names "$MSGS")
  [ -n "$MSG_NAME_HITS" ] && HITS="${HITS}${MSG_NAME_HITS}"
fi

if [ -n "$HITS" ]; then
  printf '%s\n' "$HITS" | head -20
  exit 1
fi

exit 0
