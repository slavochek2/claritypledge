#!/usr/bin/env bash
# test-supabase-tokens-parse.sh — controls for scripts/supabase-tokens-parse.py (INBOX-P174 follow-up).
# Fixture layout copied from the dashboard Access Tokens page as get_page_text returned it on
# 2026-10-21; every token string is a fake mask (never a real prefix or suffix, P1526).
set -uo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
P="$ROOT/scripts/supabase-tokens-parse.py"
T="$(mktemp -d)"; trap 'rm -rf "$T"' EXIT
fail=0
check() { # name expected-exit expected-grep file [args]
  local name="$1" want="$2" pat="$3" f="$4"; shift 4
  out="$(python3 "$P" --today 2026-10-21 "$@" "$f")"; got=$?
  if [ "$got" != "$want" ] || ! grep -qE -- "$pat" <<<"$out"; then
    echo "FAIL $name (exit $got, want $want)"; printf '%s\n' "$out" | sed 's/^/  /'; fail=1
  else echo "PASS $name"; fi
  if grep -qE 'sbp_' <<<"$out"; then echo "FAIL $name printed a token fragment"; fail=1; fi
}

HEAD='Access Tokens
Create and manage access tokens for API authentication.
Generate new token
TOKEN
LAST USED

EXPIRES
'
row() { printf '\n%s\n\nsbp_aaaa********zzzz\n\n%s\n' "$1" "$2"; }
# Real layout: a LEGACY row puts last-used and "Never" on separate lines.
legacy() { printf '\n%s\n\nLEGACY\n\nsbp_bbbb••••••••••••••••••••yyyy\n\n%s\n\nNever\n' "$1" "$2"; }

{ echo "$HEAD"; row "cp test - read-only" "22 minutes ago 19 Jan 2027"; row "cp prod - deploy" "2 hours ago 29 Dec 2026"; } > "$T/good"
{ echo "$HEAD"; row "cp test - read-only" "22 minutes ago 19 Jan 2027"
  legacy "cli_someone@host_123" "3 hours ago"
  row "cp daily drift checks - read only" "an hour ago 13 Dec 2026"
  row "old one" "Never used 01 Oct 2026"; } > "$T/bad"
echo "Access Tokens
Sign in to continue" > "$T/empty"

check "all ok, no false positive"     0 '^TOKENS: ok 2 tokens.*next expiry in 69 days' "$T/good"
check "legacy flagged"                1 '^TOKEN legacy never - cli_someone@host_123$' "$T/bad"
check "expiring within 21d? no (53d)" 1 '^TOKEN ok 2026-12-13 53 cp daily drift' "$T/bad"
check "expiring at 60d window"        1 '^TOKEN expiring 2026-12-13 53 cp daily drift' "$T/bad" --warn-days 60
check "expired flagged"               1 '^TOKEN expired 2026-10-01 -20 old one$' "$T/bad"
check "summary names the classes"     1 '^TOKENS: problem 1 full-access \(LEGACY\): cli_someone@host_123; 1 expired: old one$' "$T/bad"
# Review findings 2026-10-21 (Codex, Gemini), each reproduced before the fix:
printf 'sbp_FAKEPREFIX********FAKESUFFIX\nsbp_aaaa********zzzz\n22 minutes ago 19 Jan 2027\n' > "$T/leak"
check "key-like name is withheld"     1 '^TOKENS: problem 2 token row' "$T/leak"
check "and the odd layout fails closed" 1 '^TOKENS: problem 2 token row' "$T/leak"
printf 'sbp_FAKE_UNMASKED_TOKEN\nsbp_aaaa********zzzz\n22 minutes ago 19 Jan 2027\n' > "$T/leak2"
check "unmasked key as name is withheld" 1 '^TOKEN ok 2027-01-19 90 name-withheld$' "$T/leak2"
printf 'TOKEN\nsbp_aaaa********zzzz\n22 minutes ago 19 Jan 2027\n' > "$T/hdr"
check "header is not a name"          1 '^TOKENS: problem 1 token row' "$T/hdr"
{ echo "$HEAD"; row "healthy" "22 minutes ago 19 Jan 2027"; printf '\ncli_x@host\n\nLEGACY\n\nsbp_bbbb********yyyy\n\n3 hours ago\n'; } > "$T/legnodate"
check "legacy without a date still flagged" 1 '^TOKEN legacy unknown - cli_x@host$' "$T/legnodate"
{ echo "$HEAD"; row "healthy" "22 minutes ago 19 Jan 2027"; printf '\nweird\n\nsbp_cccc********xxxx\n\nsomething else\n'; } > "$T/unread"
check "an unreadable row fails closed" 1 '^TOKENS: problem 1 token row' "$T/unread"
printf 'old key\nsbp_aaaa********zzzz\n01 Oct 2026\n19 Jan 2027\n' > "$T/twodates"
check "last-used date is not the expiry" 0 '^TOKEN ok 2027-01-19 90 old key$' "$T/twodates"
# Second Codex pass 2026-10-21:
printf 'broken\nsbp_aaaa********zzzz\nNever used\nexpiry unavailable\n' > "$T/neverused"
check "Never used is not an expiry"   1 '^TOKENS: problem 1 token row' "$T/neverused"
printf 'sbp_FAKEPREFIX\nFAKESUFFIX\nsbp_aaaa********zzzz\n22 minutes ago 19 Jan 2027\n' > "$T/wrap"
check "wrapped key half is withheld"  1 'TOKEN ok 2027-01-19 90 name-withheld' "$T/wrap"
{ echo "$HEAD"; row "healthy" "22 minutes ago 19 Jan 2027"; printf '\ncli\n\nLEGACY\n\nsbp_bbbb……yyyy\n\n3 hours ago\n\nNever\n'; } > "$T/oddmask"
check "odd mask with LEGACY fails closed" 1 '^TOKENS: problem' "$T/oddmask"
# Third Codex pass: a missing expiry must not be borrowed from the next row's name.
{ echo "$HEAD"; printf '\nbroken\n\nsbp_aaaa********zzzz\n\nNever used\n'; row "Never expires deploy" "1 hour ago 19 Jan 2027"; } > "$T/borrow1"
check "no expiry borrowed: Never"     1 '^TOKENS: problem 1 token row' "$T/borrow1"
{ echo "$HEAD"; printf '\nbroken\n\nsbp_aaaa********zzzz\n\nNever used\n'; row "Deploy rotation 19 Jan 2027" "1 hour ago 19 Jan 2027"; } > "$T/borrow2"
check "no expiry borrowed: date"      1 '^TOKENS: problem' "$T/borrow2"
# /finish review 2026-10-21 (Gemini, Codex):
printf 'x\nsbp_aaaa********zzzz\n1 hour ago 31 Feb 2027\n' > "$T/baddate"
check "impossible date is unreadable, no crash" 1 '^TOKENS: problem 1 token row' "$T/baddate"
printf 'abcd\nsbp_aaaa********zzzz\n1 hour ago 19 Jan 2027\n' > "$T/short"
check "short bare fragment is withheld" 0 '^TOKEN ok 2027-01-19 90 name-withheld$' "$T/short"
{ echo "$HEAD"; row "first" "1 hour ago 19 Jan 2027"; printf '\nsbp_dddd********wwww\n\n1 hour ago 19 Jan 2027\n'; } > "$T/noname"
check "nameless row does not borrow the previous row" 1 '^TOKENS: problem 1 token row' "$T/noname"
LC_ALL=de_DE.UTF-8 python3 "$P" --today 2026-10-21 "$T/good" >/dev/null; [ $? = 0 ] && echo "PASS locale-independent" || { echo "FAIL locale-independent"; fail=1; }
check "signed out is not-run"         2 '^TOKENS: not-run' "$T/empty"
exit $fail
