#!/usr/bin/env bash
# scripts/sync-agent-skills.sh — project .claude/commands/slava/**/*.md into a
# directory-per-skill tree at .agents/skills/, so non-Claude harnesses (DeepSeek
# Harness, Codex, ...) that only understand the Agent Skills convention
# (<name>/SKILL.md) can discover this repo's skills. (P1151)
#
# .claude/commands/slava/ remains the single source of truth. .agents/skills/
# is fully generated and is committed (see .gitignore comment) so a fresh
# clone, a cloud agent VM, or a worktree has the projection without running
# this script. NEVER hand-edit anything under .agents/skills/ — regenerate.
#
# Rules applied (see features/p1151_universal_multi_harness_architecture.md §2):
#   D2 — a source is projected iff its frontmatter has a `description:` field.
#        This is what excludes payload files (criteria/*.md, agent.md,
#        synthesizer.md) that are read BY a skill, not invocable themselves.
#   D3 — projected name = <basename> minus '.md', EXCEPT a source literally
#        named SKILL.md, which takes its PARENT directory's name instead
#        (avoids 25 different sources all wanting the name "SKILL").
#   D4 — two sources deriving the same name is a HARD FAIL that lists the
#        pair, UNLESS exactly one of them is a declared alias (its
#        description reads "...alias for /...") — the alias is skipped and
#        the canonical source is linked.
#   D5 — anything under an `archive/` path segment is excluded.
#   D7 — projection unit is a DIRECTORY: .agents/skills/<name>/SKILL.md is a
#        RELATIVE symlink back to the source file. A flat file symlink does
#        not satisfy the Agent Skills convention this projects into.
#   D8 — a qualifying source's frontmatter `name:` field must equal the
#        projected directory name. Mismatch is a HARD FAIL (source-of-truth
#        defect, not drift) — fix the source's `name:` field, don't patch
#        around it here.
#
# Usage:
#   scripts/sync-agent-skills.sh                     regenerate .agents/skills/ in place
#   scripts/sync-agent-skills.sh --check              verify only; exit non-zero + print
#                                                      drift; changes NOTHING on disk
#   scripts/sync-agent-skills.sh --src-dir D --out-dir D2 [--check]
#                                                      override scan/output roots
#                                                      (testability — see
#                                                      scripts/sync-agent-skills.test.sh)
#
# Output contract (shell-safety.md, P783): no '>', '<', or '|' at word
# boundaries in any printed line — this script's output must stay eval-safe.
set -u

SRC_DIR=".claude/commands/slava"
OUT_DIR=".agents/skills"
CHECK_MODE=0

while [[ $# -gt 0 ]]; do
  case "$1" in
    --check) CHECK_MODE=1; shift ;;
    --src-dir) SRC_DIR="$2"; shift 2 ;;
    --out-dir) OUT_DIR="$2"; shift 2 ;;
    *) echo "sync-agent-skills: unknown argument: $1" >&2; exit 2 ;;
  esac
done

if [[ ! -d "$SRC_DIR" ]]; then
  echo "sync-agent-skills: source dir not found: $SRC_DIR" >&2
  exit 2
fi

WORK="$(mktemp -d "${TMPDIR:-/tmp}/sync-agent-skills.XXXXXX")"
trap 'rm -rf "$WORK"' EXIT

# ─── helpers ────────────────────────────────────────────────────────────────

# has_description FILE — true iff the frontmatter block (between the first
# two '---' lines) contains a description: field.
has_description() {
  awk '
    /^---$/ { c++; if (c==2) exit }
    c==1 && /^description:/ { found=1 }
    END { exit !found }
  ' "$1"
}

# is_alias FILE — heuristic for D4's alias-skip: description text names
# itself an alias for another skill (the known instance: slava/note.md
# vs slava/util/note.md).
is_alias() {
  grep -qE '^description:.*[Aa]lias for /' "$1"
}

# name_field FILE — the frontmatter `name:` value, quotes stripped.
name_field() {
  grep -m1 '^name:' "$1" | sed -E 's/^name:[[:space:]]*//; s/^"(.*)"$/\1/; s/^'"'"'(.*)'"'"'$/\1/'
}

# derive_name PATH — the projected directory name for a source path (D3).
derive_name() {
  local path="$1" base
  base="$(basename "$path")"
  if [[ "$base" == "SKILL.md" ]]; then
    basename "$(dirname "$path")"
  else
    echo "${base%.md}"
  fi
}

# relpath FROM_DIR TO_PATH — relative path from FROM_DIR to TO_PATH. Both
# arguments are plain repo-relative (or cwd-relative) paths using '/' — no
# symlink resolution, this operates on logical paths only. Pure bash, no
# associative arrays (this repo's default /bin/bash is 3.2 — bash 4+ only).
relpath() {
  local from="${1%/}" to="$2"
  local -a from_parts to_parts
  IFS='/' read -ra from_parts <<< "$from"
  IFS='/' read -ra to_parts <<< "$to"
  local i=0 minlen=${#from_parts[@]}
  [[ ${#to_parts[@]} -lt $minlen ]] && minlen=${#to_parts[@]}
  while [[ $i -lt $minlen && "${from_parts[$i]}" == "${to_parts[$i]}" ]]; do
    i=$((i + 1))
  done
  local up_count=$(( ${#from_parts[@]} - i ))
  local result="" j=0
  while [[ $j -lt $up_count ]]; do
    result="${result}../"
    j=$((j + 1))
  done
  local k=$i
  while [[ $k -lt ${#to_parts[@]} ]]; do
    result="${result}${to_parts[$k]}"
    k=$((k + 1))
    [[ $k -lt ${#to_parts[@]} ]] && result="${result}/"
  done
  echo "$result"
}

# ─── step 1: scan sources, apply D2 (description) + D5 (exclude archive/) ──

CANDIDATES="$WORK/candidates.tsv"   # name<TAB>path
: > "$CANDIDATES"

while IFS= read -r f; do
  [[ -z "$f" ]] && continue
  has_description "$f" || continue
  printf '%s\t%s\n' "$(derive_name "$f")" "$f" >> "$CANDIDATES"
done < <(find "$SRC_DIR" -name '*.md' -not -path '*/archive/*' 2>/dev/null | sort -u)

# ─── step 2: resolve D4 collisions ─────────────────────────────────────────

RESOLVED="$WORK/resolved.tsv"       # name<TAB>path — final canonical mapping
COLLISIONS="$WORK/collisions.txt"
: > "$RESOLVED"
: > "$COLLISIONS"

cut -f1 "$CANDIDATES" | sort -u > "$WORK/all_names.txt"
while IFS= read -r name; do
  [[ -z "$name" ]] && continue
  MATCHES="$WORK/matches.tsv"
  awk -F'\t' -v n="$name" '$1 == n' "$CANDIDATES" > "$MATCHES"
  COUNT=$(wc -l < "$MATCHES" | tr -d ' ')
  if [[ "$COUNT" -eq 1 ]]; then
    cat "$MATCHES" >> "$RESOLVED"
    continue
  fi
  # more than one source wants this name — try alias resolution (D4)
  NON_ALIAS="$WORK/non_alias.tsv"
  : > "$NON_ALIAS"
  while IFS=$'\t' read -r _ path; do
    [[ -z "$path" ]] && continue
    is_alias "$path" || printf '%s\t%s\n' "$name" "$path" >> "$NON_ALIAS"
  done < "$MATCHES"
  NA_COUNT=$(wc -l < "$NON_ALIAS" | tr -d ' ')
  if [[ "$NA_COUNT" -eq 1 ]]; then
    cat "$NON_ALIAS" >> "$RESOLVED"
  else
    PAIR="$(cut -f2 "$MATCHES" | tr '\n' ' ')"
    echo "COLLISION:${name}:${PAIR}" >> "$COLLISIONS"
  fi
done < "$WORK/all_names.txt"

if [[ -s "$COLLISIONS" ]]; then
  echo "sync-agent-skills: unresolved name collisions (D4) — hard fail:" >&2
  cat "$COLLISIONS" >&2
  exit 1
fi

# ─── step 3: D8 — name field must equal projected directory name ──────────

MISMATCHES="$WORK/mismatches.txt"
: > "$MISMATCHES"
while IFS=$'\t' read -r name path; do
  [[ -z "$name" ]] && continue
  actual_name="$(name_field "$path")"
  if [[ "$actual_name" != "$name" ]]; then
    echo "NAME_MISMATCH:${name}:name_field=${actual_name}:file=${path}" >> "$MISMATCHES"
  fi
done < "$RESOLVED"

if [[ -s "$MISMATCHES" ]]; then
  echo "sync-agent-skills: frontmatter name != projected directory name (D8) — hard fail:" >&2
  cat "$MISMATCHES" >&2
  echo "sync-agent-skills: fix the source file's name: field to match its directory name." >&2
  exit 1
fi

sort -o "$RESOLVED" "$RESOLVED"
TOTAL=$(wc -l < "$RESOLVED" | tr -d ' ')

# ─── step 4: --check mode — verify only, change nothing ───────────────────

if [[ "$CHECK_MODE" -eq 1 ]]; then
  DRIFT="$WORK/drift.txt"
  : > "$DRIFT"

  while IFS=$'\t' read -r name path; do
    [[ -z "$name" ]] && continue
    expected="$(relpath "${OUT_DIR}/${name}" "$path")"
    skill_link="${OUT_DIR}/${name}/SKILL.md"
    if [[ ! -d "${OUT_DIR}/${name}" ]]; then
      echo "DRIFT_MISSING_DIR:${name}" >> "$DRIFT"
    elif [[ ! -L "$skill_link" ]]; then
      echo "DRIFT_MISSING_LINK:${name}" >> "$DRIFT"
    else
      actual="$(readlink "$skill_link")"
      if [[ "$actual" != "$expected" ]]; then
        echo "DRIFT_TARGET_MISMATCH:${name}:expected=${expected}:actual=${actual}" >> "$DRIFT"
      fi
    fi
  done < "$RESOLVED"

  if [[ -d "$OUT_DIR" ]]; then
    while IFS= read -r existing_name; do
      [[ -z "$existing_name" ]] && continue
      if ! grep -qF "$(printf '%s\t' "$existing_name")" "$RESOLVED"; then
        echo "DRIFT_ORPHAN:${existing_name}" >> "$DRIFT"
      fi
    done < <(find "$OUT_DIR" -mindepth 1 -maxdepth 1 -type d -exec basename {} \; | sort)
  fi

  DRIFT_N=$(wc -l < "$DRIFT" | tr -d ' ')
  if [[ "$DRIFT_N" -gt 0 ]]; then
    echo "sync-agent-skills --check: DRIFT DETECTED (${DRIFT_N} issue(s)):" >&2
    cat "$DRIFT" >&2
    echo "sync-agent-skills --check: run 'scripts/sync-agent-skills.sh' (no flag) to regenerate." >&2
    exit 1
  fi

  echo "sync-agent-skills --check: OK — ${TOTAL} skills in sync, 0 collisions, 0 drift"
  exit 0
fi

# ─── step 5: regenerate — create/update the tree, then prune orphans ──────

mkdir -p "$OUT_DIR"

while IFS=$'\t' read -r name path; do
  [[ -z "$name" ]] && continue
  target_dir="${OUT_DIR}/${name}"
  mkdir -p "$target_dir"
  expected="$(relpath "$target_dir" "$path")"
  rm -f "${target_dir}/SKILL.md"
  ln -s "$expected" "${target_dir}/SKILL.md"
done < "$RESOLVED"

PRUNED=0
if [[ -d "$OUT_DIR" ]]; then
  while IFS= read -r existing_name; do
    [[ -z "$existing_name" ]] && continue
    if ! grep -qF "$(printf '%s\t' "$existing_name")" "$RESOLVED"; then
      echo "sync-agent-skills: removing orphaned skill directory: ${existing_name}"
      rm -rf "${OUT_DIR:?}/${existing_name}"
      PRUNED=$((PRUNED + 1))
    fi
  done < <(find "$OUT_DIR" -mindepth 1 -maxdepth 1 -type d -exec basename {} \; | sort)
fi

echo "sync-agent-skills: generated ${TOTAL} skills in ${OUT_DIR}/, 0 collisions, ${PRUNED} orphan(s) pruned"
exit 0
