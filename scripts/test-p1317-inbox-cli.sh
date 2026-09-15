#!/usr/bin/env bash
# P1317 — the inbox CLI's write guarantees, against synthetic stores only.
#
#   1. two concurrent `add`s get two distinct, consecutive IDs, each occurring once
#   2. CONTROL: with the lock disabled and the same forced interleaving, the IDs collide
#      (proves check 1 passes because of the lock, not because the race never happened)
#   3. a hand-written ID above the counter is detected and the counter raised
#   4. deleting an earlier entry leaves a later entry's ID unchanged
#   5. `resolve`-style delete removes exactly the named entry, and rejects an ID in a tombstone
#   6. a private-store add never emits a public-shaped ID, and a tombstone cannot carry INBOX-P
#
# Exit 0 only when every check passes.
set -uo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CLI="$ROOT/scripts/inbox.sh"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT
FAILS=0

pass() { printf 'PASS  %s\n' "$1"; }
fail() { printf 'FAIL  %s\n' "$1"; FAILS=$((FAILS + 1)); }

new_store() {
  cat > "$1" <<'EOF'
# Process Learnings

**Next ID:** 5

---

## Existing entry

**ID:** INBOX-4
**Status:** proposed
**due:** week

Body.

---
EOF
}

count_id() { grep -c "^\*\*ID:\*\* $2\$" "$1" || true; }

# ── 1. concurrent adds under the lock ───────────────────────────────────────
S="$TMP/concurrent.md"; new_store "$S"
INBOX_TEST_DELAY_MS=400 "$CLI" add --file "$S" --kind public --title "left" <<< "left body" > "$TMP/a.out" 2> "$TMP/a.err" &
INBOX_TEST_DELAY_MS=400 "$CLI" add --file "$S" --kind public --title "right" <<< "right body" > "$TMP/b.out" 2> "$TMP/b.err" &
wait
A="$(cat "$TMP/a.out")"; B="$(cat "$TMP/b.out")"
PAIR="$(printf '%s\n%s\n' "$A" "$B" | sort -t- -k2 -n | tr '\n' ' ')"
if [ "$PAIR" = "INBOX-5 INBOX-6 " ] && [ "$(count_id "$S" INBOX-5)" = 1 ] && [ "$(count_id "$S" INBOX-6)" = 1 ] \
   && grep -q '^\*\*Next ID:\*\* 7$' "$S"; then
  pass "concurrent adds → distinct consecutive IDs ($PAIR), each once, counter 7"
else
  fail "concurrent adds → got '$PAIR'; stderr: $(cat "$TMP/a.err" "$TMP/b.err")"
fi

# ── 2. control: same interleaving WITHOUT the lock must collide ─────────────
S="$TMP/control.md"; new_store "$S"
INBOX_TEST_NO_LOCK=1 INBOX_TEST_DELAY_MS=400 "$CLI" add --file "$S" --kind public --title "left" <<< "x" > "$TMP/c.out" 2>/dev/null &
INBOX_TEST_NO_LOCK=1 INBOX_TEST_DELAY_MS=400 "$CLI" add --file "$S" --kind public --title "right" <<< "y" > "$TMP/d.out" 2>/dev/null &
wait
C="$(cat "$TMP/c.out")"; D="$(cat "$TMP/d.out")"
if [ -n "$C$D" ] && { [ "$C" = "$D" ] || [ "$(grep -c '^## ' "$S")" -lt 3 ]; }; then
  pass "control: without the lock the race loses an entry or reuses an ID (c='$C' d='$D', entries=$(grep -c '^## ' "$S"))"
else
  fail "control did not reproduce the race (c='$C' d='$D') — check 1 proves nothing"
fi

# ── 3. hand-written ID above the counter ────────────────────────────────────
S="$TMP/behind.md"; new_store "$S"
printf '\n## Hand-written\n\n**ID:** INBOX-20\n**Status:** proposed\n\n---\n' >> "$S"
OUT="$("$CLI" add --file "$S" --kind public --title "after hand edit" <<< "z" 2> "$TMP/behind.err")"
if [ "$OUT" = "INBOX-21" ] && grep -q 'raised to 21' "$TMP/behind.err" && grep -q '^\*\*Next ID:\*\* 22$' "$S"; then
  pass "counter behind a hand-written ID is detected and raised (new $OUT, counter 22)"
else
  fail "counter raise: got '$OUT', stderr '$(cat "$TMP/behind.err")'"
fi
if "$CLI" check --file "$S" --kind public > /dev/null; then pass "store is clean after the raise"; else fail "check reports problems after the raise"; fi

# ── 4. deleting an earlier entry renumbers nothing ──────────────────────────
S="$TMP/stable.md"; new_store "$S"
"$CLI" add --file "$S" --kind public --title "later" <<< "later body" > /dev/null
"$CLI" delete --file "$S" --kind public INBOX-4 > /dev/null
if [ "$(count_id "$S" INBOX-4)" = 0 ] && [ "$(count_id "$S" INBOX-5)" = 1 ] \
   && "$CLI" locate --file "$S" --kind public INBOX-5 > /dev/null; then
  pass "deleting INBOX-4 leaves INBOX-5 unchanged and locatable"
else
  fail "delete renumbered or lost an entry"
fi

# ── 5. delete targets exactly one entry; tombstone rules ────────────────────
S="$TMP/resolve.md"; new_store "$S"
"$CLI" add --file "$S" --kind public --title "keep me" <<< "k" > /dev/null
"$CLI" add --file "$S" --kind public --title "resolve me" <<< "r" > /dev/null
"$CLI" delete --file "$S" --kind public INBOX-6 --tombstone 'Resolved 2026-09-15: "resolve me" — see decisions.md' > /dev/null
if ! grep -q '^## resolve me$' "$S" && grep -q '^## keep me$' "$S" && grep -q '^## Existing entry$' "$S" \
   && grep -q '^<!-- Resolved 2026-09-15: "resolve me" — see decisions.md -->$' "$S"; then
  pass "delete INBOX-6 removed only that entry and left its tombstone"
else
  fail "delete touched the wrong entries"
fi
if "$CLI" delete --file "$S" --kind public INBOX-5 --tombstone 'Dropped: was INBOX-5' 2>/dev/null; then
  fail "a tombstone carrying an ID was accepted"
else
  pass "a tombstone carrying an ID is refused"
fi
if "$CLI" delete --file "$S" --kind public INBOX-99 2>/dev/null; then fail "unknown ID delete exited 0"; else pass "unknown ID delete is refused"; fi

# ── 6. private store: IDs and tombstones ────────────────────────────────────
P="$TMP/private.md"
OUT="$("$CLI" add --file "$P" --kind private --title "private one" <<< "p")"
if [ "$OUT" = "INBOX-P1" ] && grep -q '^\*\*Next ID:\*\* 2$' "$P"; then
  pass "a missing private store is created and gets INBOX-P1"
else
  fail "private add: got '$OUT'"
fi
if "$CLI" delete --file "$P" --kind private INBOX-P1 --tombstone 'Promoted INBOX-P1' 2>/dev/null; then
  fail "a private tombstone carrying INBOX-P was accepted"
else
  pass "a private tombstone carrying INBOX-P is refused"
fi
if "$CLI" delete --file "$P" --kind private INBOX-1 2>/dev/null; then fail "a public-shaped ID was accepted for the private store"; else pass "a public-shaped ID is refused for the private store"; fi

# ── 7. a lock left by a dead process is taken over at once ──────────────────
S="$TMP/deadlock.md"; new_store "$S"
mkdir "$S.lock"; (sleep 0 & echo "$! deadtoken" > "$S.lock/owner"; wait)   # a pid that has already exited
START=$(date +%s)
OUT="$("$CLI" add --file "$S" --kind public --title "after a crash" <<< "c" 2>/dev/null)"; RC=$?
ELAPSED=$(( $(date +%s) - START ))
if [ $RC -eq 0 ] && [ "$OUT" = "INBOX-5" ] && [ "$ELAPSED" -lt 10 ] && [ ! -d "$S.lock" ]; then
  pass "a dead owner's lock is taken over immediately (${ELAPSED}s, got $OUT)"
else
  fail "dead-owner lock: rc=$RC out='$OUT' elapsed=${ELAPSED}s"
fi
# control: a lock held by a LIVE process is respected (times out, never stolen)
S="$TMP/livelock.md"; new_store "$S"
mkdir "$S.lock"; echo "$$ livetoken" > "$S.lock/owner"
if "$CLI" add --file "$S" --kind public --title "must wait" <<< "w" > /dev/null 2>&1; then
  fail "a live owner's lock was stolen"
else
  pass "a live owner's lock is respected (add refused after the timeout)"
fi
rm -rf "$S.lock"

# ── 8. review findings: tombstones survive, mode survives, no private ID in public notes ──
S="$TMP/tombs.md"; new_store "$S"
"$CLI" add --file "$S" --kind public --title "second" <<< "s" > /dev/null
"$CLI" add --file "$S" --kind public --title "third" <<< "t" > /dev/null
"$CLI" delete --file "$S" --kind public INBOX-5 --tombstone 'Dropped 2026-09-15: "second" — test' > /dev/null
"$CLI" delete --file "$S" --kind public INBOX-4 > /dev/null   # the entry ABOVE that tombstone
if grep -q '^<!-- Dropped 2026-09-15: "second" — test -->$' "$S" && grep -q '^## third$' "$S" && ! grep -q '^## Existing entry$' "$S"; then
  pass "deleting the entry above a tombstone leaves the tombstone in place"
else
  fail "a neighbouring tombstone was removed by delete"
fi
S="$TMP/mode.md"; new_store "$S"; chmod 600 "$S"
"$CLI" add --file "$S" --kind public --title "mode" <<< "m" > /dev/null
MODE="$(stat -f '%Lp' "$S")"
if [ "$MODE" = "600" ]; then pass "a 600 store stays 600 after a write"; else fail "store mode changed to $MODE"; fi
S="$TMP/leak.md"; new_store "$S"
if "$CLI" add --file "$S" --kind public --title "names a private note" <<< "see INBOX-P3" 2>/dev/null; then
  fail "a public note carrying an INBOX-P token was accepted"
else
  pass "a public note carrying an INBOX-P token is refused"
fi
S="$TMP/crlf.md"; new_store "$S"; sed -i '' 's/$/\r/' "$S"
if [ "$("$CLI" count --file "$S" --kind public | cut -f2)" = "open 1" ]; then pass "a CRLF store is counted, not read as empty"; else fail "CRLF store count: $("$CLI" count --file "$S" --kind public)"; fi
ls "$TMP"/.*.inbox.tmp > /dev/null 2>&1 && fail "a temp file was left behind" || pass "no temp files left behind"

# ── 9. Codex review findings: unparseable entries are not mutated; backfill refuses bad IDs ──
S="$TMP/unparseable.md"; new_store "$S"
printf '\n## Closed in place\n\n**ID:** INBOX-9\n**Status:** CLOSED 2026-09-01\n\nOutcome text worth keeping.\n\n---\n' >> "$S"
BEFORE="$(shasum "$S")"
if "$CLI" delete --file "$S" --kind public INBOX-9 2>/dev/null || "$CLI" annotate --file "$S" --kind public INBOX-9 --text "x" 2>/dev/null; then
  fail "delete or annotate acted on an unparseable entry"
elif [ "$(shasum "$S")" = "$BEFORE" ]; then
  pass "delete and annotate refuse an unparseable entry and leave the file byte-identical"
else
  fail "the store changed although the mutation was refused"
fi
S="$TMP/badid.md"; new_store "$S"
printf '\n## Malformed ID\n\n**ID:** INBOX-X\n**Status:** proposed\n\n---\n' >> "$S"
BEFORE="$(shasum "$S")"
if "$CLI" backfill --file "$S" --kind public > /dev/null 2>&1; then
  fail "backfill exited 0 with a malformed ID in the store"
elif [ "$(shasum "$S")" = "$BEFORE" ]; then
  pass "backfill refuses a malformed ID and writes nothing"
else
  fail "backfill wrote although it refused"
fi
# a lock held by a LIVE owner is never reclaimed on age alone
S="$TMP/oldlive.md"; new_store "$S"
mkdir "$S.lock"; echo "$$ faketoken" > "$S.lock/owner"; touch -t 202601010000 "$S.lock"
if "$CLI" add --file "$S" --kind public --title "must not steal" <<< "w" > /dev/null 2>&1; then
  fail "a months-old lock held by a live process was reclaimed"
else
  pass "an old lock held by a live process is not reclaimed"
fi
rm -rf "$S.lock"

echo
if [ "$FAILS" -eq 0 ]; then echo "ALL CHECKS PASSED"; exit 0; fi
echo "$FAILS CHECK(S) FAILED"; exit 1
