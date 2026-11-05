#!/bin/bash
# scripts/audit-privacy.sh — privacy audit for any git range / staged changes / message file.
# Exit 0 = clean, 1 = hits found, 2 = bad input, 3 = an input step or the matcher did not finish
# (hits found before that are still printed). Callers report 3 as a failure to scan, not as a finding.
# Modes:
#   --staged                    # scan staged diff (for pre-commit)
#   --msg <file>                # scan a commit-message file (for commit-msg hook)
#   <range>                     # scan git log -p <range> (for pre-push and manual audits)

# No `set -euo pipefail` — we catch errors explicitly. `|| true` on grep is intentional.

REPO_ROOT="$(git rev-parse --show-toplevel 2>/dev/null)" || { echo "Not a git repo"; exit 2; }
# Bytewise processing: no step below depends on the caller's locale. The known-names check switches to
# a UTF-8 locale on its own, for non-ASCII case folding.
export LC_ALL=C
# A matcher that exits above 1 (1 is "no match") records itself in this flag file; a run with the flag set exits 3.
ERR_FLAG="$(mktemp "${TMPDIR:-/tmp}/audit-privacy.XXXXXX")" || { echo "audit-privacy: cannot create a work file" >&2; exit 3; }
trap 'rm -f "$ERR_FLAG"' EXIT
g() { grep "$@"; local rc=$?; if [ "$rc" -gt 1 ]; then echo 1 >> "$ERR_FLAG"; fi; return "$rc"; }
INPUT_FAIL=0
input_failed() { INPUT_FAIL=1; echo "audit-privacy: input step failed: $1; refusing to report clean" >&2; }
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
MSGS=""  # commit messages and author fields for range mode (scanned separately, no allowlist)
AUTHORS=""
# Fixed git output format and repository root for every git call.
GIT_CFG=(-C "$REPO_ROOT" -c core.quotePath=false -c diff.noprefix=false -c diff.mnemonicPrefix=false -c diff.suppressBlankEmpty=false -c diff.renames=false -c diff.relative=false -c log.showRoot=true -c diff.submodule=short -c color.ui=never -c color.diff=never)
PATCH_FLAGS=(--no-color --no-ext-diff --no-textconv --no-renames --src-prefix=a/ --dst-prefix=b/ --full-index --submodule=short)
# Lockfiles by basename, at any depth: only the names that are actually tracked.
PATHSPEC=(-- . ':(exclude,glob)**/package-lock.json' ':(exclude,glob)**/deno.lock')
case "$MODE" in
  --staged)
    DIFF=$( set -o pipefail; git "${GIT_CFG[@]}" diff --cached "${PATCH_FLAGS[@]}" "${PATHSPEC[@]}" 2>/dev/null | tr -d '\000\r' )
    [ $? -eq 0 ] || input_failed "staged patch"
    PATHS_ADDED=$(git "${GIT_CFG[@]}" diff --cached --name-only --no-renames --diff-filter=ACR 2>/dev/null)
    [ $? -eq 0 ] || input_failed "staged paths"
    ;;
  --msg)
    shift
    MSG_FILE="${1:-}"
    [ -f "$MSG_FILE" ] || { echo "audit-privacy: message file not found: $MSG_FILE" >&2; exit 2; }
    DIFF=$(tr -d '\000\r' < "$MSG_FILE")
    [ $? -eq 0 ] || input_failed "message read"
    ;;
  '' | --help | -h)
    echo "Usage: $0 <range> | --staged | --msg <file>"
    exit 2
    ;;
  *)
    # Validate the range
    git -C "$REPO_ROOT" rev-parse --verify "$MODE" >/dev/null 2>&1 || {
      # It could be a range like A..B — extract endpoints and verify each
      BASE="${MODE%..*}"
      TIP="${MODE#*..}"
      [ -n "$BASE" ] && [ -n "$TIP" ] && \
        git -C "$REPO_ROOT" rev-parse --verify "$BASE" >/dev/null 2>&1 && \
        git -C "$REPO_ROOT" rev-parse --verify "$TIP" >/dev/null 2>&1 || {
          echo "audit-privacy: invalid range '$MODE'" >&2
          exit 2
        }
    }
    # Generic-term count ref: the range base. Single-ref mode (scan all history reachable from REF)
    # has no clean base; REF^ is used and does NOT carry the same no-self-disable guarantee.
    # (A...B never reaches here: the range validation above rejects it with exit 2.)
    case "$MODE" in
      *..*)  GENERIC_REF="${MODE%%..*}" ;;
      *)     GENERIC_REF="${MODE}^" ;;
    esac
    PATHS_ADDED=$( set -o pipefail; git "${GIT_CFG[@]}" log --format= --name-only --no-renames --diff-filter=ACR --diff-merges=first-parent --no-show-signature "$MODE" -- 2>/dev/null | sort -u )
    [ $? -eq 0 ] || input_failed "range paths"
    DIFF=$( set -o pipefail; git "${GIT_CFG[@]}" log -p --format='commit %H' --no-show-signature --diff-merges=first-parent "${PATCH_FLAGS[@]}" "$MODE" "${PATHSPEC[@]}" 2>/dev/null | tr -d '\000\r' )
    [ $? -eq 0 ] || input_failed "range patch"
    # Commit messages are not prefixed with + in git log -p output — scan them separately
    MSGS=$( set -o pipefail; git "${GIT_CFG[@]}" log --format='%B' --no-show-signature "$MODE" -- 2>/dev/null | tr -d '\000\r' )
    [ $? -eq 0 ] || input_failed "range messages"
    AUTHORS=$( set -o pipefail; git "${GIT_CFG[@]}" log --format='%an%n%ae%n%cn%n%ce' --no-show-signature "$MODE" -- 2>/dev/null | tr -d '\000\r' )
    [ $? -eq 0 ] || input_failed "range authors"
    MSGS="${MSGS}"$'\n'"${AUTHORS}"
    ;;
esac

# For --msg mode: the whole file is the target, nothing to parse
if [ "$MODE" = "--msg" ]; then
  ADDED="$DIFF"
fi

# Apply allowlist: drop lines whose source file matches any allowlisted path.
# Security: a real `+++ b/<path>` header is ALWAYS preceded by a `--- ` line in unified diff.
# We track the previous line type to reject content lines that start with `+++ b/`
# (which would otherwise be parsed as a fake header, granting allowlist to lines below).
# P1617: kept lines go into an array by explicit index and are joined once. Appending to one string
# recopied everything kept so far (9 minutes at 45k patch lines); `KEPT+=(...)` is also superlinear on
# macOS bash 3.2. Runs in this shell, not a capture, so a kill ends the scan. The line count catches
# input that ended early, which a read loop otherwise treats as a normal finish.
# The patch is read by its hunk counts; input that does not fit them sets INPUT_FAIL (exit 3 at the end).
allowlist_skip() {
  local allowed_path
  SKIP=0
  while IFS= read -r allowed_path; do
    [ -z "$allowed_path" ] && continue
    case "$allowed_path" in '#'*) continue ;; esac
    # Exact file match OR directory prefix (not substring — prevents .sh.bak bypass)
    case "$CURRENT_FILE" in
      "$allowed_path"|"$allowed_path"/*) SKIP=1; break ;;
    esac
  done < "$ALLOWLIST"
}
filter_added_lines() {
  local line expected seen=0 kept_count=0 bin_count=0 in_hunk=0 old_left=0 new_left=0
  local have_allow=0 err="" prev rest hlen path_part idx hdr ocount ncount
  local hdr_re='^-[0-9]+(,[0-9]+)? \+[0-9]+(,[0-9]+)?$'
  local LC_ALL=C
  local KEPT
  KEPT=()
  BIN_ENTRIES=()
  CURRENT_FILE=""
  SKIP=0
  PREV_KIND=""  # "dash" after seeing "--- " line; anything else resets
  INDEX_NEW=""
  if [ -f "$ALLOWLIST" ] && [ -s "$ALLOWLIST" ]; then have_allow=1; fi
  expected=$(printf '%s\n' "$DIFF" | wc -l | tr -d ' ')
  while IFS= read -r line; do
    seen=$((seen+1))
    if [ "$in_hunk" = 1 ]; then
      case "$line" in
        '+'*) new_left=$((new_left-1)); if [ "$SKIP" != "1" ]; then KEPT[kept_count]="$line"; kept_count=$((kept_count+1)); fi ;;
        '-'*) old_left=$((old_left-1)) ;;
        ' '*) old_left=$((old_left-1)); new_left=$((new_left-1)) ;;
        '\'*) ;;
        *) err="a line inside a hunk is not a hunk line"; break ;;
      esac
      if [ "$old_left" -lt 0 ] || [ "$new_left" -lt 0 ]; then err="a hunk has more lines than its counts"; break; fi
      if [ "$old_left" -eq 0 ] && [ "$new_left" -eq 0 ]; then in_hunk=0; fi
      continue
    fi
    prev="$PREV_KIND"
    PREV_KIND=""
    case "$line" in
      'diff --git '*)
        CURRENT_FILE=""; SKIP=0; INDEX_NEW=""
        if [ "$have_allow" = 1 ]; then
          rest="${line#diff --git a/}"
          hlen=${#rest}
          if [ "$rest" != "$line" ] && [ "$hlen" -gt 3 ] && [ $(( (hlen-3) % 2 )) -eq 0 ]; then
            hlen=$(( (hlen-3) / 2 ))
            path_part="${rest:0:hlen}"
            if [ "${rest:hlen:3}" = " b/" ] && [ "${rest:hlen+3}" = "$path_part" ]; then
              CURRENT_FILE="$path_part"
              allowlist_skip
            fi
          fi
        fi
        ;;
      '--- '*)
        PREV_KIND="dash"
        CURRENT_FILE=""; SKIP=0
        ;;
      '+++ '*)
        if [ "$prev" = "dash" ]; then
          case "$line" in
            '+++ b/'*)
              # Real file header — update current file and allowlist check
              CURRENT_FILE="${line#+++ b/}"
              if [ "$have_allow" = 1 ]; then allowlist_skip; else SKIP=0; fi
              ;;
            *)
              CURRENT_FILE=""; SKIP=0
              ;;
          esac
        else
          err="a header line outside its position"; break
        fi
        ;;
      '@@ '*)
        hdr="${line#@@ }"
        hdr="${hdr%% @@*}"
        if [[ "$hdr" =~ $hdr_re ]]; then
          ocount="${hdr%% *}"; ocount="${ocount#-}"
          ncount="${hdr#* }"; ncount="${ncount#+}"
          case "$ocount" in *,*) ocount="${ocount#*,}" ;; *) ocount=1 ;; esac
          case "$ncount" in *,*) ncount="${ncount#*,}" ;; *) ncount=1 ;; esac
          if [ "${#ocount}" -gt 9 ] || [ "${#ncount}" -gt 9 ]; then err="a hunk count is out of range"; break; fi
          old_left=$((10#$ocount)); new_left=$((10#$ncount))
          if [ "$old_left" -gt 0 ] || [ "$new_left" -gt 0 ]; then in_hunk=1; fi
        else
          err="unreadable hunk header"; break
        fi
        ;;
      'index '*)
        idx="${line#index }"; idx="${idx%% *}"; INDEX_NEW="${idx#*..}"
        ;;
      'Binary files '*' differ')
        if [ "$SKIP" != "1" ]; then
          case "$INDEX_NEW" in
            '') err="a binary entry has no blob id"; break ;;
            *[!0]*) BIN_ENTRIES[bin_count]="$INDEX_NEW"; bin_count=$((bin_count+1)) ;;
          esac
        fi
        ;;
      '+'*|'-'*|' '*)
        err="a line outside a hunk"; break
        ;;
      *)
        ;;
    esac
  done < <(printf '%s\n' "$DIFF")
  if [ -z "$err" ] && [ "$in_hunk" = 1 ]; then err="input ended inside a hunk"; fi
  if [ -z "$err" ] && [ "$seen" != "$expected" ]; then err="filter read $seen of ${expected:-unknown} input lines"; fi
  if [ -n "$err" ]; then
    INPUT_FAIL=1
    echo "audit-privacy: $err; refusing to report clean" >&2
  fi
  ADDED=""
  if [ "$kept_count" -gt 0 ]; then
    local IFS
    IFS=$'\n'
    ADDED="${KEPT[*]}"$'\n'
  fi
  # No allowlist: no final newline.
  if [ "$have_allow" != 1 ]; then ADDED="${ADDED%$'\n'}"; fi
}
if [ "$MODE" != "--msg" ]; then
  filter_added_lines
fi

# Scan helper: run all hard patterns against a string, collect hits
scan_content() {
  local content="$1"
  local local_hits=""
  while IFS= read -r pat; do
    [ -z "$pat" ] && continue
    MATCH=$(printf '%s\n' "$content" | g -iE "$pat" || true)
    [ -n "$MATCH" ] && local_hits="${local_hits}${MATCH}"$'\n'
  done <<< "$HARD_PATTERNS"
  KAKA=$(printf '%s\n' "$content" | g -iF 'Kaka Mukaka' || true)
  [ -n "$KAKA" ] && local_hits="${local_hits}${KAKA}"$'\n'
  INGURO_ALL=$(printf '%s\n' "$content" | g -iE "$INGURO_EXTRA" || true)
  INGURO_HITS=$(printf '%s\n' "$INGURO_ALL" | g -ivE "$INGURO_ALLOW" || true)
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
  tokens=$(printf '%s\n' "$content" | sed 's/^+//' | g -ioE "$EMAIL_RE" | tr 'A-Z' 'a-z' | sort -u || true)
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
  common="$(git -C "$REPO_ROOT" rev-parse --path-format=absolute --git-common-dir 2>/dev/null)" || return 1
  [ -d "$(dirname "$common")/.private" ] && printf '%s' "$(dirname "$common")/.private"
}
known_names() {
  local priv="$1" f base
  if [ -f "$priv/docs/privacy-names.txt" ]; then
    g -vE '^[[:space:]]*(#|$)' "$priv/docs/privacy-names.txt" \
      | sed -E 's/^[[:space:]]+//; s/[[:space:]]+$//' || true
  fi
  for f in "$priv"/crm/opportunities/*.md; do
    [ -e "$f" ] || continue
    base="$(basename "$f" .md)"
    case "$base" in *-*) printf '%s\n' "$base" | tr '-' ' ' ;; esac
  done
  registry_names "$priv"
}

# Registry-derived names (P1438 follow-up). A filename slug like "first-last-company" yields the
# string "first last company", which never matches the person or the company on their own — and a
# company/account name identifies a private contact as surely as their personal name does
# ("the operations lead at <company>"). The registries already state both, in one shape:
#   .private/crm/opportunities/*.md         frontmatter   name: Person — Company / Brand (role)
#   .private/docs/business/*/*.md           first H1      # Person — free-text notes
# Parse: text before the first dash separator is the person (emitted when 2-4 capitalised words —
# a lone first name would flag every use of that word). From the CRM field only (the one place the
# tail is defined as the company), the tail minus (...) and "...", split on / , ; + and middle dot,
# gives company candidates (capitalised phrases with letters; a legal/acronym suffix is also tried
# stripped: "Acme CNX" also yields "Acme"). Lines with no dash separator are skipped.
# Generic filter — evidence, not a word list: a derived COMPANY candidate already present in 3+
# tracked public files is a common term (or an old leak the founder has accepted), so blocking it
# would be noise; it is skipped with a stderr note. Person names are never filtered. To force a
# skipped term, put it in privacy-names.txt (the seed is never filtered).
_split_registry_line() {
  # stdin: one "Person — rest" string. stdout: "P<TAB>name" / "C<TAB>name" lines.
  # Quotes around a YAML value are dropped first (name: "A B — C" is valid YAML). Em/en dash split
  # with or without spaces; an ASCII hyphen only with spaces (it occurs inside names).
  local em en
  em="$(printf '\xe2\x80\x94')"; en="$(printf '\xe2\x80\x93')"
  sed -E "s/^[[:space:]]*[\"']//; s/[\"'][[:space:]]*\$//; s/ *${em} */ | /; s/ *${en} */ | /; s/ - / | /" \
  | LC_ALL=C awk -F' [|] ' '
    function trim(s) { gsub(/^[[:space:]]+|[[:space:]]+$/, "", s); return s }
    # A proper-noun phrase: first and last word start with a capital, a digit or a non-ASCII byte
    # (accented initials: "Emile" spelled with an accent); middle words may be name particles.
    function cap(x) { return x ~ /^[A-Z0-9]/ || x ~ /^[\200-\377]/ }
    function proper(s,   n, i, w) {
      n = split(s, w, /[[:space:]]+/)
      if (n < 1 || n > 5) return 0
      for (i = 1; i <= n; i++) {
        if (cap(w[i])) continue
        if (i > 1 && i < n && w[i] ~ /^(de|da|di|du|del|della|der|den|van|von|le|la|bin|binti|al|el|y|dos|das)$/) continue
        return 0
      }
      return n
    }
    NF < 2 { next }
    {
      person = trim($1); gsub(/\([^)]*\)/, "", person); person = trim(person)
      n = proper(person)
      # A person name has no digits ("Q3 Roadmap", "2026 Planning" are document titles).
      if (n >= 2 && n <= 4 && person !~ /[0-9]/) print "P\t" person
      rest = $2; for (i = 3; i <= NF; i++) rest = rest " " $i
      gsub(/\([^)]*\)/, " ", rest); gsub(/\(.*$/, " ", rest); gsub(/"[^"]*"/, " ", rest)
      m = split(rest, seg, /[\/,;+]/)
      for (j = 1; j <= m; j++) {
        c = trim(seg[j]); gsub(/[*_`]+$/, "", c); c = trim(c)
        if (length(c) < 4 || c !~ /[A-Za-z][A-Za-z]/ || !proper(c)) continue
        # A lone legal suffix split off by a comma ("Acme, Inc.") is not a company name.
        if (c ~ /^(GmbH|Ltd|LLC|Inc|Corp|AG|Co|Pte|SA|BV|Oy|AS|Limited|Corporation|Incorporated)\.?$/) continue
        print "C\t" c
        k = split(c, w, /[[:space:]]+/)
        if (k >= 2 && (w[k] ~ /^(GmbH|Ltd|LLC|Inc|Corp|AG|Co|Pte|SA|BV|Oy|AS|Limited|Corporation|Incorporated)\.?$/ || w[k] ~ /^[A-Z]{2,4}$/)) {
          s = w[1]; for (q = 2; q < k; q++) s = s " " w[q]
          if (length(s) >= 4) print "C\t" s
        }
      }
    }'
}
registry_candidates() {
  local priv="$1" f mdot
  mdot="$(printf '\xc2\xb7')"
  # CRM: name: is a structured "Person — Company" field, so it yields person AND company candidates.
  for f in "$priv"/crm/opportunities/*.md; do
    [ -e "$f" ] || continue
    awk 'NR==1 && $0!="---" {exit} NR>1 && $0=="---" {exit} /^name:/ {sub(/^name:[[:space:]]*/, ""); print; exit}' "$f"
  done | sed "s/${mdot}/\//g" | _split_registry_line
  # Business person files: the H1 tail is free text with no fixed company slot, so only the PERSON
  # is taken. Analysis and transcript files derive from a person file and carry document titles
  # in that position, so they are skipped.
  for f in "$priv"/docs/business/*/*.md; do
    [ -e "$f" ] || continue
    case "$(basename "$f")" in
      *-analysis-*|*-transcript-*) continue ;;
    esac
    # The folder also holds planning notes ("# Growth Strategy — Notes"). A person file is named
    # after its person (first-last-....md), so an ASCII person candidate whose slug does not start
    # the filename is a document title and is dropped. A name with non-ASCII letters is kept either
    # way (its filename may be transliterated) — fail closed.
    local title cand slug
    title=$(awk '/^# / {sub(/^# +/, ""); print; exit}' "$f")
    [ -n "$title" ] || continue
    cand=$(printf '%s\n' "$title" | _split_registry_line | grep '^P' | cut -f2-)
    [ -n "$cand" ] || continue
    if LC_ALL=C grep -q '[^ -~]' <<<"$cand"; then printf 'P\t%s\n' "$cand"; continue; fi
    slug=$(printf '%s' "$cand" | tr 'A-Z' 'a-z' | tr -cs 'a-z0-9' '-' | sed 's/^-//; s/-$//')
    case "$(basename "$f" .md)" in "$slug"|"$slug"-*) printf 'P\t%s\n' "$cand" ;; esac
  done
}
registry_names() {
  local priv="$1" kind name n out=""
  while IFS="$(printf '\t')" read -r kind name; do
    [ -z "$name" ] && continue
    if [ "$kind" = "C" ]; then
      # Counted at GENERIC_REF — the range BASE in range mode, HEAD otherwise — never at the tip
      # being scanned, so content added by the scanned commits cannot make its own term "generic".
      # A git grep failure counts 0, i.e. the term is KEPT (fails toward blocking).
      n=$(git -C "$REPO_ROOT" grep -I -i -w -F -l -e "$name" "${GENERIC_REF:-HEAD}" -- . 2>/dev/null | grep -c . || true)
      if [ "${n:-0}" -ge 3 ]; then
        echo "audit-privacy: derived company term skipped as generic (in $n public files at ${GENERIC_REF:-HEAD} — if it is not a common phrase, that is an existing leak): $name" >&2
        continue
      fi
    fi
    out="${out}${name}"$'\n'
  done < <(registry_candidates "$priv" | sort -u)
  printf '%s' "$out"
}
# Literal bytes (bash 3.2 $'' supports \x, grep ERE does not): NBSP and U+2010..U+2015 dashes.
NAME_SEP="([[:space:][:punct:]]|"$'\xc2\xa0'
for _b in 90 91 92 93 94 95; do NAME_SEP="${NAME_SEP}|"$'\xe2\x80'"$(printf "\\x$_b")"; done
NAME_SEP="${NAME_SEP}){1,6}"  # 1-6: "First    Last" (padded columns) must not escape
# Computed ONCE per run: derivation runs a git grep per company candidate, and the scan below is
# called from command substitutions, which cannot write a cache back.
UTF8_LOC=""
for _l in en_US.UTF-8 C.UTF-8 en_US.utf8 C.utf8; do
  if locale -a 2>/dev/null | grep -qx "$_l"; then UTF8_LOC="$_l"; break; fi
done
KNOWN_NAMES=""
_priv="$(resolve_private_dir)" || _priv=""
if [ -z "$_priv" ]; then
  echo "audit-privacy: .private/ not found — known-names check skipped (expected in CI and fresh clones)" >&2
else
  KNOWN_NAMES="$(known_names "$_priv" | sort -u)"
  [ -z "$KNOWN_NAMES" ] && echo "audit-privacy: .private/ has no known names (privacy-names.txt, crm/opportunities, docs/business) — known-names check found nothing to match" >&2
fi
# Private literals (2026-10-12): non-name values the public repo must never contain (money amounts,
# account and grant ids), one per line in .private/docs/privacy-literals.txt, machine-maintained by
# the private checks that read them, so no value is ever named here. Bounded by DIGITS only, not
# word characters: "credit_<amount>" must still match (codex review), while a longer number that
# merely contains the value ("3514.75" for "514.75") must not. Values with letters match anywhere.
KNOWN_LITERALS=""
if [ -n "$_priv" ] && [ -f "$_priv/docs/privacy-literals.txt" ]; then
  KNOWN_LITERALS="$( { g -vE '^[[:space:]]*(#|$)' "$_priv/docs/privacy-literals.txt" || true; } | sed -E 's/^[[:space:]]+//; s/[[:space:]]+$//' | sort -u)"
fi
# stdin to stdout: every byte that is not part of a valid UTF-8 sequence becomes a space.
clean_utf8() {
  LC_ALL=C perl -pe 's/([\x00-\x7F]+|[\xC2-\xDF][\x80-\xBF]|\xE0[\xA0-\xBF][\x80-\xBF]|[\xE1-\xEC\xEE\xEF][\x80-\xBF]{2}|\xED[\x80-\x9F][\x80-\xBF]|\xF0[\x90-\xBF][\x80-\xBF]{2}|[\xF1-\xF3][\x80-\xBF]{3}|\xF4[\x80-\x8F][\x80-\xBF]{2})|(.)/defined $1 ? $1 : " "/gse'
}
scan_private_literals() {
  local content="$1" lit pat rc hits="" cleaned
  [ -z "$KNOWN_LITERALS" ] && return 0
  cleaned=$(printf '%s\n' "$content" | clean_utf8) || { echo 1 >> "$ERR_FLAG"; cleaned="$content"; }
  local LC_ALL=C
  if [ -n "$UTF8_LOC" ]; then LC_ALL="$UTF8_LOC"; export LC_ALL; fi
  while IFS= read -r lit; do
    [ -z "$lit" ] && continue
    pat=$(printf '%s' "$lit" | sed -E 's/[][\.*^$+?(){}|/]/\\&/g')
    # An id with letters is long and specific: match it anywhere. A pure number keeps digit bounds.
    case "$lit" in
      *[A-Za-z]*) pat="(${pat})" ;;
      *) pat="(^|[^0-9])(${pat})([^0-9]|\$)" ;;
    esac
    g -qiE "$pat" < <(printf '%s\n' "$content"); rc=$?
    if [ "$rc" = 1 ] && [ "$cleaned" != "$content" ]; then
      g -qiE "$pat" < <(printf '%s\n' "$cleaned"); rc=$?
    fi
    if [ "$rc" = 0 ]; then
      hits="${hits}private value from .private/docs/privacy-literals.txt (value not printed)"$'\n'
    elif [ "$rc" -gt 1 ]; then
      hits="${hits}private-literals check ERROR (grep exit $rc)"$'\n'
    fi
  done < <(printf '%s\n' "$KNOWN_LITERALS")
  printf '%s' "$hits"
}
scan_known_names() {
  local content="$1" name pat rc hits="" cleaned
  local names="$KNOWN_NAMES"
  [ -z "$names" ] && return 0
  cleaned=$(printf '%s\n' "$content" | clean_utf8) || { echo 1 >> "$ERR_FLAG"; cleaned="$content"; }
  # Case-folding and word boundaries for non-ASCII names need a UTF-8 locale; a hook launched
  # under LC_ALL=C would otherwise pass "ÖSTEN MÜLLER" silently. Pick one that exists.
  local LC_ALL=C
  if [ -n "$UTF8_LOC" ]; then LC_ALL="$UTF8_LOC"; export LC_ALL; else echo "audit-privacy: no UTF-8 locale — known-names matching of non-ASCII names may miss case variants" >&2; fi
  while IFS= read -r name; do
    [ -z "$name" ] && continue
    # Between tokens: any run of 1-6 whitespace/punctuation chars (space, tab, hyphen, comma,
    # underscore, dashes, NBSP). Word-bounded both ends. A two-word name also matches reversed
    # ("Last, First" — attendee lists and invites). Not covered: a name split across lines,
    # initials, decomposed-Unicode spellings — the agent's own read stays the primary gate.
    pat=$(printf '%s' "$name" | sed -E 's/[][\.*^$+?(){}|/]/\\&/g; s/[[:space:]]+/ /g')
    case "$pat" in
      *' '*' '*) ;;
      *' '*) pat="${pat}|${pat#* } ${pat%% *}" ;;
    esac
    pat="${pat// /$NAME_SEP}"
    g -qiE "(^|[^[:alnum:]_])(${pat})([^[:alnum:]_]|$)" < <(printf '%s\n' "$content"); rc=$?
    # The same match over the cleaned copy.
    if [ "$rc" = 1 ] && [ "$cleaned" != "$content" ]; then
      g -qiE "(^|[^[:alnum:]_])(${pat})([^[:alnum:]_]|$)" < <(printf '%s\n' "$cleaned"); rc=$?
    fi
    if [ "$rc" = 0 ]; then
      hits="${hits}known name from .private: ${name}"$'\n'
    elif [ "$rc" -gt 1 ]; then
      # Fail closed: a check that errored has not shown the name is absent.
      hits="${hits}known-names check ERROR (grep exit $rc) on entry: ${name}"$'\n'
    fi
  done < <(printf '%s\n' "$names")  # not <<<: a here-string needs a temp file, and its failure read as "no hits"
  printf '%s' "$hits"
}

# Phone numbers. A person's number is as identifying as their email, and unlike a name it has a
# shape. The shape alone is not enough — dates, build ids, SHAs and counters are digit runs too —
# so a candidate must carry a mark a human writes ONLY on a phone number:
#   (a) an international "+CC" prefix:     +66 81 234 5678, +49-30-1234567
#   (b) a tel: URI:                        tel:+15550100
#   (c) a phone keyword right before it:   "phone: 081 234 5678", "WhatsApp 0812345678"
#   (d) the North American 3-3-4 shape:   "(415) 555-2671", "212-555-2671"
# Digit floors: (a) with separators needs 10+, contiguous needs 11-15 — "+10000000", "delta
# +12345678", "lat +12.345678", a unary-plus epoch "+1700000000" are signed values; (b)/(c) 8+.
# Separated (a) has no digit ceiling (a ceiling let "+49 30 12345678 123456" escape); the match
# itself is capped at ~40 characters. A trailing date or build id is cut off the candidate.
# NOT caught, deliberately: a bare "081 234 5678" with no mark (indistinguishable from dotted
# dates and versions), and short international numbers under 10 digits ("+298 212345").
# Allowlist: "tel:<digits>" (exact) or "tel:<digit-prefix>*" lines in .privacy-email-allowlist
# (one allowlist file, so the CI base-SHA co-commit swap covers both). $2 = "diff" strips the
# leading diff '+' marker per line first, so the marker is never read as a "+CC" prefix.
# Keywords are nouns that only name a phone. Verbs like "call"/"text" are excluded: "call
# 2026-10-08" is a date, and a dated sentence must not read as an 8-digit number.
PHONE_KW='(phone|telephone|tel|mobile|cellphone|whatsapp|telefon|handy|sms)'
# Does candidate $2 (scanner kind $1: I = +CC, U = North American, else keyword/tel:) have a
# phone's digit count?
_phone_ok() {
  local k="$1" t="$2" d
  d=$(printf '%s' "$t" | tr -cd '0-9')
  case "$k" in
    I) # contiguous "+NNNN": 11-15 digits (unary-plus literals like +1700000000 are 10, and
       # +12345678901234567890 is past E.164's 15); with separators: 10+.
       if [[ "$t" =~ ^[^0-9]*\+[0-9]+$ ]]; then
         [ "${#d}" -ge 11 ] && [ "${#d}" -le 15 ]
       else
         [ "${#d}" -ge 10 ]
       fi ;;
    U) [ "${#d}" -eq 10 ] ;;
    *) [ "${#d}" -ge 8 ] ;;
  esac
}
scan_phones() {
  local content="$1" kind="$2" cands tok marked piece num digits hits="" entry safe nums
  [ "$kind" = "diff" ] && content=$(printf '%s\n' "$content" | sed 's/^+//')
  cands=$(
    {
      printf '%s\n' "$content" | g -oE '(^|[^[:alnum:]+/=_.-])\+[1-9][0-9 ()/.-]{6,40}[0-9]' | sed 's/^/I /' || true
      printf '%s\n' "$content" | g -oiE 'tel:[+0-9][0-9 ()/.-]{6,40}[0-9]' | sed 's/^/T /' || true
      # (d) North American shape, unmistakable without a keyword: "(415) 555-2671", "212-555-2671".
      #     Exactly 3-3-4 with a dash before the last 4; not part of a longer digit/dash run.
      printf '%s\n' "$content" | g -oE '(^|[^[:alnum:]-])(\([2-9][0-9]{2}\) ?|[2-9][0-9]{2}[-. ])[2-9][0-9]{2}-[0-9]{4}([^[:alnum:]-]|$)' | sed 's/^/U /' || true
      printf '%s\n' "$content" | g -oiE "(^|[^[:alnum:]])${PHONE_KW}[\"'[:space:]]*[:=#.]?[\"'[:space:]]*(number|no\.?|nr\.?)?[\"'[:space:]]*[:=#]?[\"'[:space:]]*[+(]?[0-9][0-9 ()/.-]{6,40}[0-9]" | sed 's/^/K /' || true
    }
  )
  [ -z "$cands" ] && return 0
  local kind_c
  while IFS= read -r tok; do
    [ -z "$tok" ] && continue
    kind_c="${tok%% *}"; tok="${tok#* }"
    # A candidate can hold several things: "0900000000 2026-10-08", "2026-10-08 0900000000",
    # "<allowlisted> / <private>". Dates and build ids are cut OUT (not everything after them), and
    # " / " separates numbers; each piece is judged on its own, so neither a date nor an allowlisted
    # neighbour hides a number (Codex final F2 + round 2). When no piece is a phone but digits sat
    # before a date, the "date" may be the number's own last eight digits ("+44 20 2026-10-08"):
    # then the whole candidate is judged.
    marked=$(printf '%s' "$tok" | sed -E 's/(19|20)[0-9]{2}-[0-9]{2}-[0-9]{2}/|/g; s/(19|20)[0-9]{6}\.[0-9]+/|/g; s# +/ +#|#g')
    nums=()
    while IFS= read -r piece; do
      _phone_ok "$kind_c" "$piece" && nums+=("$piece")
    done < <(printf '%s\n' "$marked" | tr '|' '\n')
    if [ "${#nums[@]}" -eq 0 ] && [ "$marked" != "$tok" ] \
       && [ -n "$(printf '%s' "${marked%%|*}" | tr -cd '0-9')" ] && _phone_ok "$kind_c" "$tok"; then
      nums=("$tok")
    fi
    for num in "${nums[@]}"; do
      digits=$(printf '%s' "$num" | tr -cd '0-9')
      safe=0
      # An allowlist prefix only vouches for ONE number (E.164: at most 15 digits), never for a
      # run that merely starts with an allowed prefix.
      if [ -f "$EMAIL_ALLOWLIST" ] && [ "${#digits}" -le 15 ]; then
        while IFS= read -r entry; do
          case "$entry" in
            tel:*'*') case "$digits" in "$(printf '%s' "${entry#tel:}" | tr -cd '0-9')"*) safe=1 ;; esac ;;
            tel:*)    [ "$digits" = "$(printf '%s' "${entry#tel:}" | tr -cd '0-9')" ] && safe=1 ;;
          esac
          [ "$safe" = "1" ] && break
        done < "$EMAIL_ALLOWLIST"
      fi
      [ "$safe" = "0" ] && hits="${hits}phone number: $(printf '%s' "$num" | sed -E 's/^[^[:alnum:]+]+//; s/[[:space:]]+$//')"$'\n'
    done
  done < <(printf '%s\n' "$cands" | sort -u)
  printf '%s' "$hits"
}

# Printable strings of every added or changed binary file, plus the same strings with NUL bytes removed.
# Phones are not checked here. Emails are checked only for blobs up to 1 MB.
collect_binary_strings() {
  local sha out out_nul size seen=" "
  BINSTR=""
  BINSTR_EMAIL=""
  for sha in "${BIN_ENTRIES[@]}"; do
    case "$seen" in *" $sha "*) continue ;; esac
    seen="${seen}${sha} "
    size=$(git -C "$REPO_ROOT" cat-file -s "$sha" 2>/dev/null)
    if [ $? -ne 0 ]; then input_failed "binary file size"; continue; fi
    out=$( set -o pipefail; git -C "$REPO_ROOT" cat-file blob "$sha" 2>/dev/null | tr -c '[:print:]\t\200-\377' '\n' | awk 'length($0) >= 4' )
    if [ $? -ne 0 ]; then input_failed "binary file read"; continue; fi
    out_nul=$( set -o pipefail; git -C "$REPO_ROOT" cat-file blob "$sha" 2>/dev/null | tr -d '\000' | tr -c '[:print:]\t\200-\377' '\n' | awk 'length($0) >= 4' )
    if [ $? -ne 0 ]; then input_failed "binary file read"; continue; fi
    BINSTR="${BINSTR}${out}"$'\n'
    [ "$out_nul" != "$out" ] && BINSTR="${BINSTR}${out_nul}"$'\n'
    if [ "${size:-0}" -le 1048576 ]; then
      BINSTR_EMAIL="${BINSTR_EMAIL}${out}"$'\n'
      [ "$out_nul" != "$out" ] && BINSTR_EMAIL="${BINSTR_EMAIL}${out_nul}"$'\n'
    fi
  done
}

HITS=$(scan_content "$ADDED")
[ -n "$HITS" ] && HITS="${HITS}"$'\n'
NAME_HITS=$( { scan_known_names "$ADDED"; scan_private_literals "$ADDED"; } )
[ -n "$NAME_HITS" ] && HITS="${HITS}${NAME_HITS}"$'\n'
# File paths are public too: a rename to docs/first-last.md adds no content line but publishes the
# name. Added/copied/renamed paths (unquoted, so accented names stay literal) run through the
# hard-pattern, known-name, email and phone checks. This deliberately ignores .privacy-allowlist: that
# list exempts a file's CONTENT; its path is published either way.
if [ -n "${PATHS_ADDED:-}" ]; then
  PATH_HITS=$( { scan_content "$PATHS_ADDED"; echo; scan_known_names "$PATHS_ADDED"; echo; scan_private_literals "$PATHS_ADDED"; echo; scan_unknown_emails "$PATHS_ADDED"; echo; scan_phones "$PATHS_ADDED" msg; } | grep . | sed 's/^/(in a file path) /')
  [ -n "$PATH_HITS" ] && HITS="${HITS}${PATH_HITS}"$'\n'
fi
if [ "${#BIN_ENTRIES[@]}" -gt 0 ]; then
  collect_binary_strings
  BIN_HITS=$( { scan_content "$BINSTR"; echo; scan_known_names "$BINSTR"; echo; scan_private_literals "$BINSTR"; echo; scan_unknown_emails "$BINSTR_EMAIL"; } | grep . | tr -c '[:print:]\n' '?' | cut -c1-200 | sed 's/^/(in a binary file) /')
  [ -n "$BIN_HITS" ] && HITS="${HITS}${BIN_HITS}"$'\n'
fi
if [ "$MODE" = "--msg" ]; then
  PHONE_HITS=$(scan_phones "$ADDED" msg)
else
  PHONE_HITS=$(scan_phones "$ADDED" diff)
fi
[ -n "$PHONE_HITS" ] && HITS="${HITS}${PHONE_HITS}"$'\n'

# Third-party email check — diff content AND commit messages. Messages were exempt until the
# P1438 follow-up because of Co-Authored-By trailers; those trailers are noreply@ addresses, which
# the allowlist already covers (noreply@*), so the exemption bought nothing and let any address
# through a commit message. Same allowlist, same fail-open-if-absent rule as the diff check.
EMAIL_HITS=$(scan_unknown_emails "$ADDED")
[ -n "$EMAIL_HITS" ] && HITS="${HITS}${EMAIL_HITS}"$'\n'

# Also scan commit messages and author fields for range mode (no path allowlist — messages have no file path)
if [ -n "$MSGS" ]; then
  MSG_HITS=$(scan_content "$MSGS")
  [ -n "$MSG_HITS" ] && HITS="${HITS}${MSG_HITS}"$'\n'
  MSG_NAME_HITS=$( { scan_known_names "$MSGS"; scan_private_literals "$MSGS"; } )
  [ -n "$MSG_NAME_HITS" ] && HITS="${HITS}${MSG_NAME_HITS}"$'\n'
  MSG_PHONE_HITS=$(scan_phones "$MSGS" msg)
  [ -n "$MSG_PHONE_HITS" ] && HITS="${HITS}${MSG_PHONE_HITS}"$'\n'
  MSG_EMAIL_HITS=$(scan_unknown_emails "$MSGS")
  [ -n "$MSG_EMAIL_HITS" ] && HITS="${HITS}${MSG_EMAIL_HITS}"$'\n'
fi

# A matcher that failed has not shown the input clean.
if [ -s "$ERR_FLAG" ]; then input_failed "a matching tool failed"; fi

if [ -n "$HITS" ]; then
  # Shell-safety (.claude/rules/shell-safety.md): hit lines quote scanned content and seed names,
  # which may contain redirect/pipe tokens; those are neutralised. This does NOT make the output
  # eval-safe (backticks, $(), ; can remain) — callers must treat it strictly as data.
  printf '%s\n' "$HITS" | tr '<>|' '???' | head -20
fi
# Hits are printed first; a failed input step then decides the exit code.
[ "$INPUT_FAIL" = 1 ] && exit 3
[ -n "$HITS" ] && exit 1
exit 0
