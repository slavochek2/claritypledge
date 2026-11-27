#!/usr/bin/env bash
# Hermetic tests for P1734 — the review tally gate: review_receipt.py (snapshot / tally / write /
# waive), spec_review_stamp.py write --snapshot, and the Stop hook's founder-waiver branch.
# Every case runs against a throwaway git repo, so nothing is written into this repository's git dir.
# Each case that expects a refusal asserts BOTH the exit code (1) and a fragment of the message, so a
# refusal for the wrong reason (or a usage error, exit 2) cannot pass. Groups end with a positive
# control where a refusal group could otherwise pass because the harness itself is broken.
# Usage: bash scripts/test-p1734-tally.sh   (exit 0 = all pass)
set -uo pipefail
# Run from pre-commit, git exports GIT_DIR/GIT_INDEX_FILE pointing at THIS repo (P1273).
unset GIT_DIR GIT_INDEX_FILE GIT_WORK_TREE GIT_OBJECT_DIRECTORY GIT_COMMON_DIR
export CLAUDE_CODE_SESSION_ID=t-sess-1

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
STOP_HOOK="$SCRIPT_DIR/../.claude/hooks/verify-before-stop.py"
RR="$SCRIPT_DIR/review_receipt.py"
SPEC_STAMP="$SCRIPT_DIR/spec_review_stamp.py"
REPORT="$SCRIPT_DIR/review_yield_report.py"

TMP="$(cd "$(mktemp -d)" && pwd -P)"
trap 'chmod -R u+rwx "$TMP" 2>/dev/null; rm -rf "$TMP"' EXIT
REPO="$TMP/repo"
mkdir -p "$REPO/src" "$REPO/features" "$TMP/ev"
git -C "$REPO" init -q
echo "export const seed = 1" > "$REPO/src/seed.ts"
git -C "$REPO" add -A
git -C "$REPO" -c user.email=t@t -c user.name=t commit -qm init
REPO="$(cd "$REPO" && pwd -P)"
COMMON="$(git -C "$REPO" rev-parse --path-format=absolute --git-common-dir)"
TALLIES="$COMMON/.review-tallies"
RECEIPTS="$COMMON/.review-receipts"
PROMPT="$TMP/prompt.md"; echo "review these files" > "$PROMPT"

PASS=0; FAIL=0
pass() { echo "  PASS: $1"; PASS=$((PASS + 1)); }
fail() { echo "  FAIL: $1"; FAIL=$((FAIL + 1)); }
check() { # <label> <expected> <got>
  if [[ "$2" == "$3" ]]; then pass "$1"; else fail "$1 (expected '$2', got '$3')"; fi
}
rc() { local a=0; "$@" >/dev/null 2>&1 || a=$?; echo "$a"; }
# ref <label> <message fragment> <cmd...> : the command must exit 1 AND its stderr must carry the fragment.
ref() {
  local label="$1" frag="$2"; shift 2
  local err code
  err="$("$@" 2>&1 >/dev/null)"; code=$?
  if [[ "$code" == 1 && "$err" == *"$frag"* ]]; then pass "$label (rc 1)"
  else fail "$label (expected rc 1 + '$frag', got rc $code: ${err:0:200})"; fi
}
okc() { # <label> <cmd...> : exit 0
  local label="$1"; shift
  local err code
  err="$("$@" 2>&1 >/dev/null)"; code=$?
  if [[ "$code" == 0 ]]; then pass "$label (rc 0)"; else fail "$label (expected rc 0, got rc $code: ${err:0:200})"; fi
}
sid() { export CLAUDE_CODE_SESSION_ID="t-sess-$1"; }
mkf() { echo "export const $1 = $RANDOM" > "$REPO/src/$1.ts"; } # <name> : a fresh file with unique content
snap() { local p; p="$(python3 "$RR" snapshot -- "$@" 2>/dev/null)"; sleep 1; printf '%s' "$p"; }
# Real ask-model header shapes (line 1 of an output file)
H_GEM='ASK-MODEL: vendor=gemini requested=gemini-4-carbon served=gemini-4-carbon verified=served effort=low reasoning_tokens=120 exit=0'
H_GEM_FB='ASK-MODEL: vendor=gemini requested=gemini-4-argon served=gemini-4-argon verified=served effort=low reasoning_tokens=90 fallback_from=gemini-4-carbon exit=0'
H_GEM_ARGON='ASK-MODEL: vendor=gemini requested=gemini-4-argon served=gemini-4-argon verified=served effort=low reasoning_tokens=90 exit=0'
H_GEM_FAIL='ASK-MODEL: vendor=gemini requested=gemini-4-carbon served=none verified=failed effort=low reasoning_tokens=unreported exit=3'
H_GLM='ASK-MODEL: vendor=openrouter requested=z-ai/glm-5 served=z-ai/glm-5 verified=served effort=low reasoning_tokens=unreported exit=0'
H_GLM_FAIL='ASK-MODEL: vendor=openrouter requested=z-ai/glm-5 served=z-ai/glm-5 verified=failed effort=low reasoning_tokens=unreported exit=3'
H_CODEX='ASK-MODEL: vendor=codex requested=gpt-6-codex verified=accepted-only effort=low reasoning_tokens=unreported exit=0'
mk() { printf '%s\nfindings %s\n' "$2" "$RANDOM$RANDOM" > "$1"; } # <file> <header> : unique body so each file hashes differently
setrev() { REVS=(--reviewer "gemini=$1" --reviewer "glm=$2" --reviewer "codex=$3" --reviewer "opus=$4"); }
# tq/sj evaluate expressions THIS FILE writes as literals (never external input) over a parsed JSON record.
tq() { # <snapshot path or basename> <python expr over the LATEST tally record `rec` for it>
  python3 -c 'import json,sys
rec=None
for l in open(sys.argv[1]):
    try: r=json.loads(l)
    except Exception: continue
    if r.get("snapshot")==sys.argv[2]: rec=r
print(eval(sys.argv[3]))' "$TALLIES" "$(basename "$1")" "$2"
}
sj() { python3 -c 'import json,sys; b=json.load(open(sys.argv[1])); print(eval(sys.argv[2]))' "$1" "$2"; }
tally_std() { # <snapshot> <gemini evidence> [more args]: gemini ok, the rest skipped, no defects
  local s="$1" e="$2"; shift 2
  setrev ok 'skipped (x)' 'skipped (x)' 'not triggered'
  python3 "$RR" tally --snapshot "$s" --kind finish --prompt-file "$PROMPT" "${REVS[@]}" --evidence "$e" --no-defects "$@"
}

echo "[1] snapshot records session + nonce; a sessionless snapshot warns and never blocks"
sid 1; mkf c1
S="$(snap "$REPO/src/c1.ts")"
check "snapshot body carries the session" t-sess-1 "$(sj "$S" 'b["session"]')"
check "snapshot body carries a nonce" 16 "$(sj "$S" 'len(b["nonce"])')"
check "session index lists the snapshot" 1 "$(grep -cF "$S" "$COMMON/.review-snapshots/sessions/t-sess-1.txt")"
mkf c1b
SN="$(env -u CLAUDE_CODE_SESSION_ID python3 "$RR" snapshot -- "$REPO/src/c1b.ts" 2>"$TMP/c1b.err")"; sleep 1
check "sessionless snapshot: stderr carries WARNING" 1 "$(grep -c WARNING "$TMP/c1b.err")"
check "sessionless snapshot: body session is null" None "$(sj "$SN" 'b["session"]')"
mk "$TMP/ev/c1b" "$H_GEM"
okc "sessionless snapshot never blocks write" env -u CLAUDE_CODE_SESSION_ID python3 "$RR" write --snapshot "$SN" --evidence "$TMP/ev/c1b"

echo "[2] identical snapshots in the same second are two rounds"
sid 2; mkf c2
SA="$(python3 "$RR" snapshot -- "$REPO/src/c2.ts" 2>/dev/null)"; SB="$(python3 "$RR" snapshot -- "$REPO/src/c2.ts" 2>/dev/null)"; sleep 1
if [[ "$SA" != "$SB" ]]; then pass "two distinct snapshot paths"; else fail "two distinct snapshot paths (both $SA)"; fi
mk "$TMP/ev/c2" "$H_GEM"
okc "tally the first" tally_std "$SA" "$TMP/ev/c2"
ref "write of the tallied one still blocks on the second" "$(basename "$SB")" python3 "$RR" write --snapshot "$SA" --evidence "$TMP/ev/c2"
okc "tally the second" tally_std "$SB" "$TMP/ev/c2"
okc "write passes once both are tallied" python3 "$RR" write --snapshot "$SA" --evidence "$TMP/ev/c2"

echo "[3] write refuses an untallied snapshot, passes after the tally"
sid 3; mkf c3; S="$(snap "$REPO/src/c3.ts")"; mk "$TMP/ev/c3" "$H_GEM"
ref "write without a tally" "no tally" python3 "$RR" write --snapshot "$S" --evidence "$TMP/ev/c3"
okc "tally" tally_std "$S" "$TMP/ev/c3"
okc "write after the tally" python3 "$RR" write --snapshot "$S" --evidence "$TMP/ev/c3"

echo "[4] the waive CLI refuses the same way"
sid 4; mkf c4; S="$(snap "$REPO/src/c4.ts")"; mk "$TMP/ev/c4" "$H_GEM"
ref "waive without a tally" "no tally" python3 "$RR" waive --reason "founder: skip" -- "$REPO/src/c4.ts"
okc "tally" tally_std "$S" "$TMP/ev/c4"
okc "waive after the tally" python3 "$RR" waive --reason "founder: skip" -- "$REPO/src/c4.ts"

echo "[5] spec_review_stamp.py write"
sid 5
SPEC="$REPO/features/p9_t.md"
printf -- '---\nstatus: week\n---\n# Spec\n\nbody one\n' > "$SPEC"
mkf c5o
SO="$(snap "$REPO/src/c5o.ts")"
SC="$(snap "$SPEC")"
mk "$TMP/ev/c5a" "$H_GEM"; mk "$TMP/ev/c5b" "$H_GEM"
ref "session set, no --snapshot" "--snapshot is required" python3 "$SPEC_STAMP" write "$SPEC" --evidence "$TMP/ev/c5a"
ref "snapshot that does not hold the spec" "does not hold" python3 "$SPEC_STAMP" write "$SPEC" --evidence "$TMP/ev/c5a" --snapshot "$SO"
ref "untallied snapshot" "no tally" python3 "$SPEC_STAMP" write "$SPEC" --evidence "$TMP/ev/c5a" --snapshot "$SC"
okc "close the mistaken snapshot" python3 "$RR" tally --abandoned "$SC" --reason mistaken
ref "abandoned snapshot" "abandoned" python3 "$SPEC_STAMP" write "$SPEC" --evidence "$TMP/ev/c5a" --snapshot "$SC"
SE="$(snap "$SPEC")"; mk "$TMP/ev/c5a" "$H_GEM"; mk "$TMP/ev/c5b" "$H_GEM"
setrev ok 'skipped (x)' 'skipped (x)' 'not triggered'
okc "tally the spec round with evidence A only" python3 "$RR" tally --snapshot "$SE" --kind spec --prompt-file "$PROMPT" "${REVS[@]}" --evidence "$TMP/ev/c5a" --no-defects
ref "valid evidence B that the tally did not record" "not recorded" python3 "$SPEC_STAMP" write "$SPEC" --evidence "$TMP/ev/c5a" --evidence "$TMP/ev/c5b" --snapshot "$SE"
okc "stamps when the tally records the evidence" python3 "$SPEC_STAMP" write "$SPEC" --evidence "$TMP/ev/c5a" --snapshot "$SE"
check "...the stamp is in the frontmatter" 1 "$(grep -c '^spec_review_hash:' "$SPEC")"
printf -- '---\nstatus: week\n---\n# Spec two\n' > "$REPO/features/p9_u.md"
okc "no session, no --snapshot: stamps (old contract)" env -u CLAUDE_CODE_SESSION_ID python3 "$SPEC_STAMP" write "$REPO/features/p9_u.md" --evidence "$TMP/ev/c5a"

echo "[6] write: abandoned snapshot, unrecorded evidence, refusal ordering"
sid 6
mkf c6a; S="$(snap "$REPO/src/c6a.ts")"; mk "$TMP/ev/c6a" "$H_GEM"
okc "abandon" python3 "$RR" tally --abandoned "$S" --reason mistaken
ref "write refuses an abandoned snapshot" "abandoned" python3 "$RR" write --snapshot "$S" --evidence "$TMP/ev/c6a"
mkf c6b; S="$(snap "$REPO/src/c6b.ts")"; mk "$TMP/ev/c6b1" "$H_GEM"; mk "$TMP/ev/c6b2" "$H_GEM"
okc "tally recording only evidence 1" tally_std "$S" "$TMP/ev/c6b1"
ref "write refuses fresh valid evidence the tally did not record" "not recorded" python3 "$RR" write --snapshot "$S" --evidence "$TMP/ev/c6b1" "$TMP/ev/c6b2"
okc "...and passes with only the recorded one" python3 "$RR" write --snapshot "$S" --evidence "$TMP/ev/c6b1"
mkf c6c; S="$(snap "$REPO/src/c6c.ts")"; mk "$TMP/ev/c6c_glm" "$H_GLM"; mk "$TMP/ev/c6c_gem" "$H_GEM"
msg="$(python3 "$RR" write --snapshot "$S" --evidence "$TMP/ev/c6c_glm" 2>&1 >/dev/null)"
case "$msg" in *"gemini or codex"*) check "GLM-only evidence on an UNTALLIED snapshot: floor message first, not the tally one" ok ok ;;
  *) check "GLM-only evidence on an UNTALLIED snapshot: floor message first" ok "got: $msg" ;; esac
case "$msg" in *"no tally"*) fail "...and no tally message leaked in" ;; *) pass "...and no tally message leaked in" ;; esac
okc "tally with gemini evidence" tally_std "$S" "$TMP/ev/c6c_gem"
ref "GLM-only evidence on a TALLIED snapshot: still the floor message" "gemini or codex" python3 "$RR" write --snapshot "$S" --evidence "$TMP/ev/c6c_glm"

echo "[7] failed / missing / skipped / not triggered are all valid rows"
sid 7
mkf c7a; S="$(snap "$REPO/src/c7a.ts")"; mk "$TMP/ev/c7g" "$H_GEM"; mk "$TMP/ev/c7f" "$H_GLM_FAIL"
setrev ok 'failed (exit 4)' 'missing (no report)' 'skipped (one file)'
okc "tally: gemini ok, glm failed (exit 4) with its failed run, codex missing, opus skipped" \
  python3 "$RR" tally --snapshot "$S" --kind finish --prompt-file "$PROMPT" "${REVS[@]}" --evidence "$TMP/ev/c7g" --failed-run "$TMP/ev/c7f" --no-defects
check "...outcomes stored" "failed (exit 4)|missing (no report)|skipped (one file)" "$(tq "$S" 'rec["reviewers"]["glm"]+"|"+rec["reviewers"]["codex"]+"|"+rec["reviewers"]["opus"]')"
okc "write succeeds with the one floor vendor that was ok" python3 "$RR" write --snapshot "$S" --evidence "$TMP/ev/c7g"
mkf c7b; S="$(snap "$REPO/src/c7b.ts")"; mk "$TMP/ev/c7g2" "$H_GEM"
setrev ok 'skipped (one file)' 'not triggered' 'not triggered'
okc "tally: skipped (one file) and not triggered" python3 "$RR" tally --snapshot "$S" --kind finish --prompt-file "$PROMPT" "${REVS[@]}" --evidence "$TMP/ev/c7g2" --no-defects
okc "write succeeds" python3 "$RR" write --snapshot "$S" --evidence "$TMP/ev/c7g2"

echo "[8] tally refusals"
sid 8
mk "$TMP/ev/c8old" "$H_GEM"; sleep 1
mkf c8; S8="$(snap "$REPO/src/c8.ts")"
mk "$TMP/ev/c8g" "$H_GEM"; mk "$TMP/ev/c8l" "$H_GLM"; mk "$TMP/ev/c8x" "$H_CODEX"; mk "$TMP/ev/c8f" "$H_GLM_FAIL"
mkf c8b; S8B="$(snap "$REPO/src/c8.ts")"      # a later, untallied snapshot of the same file
mkf c8c; S8C="$(snap "$REPO/src/c8.ts")"; python3 "$RR" tally --abandoned "$S8C" --reason x >/dev/null 2>&1
# S8B/S8C hold c8.ts as it is now; S8 was taken earlier with different content only if c8.ts changed, so retake S8 now.
S8="$(snap "$REPO/src/c8.ts")"
mk "$TMP/ev/c8g" "$H_GEM"; mk "$TMP/ev/c8l" "$H_GLM"; mk "$TMP/ev/c8x" "$H_CODEX"; mk "$TMP/ev/c8f" "$H_GLM_FAIL"
TB=(python3 "$RR" tally --snapshot "$S8" --kind finish --prompt-file "$PROMPT")
setrev ok 'skipped (x)' 'skipped (x)' 'not triggered'; BASE=("${REVS[@]}")
ref "outcome 'ok-ish'" "outcome must be" "${TB[@]}" --reviewer gemini=ok --reviewer glm=ok-ish --reviewer codex='skipped (x)' --reviewer opus='not triggered' --evidence "$TMP/ev/c8g" --no-defects
ref "outcome 'failed' without a reason" "outcome must be" "${TB[@]}" --reviewer gemini=ok --reviewer glm=failed --reviewer codex='skipped (x)' --reviewer opus='not triggered' --evidence "$TMP/ev/c8g" --no-defects
ref "a missing slot" "Missing: opus" "${TB[@]}" --reviewer gemini=ok --reviewer glm='skipped (x)' --reviewer codex='skipped (x)' --evidence "$TMP/ev/c8g" --no-defects
ref "--evidence that is a failed run" "not a successful ask-model run" "${TB[@]}" "${BASE[@]}" --evidence "$TMP/ev/c8g" "$TMP/ev/c8f" --no-defects
ref "--evidence older than the snapshot" "not a successful ask-model run" "${TB[@]}" "${BASE[@]}" --evidence "$TMP/ev/c8old" --no-defects
ref "--evidence of a vendor whose slot is not ok" "is a successful openrouter run" "${TB[@]}" "${BASE[@]}" --evidence "$TMP/ev/c8g" "$TMP/ev/c8l" --no-defects
setrev ok ok 'skipped (x)' 'not triggered'
ref "ok gemini slot with no gemini evidence" "gemini is ok but no --evidence" "${TB[@]}" "${REVS[@]}" --evidence "$TMP/ev/c8l" --no-defects
ref "ok glm slot with no glm evidence" "glm is ok but no --evidence" "${TB[@]}" "${REVS[@]}" --evidence "$TMP/ev/c8g" --no-defects
setrev ok 'skipped (x)' ok 'not triggered'
ref "ok codex slot with no codex evidence" "codex is ok but no --evidence" "${TB[@]}" "${REVS[@]}" --evidence "$TMP/ev/c8g" --no-defects
ref "--failed-run that is actually successful" "is a successful run" "${TB[@]}" "${BASE[@]}" --evidence "$TMP/ev/c8g" --failed-run "$TMP/ev/c8g" --no-defects
ref "--failed-run for a skipped slot" "is a glm attempt, but glm is" "${TB[@]}" "${BASE[@]}" --evidence "$TMP/ev/c8g" --failed-run "$TMP/ev/c8f" --no-defects
printf '[{"summary":"x","file":"src/c8.ts","line":1,"state":"verified","raised_by":{"glm":"HIGH"}}]' > "$TMP/d_nonok.json"
printf '[{"summary":"x","file":"src/c8.ts","line":1,"state":"maybe","raised_by":{"gemini":"HIGH"}}]' > "$TMP/d_state.json"
printf '[{"summary":"x","file":"src/c8.ts","line":1,"state":"verified","raised_by":{"gemini":"SEVERE"}}]' > "$TMP/d_sev.json"
printf '[{"summary":"x","file":"src/c8.ts","line":1,"state":"verified","raised_by":{"gemini":"HIGH"}}]' > "$TMP/d_good.json"
ref "a defect naming a non-ok reviewer" "whose outcome is" "${TB[@]}" "${BASE[@]}" --evidence "$TMP/ev/c8g" --defects "$TMP/d_nonok.json"
ref "a defect with a bad state" "state must be" "${TB[@]}" "${BASE[@]}" --evidence "$TMP/ev/c8g" --defects "$TMP/d_state.json"
ref "a defect with a bad severity" "severity from gemini must be" "${TB[@]}" "${BASE[@]}" --evidence "$TMP/ev/c8g" --defects "$TMP/d_sev.json"
ref "neither --defects nor --no-defects" "exactly one of" "${TB[@]}" "${BASE[@]}" --evidence "$TMP/ev/c8g"
ref "both --defects and --no-defects" "exactly one of" "${TB[@]}" "${BASE[@]}" --evidence "$TMP/ev/c8g" --defects "$TMP/d_good.json" --no-defects
ref "missing --prompt-file" "--prompt-file" python3 "$RR" tally --snapshot "$S8" --kind finish "${BASE[@]}" --evidence "$TMP/ev/c8g" --no-defects
ref "--after naming a snapshot with no reviewed tally (untallied)" "no reviewed tally" "${TB[@]}" "${BASE[@]}" --evidence "$TMP/ev/c8g" --no-defects --after "$S8B"
ref "--after naming an abandoned snapshot" "no reviewed tally" "${TB[@]}" "${BASE[@]}" --evidence "$TMP/ev/c8g" --no-defects --after "$S8C"
ref "--after naming the same snapshot" "same snapshot" "${TB[@]}" "${BASE[@]}" --evidence "$TMP/ev/c8g" --no-defects --after "$S8"
mkf c8o; SOTHER="$(CLAUDE_CODE_SESSION_ID=t-sess-8other python3 "$RR" snapshot -- "$REPO/src/c8o.ts" 2>/dev/null)"; sleep 1
ref "tally of another session's snapshot" "another session" python3 "$RR" tally --snapshot "$SOTHER" --kind finish --prompt-file "$PROMPT" "${BASE[@]}" --evidence "$TMP/ev/c8g" --no-defects
check "no refusal wrote a tally for the snapshot" "" "$(python3 -c 'import json,sys
n=0
for l in open(sys.argv[1]):
    try: r=json.loads(l)
    except Exception: continue
    if r.get("snapshot") in (sys.argv[2], sys.argv[3]): n+=1
print("" if n==0 else "wrote %d" % n)' "$TALLIES" "$(basename "$S8")" "$(basename "$SOTHER")")"
okc "CONTROL: the same tally with valid arguments is accepted" "${TB[@]}" "${BASE[@]}" --evidence "$TMP/ev/c8g" --no-defects

echo "[9] a default-model fallback is two attempts"
sid 9
mkf c9a; S="$(snap "$REPO/src/c9a.ts")"; mk "$TMP/ev/c9fb" "$H_GEM_FB"
setrev ok 'skipped (x)' 'skipped (x)' 'not triggered'
okc "single output file carrying fallback_from=" python3 "$RR" tally --snapshot "$S" --kind finish --prompt-file "$PROMPT" "${REVS[@]}" --evidence "$TMP/ev/c9fb" --no-defects
check "two attempt rows" 2 "$(tq "$S" 'len(rec["attempts"])')"
check "first: the failed Carbon, ok false, no file" "gemini-4-carbon|False|None" "$(tq "$S" 'rec["attempts"][0]["requested"]+"|"+str(rec["attempts"][0]["ok"])+"|"+str(rec["attempts"][0]["file"])')"
check "second: Argon ok, fallback_from Carbon" "gemini-4-argon|True|gemini-4-carbon" "$(tq "$S" 'rec["attempts"][1]["requested"]+"|"+str(rec["attempts"][1]["ok"])+"|"+str(rec["attempts"][1]["fallback_from"])')"
mkf c9b; S="$(snap "$REPO/src/c9b.ts")"; mk "$TMP/ev/c9c" "$H_GEM_FAIL"; mk "$TMP/ev/c9a" "$H_GEM_ARGON"
okc "two files: a failed Carbon (--failed-run) and an ok Argon" python3 "$RR" tally --snapshot "$S" --kind finish --prompt-file "$PROMPT" "${REVS[@]}" --evidence "$TMP/ev/c9a" --failed-run "$TMP/ev/c9c" --no-defects
check "two attempt rows" 2 "$(tq "$S" 'len(rec["attempts"])')"
check "each row keeps its own requested/served/ok" "gemini-4-argon:gemini-4-argon:True,gemini-4-carbon:None:False" \
  "$(tq "$S" '",".join(sorted(a["requested"]+":"+str(a["served"])+":"+str(a["ok"]) for a in rec["attempts"]))')"

echo "[10] defect content store"
sid 10
mkf c10; S="$(snap "$REPO/src/c10.ts")"; mk "$TMP/ev/c10" "$H_GEM"
printf '[{"summary":"bug","file":"src/c10.ts","line":1,"state":"verified","raised_by":{"gemini":"HIGH"}}]' > "$TMP/d10.json"
EXPECT_SHA="$(shasum -a 256 "$REPO/src/c10.ts" | cut -d' ' -f1)"
setrev ok 'skipped (x)' 'skipped (x)' 'not triggered'
okc "tally with a defect on a file" python3 "$RR" tally --snapshot "$S" --kind finish --prompt-file "$PROMPT" "${REVS[@]}" --evidence "$TMP/ev/c10" --defects "$TMP/d10.json"
check "the defect's content is the file's sha256" "$EXPECT_SHA" "$(tq "$S" 'rec["defects"][0]["content"]')"
if cmp -s "$COMMON/.review-tally-content/$EXPECT_SHA" "$REPO/src/c10.ts"; then pass "the store holds the file's exact bytes"; else fail "the store holds the file's exact bytes"; fi
mkf c10b; S="$(snap "$REPO/src/c10b.ts")"; mk "$TMP/ev/c10b" "$H_GEM"
echo "export const changed = 1" > "$REPO/src/c10b.ts"
printf '[{"summary":"bug","file":"src/c10b.ts","line":1,"state":"verified","raised_by":{"gemini":"HIGH"}}]' > "$TMP/d10b.json"
okc "tally after the file changed since the snapshot" python3 "$RR" tally --snapshot "$S" --kind finish --prompt-file "$PROMPT" "${REVS[@]}" --evidence "$TMP/ev/c10b" --defects "$TMP/d10b.json"
check "...content is null" None "$(tq "$S" 'rec["defects"][0]["content"]')"

echo "[11] --abandoned"
sid 11
mkf c11a; SAB="$(snap "$REPO/src/c11a.ts")"
okc "abandon an untallied snapshot" python3 "$RR" tally --abandoned "$SAB" --reason x
check "status abandoned" abandoned "$(tq "$SAB" 'rec["status"]')"
mkf c11b; SRV="$(snap "$REPO/src/c11b.ts")"; mk "$TMP/ev/c11" "$H_GEM"
okc "a reviewed tally" tally_std "$SRV" "$TMP/ev/c11"
ref "abandoning a snapshot with a reviewed tally" "already has a reviewed tally" python3 "$RR" tally --abandoned "$SRV" --reason x
python3 -c 'import json,sys
for l in open(sys.argv[1]):
    try: r=json.loads(l)
    except Exception: continue
    if r.get("snapshot")==sys.argv[2]: print(l.strip())' "$TALLIES" "$(basename "$SAB")" > "$TMP/t11.tallies"
check "the report counts the abandoned round" 1 "$(python3 "$REPORT" --tallies "$TMP/t11.tallies" --json | python3 -c '
import json,sys
def find(o):
    if isinstance(o,dict):
        for k,v in o.items():
            if k=="abandoned": return v
            r=find(v)
            if r is not None: return r
    elif isinstance(o,list):
        for v in o:
            r=find(v)
            if r is not None: return r
print(find(json.load(sys.stdin)))')"

echo "[12] freshness round"
sid 12
mkf c12; S1="$(snap "$REPO/src/c12.ts")"; mk "$TMP/ev/c12a" "$H_GEM"
okc "first round tally" tally_std "$S1" "$TMP/ev/c12a"
check "...round is first" first "$(tq "$S1" 'rec["round"]')"
S2="$(snap "$REPO/src/c12.ts")"; mk "$TMP/ev/c12b" "$H_GEM"
okc "second round with --after the first" tally_std "$S2" "$TMP/ev/c12b" --after "$S1"
check "...round is freshness" freshness "$(tq "$S2" 'rec["round"]')"
check "...after names the first snapshot" "$(basename "$S1")" "$(tq "$S2" 'rec["after"]')"

echo "[13] the Reviewers line"
sid 13
mkf c13; S="$(snap "$REPO/src/c13.ts")"; mk "$TMP/ev/c13" "$H_GEM"; mk "$TMP/ev/c8f" "$H_GLM_FAIL"
printf '[{"summary":"bug","file":"src/c13.ts","line":1,"state":"verified","raised_by":{"gemini":"MEDIUM"}}]' > "$TMP/d13.json"
setrev ok 'failed (exit 4)' 'skipped (one file)' 'not triggered'
LINE="$(python3 "$RR" tally --snapshot "$S" --kind finish --prompt-file "$PROMPT" "${REVS[@]}" --evidence "$TMP/ev/c13" --failed-run "$TMP/ev/c8f" --defects "$TMP/d13.json" 2>/dev/null | grep '^Reviewers:')"
check "tally prints the Reviewers line from the record" "Reviewers: Gemini ok (1 findings, 1 verified, 0 unverified) · GLM failed (exit 4) · Codex skipped (one file) · Opus not triggered · 1 of 2 received" "$LINE"

echo "[14] control: deleting the tally of a real round re-opens the refusal"
sid 14
mkf c14; S1="$(snap "$REPO/src/c14.ts")"; mk "$TMP/ev/c14a" "$H_GEM"
okc "round 1 tallied" tally_std "$S1" "$TMP/ev/c14a"
okc "round 1 write passes" python3 "$RR" write --snapshot "$S1" --evidence "$TMP/ev/c14a"
S2="$(snap "$REPO/src/c14.ts")"; mk "$TMP/ev/c14b" "$H_GEM"
okc "round 2 tallied" tally_std "$S2" "$TMP/ev/c14b"
okc "round 2 write passes (the full round)" python3 "$RR" write --snapshot "$S2" --evidence "$TMP/ev/c14b"
python3 -c 'import json,sys
keep=[]
for l in open(sys.argv[1]):
    try: r=json.loads(l)
    except Exception: keep.append(l); continue
    if r.get("snapshot")!=sys.argv[2]: keep.append(l)
open(sys.argv[1],"w").write("".join(keep))' "$TALLIES" "$(basename "$S2")"
ref "after rewriting .review-tallies without round 2, write refuses again" "no tally" python3 "$RR" write --snapshot "$S2" --evidence "$TMP/ev/c14b"

echo "[15] Stop hook founder waiver (through the hook itself)"
N=0
edit_of() { N=$((N + 1)); printf '{"type":"assistant","message":{"content":[{"type":"tool_use","id":"t%s","name":"Edit","input":{"file_path":"%s"}}]}}' "$N$RANDOM" "$1"; }
say() { printf '{"type":"assistant","message":{"content":"%s"}}' "$1"; }
user() { printf '{"type":"user","message":{"content":"%s"}}' "$1"; }
transcript() { local f="$1"; shift; : > "$f"; for l in "$@"; do printf '%s\n' "$l" >> "$f"; done; }
# hook <transcript> <stdin session id>: the hook's environment carries NO session id, so the
# session it uses can only be the one in its stdin JSON.
hook() { echo "{\"transcript_path\":\"$1\",\"stop_hook_active\":false,\"session_id\":\"$2\"}" \
  | env -u CLAUDE_CODE_SESSION_ID CLAUDE_CONFIG_DIR="$TMP/cfg" python3 "$STOP_HOOK" >/dev/null 2>&1; }
hrc() { local a=0; hook "$@" || a=$?; echo "$a"; }
waived_receipts() { python3 -c 'import json,sys
n=0
for l in open(sys.argv[1]):
    try: r=json.loads(l)
    except Exception: continue
    if r.get("waived") and any(k.endswith("::src/"+sys.argv[2]) for k in r.get("files",{})): n+=1
print(n)' "$RECEIPTS" "$1"; }
waived_tallies() { python3 -c 'import json,sys
n=0
for l in open(sys.argv[1]):
    try: r=json.loads(l)
    except Exception: continue
    if r.get("status")=="waived" and r.get("snapshot")==sys.argv[2]: n+=1
print(n)' "$TALLIES" "$(basename "$2")"; }
sid 1
echo "export const x = 1" > "$REPO/src/x.ts"
SX="$(snap "$REPO/src/x.ts")"
TNW="$TMP/h_nowaive.jsonl"; transcript "$TNW" "$(user 'go')" "$(edit_of "$REPO/src/x.ts")" "$(say 'Done, committed.')"
check "CONTROL: without the founder's words the hook blocks the same edit" 2 "$(hrc "$TNW" t-sess-1)"
check "...and wrote no waiver" 0 "$(waived_receipts x.ts)"
TW="$TMP/h_waive.jsonl"; transcript "$TW" "$(user 'just commit it, skip review')" "$(edit_of "$REPO/src/x.ts")" "$(say 'Done, committed.')"
check "founder waiver: the hook passes the turn" 0 "$(hrc "$TW" t-sess-1)"
check "...a waiver record for the file is in .review-receipts" 1 "$(waived_receipts x.ts)"
check "...a waived tally record exists for the snapshot" 1 "$(waived_tallies x "$SX")"
check "...with the founder's words as the reason" "founder: just commit it, skip review" "$(tq "$SX" 'rec["reason"]')"
# Second: the tally store is unwritable, the waiver must still be recorded.
echo "export const x2 = 1" > "$REPO/src/x2.ts"
SX2="$(snap "$REPO/src/x2.ts")"
mv "$TALLIES" "$TALLIES.bak"; mkdir "$TALLIES"
TW2="$TMP/h_waive2.jsonl"; transcript "$TW2" "$(user 'just commit it, skip review')" "$(edit_of "$REPO/src/x2.ts")" "$(say 'Done, committed.')"
check "tally store unwritable: the hook still passes" 0 "$(hrc "$TW2" t-sess-1)"
check "...and the waiver is still in .review-receipts" 1 "$(waived_receipts x2.ts)"
rmdir "$TALLIES"; mv "$TALLIES.bak" "$TALLIES"
# Third: a different session id on stdin writes no waived tally for this session's snapshot.
echo "export const x3 = 1" > "$REPO/src/x3.ts"
SX3="$(snap "$REPO/src/x3.ts")"
TW3="$TMP/h_waive3.jsonl"; transcript "$TW3" "$(user 'just commit it, skip review')" "$(edit_of "$REPO/src/x3.ts")" "$(say 'Done, committed.')"
check "other session id on stdin: the hook still passes" 0 "$(hrc "$TW3" t-sess-other)"
check "...the waiver is recorded" 1 "$(waived_receipts x3.ts)"
check "...but no waived tally is written for another session's snapshot" 0 "$(waived_tallies x3 "$SX3")"

echo "[16] a pre-P1734 snapshot never blocks write, even with a session set"
sid 16
mkf c16; S="$(env -u CLAUDE_CODE_SESSION_ID python3 "$RR" snapshot -- "$REPO/src/c16.ts" 2>/dev/null)"
python3 -c 'import json,sys
b=json.load(open(sys.argv[1])); b.pop("session",None); b.pop("nonce",None)
json.dump(b,open(sys.argv[1],"w"),sort_keys=True)' "$S"
# Put it in this session's index, so only the body check (no session key) protects write.
mkdir -p "$COMMON/.review-snapshots/sessions"; echo "$S" >> "$COMMON/.review-snapshots/sessions/t-sess-16.txt"
sleep 1; mk "$TMP/ev/c16" "$H_GEM"
check "the hand-written snapshot has no session key" False "$(sj "$S" '"session" in b')"
okc "write passes with a session set" python3 "$RR" write --snapshot "$S" --evidence "$TMP/ev/c16"
SREAL="$(snap "$REPO/src/c16.ts")"
ref "CONTROL: a real snapshot of the same file by this session does block" "$(basename "$SREAL")" python3 "$RR" write --snapshot "$S" --evidence "$TMP/ev/c16"

# scount <snapshot> <status>: how many records of that status exist for the snapshot (tq reads only the LAST one).
scount() { python3 -c 'import json,sys
n=0
for l in open(sys.argv[1]):
    try: r=json.loads(l)
    except Exception: continue
    if r.get("snapshot")==sys.argv[2] and r.get("status")==sys.argv[3]: n+=1
print(n)' "$TALLIES" "$(basename "$1")" "$2"; }

echo "[17] write-once: a reviewed round is recorded once; reviewed supersedes abandoned; abandon twice refuses"
sid 17
mkf c17a; S="$(snap "$REPO/src/c17a.ts")"; mk "$TMP/ev/c17a" "$H_GEM"
okc "first reviewed tally" tally_std "$S" "$TMP/ev/c17a"
ref "a second reviewed tally of the same snapshot" "already has a reviewed tally" tally_std "$S" "$TMP/ev/c17a"
check "...still exactly one reviewed record" 1 "$(scount "$S" reviewed)"
mkf c17b; S="$(snap "$REPO/src/c17b.ts")"; mk "$TMP/ev/c17b" "$H_GEM"
okc "abandon a snapshot" python3 "$RR" tally --abandoned "$S" --reason x
okc "a reviewed tally over the abandoned snapshot supersedes it" tally_std "$S" "$TMP/ev/c17b"
check "...status is now reviewed" reviewed "$(tq "$S" 'rec["status"]')"
mkf c17c; S="$(snap "$REPO/src/c17c.ts")"
okc "CONTROL: abandon a fresh snapshot" python3 "$RR" tally --abandoned "$S" --reason x
ref "--abandoned twice on one snapshot" "is already closed as abandoned" python3 "$RR" tally --abandoned "$S" --reason y
check "...one abandoned record only" 1 "$(scount "$S" abandoned)"

echo "[18] abandoning another session's snapshot"
sid 18a; mkf c18; S="$(snap "$REPO/src/c18.ts")"
sid 18b
ref "abandon from another session" "abandon your own rounds only" python3 "$RR" tally --abandoned "$S" --reason x
check "...nothing recorded" 0 "$(scount "$S" abandoned)"
sid 18a
okc "CONTROL: the same abandon from the owning session" python3 "$RR" tally --abandoned "$S" --reason x

echo "[19] a waived tally never backs write; a reviewed tally supersedes it"
sid 19
mkf c19; S="$(snap "$REPO/src/c19.ts")"
TW19="$TMP/h19.jsonl"; transcript "$TW19" "$(user 'just commit it, skip review')" "$(edit_of "$REPO/src/c19.ts")" "$(say 'Done, committed.')"
check "founder waiver through the hook passes" 0 "$(hrc "$TW19" t-sess-19)"
check "...the snapshot got a waived record" 1 "$(scount "$S" waived)"
mk "$TMP/ev/c19" "$H_GEM"
ref "write on the waived snapshot" "was tallied as waived" python3 "$RR" write --snapshot "$S" --evidence "$TMP/ev/c19"
okc "a reviewed tally supersedes the waived one" tally_std "$S" "$TMP/ev/c19"
okc "the same write now passes" python3 "$RR" write --snapshot "$S" --evidence "$TMP/ev/c19"

echo "[20] hook waiver when every file already has a receipt (nothing missing)"
sid 20
mkf c20; S0="$(snap "$REPO/src/c20.ts")"; mk "$TMP/ev/c20a" "$H_GEM"
okc "round 0 tallied" tally_std "$S0" "$TMP/ev/c20a"
okc "round 0 written: the file now has a receipt" python3 "$RR" write --snapshot "$S0" --evidence "$TMP/ev/c20a"
check "...nothing is unreviewed" 0 "$(rc python3 "$RR" check "$REPO/src/c20.ts")"
S="$(snap "$REPO/src/c20.ts")"
TW20="$TMP/h20.jsonl"; transcript "$TW20" "$(user 'just commit it, skip review')" "$(edit_of "$REPO/src/c20.ts")" "$(say 'Done, committed.')"
check "founder waiver with nothing missing: the hook passes" 0 "$(hrc "$TW20" t-sess-20)"
check "...the open snapshot got its waived record" 1 "$(scount "$S" waived)"
mkf c20b; S0="$(snap "$REPO/src/c20b.ts")"; mk "$TMP/ev/c20b" "$H_GEM"
tally_std "$S0" "$TMP/ev/c20b" >/dev/null 2>&1; python3 "$RR" write --snapshot "$S0" --evidence "$TMP/ev/c20b" >/dev/null 2>&1
S="$(snap "$REPO/src/c20b.ts")"
TN20="$TMP/h20n.jsonl"; transcript "$TN20" "$(user 'go')" "$(edit_of "$REPO/src/c20b.ts")" "$(say 'Done, committed.')"
check "CONTROL: same flow without the founder words: the hook passes (receipt exists)" 0 "$(hrc "$TN20" t-sess-20)"
check "...and the open snapshot has no tally record" None "$(tq "$S" 'rec')"

echo "[21] hook waiver covers a spec .md"
sid 21
SPEC21="$REPO/features/p9_x.md"
printf -- '---\nstatus: week\n---\n# Spec x\n\nbody\n' > "$SPEC21"
S="$(snap "$SPEC21")"
TW21="$TMP/h21.jsonl"; transcript "$TW21" "$(user 'just commit it, skip review')" "$(edit_of "$SPEC21")" "$(say 'Done, committed.')"
check "founder waiver on a spec edit: the hook passes" 0 "$(hrc "$TW21" t-sess-21)"
check "...the spec snapshot got a waived record" 1 "$(scount "$S" waived)"

echo "[22] a waiver after a reviewed round is a note, deduplicated, and never replaces the round"
sid 22
mkf c22; S="$(snap "$REPO/src/c22.ts")"; mk "$TMP/ev/c22" "$H_GEM"
okc "round tallied reviewed" tally_std "$S" "$TMP/ev/c22"
TW22="$TMP/h22.jsonl"; transcript "$TW22" "$(user 'just commit it, skip review')" "$(edit_of "$REPO/src/c22.ts")" "$(say 'Done, committed.')"
check "founder waiver turn: the hook passes" 0 "$(hrc "$TW22" t-sess-22)"
check "...one waiver record for the snapshot" 1 "$(scount "$S" waiver)"
check "...the reviewed record is still there, once" 1 "$(scount "$S" reviewed)"
check "...tally --show --snapshot still shows the reviewed round" 1 "$(python3 "$RR" tally --show --snapshot "$S" 2>/dev/null | grep -c '^Reviewers:')"
okc "...write still passes on the reviewed round" python3 "$RR" write --snapshot "$S" --evidence "$TMP/ev/c22"
check "second run of the hook with the same transcript passes" 0 "$(hrc "$TW22" t-sess-22)"
check "...still exactly one waiver record (dedup)" 1 "$(scount "$S" waiver)"

echo "[23] a copied snapshot file is refused by write and tally"
sid 23
mkf c23a; S="$(snap "$REPO/src/c23a.ts")"; mk "$TMP/ev/c23a" "$H_GEM"
okc "tally the original" tally_std "$S" "$TMP/ev/c23a"
cp -p "$S" "$TMP/copy.json"   # -p: keep the mtime, so the evidence stays newer than the copy and only the store check can refuse
ref "write via a copy of a tallied snapshot" "is not in the snapshot store" python3 "$RR" write --snapshot "$TMP/copy.json" --evidence "$TMP/ev/c23a"
mkf c23b; S2="$(snap "$REPO/src/c23b.ts")"; mk "$TMP/ev/c23b" "$H_GEM"
cp -p "$S2" "$TMP/copy2.json"
ref "tally via a copy of an untallied snapshot" "is not in the snapshot store" tally_std "$TMP/copy2.json" "$TMP/ev/c23b"
check "...no tally was recorded for the copy's name" None "$(tq "$S2" 'rec')"
okc "CONTROL: write via the original path" python3 "$RR" write --snapshot "$S" --evidence "$TMP/ev/c23a"
okc "CONTROL: tally via the original path" tally_std "$S2" "$TMP/ev/c23b"

echo "[24] the same evidence run passed twice"
sid 24
mkf c24; S="$(snap "$REPO/src/c24.ts")"; mk "$TMP/ev/c24" "$H_GEM"; cp "$TMP/ev/c24" "$TMP/ev/c24copy"
setrev ok 'skipped (x)' 'skipped (x)' 'not triggered'
ref "--evidence E --evidence E" "is the same run as" python3 "$RR" tally --snapshot "$S" --kind finish --prompt-file "$PROMPT" "${REVS[@]}" --evidence "$TMP/ev/c24" --evidence "$TMP/ev/c24" --no-defects
ref "a byte-identical copy of E under another name" "is the same run as" python3 "$RR" tally --snapshot "$S" --kind finish --prompt-file "$PROMPT" "${REVS[@]}" --evidence "$TMP/ev/c24" "$TMP/ev/c24copy" --no-defects
okc "CONTROL: the single output is accepted" tally_std "$S" "$TMP/ev/c24"

echo "[25] a prompt file that is gone records its size as unknown"
sid 25
mkf c25; S="$(snap "$REPO/src/c25.ts")"; mk "$TMP/ev/c25" "$H_GEM"
setrev ok 'skipped (x)' 'skipped (x)' 'not triggered'
python3 "$RR" tally --snapshot "$S" --kind finish --prompt-file "$TMP/gone.md" "${REVS[@]}" --evidence "$TMP/ev/c25" --no-defects >/dev/null 2>"$TMP/c25.err"; c25=$?
check "tally with a missing prompt file succeeds" 0 "$c25"
check "...stderr carries WARNING" 1 "$(grep -c WARNING "$TMP/c25.err")"
check "...prompt bytes recorded as unknown" None "$(tq "$S" 'rec["prompt"]["bytes"]')"

echo "[26] the criteria peer is a valid defect raiser; an unknown reviewer is refused"
sid 26
mkf c26; S="$(snap "$REPO/src/c26.ts")"; mk "$TMP/ev/c26" "$H_GEM"
setrev ok 'skipped (x)' 'skipped (x)' 'not triggered'
printf '[{"summary":"x","file":"src/c26.ts","line":1,"state":"verified","raised_by":{"bogus":"HIGH"}}]' > "$TMP/d26bad.json"
printf '[{"summary":"x","file":"src/c26.ts","line":1,"state":"verified","raised_by":{"gemini":"HIGH","criteria":"HIGH"}}]' > "$TMP/d26ok.json"
T26=(python3 "$RR" tally --snapshot "$S" --kind finish --prompt-file "$PROMPT" "${REVS[@]}" --evidence "$TMP/ev/c26")
ref "raised_by naming an unknown reviewer (cmd_tally returns 1 for a ValueError)" "unknown reviewer" "${T26[@]}" --defects "$TMP/d26bad.json"
okc "CONTROL: raised_by gemini + criteria is accepted" "${T26[@]}" --defects "$TMP/d26ok.json"
check "...both raisers recorded" "['criteria', 'gemini']" "$(tq "$S" 'sorted(rec["defects"][0]["raised_by"])')"

echo "[27] defect line must be a line number"
sid 27
mkf c27; S="$(snap "$REPO/src/c27.ts")"; mk "$TMP/ev/c27" "$H_GEM"
setrev ok 'skipped (x)' 'skipped (x)' 'not triggered'
printf '[{"summary":"x","file":"src/c27.ts","line":0,"state":"verified","raised_by":{"gemini":"HIGH"}}]' > "$TMP/d27bad.json"
printf '[{"summary":"x","file":"src/c27.ts","line":1,"state":"verified","raised_by":{"gemini":"HIGH"}}]' > "$TMP/d27ok.json"
T27=(python3 "$RR" tally --snapshot "$S" --kind finish --prompt-file "$PROMPT" "${REVS[@]}" --evidence "$TMP/ev/c27")
ref "defect line 0" "line must be a line number" "${T27[@]}" --defects "$TMP/d27bad.json"
okc "CONTROL: defect line 1" "${T27[@]}" --defects "$TMP/d27ok.json"

echo "[28] the tally's head is the commit the snapshot saw, not the one at tally time"
sid 28
mkf c28; S="$(snap "$REPO/src/c28.ts")"; mk "$TMP/ev/c28" "$H_GEM"
git -C "$REPO" -c user.email=t@t -c user.name=t commit --allow-empty -qm x
NEWHEAD="$(git -C "$REPO" rev-parse HEAD)"
okc "tally after a new commit" tally_std "$S" "$TMP/ev/c28"
check "...head equals the snapshot's head" "$(sj "$S" 'b["head"]')" "$(tq "$S" 'rec["head"]')"
check "...and differs from the new HEAD" no "$([[ "$(tq "$S" 'rec["head"]')" == "$NEWHEAD" ]] && echo yes || echo no)"

echo "[29] option parsing"
sid 29
mkf c29; S="$(snap "$REPO/src/c29.ts")"
okc "--reason value that starts with --" python3 "$RR" tally --abandoned "$S" --reason "--quoted flag"
check "...stored verbatim" "--quoted flag" "$(tq "$S" 'rec["reason"]')"
showlast() { (cd "$REPO" && python3 "$RR" tally --show --last "$1"); }
check "tally --show --last 0 is a usage error" 2 "$(rc showlast 0)"
check "tally --show --last abc is a usage error" 2 "$(rc showlast abc)"
check "tally --show --last 1 is accepted" 0 "$(rc showlast 1)"

echo "[30] a write naming evidence recorded under another round's tally"
sid 30
mkf c30; S1="$(snap "$REPO/src/c30.ts")"; mk "$TMP/ev/c30a" "$H_GEM"
okc "round 1 tallied with E1" tally_std "$S1" "$TMP/ev/c30a"
S2="$(snap "$REPO/src/c30.ts")"; mk "$TMP/ev/c30b" "$H_GEM"
okc "round 2 tallied with E2" tally_std "$S2" "$TMP/ev/c30b"
touch "$TMP/ev/c30a"   # E1 is now newer than snapshot 2; its content (and hash) are unchanged
ref "write S2 with E1 + E2 names the round E1 belongs to" "recorded in $(basename "$S1")" python3 "$RR" write --snapshot "$S2" --evidence "$TMP/ev/c30a" "$TMP/ev/c30b"
okc "CONTROL: write S2 with E2 only" python3 "$RR" write --snapshot "$S2" --evidence "$TMP/ev/c30b"

echo; echo "=== Results: $PASS passed, $FAIL failed ==="
[ "$FAIL" -eq 0 ]
