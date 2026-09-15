#!/usr/bin/env bash
# test-keyring-escrow.sh — P1322: hermetic checks for the offline recovery escrow.
#
# Raises NO dialogs: every keychain item is a throwaway holding a dummy value, the image
# passphrase comes from stdin, and the drill runs with zero read-backs (a read-back is a real
# authorization dialog). What this therefore CANNOT cover, stated so a green run is not read as
# more than it is: the macOS passphrase dialog (-agentpass), the per-key Allow dialogs of a real
# export, and a read-back of a restored item. Those are the founder-run drill on the real set.
#
# Every property is checked against a known-bad AND a known-good input, so a check that answers
# the same for both is visible as blind rather than passing.
set -uo pipefail
cd "$(dirname "$0")/.."
ROOT="$(pwd)"
# Importing the module would otherwise leave scripts/lib/__pycache__ behind, and the P887 canary
# copies every entry of scripts/lib as a file — it failed on that directory the first time.
export PYTHONDONTWRITEBYTECODE=1
PY="$ROOT/scripts/lib/keyring_escrow.py"
KC="$ROOT/scripts/lib/keychain.py"

pass=0; fail=0
ok()   { printf '  PASS  %s\n' "$1"; pass=$((pass+1)); }
bad()  { printf '  FAIL  %s\n' "$1"; fail=$((fail+1)); }
check(){ if [ "$1" = "$2" ]; then ok "$3"; else bad "$3 (got '$1', want '$2')"; fi; }

T="$(mktemp -d "${TMPDIR:-/tmp}/p1322-escrow.XXXXXX")"
T="$(cd "$T" && pwd -P)"
NAMES="P1322_ESCROW_TEST_A P1322_ESCROW_TEST_B"
DUMMY_A="p1322-dummy-A-$(openssl rand -hex 8)"
DUMMY_B="p1322-dummy-B-$(openssl rand -hex 8)"
IMGPASS="$(openssl rand -hex 16)"
export DUMMY_A DUMMY_B

cleanup() {
  for n in $NAMES; do
    python3 "$KC" delete "cp.keyring.escrowdrill.$n" >/dev/null 2>&1
    python3 "$KC" delete "cp.keyring.$n" >/dev/null 2>&1
  done
  for m in "$T"/mnt/*; do [ -d "$m" ] && hdiutil detach -force "$m" >/dev/null 2>&1; done
  rm -rf "$T"
}
trap cleanup EXIT
cleanup_items_only() { for n in $NAMES; do python3 "$KC" delete "cp.keyring.$n" >/dev/null 2>&1; done; }

pyrun() { PYTHONPATH="$ROOT/scripts/lib" python3 -c "$1"; }

echo "P1322 keyring escrow selftest"
echo

echo "[1] bundle format round-trips awkward bytes, and refuses malformed input"
out=$(pyrun '
import keyring_escrow as e
pairs=[("A",b"x\ny\t\x27\x22\x00\xff end"),("B_2",b"plain")]
print("roundtrip", e.parse(e.serialize(pairs))==pairs)
def code(f):
    try: f(); return "accepted"
    except e.EscrowError as x: return "refused%d" % x.code
print("badheader", code(lambda: e.parse(b"not-escrow\nA\tYQ==\n")))
print("dupe", code(lambda: e.parse(e.HEADER+b"\nA\tYQ==\nA\tYg==\n")))
print("emptyvalue", code(lambda: e.serialize([("A",b"")])))
print("badname", code(lambda: e.serialize([("lower",b"v")])))
print("nokeys", code(lambda: e.parse(e.HEADER+b"\n")))
print("goodcontrol", code(lambda: e.parse(e.HEADER+b"\nA\tYQ==\n")))
')
check "$(echo "$out" | awk '/^roundtrip/{print $2}')" "True" "newline, tab, quotes, NUL and high bytes survive the round trip"
check "$(echo "$out" | awk '/^badheader/{print $2}')" "refused2" "a file without the version header is refused"
check "$(echo "$out" | awk '/^dupe/{print $2}')" "refused2" "a duplicate key is refused"
check "$(echo "$out" | awk '/^emptyvalue/{print $2}')" "refused2" "an empty value is never escrowed"
check "$(echo "$out" | awk '/^badname/{print $2}')" "refused2" "an invalid key name is refused"
check "$(echo "$out" | awk '/^nokeys/{print $2}')" "refused2" "an empty bundle is refused"
check "$(echo "$out" | awk '/^goodcontrol/{print $2}')" "accepted" "control: a well-formed bundle is accepted"

echo "[2] the image may not live in a checkout, under \$HOME, or off removable media"
touch "$T/already-there.dmg"
out=$(ROOTP="$ROOT" TP="$T" pyrun '
import os, keyring_escrow as e
# First clause of the reason only. Split on ". " (a sentence break), never a bare ".", which
# occurs inside the temp directory name and truncated a correct refusal on the first run.
r=lambda *a, **k: (e.check_destination(*a, **k) or "ALLOWED").split(". ")[0].split(",")[0]
print("git|" + r(os.environ["ROOTP"]+"/escrow.dmg", allow_any=True))
print("home|" + r(os.path.expanduser("~")+"/p1322-never-created.dmg"))
print("novol|" + r("/Volumes/p1322-no-such-volume/e.dmg"))
print("offmedia|" + r(os.environ["TP"]+"/e.dmg"))
print("exists|" + r(os.environ["TP"]+"/already-there.dmg", allow_any=True))
print("control|" + r(os.environ["TP"]+"/e.dmg", allow_any=True))
')
field() { echo "$out" | awk -F'|' -v k="$1" '$1==k{print $2}'; }
check "$(field git)" "inside a git checkout" "inside a checkout: refused even with the override"
check "$(field home)" "under \$HOME" "under \$HOME (the backup set): refused"
check "$(field novol)" "directory does not exist: /Volumes/p1322-no-such-volume" "a missing volume: refused"
check "$(field offmedia)" "not on removable media under /Volumes" "off removable media without the override: refused"
check "$(field exists)" "refusing to overwrite an existing file: $T/already-there.dmg" "an existing file: never overwritten"
check "$(field control)" "ALLOWED" "control: an ordinary directory with the explicit override is allowed"

echo "[3] the container is really encrypted, and the passphrase really gates it"
out=$(IMG="$T/e.dmg" PASSW="$IMGPASS" pyrun '
import os, keyring_escrow as e
blob=e.serialize([("P1322_ESCROW_TEST_A",os.environ["DUMMY_A"].encode()),("P1322_ESCROW_TEST_B",os.environ["DUMMY_B"].encode())])
e.write_image(os.environ["IMG"], blob, os.environ["PASSW"].encode())
print("readback", e.read_image(os.environ["IMG"], os.environ["PASSW"].encode())==blob)
try:
    e.read_image(os.environ["IMG"], b"wrong-passphrase"); print("wrongpass accepted")
except e.EscrowError as x: print("wrongpass refused%d" % x.code)
' 2>&1)
check "$(echo "$out" | awk '/^readback/{print $2}')" "True" "the bundle reads back identical through the passphrase"
check "$(echo "$out" | awk '/^wrongpass/{print $2}')" "refused3" "a wrong passphrase does not open the image"
# base64 of the dummy is what the bundle holds; search the raw image bytes for it.
b64a=$(printf '%s' "$DUMMY_A" | base64)
check "$(LC_ALL=C grep -c -a -F "$b64a" "$T/e.dmg")" "0" "the dummy value is absent from the encrypted image's raw bytes"
# Control for that grep: the same content in an UNencrypted image must be findable, or the check is blind.
mkdir -p "$T/plainsrc" && printf 'P1322_ESCROW_TEST_A\t%s\n' "$b64a" > "$T/plainsrc/escrow.bundle"
hdiutil create -srcfolder "$T/plainsrc" -format UDRW -fs APFS "$T/plain.dmg" >/dev/null 2>&1
hits=$(LC_ALL=C grep -c -a -F "$b64a" "$T/plain.dmg")
if [ "${hits:-0}" -gt 0 ]; then ok "control: the same grep finds the value in an unencrypted image"
else bad "control: grep could not find the value even unencrypted, so the absence check above is blind"; fi

echo "[4] the plaintext-loss sandbox denies what it claims to, and nothing else"
printf 'FAKE=1\n' > "$T/.env.local"; printf 'other\n' > "$T/other.txt"
outside=$(PYTHONPATH="$ROOT/scripts/lib" python3 -c "import keyring_escrow as e; print(len(e.denial_failures(['$T/.env.local'])))")
check "$outside" "1" "control: outside the sandbox the stand-in env file is readable"
prof=$(PYTHONPATH="$ROOT/scripts/lib" python3 -c "import keyring_escrow as e; print(e.sandbox_profile(['$T/.env.local']))")
inside=$(sandbox-exec -p "$prof" env PYTHONPATH="$ROOT/scripts/lib" python3 -c "import keyring_escrow as e; print(len(e.denial_failures(['$T/.env.local'])), open('$T/other.txt').read().strip())" 2>&1)
check "$inside" "0 other" "inside: the env file is unreadable while an unrelated file still reads"

echo "[5] drill: restores with the env files unreadable, gates every item, cleans up"
printf 'P1322_ESCROW_TEST_A\nP1322_ESCROW_TEST_B\n' > "$T/registry.txt"
drill_out=$(printf '%s\n' "$IMGPASS" | KEYRING_REGISTRY="$T/registry.txt" KEYRING_ESCROW_DENY="$T/.env.local" \
  python3 "$PY" drill "$T/e.dmg" 0 --passphrase-stdin 2>&1); drill_rc=$?
check "$drill_rc" "0" "drill exits 0 on a complete escrow"
case "$drill_out" in *"DRILL PASS"*) ok "drill reports DRILL PASS" ;; *) bad "no DRILL PASS line: $drill_out" ;; esac
case "$drill_out" in *"SIMULATED plaintext loss:"*"all unreadable here"*) ok "the loss simulation was confirmed from inside the sandbox" ;;
  *) bad "the drill did not confirm the env files were unreadable" ;; esac
case "$drill_out" in *"did not exist before"*) ok "each restore targeted an item confirmed absent first" ;; *) bad "no absent-before confirmation" ;; esac
case "$drill_out" in *"GATED"*) ok "restored items were checked for an intact gate" ;; *) bad "no gate check in drill output" ;; esac
left=0; for n in $NAMES; do python3 "$KC" exists "cp.keyring.escrowdrill.$n" && left=$((left+1)); done
check "$left" "0" "no drill item is left in the keychain"
all_out="$drill_out"

echo "[5b] drill FAILS when a registered key is missing from the escrow"
printf 'P1322_ESCROW_TEST_A\nP1322_ESCROW_TEST_B\nP1322_ESCROW_TEST_C\n' > "$T/registry-more.txt"
miss_out=$(printf '%s\n' "$IMGPASS" | KEYRING_REGISTRY="$T/registry-more.txt" KEYRING_ESCROW_DENY="$T/.env.local" \
  python3 "$PY" drill "$T/e.dmg" 0 --passphrase-stdin 2>&1); miss_rc=$?
check "$miss_rc" "2" "an incomplete escrow fails the drill"
case "$miss_out" in *"MISSING   P1322_ESCROW_TEST_C"*) ok "the missing key is named" ;; *) bad "missing key not named" ;; esac
all_out="$all_out
$miss_out"

echo "[5c] drill FAILS when the plaintext is still readable (the simulation is not in effect)"
blind_out=$(printf '%s\n' "$IMGPASS" | KEYRING_REGISTRY="$T/registry.txt" KEYRING_ESCROW_PRESENT="$T/.env.local" \
  python3 "$PY" _drill-inner "$T/e.dmg" 0 --passphrase-stdin 2>&1); blind_rc=$?
check "$blind_rc" "2" "run outside the sandbox, the drill refuses instead of passing"
case "$blind_out" in *"NOT simulated"*) ok "and says the simulation is not in effect" ;; *) bad "no not-simulated message: $blind_out" ;; esac
all_out="$all_out
$blind_out"

echo "[6] restore: creates gated items, and never replaces an existing one"
cleanup_items_only
r1=$(printf '%s\n' "$IMGPASS" | python3 "$PY" restore "$T/e.dmg" --passphrase-stdin 2>&1); r1_rc=$?
check "$r1_rc" "0" "restore into an empty keychain slot exits 0"
gate=$(python3 "$KC" acl cp.keyring.P1322_ESCROW_TEST_A cp.keyring.P1322_ESCROW_TEST_B >/dev/null 2>&1; echo $?)
check "$gate" "0" "restored items pass the Always-Allow detector (gate intact)"
r2=$(printf '%s\n' "$IMGPASS" | python3 "$PY" restore "$T/e.dmg" --passphrase-stdin 2>&1); r2_rc=$?
check "$r2_rc" "1" "a second restore refuses to replace existing items"
case "$r2" in *"SKIP      P1322_ESCROW_TEST_A already enrolled"*) ok "and names the item it skipped" ;; *) bad "no skip message: $r2" ;; esac
r3=$(printf '%s\n' "$IMGPASS" | python3 "$PY" restore "$T/e.dmg" P1322_NOT_IN_ESCROW --passphrase-stdin 2>&1); r3_rc=$?
check "$r3_rc" "1" "asking for a key the escrow lacks is refused"
cleanup_items_only
all_out="$all_out
$r1
$r2
$r3"

echo "[7] nothing printed a value, and status lines stay redirect-safe"
leaks=$(printf '%s\n' "$all_out" | grep -c -F -e "$DUMMY_A" -e "$DUMMY_B" -e "$b64a")
check "$leaks" "0" "no dummy value, raw or base64, in any command output"
unsafe=$(printf '%s\n' "$all_out" | grep -v '^keyring: requesting' | grep -c '[<>|]')
check "$unsafe" "0" "no status line contains a redirect-parseable character"
argv=$(grep -cE '_keychain\("add", [a-z_]+, [a-z_]+\)' "$PY")
check "$argv" "0" "values reach the keychain over stdin only, never as an argument"

echo
echo "Result: $pass passed, $fail failed"
[ "$fail" -eq 0 ]
