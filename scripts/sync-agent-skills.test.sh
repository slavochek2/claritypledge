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

RESOLVED_N=$(find -L "${WORK}/${OUT}" -name SKILL.md | wc -l | tr -d ' ')
if [[ "$RESOLVED_N" == "2" ]]; then
  echo "PASS  independent oracle: find -L resolves exactly 2 SKILL.md links (D2/D5 applied correctly)"
  pass_count=$((pass_count + 1))
else
  echo "FAIL  independent oracle: find -L resolved ${RESOLVED_N} links, expected 2"
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

LINK_TARGET=$(readlink "${WORK}/${OUT}/canonical-note/SKILL.md" 2>/dev/null || echo "MISSING")
if [[ "$LINK_TARGET" == *"/${SRC}/canonical-note.md" ]]; then
  echo "PASS  case D2: canonical (non-alias) source was linked, not the alias"
  pass_count=$((pass_count + 1))
else
  echo "FAIL  case D2: expected link to canonical-note.md, got: ${LINK_TARGET}"
  fail_count=$((fail_count + 1))
fi
rm -f "${WORK}/${SRC}/canonical-note.md" "${WORK}/${SRC}/nested/canonical-note.md"
rm -rf "${WORK}/${SRC}/canonicalbox"
run_sync "regenerate to restore after case D2" 0 --src-dir "$SRC" --out-dir "$OUT"

echo ""
echo "=== ${pass_count} passed, ${fail_count} failed ==="
[[ "$fail_count" -eq 0 ]] || exit 1
exit 0
