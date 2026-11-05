#!/bin/bash
# scripts/test-p1602-secrets-safeguard.sh — hermetic canary for P1602: deploy-functions.sh --secrets.
#   With a PATH-stubbed gcloud that runs the REAL remote name-listing script against a fixture directory,
#   a server file holding names the Mac file lacks is refused (names only, no values, nothing sent); the
#   allowed paths still go through; a failed or garbled listing fails closed. The real remote is NOT exercised.
# No network, no database, no gcloud, no server. Files are written only under a mktemp dir.
set -u
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PASS=0; FAIL=0
ok()  { PASS=$((PASS + 1)); echo "  PASS  $1"; }
bad() { FAIL=$((FAIL + 1)); echo "  FAIL  $1"; }
TMPROOT=$(mktemp -d "${TMPDIR:-/tmp}/test-p1602.XXXXXX")
trap 'rm -rf "$TMPROOT"' EXIT

echo "== C. deploy-functions.sh --secrets never wipes the server's secrets"
DF="$REPO_ROOT/scripts/selfhosted/deploy-functions.sh"
EXPECTED_URL=$(sed -n 's/^EXPECTED_URL="\(.*\)"/\1/p' "$DF")
H="$TMPROOT/home"; FIX="$TMPROOT/stack"; LOG="$TMPROOT/gcloud.log"; BIN="$TMPROOT/bin"
mkdir -p "$H/.config/cp-selfhosted-test" "$FIX" "$BIN"
printf 'SUPABASE_URL=%s\n' "$EXPECTED_URL" > "$H/.config/cp-selfhosted-test/env"
cat > "$BIN/gcloud" <<'STUB'
#!/bin/bash
# Runs the REAL remote scripts against a fixture dir. Each branch logs that it was reached, and the
# child's exit status is the stub's exit status (a failing remote script must look like a failure).
case "$1 $2" in
  "auth print-access-token") echo tok; exit 0 ;;
  "compute ssh")
    body=$(cat); echo "SSH" >> "$STUB_LOG"
    if printf '%s' "$body" | grep -q 'P1602[_:]BEGIN'; then
      echo "LIST" >> "$STUB_LOG"
      [ -n "${STUB_LIST_FAIL:-}" ] && exit 1
      [ -n "${STUB_LIST_GARBAGE:-}" ] && { echo "hello"; exit 0; }
      printf '%s\n' "$body" | sed "s#/opt/supabase/docker#$STUB_STACK#g" | bash; rc=${PIPESTATUS[2]}
      exit "$rc"
    elif printf '%s' "$body" | grep -q 'P1602_BACKUP'; then
      echo "BACKUP" >> "$STUB_LOG"
      [ -n "${STUB_BACKUP_FAIL:-}" ] && exit 1
      if [ -n "${STUB_FAKE_DATE:-}" ]; then mkdir -p "$STUB_STACK/.shim"; printf '#!/bin/bash\necho %s\n' "$STUB_FAKE_DATE" > "$STUB_STACK/.shim/date"; chmod +x "$STUB_STACK/.shim/date"; export PATH="$STUB_STACK/.shim:$PATH"; fi
      printf '%s\n' "$body" | sed "s#/opt/supabase/docker#$STUB_STACK#g" | bash; rc=${PIPESTATUS[2]}
      [ "$rc" -eq 0 ] && echo "BACKUPSTEP" >> "$STUB_LOG"
      exit "$rc"
    else
      printf '%s' "$body" | grep -q 'install -m 600' && echo "INSTALL" >> "$STUB_LOG"
    fi
    exit 0 ;;
  "compute scp") echo "SCP" >> "$STUB_LOG"; exit 0 ;;
esac
exit 0
STUB
chmod +x "$BIN/gcloud"
sf() { # sf <server-lines|NONE> <mac-lines> [VAR=val ...] ; sets RC, OUT
  local SRV="$1" MAC="$2"; shift 2
  rm -rf "$FIX"/functions.env* "$H/.config/cp-selfhosted-test/functions.env"; : > "$LOG"
  [ "$SRV" = NONE ] || { printf '%b' "$SRV" > "$FIX/functions.env"; chmod 600 "$FIX/functions.env"; }
  printf '%b' "$MAC" > "$H/.config/cp-selfhosted-test/functions.env"; chmod 600 "$H/.config/cp-selfhosted-test/functions.env"
  [ -z "${SF_PRE:-}" ] || "$SF_PRE"
  OUT=$(cd "$REPO_ROOT" && env HOME="$H" PATH="$BIN:$PATH" STUB_LOG="$LOG" STUB_STACK="$FIX" "$@" bash "$DF" --secrets 2>&1); RC=$?
}
sent() { grep -q -E 'SCP|INSTALL' "$LOG"; }
listed() { grep -q '^LIST$' "$LOG"; }   # the negative tests must have reached the listing, not died earlier
sf 'ALPHA_KEY=server-secret-canary-1\nBETA_KEY=server-secret-canary-2\nGAMMA_KEY=server-secret-canary-3\n' 'ALPHA_KEY=mac-secret-canary\n'
{ [ "$RC" -ne 0 ] && grep -q 'BETA_KEY' <<<"$OUT" && grep -q 'GAMMA_KEY' <<<"$OUT" && listed && ! sent; } && ok "server holds names the Mac lacks: refused (exit $RC), both names listed, nothing sent" || bad "refusal (rc=$RC out='$OUT')"
{ ! grep -q 'secret-canary' <<<"$OUT"; } && ok "refusal output carries names only, no values" || bad "values leaked"
{ ! grep -q 'ALPHA_KEY' <<<"$(grep REFUSED <<<"$OUT")"; } && ok "a name present on both sides is not listed as lost" || bad "ALPHA listed"
sf 'ALPHA_KEY=s1\n' 'ALPHA_KEY=m1\nBETA_KEY=m2\n'
{ [ "$RC" -eq 0 ] && grep -q SCP "$LOG" && grep -q INSTALL "$LOG"; } && ok "control: Mac file is a superset: allowed, file sent and installed" || bad "superset (rc=$RC out='$OUT')"
sf 'ALPHA_KEY=backup-canary-value\n' 'ALPHA_KEY=m1\n'
BK=$(ls "$FIX" | grep '^functions.env.bak-' | head -1)
{ [ "$RC" -eq 0 ] && [ -n "$BK" ] && [ "$(stat -f '%Lp' "$FIX/$BK" 2>/dev/null || stat -c '%a' "$FIX/$BK")" = 600 ] && grep -q backup-canary-value "$FIX/$BK" && grep -q "$BK" <<<"$OUT" && ! grep -q backup-canary-value <<<"$OUT"; } && ok "backup: dated copy beside the file, mode 600, same content, only its name printed" || bad "backup (rc=$RC bk=$BK out=$OUT mode=$(stat -f '%Lp' "$FIX/$BK"))"
sf 'ALPHA_KEY=s1\n' 'ALPHA_KEY=m1\n' STUB_BACKUP_FAIL=1
{ [ "$RC" -ne 0 ] && grep -q '^BACKUP$' "$LOG" && ! grep -q BACKUPSTEP "$LOG" && ! sent; } && ok "backup fails: nothing replaced, nothing sent" || bad "backup fail (rc=$RC)"
sf 'ALPHA_KEY=s1\nBETA_KEY=s2\n' 'ALPHA_KEY=m1\nBETA_KEY=m2\n'
{ [ "$RC" -eq 0 ] && grep -q INSTALL "$LOG"; } && ok "control: identical name sets: allowed (the normal value update)" || bad "identical (rc=$RC)"
sf NONE 'ALPHA_KEY=m1\n'
{ [ "$RC" -eq 0 ] && grep -q INSTALL "$LOG"; } && ok "control: no functions.env on the server yet: allowed (first push)" || bad "no server file (rc=$RC out='$OUT')"
sf '# comment\n\nALPHA_KEY=s1\n' 'ALPHA_KEY=m1\n'
[ "$RC" -eq 0 ] && ok "comments and blank lines on the server are not secret names" || bad "comments (rc=$RC out='$OUT')"
sf 'ALPHA_KEY=s1\nBETA_KEY=s2\n' 'ALPHA_KEY=m1\nBETA_KEY=\n'
{ [ "$RC" -ne 0 ] && listed && ! sent; } && ok "a Mac line with an empty value does not count as holding the name" || bad "empty value (rc=$RC)"
sf 'ALPHA_KEY=s1\n' 'ALPHA_KEY=m1\n' STUB_LIST_FAIL=1
{ [ "$RC" -ne 0 ] && listed && ! sent; } && ok "listing fails: refuses, nothing sent (fail closed)" || bad "list fail (rc=$RC)"
sf 'ALPHA_KEY=s1\n' 'ALPHA_KEY=m1\n' STUB_LIST_GARBAGE=1
{ [ "$RC" -ne 0 ] && listed && ! sent; } && ok "garbled listing: refuses, nothing sent (fail closed)" || bad "garbage (rc=$RC)"
echo "-- P1602 round 2: listing and parsing fail closed"
refused() { [ "$RC" -ne 0 ] && listed && ! sent; }
sf 'ALPHA_KEY=s1\nP1602_SECRET=s2\n' 'ALPHA_KEY=m1\n'
{ refused && grep -q 'P1602_SECRET' <<<"$OUT"; } && ok "a real name starting P1602_ is listed and refused, not eaten as a marker" || bad "P1602_ name (rc=$RC out='$OUT')"
sf 'ALPHA_KEY=s1\nP1602_NONE_KEY=s2\n' 'ALPHA_KEY=m1\n'
{ refused && grep -q 'P1602_NONE_KEY' <<<"$OUT"; } && ok "a name containing P1602_NONE is not read as 'no file'" || bad "P1602_NONE_KEY (rc=$RC out='$OUT')"
sf 'ALPHA_KEY=s1\nexport LOST_KEY=s2\n' 'ALPHA_KEY=m1\n'
{ refused; } && ok "server line 'export KEY=v' cannot be parsed: refused" || bad "export line (rc=$RC)"
sf 'ALPHA_KEY=s1\n  LOST_KEY=s2\n' 'ALPHA_KEY=m1\n'
{ refused; } && ok "server line with leading whitespace: refused" || bad "leading ws (rc=$RC)"
sf 'ALPHA_KEY=s1\nLOST_KEY = s2\n' 'ALPHA_KEY=m1\n'
{ refused; } && ok "server line with whitespace around '=': refused" || bad "ws around = (rc=$RC)"
sf 'ALPHA_KEY=s1\r\nLOST_KEY=s2\r\n' 'ALPHA_KEY=m1\n'
{ refused && grep -q 'LOST_KEY' <<<"$OUT" && ! grep -q $'\r' <<<"$OUT"; } && ok "CRLF server file: name found, listed without the CR, refused" || bad "CRLF (rc=$RC)"
sf 'ALPHA_KEY=s1\r\n# c\r\n\r\n' 'ALPHA_KEY=m1\n'
[ "$RC" -eq 0 ] && ok "control: CRLF server file with nothing lost: allowed" || bad "CRLF control (rc=$RC out='$OUT')"
for BLANK in 'BETA_KEY=""' "BETA_KEY=''" 'BETA_KEY=   ' 'BETA_KEY='; do
  sf 'ALPHA_KEY=s1\nBETA_KEY=s2\n' "ALPHA_KEY=m1\n$BLANK\n"
  { refused && grep -q 'BETA_KEY' <<<"$OUT"; } && ok "Mac line $BLANK does not count as holding the name" || bad "blank form $BLANK (rc=$RC)"
done
sf 'ALPHA_KEY=s1\nBETA_KEY=s2\n' 'ALPHA_KEY=m1\nBETA_KEY="real"\n'
[ "$RC" -eq 0 ] && ok "control: quoted non-empty Mac value counts as populated" || bad "quoted control (rc=$RC out='$OUT')"
sf 'ALPHA_KEY=s1\n' 'ALPHA_KEY=m1\nexport BETA_KEY=m2\n'
{ [ "$RC" -ne 0 ] && ! sent; } && ok "Mac file with an unparseable line: refused before anything is sent" || bad "mac export (rc=$RC)"
mkfx_dir() { rm -f "$FIX/functions.env"; mkdir "$FIX/functions.env"; }
SF_PRE=mkfx_dir sf 'x\n' 'ALPHA_KEY=m1\n'
{ refused; } && ok "server functions.env unreadable (a read failure, not an empty file): refused" || bad "read failure (rc=$RC out='$OUT')"
unset SF_PRE
seed_bak() { printf 'EXISTING-BACKUP-SENTINEL\n' > "$FIX/functions.env.bak-20260101-000000"; }
SF_PRE=seed_bak sf 'ALPHA_KEY=s1\n' 'ALPHA_KEY=m1\n' STUB_FAKE_DATE=20260101-000000
{ [ "$RC" -ne 0 ] && grep -q '^BACKUP$' "$LOG" && ! sent && [ "$(cat "$FIX/functions.env.bak-20260101-000000")" = "EXISTING-BACKUP-SENTINEL" ]; } && ok "backup name already taken in the same second: refuses, existing backup untouched, nothing sent" || bad "backup collision (rc=$RC out='$OUT')"
unset SF_PRE
echo "-- P1602 round 3: duplicates and ambiguous values on the Mac side"
for AMBIG in 'BETA_KEY= # note' 'BETA_KEY="" # note' "BETA_KEY='x' # note" 'BETA_KEY=two words' 'BETA_KEY= lead' 'BETA_KEY=$HOME' 'BETA_KEY="a$b"' 'BETA_KEY=a\\b'; do
  sf 'ALPHA_KEY=s1\nBETA_KEY=s2\n' "ALPHA_KEY=m1\n$AMBIG\n"
  { [ "$RC" -ne 0 ] && ! sent; } && ok "ambiguous Mac value refused: $AMBIG" || bad "ambiguous $AMBIG (rc=$RC)"
done
sf 'ALPHA_KEY=s1\nBETA_KEY=s2\n' 'ALPHA_KEY=m1\nBETA_KEY=v\nBETA_KEY=\n'
{ [ "$RC" -ne 0 ] && ! sent; } && ok "duplicate key (populated then empty, last wins): refused" || bad "dup empty-last (rc=$RC)"
sf 'ALPHA_KEY=s1\nBETA_KEY=s2\n' 'ALPHA_KEY=m1\nBETA_KEY=v\nBETA_KEY=w\n'
{ [ "$RC" -ne 0 ] && ! sent; } && ok "duplicate key even when both populated: refused" || bad "dup both (rc=$RC)"
sf 'ALPHA_KEY=s1\nBETA_KEY=s2\n' 'ALPHA_KEY=m1\nBETA_KEY=#literal\n'
{ [ "$RC" -eq 0 ] && grep -q INSTALL "$LOG"; } && ok "control: BETA_KEY=#literal is populated (hash right after '=' is data), allowed" || bad "#literal (rc=$RC out='$OUT')"
sf 'ALPHA_KEY=s1\nBETA_KEY=s2\n' "ALPHA_KEY=m1\nBETA_KEY='single quoted'\n"
{ [ "$RC" -eq 0 ]; } && ok "control: single-quoted value with a space is populated" || bad "single quoted (rc=$RC)"
sf 'ALPHA_KEY=s1\n' 'ALPHA_KEY=m1\nsupabase_url=x\n'
{ [ "$RC" -ne 0 ] && ! sent; } && ok "lowercase supabase_* name refused like SUPABASE_*" || bad "lowercase supabase (rc=$RC)"
echo "-- P1602 round 4: single-quoted JSON values"
sf 'ALPHA_KEY=s1\nSA_KEY=s2\n' "ALPHA_KEY=m1\nSA_KEY='{\"private_key\":\"-----BEGIN\\\\nabc\",\"p\":\"\$x\"}'\n"
{ [ "$RC" -eq 0 ] && grep -q INSTALL "$LOG"; } && ok "single-quoted JSON (double quotes, backslash-n, \$) is populated: allowed" || bad "sq json (rc=$RC out='$OUT')"
sf 'ALPHA_KEY=s1\nSA_KEY=s2\n' "ALPHA_KEY=m1\nSA_KEY='it''s'\n"
{ [ "$RC" -ne 0 ] && ! sent; } && ok "single-quoted value with an inner quote form stays refused" || bad "inner quote (rc=$RC)"
sf 'ALPHA_KEY=s1\nSA_KEY=s2\n' "ALPHA_KEY=m1\nSA_KEY='{\"a\":1}' # c\n"
{ [ "$RC" -ne 0 ] && ! sent; } && ok "text after the closing single quote stays refused" || bad "trailing text (rc=$RC)"
sf 'ALPHA_KEY=s1\nSA_KEY=s2\n' "ALPHA_KEY=m1\nSA_KEY='   '\n"
{ [ "$RC" -ne 0 ] && ! sent; } && ok "blank single-quoted value still counts as empty" || bad "blank sq (rc=$RC)"
sf 'ALPHA_KEY=s1\nGCS_KEY={"a":"b\\\\nc"}\nSA_KEY='"'"'{"k":"x\\\\ny"}'"'"'\n' 'ALPHA_KEY=m1\n'
{ refused && grep -q 'GCS_KEY' <<<"$OUT" && grep -q 'SA_KEY' <<<"$OUT"; } && ok "server listing names both the unquoted-JSON and the single-quoted-JSON secret" || bad "server json names (rc=$RC out='$OUT')"
sf 'ALPHA_KEY=s1\nGCS_KEY={"a":"b\\\\nc"}\nSA_KEY='"'"'{"k":"x\\\\ny"}'"'"'\n' "ALPHA_KEY=m1\nGCS_KEY=m2\nSA_KEY='{\"k\":1}'\n"
[ "$RC" -eq 0 ] && ok "control: server JSON-valued secrets all present on the Mac: allowed" || bad "server json control (rc=$RC out='$OUT')"
echo "-- documented workflows still pass (gate 7c)"
printf 'ALPHA_KEY=m1\n' > "$H/.config/cp-selfhosted-test/functions.env"; chmod 600 "$H/.config/cp-selfhosted-test/functions.env"
OUT=$(cd "$REPO_ROOT" && env HOME="$H" PATH="$BIN:$PATH" STUB_LOG="$LOG" STUB_STACK="$FIX" bash "$DF" --help 2>&1); RC=$?
{ [ "$RC" -eq 0 ] && grep -q -- '--secrets' <<<"$OUT"; } && ok "--help" || bad "--help (rc=$RC)"
: > "$LOG"; OUT=$(cd "$REPO_ROOT" && env HOME="$H" PATH="$BIN:$PATH" STUB_LOG="$LOG" STUB_STACK="$FIX" bash "$DF" --check-secrets 2>&1); RC=$?
{ grep -q 'MISSING required' <<<"$OUT" && [ ! -s "$LOG" ]; } && ok "--check-secrets: reports names, touches no server" || bad "--check-secrets (rc=$RC)"
: > "$LOG"; OUT=$(cd "$REPO_ROOT" && env HOME="$H" PATH="$BIN:$PATH" STUB_LOG="$LOG" STUB_STACK="$FIX" bash "$DF" --setup 2>&1); RC=$?
{ [ "$RC" -eq 0 ] && grep -q SSH "$LOG" && ! grep -q SCP "$LOG"; } && ok "--setup: still reaches the server, unaffected" || bad "--setup (rc=$RC out='$OUT')"

echo ""
echo "p1602: $PASS passed, $FAIL failed"
[ "$FAIL" -eq 0 ]
