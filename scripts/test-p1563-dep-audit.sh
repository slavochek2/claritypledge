#!/usr/bin/env bash
# test-p1563-dep-audit.sh — scripts/dep-audit.sh must report clean / finding / incomplete with three
# distinct exit codes, and must never report INCOMPLETE as clean (P1563 item 10).
#
# Every case drives the REAL entry point (scripts/dep-audit.sh --root <fixture>) against nested
# fixtures under scripts/fixtures/p1563-dep-audit/ (manifests one level down, like a real repo) and
# asserts the exit code AND a line of output. This suite needs the network: it makes live OSV
# lookups and runs `npm audit` — the malicious case IS the live proof that OSV's batch interface
# covers a known-malicious version (keyv@6.0.0 is MAL-2026-11524; it was unpublished from npm, so
# the fixture lock is hand-built and cannot be resolved by `npm install`).
#
# Fixtures are stored as `<manifest name>.fixture` and staged into a temp dir under their real names
# before each run, so no committed file in scripts/fixtures/p1563-dep-audit looks like a manifest.
#
# Sections:
#   0. fixture hygiene — the committed fixture dir contains zero manifest-named files
#   1. spec cases    — clean, malicious, critical, lookup failure, no lock, exceptions suppress
#   2. negative controls — a wrong exception does NOT suppress; a MAL- hit cannot be excepted;
#                      FINDING wins over INCOMPLETE but still lists it; empty root and a malformed
#                      exceptions file are INCOMPLETE
#   3. other formats — deno.lock and Python requirements (exact pins clean, ranges incomplete,
#                      deno.land without an `unchecked` exception incomplete, with one clean);
#                      3b: every install-changing requirements directive (-r, -c, -e, -f, alternate
#                      index) is INCOMPLETE, option-only lines and uv hash-locked files are not;
#                      3c: NODE_ENV / npm_config_omit in the caller's environment cannot hide a
#                      dev-only critical
#   3d: a mock OSV (local HTTP stub) returning {"results":[null]}, wrong-length, non-JSON, a JSON
#                      array or HTTP 500 is INCOMPLETE (exit 2), with controls proving the same mock
#                      yields CLEAN and FINDING; an unexpected crash is INCOMPLETE, not exit 1
#   4. exclusions    — a manifest placed inside the excluded fixture path, under .claude or under
#                      node_modules is skipped (positive control: the same file elsewhere is
#                      inventoried); the real-repo run prints the exclusion list
#   5. gate 7d       — the malicious case rebuilt by mutating a COPY of the real root
#                      package-lock.json (one existing entry's version -> keyv@6.0.0)
#   6. output safety — no output line carries a shell redirect token (rules/shell-safety.md)
#
# Exit 0: all assertions held. Exit 1: at least one did not.

set -uo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
AUDIT="$ROOT/scripts/dep-audit.sh"
FX_SRC="$ROOT/scripts/fixtures/p1563-dep-audit"
TMP="$(mktemp -d)"; MOCK_PID=""
trap '[ -n "$MOCK_PID" ] && kill "$MOCK_PID" 2>/dev/null; rm -rf "$TMP"' EXIT
# The committed fixtures carry NO real manifest names (GitHub's dependency graph would parse a
# committed package-lock.json / requirements.lock / deno.lock and raise standing alerts on the known-bad
# versions). Each case is copied into a fresh temp dir and the `.fixture` suffix is stripped there.
FX="$TMP/fx"
mkdir -p "$FX"; cp -R "$FX_SRC"/. "$FX"/
find "$FX" -type f -name '*.fixture' | while IFS= read -r f; do mv "$f" "${f%.fixture}"; done
pass=0; fail=0

ok()   { echo "  ok   $1"; pass=$((pass+1)); }
bad()  { echo "  FAIL $1"; fail=$((fail+1)); }
# run <args...>: sets OUT and RC. --exceptions defaults to an empty file so the committed real
# exceptions file never influences a fixture run.
: > "$TMP/none.txt"
run()  { OUT="$("$AUDIT" "$@" 2>&1)"; RC=$?; }
rc()   { if [ "$RC" = "$2" ]; then ok "$1: exit $RC"; else bad "$1: expected exit $2, got $RC"; echo "$OUT" | sed 's/^/       | /'; fi; }
has()  { if grep -qF -- "$2" <<<"$OUT"; then ok "$1: output has '$2'"; else bad "$1: output lacks '$2'"; echo "$OUT" | sed 's/^/       | /'; fi; }
lacks(){ if grep -qF -- "$2" <<<"$OUT"; then bad "$1: output must not have '$2'"; else ok "$1: output lacks '$2'"; fi; }

echo "0. fixture hygiene"
NAMED="$(find "$FX_SRC" -type f \( -name package.json -o -name package-lock.json -o -name deno.lock -o -name deno.json -o -name deno.jsonc -o -name import_map.json -o -name 'requirements*.txt' -o -name 'requirements*.lock' -o -name '*.in' -o -name pyproject.toml -o -name setup.cfg -o -name setup.py -o -name Pipfile \))"
if [ -z "$NAMED" ]; then ok "committed fixture dir has no manifest-named files"; else bad "manifest-named fixture files committed:"; echo "$NAMED" | sed 's/^/       | /'; fi
if [ -n "$(find "$FX" -type f -name package-lock.json)" ]; then ok "staging produced real-named manifests in the temp copy"; else bad "staging produced no package-lock.json"; fi

echo "1. spec cases"
run --root "$FX/clean" --exceptions "$TMP/none.txt"
rc "(a) clean control" 0; has "(a) clean control" "RESULT: CLEAN"

run --root "$FX/malicious" --exceptions "$FX/malicious/exceptions.txt"
rc "(b) malicious (npm-audit malware advisory listed in exceptions)" 1
has "(b) malicious" "MALICIOUS keyv@6.0.0 (MAL-"
has "(b) malicious" "npm audit MALWARE advisory keyv"
run --root "$FX/malicious" --exceptions "$TMP/none.txt"
rc "(b) malicious (no exceptions)" 1; has "(b) malicious" "MALICIOUS keyv@6.0.0 (MAL-"

run --root "$FX/critical" --exceptions "$TMP/none.txt"
rc "(c) critical" 1; has "(c) critical" "npm audit CRITICAL minimist GHSA-xvch-5gv4-984h"
has "(c) critical" "RESULT: FINDING"

run_d() { OUT="$(DEP_AUDIT_OSV_URL=http://127.0.0.1:9/ "$AUDIT" --root "$FX/clean" --exceptions "$TMP/none.txt" 2>&1)"; RC=$?; }
run_d
rc "(d) lookup failure" 2; has "(d) lookup failure" "OSV lookup failed"
has "(d) lookup failure" "RESULT: INCOMPLETE"; lacks "(d) lookup failure" "RESULT: CLEAN"
D_OUT="$OUT"

run --root "$FX/nolock" --exceptions "$TMP/none.txt"
rc "(e) package.json without lock" 2; has "(e) no lock" "has no lock file"

run --root "$FX/critical" --exceptions "$FX/critical/exceptions.txt"
rc "(f) exceptions file suppresses the critical" 0; has "(f) exceptions" "RESULT: CLEAN"

echo "2. negative controls"
printf 'app/package-lock.json minimist GHSA-0000-0000-0000 # wrong advisory id\n' > "$TMP/wrong.txt"
run --root "$FX/critical" --exceptions "$TMP/wrong.txt"
rc "wrong exception does not suppress" 1; has "wrong exception" "npm audit CRITICAL minimist"
has "wrong exception" "unused exception"

printf 'app/package-lock.json keyv MAL-2026-11524 # attempt to except a malicious hit\n' > "$TMP/mal.txt"
run --root "$FX/malicious" --exceptions "$TMP/mal.txt"
rc "MAL- hit cannot be excepted" 1; has "MAL- exception" "MALICIOUS keyv@6.0.0"

mkdir -p "$TMP/mixed"; cp -R "$FX/malicious/app" "$TMP/mixed/mal"; cp -R "$FX/nolock/app" "$TMP/mixed/nolock"
run --root "$TMP/mixed" --exceptions "$FX/malicious/exceptions.txt"
# the fixture exceptions entry names app/..., so the npm-audit critical under mal/ is not excepted;
# FINDING must win and the incomplete part must still be listed
rc "FINDING wins over INCOMPLETE" 1; has "mixed" "FINDING: MALICIOUS keyv@6.0.0"; has "mixed" "INCOMPLETE: package.json has no lock file"
has "mixed" "RESULT: FINDING"

mkdir -p "$TMP/empty"
run --root "$TMP/empty" --exceptions "$TMP/none.txt"
rc "empty root is not clean" 2; has "empty root" "no manifests found"

printf 'app/package-lock.json minimist GHSA-xvch-5gv4-984h\n' > "$TMP/noreason.txt"
run --root "$FX/critical" --exceptions "$TMP/noreason.txt"
rc "exception without a reason is rejected" 1; has "no-reason exception" "exceptions file: line 1"
# (exit 1, not 2: the critical is still unexcepted, so FINDING wins; the bad line is listed as INCOMPLETE)

run --root "$TMP/does-not-exist" --exceptions "$TMP/none.txt"
rc "nonexistent root" 2

echo "3. other formats"
run --root "$FX/pyhash" --exceptions "$TMP/none.txt"
rc "python fully hash-locked" 0; has "python hash-locked" "fully hash-locked"
run --root "$FX/pyunhashed" --exceptions "$TMP/none.txt"
rc "python exact pins without hashes" 2; has "python unhashed" "transitive dependencies not pinned"
lacks "python unhashed" "RESULT: CLEAN"
run --root "$FX/pynodeps" --exceptions "$TMP/none.txt"
rc "python --no-deps line (pip rejects it inside a requirements file)" 2; has "python --no-deps" "requirements directive: --no-deps"
run --root "$FX/pycovered" --exceptions "$TMP/none.txt"
rc "ranged requirements.txt/.in covered by a hash-locked lock" 0; has "python covered" "covered by hash-locked svc/requirements.lock"
run --root "$FX/pyranges" --exceptions "$TMP/none.txt"
rc "python ranges" 2; has "python ranges" "without an exact =="
run --root "$FX/deno" --exceptions "$TMP/none.txt"
rc "deno.lock with deno.land entry" 2; has "deno.lock" "deno.land/std@0.224.0"
printf 'fn/deno.lock deno.land/std@0.224.0 unchecked # fixture: Deno stdlib has no OSV ecosystem\n' > "$TMP/unchecked.txt"
run --root "$FX/deno" --exceptions "$TMP/unchecked.txt"
rc "deno.lock with unchecked exception" 0; has "deno.lock" "accepted unchecked: deno.land/std@0.224.0"
run --root "$FX/deno-ranges" --exceptions "$TMP/none.txt"
rc "deno.lock esm.sh version range" 2; has "deno ranges" "version is a range"

run --root "$FX/deno-v1" --exceptions "$TMP/none.txt"
rc "deno.lock v1 (remote-only)" 0; has "deno.lock v1" "format=deno.lock (v1)"; has "deno.lock v1" "versions-checked=1"

echo "3b. requirements directives (reviewer finding: -r base.in used to exit 0 CLEAN)"
run --root "$FX/pyinclude" --exceptions "$TMP/none.txt"
rc "requirements.txt with '-r base.in'" 2; has "-r include" "requirements directive: -r"
lacks "-r include" "RESULT: CLEAN"
run --root "$FX/pyhash" --exceptions "$TMP/none.txt"
rc "uv --generate-hashes shape parses as exact pins" 0; has "uv hashes" "versions-checked=4"
has "uv hashes" "fully hash-locked"
lacks "uv hashes" "INCOMPLETE:"
# every install-changing directive, and an alternate index, is INCOMPLETE; option-only lines are not
req_case() {   # req_case <label> <expected exit> <directive line>
  rm -rf "$TMP/req"; mkdir -p "$TMP/req/svc"
  printf '%s\nidna==3.8 --hash=sha256:aa11\n' "$3" > "$TMP/req/svc/requirements.txt"
  run --root "$TMP/req" --exceptions "$TMP/none.txt"
  rc "requirements line '$3'" "$2"
}
for d in "-r base.in" "--requirement base.in" "-c cons.txt" "--constraint cons.txt" "-e ." "--editable ." \
         "-f https://example.invalid/wheels" "--find-links https://example.invalid/wheels" \
         "--index-url https://example.invalid/simple" "--extra-index-url=https://example.invalid/simple" \
         "-i http://pypi.org/simple" "--index-url https://pypi.org:pw@example.invalid/simple" "--no-such-option"; do
  req_case "directive" 2 "$d"
  lacks "requirements line '$d'" "RESULT: CLEAN"
done
req_case "option-only" 0 "--require-hashes"
req_case "invalid in a requirements file" 2 "--no-deps"
req_case "option-only" 0 "--only-binary :all:"
req_case "official index" 0 "--index-url https://pypi.org/simple"
req_case "official extra index" 0 "--extra-index-url=https://pypi.org/simple"

echo "3c. caller environment must not narrow the audit (reviewer finding: NODE_ENV=production hid a dev-only critical)"
run --root "$FX/critical-dev" --exceptions "$TMP/none.txt"
rc "dev-only critical, plain env" 1; has "dev-only critical" "npm audit CRITICAL minimist"
OUT="$(NODE_ENV=production "$AUDIT" --root "$FX/critical-dev" --exceptions "$TMP/none.txt" 2>&1)"; RC=$?
rc "dev-only critical, NODE_ENV=production" 1; has "NODE_ENV=production" "npm audit CRITICAL minimist"
OUT="$(npm_config_omit=dev "$AUDIT" --root "$FX/critical-dev" --exceptions "$TMP/none.txt" 2>&1)"; RC=$?
rc "dev-only critical, npm_config_omit=dev" 1; has "npm_config_omit=dev" "npm audit CRITICAL minimist"
OUT="$(NPM_CONFIG_PRODUCTION=true npm_config_only=prod "$AUDIT" --root "$FX/critical-dev" --exceptions "$TMP/none.txt" 2>&1)"; RC=$?
rc "dev-only critical, npm_config_production/only" 1; has "production/only" "npm audit CRITICAL minimist"

echo "3d. crashes and malformed OSV answers are INCOMPLETE, never FINDING (reviewer finding: {\"results\":[null]} exited 1)"
cat > "$TMP/mock_osv.py" <<'PYEOF'
# tiny OSV stand-in: answers every POST with the given status and body; writes its port to a file
import sys
from http.server import BaseHTTPRequestHandler, HTTPServer
portfile, status, body = sys.argv[1], int(sys.argv[2]), sys.argv[3].encode()
class H(BaseHTTPRequestHandler):
    def do_POST(self):
        self.rfile.read(int(self.headers.get("Content-Length", 0)))
        self.send_response(status); self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body))); self.end_headers(); self.wfile.write(body)
    def log_message(self, *a): pass
srv = HTTPServer(("127.0.0.1", 0), H)
open(portfile, "w").write(str(srv.server_port))
srv.serve_forever()
PYEOF
mock_run() {   # mock_run <label> <expected exit> <status> <body>: clean fixture against a mock OSV
  rm -f "$TMP/port"
  python3 -I "$TMP/mock_osv.py" "$TMP/port" "$3" "$4" & MOCK_PID=$!
  for _ in $(seq 1 50); do [ -s "$TMP/port" ] && break; sleep 0.1; done
  if [ ! -s "$TMP/port" ]; then bad "$1: mock OSV did not start"; return; fi
  OUT="$(DEP_AUDIT_OSV_URL="http://127.0.0.1:$(cat "$TMP/port")/v1/querybatch" "$AUDIT" --root "$FX/clean" --exceptions "$TMP/none.txt" 2>&1)"; RC=$?
  kill "$MOCK_PID" 2>/dev/null; wait "$MOCK_PID" 2>/dev/null; MOCK_PID=""
  rc "$1" "$2"
}
# controls first: the mock itself must be able to produce CLEAN and FINDING (otherwise exit 2 proves nothing)
mock_run "mock OSV: clean answer" 0 200 '{"results":[{}]}';                                  has "mock clean" "RESULT: CLEAN"
mock_run "mock OSV: MAL- answer" 1 200 '{"results":[{"vulns":[{"id":"MAL-TEST-0001"}]}]}';   has "mock MAL" "MAL-TEST-0001"
mock_run "mock OSV: results [null]" 2 200 '{"results":[null]}';                              has "mock null" "RESULT: INCOMPLETE"; lacks "mock null" "Traceback"
mock_run "mock OSV: results []" 2 200 '{"results":[]}';                                      has "mock empty" "OSV lookup failed"
mock_run "mock OSV: vulns is null" 2 200 '{"results":[{"vulns":5}]}';                        has "mock bad vulns" "RESULT: INCOMPLETE"
mock_run "mock OSV: not JSON" 2 200 'garbage';                                               has "mock garbage" "RESULT: INCOMPLETE"
mock_run "mock OSV: JSON array" 2 200 '[]';                                                  has "mock array" "RESULT: INCOMPLETE"
mock_run "mock OSV: HTTP 500" 2 500 '{}';                                                    has "mock 500" "OSV lookup failed"
OUT="$(DEP_AUDIT_SELFTEST_CRASH=1 "$AUDIT" --root "$FX/clean" --exceptions "$TMP/none.txt" 2>&1)"; RC=$?
rc "unexpected crash (top-level guard)" 2; has "crash guard" "INCOMPLETE: internal error: RuntimeError"; lacks "crash guard" "Traceback"
printf '\377\376 not utf-8\n' > "$TMP/binary-exceptions.txt"
run --root "$FX/clean" --exceptions "$TMP/binary-exceptions.txt"
rc "unreadable (non-UTF-8) exceptions file" 2; has "binary exceptions" "exceptions file: unreadable"

echo "3e. undiscovered surfaces must not be silent (reviewer finding A)"
alone() {   # alone <label> <file name relative to the root> <file content>: the file by itself in a fresh root
  rm -rf "$TMP/alone"; mkdir -p "$TMP/alone/$(dirname "$2")"; printf '%s\n' "$3" > "$TMP/alone/$2"
  run --root "$TMP/alone" --exceptions "$TMP/none.txt"
  rc "$1 alone" 2; lacks "$1 alone" "RESULT: CLEAN"
}
alone "deno.json" fn/deno.json '{"imports": {}}'
alone "deno.jsonc" fn/deno.jsonc '{"imports": {}}'
alone "import_map.json" fn/import_map.json '{"imports": {}}'
has "import_map.json" "no deno.lock next to this config"
alone "pyproject.toml" svc/pyproject.toml '[project]'
alone "Pipfile" svc/Pipfile '[packages]'
alone "setup.cfg" svc/setup.cfg '[metadata]'
alone "setup.py" svc/setup.py 'from setuptools import setup'
alone "requirements.in" svc/requirements.in 'requests'
alone "constraints.txt" svc/constraints.txt 'requests==2.31.0'
alone "dev-requirements.txt" svc/dev-requirements.txt 'pytest>=7'
alone "requirements/base.txt" svc/requirements/base.txt 'requests>=2'
run --root "$FX/denocovered" --exceptions "$TMP/none.txt"
rc "deno.json covered by deno.lock in the same dir" 0; has "deno.json covered" "covered by fn/deno.lock"
run --root "$FX/denoancestor" --exceptions "$TMP/none.txt"
rc "deno.json under an ancestor lock that no workspace lists (loose coverage is gone)" 2; has "deno.json ancestor" "no ancestor config lists it in a workspace"
run --root "$FX/denoworkspace" --exceptions "$TMP/none.txt"
rc "deno.json listed in an ancestor workspace, all imports in the lock" 0; has "deno workspace" "covered by deno.lock (all 1 remote import(s) listed)"

echo "3f. npm lock rules (reviewer findings D, E, F)"
run --root "$FX/nonregistry" --exceptions "$TMP/none.txt"
rc "lock entry resolved outside the registry, no integrity" 2; has "non-registry" "not the registry package they claim to be"
has "non-registry" "node_modules/left-pad"
run --root "$FX/nopkgjson" --exceptions "$TMP/none.txt"
rc "package-lock.json without a sibling package.json" 2; has "no package.json" "lock has no sibling package.json"
run --root "$FX/lockv1" --exceptions "$TMP/none.txt"
rc "lockfileVersion 1" 0; has "lockfileVersion 1" "package-lock.json (v1)"; has "lockfileVersion 1" "versions-checked=1"
run --root "$FX/lockv99" --exceptions "$TMP/none.txt"
rc "unsupported lockfileVersion 99" 2; has "lockfileVersion 99" "unsupported lockfileVersion 99"
run --root "$FX/malicious" --exceptions "$FX/malicious/exceptions.txt"
rc "npm-audit 'Malware in' advisory cannot be excepted" 1; has "malware exception" "FINDING: npm audit MALWARE advisory keyv"

echo "3g. discovery problems and exception wildcards"
rm -rf "$TMP/disc"; mkdir -p "$TMP/disc/real/app" "$TMP/disc/hidden"
cp "$FX/clean/app/package.json" "$FX/clean/app/package-lock.json" "$TMP/disc/real/app/"
ln -s "$TMP/disc/real" "$TMP/disc/linked"
run --root "$TMP/disc" --exceptions "$TMP/none.txt"
rc "symlinked directory is reported, not skipped" 2; has "symlink" "symlinked directory not followed: linked"
rm -f "$TMP/disc/linked"
chmod 000 "$TMP/disc/hidden"
run --root "$TMP/disc" --exceptions "$TMP/none.txt"
chmod 755 "$TMP/disc/hidden"
rc "unreadable directory is reported, not skipped" 2; has "unreadable dir" "unreadable directory: hidden"
run --root "$TMP/disc" --exceptions "$TMP/none.txt"
rc "control: readable tree without the symlink or locked dir" 0
printf 'app/package-lock.json ? unattributed # wildcard\n' > "$TMP/wild1.txt"
run --root "$FX/critical" --exceptions "$TMP/wild1.txt"
rc "wildcard exception line rejected (critical stays a finding)" 1; has "wildcard" "wildcard or unattributed entries are not allowed"
run --root "$FX/clean" --exceptions "$TMP/wild1.txt"
rc "wildcard exception line makes an otherwise clean run INCOMPLETE" 2

echo "3h. python coverage needs a lock that names the input (pass-2 finding 1)"
run --root "$FX/pyfamily" --exceptions "$TMP/none.txt"
rc "independent requirements-dev.txt beside a hash-locked file" 2
has "pyfamily" "svc/requirements-dev.txt"; has "pyfamily" "names requirements-dev.txt in its header"
has "pyfamily" "covered by hash-locked svc/requirements.lock (its header names requirements.txt)"
run --root "$FX/pydirective" --exceptions "$TMP/none.txt"
rc "coverage does not erase a -r include in the covered input" 2; has "pydirective" "requirements directive: -r"
has "pydirective" "covered by hash-locked"
rm -rf "$TMP/unnamed"; mkdir -p "$TMP/unnamed"; cp "$FX/pyfamily/svc/requirements.txt" "$TMP/unnamed/"; sed 1d "$FX/pyfamily/svc/requirements.lock" > "$TMP/unnamed/requirements.lock"
run --root "$TMP/unnamed" --exceptions "$TMP/none.txt"
rc "a hash-locked file without a header naming the input covers nothing" 2; lacks "unnamed lock" "covered by hash-locked"

echo "3i. deno coverage (pass-2 finding 2)"
run --root "$FX/denounmatched" --exceptions "$TMP/none.txt"
rc "deno.json import missing from its lock" 2; has "deno unmatched" "not listed in fn/deno.lock"; has "deno unmatched" "npm:is-odd@3.0.1"
run --root "$FX/denomalunlisted" --exceptions "$TMP/none.txt"
rc "unlisted malicious npm: import is a FINDING (config imports go to OSV)" 1; has "deno malicious import" "MALICIOUS keyv@6.0.0 (MAL-"
run --root "$FX/denolockfalse" --exceptions "$TMP/none.txt"
rc "deno.json with \"lock\": false" 2; has "lock false" 'lock disabled ("lock": false)'
run --root "$FX/denonointegrity" --exceptions "$TMP/none.txt"
rc "deno.lock npm entry without integrity" 2; has "no integrity" "deno.lock npm entry without integrity"
run --root "$FX/denosrc" --exceptions "$TMP/none.txt"
rc "ts source with remote imports, all listed in the lock" 0; has "denosrc" "all 2 remote import(s) listed in deno.lock"
run --root "$FX/denosrc-nolock" --exceptions "$TMP/none.txt"
rc "ts source with remote imports and no deno.lock or config" 2; has "denosrc-nolock" "with no deno.lock in this or an ancestor directory"
has "denosrc-nolock" "supabase-js@2"
run --root "$FX/denosrc-mal" --exceptions "$TMP/none.txt"
rc "ts source importing a malicious npm: version" 1; has "denosrc-mal" "MALICIOUS keyv@6.0.0 (MAL-"
run --root "$FX/denosrc-unmatched" --exceptions "$TMP/none.txt"
rc "ts source import missing from the lock" 2; has "denosrc-unmatched" "npm:is-odd@3.0.1"

echo "3j. npm lock entry identity, bundled and link entries (pass-2 findings 3 and 4)"
run --root "$FX/nameswap" --exceptions "$TMP/none.txt"
rc "left-pad@1.3.0 entry whose tarball is keyv-6.0.0" 2; has "nameswap" "resolved tarball is not left-pad@1.3.0"
run --root "$FX/bundled" --exceptions "$TMP/none.txt"
rc "inBundle entry is still looked up in OSV" 1; has "bundled" "MALICIOUS keyv@6.0.0 (MAL-"
lacks "bundled" "node_modules/keyv (no resolved"
run --root "$FX/linkout" --exceptions "$TMP/none.txt"
rc "link entry pointing outside the scan root" 2; has "linkout" "link target outside the scan root"

echo "3k. smaller findings (pass-2 finding 6)"
rm -rf "$TMP/symfile"; mkdir -p "$TMP/symfile/app" "$TMP/symfile/real"
cp "$FX/clean/app/"* "$TMP/symfile/app/"; mv "$TMP/symfile/app/package-lock.json" "$TMP/symfile/real/lock.json"
ln -s ../real/lock.json "$TMP/symfile/app/package-lock.json"
run --root "$TMP/symfile" --exceptions "$TMP/none.txt"
rc "symlinked manifest file is reported" 2; has "symlinked manifest" "symlinked manifest not followed: app/package-lock.json"
OUT="$(DEP_AUDIT_SELFTEST_CRASH=late "$AUDIT" --root "$FX/malicious" --exceptions "$TMP/none.txt" 2>&1)"; RC=$?
rc "crash after a finding was collected keeps the finding" 1; has "late crash" "FINDING: osv: MALICIOUS keyv@6.0.0"; has "late crash" "internal error: RuntimeError"
rm -rf "$TMP/deep"; mkdir -p "$TMP/deep/app" "$TMP/deep/bad"
cp "$FX/malicious/app/"* "$TMP/deep/bad/"
python3 -I - "$TMP/deep/app" <<'EOF3'
import json, sys
d = sys.argv[1]
node = {"version": "1.0.0"}
for i in range(1200):
    node = {"version": "1.0.0", "dependencies": {"p%d" % i: node}}
json.dump({"name": "deep", "version": "1.0.0", "lockfileVersion": 1, "requires": True, "dependencies": {"root": node}}, open(d + "/package-lock.json", "w"))
json.dump({"name": "deep", "version": "1.0.0", "dependencies": {"root": "1.0.0"}}, open(d + "/package.json", "w"))
EOF3
run --root "$TMP/deep" --exceptions "$TMP/none.txt"
lacks "deep lock + malicious sibling" "internal error"; has "deep lock + malicious sibling" "MALICIOUS keyv@6.0.0"
rc "1200-level nested v1 lock does not hide a sibling finding" 1
mkdir -p "$TMP/relexc"; cp "$FX/critical/exceptions.txt" "$TMP/relexc/exceptions.txt"; cp -R "$FX/critical/app" "$TMP/relexc/app"
OUT="$(cd "$TMP/relexc" && "$AUDIT" --root . --exceptions exceptions.txt 2>&1)"; RC=$?
rc "relative --exceptions inside a relative --root" 0; has "relative exceptions" "exceptions file: exceptions.txt (present, 1 entry)"

echo "4. exclusions"
# defence in depth: even a real-named manifest placed INSIDE the excluded fixture path is skipped.
# Positive control: the same manifest in a sibling directory IS inventoried.
EX="$TMP/exroot"
mkdir -p "$EX/scripts/fixtures/p1563-dep-audit/c/app" "$EX/scripts/fixtures/other/app" "$EX/.claude/commands/t" "$EX/node_modules/x"
cp "$FX/clean/app/"* "$EX/scripts/fixtures/p1563-dep-audit/c/app/"
cp "$FX/clean/app/"* "$EX/scripts/fixtures/other/app/"
cp "$FX/clean/app/package.json" "$EX/.claude/commands/t/"
cp "$FX/clean/app/package.json" "$EX/node_modules/x/"
run --root "$EX" --exceptions "$TMP/none.txt"
has "exclusion control" "scripts/fixtures/other/app/package-lock.json"
lacks "exclusion control" "p1563-dep-audit/c/app"
lacks "exclusion control" ".claude/commands/t"
lacks "exclusion control" "node_modules/x"
has "exclusion control" "RESULT: CLEAN"

echo "4b. real repo"
run --exceptions "$TMP/none.txt"
has "real repo" "exclusions: node_modules, .git (any depth); .claude, .claude/worktrees"
has "real repo" "exclusions: node_modules"
has "real repo" "scripts/fixtures/p1563-dep-audit"
INV="$(printf '%s\n' "$OUT" | sed -n '/^COVERAGE INVENTORY/,/^SUMMARY/p')"
if grep -qF "p1563-dep-audit" <<<"$INV"; then bad "real repo: fixture dir appears in the inventory"; else ok "real repo: fixture dir absent from the inventory"; fi
if grep -qF ".claude/worktrees" <<<"$INV"; then bad "real repo: worktrees appear in the inventory"; else ok "real repo: .claude/worktrees absent from the inventory"; fi
if [ "$RC" = 0 ] || [ "$RC" = 1 ] || [ "$RC" = 2 ]; then ok "real repo: exit code is one of 0/1/2 ($RC)"; else bad "real repo: unexpected exit $RC"; fi

echo "5. gate 7d: mutate a copy of the real lock"
if [ -f "$ROOT/package-lock.json" ] && [ -f "$ROOT/package.json" ]; then
  mkdir -p "$TMP/real-copy/app"; cp "$ROOT/package.json" "$ROOT/package-lock.json" "$TMP/real-copy/app/"
  # control first: the unmutated copy has no MAL- hit (otherwise the mutation proves nothing)
  run --root "$TMP/real-copy" --exceptions "$TMP/none.txt"
  lacks "real-copy control (unmutated)" "MALICIOUS"
  lacks "real-copy control (unmutated)" "not the registry package they claim to be"
  # gate 7d for the registry-source rule: the real lock passes it, and a mutated entry trips it
  cp "$TMP/real-copy/app/package-lock.json" "$TMP/real-lock-orig.json"
  python3 -I - "$TMP/real-copy/app/package-lock.json" <<'EOF2'
import json, sys
p = sys.argv[1]
d = json.load(open(p))
d["packages"]["node_modules/keyv"]["resolved"] = "git+ssh://git@example.invalid/keyv.git#abc"
json.dump(d, open(p, "w"), indent=2)
EOF2
  run --root "$TMP/real-copy" --exceptions "$TMP/none.txt"
  has "real-copy resolved mutated" "not the registry package they claim to be"
  has "real-copy resolved mutated" "node_modules/keyv"
  cp "$TMP/real-lock-orig.json" "$TMP/real-copy/app/package-lock.json"
  python3 -I - "$TMP/real-copy/app/package-lock.json" <<'EOF'
import json, sys
p = sys.argv[1]
d = json.load(open(p))
d["packages"]["node_modules/keyv"]["version"] = "6.0.0"
json.dump(d, open(p, "w"), indent=2)
EOF
  run --root "$TMP/real-copy" --exceptions "$TMP/none.txt"
  rc "real-copy mutated to keyv@6.0.0" 1; has "real-copy mutated" "MALICIOUS keyv@6.0.0 (MAL-"
else
  bad "root package-lock.json/package.json missing: cannot build the mutation control"
fi

echo "6. output safety"
if grep -qE '[<>|]' <<<"$D_OUT"; then bad "lookup-failure output contains a redirect token"; else ok "lookup-failure output has no <, > or |"; fi
if grep -qE '[<>|]' <<<"$OUT"; then bad "real-copy output contains a redirect token"; else ok "real-copy output has no <, > or |"; fi

echo
echo "passed: $pass  failed: $fail"
[ "$fail" = 0 ]
