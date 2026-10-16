#!/usr/bin/env bash
# check-disclosure.sh — every NEWLY ADDED spec must declare `disclosure:` (P1255).
#
# Two modes, one implementation (the pre-commit hook and the CI required check
# must not drift):
#   (no args)          staged mode  — scans the index (pre-commit)
#   --range A..B       range mode   — scans a pushed commit range (CI)
#
# Scope: top-level `features/pN_*.md` only, and only files ADDED (--diff-filter=A).
#
#   * A-only is the GRANDFATHERING mechanism, not an oversight. The specs that
#     predate this field show as M for the rest of their lives; widening to AM
#     (as the migration checks at pre-commit-checks.sh ~L1226 do, for their own
#     good reasons) would flag every one of them on the next unrelated edit.
#   * The `[^/]*` excludes features/done/** and features/archive/**. /ship
#     `git mv`s a spec into features/done/DATE/, and when git does not pair that
#     as a rename the destination lands as A — which would block shipping every
#     legacy spec. Verified by command, 2026-09-08. A closed spec is past the
#     point this gate protects.
#
# This is NOT a content detector. It never inspects what a spec says. It enforces
# only that the author made the public/embargo call — docs/decisions.md
# 2026-07-15 [security] rejects the detection class outright, and rightly.
set -euo pipefail

RED=$'\033[0;31m'; GREEN=$'\033[0;32m'; YELLOW=$'\033[1;33m'; NC=$'\033[0m'
[[ -t 1 ]] || { RED=""; GREEN=""; YELLOW=""; NC=""; }

RANGE=""
while [[ $# -gt 0 ]]; do
  case "$1" in
    --range) RANGE="${2:-}"; shift 2 ;;
    -h|--help) sed -n '2,25p' "$0"; exit 0 ;;
    *) echo "check-disclosure: unknown argument '$1'" >&2; exit 2 ;;
  esac
done

SPEC_RE='^features/p[0-9][^/]*\.md$'

if [[ -n "$RANGE" ]]; then
  new_specs="$(git diff --name-only --diff-filter=A "$RANGE" 2>/dev/null \
    | { grep -E "$SPEC_RE" || true; })"
  rev="${RANGE##*..}"
  read_blob() { git show "${rev}:$1" 2>/dev/null || true; }
else
  new_specs="$(git diff --cached --name-only --diff-filter=A 2>/dev/null \
    | { grep -E "$SPEC_RE" || true; })"
  # Read the STAGED blob, never the worktree copy: the worktree may carry later
  # edits that are not part of this commit (.claude/rules/git.md — a pathspec'd
  # commit re-reads the worktree, and that is exactly the trap to avoid).
  read_blob() { git show ":$1" 2>/dev/null || true; }
fi

# ── P1507: `disclosure: embargo` content must never reach main ──────────────
# A sensitive spec lives on its own unpushed branch, then in .private forever. The
# one leak nothing else stopped is a copy committed on main by mistake — including
# one copied back out of .private (P1507 leak path 3; probe 2026-10-15: this script
# exited 0 for it). Scope is every ADDED or MODIFIED markdown blob under features/
# (any case), by CONTENT, at any depth; deletions are fine. Renames count as adds
# (--no-renames). Range mode reads every commit in the range, a merge against its
# first parent, so a spec added and deleted inside one push, or introduced by a
# merge, is still refused: it would be in public history. Staged mode runs on every
# HEAD except a feature/ or fix/ branch (where an embargoed spec belongs), so a
# detached HEAD later fast-forwarded onto main is covered too.
# The parser is at least as strict as git-ops.sh ship_disclosure_of_content: a
# `disclosure:` KEY line reading embargo ANYWHERE in the file counts (ship accepts
# a fence anywhere), tolerating BOM, CRLF, indentation, quoted / any-case key,
# whitespace before the colon and inside a quote. A prose mention mid-line does not.
# Fails closed when python3 is missing.
EMB_PY='
import re, sys
t = sys.stdin.buffer.read().decode("utf-8", "replace").lstrip("\ufeff").replace("\r", "")
pat = re.compile(r"""^\s*["\x27]?disclosure["\x27]?\s*:\s*["\x27]?\s*embargo\b""", re.I)
sys.exit(0 if any(pat.match(l) for l in t.split("\n")) else 1)
'
command -v python3 >/dev/null 2>&1 || { echo "${RED}✗ check-disclosure: python3 is required for the P1507 embargo guard${NC}"; exit 1; }
is_md_feature() {
  local lc; lc="$(printf '%s' "$1" | tr '[:upper:]' '[:lower:]')"
  [[ "$lc" == features/* && "$lc" =~ \.(md|markdown)$ ]]
}
leaks=""
if [[ -n "$RANGE" ]]; then
  while IFS= read -r c; do
    [[ -z "$c" ]] && continue
    if git rev-parse -q --verify "${c}^2" >/dev/null 2>&1; then
      list_cmd=(git diff -z --name-only --no-renames --diff-filter=AM "${c}^1" "$c")
    else
      list_cmd=(git diff-tree -r -z --root --no-commit-id --no-renames --name-only --diff-filter=AM "$c")
    fi
    while IFS= read -r -d '' p; do
      is_md_feature "$p" || continue
      if git show "${c}:${p}" 2>/dev/null | python3 -c "$EMB_PY"; then leaks+="  ${p} (commit ${c:0:12})"$'\n'; fi
    done < <("${list_cmd[@]}" 2>/dev/null)
  done < <(git rev-list "$RANGE" 2>/dev/null)
else
  _head="$(git symbolic-ref -q --short HEAD 2>/dev/null || echo DETACHED)"
  case "$_head" in
    feature/*|fix/*) : ;;   # an embargoed spec belongs on its own branch
    *)
      while IFS= read -r -d '' p; do
        is_md_feature "$p" || continue
        if git show ":${p}" 2>/dev/null | python3 -c "$EMB_PY"; then leaks+="  ${p}"$'\n'; fi
      done < <(git diff --cached -z --name-only --no-renames --diff-filter=AM 2>/dev/null) ;;
  esac
fi
if [[ -n "$leaks" ]]; then
  echo "${RED}✗ disclosure: embargo content must never reach main (P1507):${NC}"
  printf '%s' "$leaks"
  echo "${YELLOW}  A sensitive spec stays on its own feature branch while in flight, then in${NC}"
  echo "${YELLOW}  .private forever (git-ops.sh archive-spec). Unstage it; never copy it back.${NC}"
  exit 1
fi

if [[ -z "$new_specs" ]]; then
  echo "${GREEN}✓ No newly added specs to check${NC}"
  exit 0
fi

bad=0
while IFS= read -r spec_file; do
  [[ -z "$spec_file" ]] && continue
  # Canonical value parse, shared in shape by every reader of this field
  # (check-disclosure.sh, git-ops.sh ship_spec_disclosure, ship-gates.sh gate 1.5,
  # validate-doc-links.cjs isEmbargoedSpec, fix-frontmatter.py). Three steps, and
  # each one is a bug that was really present before it was added:
  #   1. strip a whitespace-preceded `#` comment — `disclosure: embargo # pending`
  #      is valid YAML whose value is `embargo`; reading it raw made the link gate
  #      treat an embargoed spec as publishable (FAIL-OPEN, found 2026-09-08).
  #   2. trim.
  #   3. strip only a MATCHED surrounding quote pair, never every quote character:
  #      `tr -d` turned the invalid value 'pub"lic' into `public` and passed it.
  val="$(read_blob "$spec_file" \
    | sed -n '/^---$/,/^---$/p' \
    | { grep -E '^disclosure:' || true; } \
    | sed -n '1p' \
    | sed 's/^disclosure://' \
    | sed 's/[[:space:]]#.*$//' \
    | sed 's/^[[:space:]]*//; s/[[:space:]]*$//' \
    | sed "s/^'\\(.*\\)'$/\\1/; s/^\"\\(.*\\)\"$/\\1/")"
  if [[ -z "$val" ]]; then
    echo "${RED}✗ $spec_file: missing disclosure:${NC}"
    bad=$((bad + 1))
  elif [[ "$val" != "public" && "$val" != "embargo" ]]; then
    echo "${RED}✗ $spec_file: invalid disclosure: '$val'${NC}"
    bad=$((bad + 1))
  fi
done <<<"$new_specs"

if (( bad > 0 )); then
  echo "${YELLOW}  Every new spec must declare disclosure: public | embargo${NC}"
  echo "${YELLOW}    public  — safe to publish now (the default for most specs)${NC}"
  echo "${YELLOW}    embargo — describes a live, unfixed defect in an authenticated${NC}"
  echo "${YELLOW}              or anon-reachable surface; stays branch-born until the${NC}"
  echo "${YELLOW}              fix is confirmed on prod (see .claude/rules/features.md)${NC}"
  exit 1
fi

echo "${GREEN}✓ disclosure: declared on all newly added specs${NC}"
