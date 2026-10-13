#!/usr/bin/env bash
# Canary for the stranded-signups acknowledgement list (handled people are left out of the count).
# Hermetic: runs the check's own jq filter and the day-cp ACK_SQL snippet on fixtures, no network.
# Fixture timestamps carry fractional seconds on purpose (GoTrue emits them; see the script's note).
set -u
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
FAIL=0; ok(){ echo "ok   $1"; }; bad(){ echo "FAIL $1"; FAIL=1; }

filter="$(awk "/^filter='/{f=1;sub(/^filter='/,\"\")} f{if(/^  \]'\$/){sub(/'\$/,\"\");print;exit} print}" "$ROOT/scripts/check-stranded-signups.sh")"
[ -n "$filter" ] || { echo "FAIL could not extract the filter"; exit 1; }

old=$(date -u -v-3d +%Y-%m-%dT%H:%M:%S.123456Z 2>/dev/null || date -u -d '-3 days' +%Y-%m-%dT%H:%M:%S.123456Z)
A=aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa; B=bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb
resp="{\"users\":[{\"id\":\"$A\",\"email_confirmed_at\":null,\"created_at\":\"$old\"},{\"id\":\"$B\",\"email_confirmed_at\":null,\"created_at\":\"$old\"}]}"
run(){ printf '%s' "$resp" | jq --arg grace 24 --arg window 7 --argjson ack "$1" "$filter" | jq length; }

[ "$(run '[]')" = 2 ] && ok "control: nobody acknowledged counts both" || bad "control should count 2"
[ "$(run "[\"$A\"]")" = 1 ] && ok "one acknowledged id leaves one" || bad "ack of A should leave 1"
[ "$(run "[\"$A\",\"$B\"]")" = 0 ] && ok "both acknowledged leaves none" || bad "ack of both should leave 0"
[ "$(run '["not-an-id"]')" = 2 ] && ok "an unrelated id changes nothing" || bad "unrelated id must not hide anyone"

# the REAL parsing lines, extracted from both files (not hand copies), run on a file that has a
# comment, an uppercase id, a CRLF line and a pasted address. A deleted or broken line fails here.
f="$(mktemp)"; trap 'rm -f "$f"' EXIT
U=ABCDEF01-AAAA-AAAA-AAAA-AAAAAAAAAAAA
printf '# note\n%s  # handled\n%s\r\nsomeone@example.com\n' "$U" "$B" > "$f"
low=$(printf '%s' "$U" | tr 'A-F' 'a-f')

blk="$(awk '/^ack_json=/{f=1} f{print} /^fi$/{if(f)exit}' "$ROOT/scripts/check-stranded-signups.sh")"
[ -n "$blk" ] || bad "could not extract the script's ack parsing"
ACK_FILE="$f"; ack_json='[]'; eval "$blk"
[ "$(printf '%s' "$ack_json" | jq -c 'sort')" = "[\"$low\",\"$B\"]" ] && ok "script parsing: lowercases, strips CR, drops the address" || bad "script parsing gave $ack_json"

line="$(grep '^ACK_IDS=' "$ROOT/.claude/commands/slava/maintain/day-cp.md")"
[ -n "$line" ] || bad "could not find ACK_IDS in day-cp.md"
line="${line//\$(git rev-parse --show-toplevel)\/scripts\/stranded-signups-ack.txt/$f}"
eval "$line"
want="'$low','$B'"
[ "$ACK_IDS" = "$want" ] || [ "$ACK_IDS" = "'$B','$low'" ] && ok "day-cp parsing: same ids, quoted for SQL" || bad "day-cp parsing gave: $ACK_IDS"
exit $FAIL
