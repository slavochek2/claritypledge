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

echo ""
echo "=== ${pass_count} passed, ${fail_count} failed ==="
[[ "$fail_count" -eq 0 ]] || exit 1
exit 0
