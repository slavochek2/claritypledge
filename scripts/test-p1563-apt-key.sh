#!/usr/bin/env bash
# P1563 item 7: the PostgreSQL apt key check in .github/workflows/db-backup.yml.
#
# Executes the block between "# BEGIN pgdg-key-verify" and "# END pgdg-key-verify" EXACTLY as it sits
# in the workflow (extracted with sed, not re-typed), in a temporary GNUPGHOME, against:
#   1. the real key from https://www.postgresql.org/media/keys/ACCC4CF8.asc      must PASS
#   2. a throwaway key whose fingerprint was swapped in for the pinned one       must PASS  (harness control)
#   3. a different throwaway key under the real pinned fingerprint                must FAIL  (wrong key)
#   4. the real key + an extra throwaway key in one bundle                        must FAIL  (extra key)
#   5. throwaway key + extra throwaway key, expected = first                     must FAIL  (extra key, control)
#   6. an empty file / garbage                                                    must FAIL
#   7. the expected key with an added SUBKEY                                      must PASS  (subkeys are not primary keys)
# plus structural checks on the workflow (https only, signed-by, no global trust store).
#
# Exits non-zero on any wrong outcome. Needs network for case 1 and 4 (set OFFLINE=1 to skip them; the
# skip is printed and is NOT a pass).
set -uo pipefail

ROOT="$(git rev-parse --show-toplevel)"
WF="$ROOT/.github/workflows/db-backup.yml"
REAL_FPR="B97B0AFCAA1A47F044F244A07FCC7D46ACCC4CF8"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT
export GNUPGHOME="$TMP/gnupg"; mkdir -p "$GNUPGHOME"; chmod 700 "$GNUPGHOME"
FAILS=0
ok()  { echo "  PASS  $1"; }
bad() { echo "  FAIL  $1"; FAILS=$((FAILS + 1)); }

# --- extract the verification block from the workflow, verbatim ---------------------------------
BLOCK="$TMP/block.sh"
sed -n '/# BEGIN pgdg-key-verify/,/# END pgdg-key-verify/p' "$WF" | sed 's/^ *//' > "$BLOCK"
[ "$(grep -c 'BEGIN pgdg-key-verify' "$BLOCK")" = "1" ] && [ "$(grep -c 'END pgdg-key-verify' "$BLOCK")" = "1" ] \
  || { echo "FAIL  verification block markers not found exactly once in $WF"; exit 1; }
[ "$(grep -c "$REAL_FPR" "$BLOCK")" = "1" ] || { echo "FAIL  the pinned fingerprint is not in the block exactly once"; exit 1; }

# run_block <asc-file> [expected-fpr]  -> exit status of the workflow block (same shell options as the step)
run_block() {
  local asc="$1" expected="${2:-$REAL_FPR}"
  sed "s/$REAL_FPR/$expected/" "$BLOCK" > "$TMP/block.run.sh"
  PGDG_ASC="$asc" bash -c 'set -euo pipefail; . "$1"' _ "$TMP/block.run.sh" > "$TMP/run.out" 2>&1
}
expect_pass() { local name="$1"; shift; if run_block "$@"; then ok "$name"; else bad "$name (block exited non-zero)"; sed 's/^/        /' "$TMP/run.out" | head -5; fi; }
expect_fail() { local name="$1"; shift; if run_block "$@"; then bad "$name (block exited 0, expected failure)"; else ok "$name"; sed 's/^/        /' "$TMP/run.out" | head -2; fi; }

# --- throwaway keys ------------------------------------------------------------------------------
mkkey() { # name -> $TMP/<name>.asc, echoes primary fingerprint
  # User ID without an email address: an email-shaped string trips the privacy gate, and the
  # leading '=' makes the lookup an exact user-ID match.
  gpg --batch --quiet --passphrase '' --quick-gen-key "P1563 test key $1" rsa2048 sign never 2>/dev/null
  local fpr; fpr="$(gpg --batch --with-colons --list-keys "=P1563 test key $1" | awk -F: '$1=="pub"{p=1;next} $1=="fpr"&&p{print $10;exit}')"
  gpg --batch --armor --export "$fpr" > "$TMP/$1.asc"
  echo "$fpr"
}
FPR_A="$(mkkey alpha)"; FPR_B="$(mkkey bravo)"
[ -n "$FPR_A" ] && [ -n "$FPR_B" ] && [ "$FPR_A" != "$FPR_B" ] || { echo "FAIL  could not generate throwaway keys"; exit 1; }
# alpha + a subkey
gpg --batch --quiet --passphrase '' --quick-add-key "$FPR_A" rsa2048 encr never 2>/dev/null
gpg --batch --armor --export "$FPR_A" > "$TMP/alpha-sub.asc"
SUBS="$(gpg --batch --with-colons --show-keys "$TMP/alpha-sub.asc" | grep -c '^sub:')"
cat "$TMP/alpha.asc" "$TMP/bravo.asc" > "$TMP/alpha+bravo.asc"
: > "$TMP/empty.asc"; echo "not a key" > "$TMP/garbage.asc"

echo "== the block, against throwaway keys (harness controls)"
expect_pass "control: expected key alone passes (pinned value swapped for alpha's)"         "$TMP/alpha.asc" "$FPR_A"
expect_fail "wrong key: bravo presented where alpha is expected"                            "$TMP/bravo.asc" "$FPR_A"
expect_fail "extra key: alpha+bravo bundle, alpha expected"                                 "$TMP/alpha+bravo.asc" "$FPR_A"
expect_fail "extra key: alpha+bravo bundle, bravo expected"                                 "$TMP/alpha+bravo.asc" "$FPR_B"
expect_fail "empty file"                                                                    "$TMP/empty.asc" "$FPR_A"
expect_fail "garbage file"                                                                  "$TMP/garbage.asc" "$FPR_A"
if [ "$SUBS" -ge 1 ]; then expect_pass "expected key that carries $SUBS subkey(s) still passes (subkeys are not primary keys)" "$TMP/alpha-sub.asc" "$FPR_A"; else bad "harness: subkey fixture has no subkey"; fi
# the pinned value itself, against a key that is not the real one
expect_fail "pinned PostgreSQL fingerprint rejects a throwaway key"                         "$TMP/alpha.asc"

echo "== the block, against the real PostgreSQL key (pinned fingerprint, unmodified block)"
if [ "${OFFLINE:-0}" = "1" ]; then
  echo "  SKIPPED  OFFLINE=1: real-key cases did not run. Not a pass."
elif curl -fsSL --proto '=https' --tlsv1.2 https://www.postgresql.org/media/keys/ACCC4CF8.asc -o "$TMP/real.asc"; then
  expect_pass "real postgresql.org key matches the pinned fingerprint"                       "$TMP/real.asc"
  cat "$TMP/real.asc" "$TMP/alpha.asc" > "$TMP/real+alpha.asc"
  expect_fail "real key + one extra throwaway key in the same file is rejected"              "$TMP/real+alpha.asc"
  cat "$TMP/alpha.asc" "$TMP/real.asc" > "$TMP/alpha+real.asc"
  expect_fail "extra key placed BEFORE the real key is rejected too"                          "$TMP/alpha+real.asc"
else
  bad "could not download the real key (set OFFLINE=1 to skip knowingly)"
fi

echo "== workflow structure"
# structural FILE -> prints one line per violated rule; empty output = clean. Comment lines are ignored
# for the rules on what the step RUNS; the verification-block marker is itself a comment, so that one
# rule reads the unstripped step (stripping first made it unfindable and the rule always failed).
structural() {
  local f="$1" raw step; raw="$(sed -n '/- name: Install pg_dump/,/- name: Authenticate to GCP/p' "$f")"
  step="$(printf '%s\n' "$raw" | grep -vE '^[[:space:]]*#')"
  has() { printf '%s\n' "$step" | grep -qE -- "$1"; }
  has "curl .*--proto '=https'.*https://www.postgresql.org/media/keys/ACCC4CF8.asc" || echo "key not fetched with --proto =https"
  has 'deb \[signed-by=/usr/share/keyrings/postgresql\.gpg\] https://apt\.postgresql\.org/' || echo "repo line lacks signed-by + https"
  if has 'http://'; then echo "plain http:// remains"; fi
  if has 'trusted\.gpg\.d|apt-key'; then echo "key goes to the global trust store"; fi
  printf '%s\n' "$raw" | grep -qF -- '# BEGIN pgdg-key-verify' || echo "no fingerprint verification block"
}
NEWV="$(structural "$WF")"
if [ -z "$NEWV" ]; then ok "new workflow step satisfies every structural rule"; else bad "structural violations: $NEWV"; fi
git -C "$ROOT" show HEAD:.github/workflows/db-backup.yml > "$TMP/old-wf.yml" 2>/dev/null || true
if [ -s "$TMP/old-wf.yml" ] && ! grep -q 'BEGIN pgdg-key-verify' "$TMP/old-wf.yml"; then
  OLDV="$(structural "$TMP/old-wf.yml")"
  if [ -n "$OLDV" ]; then ok "control: the pre-change workflow (git HEAD) violates the rules, so the checks can fail: $(printf '%s' "$OLDV" | tr '\n' ';')"; else bad "control: the structural checks passed the OLD workflow, they are blind"; fi
fi
STEP="$TMP/step.txt"; sed -n '/- name: Install pg_dump/,/- name: Authenticate to GCP/p' "$WF" > "$STEP"
V="$(grep -n 'END pgdg-key-verify' "$STEP" | head -1 | cut -d: -f1)"; D="$(grep -n 'gpg --batch --dearmor' "$STEP" | head -1 | cut -d: -f1)"
if [ -n "$V" ] && [ -n "$D" ] && [ "$V" -lt "$D" ]; then ok "verification block precedes the dearmor/install line"; else bad "verification does not precede install"; fi
# YAML sanity
if command -v python3 >/dev/null && python3 -c 'import yaml' 2>/dev/null; then python3 -c 'import yaml,sys; yaml.safe_load(open(sys.argv[1]))' "$WF" && ok "workflow parses as YAML" || bad "workflow YAML does not parse"; elif command -v node >/dev/null; then echo "  (no PyYAML; YAML parse not checked here)"; fi

echo
if [ "$FAILS" -eq 0 ]; then echo "RESULT: all checks passed"; exit 0; else echo "RESULT: $FAILS check(s) FAILED"; exit 1; fi
