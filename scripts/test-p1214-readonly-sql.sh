#!/usr/bin/env bash
# test-p1214-readonly-sql.sh — hermetic canary for scripts/supabase-readonly-sql.py.
#
# No network and no real credential: the helper is pointed at a local stub API
# (SUPABASE_API_HOST is honoured for localhost only) and run from a throwaway directory
# that is not a git checkout, so it cannot find this repo's real env files.
#
# What must hold, and why each case exists:
#   happy path     rows come back as a JSON array; the request went to the READ-ONLY
#                  endpoint, carried the scoped token, and asked for rolbypassrls
#   no-bypass      a role without BYPASSRLS returns exit 2, never a (silently short) array
#   http-error     a 403 is exit 2 with a JSON object on stdout
#   error-in-2xx   {"message": ...} inside a 2xx is exit 2, not rows
#   no-token       an env file holding ONLY write-capable credentials is exit 2 and makes
#                  NO request — the helper must never fall back to them
#   foreign-host   SUPABASE_API_HOST pointing off-box is refused before any request
set -uo pipefail

REAL_HELPER="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/supabase-readonly-sql.py"
REAL_RLS="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/rls-drift-check.py"
PASS=0; FAIL=0
ok()  { echo "  ok   $1"; PASS=$((PASS+1)); }
bad() { echo "  FAIL $1 :: $2"; FAIL=$((FAIL+1)); }

TMP=$(mktemp -d)
cleanup() { [ -n "${SRV_PID:-}" ] && kill "$SRV_PID" 2>/dev/null; rm -rf "$TMP"; }
trap cleanup EXIT

mkdir -p "$TMP/repo/scripts"
cp "$REAL_HELPER" "$REAL_RLS" "$TMP/repo/scripts/"
# The only credentials on disk are write-capable ones. A helper that falls back to
# either would pass the no-token case below only if it made no request, which the
# request log checks.
printf 'VITE_SUPABASE_URL=https://fakeref.supabase.co\nSUPABASE_ACCESS_TOKEN=must-never-be-sent\nPROD_SUPABASE_SERVICE_ROLE_KEY=must-never-be-sent\n' \
  > "$TMP/repo/.env.prod"

cat > "$TMP/stub.py" <<'PY'
import http.server, json, os, sys
MODE_FILE, LOG, PORT_FILE = sys.argv[1], sys.argv[2], sys.argv[3]
class H(http.server.BaseHTTPRequestHandler):
    def log_message(self, *a): pass
    def do_POST(self):
        body = self.rfile.read(int(self.headers.get("Content-Length", 0))).decode()
        with open(LOG, "a") as fh:
            fh.write(json.dumps({"path": self.path, "auth": self.headers.get("Authorization"),
                                 "query": json.loads(body).get("query", "")}) + "\n")
        mode = open(MODE_FILE).read().strip()
        status, payload = 201, None
        if mode == "ok":
            payload = [{"__bypassrls": True, "__role": "supabase_read_only_user", "__rows": [{"n": 3}]}]
        elif mode == "nobypass":
            payload = [{"__bypassrls": False, "__role": "some_role", "__rows": [{"n": 0}]}]
        elif mode == "http403":
            status, payload = 403, {"message": "forbidden"}
        elif mode == "errobj":
            status, payload = 200, {"message": "boom"}
        data = json.dumps(payload).encode()
        self.send_response(status); self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(data))); self.end_headers(); self.wfile.write(data)
srv = http.server.HTTPServer(("127.0.0.1", 0), H)
open(PORT_FILE, "w").write(str(srv.server_address[1]))
srv.serve_forever()
PY
echo ok > "$TMP/mode"; : > "$TMP/requests.log"
python3 "$TMP/stub.py" "$TMP/mode" "$TMP/requests.log" "$TMP/port" &
SRV_PID=$!
for _ in $(seq 1 50); do [ -s "$TMP/port" ] && break; sleep 0.1; done
[ -s "$TMP/port" ] || { echo "FATAL: stub server did not start"; exit 2; }
HOST="http://127.0.0.1:$(cat "$TMP/port")"

run() {  # run MODE [extra env...] — sets OUT, RC
  local mode="$1"; shift
  echo "$mode" > "$TMP/mode"
  OUT=$(cd "$TMP" && env -u SUPABASE_READONLY_TOKEN SUPABASE_API_HOST="$HOST" "$@" \
        python3 "$TMP/repo/scripts/supabase-readonly-sql.py" --env prod "SELECT 1 AS n;" 2>/dev/null)
  RC=$?
}

echo "=== P1214 canary: supabase-readonly-sql.py ==="

: > "$TMP/requests.log"
run ok SUPABASE_READONLY_TOKEN=stub-ro
if [ "$RC" -eq 0 ] && [ "$OUT" = '[{"n": 3}]' ]; then ok "happy path returns the rows array"; else bad "happy path" "rc=$RC out=$OUT"; fi
REQ=$(tail -1 "$TMP/requests.log")
if printf '%s' "$REQ" | python3 -c 'import json,sys; r=json.load(sys.stdin); sys.exit(0 if r["path"]=="/v1/projects/fakeref/database/query/read-only" else 1)'; then ok "request used the read-only endpoint for the env file's ref"; else bad "read-only endpoint" "$REQ"; fi
if printf '%s' "$REQ" | python3 -c 'import json,sys; r=json.load(sys.stdin); sys.exit(0 if r["auth"]=="Bearer stub-ro" else 1)'; then ok "request carried the scoped token and nothing else"; else bad "scoped token" "$REQ"; fi
if printf '%s' "$REQ" | python3 -c 'import json,sys; r=json.load(sys.stdin); q=r["query"]; sys.exit(0 if "rolbypassrls" in q and "SELECT 1 AS n" in q and "AS n;" not in q else 1)'; then ok "query asserts rolbypassrls in the same request, trailing semicolon stripped"; else bad "bypass assertion in query" "$REQ"; fi

run nobypass SUPABASE_READONLY_TOKEN=stub-ro
if [ "$RC" -eq 2 ] && printf '%s' "$OUT" | grep -q '"message"'; then ok "no-bypass role is exit 2 with a message, not rows"; else bad "no-bypass" "rc=$RC out=$OUT"; fi

run http403 SUPABASE_READONLY_TOKEN=stub-ro
if [ "$RC" -eq 2 ] && printf '%s' "$OUT" | grep -q 'HTTP 403'; then ok "HTTP 403 is exit 2"; else bad "http403" "rc=$RC out=$OUT"; fi

run errobj SUPABASE_READONLY_TOKEN=stub-ro
if [ "$RC" -eq 2 ] && printf '%s' "$OUT" | grep -q '"message"'; then ok "error object inside a 2xx is exit 2"; else bad "errobj" "rc=$RC out=$OUT"; fi

: > "$TMP/requests.log"
run ok
if [ "$RC" -eq 2 ] && [ ! -s "$TMP/requests.log" ]; then ok "no scoped token: exit 2 and no request sent (write-capable credentials ignored)"; else bad "no-token" "rc=$RC out=$OUT requests=$(wc -l < "$TMP/requests.log")"; fi

: > "$TMP/requests.log"
echo ok > "$TMP/mode"
OUT=$(cd "$TMP" && SUPABASE_API_HOST="https://evil.example" SUPABASE_READONLY_TOKEN=stub-ro \
      python3 "$TMP/repo/scripts/supabase-readonly-sql.py" --env prod "SELECT 1" 2>/dev/null); RC=$?
if [ "$RC" -eq 2 ] && [ ! -s "$TMP/requests.log" ]; then ok "off-box API host refused before any request"; else bad "foreign-host" "rc=$RC out=$OUT"; fi

echo "PASS=$PASS FAIL=$FAIL"
[ "$FAIL" -eq 0 ]
