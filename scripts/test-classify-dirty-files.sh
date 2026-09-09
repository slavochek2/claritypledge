#!/usr/bin/env bash
# Canary for scripts/classify-dirty-files.sh (P1287).
#
# epistemic.md gate 7: a classifier that has only been watched AGREE is unproven. Every case
# below pairs a positive with the control that must NOT produce the same verdict — in
# particular the read-vs-write control, which is the whole basis of attribution: a session
# that merely SAW a path in `git status` output must never be reported as its owner.
set -uo pipefail

FAIL=0
ok()   { printf '  ✓ %s\n' "$1"; }
bad()  { printf '  ✗ %s\n     expected: %s\n     got:      %s\n' "$1" "$2" "$3"; FAIL=1; }

SCRIPT="$(cd "$(dirname "$0")" && pwd)/classify-dirty-files.sh"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

REPO="$TMP/repo"; TR="$TMP/transcripts/-x-claritypledge"
mkdir -p "$REPO" "$TR"
cd "$REPO"
git init -q . && git config user.email t@t && git config user.name t

mk() { mkdir -p "$(dirname "$1")"; printf '%s\n' "${2:-x}" > "$1"; }

mk kept.md original; mk noop.md original; mk peer.md original
mk supabase/.temp/cli-latest v1
git add kept.md noop.md peer.md supabase/.temp/cli-latest
git commit -qm base

# --- fixtures ---------------------------------------------------------------
# The real bucket-1 shape: something was staged, then the worktree copy went back to HEAD's
# content. Index differs from HEAD, but the file on disk does not — so there is nothing to
# commit and the entry is a leftover. (Staging content that already equals HEAD produces no
# dirty entry at all, so that is NOT the case to fixture.)
mk noop.md changed
git add noop.md
mk noop.md original
mk peer.md changed           # written by another session               → SESSION
mk mine.md new               # written by us                            → MINE
mk seen-only.md changed      # another session only READ/listed it      → UNKNOWN
mk supabase/.temp/cli-latest v2   #                                     → GENERATED

w() { # session-uuid  age-seconds  json-line
  printf '%s\n' "$3" >> "$TR/$1.jsonl"
  touch -t "$(date -v-"$2"S +%Y%m%d%H%M.%S)" "$TR/$1.jsonl"
}
w peer-0000 10 '{"message":{"content":[{"type":"tool_use","name":"Edit","input":{"file_path":"'"$REPO"'/peer.md"}}]}}'
w mine-0000 10 '{"message":{"content":[{"type":"tool_use","name":"Write","input":{"file_path":"'"$REPO"'/mine.md"}}]}}'
# CONTROL: this session only saw seen-only.md in a git status dump — a read, not a write.
w peer-0000 10 '{"message":{"content":[{"type":"tool_result","content":" M kept.md\n M seen-only.md\n"}]}}'
# CONTROL: an idle session's write must be ORPHAN, not SESSION.
mk stale.md changed
touch -t "$(date -v-7200S +%Y%m%d%H%M.%S)" stale.md   # file is as old as the write that made it
w old-0000 7200 '{"message":{"content":[{"type":"tool_use","name":"Edit","input":{"file_path":"'"$REPO"'/stale.md"}}]}}'

# A python-heredoc rewrite by US: no redirect, no editing tool — must still be MINE, or a
# session cannot commit its own work (dogfooded regression, 2026-09-09).
mk pyedit.md changed
w mine-0000 10 '{"message":{"content":[{"type":"tool_use","name":"Bash","input":{"command":"python3 - <<PY\np=\"pyedit.md\"\nopen(p,\"w\").write(s)\nPY"}}]}}'
# CONTROL: a read-only command that merely NAMES a path and redirects stderr must NOT count.
mk redirected.md changed
w peer-0000 10 '{"message":{"content":[{"type":"tool_use","name":"Bash","input":{"command":"grep -c x redirected.md 2>/dev/null | head -3"}}]}}'

# --- adversarial cases from the 2026-09-09 hostile review ------------------
# Each one made a PEER's file classify as MINE in the regex implementation. They are the
# reason attribution is a JSON parse now; they stay here so a "simplification" back to a
# regex fails loudly instead of silently re-opening cross-session misattribution.
mk adv-prefix.md changed; mk adv-block.md changed; mk adv-cp.md changed; mk adv-pyarg.md changed
# 1. prefix collision: we edited adv-prefix.md.bak; the dirty file is adv-prefix.md
w mine-0000 10 '{"message":{"content":[{"type":"tool_use","name":"Edit","input":{"file_path":"adv-prefix.md.bak"}}]}}'
# 2. two tool_use blocks in ONE record: our Edit, then a READ of the peer's file
w mine-0000 10 '{"message":{"content":[{"type":"tool_use","name":"Edit","input":{"file_path":"other.md"}},{"type":"tool_use","name":"Read","input":{"file_path":"adv-block.md"}}]}}'
# 3. cp SOURCE, not destination
w mine-0000 10 '{"message":{"content":[{"type":"tool_use","name":"Bash","input":{"command":"cp adv-cp.md /tmp/backup.md"}}]}}'
# 4. python names the path but writes somewhere else
w mine-0000 10 '{"message":{"content":[{"type":"tool_use","name":"Bash","input":{"command":"python3 - <<PY\np=\"adv-pyarg.md\"\nopen(\"report.md\",\"w\").write(open(p).read())\nPY"}}]}}'

# CONTROL for ORPHAN decay: same idle writer, but the file changed long AFTER that write, so
# the old writer no longer explains the current content and must not be reported as its owner.
mk decayed.md changed
w old-0000 7200 '{"message":{"content":[{"type":"tool_use","name":"Edit","input":{"file_path":"'"$REPO"'/decayed.md"}}]}}'

out="$(CLASSIFY_TRANSCRIPT_ROOT="$TMP/transcripts" CLASSIFY_PROJECT_MATCH=claritypledge \
        "$SCRIPT" --session-id mine-0000 2>&1)"

verdict() { awk -F'\t' -v p="$1" '$2==p{print $1}' <<<"$out"; }

check() { local got; got="$(verdict "$1")"; [[ "$got" == "$2" ]] && ok "$1 → $2" || bad "$1" "$2" "${got:-<no record>}"; }

echo "== classify-dirty-files canary =="
check mine.md       MINE
check peer.md       SESSION
check stale.md      ORPHAN
check decayed.md    UNKNOWN   # ORPHAN decays when the file moved on
check noop.md       NOOP
check supabase/.temp/cli-latest GENERATED
# A python rewrite through a VARIABLE (`p="x"; open(p,"w")`) cannot be bound to its target
# by any amount of parsing — the binding happens at runtime. It is therefore WEAK, and weak
# never commits. /push covers this case from the session's own knowledge of what it edited,
# which is legitimate evidence for its OWN work and unavailable for anyone else's.
check pyedit.md     UNKNOWN
check redirected.md UNKNOWN   # weak evidence names no owner: 2>/dev/null is not a write
check seen-only.md  UNKNOWN     # the read-vs-write control — the load-bearing one
check kept.md       ""          # clean file: must not appear at all

for f in adv-prefix.md adv-block.md adv-cp.md adv-pyarg.md; do
  got="$(verdict "$f")"
  [[ "$got" == "MINE" ]] && bad "adversarial $f" "anything but MINE" "MINE — cross-session misattribution" || ok "adversarial $f → ${got:-none} (not MINE)"
done

# The safety invariant the whole design rests on: nothing but MINE is ever committable.
if awk -F'\t' '$1!="MINE" && $3=="stage and commit"' <<<"$out" | grep -q .; then
  bad "safety invariant" "only MINE licenses a commit" "a non-MINE verdict said 'stage and commit'"
else
  ok "safety invariant: only MINE licenses a commit"
fi

(( FAIL )) && { echo "FAIL"; exit 1; }
echo "PASS"
