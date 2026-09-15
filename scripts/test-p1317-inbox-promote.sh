#!/usr/bin/env bash
# P1317 — `/create-spec <note-ID>` promotion protocol, against synthetic stores only.
#
#   1. a clean promote deletes exactly the note, after the spec exists
#   2. a promote with no spec on disk deletes nothing
#   3. a forced delete failure prints PROMOTION INCOMPLETE, exits 1, and the note is still open
#   4. a spec carrying an inbox ID token is refused before anything is deleted
#   5. a private promote never prints the INBOX-P token or the private counter value
#
# Exit 0 only when every check passes.
set -uo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PROMOTE="$ROOT/scripts/inbox-promote.sh"
CLI="$ROOT/scripts/inbox.sh"
TMP="$(mktemp -d)"
trap 'chmod -R u+w "$TMP" 2>/dev/null; rm -rf "$TMP"' EXIT
FAILS=0
pass() { printf 'PASS  %s\n' "$1"; }
fail() { printf 'FAIL  %s\n' "$1"; FAILS=$((FAILS + 1)); }

store() {
  # $2 is the store's ID prefix as written in a token: "INBOX" (public) or "INBOX-P" (private).
  local PFX; if [ "$2" = INBOX ]; then PFX="INBOX-"; else PFX="$2"; fi
  mkdir -p "$(dirname "$1")"
  cat <<EOF | sed "s/@ID@-/$PFX/g" > "$1"
# Store

**Next ID:** 9

---

## Keep this one

**ID:** @ID@-7
**Status:** proposed

---

## Promote this one

**ID:** @ID@-8
**Status:** proposed

---
EOF
}
spec() { mkdir -p "$(dirname "$1")"; printf -- '---\nstatus: backlog\n---\n# P9999: promoted work\n\nBody without any inbox token.\n' > "$1"; }

# ── 1. clean promote ────────────────────────────────────────────────────────
S="$TMP/one/store.md"; store "$S" INBOX; SP="$TMP/one/p9999_x.md"; spec "$SP"
OUT="$(INBOX_PROMOTE_FILE="$S" "$PROMOTE" INBOX-8 "$SP")"; RC=$?
if [ $RC -eq 0 ] && ! grep -q '^\*\*ID:\*\* INBOX-8$' "$S" && grep -q '^\*\*ID:\*\* INBOX-7$' "$S" && [ -s "$SP" ]; then
  pass "clean promote: note INBOX-8 deleted, INBOX-7 kept, spec intact ($OUT)"
else
  fail "clean promote: rc=$RC out='$OUT'"
fi

# ── 2. no spec, nothing deleted ─────────────────────────────────────────────
S="$TMP/two/store.md"; store "$S" INBOX
INBOX_PROMOTE_FILE="$S" "$PROMOTE" INBOX-8 "$TMP/two/missing.md" > /dev/null 2>&1; RC=$?
if [ $RC -ne 0 ] && grep -q '^\*\*ID:\*\* INBOX-8$' "$S"; then
  pass "missing spec: refused (rc=$RC) and the note is untouched"
else
  fail "missing spec: rc=$RC, note present=$(grep -c '^\*\*ID:\*\* INBOX-8$' "$S")"
fi

# ── 3. forced delete failure ────────────────────────────────────────────────
S="$TMP/three/store.md"; store "$S" INBOX; SP="$TMP/three-spec/p9999_x.md"; spec "$SP"
chmod a-w "$TMP/three"   # the CLI writes via temp file + rename in this directory
OUT="$(INBOX_PROMOTE_FILE="$S" "$PROMOTE" INBOX-8 "$SP")"; RC=$?
chmod u+w "$TMP/three"
if [ $RC -eq 1 ] && [ "$OUT" = "PROMOTION INCOMPLETE: $SP created, INBOX-8 still open (delete failed)" ] \
   && grep -q '^\*\*ID:\*\* INBOX-8$' "$S" && [ -s "$SP" ]; then
  pass "forced delete failure: PROMOTION INCOMPLETE reported, exit 1, note still open, spec kept"
else
  fail "forced delete failure: rc=$RC out='$OUT'"
fi

# ── 4. spec carrying an ID token ────────────────────────────────────────────
S="$TMP/four/store.md"; store "$S" INBOX; SP="$TMP/four/p9999_x.md"; spec "$SP"
printf 'Promoted from INBOX-8.\n' >> "$SP"
INBOX_PROMOTE_FILE="$S" "$PROMOTE" INBOX-8 "$SP" > /dev/null 2>&1; RC=$?
if [ $RC -ne 0 ] && grep -q '^\*\*ID:\*\* INBOX-8$' "$S"; then
  pass "spec carrying an ID token: refused (rc=$RC), nothing deleted"
else
  fail "spec carrying an ID token was accepted (rc=$RC)"
fi

# ── 5. private promote leaks no private token ──────────────────────────────
S="$TMP/five/private.md"; store "$S" INBOX-P; SP="$TMP/five/p9999_x.md"; spec "$SP"
ALL="$(INBOX_PROMOTE_FILE="$S" "$PROMOTE" INBOX-P8 "$SP" 2>&1)"; RC=$?
if [ $RC -eq 0 ] && ! grep -q 'INBOX-P8' "$S" && ! grep -qE 'INBOX-P|Next ID|\b9\b' <<< "$ALL" \
   && ! grep -qE 'INBOX-P|Next ID' "$SP"; then
  pass "private promote: note deleted; no INBOX-P token or counter in output or spec ($ALL)"
else
  fail "private promote: rc=$RC output='$ALL'"
fi
S="$TMP/five/private2.md"; store "$S" INBOX-P; SP="$TMP/five/p9998_y.md"; spec "$SP"
printf 'Came from INBOX-P8.\n' >> "$SP"
if INBOX_PROMOTE_FILE="$S" "$PROMOTE" INBOX-P8 "$SP" > /dev/null 2>&1; then
  fail "a spec carrying INBOX-P was accepted"
else
  pass "a spec carrying INBOX-P is refused before any delete"
fi

echo
if [ "$FAILS" -eq 0 ]; then echo "ALL CHECKS PASSED"; exit 0; fi
echo "$FAILS CHECK(S) FAILED"; exit 1
