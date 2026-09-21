#!/bin/bash
# scripts/test-check-prod-deploy.sh — hermetic canary for scripts/check-prod-deploy.sh (P1211).
#
# A local fake of GitHub's deployments API (python, 127.0.0.1) serves one scenario per
# SHA. Proves the helper accepts ONLY: environment Production, creator vercel[bot],
# exact sha, created at/after --since, latest status success — and that "not found",
# "pending" and "API down" all exit 2 (not live), never 0 and never 1.

set -u
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TMPROOT=$(mktemp -d "${TMPDIR:-/tmp}/test-prod-deploy.XXXXXX")
PASS=0; FAIL=0
ok()  { PASS=$((PASS + 1)); echo "  PASS  $1"; }
bad() { FAIL=$((FAIL + 1)); echo "  FAIL  $1"; }

sha() { printf '%040d' "$1"; }   # deterministic 40-char "shas"
cat > "$TMPROOT/server.py" <<'PY'
import json, sys, http.server, urllib.parse
def S(n): return "%040d" % n
V = {"login": "vercel[bot]"}
DEPLOYS = {
  S(1): [dict(id=11, sha=S(1), environment="Production", creator=V, created_at="2026-09-18T08:41:25Z")],
  S(2): [dict(id=21, sha=S(2), environment="Production", creator=V, created_at="2026-09-18T08:41:25Z")],
  S(3): [dict(id=31, sha=S(3), environment="Preview", creator=V, created_at="2026-09-18T08:41:25Z")],
  S(4): [dict(id=41, sha=S(4), environment="Production", creator={"login": "someone"}, created_at="2026-09-18T08:41:25Z")],
  S(5): [dict(id=51, sha=S(5), environment="Production", creator=V, created_at="2026-09-18T08:41:25Z")],
  S(6): [dict(id=61, sha=S(6), environment="Production", creator=V, created_at="2026-09-18T08:00:00Z"),
         dict(id=62, sha=S(6), environment="Production", creator=V, created_at="2026-09-18T09:00:00Z")],
}
STATUSES = {
  11: [dict(id=1, state="success", created_at="2026-09-18T08:41:26Z")],
  21: [dict(id=1, state="success", created_at="2026-09-18T08:41:26Z"), dict(id=2, state="failure", created_at="2026-09-18T08:42:00Z")],
  31: [dict(id=1, state="success", created_at="2026-09-18T08:41:26Z")],
  41: [dict(id=1, state="success", created_at="2026-09-18T08:41:26Z")],
  51: [dict(id=1, state="in_progress", created_at="2026-09-18T08:41:26Z")],
  61: [dict(id=1, state="success", created_at="2026-09-18T08:01:00Z")],
  62: [dict(id=1, state="error", created_at="2026-09-18T09:01:00Z")],
}
class H(http.server.BaseHTTPRequestHandler):
    def log_message(self, *a): pass
    def do_GET(self):
        u = urllib.parse.urlparse(self.path); q = urllib.parse.parse_qs(u.query)
        parts = u.path.strip("/").split("/")
        if q.get("sha", [""])[0] == S(99):
            self.send_response(500); self.end_headers(); self.wfile.write(b"{}"); return
        if parts[-1] == "deployments":
            body = [d for d in DEPLOYS.get(q.get("sha", [""])[0], []) if d["environment"] == q.get("environment", [""])[0]]
            # The real API already filters by environment; return Preview rows too for S(3)
            # so the helper's OWN filter is what is under test.
            if q.get("sha", [""])[0] == S(3): body = DEPLOYS[S(3)]
        elif parts[-1] == "statuses":
            body = STATUSES.get(int(parts[-2]), [])
        else:
            self.send_response(404); self.end_headers(); return
        self.send_response(200); self.end_headers(); self.wfile.write(json.dumps(body).encode())
srv = http.server.HTTPServer(("127.0.0.1", 0), H)
open(sys.argv[1], "w").write(str(srv.server_address[1]))
srv.serve_forever()
PY
python3 "$TMPROOT/server.py" "$TMPROOT/port" &
SRV=$!
trap 'kill $SRV 2>/dev/null; rm -rf "$TMPROOT"' EXIT
for _ in 1 2 3 4 5 6 7 8 9 10; do [ -s "$TMPROOT/port" ] && break; sleep 0.3; done
PORT=$(cat "$TMPROOT/port")

mkdir -p "$TMPROOT/stubs" "$TMPROOT/repo"
printf '#!/bin/bash\nexit 1\n' > "$TMPROOT/stubs/gh"; chmod +x "$TMPROOT/stubs/gh"
git -C "$TMPROOT/repo" init -q && git -C "$TMPROOT/repo" remote add origin https://github.com/o/r.git

run() { (cd "$TMPROOT/repo" && PATH="$TMPROOT/stubs:$PATH" CHECK_PROD_DEPLOY_API="http://127.0.0.1:$PORT" \
          bash "$REPO_ROOT/scripts/check-prod-deploy.sh" "$@" >/dev/null 2>&1); RC=$?; }
expect() { [ "$RC" -eq "$2" ] && ok "$1 (exit $RC)" || bad "$1 — expected $2, got $RC"; }

AFTER_DEPLOY=$(python3 -c 'import datetime;print(int(datetime.datetime(2026,9,18,8,45,tzinfo=datetime.timezone.utc).timestamp()))')
run --sha "$(sha 1)";                         expect "Production, vercel[bot], success"            0
run --sha "$(sha 1)" --since "$AFTER_DEPLOY"; expect "control: same deploy but before --since"    2
run --sha "$(sha 2)";                         expect "latest status failure (after a success)"     1
run --sha "$(sha 3)";                         expect "Preview environment only"                    2
run --sha "$(sha 4)";                         expect "creator is not vercel[bot]"                  2
run --sha "$(sha 5)";                         expect "in_progress, no wait"                        2
run --sha "$(sha 6)";                         expect "newest deployment errored, older succeeded"  1
run --sha "$(sha 7)";                         expect "no deployment at all"                        2
run --sha "$(sha 99)";                        expect "API HTTP 500 is not-live, not failed"        2
run --sha "abc";                              expect "malformed sha"                               2

echo ""
echo "test-check-prod-deploy: $PASS passed, $FAIL failed"
[ "$FAIL" -eq 0 ]
