#!/usr/bin/env bash
# test-p1316-master-key-consumers.sh — hermetic canary for P1316.
#
# No network, no real credential, and NO authorization dialog: every script under test
# is copied into a throwaway directory that is not a git checkout, next to a stub
# keychain helper and stub `curl`/`sips` on PATH. The stub keychain hands back a fixed
# decoy value; the stub curl records its argv and the contents of any header file it
# was given, so the canary can tell "the key travelled in a header file" from "the key
# was in argv, visible to ps".
#
# What must hold, and why each case exists:
#   photo-prep upload     the key reaches curl through a header FILE, never argv, and is
#                         read from the keychain — not from the env file sitting next to it
#   photo-prep declined   a declined dialog is a non-zero exit with NO upload, even though
#                         the plaintext env file still holds a (different) decoy value —
#                         the fallback this spec forbids would pass every other case
#   photo-prep exists     an object that already exists costs no dialog at all
#   photo-prep small      P1417: the small copy is uploaded too, through the SAME single key
#                         read and a header file; if encoding it fails the original still
#                         uploads, the run still exits 0, stdout stays exactly two lines, and
#                         any old small copy is DELETED with the key already held
#   photo-prep stale      P1417: an existing original whose small copy is older (replaced at the
#                         same path) prints STALE with the fix command, still with no dialog
#   stranded no-token     without the scoped token the check exits 2 with a reason code and
#                         sends NO request, even with the master key present in both the env
#                         file and the environment
#   static scan           no file under scripts/ or .claude/commands/ reads the master key
#                         from a plaintext env file; the scan is run first against a fixture
#                         holding known-bad and known-good lines, so a blind scan fails here
set -uo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
KEY=PROD_SUPABASE_SERVICE_ROLE_KEY
PASS=0; FAIL=0
ok()  { echo "  ok   $1"; PASS=$((PASS+1)); }
bad() { echo "  FAIL $1 :: $2"; FAIL=$((FAIL+1)); }

TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT

# ── fixture repo ─────────────────────────────────────────────────────────────
mkdir -p "$TMP/repo/scripts/lib" "$TMP/bin" "$TMP/home/Downloads"
cp "$ROOT/scripts/event-photo-prep.sh" "$ROOT/scripts/check-stranded-signups.sh" \
   "$ROOT/scripts/keyring.sh" "$TMP/repo/scripts/"
printf '%s\n' "$KEY" > "$TMP/registry.txt"
# The env file holds a DIFFERENT decoy than the keychain, so a fallback to it is visible.
printf 'UNSPLASH_ACCESS_KEY=unused\n%s=plaintext-decoy-must-never-be-sent\n' "$KEY" > "$TMP/repo/.env.local"
printf 'fake jpeg' > "$TMP/photo.jpg"

cat > "$TMP/repo/scripts/lib/keychain.py" <<'PY'
import os, sys
with open(os.environ["STUB_KEYCHAIN_LOG"], "a") as f:
    f.write(" ".join(sys.argv[1:3]) + "\n")
if os.environ.get("STUB_DECLINE") == "1":
    sys.exit(1)
sys.stdout.write("keychain-decoy-value")
PY

cat > "$TMP/bin/curl" <<'SH'
#!/usr/bin/env bash
# Record argv on one line, and the contents of every `-H @file` header file.
printf 'ARGV %s\n' "$*" >> "$STUB_CURL_LOG"
out=""; want_code=0; head=0; url=""; method=GET
while [ $# -gt 0 ]; do
  case "$1" in
    -X) method="$2"; shift 2 ;;
    -H) if [ "${2#@}" != "$2" ]; then printf 'HEADERFILE %s\n' "$(tr '\n' ' ' < "${2#@}")" >> "$STUB_CURL_LOG"; fi; shift 2 ;;
    -o) out="$2"; shift 2 ;;
    -w) want_code=1; shift 2 ;;
    -I) head=1; shift ;;
    http*) url="$1"; shift ;;
    *) shift ;;
  esac
done
# P1417: storage INFO endpoint — last_modified for the small copy / the original, when set.
case "$url" in
  */info/public/*.w800.webp) [ -n "${STUB_INFO_SMALL:-}" ] && printf '{"last_modified":"%s"}' "$STUB_INFO_SMALL"; exit 0 ;;
  */info/public/*) [ -n "${STUB_INFO_ORIG:-}" ] && printf '{"last_modified":"%s"}' "$STUB_INFO_ORIG"; exit 0 ;;
esac
[ -n "$out" ] && [ "$out" != /dev/null ] && : > "$out"
# P1417: storage DELETE answers with a body; 400 means not-found OR auth failure, told apart by it.
if [ "$method" = DELETE ]; then
  [ -n "$out" ] && [ "$out" != /dev/null ] && printf '%s' "${STUB_DELETE_BODY:-{\"message\":\"Successfully deleted\"}}" > "$out"
  [ "$want_code" = 1 ] && printf '%s' "${STUB_DELETE_STATUS:-200}"
  exit 0
fi
if [ "$want_code" = 1 ]; then
  if [ "$head" = 1 ]; then printf '%s' "${STUB_HEAD_STATUS:-404}"; else printf '200'; fi
fi
exit 0
SH
printf '#!/usr/bin/env bash\nexit 0\n' > "$TMP/bin/sips"
# P1417: `npx tsx scripts/event-banner-small.ts encode <in> <out>` writes <out>, or fails on demand.
cat > "$TMP/bin/npx" <<'SH'
#!/usr/bin/env bash
[ "${STUB_ENCODE_FAIL:-0}" = 1 ] && { echo "Error: stub encoder refused" >&2; exit 1; }
[ "$3" = encode ] && printf 'fake webp' > "$5"
exit 0
SH
chmod +x "$TMP/bin/curl" "$TMP/bin/sips" "$TMP/bin/npx"

run_photo() {  # run_photo [extra env...] — sets RC
  : > "$TMP/curl.log"; : > "$TMP/keychain.log"
  (cd "$TMP" && env -u "$KEY" PATH="$TMP/bin:$PATH" HOME="$TMP/home" \
     KEYRING_REGISTRY="$TMP/registry.txt" STUB_CURL_LOG="$TMP/curl.log" \
     STUB_KEYCHAIN_LOG="$TMP/keychain.log" "$@" \
     bash "$TMP/repo/scripts/event-photo-prep.sh" test-slug "$TMP/photo.jpg" >"$TMP/out" 2>"$TMP/err")
  RC=$?
}

echo "P1316 master-key consumer canary"

# ── event-photo-prep: upload path ────────────────────────────────────────────
run_photo
if [ "$RC" -eq 0 ]; then ok "photo-prep upload path exits 0"; else bad "photo-prep upload rc" "rc=$RC err=$(cat "$TMP/err")"; fi
# `grep -c` drains its input: a negated `| grep -q` under pipefail can exit 141 on a MATCH,
# and `!` would turn "the key IS in argv" into a pass (epistemic.md gate 7).
if grep -q "keychain-decoy-value" "$TMP/curl.log" && [ "$(grep '^ARGV' "$TMP/curl.log" | grep -c "decoy")" -eq 0 ]; then
  ok "photo-prep: key travels in a header file, never in argv"
else bad "photo-prep header/argv" "$(cat "$TMP/curl.log")"; fi
if grep -q "plaintext-decoy" "$TMP/curl.log"; then bad "photo-prep read the plaintext env copy" "$(cat "$TMP/curl.log")"
else ok "photo-prep: plaintext env copy never sent"; fi
if [ "$(grep -c "cp.keyring.$KEY" "$TMP/keychain.log")" -eq 1 ]; then ok "photo-prep: exactly one keychain read"
else bad "photo-prep keychain reads" "$(cat "$TMP/keychain.log")"; fi
if [ "$(grep '^ARGV' "$TMP/curl.log" | grep -- '-X POST' | grep -c 'test-slug.jpg.w800.webp')" -eq 1 ] \
   && [ "$(grep '^ARGV' "$TMP/curl.log" | grep -c -- '-X POST')" -eq 2 ] \
   && [ "$(grep -c '^HEADERFILE.*keychain-decoy-value' "$TMP/curl.log")" -eq 2 ]; then
  ok "photo-prep: small copy uploaded through a header file on the same key read"
else bad "photo-prep small upload" "$(cat "$TMP/curl.log")"; fi
if [ "$(grep -c '' "$TMP/out")" -eq 2 ] && [ ! -s "$TMP/err" ]; then ok "photo-prep: stdout is exactly LOCAL= and PUBLIC=, no warning"
else bad "photo-prep stdout contract" "out=$(cat "$TMP/out") err=$(cat "$TMP/err")"; fi

# ── event-photo-prep: small copy cannot be encoded ───────────────────────────
run_photo STUB_ENCODE_FAIL=1
if [ "$RC" -eq 0 ] && [ "$(grep '^ARGV' "$TMP/curl.log" | grep -c -- '-X POST')" -eq 1 ] \
   && [ "$(grep -c '' "$TMP/out")" -eq 2 ] && grep -q "WARNING: the small copy was not made (encode failed: Error: stub encoder refused)" "$TMP/err"; then
  ok "photo-prep: encode failure still uploads the original, exits 0, warns with the reason"
else bad "photo-prep encode failure" "rc=$RC out=$(cat "$TMP/out") err=$(cat "$TMP/err") curl=$(cat "$TMP/curl.log")"; fi
if [ "$(grep '^ARGV' "$TMP/curl.log" | grep -- '-X DELETE' | grep -c 'test-slug.jpg.w800.webp')" -eq 1 ] \
   && [ "$(grep -c '^HEADERFILE.*keychain-decoy-value' "$TMP/curl.log")" -eq 2 ] \
   && [ "$(grep -c "cp.keyring.$KEY" "$TMP/keychain.log")" -eq 1 ] \
   && grep -q "no small copy exists now" "$TMP/err"; then
  ok "photo-prep: a failed small copy deletes any old one, same key read, and says so"
else bad "photo-prep small delete" "err=$(cat "$TMP/err") curl=$(cat "$TMP/curl.log") keychain=$(cat "$TMP/keychain.log")"; fi

# ── event-photo-prep: declined dialog ────────────────────────────────────────
run_photo STUB_DECLINE=1
if [ "$RC" -ne 0 ] && ! grep -q -- "-X POST" "$TMP/curl.log"; then
  ok "photo-prep: declined dialog exits $RC with no upload"
else bad "photo-prep declined" "rc=$RC curl=$(cat "$TMP/curl.log")"; fi

# ── event-photo-prep: object already exists ──────────────────────────────────
run_photo STUB_HEAD_STATUS=200
if [ "$RC" -eq 0 ] && [ ! -s "$TMP/keychain.log" ]; then ok "photo-prep: existing object costs no dialog"
else bad "photo-prep exists" "rc=$RC keychain=$(cat "$TMP/keychain.log")"; fi

# ── event-photo-prep: what the DELETE answer means (P1417; bodies measured on TEST) ──
run_photo STUB_ENCODE_FAIL=1 STUB_DELETE_STATUS=400 STUB_DELETE_BODY='{"statusCode":"404","error":"not_found","message":"Object not found","code":"NoSuchKey"}'
if [ "$RC" -eq 0 ] && grep -q "no small copy exists now" "$TMP/err"; then ok "photo-prep: NoSuchKey on delete means no copy"
else bad "photo-prep delete NoSuchKey" "rc=$RC err=$(cat "$TMP/err")"; fi
run_photo STUB_ENCODE_FAIL=1 STUB_DELETE_STATUS=400 STUB_DELETE_BODY='{"statusCode":"403","error":"Unauthorized","message":"Invalid Compact JWS","code":"AccessDenied"}'
if [ "$RC" -eq 0 ] && grep -q "an older small copy may remain" "$TMP/err" && ! grep -q "no small copy exists now" "$TMP/err"; then
  ok "photo-prep: any other 400 on delete is NOT read as no copy"
else bad "photo-prep delete AccessDenied" "rc=$RC err=$(cat "$TMP/err")"; fi

# ── event-photo-prep: existing original, small copy older than it (P1417) ─────
run_photo STUB_HEAD_STATUS=200 STUB_INFO_ORIG=2026-10-05T09:00:00Z STUB_INFO_SMALL=2026-09-01T00:00:00Z
if [ "$RC" -eq 0 ] && [ ! -s "$TMP/keychain.log" ] && grep -q "^STALE: " "$TMP/err" \
   && grep -q "event-banner-small.ts one --env prod" "$TMP/err" && [ "$(grep -c '' "$TMP/out")" -eq 2 ]; then
  ok "photo-prep: stale small copy reported with the fix command, no dialog"
else bad "photo-prep stale" "rc=$RC err=$(cat "$TMP/err") keychain=$(cat "$TMP/keychain.log")"; fi
run_photo STUB_HEAD_STATUS=200 STUB_INFO_ORIG=2026-09-01T00:00:00Z STUB_INFO_SMALL=2026-10-05T09:00:00Z
if [ "$RC" -eq 0 ] && [ ! -s "$TMP/err" ]; then ok "photo-prep: fresh small copy, nothing reported"
else bad "photo-prep fresh" "rc=$RC err=$(cat "$TMP/err")"; fi

# ── check-stranded-signups: no scoped token ──────────────────────────────────
: > "$TMP/curl.log"
OUT=$(cd "$TMP" && env -u SUPABASE_READONLY_TOKEN PATH="$TMP/bin:$PATH" STUB_CURL_LOG="$TMP/curl.log" \
      "$KEY=env-decoy-must-never-be-sent" bash "$TMP/repo/scripts/check-stranded-signups.sh" 2>/dev/null); RC=$?
if [ "$RC" -eq 2 ] && [ "$OUT" = "stranded_check_error=missing_credential" ] && [ ! -s "$TMP/curl.log" ]; then
  ok "stranded: no scoped token is exit 2, reason code, no request (master key ignored)"
else bad "stranded no-token" "rc=$RC out=$OUT curl=$(cat "$TMP/curl.log")"; fi

# ── static scan: plaintext reads of the master key ───────────────────────────
# One pattern per plaintext-read shape found in the 2026-09-15 census: a dotenv object
# indexed by the name, a grep/sed of `NAME=` out of a file, an env_value helper, a
# "from .env.local" table row, and the key expanded straight into a curl argument.
PLAINTEXT_RE="(env|envLocal|envVars)(\\.|\\[['\"])${KEY}|\\^${KEY}=|env_value ${KEY}|\\.env\\.local:? \`?${KEY}|Bearer \\\$\\{?${KEY}"
scan() { grep -rnE "$PLAINTEXT_RE" "$@" 2>/dev/null | grep -v 'test-p1316-master-key-consumers.sh'; }

mkdir -p "$TMP/fixture"
cat > "$TMP/fixture/bad.txt" <<EOF
const SERVICE_KEY = envLocal.${KEY};
const K = env['${KEY}'];
V=\$(grep -E '^${KEY}=' .env.local | cut -d= -f2-)
S="\${${KEY}:-\$(env_value ${KEY})}"
| **prod** | \`.env.prod: VITE_SUPABASE_URL\` | \`.env.local: ${KEY}\` |
  -H "apikey: \$ANON" -H "Authorization: Bearer \$${KEY}" \\
EOF
cat > "$TMP/fixture/good.txt" <<EOF
keyring_require ${KEY} || exit 1
const K = keyringGet('${KEY}', 'reason');
  -H @<(printf 'apikey: %s\nAuthorization: Bearer %s\n' "\$${KEY}" "\$${KEY}")
EOF
bad_hits=$(scan "$TMP/fixture/bad.txt" | wc -l | tr -d ' ')
good_hits=$(scan "$TMP/fixture/good.txt" | wc -l | tr -d ' ')
if [ "$bad_hits" -eq 6 ] && [ "$good_hits" -eq 0 ]; then ok "static scan discriminates (6/6 known-bad, 0/3 known-good)"
else bad "static scan is blind" "bad_hits=$bad_hits/6 good_hits=$good_hits/3"; fi

HITS=$(scan "$ROOT/scripts" "$ROOT/.claude/commands/slava" "$ROOT/.github/workflows")
if [ -z "$HITS" ]; then ok "no plaintext read of the master key under scripts/, skills, workflows"
else bad "plaintext reads remain" "$(printf '\n%s' "$HITS")"; fi

echo
echo "P1316 canary: $PASS passed, $FAIL failed"
[ "$FAIL" -eq 0 ]
