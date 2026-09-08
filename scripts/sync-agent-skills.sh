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
#        generated regular file, byte-identical to its canonical source.
#        Codex's live catalog did not expose the earlier SKILL.md symlinks;
#        regular files also survive consumers that do not preserve symlinks.
#   D8 — a qualifying source's frontmatter `name:` field must equal the
#        projected directory name. Mismatch is a HARD FAIL (source-of-truth
#        defect, not drift) — fix the source's `name:` field, don't patch
#        around it here.
#   D9 — a derived name must be a safe single path component. `.` / `..` and
#        names outside the lowercase Agent Skills subset hard-fail before any
#        projection deletion can run.
#
# Usage:
#   scripts/sync-agent-skills.sh                     regenerate .agents/skills/ in place
#   scripts/sync-agent-skills.sh --check              verify only; exit non-zero + print
#                                                      drift; changes NOTHING on disk
#   scripts/sync-agent-skills.sh --check --staged-only
#                                                      as --check, but report only drift
#                                                      the CURRENT COMMIT contains (P1277)
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
STAGED_ONLY=0

while [[ $# -gt 0 ]]; do
  case "$1" in
    --check) CHECK_MODE=1; shift ;;
    --staged-only) STAGED_ONLY=1; shift ;;
    --src-dir) SRC_DIR="$2"; shift 2 ;;
    --out-dir) OUT_DIR="$2"; shift 2 ;;
    *) echo "sync-agent-skills: unknown argument: $1" >&2; exit 2 ;;
  esac
done

if [[ ! -d "$SRC_DIR" ]]; then
  echo "sync-agent-skills: source dir not found: $SRC_DIR" >&2
  exit 2
fi

case "${OUT_DIR%/}" in
  ""|/|.|..|"$HOME"|"$PWD")
    echo "sync-agent-skills: refusing unsafe output root: $OUT_DIR" >&2
    exit 2
    ;;
esac

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

path_type() {
  if [[ -L "$1" ]]; then
    echo "symlink"
  elif [[ -f "$1" ]]; then
    echo "file"
  elif [[ -d "$1" ]]; then
    echo "directory"
  else
    echo "other"
  fi
}

# ─── step 1: scan sources, apply D2 (description) + D5 (exclude archive/) ──

CANDIDATES="$WORK/candidates.tsv"   # name<TAB>path
: > "$CANDIDATES"

while IFS= read -r f; do
  [[ -z "$f" ]] && continue
  has_description "$f" || continue
  printf '%s\t%s\n' "$(derive_name "$f")" "$f" >> "$CANDIDATES"
done < <(find "$SRC_DIR" -name '*.md' -not -path '*/archive/*' 2>/dev/null | sort -u)

UNSAFE_NAMES="$WORK/unsafe-names.txt"
: > "$UNSAFE_NAMES"
while IFS=$'\t' read -r name path; do
  [[ "$name" =~ ^[a-z0-9][a-z0-9._-]*$ ]] && [[ "$name" != "." ]] && [[ "$name" != ".." ]] && continue
  echo "UNSAFE_NAME:${name}:file=${path}" >> "$UNSAFE_NAMES"
done < "$CANDIDATES"
if [[ -s "$UNSAFE_NAMES" ]]; then
  echo "sync-agent-skills: unsafe projected name (D9) — hard fail:" >&2
  cat "$UNSAFE_NAMES" >&2
  exit 1
fi

# ─── step 2: resolve D4 collisions ─────────────────────────────────────────

RESOLVED="$WORK/resolved.tsv"       # name<TAB>path — final canonical mapping

# Exact first-field match against the manifest. NOT `grep -F "$name<TAB>"`:
# grep matches anywhere on the line, so an orphan named `skill` matched the
# substring `skill<TAB>` inside `create-skill<TAB>...` and was reported as a
# known skill -- invisible to --check and never pruned, while remaining a fully
# discoverable injected skill in every harness. Every name that is a SUFFIX of a
# real skill name was affected (skill, flow, spec, blog, email, select, ...).
# The `source-command-*` canaries could not catch this: no such name is a suffix
# of a real skill, so the fixtures structurally could not emit the failing input.
manifest_has() {
  awk -F'\t' -v n="$1" '$1 == n { found = 1; exit } END { exit !found }' "$RESOLVED"
}
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

  # ── --staged-only: judge the COMMIT, not the working tree (P1277) ─────────
  #
  # Without this flag the drift scan `cmp`s every source in the tree. On a
  # shared checkout with concurrent sessions that means any co-tenant's
  # in-progress, unstaged edit anywhere under the source tree fails EVERY other
  # session's unrelated commit — recorded three times in docs/process-learnings.md
  # (2026-08-27, twice on 2026-08-28), each time resolved by polling `git status`
  # until a stranger stopped typing. `git-ops.sh commit-to-main`'s lock cannot
  # help: it serializes committers, not editors, and an Edit-tool write takes no
  # git lock at all.
  #
  # So the pre-commit caller passes --staged-only and a drift line survives only
  # if the commit actually contains the file it is about: the source, or the
  # projection. Same class as P1273 — a gate must judge the tree it is gating.
  #
  # Deliberately scoped to the DRIFT scan. The hard fails above (D4 collisions,
  # D8 name mismatch, D9 unsafe name) stay global: they are properties of the
  # source of truth, they cannot be introduced by an unstaged edit without also
  # being real, and a repo that cannot project its skills at all is worth
  # stopping every commit for.
  #
  # Degrades to a full check, with a printed note, when there is no git repo to
  # ask (the hermetic fixtures in sync-agent-skills.test.sh run outside one).
  # abs_of PATH — absolute, SYMLINK-RESOLVED form of a path.
  #
  # `pwd -P`, not $PWD, and this is load-bearing on macOS: a fixture (or any
  # repo) under /var/folders/... is reached through a symlink, so `git
  # rev-parse --show-toplevel` returns the /private/var/... form while $PWD
  # keeps the /var/... form. Comparing the two spellings matched nothing, every
  # skill fell out of scope, and --staged-only reported a clean tree for a
  # commit that genuinely contained drift — a gate that silently passes
  # everything. Caught by case F2 in sync-agent-skills.test.sh, which exists
  # precisely because F1 alone cannot distinguish "correctly scoped" from
  # "inert".
  abs_of() {
    local p="$1" d b
    case "$p" in /*) ;; *) p="${PWD}/${p#./}" ;; esac
    if [[ -d "$p" ]]; then
      ( cd "$p" && pwd -P )
      return
    fi
    d="$(dirname "$p")"; b="$(basename "$p")"
    if [[ -d "$d" ]]; then
      printf '%s/%s\n' "$( cd "$d" && pwd -P )" "$b"
    else
      printf '%s\n' "$p"
    fi
  }

  # The scope is a set of skill NAMES, not of paths: a commit that deletes a
  # source and a commit that edits its projection are both about the same skill,
  # and the orphan scan below only ever knows the name.
  STAGED_NAMES="$WORK/staged-names.txt"
  SCOPED=0
  if [[ "$STAGED_ONLY" -eq 1 ]]; then
    if GIT_TOP="$(git rev-parse --show-toplevel 2>/dev/null)" && [[ -n "$GIT_TOP" ]]; then
      GIT_TOP="$( cd "$GIT_TOP" && pwd -P )"
      : > "$STAGED_NAMES"
      ABS_SRC="$(abs_of "${SRC_DIR%/}")"
      ABS_OUT="$(abs_of "${OUT_DIR%/}")"
      while IFS= read -r rel; do
        [[ -z "$rel" ]] && continue
        abs="${GIT_TOP}/${rel}"
        case "$abs" in
          "$ABS_SRC"/*) derive_name "$abs" >> "$STAGED_NAMES" ;;
          "$ABS_OUT"/*) rest="${abs#"$ABS_OUT"/}"; printf '%s\n' "${rest%%/*}" >> "$STAGED_NAMES" ;;
        esac
      done < <(git diff --cached --name-only 2>/dev/null)
      sort -u -o "$STAGED_NAMES" "$STAGED_NAMES"
      SCOPED=1
    else
      echo "sync-agent-skills --check: --staged-only ignored (not inside a git work tree) — checking the whole tree" >&2
    fi
  fi

  # name_in_commit NAME — true when scoping is off, or the commit touches this
  # skill's source or its projection.
  name_in_commit() {
    [[ "$SCOPED" -eq 1 ]] || return 0
    awk -v n="$1" '$0 == n { found = 1; exit } END { exit !found }' "$STAGED_NAMES"
  }

  while IFS=$'\t' read -r name path; do
    [[ -z "$name" ]] && continue
    skill_file="${OUT_DIR}/${name}/SKILL.md"
    # Neither this skill's source nor its projection is in the commit: whatever
    # its state, this commit did not cause it and cannot be asked to fix it.
    name_in_commit "$name" || continue
    if [[ ! -d "${OUT_DIR}/${name}" || -L "${OUT_DIR}/${name}" ]]; then
      echo "DRIFT_MISSING_DIR:${name}" >> "$DRIFT"
    elif [[ ! -f "$skill_file" || -L "$skill_file" ]]; then
      echo "DRIFT_MISSING_FILE:${name}" >> "$DRIFT"
    elif ! cmp -s "$path" "$skill_file"; then
      echo "DRIFT_CONTENT_MISMATCH:${name}" >> "$DRIFT"
    else
      while IFS= read -r nested; do
        [[ "$nested" == "$skill_file" ]] && continue
        relative="${nested#${OUT_DIR}/}"
        echo "DRIFT_UNEXPECTED_ENTRY:${relative}:type=$(path_type "$nested")" >> "$DRIFT"
      done < <(find "${OUT_DIR}/${name}" -mindepth 1 -print 2>/dev/null | sort)
    fi
  done < "$RESOLVED"

  if [[ -d "$OUT_DIR" ]]; then
    while IFS= read -r existing_path; do
      [[ -z "$existing_path" ]] && continue
      existing_name="$(basename "$existing_path")"
      if ! manifest_has "$existing_name"; then
        name_in_commit "$existing_name" || continue
        existing_type="$(path_type "$existing_path")"
        if [[ "$existing_type" == "directory" ]]; then
          echo "DRIFT_ORPHAN:${existing_name}" >> "$DRIFT"
        else
          echo "DRIFT_UNEXPECTED_TOPLEVEL:${existing_name}:type=${existing_type}" >> "$DRIFT"
        fi
      fi
    done < <(find "$OUT_DIR" -mindepth 1 -maxdepth 1 -print 2>/dev/null | sort)
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
  if [[ -e "$target_dir" || -L "$target_dir" ]]; then
    [[ -d "$target_dir" && ! -L "$target_dir" ]] || rm -rf "$target_dir"
  fi
  mkdir -p "$target_dir"
  find "$target_dir" -mindepth 1 -maxdepth 1 ! -name SKILL.md -exec rm -rf {} +
  rm -f "${target_dir}/SKILL.md"
  cp "$path" "${target_dir}/SKILL.md"
done < "$RESOLVED"

PRUNED=0
if [[ -d "$OUT_DIR" ]]; then
  while IFS= read -r existing_path; do
    [[ -z "$existing_path" ]] && continue
    existing_name="$(basename "$existing_path")"
    if ! manifest_has "$existing_name"; then
      echo "sync-agent-skills: removing unexpected projection entry: ${existing_name}"
      rm -rf "$existing_path"
      PRUNED=$((PRUNED + 1))
    fi
  done < <(find "$OUT_DIR" -mindepth 1 -maxdepth 1 -print 2>/dev/null | sort)
fi

echo "sync-agent-skills: generated ${TOTAL} skills in ${OUT_DIR}/, 0 collisions, ${PRUNED} orphan(s) pruned"
exit 0
