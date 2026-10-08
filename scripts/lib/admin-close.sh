#!/usr/bin/env bash
# admin-close.sh — administrative closure of a spec that has nothing to gate (P1444).
#
# A `type: comment` note, a withdrawn spec, or a legacy `retracted` one has no
# implementation, so it can never pass gate 2.5 (completion + dev/fix run) or gate
# 2.7 (code review). Before P1444 every such close needed a founder override. This
# file decides, from repository evidence only, whether a close may skip those two
# gates instead. Sourced by ship-gates.sh and git-ops.sh (local ship) and by
# .github/workflows/closure-gate.yml (CI, fetched from the trusted base). It never
# closes anything itself.
#
# ELIGIBILITY — every condition must hold; the first failure is the verdict:
#   1. CLASSIFIED: frontmatter carries a dated `withdrawn:` field, or a `retracted` tag. Frontmatter
#      only, parsed strictly: a duplicated, quoted or unparseable classification key
#      refuses rather than being guessed at.
#   2. PROVENANCE: the classification is already present on the ACCEPTED BASE —
#      origin/main for a local ship, the event range's main-side base in CI. A relabel
#      inside the closing range (real spec -> comment/withdrawn, then close) refuses,
#      and so does a spec that did not exist at the base at all.
#   3. NO IMPLEMENTATION CLAIMED: a spec whose frontmatter records dev, fix or inline
#      (inline or block list, quoted or not) closes through the normal gates.
#   4. NO IMPLEMENTATION EVIDENCE (review round 1, Opus H1): main's history holds no
#      non-revert commit whose SUBJECT names pN and either touches a path outside
#      features/, is a merge, or is a "ready for QA" stamp; and (locally) no code
#      review entry names pN. This is what tells a real withdrawal from a relabel of
#      implemented work pushed in an earlier push, which provenance alone cannot.
#   5. NO BRANCH AHEAD: no local or remote feature/pN-* or fix/pN-* ref carries a
#      commit that main lacks.
#   6. PATHS (closing change): only the spec's own old path, its new path under
#      features/done/<sprint>/, and its exact UAT pair (both halves or neither).
#      Checked against the staged set locally (git-ops.sh, under main.lock) and
#      against the commit's name-status in CI. Read NUL-delimited everywhere, so a
#      non-ASCII name is never C-quoted out of the comparison.
#   7. ORDERING (local only, checked LAST): origin/main already carries this file.
#      CI judges a close with origin/main's copy, so before P1444 is pushed every
#      administrative close would fail CI. Because it is last, "ship P1444 first"
#      means every other condition already passed.
#
# WHAT THIS DOES NOT PROVE — stated so it is never inferred. The guarantee is scoped
# to OBSERVABLE repository evidence:
#   * Work on a branch that was deleted, never pushed, or named outside
#     feature/pN-* / fix/pN-*, under commit subjects that do not name pN, is
#     invisible here (spec Risks row 2, ACCEPT).
#   * A relabel pushed in an EARLIER push than the close, of a spec with NO
#     implementation evidence, passes — that is the residual relabel risk.
#   * Locally, origin/main and refs/remotes/* are whatever the last fetch left, and
#     any local process can rewrite them (`git update-ref`). The gate does not fetch
#     (no network in a closing path). A stale or forged origin/main can let a LOCAL
#     close through; CI re-derives the verdict from the pushed range with freshly
#     fetched refs, and that is where a relabel travelling with its close is caught.
#
# CONTRACT: functions set ADMIN_REASON (why not) and ADMIN_MARKER (which marker)
# and return 0 eligible / 1 not eligible / 2 could not decide (treated as 1 by every
# caller — fail closed). Every git call goes through `git -C <repo>`, so callers never
# need a subshell (which would lose the two globals). No function reads an
# environment variable: every UPPER-CASE name below is assigned in this file at
# source time (scripts/test-p1444-closure-gate.sh D9 enforces that).
#
# Output contract (shell-safety.md): reasons carry no >, < or | — any value taken
# from a ref name or a file is passed through _ac_safe first.

# ── THE ONE SWITCH (P1444 review M1) ────────────────────────────────────────────
# Whether a `type: comment` spec qualifies on that label alone. Founder decision
# 2026-10-08: NO — only withdrawn / retracted specs close administratively (13 of
# 14 open comment specs would otherwise be agent-closable). Setting this to 1
# re-admits `type: comment`; nothing else changes.
ADMIN_TYPE_COMMENT_ELIGIBLE=0

_AC_GREP=/usr/bin/grep
[[ -x "$_AC_GREP" ]] || _AC_GREP=grep

ADMIN_REASON=""
ADMIN_MARKER=""

# The accepted base for a local ship. Hardcoded on purpose: a configurable base is a
# knob that moves provenance to a ref the closer controls.
ADMIN_LOCAL_BASE_REF="refs/remotes/origin/main"
ADMIN_LOCAL_MAIN_REF="refs/heads/main"

# Keep only characters that cannot act as shell metacharacters in a status line.
_ac_safe() { printf '%s' "$1" | tr -cd 'A-Za-z0-9/._:@+, -' | cut -c1-120; }

# admin_frontmatter — stdin -> the lines between an opening `---` and a CLOSING
# `---`; nothing at all when the closing fence is never seen (same reader as
# ship-gates.sh's _frontmatter, so a body line can never be read as frontmatter).
admin_frontmatter() {
  awk '{ sub(/\r$/, "") } NR==1 { if ($0 !~ /^---[ \t]*$/) exit; next } $0 ~ /^---[ \t]*$/ { printf "%s", buf; exit } { buf = buf $0 "\n" }'
}

# One frontmatter key, parsed strictly. Prints exactly one of:
#   ABSENT | AMBIG (duplicated, or a quoted-key variant exists) | BAD (unparseable)
#   EMPTY | SCALAR<TAB>value | LIST<TAB>item<US>item<US>...
# Scalars: a double- or single-quoted value is taken to its closing quote (a `#`
# inside it is data, Gemini #7), and anything but a comment after it is BAD; a
# backslash inside quotes is BAD rather than half-interpreted. Lists: an inline
# `[a, "b"]` or a block of `- item` lines (indented or not). Anything else in a
# block — a nested key, a continuation — is BAD. Every BAD/AMBIG is a refusal by
# the caller, in whichever direction is fail-closed for that key.
_AC_KEY_AWK='
function trim(s) { sub(/^[ \t]+/, "", s); sub(/[ \t]+$/, "", s); return s }
function scalar(s,   q, rest, v, i) {
  s = trim(s); q = substr(s, 1, 1)
  if (q == "\"" || q == "\047") {
    rest = substr(s, 2); i = index(rest, q)
    if (i == 0) { BADV = 1; return "" }
    v = substr(rest, 1, i - 1)
    if (index(v, "\\") > 0) { BADV = 1; return "" }
    rest = trim(substr(rest, i + 1))
    if (rest != "" && substr(rest, 1, 1) != "#") { BADV = 1; return "" }
    return v
  }
  if (substr(s, 1, 1) == "#") return ""
  sub(/[ \t]+#.*$/, "", s)
  return trim(s)
}
{ sub(/\r$/, ""); L[NR] = $0 }
END {
  US = sprintf("%c", 31); n = 0; quoted = 0; at = 0
  for (i = 1; i <= NR; i++) {
    if (L[i] ~ ("^[\"\047]" key "[\"\047]?[ \t]*:")) quoted = 1
    if (L[i] ~ ("^" key "[ \t]*:")) { n++; at = i }
  }
  if (quoted || n > 1) { print "AMBIG"; exit }
  if (n == 0) { print "ABSENT"; exit }
  v = L[at]; sub("^" key "[ \t]*:", "", v); v = trim(v)
  if (v == "" || substr(v, 1, 1) == "#") {
    out = ""; cnt = 0
    for (j = at + 1; j <= NR; j++) {
      l = L[j]
      if (l ~ /^[ \t]*$/ || l ~ /^[ \t]+#/) continue
      if (l ~ /^[ \t]*-([ \t]|$)/) {
        it = l; sub(/^[ \t]*-[ \t]*/, "", it); it = scalar(it)
        if (BADV) { print "BAD"; exit }
        out = out it US; cnt++; continue
      }
      if (l ~ /^[^ \t]/) break
      print "BAD"; exit
    }
    if (cnt == 0) { print "EMPTY"; exit }
    print "LIST\t" out; exit
  }
  if (substr(v, 1, 1) == "[") {
    e = 0
    for (k = length(v); k > 0; k--) if (substr(v, k, 1) == "]") { e = k; break }
    if (e == 0) { print "BAD"; exit }
    rest = trim(substr(v, e + 1))
    if (rest != "" && substr(rest, 1, 1) != "#") { print "BAD"; exit }
    inner = substr(v, 2, e - 2)
    if (index(inner, "[") || index(inner, "]") || index(inner, "{") || index(inner, "}")) { print "BAD"; exit }
    out = ""
    if (trim(inner) != "") {
      m = split(inner, P, ",")
      for (k = 1; k <= m; k++) {
        it = scalar(P[k])
        if (BADV || it == "") { print "BAD"; exit }
        out = out it US
      }
    }
    print "LIST\t" out; exit
  }
  s = scalar(v)
  if (BADV) { print "BAD"; exit }
  if (s == "") { print "EMPTY"; exit }
  print "SCALAR\t" s
}'

# _ac_key <frontmatter> <key> — sets _AC_KIND and _AC_VAL (list items separated by
# the ASCII unit separator).
_AC_KIND=""
_AC_VAL=""
_ac_key() {
  local r
  r="$(awk -v key="$2" "$_AC_KEY_AWK" <<<"$1")"
  _AC_KIND="${r%%$'\t'*}"
  _AC_VAL=""
  [[ "$r" == *$'\t'* ]] && _AC_VAL="${r#*$'\t'}"
  return 0
}

# _ac_items — _AC_VAL as one lowercase item per line.
_ac_items() { printf '%s' "$_AC_VAL" | tr '\037' '\n' | tr 'A-Z' 'a-z'; }

# admin_classify <spec content> — 0 and ADMIN_MARKER set when the frontmatter
# carries an administrative marker; 1 when it does not; 3 when a classification key
# is ambiguous (ADMIN_REASON says which). Markers are fixed strings (the date is
# regex-checked digits), so ADMIN_MARKER is output-safe.
admin_classify() {
  local fm k type="" wd="" date_re='^[0-9]{4}-[0-9]{2}-[0-9]{2}([^0-9]|$)'
  ADMIN_MARKER=""
  fm="$(admin_frontmatter <<<"$1")"
  [[ -z "$fm" ]] && return 1
  for k in type withdrawn tags; do
    _ac_key "$fm" "$k"
    case "$_AC_KIND" in
      AMBIG|BAD)
        ADMIN_REASON="its frontmatter key '${k}' is duplicated, quoted or not parseable — refusing to guess its classification"
        return 3 ;;
    esac
  done
  _ac_key "$fm" type
  [[ "$_AC_KIND" == SCALAR ]] && type="$(tr 'A-Z' 'a-z' <<<"$_AC_VAL")"
  if [[ "$type" == "comment" && "$ADMIN_TYPE_COMMENT_ELIGIBLE" == 1 ]]; then
    ADMIN_MARKER="type: comment"; return 0
  fi
  _ac_key "$fm" withdrawn
  [[ "$_AC_KIND" == SCALAR ]] && wd="$_AC_VAL"
  if [[ "$wd" =~ $date_re ]]; then
    ADMIN_MARKER="withdrawn: ${wd:0:10}"; return 0
  fi
  _ac_key "$fm" tags
  if [[ "$_AC_KIND" == LIST ]] && $_AC_GREP -qx 'retracted' <<<"$(_ac_items)"; then
    ADMIN_MARKER="tag: retracted"; return 0
  fi
  return 1
}

# admin_records_impl <spec content> — 0 when the spec claims an implementation, OR
# when the keys that would say so are ambiguous (fail closed: an unreadable claim
# is treated as a claim). Reads the frontmatter strictly, and ALSO gate 2.5's own
# view (the first `pipeline_ran:` line and any `flow: inline` line anywhere in the
# file): the administrative route must refuse whenever gate 2.5 would consider an
# implementation recorded. That body read can refuse a note that merely quotes the
# syntax at column 0 (Gemini #8) — deliberate, it is the fail-closed direction.
admin_records_impl() {
  local fm line impl_re='^(dev|fix|inline)(\.[0-9]+)?$'
  local g25_re='(\[|,)[[:space:]]*(dev|fix|inline)(\.[0-9]+)?[[:space:]]*(,|\])'
  fm="$(admin_frontmatter <<<"$1")"
  _ac_key "$fm" pipeline_ran
  case "$_AC_KIND" in
    AMBIG|BAD) return 0 ;;
    LIST|SCALAR) $_AC_GREP -qE "$impl_re" <<<"$(_ac_items)" && return 0 ;;
  esac
  _ac_key "$fm" flow
  case "$_AC_KIND" in
    AMBIG|BAD) return 0 ;;
    SCALAR) [[ "$(tr 'A-Z' 'a-z' <<<"$_AC_VAL")" == inline ]] && return 0 ;;
  esac
  line="$($_AC_GREP -m1 '^pipeline_ran:' <<<"$1" || true)"
  [[ "$line" =~ $g25_re ]] && return 0
  $_AC_GREP -qE '^flow:[[:space:]]*inline[[:space:]]*$' <<<"$1" && return 0
  return 1
}

# _ac_require_classified <label> <content> — ADMIN_REASON on failure.
_ac_require_classified() {
  local rc=0
  admin_classify "$2" || rc=$?
  if [[ $rc -eq 3 ]]; then
    ADMIN_REASON="the spec ${1}: ${ADMIN_REASON}"; return 1
  elif [[ $rc -ne 0 ]]; then
    if [[ "$ADMIN_TYPE_COMMENT_ELIGIBLE" == 1 ]]; then
      ADMIN_REASON="the spec ${1} is not classified as comment, withdrawn or retracted"
    else
      ADMIN_REASON="the spec ${1} is not classified as withdrawn or retracted (type: comment alone does not qualify)"
    fi
    return 1
  fi
  if admin_records_impl "$2"; then
    ADMIN_REASON="the spec ${1} records its own implementation (dev, fix or inline), or its pipeline_ran/flow key is unreadable — it closes through the normal gates"
    return 1
  fi
  return 0
}

# admin_impl_evidence <repo> <pN> <commit> [finish-reviewed file]
# 0 when <commit>'s history holds no implementation evidence for pN; 1 when it does
# (ADMIN_REASON names up to three commits); 2 when history could not be read.
# Evidence = a non-revert commit whose SUBJECT names pN (word-bounded, any case) and
# is a merge, or is a "ready for QA" stamp, or touches any path outside features/;
# or a code-review entry naming pN in the given .finish-reviewed file. A commit that
# was later reverted still counts — over-refusing is the safe direction.
admin_impl_evidence() {
  local repo="$1" pn="$2" commit="$3" ff="${4:-}" log h p s sl why found="" n=0 tmp path outside
  local re="(^|[^a-z0-9])${pn}([^0-9]|\$)"
  if ! log="$(git -C "$repo" log --format='%H%x09%P%x09%s' -i -E --grep="$re" "$commit" 2>/dev/null)"; then
    ADMIN_REASON="could not read main's history"; return 2
  fi
  tmp="$(mktemp)" || { ADMIN_REASON="could not create a temporary file"; return 2; }
  while IFS=$'\t' read -r h p s; do
    [[ -z "$h" ]] && continue
    sl="$(tr 'A-Z' 'a-z' <<<"$s")"
    [[ "$sl" =~ $re ]] || continue
    [[ "$sl" == revert\ * ]] && continue
    why=""
    if [[ "$p" == *" "* ]]; then
      why="a merge"
    elif [[ "$sl" == *"ready for qa"* ]]; then
      why="a ready-for-QA stamp"
    else
      if ! git -C "$repo" diff-tree --no-commit-id -r --name-only -z "$h" > "$tmp" 2>/dev/null; then
        rm -f "$tmp"; ADMIN_REASON="could not read commit ${h:0:9}"; return 2
      fi
      outside=0
      while IFS= read -r -d '' path; do
        [[ "$path" == features/* ]] || { outside=1; break; }
      done < "$tmp"
      (( outside )) && why="changes outside features/"
    fi
    if [[ -n "$why" ]]; then
      n=$((n + 1))
      (( n <= 3 )) && found="${found}${found:+, }${h:0:9} (${why})"
    fi
  done <<< "$log"
  rm -f "$tmp"
  # Here-string, not a pipe: `grep | grep -q` under the caller's pipefail can report
  # a MATCH as a miss (epistemic.md gate 7) — here that would fail open.
  if [[ -n "$ff" && -r "$ff" ]] \
     && $_AC_GREP -qE "\"pn\": ?\"${pn}\"" <<<"$($_AC_GREP -E '"type": ?"code"' "$ff" 2>/dev/null || true)"; then
    found="${found}${found:+, }a code-review entry naming ${pn}"
    n=$((n + 1))
  fi
  if [[ "$n" -gt 0 ]]; then
    ADMIN_REASON="main holds implementation evidence for ${pn}: ${found} — not administrative; close it through the normal gates"
    return 1
  fi
  return 0
}

# admin_refs_ahead <repo> <pN> <main commit> [another main-side commit]
# 0 when no local or remote feature/pN-* or fix/pN-* ref carries a commit that the
# given main-side commit(s) lack; 1 when one does; 2 when the comparison failed.
# Locally both local main and origin/main are excluded, so a branch holding only
# origin/main's commits is not "ahead" while local main lags (Gemini #2).
admin_refs_ahead() {
  local repo="$1" pn="$2" refs ref n bad=""
  shift 2
  local re="^refs/(heads|remotes/[^/]+)/(feature|fix)/${pn}(-|\$)"
  if ! refs="$(git -C "$repo" for-each-ref --format='%(refname)' refs/heads refs/remotes 2>/dev/null)"; then
    ADMIN_REASON="could not list branch refs"; return 2
  fi
  while IFS= read -r ref; do
    [[ -z "$ref" ]] && continue
    [[ "$ref" =~ $re ]] || continue
    if ! n="$(git -C "$repo" rev-list --count "$ref" --not "$@" 2>/dev/null)" || [[ ! "$n" =~ ^[0-9]+$ ]]; then
      ADMIN_REASON="could not compare $(_ac_safe "${ref#refs/}") with main"; return 2
    fi
    if (( n > 0 )); then
      bad="${bad}${bad:+, }$(_ac_safe "${ref#refs/}") (${n} commit(s) not on main)"
    fi
  done <<< "$refs"
  if [[ -n "$bad" ]]; then
    ADMIN_REASON="a branch for ${pn} is ahead of main: ${bad} — ship or delete it first"
    return 1
  fi
  return 0
}

# admin_open_path_ok <pN> <path> — 0 when <path> is an OPEN spec path for pN
# (anywhere under features/ except done/, archive/, uat/).
admin_open_path_ok() {
  local base_re="^${1}_[^/]+\\.md\$"
  [[ "${2##*/}" =~ $base_re ]] || return 1
  case "$2" in
    features/done/*|features/archive/*|features/uat/*) return 1 ;;
    features/*) return 0 ;;
  esac
  return 1
}

# _ac_done_sprint <path> <basename> — prints <sprint> when <path> is exactly
# features/done/<sprint>/<basename>. String operations, not a regex built from a
# filename, so a basename carrying regex metacharacters cannot widen the match.
_ac_done_sprint() {
  local rest="${1#features/done/}" sprint
  [[ "$rest" == "$1" ]] && return 1
  sprint="${rest%%/*}"
  [[ -n "$sprint" && "$rest" == "${sprint}/$2" ]] || return 1
  printf '%s' "$sprint"
}

# admin_paths_ok <pN> <open spec path>
#   stdin: `git diff --name-status --no-renames -z` (or diff-tree -z), STATUS\0PATH\0
# 0 when the change touches ONLY: D of the open spec path, A of the same basename
# directly under features/done/<sprint>/, and optionally the exact UAT PAIR — D of
# features/uat/<pN>.md together with A of features/done/<same sprint>/uat/<pN>.md
# (one half alone refuses, Gemini #4). Exactly one spec deletion and one addition.
# A modification (M) of an existing closed copy is not a close and refuses.
admin_paths_ok() {
  local pn="$1" open="$2" st path base sprint="" saw_d=0 saw_a=0 uat_d=0 uat_a=0 uat_sprint="" s
  base="${open##*/}"
  if ! admin_open_path_ok "$pn" "$open"; then
    ADMIN_REASON="$(_ac_safe "$open") is not an open spec path for ${pn}"; return 1
  fi
  while IFS= read -r -d '' st && IFS= read -r -d '' path; do
    if [[ "$st" == "D" && "$path" == "$open" ]]; then
      saw_d=$((saw_d + 1)); continue
    fi
    if [[ "$st" == "A" ]] && s="$(_ac_done_sprint "$path" "$base")"; then
      sprint="$s"; saw_a=$((saw_a + 1)); continue
    fi
    if [[ "$st" == "D" && "$path" == "features/uat/${pn}.md" ]]; then
      uat_d=$((uat_d + 1)); continue
    fi
    if [[ "$st" == "A" ]] && s="$(_ac_done_sprint "$path" "uat/${pn}.md")"; then
      uat_sprint="$s"; uat_a=$((uat_a + 1)); continue
    fi
    ADMIN_REASON="the closing change touches $(_ac_safe "$path") ($(_ac_safe "$st")), which is neither the spec nor its UAT file"
    return 1
  done
  if [[ "$saw_d" -ne 1 || "$saw_a" -ne 1 ]]; then
    ADMIN_REASON="the closing change is not exactly one move of $(_ac_safe "$open") into features/done/ (deletions ${saw_d}, additions ${saw_a})"
    return 1
  fi
  if [[ "$uat_d" -ne "$uat_a" ]]; then
    ADMIN_REASON="the UAT file must move as a pair (features/uat/${pn}.md removed ${uat_d}, done copy added ${uat_a})"
    return 1
  fi
  if [[ "$uat_a" -eq 1 && "$uat_sprint" != "$sprint" ]]; then
    ADMIN_REASON="the UAT file moves to a different sprint folder than its spec"; return 1
  fi
  return 0
}

# admin_check_local <repo> <pN> <open spec path> <content being closed>
# The local ship's verdict (ship-gates.sh pre-close, git-ops.sh pre-lock, again
# under main.lock immediately before the commit, and once more AFTER it). <content
# being closed> is the working-tree copy before the move and the STAGED blob after
# it — the bytes that will actually be committed.
admin_check_local() {
  local repo="$1" pn="$2" open="$3" closing="$4" base main head_blob base_blob common rc=0
  ADMIN_REASON=""; ADMIN_MARKER=""
  if ! admin_open_path_ok "$pn" "$open"; then
    ADMIN_REASON="$(_ac_safe "$open") is not an open spec path for ${pn}"; return 1
  fi
  _ac_require_classified "being closed" "$closing" || return 1
  local closing_marker="$ADMIN_MARKER"
  if ! head_blob="$(git -C "$repo" show "${ADMIN_LOCAL_MAIN_REF}:${open}" 2>/dev/null)"; then
    ADMIN_REASON="the spec is not committed on main at $(_ac_safe "$open")"; return 1
  fi
  _ac_require_classified "as committed on main" "$head_blob" || return 1
  if ! base="$(git -C "$repo" rev-parse --verify -q "${ADMIN_LOCAL_BASE_REF}^{commit}" 2>/dev/null)" || [[ -z "$base" ]]; then
    ADMIN_REASON="origin/main is not available locally, so the classification's provenance cannot be established"
    return 2
  fi
  if ! base_blob="$(git -C "$repo" show "${base}:${open}" 2>/dev/null)"; then
    ADMIN_REASON="the spec does not exist at origin/main — a spec created inside the closing range has no provenance; push it first"
    return 1
  fi
  if ! _ac_require_classified "at origin/main" "$base_blob"; then
    ADMIN_REASON="${ADMIN_REASON} — a relabel inside the closing range does not count; the classification must already be on origin/main"
    return 1
  fi
  if ! main="$(git -C "$repo" rev-parse --verify -q "${ADMIN_LOCAL_MAIN_REF}^{commit}" 2>/dev/null)" || [[ -z "$main" ]]; then
    ADMIN_REASON="no local main branch"; return 2
  fi
  common="$(git -C "$repo" rev-parse --path-format=absolute --git-common-dir 2>/dev/null || true)"
  admin_impl_evidence "$repo" "$pn" "$main" "${common:+${common}/.finish-reviewed}" || return $?
  admin_refs_ahead "$repo" "$pn" "$main" "$base" || return $?
  # LAST, so this reason implies every condition above passed (spec Done-When 9).
  if ! git -C "$repo" cat-file -e "${base}:scripts/lib/admin-close.sh" 2>/dev/null; then
    ADMIN_REASON="origin/main does not carry scripts/lib/admin-close.sh yet — ship P1444 first (CI judges a close with origin/main's copy and would refuse this one); every other condition passed"
    return 1
  fi
  ADMIN_MARKER="$closing_marker"
  return 0
}

# admin_check_commit <repo> <pN> <closing commit> <range base> <main ref>
# CI's verdict, re-derived from committed blobs only — never from a trailer or the
# commit message. <range base> is the left side of the ONE event range the workflow
# used to discover the close (always on main's side, see closure-gate.yml); <main
# ref> is what branches are compared against (Codex #3: main, never the close).
# A merge commit refuses (Codex #12): its change set is ambiguous, and git-ops never
# closes with one.
admin_check_commit() {
  local repo="$1" pn="$2" commit="$3" base="$4" mainref="${5:-}" parents open="" st path n_open=0 blob tmp done_path=""
  ADMIN_REASON=""; ADMIN_MARKER=""
  if [[ -z "$base" ]] || ! git -C "$repo" rev-parse --verify -q "${base}^{commit}" >/dev/null 2>&1; then
    ADMIN_REASON="the event range has no resolvable base"; return 2
  fi
  if [[ -z "$mainref" ]] || ! git -C "$repo" rev-parse --verify -q "${mainref}^{commit}" >/dev/null 2>&1; then
    ADMIN_REASON="main is not resolvable, so branches cannot be compared with it"; return 2
  fi
  if ! parents="$(git -C "$repo" rev-list --parents -n 1 "$commit" 2>/dev/null)"; then
    ADMIN_REASON="closing commit $(_ac_safe "$commit") does not resolve"; return 2
  fi
  # shellcheck disable=SC2086
  set -- $parents
  if [[ $# -ne 2 ]]; then
    ADMIN_REASON="the closing commit is a merge or a root commit — refused, its change set is ambiguous"; return 1
  fi
  tmp="$(mktemp)" || { ADMIN_REASON="could not create a temporary file"; return 2; }
  if ! git -C "$repo" diff-tree --no-commit-id -r --name-status --no-renames -z "$commit" > "$tmp" 2>/dev/null; then
    rm -f "$tmp"; ADMIN_REASON="could not read the closing commit's change set"; return 2
  fi
  while IFS= read -r -d '' st && IFS= read -r -d '' path; do
    if [[ "$st" == "D" ]] && admin_open_path_ok "$pn" "$path"; then
      open="$path"; n_open=$((n_open + 1))
    fi
  done < "$tmp"
  if [[ "$n_open" -ne 1 ]]; then
    rm -f "$tmp"
    ADMIN_REASON="the closing commit does not delete exactly one open spec file for ${pn} (found ${n_open})"; return 1
  fi
  if ! admin_paths_ok "$pn" "$open" < "$tmp"; then rm -f "$tmp"; return 1; fi
  while IFS= read -r -d '' st && IFS= read -r -d '' path; do
    if [[ "$st" == "A" ]] && _ac_done_sprint "$path" "${open##*/}" >/dev/null; then
      done_path="$path"; break
    fi
  done < "$tmp"
  rm -f "$tmp"
  if ! blob="$(git -C "$repo" show "${commit}^:${open}" 2>/dev/null)"; then
    ADMIN_REASON="the spec is missing from the closing commit's parent"; return 1
  fi
  _ac_require_classified "in the closing commit's parent" "$blob" || return 1
  if [[ -z "$done_path" ]] || ! blob="$(git -C "$repo" show "${commit}:${done_path}" 2>/dev/null)"; then
    ADMIN_REASON="the closed copy is missing from the closing commit"; return 1
  fi
  _ac_require_classified "as closed" "$blob" || return 1
  local closing_marker="$ADMIN_MARKER"
  if ! blob="$(git -C "$repo" show "${base}:${open}" 2>/dev/null)"; then
    ADMIN_REASON="the spec does not exist at the range base — a spec created inside the closing range has no provenance"
    return 1
  fi
  if ! _ac_require_classified "at the range base" "$blob"; then
    ADMIN_REASON="${ADMIN_REASON} — a relabel inside the closing range does not count"
    return 1
  fi
  admin_impl_evidence "$repo" "$pn" "$commit" || return $?
  admin_refs_ahead "$repo" "$pn" "$mainref" || return $?
  ADMIN_MARKER="$closing_marker"
  return 0
}
