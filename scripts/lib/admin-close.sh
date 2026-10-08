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
#   1. CLASSIFIED: frontmatter says `type: comment`, or carries a dated, non-empty
#      `withdrawn:` field, or the legacy `retracted` tag. Frontmatter only — a body
#      line showing the syntax never counts.
#   2. PROVENANCE: the classification is already present on the ACCEPTED BASE —
#      origin/main for a local ship, the event range's base in CI. A relabel inside
#      the closing range (real spec -> comment/withdrawn, then close) refuses, and so
#      does a spec that did not exist at the base at all. The relabel being the cheap
#      way to skip gates is the whole risk this route carries (spec Risks row 1).
#   3. NO IMPLEMENTATION CLAIMED: a spec that records dev, fix or inline is not
#      "nothing to gate" — it closes through the normal gates.
#   4. NO BRANCH AHEAD: no local or remote feature/pN-* or fix/pN-* ref carries a
#      commit the base lacks.
#   5. PATHS (closing commit): only the spec's own old path, its new path under
#      features/done/<sprint>/, and its exact UAT pair. Checked against the staged
#      set locally and against the commit's name-status in CI.
#
# WHAT THIS DOES NOT PROVE — stated so it is never inferred. The guarantee is scoped
# to OBSERVABLE repository evidence. Work done on a branch that was deleted, never
# pushed, or named outside feature/pN-* / fix/pN-* is invisible here (spec Risks row
# 2, ACCEPT). A relabel pushed in an EARLIER push than the close is outside the
# closing range and passes condition 2; it is visible in history, not refused.
#
# CONTRACT: functions set ADMIN_REASON (why not) and ADMIN_MARKER (which marker)
# and return 0 eligible / 1 not eligible / 2 could not decide (treated as 1 by every
# caller — fail closed). Every git call goes through `git -C <repo>`, so callers never
# need a subshell (which would lose the two globals). No function reads an
# environment variable: there is no knob that makes a spec eligible.
#
# Output contract (shell-safety.md): reasons carry no >, < or | — any value taken
# from a ref name or a file is passed through _ac_safe first.

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

# _ac_field <frontmatter> <key> — first `key:` value, trimmed, trailing comment and
# one layer of quotes removed. Here-strings, never a pipe into grep -m1 (epistemic.md
# gate 7: an early-exiting consumer under pipefail can report a match as a miss).
_ac_field() {
  local line
  line="$($_AC_GREP -m1 -E "^$2:" <<<"$1" || true)"
  [[ -z "$line" ]] && return 0
  sed -E "s/^$2:[[:space:]]*//; s/[[:space:]]+#.*\$//; s/[[:space:]]+\$//; s/^'(.*)'\$/\\1/; s/^\"(.*)\"\$/\\1/" <<<"$line"
}

# admin_classify <spec content> — 0 and ADMIN_MARKER set when the frontmatter
# carries an administrative marker; 1 otherwise. Markers are reported as fixed
# strings (the date is regex-checked digits), so ADMIN_MARKER is output-safe.
admin_classify() {
  local fm type wd tags
  ADMIN_MARKER=""
  fm="$(admin_frontmatter <<<"$1")"
  [[ -z "$fm" ]] && return 1
  type="$(_ac_field "$fm" type | tr 'A-Z' 'a-z')"
  if [[ "$type" == "comment" ]]; then
    ADMIN_MARKER="type: comment"; return 0
  fi
  wd="$(_ac_field "$fm" withdrawn)"
  local date_re='^[0-9]{4}-[0-9]{2}-[0-9]{2}([^0-9]|$)'
  if [[ "$wd" =~ $date_re ]]; then
    ADMIN_MARKER="withdrawn: ${wd:0:10}"; return 0
  fi
  # Legacy marker (P1274): an inline tag list carrying exactly `retracted`.
  tags="$(_ac_field "$fm" tags | tr 'A-Z' 'a-z' | tr -d "\"' ")"
  if [[ "$tags" == \[*\] ]]; then
    tags="${tags#[}"; tags="${tags%]}"
    if $_AC_GREP -qx 'retracted' <<<"$(tr ',' '\n' <<<"$tags")"; then
      ADMIN_MARKER="tag: retracted"; return 0
    fi
  fi
  return 1
}

# admin_records_impl <spec content> — 0 when the spec claims an implementation
# (dev, fix or inline), read both from frontmatter and from the first
# `pipeline_ran:` line anywhere, which is what gate 2.5 itself reads.
admin_records_impl() {
  local fm impl_re='(\[|,)[[:space:]]*(dev|fix|inline)(\.[0-9]+)?[[:space:]]*(,|\])'
  local src line
  fm="$(admin_frontmatter <<<"$1")"
  for src in "$fm" "$1"; do
    line="$($_AC_GREP -m1 '^pipeline_ran:' <<<"$src" || true)"
    [[ "$line" =~ $impl_re ]] && return 0
    $_AC_GREP -qE '^flow:[[:space:]]*inline[[:space:]]*$' <<<"$src" && return 0
  done
  return 1
}

# _ac_require_classified <label> <content> — ADMIN_REASON on failure.
_ac_require_classified() {
  if ! admin_classify "$2"; then
    ADMIN_REASON="the spec ${1} is not classified as comment, withdrawn or retracted"
    return 1
  fi
  if admin_records_impl "$2"; then
    ADMIN_REASON="the spec ${1} records its own implementation (dev, fix or inline) — it closes through the normal gates"
    return 1
  fi
  return 0
}

# admin_refs_ahead <repo> <pN> <base commit> — 0 when no local or remote
# feature/pN-* or fix/pN-* ref carries a commit the base lacks; 1 when one does;
# 2 when the comparison itself failed.
admin_refs_ahead() {
  local repo="$1" pn="$2" base="$3" refs ref n bad=""
  local re="^refs/(heads|remotes/[^/]+)/(feature|fix)/${pn}(-|\$)"
  if ! refs="$(git -C "$repo" for-each-ref --format='%(refname)' refs/heads refs/remotes 2>/dev/null)"; then
    ADMIN_REASON="could not list branch refs"; return 2
  fi
  while IFS= read -r ref; do
    [[ -z "$ref" ]] && continue
    [[ "$ref" =~ $re ]] || continue
    if ! n="$(git -C "$repo" rev-list --count "${base}..${ref}" 2>/dev/null)" || [[ ! "$n" =~ ^[0-9]+$ ]]; then
      ADMIN_REASON="could not compare $(_ac_safe "${ref#refs/}") with the base"; return 2
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

# admin_paths_ok <pN> <open spec path>   (stdin: `git diff --name-status --no-renames`)
# 0 when the change touches ONLY: D of the open spec path, A (or M) of the same
# basename directly under features/done/<sprint>/, and the exact UAT pair
# features/uat/<pN>.md -> features/done/<same sprint>/uat/<pN>.md. Exactly one spec
# deletion and one spec addition are required; anything else names the stray path.
admin_paths_ok() {
  local pn="$1" open="$2" st path rest base sprint="" saw_d=0 saw_a=0
  base="${open##*/}"
  if ! admin_open_path_ok "$pn" "$open"; then
    ADMIN_REASON="$(_ac_safe "$open") is not an open spec path for ${pn}"; return 1
  fi
  local pending_uat_sprint="" s
  while IFS=$'\t' read -r st path rest; do
    [[ -z "$st" && -z "$path" ]] && continue
    if [[ -n "$rest" ]]; then
      ADMIN_REASON="unexpected rename/copy entry in the closing change: $(_ac_safe "$path")"; return 1
    fi
    if [[ "$st" == "D" && "$path" == "$open" ]]; then
      saw_d=$((saw_d + 1)); continue
    fi
    if [[ "$st" == "A" ]] && s="$(_ac_done_sprint "$path" "$base")"; then
      sprint="$s"; saw_a=$((saw_a + 1)); continue
    fi
    if [[ "$st" == "D" && "$path" == "features/uat/${pn}.md" ]]; then
      continue
    fi
    if [[ "$st" == "A" ]] && s="$(_ac_done_sprint "$path" "uat/${pn}.md")"; then
      pending_uat_sprint="${s}"; continue
    fi
    ADMIN_REASON="the closing change touches $(_ac_safe "$path") ($(_ac_safe "$st")), which is neither the spec nor its UAT file"
    return 1
  done
  if [[ "$saw_d" -ne 1 || "$saw_a" -ne 1 ]]; then
    ADMIN_REASON="the closing change is not exactly one move of $(_ac_safe "$open") into features/done/ (deletions ${saw_d}, additions ${saw_a})"
    return 1
  fi
  if [[ -n "$pending_uat_sprint" && "$pending_uat_sprint" != "$sprint" ]]; then
    ADMIN_REASON="the UAT file moves to a different sprint folder than its spec"; return 1
  fi
  return 0
}

# admin_check_local <repo> <pN> <open spec path> <content being closed>
# The local ship's verdict (ship-gates.sh pre-close, git-ops.sh pre-lock and again
# under main.lock immediately before the commit). <content being closed> is the
# working-tree copy before the move and the STAGED blob after it — the bytes that
# will actually be committed.
admin_check_local() {
  local repo="$1" pn="$2" open="$3" closing="$4" base main head_blob base_blob
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
  admin_refs_ahead "$repo" "$pn" "$main" || return $?
  ADMIN_MARKER="$closing_marker"
  return 0
}

# admin_check_commit <repo> <pN> <closing commit> <range base>
# CI's verdict, re-derived from committed blobs only — never from a trailer or the
# commit message. <range base> is the left side of the ONE event range the workflow
# used to discover the close.
admin_check_commit() {
  local repo="$1" pn="$2" commit="$3" base="$4" parents ns open="" st path rest n_open=0 blob
  ADMIN_REASON=""; ADMIN_MARKER=""
  if [[ -z "$base" ]] || ! git -C "$repo" rev-parse --verify -q "${base}^{commit}" >/dev/null 2>&1; then
    ADMIN_REASON="the event range has no resolvable base"; return 2
  fi
  if ! parents="$(git -C "$repo" rev-list --parents -n 1 "$commit" 2>/dev/null)"; then
    ADMIN_REASON="closing commit $(_ac_safe "$commit") does not resolve"; return 2
  fi
  # shellcheck disable=SC2086
  set -- $parents
  if [[ $# -ne 2 ]]; then
    ADMIN_REASON="the closing commit is a merge or a root commit — refused, its change set is ambiguous"; return 1
  fi
  if ! ns="$(git -C "$repo" diff-tree --no-commit-id -r --name-status --no-renames "$commit" 2>/dev/null)"; then
    ADMIN_REASON="could not read the closing commit's change set"; return 2
  fi
  while IFS=$'\t' read -r st path rest; do
    if [[ "$st" == "D" ]] && admin_open_path_ok "$pn" "$path"; then
      open="$path"; n_open=$((n_open + 1))
    fi
  done <<< "$ns"
  if [[ "$n_open" -ne 1 ]]; then
    ADMIN_REASON="the closing commit does not delete exactly one open spec file for ${pn} (found ${n_open})"; return 1
  fi
  admin_paths_ok "$pn" "$open" <<< "$ns" || return 1
  if ! blob="$(git -C "$repo" show "${commit}^:${open}" 2>/dev/null)"; then
    ADMIN_REASON="the spec is missing from the closing commit's parent"; return 1
  fi
  _ac_require_classified "in the closing commit's parent" "$blob" || return 1
  local done_path
  done_path=""
  while IFS=$'\t' read -r st path rest; do
    if [[ "$st" == "A" ]] && _ac_done_sprint "$path" "${open##*/}" >/dev/null; then
      done_path="$path"; break
    fi
  done <<< "$ns"
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
  admin_refs_ahead "$repo" "$pn" "$commit" || return $?
  ADMIN_MARKER="$closing_marker"
  return 0
}
