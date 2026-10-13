#!/usr/bin/env bash
# scripts/sync-agent-skills.test.sh — exercise scripts/sync-agent-skills.sh
# (P1151), especially its FAILURE path (epistemic.md gate 7: a gate you have
# not watched fail is unproven).
#
# Runs entirely against a synthetic fixture tree via --src-dir/--out-dir — it
# never touches the real .claude/commands/slava or .agents/skills, so it is
# safe to run repeatedly and does not depend on this repo's current skill
# count. All fixture names/content are synthetic (FIXTURE_*), per
# .claude/rules/pii.md conventions used by other *.test.sh harnesses here.
#
# Output contract: no '>', '<', or '|' at word boundaries (shell-safety.md
# P783) — applies to both the script under test and this harness's own lines.

set -u

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SCRIPT="${REPO_ROOT}/scripts/sync-agent-skills.sh"

if [[ ! -f "$SCRIPT" ]]; then
  echo "FATAL: ${SCRIPT} not found." >&2
  exit 2
fi
if [[ ! -x "$SCRIPT" ]]; then
  echo "FATAL: ${SCRIPT} exists but is not executable — chmod +x it." >&2
  exit 2
fi

WORK="$(mktemp -d "${TMPDIR:-/tmp}/sync-agent-skills-test.XXXXXX")"
trap 'rm -rf "$WORK"' EXIT

pass_count=0
fail_count=0
LAST_OUT=""

# run_sync NAME EXPECTED_EXIT -- ARGS...
run_sync() {
  local name="$1" want="$2"; shift 2
  local got=0 out=""
  out="$(cd "$WORK" && "$SCRIPT" "$@" 2>&1)" || got=$?
  LAST_OUT="$out"
  if [[ "$got" == "$want" ]]; then
    echo "PASS  ${name}: exit ${got}"
    pass_count=$((pass_count + 1))
  else
    echo "FAIL  ${name}: expected exit ${want}, got ${got}"
    echo "$out" | sed 's/^/        /'
    fail_count=$((fail_count + 1))
  fi
}

assert_out() {
  if printf '%s\n' "$LAST_OUT" | grep -Fq -- "$2"; then
    echo "PASS  ${1}"
    pass_count=$((pass_count + 1))
  else
    echo "FAIL  ${1}: output did not contain: $2"
    printf '%s\n' "$LAST_OUT" | sed 's/^/        /'
    fail_count=$((fail_count + 1))
  fi
}

echo "=== sync-agent-skills.sh finding-class suite ==="

# ══════════════════════════════════════════════════════════════════════════
# Fixture tree — mirrors this repo's real shape at small scale: a flat
# skill, a SKILL.md-in-directory skill (D3 exception), a payload file with
# no description (D2), and a file under archive/ (D5).
# ══════════════════════════════════════════════════════════════════════════
SRC="fixture-src"
OUT="fixture-out"
mkdir -p "${WORK}/${SRC}/nested/skillbox" "${WORK}/${SRC}/archive"

cat > "${WORK}/${SRC}/flat-skill.md" <<'EOF'
---
name: flat-skill
description: A synthetic flat-file skill fixture for sync-agent-skills.test.sh.
---
fixture body
EOF

cat > "${WORK}/${SRC}/nested/skillbox/SKILL.md" <<'EOF'
---
name: skillbox
description: A synthetic SKILL.md-in-directory fixture (D3 exception — name is the parent dir).
---
fixture body
EOF

cat > "${WORK}/${SRC}/payload-no-description.md" <<'EOF'
---
name: payload-no-description
---
fixture body — deliberately no description: field (D2 exclusion)
EOF

cat > "${WORK}/${SRC}/archive/archived-skill.md" <<'EOF'
---
name: archived-skill
description: A synthetic archived skill — must be excluded by D5 regardless of its description.
---
fixture body
EOF

echo "--- case 0: clean generate + check round-trip (2 qualifying skills expected) ---"
run_sync "generate against clean fixture" 0 --src-dir "$SRC" --out-dir "$OUT"
assert_out "generate reports 2 skills" "generated 2 skills"

run_sync "check immediately after generate is clean" 0 --check --src-dir "$SRC" --out-dir "$OUT"
assert_out "check reports 0 drift" "0 drift"

RESOLVED_N=$(find "${WORK}/${OUT}" -name SKILL.md -type f | wc -l | tr -d ' ')
if [[ "$RESOLVED_N" == "2" ]]; then
  echo "PASS  independent oracle: exactly 2 regular SKILL.md files exist (D2/D5 applied correctly)"
  pass_count=$((pass_count + 1))
else
  echo "FAIL  independent oracle: found ${RESOLVED_N} regular SKILL.md files, expected 2"
  fail_count=$((fail_count + 1))
fi

if [[ ! -L "${WORK}/${OUT}/flat-skill/SKILL.md" ]] &&
   cmp -s "${WORK}/${SRC}/flat-skill.md" "${WORK}/${OUT}/flat-skill/SKILL.md"; then
  echo "PASS  projection artifact is a byte-identical regular file"
  pass_count=$((pass_count + 1))
else
  echo "FAIL  projection artifact must be a byte-identical regular file, not a symlink"
  fail_count=$((fail_count + 1))
fi

# ══════════════════════════════════════════════════════════════════════════
# CASE A — deleted link: --check must fail non-zero and name the missing skill.
# ══════════════════════════════════════════════════════════════════════════
echo "--- case A: deleted link ---"
rm -rf "${WORK}/${OUT}/flat-skill"
run_sync "check after deleting a generated link" 1 --check --src-dir "$SRC" --out-dir "$OUT"
assert_out "case A: names the missing skill" "DRIFT_MISSING_DIR:flat-skill"
# restore
run_sync "regenerate to restore case A" 0 --src-dir "$SRC" --out-dir "$OUT"

# ══════════════════════════════════════════════════════════════════════════
# CASE B — new source, no link yet: --check must fail non-zero.
# ══════════════════════════════════════════════════════════════════════════
echo "--- case B: new source with no link ---"
cat > "${WORK}/${SRC}/new-skill.md" <<'EOF'
---
name: new-skill
description: A synthetic new skill added after the last generate (D2 qualifying).
---
fixture body
EOF
run_sync "check after adding an unlinked source" 1 --check --src-dir "$SRC" --out-dir "$OUT"
assert_out "case B: names the missing skill" "DRIFT_MISSING_DIR:new-skill"
# restore
run_sync "regenerate to restore case B" 0 --src-dir "$SRC" --out-dir "$OUT"
rm -f "${WORK}/${SRC}/new-skill.md"
run_sync "regenerate to prune case B's skill" 0 --src-dir "$SRC" --out-dir "$OUT"

# ══════════════════════════════════════════════════════════════════════════
# CASE C — name/dir mismatch (D8): hard fail, in BOTH --check and generate mode.
# ══════════════════════════════════════════════════════════════════════════
echo "--- case C: frontmatter name != projected directory name (D8) ---"
cat > "${WORK}/${SRC}/mismatched-skill.md" <<'EOF'
---
name: totally-different-name
description: A synthetic D8 violation fixture — name field deliberately wrong.
---
fixture body
EOF
run_sync "check with a D8 name/dir mismatch present" 1 --check --src-dir "$SRC" --out-dir "$OUT"
assert_out "case C (check mode): names the mismatch" "NAME_MISMATCH:mismatched-skill:name_field=totally-different-name"

run_sync "generate with a D8 name/dir mismatch present" 1 --src-dir "$SRC" --out-dir "$OUT"
assert_out "case C (generate mode): also hard-fails, not just --check" "NAME_MISMATCH:mismatched-skill:name_field=totally-different-name"
rm -f "${WORK}/${SRC}/mismatched-skill.md"
run_sync "regenerate to restore after case C" 0 --src-dir "$SRC" --out-dir "$OUT"

# ══════════════════════════════════════════════════════════════════════════
# CASE D — D4 collision: two sources deriving the same name hard-fails
# unless exactly one is a declared alias, in which case the alias is
# skipped and the canonical source is linked (mirrors the real
# slava/note.md vs slava/util/note.md pair).
# ══════════════════════════════════════════════════════════════════════════
echo "--- case D: D4 collision (unresolvable) ---"
cat > "${WORK}/${SRC}/dup-a.md" <<'EOF'
---
name: dup-a
description: First half of a synthetic unresolvable D4 collision fixture.
---
fixture body
EOF
mkdir -p "${WORK}/${SRC}/dupdir"
cat > "${WORK}/${SRC}/dupdir/dup-a.md" <<'EOF'
---
name: dup-a
description: Second half of a synthetic unresolvable D4 collision fixture (not an alias).
---
fixture body
EOF
run_sync "check with two non-alias sources sharing a derived name" 1 --check --src-dir "$SRC" --out-dir "$OUT"
assert_out "case D: reports the collision pair" "COLLISION:dup-a:"
rm -f "${WORK}/${SRC}/dup-a.md" "${WORK}/${SRC}/dupdir/dup-a.md"

echo "--- case D2: D4 collision resolved via alias-skip ---"
# Mirrors the real slava/note.md vs slava/util/note.md pair: two flat files
# whose basenames both derive to the same name (D3), one of them a
# declared alias (description reads "...alias for /..."). D4's resolution:
# skip the alias, link the canonical (non-alias) source.
cat > "${WORK}/${SRC}/canonical-note.md" <<'EOF'
---
name: canonical-note
description: Canonical half of a synthetic alias-resolved D4 collision fixture.
---
fixture body
EOF
cat > "${WORK}/${SRC}/nested/canonical-note.md" <<'EOF'
---
name: canonical-note
description: Shortcut alias for /canonical-note — this file must be skipped, not linked.
---
fixture body
EOF

run_sync "generate with an alias-resolvable D4 collision" 0 --src-dir "$SRC" --out-dir "$OUT"
assert_out "case D2: alias resolved cleanly, no collision reported" "0 collisions"

run_sync "check after alias-resolved generate is clean" 0 --check --src-dir "$SRC" --out-dir "$OUT"
assert_out "case D2: check confirms 0 drift post-resolution" "0 drift"

if cmp -s "${WORK}/${SRC}/canonical-note.md" "${WORK}/${OUT}/canonical-note/SKILL.md"; then
  echo "PASS  case D2: canonical (non-alias) source was projected, not the alias"
  pass_count=$((pass_count + 1))
else
  echo "FAIL  case D2: generated file did not match canonical-note.md"
  fail_count=$((fail_count + 1))
fi
rm -f "${WORK}/${SRC}/canonical-note.md" "${WORK}/${SRC}/nested/canonical-note.md"
rm -rf "${WORK}/${SRC}/canonicalbox"
run_sync "regenerate to restore after case D2" 0 --src-dir "$SRC" --out-dir "$OUT"

echo "--- case D3: unsafe traversal-like derived name hard-fails before projection ---"
cat > "${WORK}/${SRC}/...md" <<'EOF'
---
name: ..
description: unsafe fixture
---
EOF
run_sync "generate with traversal-like name" 1 --src-dir "$SRC" --out-dir "$OUT"
assert_out "case D3: rejects unsafe name" "UNSAFE_NAME:.."
rm -f "${WORK}/${SRC}/...md"
run_sync "regenerate to restore after case D3" 0 --src-dir "$SRC" --out-dir "$OUT"

# ══════════════════════════════════════════════════════════════════════════
# CASE E — closed-world manifest rejects every unexpected top-level type and
# every unexpected entry inside an expected skill directory.
# ══════════════════════════════════════════════════════════════════════════
echo "--- case E1: unexpected top-level regular file ---"
printf 'fixture\n' > "${WORK}/${OUT}/unexpected-file"
run_sync "check with an unexpected top-level file" 1 --check --src-dir "$SRC" --out-dir "$OUT"
assert_out "case E1: names unexpected top-level file" "DRIFT_UNEXPECTED_TOPLEVEL:unexpected-file:type=file"
rm -f "${WORK}/${OUT}/unexpected-file"

echo "--- case E2: unexpected top-level symlink ---"
ln -s flat-skill "${WORK}/${OUT}/unexpected-link"
run_sync "check with an unexpected top-level symlink" 1 --check --src-dir "$SRC" --out-dir "$OUT"
assert_out "case E2: names unexpected top-level symlink" "DRIFT_UNEXPECTED_TOPLEVEL:unexpected-link:type=symlink"
rm -f "${WORK}/${OUT}/unexpected-link"

echo "--- case E3: unexpected top-level directory ---"
mkdir -p "${WORK}/${OUT}/unexpected-dir"
run_sync "check with an unexpected top-level directory" 1 --check --src-dir "$SRC" --out-dir "$OUT"
assert_out "case E3: names unexpected top-level directory" "DRIFT_ORPHAN:unexpected-dir"
rm -rf "${WORK}/${OUT}/unexpected-dir"

echo "--- case E4: unexpected nested file ---"
printf 'fixture\n' > "${WORK}/${OUT}/flat-skill/extra.txt"
run_sync "check with an unexpected nested file" 1 --check --src-dir "$SRC" --out-dir "$OUT"
assert_out "case E4: names unexpected nested file" "DRIFT_UNEXPECTED_ENTRY:flat-skill/extra.txt:type=file"
rm -f "${WORK}/${OUT}/flat-skill/extra.txt"

echo "--- case E6: orphan whose name is a SUFFIX of a real skill ---"
# The manifest lookup was `grep -F "<name><TAB>"` against a name<TAB>path file.
# grep matches anywhere on the line, so `skill` matched inside `flat-skill<TAB>`
# and the orphan was treated as a known skill: invisible to --check, never
# pruned, yet fully discoverable as an injected skill in every harness. The
# E1-E5 canaries could not catch it -- none of their names is a suffix of a
# real skill, so the fixtures structurally could not emit the failing input.
mkdir -p "${WORK}/${OUT}/skill"
printf 'fixture\n' > "${WORK}/${OUT}/skill/SKILL.md"
run_sync "check with a suffix-named orphan directory" 1 --check --src-dir "$SRC" --out-dir "$OUT"
assert_out "case E6: names the suffix-named orphan" "DRIFT_ORPHAN:skill"
rm -rf "${WORK}/${OUT}/skill"

echo "--- case E7: suffix-named orphan is actually pruned on regeneration ---"
mkdir -p "${WORK}/${OUT}/skill"
printf 'fixture\n' > "${WORK}/${OUT}/skill/SKILL.md"
run_sync "regenerate over a suffix-named orphan" 0 --src-dir "$SRC" --out-dir "$OUT"
if [[ -e "${WORK}/${OUT}/skill" ]]; then
  echo "FAIL  case E7: suffix-named orphan survived regeneration"
  fail_count=$((fail_count + 1))
else
  echo "PASS  case E7: suffix-named orphan pruned"
  pass_count=$((pass_count + 1))
fi
rm -rf "${WORK}/${OUT}/skill"

echo "--- case E5: unexpected nested symlink ---"
ln -s SKILL.md "${WORK}/${OUT}/flat-skill/extra-link"
run_sync "check with an unexpected nested symlink" 1 --check --src-dir "$SRC" --out-dir "$OUT"
assert_out "case E5: names unexpected nested symlink" "DRIFT_UNEXPECTED_ENTRY:flat-skill/extra-link:type=symlink"
rm -f "${WORK}/${OUT}/flat-skill/extra-link"

run_sync "check after closed-world canaries is clean" 0 --check --src-dir "$SRC" --out-dir "$OUT"
assert_out "case E: final check confirms 0 drift" "0 drift"

# ══════════════════════════════════════════════════════════════════════════
# case F — --staged-only (P1284)
#
# The defect it closes: --check cmp's the whole working tree, so a co-tenant's
# unstaged edit anywhere under the source tree fails EVERY other session's
# unrelated commit (docs/process-learnings.md, three occurrences).
#
# These cases need a REAL git repo, because the flag's whole job is to read
# `git diff --cached`. The rest of this suite runs outside one on purpose, so
# the fixture is built in its own subdirectory.
#
# Both directions are covered, which is what gate 7c asks for: the flag must
# still CATCH drift the commit contains (F2, F4), not merely stop refusing.
# ══════════════════════════════════════════════════════════════════════════
echo "--- case F: --staged-only scopes drift to the commit ---"
GITFIX="${WORK}/gitfix"
mkdir -p "${GITFIX}/${SRC}" "${GITFIX}/${OUT}"
cp "${WORK}/${SRC}/flat-skill.md" "${GITFIX}/${SRC}/flat-skill.md"
cat > "${GITFIX}/${SRC}/other-skill.md" <<'EOF'
---
name: other-skill
description: A synthetic second skill standing in for a CO-TENANT's file.
---
fixture body
EOF
(
  cd "$GITFIX"
  git init -q -b main
  git config user.email t@t.t
  git config user.name t
)
run_sync_in() {   # run_sync_in DIR NAME WANT -- ARGS...
  local dir="$1" name="$2" want="$3"; shift 3
  local got=0 out=""
  out="$(cd "$dir" && "$SCRIPT" "$@" 2>&1)" || got=$?
  LAST_OUT="$out"
  if [[ "$got" == "$want" ]]; then
    echo "PASS  ${name}: exit ${got}"; pass_count=$((pass_count + 1))
  else
    echo "FAIL  ${name}: expected exit ${want}, got ${got}"
    echo "$out" | sed 's/^/        /'; fail_count=$((fail_count + 1))
  fi
}

run_sync_in "$GITFIX" "gitfix: generate a clean projection" 0 --src-dir "$SRC" --out-dir "$OUT"
(cd "$GITFIX" && git add "$SRC" "$OUT" >/dev/null 2>&1 && git commit -qm "fixture baseline")

# F1 — the incident, reproduced: a co-tenant edits a file this commit never
# touches. Plain --check refuses; --staged-only lets the commit through.
printf 'a co-tenant is still typing\n' >> "${GITFIX}/${SRC}/other-skill.md"
(cd "$GITFIX" && git add "${SRC}/flat-skill.md" >/dev/null 2>&1)
run_sync_in "$GITFIX" "case F1a: plain --check refuses on a co-tenant's unstaged edit" 1 \
  --check --src-dir "$SRC" --out-dir "$OUT"
assert_out "case F1a: names the co-tenant's skill" "DRIFT_CONTENT_MISMATCH:other-skill"
run_sync_in "$GITFIX" "case F1b: --staged-only ignores it" 0 \
  --check --staged-only --src-dir "$SRC" --out-dir "$OUT"

# F2 — the control that makes F1 meaningful: drift in a file the commit DOES
# contain must still be caught. Without this, F1 only proves the flag is inert.
printf 'my own unsynced edit\n' >> "${GITFIX}/${SRC}/flat-skill.md"
(cd "$GITFIX" && git add "${SRC}/flat-skill.md" >/dev/null 2>&1)
run_sync_in "$GITFIX" "case F2: --staged-only still catches STAGED drift" 1 \
  --check --staged-only --src-dir "$SRC" --out-dir "$OUT"
assert_out "case F2: names the staged skill" "DRIFT_CONTENT_MISMATCH:flat-skill"

# F3 — a staged PROJECTION edit is in scope too, even when the source is not
# staged: hand-editing .agents/skills/ is the other way the two diverge.
run_sync_in "$GITFIX" "gitfix: regenerate to a clean state" 0 --src-dir "$SRC" --out-dir "$OUT"
(cd "$GITFIX" && git add -- "$SRC" "$OUT" >/dev/null 2>&1 && git commit -qm "resync" >/dev/null 2>&1)
printf 'hand-edited projection\n' >> "${GITFIX}/${OUT}/flat-skill/SKILL.md"
(cd "$GITFIX" && git add -- "${OUT}/flat-skill/SKILL.md" >/dev/null 2>&1)
run_sync_in "$GITFIX" "case F3: a staged projection edit is in scope" 1 \
  --check --staged-only --src-dir "$SRC" --out-dir "$OUT"
assert_out "case F3: names the skill whose projection was staged" "DRIFT_CONTENT_MISMATCH:flat-skill"
run_sync_in "$GITFIX" "gitfix: regenerate after F3" 0 --src-dir "$SRC" --out-dir "$OUT"
(cd "$GITFIX" && git add -- "$OUT" >/dev/null 2>&1 && git commit -qm "resync F3" >/dev/null 2>&1)

# F5 — P1284 code review (codex, 2026-09-09). `git diff --cached --name-only`
# C-quotes any path with a non-ASCII byte under the default core.quotePath, so
# the string arriving here was `"fixture-src/caf\303\251/nested-skill.md"` —
# quotes included — which matched neither the source nor the projection prefix.
# The skill fell out of scope and a commit carrying real drift passed. The
# directory carries the non-ASCII, not the projected NAME: a non-ASCII name is
# already a D9 hard fail, so this is the only shape that reaches the scan.
mkdir -p "${GITFIX}/${SRC}/café"
cat > "${GITFIX}/${SRC}/café/nested-skill.md" <<'EOF'
---
name: nested-skill
description: A synthetic skill under a non-ASCII directory (quotePath escaping).
---
fixture body
EOF
run_sync_in "$GITFIX" "gitfix: regenerate with the non-ASCII path" 0 --src-dir "$SRC" --out-dir "$OUT"
(cd "$GITFIX" && git add -- "$SRC" "$OUT" >/dev/null 2>&1 && git commit -qm "add non-ascii skill" >/dev/null 2>&1)
printf 'drift under a non-ASCII directory\n' >> "${GITFIX}/${SRC}/café/nested-skill.md"
(cd "$GITFIX" && git add -- "${SRC}/café/nested-skill.md" >/dev/null 2>&1)
run_sync_in "$GITFIX" "case F5: a staged non-ASCII source path is still in scope" 1 \
  --check --staged-only --src-dir "$SRC" --out-dir "$OUT"
assert_out "case F5: names the skill behind the quoted path" "DRIFT_CONTENT_MISMATCH:nested-skill"
run_sync_in "$GITFIX" "gitfix: regenerate after F5" 0 --src-dir "$SRC" --out-dir "$OUT"
(cd "$GITFIX" && git add -- "$SRC" "$OUT" >/dev/null 2>&1 && git commit -qm "resync F5" >/dev/null 2>&1)

# F4 — outside a git work tree the flag must DEGRADE TO A FULL CHECK, never to
# a silent pass. A gate that quietly does nothing where git is absent is worse
# than no gate: it reports OK.
printf 'drift with no git repo in sight\n' >> "${WORK}/${SRC}/flat-skill.md"
run_sync "case F4: --staged-only outside a git repo still checks everything" 1 \
  --check --staged-only --src-dir "$SRC" --out-dir "$OUT"
assert_out "case F4: says the flag was ignored" "--staged-only ignored"
run_sync "regenerate to restore after case F4" 0 --src-dir "$SRC" --out-dir "$OUT"
run_sync "check after case F4 is clean" 0 --check --src-dir "$SRC" --out-dir "$OUT"

# ══════════════════════════════════════════════════════════════════════════
# case G — the checker fails CLOSED on its own internal failure (P1472)
#
# Before P1472 a failed `mktemp -d` left WORK empty, every scratch write went
# to /candidates.tsv and friends and failed, and the script still printed
# "OK —  skills in sync" (empty count) with exit 0: indistinguishable from a
# clean run by exit code. Internal failure is now exit 3 — asserted exactly,
# so a crash (127, 126) cannot score as the intended refusal.
# ══════════════════════════════════════════════════════════════════════════
echo "--- case G: internal failure is never reported as OK ---"
assert_no_ok() {   # assert_no_ok NAME — the OK line must not appear in LAST_OUT
  if grep -Fq -- "--check: OK" <<< "$LAST_OUT"; then
    echo "FAIL  ${1}: printed the OK line after an internal failure"
    fail_count=$((fail_count + 1))
  else
    echo "PASS  ${1}"
    pass_count=$((pass_count + 1))
  fi
}
run_sync_env() {   # run_sync_env NAME WANT ENV-ASSIGNMENT -- ARGS...
  local name="$1" want="$2" envset="$3"; shift 3
  local got=0 out=""
  out="$(cd "$WORK" && env "$envset" "$SCRIPT" "$@" 2>&1)" || got=$?
  LAST_OUT="$out"
  if [[ "$got" == "$want" ]]; then
    echo "PASS  ${name}: exit ${got}"; pass_count=$((pass_count + 1))
  else
    echo "FAIL  ${name}: expected exit ${want}, got ${got}"
    echo "$out" | tail -5 | sed 's/^/        /'; fail_count=$((fail_count + 1))
  fi
}
run_sync_env "case G1: nonexistent TMPDIR refuses" 3 "TMPDIR=${WORK}/no-such-tmpdir" \
  --check --src-dir "$SRC" --out-dir "$OUT"
assert_no_ok "case G1: no OK line"
assert_out "case G1: names the failure" "INTERNAL ERROR"

mkdir -p "${WORK}/readonly-tmp" && chmod 555 "${WORK}/readonly-tmp"
run_sync_env "case G2: unwritable TMPDIR refuses" 3 "TMPDIR=${WORK}/readonly-tmp" \
  --check --src-dir "$SRC" --out-dir "$OUT"
assert_no_ok "case G2: no OK line"
chmod 755 "${WORK}/readonly-tmp"

# G3 — --staged-only must not turn a FAILED `git diff --cached` into an empty
# scope (empty scope = every skill out of scope = OK). A git shim that fails
# only that subcommand, in the gitfix repo, with real drift staged.
mkdir -p "${WORK}/gitshim"
REAL_GIT="$(command -v git)"
cat > "${WORK}/gitshim/git" <<EOF
#!/usr/bin/env bash
[[ "\${1:-}" == "diff" ]] && { echo "shim: git diff refused" >&2; exit 128; }
exec "${REAL_GIT}" "\$@"
EOF
chmod +x "${WORK}/gitshim/git"
printf 'staged drift behind a failing git diff\n' >> "${GITFIX}/${SRC}/flat-skill.md"
(cd "$GITFIX" && git add -- "${SRC}/flat-skill.md" >/dev/null 2>&1)
got=0; LAST_OUT="$(cd "$GITFIX" && PATH="${WORK}/gitshim:${PATH}" "$SCRIPT" --check --staged-only --src-dir "$SRC" --out-dir "$OUT" 2>&1)" || got=$?
if [[ "$got" == "3" ]]; then
  echo "PASS  case G3: a failed git diff --cached refuses: exit 3"; pass_count=$((pass_count + 1))
else
  echo "FAIL  case G3: expected exit 3 on a failed git diff --cached, got ${got}"
  printf '%s\n' "$LAST_OUT" | tail -5 | sed 's/^/        /'; fail_count=$((fail_count + 1))
fi
assert_no_ok "case G3: no OK line"
run_sync_in "$GITFIX" "gitfix: regenerate after G3" 0 --src-dir "$SRC" --out-dir "$OUT"
(cd "$GITFIX" && git add -- "$SRC" "$OUT" >/dev/null 2>&1 && git commit -qm "resync G3" >/dev/null 2>&1)

# G4 — must-pass on the REAL tree (gate 7c): the shipped mirror is in sync, and
# the OK line's count equals an oracle the script does not compute — the number
# of regular SKILL.md files on disk. A run that "passes" with an empty or wrong
# count fails here. Read-only: --check changes nothing on disk.
echo "--- case G4: the real repo tree is in sync, with a real count ---"
got=0; LAST_OUT="$(cd "$REPO_ROOT" && "$SCRIPT" --check 2>&1)" || got=$?
REAL_N="$(find "${REPO_ROOT}/.agents/skills" -mindepth 2 -maxdepth 2 -name SKILL.md -type f | wc -l | tr -d ' ')"
if [[ "$got" == "0" ]] && grep -Fq "OK — ${REAL_N} skills in sync" <<< "$LAST_OUT" && [[ "$REAL_N" -gt 0 ]]; then
  echo "PASS  case G4: real tree OK with ${REAL_N} skills (oracle: SKILL.md files on disk)"; pass_count=$((pass_count + 1))
else
  echo "FAIL  case G4: real tree expected exit 0 and 'OK — ${REAL_N} skills', got exit ${got}"
  printf '%s\n' "$LAST_OUT" | tail -5 | sed 's/^/        /'; fail_count=$((fail_count + 1))
fi

# ══════════════════════════════════════════════════════════════════════════
# case H — pre-commit-checks.sh check 22, the CALLER (P1472)
#
# The hook cannot be run by name from an agent session, and it would run every
# other check too. So check 22 is extracted verbatim — from its header comment
# to the next check's header — and sourced into a fixture repo with the real
# run_quiet lib. Nothing is substituted. If the anchors move, extraction yields
# nothing and this case fails loudly rather than passing on an empty snippet.
# ══════════════════════════════════════════════════════════════════════════
echo "--- case H: check 22 fails closed and its hint names exact paths ---"
PCC="${REPO_ROOT}/scripts/pre-commit-checks.sh"
GATE_SNIPPET="${WORK}/gate22.sh"
awk '/^# 22\. Agent-skills sync gate/ { on = 1 } /^# Codex lifecycle-hook gate/ { on = 0 } on' "$PCC" > "$GATE_SNIPPET"
if grep -Fq 'run_quiet "Agent skills sync (P1151)"' "$GATE_SNIPPET" && bash -n "$GATE_SNIPPET" 2>/dev/null; then
  echo "PASS  case H: check 22 extracted and parses ($(wc -l < "$GATE_SNIPPET" | tr -d ' ') lines)"; pass_count=$((pass_count + 1))
else
  echo "FAIL  case H: could not extract check 22 from scripts/pre-commit-checks.sh — anchors moved?"
  fail_count=$((fail_count + 1))
fi

GATE_ERRORS=""
run_gate() {   # run_gate DIR — source check 22 with cwd DIR; sets LAST_OUT and GATE_ERRORS
  LAST_OUT="$(cd "$1" && env -u GIT_DIR -u GIT_INDEX_FILE -u GIT_WORK_TREE -u GIT_COMMON_DIR \
    bash -c 'RED=""; GREEN=""; YELLOW=""; NC=""; ERRORS=0; WARNINGS=0
             . "$1" || exit 90
             . "$2"
             echo "GATE_ERRORS=${ERRORS}"' _ "${REPO_ROOT}/scripts/lib/run-quiet.sh" "$GATE_SNIPPET" 2>&1)"
  GATE_ERRORS="$(printf '%s\n' "$LAST_OUT" | sed -n 's/^GATE_ERRORS=//p' | tail -1)"
}
assert_gate() {   # assert_gate NAME WANT-ERRORS
  if [[ "$GATE_ERRORS" == "$2" ]]; then
    echo "PASS  ${1}: ERRORS=${GATE_ERRORS}"; pass_count=$((pass_count + 1))
  else
    echo "FAIL  ${1}: expected ERRORS=${2}, got '${GATE_ERRORS}'"
    printf '%s\n' "$LAST_OUT" | tail -12 | sed 's/^/        /'; fail_count=$((fail_count + 1))
  fi
}
refute_out() {   # refute_out NAME STRING
  if grep -Fq -- "$2" <<< "$LAST_OUT"; then
    echo "FAIL  ${1}: output still contains: $2"; fail_count=$((fail_count + 1))
  else
    echo "PASS  ${1}"; pass_count=$((pass_count + 1))
  fi
}

# A fixture laid out exactly like the repo: the gate calls the script by its
# real relative path with its default --src-dir/--out-dir.
GATEFIX="${WORK}/gatefix"
mkdir -p "${GATEFIX}/scripts" "${GATEFIX}/.claude/commands/slava"
cp "$SCRIPT" "${GATEFIX}/scripts/sync-agent-skills.sh"
cp "${WORK}/${SRC}/flat-skill.md" "${GATEFIX}/.claude/commands/slava/flat-skill.md"
# 7d: the must-fail control below mutates a COPY of a real, shipped mirror file,
# not only synthetic fixture text. Pick the first real skill whose name: field
# matches its directory, so the copy is a valid source in the fixture.
REAL_SKILL=""
for d in "${REPO_ROOT}"/.agents/skills/*/; do
  n="$(basename "$d")"
  nf="$( [[ -f "${d}SKILL.md" ]] && grep -m1 '^name:' "${d}SKILL.md" )"
  if [[ "$nf" =~ ^name:[[:space:]]*[\'\"]?([a-z0-9._-]+)[\'\"]?[[:space:]]*$ ]] && [[ "${BASH_REMATCH[1]}" == "$n" ]]; then
    REAL_SKILL="$n"; break
  fi
done
cp "${REPO_ROOT}/.agents/skills/${REAL_SKILL}/SKILL.md" "${GATEFIX}/.claude/commands/slava/${REAL_SKILL}.md"
(
  cd "$GATEFIX"
  git init -q -b main
  git config user.email t@t.t
  git config user.name t
  ./scripts/sync-agent-skills.sh >/dev/null 2>&1
  git add -- scripts .claude .agents >/dev/null 2>&1
  git commit -qm "gate fixture baseline" >/dev/null 2>&1
)

# H0 — the normal commit path (gate 7c): a source edit regenerated and staged
# with its mirror passes.
printf 'an edit, properly regenerated\n' >> "${GATEFIX}/.claude/commands/slava/flat-skill.md"
(cd "$GATEFIX" && ./scripts/sync-agent-skills.sh >/dev/null 2>&1 &&
  git add -- .claude/commands/slava/flat-skill.md .agents/skills/flat-skill/SKILL.md >/dev/null 2>&1)
run_gate "$GATEFIX"
assert_gate "case H0: in-sync staged skill passes check 22" 0

# H1 — missing callee: blocking, and it names the path.
mv "${GATEFIX}/scripts/sync-agent-skills.sh" "${WORK}/sas-aside.sh"
run_gate "$GATEFIX"
assert_gate "case H1: missing script blocks the commit" 1
assert_out "case H1: names the script that could not run" "scripts/sync-agent-skills.sh"
refute_out "case H1: no longer reports a skip" "skipping agent-skills sync gate"

# H2 — dangling symlink in its place: blocking.
ln -s "${WORK}/no-such-target.sh" "${GATEFIX}/scripts/sync-agent-skills.sh"
run_gate "$GATEFIX"
assert_gate "case H2: dangling symlink blocks the commit" 1
rm -f "${GATEFIX}/scripts/sync-agent-skills.sh"
mv "${WORK}/sas-aside.sh" "${GATEFIX}/scripts/sync-agent-skills.sh"
run_gate "$GATEFIX"
assert_gate "case H1/H2: restored script passes again" 0

# H3 — stale mirror: the hint names the exact mirror path and --files, and
# never the bare-directory re-stage.
printf 'an edit nobody regenerated\n' >> "${GATEFIX}/.claude/commands/slava/flat-skill.md"
(cd "$GATEFIX" && git add -- .claude/commands/slava/flat-skill.md >/dev/null 2>&1)
run_gate "$GATEFIX"
assert_gate "case H3: stale mirror blocks the commit" 1
assert_out "case H3: hint names the exact mirror path" "git add .agents/skills/flat-skill/SKILL.md"
assert_out "case H3: hint names commit-to-main --files" "commit-to-main --files"
refute_out "case H3: no bare-directory re-stage" "re-stage .agents/skills/"
(cd "$GATEFIX" && ./scripts/sync-agent-skills.sh >/dev/null 2>&1 &&
  git add -- .agents/skills/flat-skill/SKILL.md >/dev/null 2>&1 && git commit -qm "resync H3" >/dev/null 2>&1)

# H4 — 7d control: a COPY of a real shipped mirror file, hand-edited and staged.
if [[ -n "$REAL_SKILL" ]]; then
  printf 'hand edit to a real mirror copy\n' >> "${GATEFIX}/.agents/skills/${REAL_SKILL}/SKILL.md"
  (cd "$GATEFIX" && git add -- ".agents/skills/${REAL_SKILL}/SKILL.md" >/dev/null 2>&1)
  run_gate "$GATEFIX"
  assert_gate "case H4: hand-edited real mirror copy (${REAL_SKILL}) blocks" 1
  assert_out "case H4: hint names that real mirror path" "git add .agents/skills/${REAL_SKILL}/SKILL.md"
  (cd "$GATEFIX" && ./scripts/sync-agent-skills.sh >/dev/null 2>&1 &&
    git add -- ".agents/skills/${REAL_SKILL}/SKILL.md" >/dev/null 2>&1 && git commit -qm "resync H4" >/dev/null 2>&1)
else
  echo "FAIL  case H4: no real skill with a matching name: field found under .agents/skills"
  fail_count=$((fail_count + 1))
fi

# H5 — a drift kind the hint does not know is printed raw, never dropped; and a
# failure with no drift lines says regenerating will not fix it.
cp "${GATEFIX}/scripts/sync-agent-skills.sh" "${WORK}/sas-aside.sh"
printf '#!/usr/bin/env bash\necho "DRIFT_FUTURE_KIND:fixture-thing" 1>&2\nexit 1\n' > "${GATEFIX}/scripts/sync-agent-skills.sh"
run_gate "$GATEFIX"
assert_gate "case H5a: unknown drift kind still blocks" 1
# The raw line also appears in run_quiet's echo of the output, so the assertion
# is on the HINT's own header — the first draft asserted the raw line and passed
# against the unfixed gate.
assert_out "case H5a: hint flags drift it cannot map to a path" "Drift this hint cannot map to a path"
printf '#!/usr/bin/env bash\necho "NAME_MISMATCH:fixture" 1>&2\nexit 1\n' > "${GATEFIX}/scripts/sync-agent-skills.sh"
run_gate "$GATEFIX"
assert_gate "case H5b: a non-drift failure blocks" 1
assert_out "case H5b: says regenerating will not fix it" "regenerating will not fix it"
mv "${WORK}/sas-aside.sh" "${GATEFIX}/scripts/sync-agent-skills.sh"

# H6 — gate 7c on the REAL repo: check 22 run against this checkout's real
# index must pass. A failure here means either real staged drift (correct) or
# a false positive in the gate — read the output before assuming which.
run_gate "$REPO_ROOT"
assert_gate "case H6: check 22 against the real repo index passes" 0


echo ""
echo "=== ${pass_count} passed, ${fail_count} failed ==="
[[ "$fail_count" -eq 0 ]] || exit 1
exit 0
