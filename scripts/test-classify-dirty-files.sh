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
w old-0000 7200 '{"message":{"content":[{"type":"tool_use","name":"Edit","input":{"file_path":"'"$REPO"'/stale.md"}}]}}'

# A python-heredoc rewrite by US: no redirect, no editing tool — must still be MINE, or a
# session cannot commit its own work (dogfooded regression, 2026-09-09).
mk pyedit.md changed
w mine-0000 10 '{"message":{"content":[{"type":"tool_use","name":"Bash","input":{"command":"python3 - <<PY\np=\"pyedit.md\"\nopen(p,\"w\").write(s)\nPY"}}]}}'
# CONTROL: a read-only command that merely NAMES a path and redirects stderr must NOT count.
mk redirected.md changed
w peer-0000 10 '{"message":{"content":[{"type":"tool_use","name":"Bash","input":{"command":"grep -c x redirected.md 2>/dev/null | head -3"}}]}}'

out="$(CLASSIFY_TRANSCRIPT_ROOT="$TMP/transcripts" CLASSIFY_PROJECT_MATCH=claritypledge \
        "$SCRIPT" --session-id mine-0000 2>&1)"

verdict() { awk -F'\t' -v p="$1" '$2==p{print $1}' <<<"$out"; }

check() { local got; got="$(verdict "$1")"; [[ "$got" == "$2" ]] && ok "$1 → $2" || bad "$1" "$2" "${got:-<no record>}"; }

echo "== classify-dirty-files canary =="
check mine.md       MINE
check peer.md       SESSION
check stale.md      ORPHAN
check noop.md       NOOP
check supabase/.temp/cli-latest GENERATED
check pyedit.md     MINE
check redirected.md UNKNOWN   # weak evidence only: 2>/dev/null is not a write
check seen-only.md  UNKNOWN     # the read-vs-write control — the load-bearing one
check kept.md       ""          # clean file: must not appear at all

# The safety invariant the whole design rests on: nothing but MINE is ever committable.
if awk -F'\t' '$1!="MINE" && $3=="stage and commit"' <<<"$out" | grep -q .; then
  bad "safety invariant" "only MINE licenses a commit" "a non-MINE verdict said 'stage and commit'"
else
  ok "safety invariant: only MINE licenses a commit"
fi

(( FAIL )) && { echo "FAIL"; exit 1; }
echo "PASS"
