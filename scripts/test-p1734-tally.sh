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
mk "$TMP/ev/c2b" "$H_GEM"
okc "tally the second with its own run" tally_std "$SB" "$TMP/ev/c2b"
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
S="$(python3 -c 'import json,sys,os,hashlib
b=json.load(open(sys.argv[1])); b.pop("session",None); b.pop("nonce",None)
blob=json.dumps(b,sort_keys=True); os.remove(sys.argv[1])
p=os.path.join(os.path.dirname(sys.argv[1]),hashlib.sha256(blob.encode()).hexdigest()[:16]+".json")
open(p,"w").write(blob); print(p)' "$S")"
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

echo "[31] round-2 fixes"
sid 31
mkf c31; S="$(snap "$REPO/src/c31.ts")"; mk "$TMP/ev/c31" "$H_GEM"
setrev ok 'skipped (x)' 'skipped (x)' 'not triggered'
T31=(python3 "$RR" tally --snapshot "$S" --kind finish --prompt-file "$PROMPT" "${REVS[@]}" --evidence "$TMP/ev/c31")
printf '[{"summary":"x","file":"src/c31.ts","line":1,"state":"verified","raised_by":{"gemini":"MEDIUM"},"severity":"HIGH"}]' > "$TMP/d31up.json"
printf '[{"summary":"x","file":"src/c31.ts","line":1,"state":"verified","raised_by":{"gemini":"HIGH"},"severity":"MEDIUM"}]' > "$TMP/d31down.json"
ref "triage cannot raise a severity above what a reviewer gave" "no higher than a reviewer gave" "${T31[@]}" --defects "$TMP/d31up.json"
okc "triage may uphold a lower severity than the reviewer gave" "${T31[@]}" --defects "$TMP/d31down.json"
check "...the upheld severity is recorded" MEDIUM "$(tq "$S" 'rec["defects"][0]["severity"]')"
# A failed Codex run never reached a model, so no served model is assumed for it.
H_CODEX_FAIL='ASK-MODEL: vendor=codex requested=gpt-6-codex verified=failed effort=low exit=1'
mkf c31b; S="$(snap "$REPO/src/c31b.ts")"; mk "$TMP/ev/c31b" "$H_GEM"; mk "$TMP/ev/c31cf" "$H_CODEX_FAIL"
setrev ok 'skipped (x)' 'failed (usage limit)' 'not triggered'
okc "tally with a failed Codex run" python3 "$RR" tally --snapshot "$S" --kind finish --prompt-file "$PROMPT" "${REVS[@]}" --evidence "$TMP/ev/c31b" --failed-run "$TMP/ev/c31cf" --no-defects
check "...the failed Codex row has no served model and none assumed" "None|False" "$(tq "$S" '[str(a["served"])+"|"+str(a["served_assumed"]) for a in rec["attempts"] if a["slot"]=="codex"][0]')"
# A caller with no session id cannot close or tally a round another session took.
mkf c31c; S="$(snap "$REPO/src/c31c.ts")"; mk "$TMP/ev/c31c" "$H_GEM"
ref "a sessionless caller cannot abandon a session's round" "abandon your own rounds only" env -u CLAUDE_CODE_SESSION_ID python3 "$RR" tally --abandoned "$S" --reason x
ref "a sessionless caller cannot tally a session's round" "tally your own rounds only" env -u CLAUDE_CODE_SESSION_ID python3 "$RR" tally --snapshot "$S" --kind finish --prompt-file "$PROMPT" "${REVS[@]}" --evidence "$TMP/ev/c31c" --no-defects
setrev ok 'skipped (x)' 'skipped (x)' 'not triggered'
okc "CONTROL: the session that took it tallies it" tally_std "$S" "$TMP/ev/c31c"
# --after reads the previous round's tally from that round's own store, and refuses a misplaced copy.
mkf c31d; S1="$(snap "$REPO/src/c31d.ts")"; mk "$TMP/ev/c31d1" "$H_GEM"
okc "first round tallied" tally_std "$S1" "$TMP/ev/c31d1"
cp -p "$S1" "$TMP/after-copy.json"
S2="$(snap "$REPO/src/c31d.ts")"; mk "$TMP/ev/c31d2" "$H_GEM"
ref "--after naming a copied snapshot is refused" "not in the snapshot store" tally_std "$S2" "$TMP/ev/c31d2" --after "$TMP/after-copy.json"
okc "CONTROL: --after naming the real snapshot" tally_std "$S2" "$TMP/ev/c31d2" --after "$S1"
# One founder message over a reviewed round is one waiver note, decided under the lock.
mkf c31e; S="$(snap "$REPO/src/c31e.ts")"; mk "$TMP/ev/c31e" "$H_GEM"
okc "a reviewed round" tally_std "$S" "$TMP/ev/c31e"
python3 -c 'import sys; sys.path.insert(0, sys.argv[1]); import review_receipt as rr
print(rr.tally_waived([sys.argv[2]], "founder: skip review", "t-sess-31"), rr.tally_waived([sys.argv[2]], "founder: skip review", "t-sess-31"))' "$SCRIPT_DIR" "$REPO/src/c31e.ts" > "$TMP/w31.out"
check "the first waiver writes one note, the repeat writes none" "1 0" "$(cat "$TMP/w31.out")"
check "...the round still closes as reviewed" reviewed "$(python3 -c 'import sys; sys.path.insert(0, sys.argv[1]); import review_receipt as rr
print(rr._tallies(sys.argv[2])[sys.argv[3]]["status"])' "$SCRIPT_DIR" "$COMMON" "$(basename "$S")")"

echo "[32] round-2 Opus fixes"
sid 32
# A snapshot carrying a session needs its own tally, whatever the caller's environment says.
mkf c32a; S="$(snap "$REPO/src/c32a.ts")"; mk "$TMP/ev/c32a" "$H_GEM"
ref "write with the session id unset, over an untallied session snapshot" "have no tally" env -u CLAUDE_CODE_SESSION_ID python3 "$RR" write --snapshot "$S" --evidence "$TMP/ev/c32a"
ref "write with another session id, over the same snapshot" "have no tally" env CLAUDE_CODE_SESSION_ID=t-sess-elsewhere python3 "$RR" write --snapshot "$S" --evidence "$TMP/ev/c32a"
okc "CONTROL: tallied by its session, the write passes" tally_std "$S" "$TMP/ev/c32a"
okc "...write" python3 "$RR" write --snapshot "$S" --evidence "$TMP/ev/c32a"
# An in-store copy under a new name of an abandoned snapshot backs nothing.
mkf c32b; S="$(snap "$REPO/src/c32b.ts")"; mk "$TMP/ev/c32b" "$H_GEM"
okc "abandon" python3 "$RR" tally --abandoned "$S" --reason x
cp -p "$S" "$COMMON/.review-snapshots/deadbeefdeadbeef.json"
ref "an in-store renamed copy of an abandoned snapshot backs no receipt" "is not named by its content" python3 "$RR" write --snapshot "$COMMON/.review-snapshots/deadbeefdeadbeef.json" --evidence "$TMP/ev/c32b"
rm -f "$COMMON/.review-snapshots/deadbeefdeadbeef.json"
# A symlinked snapshot file is refused; an aliased store directory resolves to the real one.
mkf c32c; S="$(snap "$REPO/src/c32c.ts")"; mk "$TMP/ev/c32c" "$H_GEM"
ln -s "$S" "$COMMON/.review-snapshots/linked.json"
ref "a symlinked snapshot file is refused" "is a link" tally_std "$COMMON/.review-snapshots/linked.json" "$TMP/ev/c32c"
rm -f "$COMMON/.review-snapshots/linked.json"
mkdir -p "$TMP/alias"; ln -s "$COMMON/.review-snapshots" "$TMP/alias/snaps"
okc "a tally through an aliased store directory" tally_std "$TMP/alias/snaps/$(basename "$S")" "$TMP/ev/c32c"
check "...lands in the real store, not beside the alias" "reviewed|absent" "$(tq "$S" 'rec["status"]')|$([ -e "$TMP/alias/.review-tallies" ] && echo present || echo absent)"
ref "...and write-once holds through the alias" "already has a reviewed tally" tally_std "$TMP/alias/snaps/$(basename "$S")" "$TMP/ev/c32c"
# Both floor vendors failed and were tallied; the founder said retry: the retry amends the round.
mkf c32d; S="$(snap "$REPO/src/c32d.ts")"; mk "$TMP/ev/c32df" "$H_GEM_FAIL"
setrev 'failed (exit 3)' 'skipped (x)' 'missing (quota)' 'not triggered'
okc "both floor vendors failed: the round is tallied first" python3 "$RR" tally --snapshot "$S" --kind finish --prompt-file "$PROMPT" "${REVS[@]}" --failed-run "$TMP/ev/c32df" --no-defects
mk "$TMP/ev/c32dok" "$H_GEM"
setrev ok 'skipped (x)' 'missing (quota)' 'not triggered'
rm -f "$TMP/ev/c32df"  # the same retry command overwrote its failed output
okc "the retry amends the round from its new output alone" python3 "$RR" tally --snapshot "$S" --kind finish --prompt-file "$PROMPT" "${REVS[@]}" --evidence "$TMP/ev/c32dok" --no-defects
check "...the failed run is carried into the amended record" "False,True" "$(tq "$S" '",".join(sorted(str(a["ok"]) for a in rec["attempts"]))')"
okc "...and the retry's output backs a receipt with no further reviewer run" python3 "$RR" write --snapshot "$S" --evidence "$TMP/ev/c32dok"
ref "a re-tally adding nothing is refused" "it adds nothing" python3 "$RR" tally --snapshot "$S" --kind finish --prompt-file "$PROMPT" "${REVS[@]}" --evidence "$TMP/ev/c32dok" --no-defects
setrev ok 'skipped (x)' 'skipped (quota)' 'not triggered'
ref "an amend that relabels a missing reviewer as skipped is refused" "it may only stay" python3 "$RR" tally --snapshot "$S" --kind finish --prompt-file "$PROMPT" "${REVS[@]}" --evidence "$TMP/ev/c32dok" --no-defects
# A waiver note goes only on a reviewed round that holds a file actually waived now.
mkf c32e; S="$(snap "$REPO/src/c32e.ts")"; mk "$TMP/ev/c32e" "$H_GEM"
okc "a fully reviewed round on c32e" tally_std "$S" "$TMP/ev/c32e"
python3 -c 'import sys; sys.path.insert(0, sys.argv[1]); import review_receipt as rr
print(rr.tally_waived([sys.argv[2], sys.argv[3]], "founder: for b skip review", "t-sess-32", waived=[sys.argv[3]]))' "$SCRIPT_DIR" "$REPO/src/c32e.ts" "$REPO/src/c32other.ts" > "$TMP/w32.out"
check "a waiver of another file writes no note on the clean round" 0 "$(cat "$TMP/w32.out")"
# The CLI waiver (the founder's own command) records its note too.
okc "CLI waive of c32e" python3 "$RR" waive --reason "founder: waive c32e" -- "$REPO/src/c32e.ts"
check "...writes a waiver note on its reviewed round" 1 "$(python3 -c 'import json,sys
print(sum(1 for l in open(sys.argv[1]) if (lambda r: r.get("snapshot")==sys.argv[2] and r.get("status")=="waiver")(json.loads(l))))' "$TALLIES" "$(basename "$S")")"

echo "[33] round-3 fixes"
sid 33
# An amend keeps everything recorded and adds something; Opus, with no output file, can be the addition.
mkf c33a; S="$(snap "$REPO/src/c33a.ts")"; mk "$TMP/ev/c33a" "$H_GEM"
printf '[{"summary":"x","file":"src/c33a.ts","line":1,"state":"verified","raised_by":{"gemini":"HIGH"}}]' > "$TMP/d33.json"
printf '[{"summary":"x","file":"src/c33a.ts","line":1,"state":"verified","raised_by":{"gemini":"HIGH"}},{"summary":"y","file":"src/c33a.ts","line":2,"state":"verified","raised_by":{"opus":"MEDIUM"}}]' > "$TMP/d33opus.json"
setrev ok 'skipped (x)' 'skipped (x)' 'missing (timed out)'
T33=(python3 "$RR" tally --snapshot "$S" --kind finish --prompt-file "$PROMPT")
okc "first tally: Opus timed out" "${T33[@]}" "${REVS[@]}" --evidence "$TMP/ev/c33a" --defects "$TMP/d33.json"
ref "an amend that drops a recorded defect is refused" "a recorded defect is missing" "${T33[@]}" --reviewer gemini=ok --reviewer 'glm=skipped (x)' --reviewer 'codex=skipped (x)' --reviewer opus=ok --evidence "$TMP/ev/c33a" --no-defects
ref "an amend that changes the kind is refused" "the kind and --after must stay the same" python3 "$RR" tally --snapshot "$S" --kind spec --prompt-file "$PROMPT" --reviewer gemini=ok --reviewer 'glm=skipped (x)' --reviewer 'codex=skipped (x)' --reviewer opus=ok --evidence "$TMP/ev/c33a" --defects "$TMP/d33opus.json"
okc "Opus landing late amends the round with no new output file" "${T33[@]}" --reviewer gemini=ok --reviewer 'glm=skipped (x)' --reviewer 'codex=skipped (x)' --reviewer opus=ok --evidence "$TMP/ev/c33a" --defects "$TMP/d33opus.json"
check "...the amended round holds both defects and Opus ok" "2|ok" "$(tq "$S" 'str(len(rec["defects"]))+"|"+rec["reviewers"]["opus"]')"
# A file-backed slot cannot turn failed without dropping its run (refused above); Opus has no file.
mkf c33e; S="$(snap "$REPO/src/c33e.ts")"; mk "$TMP/ev/c33e" "$H_GEM"; mk "$TMP/ev/c33e2" "$H_GEM"
T33E=(python3 "$RR" tally --snapshot "$S" --kind finish --prompt-file "$PROMPT" --reviewer gemini=ok --reviewer 'glm=skipped (x)' --reviewer 'codex=skipped (x)' --no-defects)
okc "a round with Opus ok" "${T33E[@]}" --reviewer opus=ok --evidence "$TMP/ev/c33e"
ref "an amend that turns Opus from ok to failed is refused, even with a new run" "it may only stay" "${T33E[@]}" --reviewer 'opus=failed (x)' --evidence "$TMP/ev/c33e" --evidence "$TMP/ev/c33e2"
# The CLI waiver notes only a file with no current receipt.
mkf c33b; S="$(snap "$REPO/src/c33b.ts")"; mk "$TMP/ev/c33b" "$H_GEM"
okc "reviewed and receipted" tally_std "$S" "$TMP/ev/c33b"
okc "...write" python3 "$RR" write --snapshot "$S" --evidence "$TMP/ev/c33b"
okc "CLI waive of a receipted file" python3 "$RR" waive --reason "founder: waive c33b" -- "$REPO/src/c33b.ts"
check "...writes no waiver note on its clean round" 0 "$(python3 -c 'import json,sys
print(sum(1 for l in open(sys.argv[1]) if (lambda r: r.get("snapshot")==sys.argv[2] and r.get("status")=="waiver")(json.loads(l))))' "$TALLIES" "$(basename "$S")")"
# The waiver's lock wait stops at its deadline.
mkf c33c; S="$(snap "$REPO/src/c33c.ts")"
python3 -c 'import fcntl,sys,time; f=open(sys.argv[1],"a+"); fcntl.flock(f,fcntl.LOCK_EX); open(sys.argv[2],"w").close(); time.sleep(4)' "$TALLIES" "$TMP/locked" &
LOCKPID=$!
for _ in $(seq 1 50); do [ -e "$TMP/locked" ] && break; sleep 0.1; done
python3 -c 'import sys,time; sys.path.insert(0, sys.argv[1]); import review_receipt as rr
t=time.monotonic()
try:
    rr.tally_waived([sys.argv[2]], "founder: skip", "t-sess-33", deadline=time.monotonic()+0.3); r="no-timeout"
except TimeoutError: r="timeout"
print(r, "fast" if time.monotonic()-t < 2 else "slow")' "$SCRIPT_DIR" "$REPO/src/c33c.ts" > "$TMP/w33.out"
check "a held tally lock makes the waiver give up at its deadline, and say so" "timeout fast" "$(cat "$TMP/w33.out")"
wait "$LOCKPID"
python3 -c 'import sys,time; sys.path.insert(0, sys.argv[1]); import review_receipt as rr
print(rr.tally_waived([sys.argv[2]], "founder: skip", "t-sess-33", deadline=time.monotonic()+5))' "$SCRIPT_DIR" "$REPO/src/c33c.ts" > "$TMP/w33b.out"
check "CONTROL: with the lock free the same waiver writes its record" 1 "$(cat "$TMP/w33b.out")"
# --show through a link to the snapshot finds the round.
mkf c33d; S="$(snap "$REPO/src/c33d.ts")"; mk "$TMP/ev/c33d" "$H_GEM"
okc "tallied" tally_std "$S" "$TMP/ev/c33d"
ln -s "$S" "$TMP/latest.json"
check "tally --show through a link prints the round" 1 "$(python3 "$RR" tally --show --snapshot "$TMP/latest.json" | grep -c '^Reviewers:')"

echo "[34] round-3 Opus fixes"
sid 34
# An amend cannot change a recorded defect's severity or raisers.
mkf c34a; S="$(snap "$REPO/src/c34a.ts")"; mk "$TMP/ev/c34a" "$H_GEM"; mk "$TMP/ev/c34a2" "$H_GEM"
printf '[{"summary":"x","file":"src/c34a.ts","line":1,"state":"verified","raised_by":{"gemini":"HIGH"}}]' > "$TMP/d34.json"
printf '[{"summary":"x","file":"src/c34a.ts","line":1,"state":"verified","raised_by":{"gemini":"LOW"}}]' > "$TMP/d34low.json"
T34=(python3 "$RR" tally --snapshot "$S" --kind finish --prompt-file "$PROMPT" --reviewer gemini=ok --reviewer 'glm=skipped (x)' --reviewer 'codex=skipped (x)' --reviewer 'opus=not triggered')
okc "a round with one HIGH" "${T34[@]}" --evidence "$TMP/ev/c34a" --defects "$TMP/d34.json"
ref "an amend that lowers a recorded raiser's severity is refused" "a recorded defect is missing or changed" "${T34[@]}" --evidence "$TMP/ev/c34a" --evidence "$TMP/ev/c34a2" --defects "$TMP/d34low.json"
okc "CONTROL: the same amend keeping the defect as recorded" "${T34[@]}" --evidence "$TMP/ev/c34a" --evidence "$TMP/ev/c34a2" --defects "$TMP/d34.json"
# A write over a snapshot another session id took names that session.
mkf c34b; S="$(snap "$REPO/src/c34b.ts")"; mk "$TMP/ev/c34b" "$H_GEM"
ref "write under a changed session id names the session that took the snapshot" "was taken by session t-sess-34" env CLAUDE_CODE_SESSION_ID=t-sess-other python3 "$RR" write --snapshot "$S" --evidence "$TMP/ev/c34b"
# A freshness round whose fix only added a file is still a freshness round.
mkf c34c; S1="$(snap "$REPO/src/c34c.ts")"; mk "$TMP/ev/c34c1" "$H_GEM"
okc "first round" tally_std "$S1" "$TMP/ev/c34c1"
mkf c34c_test; S2="$(snap "$REPO/src/c34c_test.ts")"; mk "$TMP/ev/c34c2" "$H_GEM"
okc "a freshness round over only the added file" tally_std "$S2" "$TMP/ev/c34c2" --after "$S1"
check "...is classed freshness" freshness "$(tq "$S2" 'rec["round"]')"
# A store directory that is itself a link keeps the tally in the git dir the snapshot names.
T2="$(mktemp -d)"; git init -q "$T2/r"; git -C "$T2/r" -c user.email=t@t -c user.name=t commit -q --allow-empty -m i
C2="$(git -C "$T2/r" rev-parse --path-format=absolute --git-common-dir)"; mkdir -p "$T2/ext/store" "$T2/r/src"
ln -s "$T2/ext/store" "$C2/.review-snapshots"; echo x > "$T2/r/src/l.ts"
SL="$(python3 "$RR" snapshot -- "$T2/r/src/l.ts" 2>/dev/null)"; sleep 1; mk "$TMP/ev/c34d" "$H_GEM"
okc "a tally through a linked store directory" tally_std "$SL" "$TMP/ev/c34d"
check "...lands in the snapshot's own git dir, not beside the link target" "present|absent" "$([ -e "$C2/.review-tallies" ] && echo present || echo absent)|$([ -e "$T2/ext/.review-tallies" ] && echo present || echo absent)"
ln -s "$SL" "$T2/latest.json"
check "tally --show through an alias into a linked store finds the round" 1 "$(python3 "$RR" tally --show --snapshot "$T2/latest.json" 2>&1 | grep -c "\"snapshot\": \"$(basename "$SL")\"")"
rm -rf "$T2"

echo "[35] round-4 fixes"
sid 35
# A reviewer that became ok joins a recorded defect and lifts its severity; its peer's run is carried.
mkf c35a; S="$(snap "$REPO/src/c35a.ts")"; mk "$TMP/ev/c35a" "$H_GEM"; mk "$TMP/ev/c35aglm" "$H_GLM"
printf '[{"summary":"y","file":"src/c35a.ts","line":1,"state":"verified","raised_by":{"gemini":"MEDIUM"}}]' > "$TMP/d35a.json"
printf '[{"summary":"y","file":"src/c35a.ts","line":1,"state":"verified","raised_by":{"gemini":"MEDIUM","glm":"HIGH"}}]' > "$TMP/d35aglm.json"
T35A=(python3 "$RR" tally --snapshot "$S" --kind finish --prompt-file "$PROMPT" --reviewer gemini=ok --reviewer 'codex=skipped (x)' --reviewer 'opus=not triggered')
okc "a round with GLM missing" "${T35A[@]}" --reviewer 'glm=missing (timeout)' --evidence "$TMP/ev/c35a" --defects "$TMP/d35a.json"
rm -f "$TMP/ev/c35a"  # the scratch output is gone by the time GLM lands
okc "GLM lands late, joins the defect at HIGH; Gemini's run is not re-passed" "${T35A[@]}" --reviewer glm=ok --evidence "$TMP/ev/c35aglm" --defects "$TMP/d35aglm.json"
check "...the amended defect is HIGH, raised by both" "HIGH|gemini,glm" "$(tq "$S" 'rec["defects"][0]["severity"]+"|"+",".join(sorted(rec["defects"][0]["raised_by"]))')"
check "...and the round holds both runs" 2 "$(tq "$S" 'sum(1 for a in rec["attempts"] if a["hash"])')"

# Only a reviewer that became ok may add to a round, and a criteria finding cannot arrive late.
mkf c35b; S="$(snap "$REPO/src/c35b.ts")"; mk "$TMP/ev/c35b" "$H_GEM"; mk "$TMP/ev/c35bglm" "$H_GLM"; mk "$TMP/ev/c35b2" "$H_GEM"
D35B='{"summary":"v","file":"src/c35b.ts","line":1,"state":"verified","raised_by":{"gemini":"MEDIUM"}}'
printf '[%s]' "$D35B" > "$TMP/d35b.json"
printf '[{"summary":"v","file":"src/c35b.ts","line":1,"state":"verified","raised_by":{"gemini":"MEDIUM","glm":"LOW"}}]' > "$TMP/d35bjoin.json"
printf '[%s,{"summary":"n","file":"src/c35b.ts","line":2,"state":"verified","raised_by":{"glm":"LOW"}}]' "$D35B" > "$TMP/d35bnew.json"
printf '[%s,{"summary":"n","file":"src/c35b.ts","line":2,"state":"verified","raised_by":{"criteria":"HIGH"}}]' "$D35B" > "$TMP/d35bcrit.json"
T35B=(python3 "$RR" tally --snapshot "$S" --kind finish --prompt-file "$PROMPT" --reviewer gemini=ok --reviewer glm=ok --reviewer 'codex=skipped (x)' --reviewer 'opus=not triggered')
okc "a round with Gemini and GLM ok" "${T35B[@]}" --evidence "$TMP/ev/c35b" --evidence "$TMP/ev/c35bglm" --defects "$TMP/d35b.json"
ref "a reviewer already ok cannot join a recorded defect in an amend" "only a reviewer that became ok may join" "${T35B[@]}" --evidence "$TMP/ev/c35b2" --defects "$TMP/d35bjoin.json"
ref "a reviewer already ok cannot raise a new defect in an amend" "a new defect may only come from a reviewer that became ok" "${T35B[@]}" --evidence "$TMP/ev/c35b2" --defects "$TMP/d35bnew.json"
ref "a criteria finding cannot be added in an amend" "a new defect may only come from a reviewer that became ok" "${T35B[@]}" --evidence "$TMP/ev/c35b2" --defects "$TMP/d35bcrit.json"
okc "CONTROL: the same amend with the defects as recorded" "${T35B[@]}" --evidence "$TMP/ev/c35b2" --defects "$TMP/d35b.json"

# One defect twice in a defects file.
mkf c35c; S="$(snap "$REPO/src/c35c.ts")"; mk "$TMP/ev/c35c" "$H_GEM"
printf '[{"summary":"z","file":"src/c35c.ts","line":2,"state":"verified","raised_by":{"gemini":"LOW"}},{"summary":"z","file":"src/c35c.ts","line":2,"state":"dropped","raised_by":{"gemini":"LOW"}}]' > "$TMP/d35dup.json"
setrev ok 'skipped (x)' 'skipped (x)' 'not triggered'
ref "a defects file holding one defect twice is refused" "the same summary, file and line" python3 "$RR" tally --snapshot "$S" --kind finish --prompt-file "$PROMPT" "${REVS[@]}" --evidence "$TMP/ev/c35c" --defects "$TMP/d35dup.json"

# A fallback output re-passed in an amend records its failed first try once, and adds nothing alone.
mkf c35d; S="$(snap "$REPO/src/c35d.ts")"; mk "$TMP/ev/c35dfb" "$H_GEM_FB"
T35D=(python3 "$RR" tally --snapshot "$S" --kind finish --prompt-file "$PROMPT" --reviewer gemini=ok --reviewer 'glm=skipped (x)' --reviewer 'codex=skipped (x)' --no-defects --evidence "$TMP/ev/c35dfb")
okc "a round whose Gemini run fell back, Opus missing" "${T35D[@]}" --reviewer 'opus=missing (x)'
ref "re-passing the fallback output alone adds nothing" "it adds nothing" "${T35D[@]}" --reviewer 'opus=missing (x)'
okc "Opus lands late, the fallback output re-passed" "${T35D[@]}" --reviewer opus=ok
check "...the failed Carbon try is recorded once" 1 "$(tq "$S" 'sum(1 for a in rec["attempts"] if a["requested"]=="gemini-4-carbon")')"

# A second failed try may reword the reason; the kind stays.
mkf c35e; S="$(snap "$REPO/src/c35e.ts")"; mk "$TMP/ev/c35e" "$H_GEM"
printf 'ASK-MODEL: vendor=codex requested=gpt-6-codex verified=failed effort=low exit=1\nusage limit %s\n' "$RANDOM$RANDOM" > "$TMP/ev/c35ecx"
printf 'ASK-MODEL: vendor=codex requested=gpt-6-codex verified=failed effort=low exit=1\ntimed out %s\n' "$RANDOM$RANDOM" > "$TMP/ev/c35ecx2"
T35E=(python3 "$RR" tally --snapshot "$S" --kind finish --prompt-file "$PROMPT" --reviewer gemini=ok --reviewer 'glm=skipped (x)' --reviewer 'opus=not triggered' --no-defects --evidence "$TMP/ev/c35e")
okc "a round with Codex failed on its usage limit" "${T35E[@]}" --reviewer 'codex=failed (usage limit)' --failed-run "$TMP/ev/c35ecx"
okc "a second failed Codex try with a reworded reason" "${T35E[@]}" --reviewer 'codex=failed (timeout)' --failed-run "$TMP/ev/c35ecx2"
check "...both failed tries are recorded" 2 "$(tq "$S" 'sum(1 for a in rec["attempts"] if a["slot"]=="codex")')"

# An amend after the fix keeps the content the defect was stored with.
mkf c35f; S="$(snap "$REPO/src/c35f.ts")"; mk "$TMP/ev/c35f" "$H_GEM"
printf '[{"summary":"w","file":"src/c35f.ts","line":1,"state":"verified","raised_by":{"gemini":"LOW"}}]' > "$TMP/d35f.json"
T35F=(python3 "$RR" tally --snapshot "$S" --kind finish --prompt-file "$PROMPT" --reviewer gemini=ok --reviewer 'glm=skipped (x)' --reviewer 'codex=skipped (x)' --evidence "$TMP/ev/c35f" --defects "$TMP/d35f.json")
okc "a round with a stored defect, Opus missing" "${T35F[@]}" --reviewer 'opus=missing (x)'
check "...its content is stored" True "$(tq "$S" 'bool(rec["defects"][0]["content"])')"
mkf c35f  # the fix lands
okc "Opus lands late, after the fix" "${T35F[@]}" --reviewer opus=ok
check "...the amended defect keeps its stored content" True "$(tq "$S" 'bool(rec["defects"][0]["content"])')"

# A waiver whose deadline passed before any store was written says so.
mkf c35g; S="$(snap "$REPO/src/c35g.ts")"
check "a waiver past its deadline before the first store raises, never returns quietly" timeout "$(python3 -c 'import sys,time; sys.path.insert(0, sys.argv[1]); import review_receipt as rr
try:
    rr.tally_waived([sys.argv[2]], "founder: skip", "t-sess-35", deadline=time.monotonic()-1); print("returned")
except TimeoutError: print("timeout")' "$SCRIPT_DIR" "$REPO/src/c35g.ts" 2>&1)"

# --after may link a reviewed round another session took, in the same worktree.
sid 35x; mkf c35h; S1="$(snap "$REPO/src/c35h.ts")"; mk "$TMP/ev/c35h1" "$H_GEM"
okc "session x reviews the first round" tally_std "$S1" "$TMP/ev/c35h1"
sid 35; S2="$(snap "$REPO/src/c35h.ts")"; mk "$TMP/ev/c35h2" "$H_GEM"
okc "a resumed session links its freshness round to it" tally_std "$S2" "$TMP/ev/c35h2" --after "$S1"
check "...classed freshness" freshness "$(tq "$S2" 'rec["round"]')"

# One output passed for two rounds is not refused (an identical rewrite of a file is a new run).
mkf c35i; S1="$(snap "$REPO/src/c35i.ts")"; S2="$(snap "$REPO/src/c35i.ts")"; mk "$TMP/ev/c35i" "$H_GEM"
okc "first round" tally_std "$S1" "$TMP/ev/c35i"
okc "second round with the same output" tally_std "$S2" "$TMP/ev/c35i"

# An in-store renamed copy is refused by tally and by the spec stamp.
mkf c35j; S="$(snap "$REPO/src/c35j.ts")"; RC="$(dirname "$S")/0123456789abcdef.json"; cp -p "$S" "$RC"; mk "$TMP/ev/c35j" "$H_GEM"
ref "tally of an in-store renamed copy is refused" "is not named by its content" tally_std "$RC" "$TMP/ev/c35j"
SPEC35="$REPO/features/p9_r4.md"; printf -- '---\nstatus: week\n---\n# Spec\n\nbody\n' > "$SPEC35"
SS="$(snap "$SPEC35")"; RCS="$(dirname "$SS")/fedcba9876543210.json"; cp -p "$SS" "$RCS"; mk "$TMP/ev/c35js" "$H_GEM"
ref "the spec stamp refuses an in-store renamed copy" "is not named by its content" python3 "$SPEC_STAMP" write "$SPEC35" --evidence "$TMP/ev/c35js" --snapshot "$RCS"
rm -f "$RC" "$RCS"

# The founder's waiver passes a turn whose scan runs out of time (through the hook's own function).
mkf c35k; SK="$(snap "$REPO/src/c35k.ts")"
TK="$TMP/h35.jsonl"; transcript "$TK" "$(user 'just commit it, skip review')" "$(edit_of "$REPO/src/c35k.ts")" "$(say 'Done, committed.')"
TKN="$TMP/h35n.jsonl"; transcript "$TKN" "$(user 'go')" "$(edit_of "$REPO/src/c35k.ts")" "$(say 'Done, committed.')"
hk_budget() { env -u CLAUDE_CODE_SESSION_ID CLAUDE_CONFIG_DIR="$TMP/cfg" python3 -c 'import importlib.util,sys
spec=importlib.util.spec_from_file_location("vbs", sys.argv[1]); m=importlib.util.module_from_spec(spec); spec.loader.exec_module(m)
m.REVIEW_TIME_BUDGET_S=0.0
m.session_edits=lambda t, d=None: ([sys.argv[3]], None)
e=list(m.iter_transcript(sys.argv[2]))
miss, inc = m.unreviewed_edits(sys.argv[2], e, "Done, committed.", "t-sess-35")
print("pass" if not miss and not inc else "block")' "$STOP_HOOK" "$1" "$REPO/src/c35k.ts" 2>/dev/null; }
check "a scan that runs out of time cannot refuse the founder's waiver" pass "$(hk_budget "$TK")"
check "CONTROL: without the waiver the same timed-out scan blocks" block "$(hk_budget "$TKN")"
check "...and the waived round is closed" 1 "$(waived_tallies c35k "$SK")"
check "...and the file the scan did not reach is waived in the receipt store" 0 "$(rc python3 "$RR" check "$REPO/src/c35k.ts")"
hk_norr() { env -u CLAUDE_CODE_SESSION_ID CLAUDE_CONFIG_DIR="$TMP/cfg" python3 -c 'import importlib.util,sys
spec=importlib.util.spec_from_file_location("vbs", sys.argv[1]); m=importlib.util.module_from_spec(spec); spec.loader.exec_module(m)
m.session_edits=lambda t, d=None: ([sys.argv[3]], "the transcript is too large")
m._load_receipts=lambda: None
e=list(m.iter_transcript(sys.argv[2]))
miss, inc = m.unreviewed_edits(sys.argv[2], e, "Done, committed.", "t-sess-35")
print("pass" if not miss and not inc else "block")' "$STOP_HOOK" "$1" "$REPO/src/c35k.ts" 2>/dev/null; }
check "an incomplete scan with no receipt helper cannot refuse the founder's waiver" pass "$(hk_norr "$TK")"
check "CONTROL: without the waiver the same incomplete scan blocks" block "$(hk_norr "$TKN")"

# Opus that was never spawned cannot turn ok in an amend; the summary counts carried runs.
mkf c35l; S="$(snap "$REPO/src/c35l.ts")"; mk "$TMP/ev/c35l" "$H_GEM"; mk "$TMP/ev/c35l2" "$H_GEM"
T35L=(python3 "$RR" tally --snapshot "$S" --kind finish --prompt-file "$PROMPT" --reviewer gemini=ok --reviewer 'glm=skipped (x)' --reviewer 'codex=skipped (x)' --no-defects)
okc "a round with Opus not triggered" "${T35L[@]}" --reviewer 'opus=not triggered' --evidence "$TMP/ev/c35l"
ref "an amend cannot turn an untriggered Opus ok" "it may become ok only after a failed or missing run" "${T35L[@]}" --reviewer opus=ok --evidence "$TMP/ev/c35l"
check "an amend's summary counts the carried run" 1 "$(python3 "$RR" tally --snapshot "$S" --kind finish --prompt-file "$PROMPT" --reviewer gemini=ok --reviewer 'glm=skipped (x)' --reviewer 'codex=skipped (x)' --reviewer 'opus=not triggered' --no-defects --evidence "$TMP/ev/c35l2" 2>&1 | grep -c '2 attempt(s)')"
# --after: same kind, and a previous round taken no later than this one.
mkf c35m; SM1="$(snap "$REPO/src/c35m.ts")"; SM2="$(snap "$REPO/src/c35m.ts")"; mk "$TMP/ev/c35m2" "$H_GEM"; mk "$TMP/ev/c35m1" "$H_GEM"
okc "the later round is tallied first" tally_std "$SM2" "$TMP/ev/c35m2"
ref "--after naming a round taken after this one is refused" "taken after this snapshot" tally_std "$SM1" "$TMP/ev/c35m1" --after "$SM2"
mkf c35n; SN1="$(snap "$REPO/src/c35n.ts")"; mk "$TMP/ev/c35n1" "$H_GEM"
setrev ok 'skipped (x)' 'skipped (x)' 'not triggered'
okc "a spec-kind round" python3 "$RR" tally --snapshot "$SN1" --kind spec --prompt-file "$PROMPT" "${REVS[@]}" --evidence "$TMP/ev/c35n1" --no-defects
SN2="$(snap "$REPO/src/c35n.ts")"; mk "$TMP/ev/c35n2" "$H_GEM"
ref "--after naming a round of another kind is refused" "names a spec round; this one is finish" tally_std "$SN2" "$TMP/ev/c35n2" --after "$SN1"

# A reviewer that became ok may lift a recorded severity, never lower it.
mkf c35o; S="$(snap "$REPO/src/c35o.ts")"; mk "$TMP/ev/c35o" "$H_GEM"; mk "$TMP/ev/c35oglm" "$H_GLM"
printf '[{"summary":"h","file":"src/c35o.ts","line":1,"state":"verified","raised_by":{"gemini":"HIGH"}}]' > "$TMP/d35o.json"
printf '[{"summary":"h","file":"src/c35o.ts","line":1,"state":"verified","severity":"LOW","raised_by":{"gemini":"HIGH","glm":"LOW"}}]' > "$TMP/d35olow.json"
printf '[{"summary":"h","file":"src/c35o.ts","line":1,"state":"verified","raised_by":{"gemini":"HIGH","glm":"LOW"}}]' > "$TMP/d35okeep.json"
T35O=(python3 "$RR" tally --snapshot "$S" --kind finish --prompt-file "$PROMPT" --reviewer gemini=ok --reviewer 'codex=skipped (x)' --reviewer 'opus=not triggered')
okc "a round with a HIGH defect, GLM missing" "${T35O[@]}" --reviewer 'glm=missing (x)' --evidence "$TMP/ev/c35o" --defects "$TMP/d35o.json"
ref "GLM joining at LOW cannot lower the recorded HIGH" "a recorded defect is missing or changed" "${T35O[@]}" --reviewer glm=ok --evidence "$TMP/ev/c35oglm" --defects "$TMP/d35olow.json"
okc "CONTROL: GLM joins at LOW and the HIGH stays" "${T35O[@]}" --reviewer glm=ok --evidence "$TMP/ev/c35oglm" --defects "$TMP/d35okeep.json"
check "...the defect is still HIGH" HIGH "$(tq "$S" 'rec["defects"][0]["severity"]')"

echo "[36] round-5 fixes"
sid 36
# A second Opus failure with its own reason is a second attempt; the same one again adds nothing.
mkf c36a; S="$(snap "$REPO/src/c36a.ts")"; mk "$TMP/ev/c36a" "$H_GEM"
T36A=(python3 "$RR" tally --snapshot "$S" --kind finish --prompt-file "$PROMPT" --reviewer gemini=ok --reviewer 'glm=skipped (x)' --reviewer 'codex=skipped (x)' --no-defects --evidence "$TMP/ev/c36a")
okc "a round with Opus failed on its quota" "${T36A[@]}" --reviewer 'opus=failed (quota)'
okc "a second Opus failure with its own reason" "${T36A[@]}" --reviewer 'opus=failed (timeout)'
check "...two Opus attempts are recorded" 2 "$(tq "$S" 'sum(1 for a in rec["attempts"] if a["slot"]=="opus")')"
ref "the same failure again adds nothing" "it adds nothing" "${T36A[@]}" --reviewer 'opus=failed (timeout)'
okc "Opus fails again with its first reason after a different one" "${T36A[@]}" --reviewer 'opus=failed (quota)'
check "...three Opus attempts" 3 "$(tq "$S" 'sum(1 for a in rec["attempts"] if a["slot"]=="opus")')"
okc "Opus then lands" "${T36A[@]}" --reviewer opus=ok
check "...four Opus attempts, the last ok" "4|True" "$(tq "$S" 'str(sum(1 for a in rec["attempts"] if a["slot"]=="opus"))+"|"+str([a for a in rec["attempts"] if a["slot"]=="opus"][-1]["ok"])')"

# A missing reviewer whose retry ran and failed may become failed, with that run only.
mkf c36b; S="$(snap "$REPO/src/c36b.ts")"; mk "$TMP/ev/c36b" "$H_GEM"
printf 'ASK-MODEL: vendor=codex requested=gpt-6-codex verified=failed effort=low exit=3\nerror %s\n' "$RANDOM$RANDOM" > "$TMP/ev/c36bcx"
T36B=(python3 "$RR" tally --snapshot "$S" --kind finish --prompt-file "$PROMPT" --reviewer gemini=ok --reviewer 'glm=skipped (x)' --reviewer 'opus=not triggered' --no-defects --evidence "$TMP/ev/c36b")
okc "a round with Codex missing" "${T36B[@]}" --reviewer 'codex=missing (timeout)'
ref "missing cannot become failed without the failed run" "it may become failed only with the failed run" "${T36B[@]}" --reviewer 'codex=failed (exit 3)'
okc "missing becomes failed with the failed run" "${T36B[@]}" --reviewer 'codex=failed (exit 3)' --failed-run "$TMP/ev/c36bcx"
check "...recorded as failed" "failed (exit 3)" "$(tq "$S" 'rec["reviewers"]["codex"]')"

# An amend keeps the prompt size recorded while the prompt existed.
mkf c36c; S="$(snap "$REPO/src/c36c.ts")"; mk "$TMP/ev/c36c" "$H_GEM"; P36="$TMP/p36.md"; echo "a prompt of some size" > "$P36"
T36C=(python3 "$RR" tally --snapshot "$S" --kind finish --prompt-file "$P36" --reviewer gemini=ok --reviewer 'glm=skipped (x)' --reviewer 'codex=skipped (x)' --no-defects --evidence "$TMP/ev/c36c")
okc "a round with its prompt, Opus missing" "${T36C[@]}" --reviewer 'opus=missing (x)'
rm -f "$P36"
okc "Opus lands after the prompt file is gone" "${T36C[@]}" --reviewer opus=ok 2>/dev/null
check "...the recorded prompt size is kept" 22 "$(tq "$S" 'rec["prompt"]["bytes"]')"

# A late defect in a file whose content the round already stored keeps that content after the fix.
mkf c36d; S="$(snap "$REPO/src/c36d.ts")"; mk "$TMP/ev/c36d" "$H_GEM"; mk "$TMP/ev/c36dglm" "$H_GLM"
D36='{"summary":"e","file":"src/c36d.ts","line":1,"state":"verified","raised_by":{"gemini":"LOW"}}'
printf '[%s]' "$D36" > "$TMP/d36d.json"
printf '[%s,{"summary":"late","file":"src/c36d.ts","line":1,"state":"verified","raised_by":{"glm":"MEDIUM"}}]' "$D36" > "$TMP/d36dlate.json"
T36D=(python3 "$RR" tally --snapshot "$S" --kind finish --prompt-file "$PROMPT" --reviewer gemini=ok --reviewer 'codex=skipped (x)' --reviewer 'opus=not triggered')
okc "a round with a defect stored, GLM missing" "${T36D[@]}" --reviewer 'glm=missing (x)' --evidence "$TMP/ev/c36d" --defects "$TMP/d36d.json"
mkf c36d  # the fix lands
okc "GLM lands with a new defect in the fixed file" "${T36D[@]}" --reviewer glm=ok --evidence "$TMP/ev/c36dglm" --defects "$TMP/d36dlate.json"
check "...the late defect keeps the stored content" True "$(tq "$S" 'rec["defects"][1]["content"] == rec["defects"][0]["content"] is not None')"

# A torn last line in the tally file does not swallow the next record.
mkf c36e; S="$(snap "$REPO/src/c36e.ts")"; mk "$TMP/ev/c36e" "$H_GEM"
printf '{"v":1,"ts":"2026-11-27T00:00:00Z","snapsh' >> "$TALLIES"
okc "a tally after a torn line" tally_std "$S" "$TMP/ev/c36e"
check "...is read back" reviewed "$(tq "$S" 'rec["status"]')"

echo "[37] round-6 fixes"
sid 37
# A failed Opus row recorded before outcomes were kept: a failure with another reason is a new attempt.
mkf c37a; S="$(snap "$REPO/src/c37a.ts")"; mk "$TMP/ev/c37a" "$H_GEM"
T37A=(python3 "$RR" tally --snapshot "$S" --kind finish --prompt-file "$PROMPT" --reviewer gemini=ok --reviewer 'glm=skipped (x)' --reviewer 'codex=skipped (x)' --no-defects --evidence "$TMP/ev/c37a")
okc "a round with Opus failed on its quota" "${T37A[@]}" --reviewer 'opus=failed (quota)'
python3 - "$TALLIES" "$(basename "$S")" <<'PYEOF'
import json, sys
p, base = sys.argv[1], sys.argv[2]
lines = open(p).read().splitlines()
out = []
for l in lines:
    try: r = json.loads(l)
    except Exception: out.append(l); continue
    if r.get("snapshot") == base:
        for a in r.get("attempts", []):
            if a.get("slot") == "opus": a.pop("outcome", None)
        l = json.dumps(r, separators=(",", ":"))
    out.append(l)
open(p, "w").write("\n".join(out) + "\n")
PYEOF
check "...the Opus row now has no outcome, as an old record does" False "$(tq "$S" '"outcome" in [a for a in rec["attempts"] if a["slot"]=="opus"][0]')"
okc "a failure with another reason over the old row" "${T37A[@]}" --reviewer 'opus=failed (timeout)'
check "...two Opus attempts" 2 "$(tq "$S" 'sum(1 for a in rec["attempts"] if a["slot"]=="opus")')"
ref "CONTROL: the same reason again adds nothing" "it adds nothing" "${T37A[@]}" --reviewer 'opus=failed (timeout)'

# A different prompt file that cannot be read does not inherit the first prompt's size.
mkf c37b; S="$(snap "$REPO/src/c37b.ts")"; mk "$TMP/ev/c37b" "$H_GEM"; P37="$TMP/p37.md"; echo "a prompt of some size" > "$P37"
T37B=(python3 "$RR" tally --snapshot "$S" --kind finish --reviewer gemini=ok --reviewer 'glm=skipped (x)' --reviewer 'codex=skipped (x)' --no-defects --evidence "$TMP/ev/c37b")
okc "a round with its prompt, Opus missing" "${T37B[@]}" --prompt-file "$P37" --reviewer 'opus=missing (x)'
head -c 21000 /dev/zero | tr '\0' x > "$P37"  # the scratch path is reused for a bigger prompt
okc "Opus lands, tallied with the reused prompt path" "${T37B[@]}" --prompt-file "$P37" --reviewer opus=ok
check "...the round keeps the prompt size it was sent with" 22 "$(tq "$S" 'rec["prompt"]["bytes"]')"

# A deleted file in the unscanned rest does not fail the waiver for the files that exist.
mkf c37d; S37D="$(snap "$REPO/src/c37d.ts")"; mkf c37d  # changed since its snapshot: unreviewed
T37D="$TMP/h37.jsonl"; transcript "$T37D" "$(user 'just commit it, skip review')" "$(edit_of "$REPO/src/c37d.ts")" "$(say 'Done, committed.')"
hk37() { env -u CLAUDE_CODE_SESSION_ID CLAUDE_CONFIG_DIR="$TMP/cfg" python3 -c 'import importlib.util,sys
spec=importlib.util.spec_from_file_location("vbs", sys.argv[1]); m=importlib.util.module_from_spec(spec); spec.loader.exec_module(m)
m.REVIEW_TIME_BUDGET_S=0.0
m.session_edits=lambda t, d=None: ([sys.argv[4], sys.argv[3]], None)
e=list(m.iter_transcript(sys.argv[2]))
miss, inc = m.unreviewed_edits(sys.argv[2], e, "Done, committed.", "t-sess-37")
print("pass" if not miss and not inc else "block")' "$STOP_HOOK" "$1" "$REPO/src/c37d.ts" "$REPO/src/c37gone.ts" 2>/dev/null; }
check "regression guard: a waived turn with a deleted file in the unscanned rest passes" pass "$(hk37 "$T37D")"
check "...and the file that exists is waived in the receipt store" 0 "$(rc python3 "$RR" check "$REPO/src/c37d.ts")"

# A torn last line does not swallow the founder's waiver record either.
mkf c37c; S="$(snap "$REPO/src/c37c.ts")"
printf '{"v":1,"ts":"2026-11-27T00:00:00Z","snapsh' >> "$TALLIES"
python3 -c 'import sys; sys.path.insert(0, sys.argv[1]); import review_receipt as rr
print(rr.tally_waived([sys.argv[2]], "founder: skip review", "t-sess-37"))' "$SCRIPT_DIR" "$REPO/src/c37c.ts" > "$TMP/w37.out" 2>&1
check "a waiver after a torn line is read back" waived "$(tq "$S" 'rec["status"]')"

echo "[38] round-6 fixes, second batch"
sid 38
cnt() { python3 -c 'import json,sys
n=0
for l in open(sys.argv[1]):
    try: r=json.loads(l)
    except Exception: continue
    n += r.get("snapshot")==sys.argv[2] and r.get("status")==sys.argv[3]
print(n)' "$TALLIES" "$(basename "$1")" "$2"; } # <snapshot> <status>
hk38() { # <transcript> <budget> <paths returned> <incomplete reason or "">
  env -u CLAUDE_CODE_SESSION_ID CLAUDE_CONFIG_DIR="$TMP/cfg" python3 -c 'import importlib.util,sys,os
spec=importlib.util.spec_from_file_location("vbs", sys.argv[1]); m=importlib.util.module_from_spec(spec); spec.loader.exec_module(m)
m.REVIEW_TIME_BUDGET_S=float(sys.argv[3])
m.session_edits=lambda t, d=None: (sys.argv[4].split(","), sys.argv[5] or None)
os.chdir(sys.argv[6])
e=list(m.iter_transcript(sys.argv[2]))
miss, inc = m.unreviewed_edits(sys.argv[2], e, "Done, committed.", "t-sess-38")
print("pass" if not miss and not inc else "block")' "$STOP_HOOK" "$1" "$2" "$3" "$4" "$REPO" 2>/dev/null; }
# An incomplete edit scan under a waiver closes every open round this session took, and waives its files.
mkf c38a; mkf c38b; SA38="$(snap "$REPO/src/c38a.ts")"; SB38="$(snap "$REPO/src/c38b.ts")"
T38="$TMP/h38.jsonl"; transcript "$T38" "$(user 'just commit it, skip review')" "$(edit_of "$REPO/src/c38a.ts")" "$(say 'Done, committed.')"
check "a waived turn over a scan that stopped early passes" pass "$(hk38 "$T38" 6 "$REPO/src/c38a.ts" "the time budget ran out")"
check "...the round it reached is closed as waived" 1 "$(cnt "$SA38" waived)"
check "...and so is the round past the scan" 1 "$(cnt "$SB38" waived)"
check "...but the file past the scan is not receipt-waived (it may be another session's)" 1 "$(rc python3 "$RR" check "$REPO/src/c38b.ts")"
check "...and the waive CLI now accepts it" 0 "$(rc python3 "$RR" waive --reason "founder: skip review" -- "$REPO/src/c38b.ts")"
mkf c38c; SC38="$(snap "$REPO/src/c38c.ts")"
T38N="$TMP/h38n.jsonl"; transcript "$T38N" "$(user 'just commit it, skip review')" "$(edit_of "$REPO/src/c38a.ts")" "$(say 'Done, committed.')"
mkf c38a; check "CONTROL: a waived turn over a complete scan closes only the rounds of its files" "pass|0" "$(hk38 "$T38N" 6 "$REPO/src/c38a.ts" "")|$(cnt "$SC38" waived)"

# A file waived unclassified, whose reviewed round's content changed, gets the round's waiver note.
mkf c38d; SD38="$(snap "$REPO/src/c38d.ts")"; mk "$TMP/ev/c38d" "$H_GEM"
okc "a reviewed round" tally_std "$SD38" "$TMP/ev/c38d"
okc "...with its receipt" python3 "$RR" write --snapshot "$SD38" --evidence "$TMP/ev/c38d"
mkf c38d  # fixed after review
T38D="$TMP/h38d.jsonl"; transcript "$T38D" "$(user 'just commit it, skip review')" "$(edit_of "$REPO/src/c38d.ts")" "$(say 'Done, committed.')"
check "a waived turn whose classify loop ran out of time passes" pass "$(hk38 "$T38D" 0 "$REPO/src/c38d.ts" "")"
check "...and the reviewed round gets its waiver note" 1 "$(cnt "$SD38" waiver)"

# A receipt store that cannot be read still lets the founder's waiver record its tally.
mkf c38e; SE38="$(snap "$REPO/src/c38e.ts")"
T38E="$TMP/h38e.jsonl"; transcript "$T38E" "$(user 'just commit it, skip review')" "$(edit_of "$REPO/src/c38e.ts")" "$(say 'Done, committed.')"
mv "$COMMON/.review-receipts" "$TMP/receipts.bak"; mkdir "$COMMON/.review-receipts"
R38E="$(hk38 "$T38E" 6 "$REPO/src/c38e.ts" "")"
rmdir "$COMMON/.review-receipts"; mv "$TMP/receipts.bak" "$COMMON/.review-receipts"
check "a waived turn whose receipt store cannot be read passes" pass "$R38E"
check "...and its round is still closed as waived" 1 "$(cnt "$SE38" waived)"

# A late joiner lifts a triaged severity no higher than its own rating.
mkf c38f; S="$(snap "$REPO/src/c38f.ts")"; mk "$TMP/ev/c38f" "$H_GEM"; mk "$TMP/ev/c38fglm" "$H_GLM"
printf '[{"summary":"t","file":"src/c38f.ts","line":1,"state":"verified","severity":"LOW","raised_by":{"gemini":"HIGH"}}]' > "$TMP/d38f.json"
printf '[{"summary":"t","file":"src/c38f.ts","line":1,"state":"verified","raised_by":{"gemini":"HIGH","glm":"LOW"}}]' > "$TMP/d38fup.json"
printf '[{"summary":"t","file":"src/c38f.ts","line":1,"state":"verified","severity":"LOW","raised_by":{"gemini":"HIGH","glm":"LOW"}}]' > "$TMP/d38fkeep.json"
T38F=(python3 "$RR" tally --snapshot "$S" --kind finish --prompt-file "$PROMPT" --reviewer gemini=ok --reviewer 'codex=skipped (x)' --reviewer 'opus=not triggered')
okc "a HIGH triaged to LOW, GLM missing" "${T38F[@]}" --reviewer 'glm=missing (x)' --evidence "$TMP/ev/c38f" --defects "$TMP/d38f.json"
ref "GLM joining at LOW cannot lift it back to HIGH" "a recorded defect is missing or changed" "${T38F[@]}" --reviewer glm=ok --evidence "$TMP/ev/c38fglm" --defects "$TMP/d38fup.json"
okc "CONTROL: GLM joins at LOW and the triage stays" "${T38F[@]}" --reviewer glm=ok --evidence "$TMP/ev/c38fglm" --defects "$TMP/d38fkeep.json"

# A torn last line in the session index does not hide the next snapshot from the waive refusal.
mkf c38g; printf '/torn/path/without/newl' >> "$COMMON/.review-snapshots/sessions/t-sess-38.txt"
S="$(snap "$REPO/src/c38g.ts")"
ref "waive refuses this session's untallied round after a torn index line" "have no tally" python3 "$RR" waive --reason "x" -- "$REPO/src/c38g.ts"

echo "[39] round-7 fixes"
sid 39
# A waived turn whose scan returned no path at all, run from the repo root, still closes the open round.
mkf c39a; SA39="$(snap "$REPO/src/c39a.ts")"
T39="$TMP/h39.jsonl"; transcript "$T39" "$(user 'just commit it, skip review')" "$(say 'Done, committed.')"
R39="$(env -u CLAUDE_CODE_SESSION_ID CLAUDE_CONFIG_DIR="$TMP/cfg" python3 -c 'import importlib.util,sys,os
spec=importlib.util.spec_from_file_location("vbs", sys.argv[1]); m=importlib.util.module_from_spec(spec); spec.loader.exec_module(m)
m.session_edits=lambda t, d=None: ([], "the time budget ran out")
os.chdir(sys.argv[3])
e=list(m.iter_transcript(sys.argv[2]))
miss, inc = m.unreviewed_edits(sys.argv[2], e, "Done, committed.", "t-sess-39")
print("pass" if not miss and not inc else "block")' "$STOP_HOOK" "$T39" "$REPO" 2>/dev/null)"
check "a waived turn whose scan found nothing, from the repo root, passes" pass "$R39"
check "...and closes the session's open round as waived" 1 "$(cnt "$SA39" waived)"
check "...so the waive CLI accepts its file" 0 "$(rc python3 "$RR" waive --reason "founder: skip review" -- "$REPO/src/c39a.ts")"

# A complete scan never receipt-waives a file the round holds that this session did not edit.
mkf c39m; mkf c39cot; SM39="$(snap "$REPO/src/c39m.ts" "$REPO/src/c39cot.ts")"
T39M="$TMP/h39m.jsonl"; transcript "$T39M" "$(user 'just commit mine, skip review')" "$(edit_of "$REPO/src/c39m.ts")" "$(say 'Done, committed.')"
R39M="$(env -u CLAUDE_CODE_SESSION_ID CLAUDE_CONFIG_DIR="$TMP/cfg" python3 -c 'import importlib.util,sys,os
spec=importlib.util.spec_from_file_location("vbs", sys.argv[1]); m=importlib.util.module_from_spec(spec); spec.loader.exec_module(m)
m.session_edits=lambda t, d=None: ([sys.argv[4]], None)
os.chdir(sys.argv[3])
e=list(m.iter_transcript(sys.argv[2]))
miss, inc = m.unreviewed_edits(sys.argv[2], e, "Done, committed.", "t-sess-39")
print("pass" if not miss and not inc else "block")' "$STOP_HOOK" "$T39M" "$REPO" "$REPO/src/c39m.ts" 2>/dev/null)"
check "a waived turn over a round that also holds another session's file passes" "pass|1" "$R39M|$(cnt "$SM39" waived)"
check "...its own file is waived" 0 "$(rc python3 "$RR" check "$REPO/src/c39m.ts")"
check "...the other session's file is not" 1 "$(rc python3 "$RR" check "$REPO/src/c39cot.ts")"

# A torn last line in the receipts file does not swallow the next receipt.
mkf c39t; printf '{"ts":"2026-11-27T00:00:00Z","files":{"x' >> "$COMMON/.review-receipts"
okc "a waiver receipt after a torn receipts line" python3 "$RR" waive --reason "x" -- "$REPO/src/c39t.ts"
check "...is read back" 0 "$(rc python3 "$RR" check "$REPO/src/c39t.ts")"

# A file replaced by a link after the round stored its content: a late defect keeps that content.
mkf c39b; S="$(snap "$REPO/src/c39b.ts")"; mk "$TMP/ev/c39b" "$H_GEM"; mk "$TMP/ev/c39bglm" "$H_GLM"
D39='{"summary":"e","file":"src/c39b.ts","line":1,"state":"verified","raised_by":{"gemini":"LOW"}}'
printf '[%s]' "$D39" > "$TMP/d39b.json"
printf '[%s,{"summary":"late","file":"src/c39b.ts","line":1,"state":"verified","raised_by":{"glm":"MEDIUM"}}]' "$D39" > "$TMP/d39blate.json"
T39B=(python3 "$RR" tally --snapshot "$S" --kind finish --prompt-file "$PROMPT" --reviewer gemini=ok --reviewer 'codex=skipped (x)' --reviewer 'opus=not triggered')
okc "a round with a defect stored, GLM missing" "${T39B[@]}" --reviewer 'glm=missing (x)' --evidence "$TMP/ev/c39b" --defects "$TMP/d39b.json"
mkf c39btarget; rm -f "$REPO/src/c39b.ts"; ln -s c39btarget.ts "$REPO/src/c39b.ts"
okc "GLM lands after the file became a link" "${T39B[@]}" --reviewer glm=ok --evidence "$TMP/ev/c39bglm" --defects "$TMP/d39blate.json"
check "...the late defect keeps the snapshotted content" True "$(tq "$S" 'rec["defects"][1]["content"] == rec["defects"][0]["content"] is not None')"

echo "[40] round-8 fixes"
sid 40
hk40() { # <transcript> <session id or ""> <path>: the classify loop and the waiver tail are both out of time
  env -u CLAUDE_CODE_SESSION_ID CLAUDE_CONFIG_DIR="$TMP/cfg" python3 -c 'import importlib.util,sys,os
spec=importlib.util.spec_from_file_location("vbs", sys.argv[1]); m=importlib.util.module_from_spec(spec); spec.loader.exec_module(m)
m.REVIEW_TIME_BUDGET_S=0.0; m.WAIVER_TAIL_DEADLINE_S=0.0
m.session_edits=lambda t, d=None: ([sys.argv[4]], "the time budget ran out")
os.chdir(sys.argv[5])
e=list(m.iter_transcript(sys.argv[2]))
miss, inc = m.unreviewed_edits(sys.argv[2], e, "Done, committed.", sys.argv[3] or None)
print("pass" if not miss and not inc else "block")' "$STOP_HOOK" "$1" "$2" "$3" "$REPO"; }
# Past the tail deadline, a file waived unclassified still gives its reviewed round the waiver note.
mkf c40a; SA40="$(snap "$REPO/src/c40a.ts")"; mk "$TMP/ev/c40a" "$H_GEM"
okc "a reviewed round" tally_std "$SA40" "$TMP/ev/c40a"
okc "...with its receipt" python3 "$RR" write --snapshot "$SA40" --evidence "$TMP/ev/c40a"
mkf c40a  # fixed after review
T40="$TMP/h40.jsonl"; transcript "$T40" "$(user 'just commit it, skip review')" "$(edit_of "$REPO/src/c40a.ts")" "$(say 'Done, committed.')"
check "a waived turn past the tail deadline passes" pass "$(hk40 "$T40" t-sess-40 "$REPO/src/c40a.ts" 2>/dev/null)"
check "...the file is waived" 0 "$(rc python3 "$RR" check "$REPO/src/c40a.ts")"
check "...and its reviewed round gets the waiver note" 1 "$(cnt "$SA40" waiver)"
# With no session id the tally never runs, so the note does not claim the rounds were closed.
mkf c40b; T40B="$TMP/h40b.jsonl"; transcript "$T40B" "$(user 'just commit it, skip review')" "$(edit_of "$REPO/src/c40b.ts")" "$(say 'Done, committed.')"
hk40 "$T40B" "" "$REPO/src/c40b.ts" > "$TMP/h40b.out" 2> "$TMP/h40b.err"
check "a waived turn with no session id passes" pass "$(cat "$TMP/h40b.out")"
check "...and its note says the rounds were not closed" "1|0" "$(grep -c 'were not closed' "$TMP/h40b.err")|$(grep -c 'are closed as waived' "$TMP/h40b.err")"
# The next turn, whose scan reaches a file the founder's waiver left past the scan, does not block on it.
mkf c40d; SD40="$(snap "$REPO/src/c40d.ts")"
T40D="$TMP/h40d.jsonl"; transcript "$T40D" "$(user 'just commit it, skip review')" "$(edit_of "$REPO/src/c40d.ts")" "$(say 'Done, committed.')"
hk40d() { # <transcript> <session id> <paths returned> <incomplete reason or "">
  env -u CLAUDE_CODE_SESSION_ID CLAUDE_CONFIG_DIR="$TMP/cfg" python3 -c 'import importlib.util,sys,os
spec=importlib.util.spec_from_file_location("vbs", sys.argv[1]); m=importlib.util.module_from_spec(spec); spec.loader.exec_module(m)
m.session_edits=lambda t, d=None: ([q for q in sys.argv[4].split(",") if q], sys.argv[5] or None)
os.chdir(sys.argv[6])
e=list(m.iter_transcript(sys.argv[2]))
miss, inc = m.unreviewed_edits(sys.argv[2], e, "Done, committed.", sys.argv[3])
print("pass" if not miss and not inc else "block")' "$STOP_HOOK" "$1" "$2" "$3" "$4" "$REPO" 2>/dev/null; }
check "the founder's turn, whose scan reached nothing, passes" pass "$(hk40d "$T40D" t-sess-40 "" "the time budget ran out")"
check "...its round is closed as waived, its file not receipt-waived" "1|1" "$(cnt "$SD40" waived)|$(rc python3 "$RR" check "$REPO/src/c40d.ts")"
T40E="$TMP/h40e.jsonl"; transcript "$T40E" "$(user 'what is next?')" "$(edit_of "$REPO/src/c40d.ts")" "$(say 'Done, committed.')"
check "the next turn, whose scan reaches the file, does not block on it" pass "$(hk40d "$T40E" t-sess-40 "$REPO/src/c40d.ts" "")"
check "CONTROL: another session's gate still blocks on it" block "$(hk40d "$T40E" t-sess-40other "$REPO/src/c40d.ts" "")"
echo "export const c40d = 'edited after the waiver'" > "$REPO/src/c40d.ts"  # content the founder did not waive
check "CONTROL: once the file changes again, the next turn blocks" block "$(hk40d "$T40E" t-sess-40 "$REPO/src/c40d.ts" "")"

# The tail deadline counts from the hook's start: 15 s after it, the tally gets the 0.5 s floor
# even though unreviewed_edits itself has only just started.
mkf c40f; T40F="$TMP/h40f.jsonl"; transcript "$T40F" "$(user 'just commit it, skip review')" "$(edit_of "$REPO/src/c40f.ts")" "$(say 'Done, committed.')"
D40F() { env -u CLAUDE_CODE_SESSION_ID CLAUDE_CONFIG_DIR="$TMP/cfg" python3 -c 'import importlib.util,sys,os,time
spec=importlib.util.spec_from_file_location("vbs", sys.argv[1]); m=importlib.util.module_from_spec(spec); spec.loader.exec_module(m)
m.HOOK_START=time.monotonic()-float(sys.argv[5])
m.session_edits=lambda t, d=None: ([sys.argv[3]], None)
seen=[]
rr=m._load_receipts()
real=rr.tally_waived
def spy(*a, **k):
    seen.append(k["deadline"]-time.monotonic()); return real(*a, **k)
rr.tally_waived=spy
os.chdir(sys.argv[4])
e=list(m.iter_transcript(sys.argv[2]))
m.unreviewed_edits(sys.argv[2], e, "Done, committed.", "t-sess-40")
print("floor" if seen and 0 < seen[0] <= 0.6 else "full" if seen and seen[0] > 4.0 else "other:%s" % seen)' "$STOP_HOOK" "$T40F" "$REPO/src/c40f.ts" "$REPO" "$1" 2>/dev/null; }
check "15 s after the hook's start, the tally gets only the 0.5 s floor" floor "$(D40F 15)"
check "CONTROL: at the hook's start, the tally gets its full 5 s" full "$(D40F 0)"

# One unreadable entry skips only its snapshot; past its deadline the lookup returns what it found.
SID40="$CLAUDE_CODE_SESSION_ID"; sid 40g; mkf c40g; mkf c40h; mkf c40i; SG40="$(snap "$REPO/src/c40g.ts" "$REPO/src/c40i.ts")"; SH40="$(snap "$REPO/src/c40h.ts")"
python3 -c 'import sys; sys.path.insert(0, sys.argv[1]); import review_receipt as rr
rr.tally_waived([sys.argv[2], sys.argv[3], sys.argv[4]], "founder: skip review", "t-sess-40g")' "$SCRIPT_DIR" "$REPO/src/c40g.ts" "$REPO/src/c40h.ts" "$REPO/src/c40i.ts"
FW40="$(python3 -c 'import sys, time; sys.path.insert(0, sys.argv[1]); import review_receipt as rr
real = rr.fingerprint
def fp(p):
    if p.endswith("c40g.ts"): raise PermissionError("unreadable")
    return real(p)
rr.fingerprint = fp
got = rr.founder_waived([sys.argv[2], sys.argv[3], sys.argv[4]], "t-sess-40g")
late = rr.founder_waived([sys.argv[3]], "t-sess-40g", deadline=time.monotonic() - 1)
print("%s|%s" % (",".join(sorted(q.rsplit("/", 1)[1] for q in got)), len(late)))' "$SCRIPT_DIR" "$REPO/src/c40g.ts" "$REPO/src/c40h.ts" "$REPO/src/c40i.ts")"
check "an unreadable file is not matched, its sibling in the same snapshot is; a past deadline matches nothing" "c40h.ts,c40i.ts|0" "$FW40"
chmod 000 "$REPO/src/c40g.ts"
FWR="$(python3 -c 'import sys; sys.path.insert(0, sys.argv[1]); import review_receipt as rr
n = [0]; real = rr._tallies
def count(c):
    n[0] += 1; return real(c)
rr._tallies = count
got = rr.founder_waived(sys.argv[2:], "t-sess-40g")
print("%s|%d" % (",".join(sorted(q.rsplit("/", 1)[1] for q in got)), n[0]))' "$SCRIPT_DIR" "$REPO/src/c40g.ts" "$REPO/src/c40h.ts" "$REPO/src/c40i.ts")"
chmod 644 "$REPO/src/c40g.ts"
check "a really unreadable file is not matched; two waived rounds in one store parse its tally once" "c40h.ts,c40i.ts|1" "$FWR"
# The hook hands founder_waived the tail deadline counted from its own start.
T40J="$TMP/h40j.jsonl"; transcript "$T40J" "$(edit_of "$REPO/src/c40h.ts")" "$(say 'Done, committed.')"
DJ40="$(env -u CLAUDE_CODE_SESSION_ID CLAUDE_CONFIG_DIR="$TMP/cfg" python3 -c 'import importlib.util,sys,os,time
spec=importlib.util.spec_from_file_location("vbs", sys.argv[1]); m=importlib.util.module_from_spec(spec); spec.loader.exec_module(m)
m.HOOK_START=time.monotonic()-100.0
m.session_edits=lambda t, d=None: ([sys.argv[3]], None)
rr=m._load_receipts(); seen=[]
def spy(files, session, deadline=None):
    seen.append(deadline); return []
rr.founder_waived=spy
os.chdir(sys.argv[4])
e=list(m.iter_transcript(sys.argv[2]))
m.unreviewed_edits(sys.argv[2], e, "Done, committed.", "t-sess-40g")
print("past" if seen and seen[0] is not None and seen[0] < time.monotonic() else "got:%s" % seen)' "$STOP_HOOK" "$T40J" "$REPO/src/c40h.ts" "$REPO" 2>/dev/null)"
check "the hook passes founder_waived the deadline counted from its own start" past "$DJ40"
# Two repos: the second repo's session index is unreadable; the first repo's waiver still holds.
REPO2="$TMP/repo2"; mkdir -p "$REPO2/src"; git -C "$REPO2" init -q
echo "export const seed2 = 1" > "$REPO2/src/seed.ts"; git -C "$REPO2" add src/seed.ts
git -C "$REPO2" -c user.email=t@t -c user.name=t commit -qm init; REPO2="$(cd "$REPO2" && pwd -P)"
sid 40k; mkf c40k; echo "export const d40k = 1" > "$REPO2/src/d40k.ts"
snap "$REPO/src/c40k.ts" >/dev/null; snap "$REPO2/src/d40k.ts" >/dev/null
python3 -c 'import sys; sys.path.insert(0, sys.argv[1]); import review_receipt as rr
rr.tally_waived(sys.argv[2:], "founder: skip review", "t-sess-40k")' "$SCRIPT_DIR" "$REPO/src/c40k.ts" "$REPO2/src/d40k.ts"
FWK() { python3 -c 'import sys; sys.path.insert(0, sys.argv[1]); import review_receipt as rr
print(",".join(sorted(q.rsplit("/", 1)[1] for q in rr.founder_waived(sys.argv[2:], "t-sess-40k"))))' "$SCRIPT_DIR" "$REPO/src/c40k.ts" "$REPO2/src/d40k.ts"; }
check "two repos, both readable: both files excused" "c40k.ts,d40k.ts" "$(FWK)"
chmod 000 "$REPO2"/.git/.review-snapshots/sessions/*.txt
check "the second repo's index is unreadable: only the first repo's file is excused" "c40k.ts" "$(FWK)"
chmod 644 "$REPO2"/.git/.review-snapshots/sessions/*.txt
export CLAUDE_CODE_SESSION_ID="$SID40"
export CLAUDE_CODE_SESSION_ID="$SID40"

# Two unrelated rounds on one file the same day, with no --after, are both first rounds.
mkf c40c; S40C1="$(snap "$REPO/src/c40c.ts")"; mk "$TMP/ev/c40c1" "$H_GEM"
okc "a first round on c40c" tally_std "$S40C1" "$TMP/ev/c40c1"
mkf c40c; S40C2="$(snap "$REPO/src/c40c.ts")"; mk "$TMP/ev/c40c2" "$H_GEM"
okc "an unrelated round on c40c the same day" tally_std "$S40C2" "$TMP/ev/c40c2"
check "...both are first rounds" "first|first" "$(tq "$S40C1" 'rec["round"]')|$(tq "$S40C2" 'rec["round"]')"

echo; echo "=== Results: $PASS passed, $FAIL failed ==="
[ "$FAIL" -eq 0 ]
