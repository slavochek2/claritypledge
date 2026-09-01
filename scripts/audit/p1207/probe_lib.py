"""P1207 reachability probe library — READ-ONLY against the TEST database.

Hard constraints (P1207 Invariants / epistemic.md gate 2b):
  * No function here issues a write. Only GET / HEAD against PostgREST, plus
    POST to /auth/v1/token which mints a session and mutates nothing of interest.
  * Every result carries the evidence that produced it (URL, status, row count),
    because a cell without its query is an opinion, not a matrix entry.
"""
import json
import os
import urllib.error
import urllib.parse
import urllib.request

TEST_REF = "gfjctyxqlwexxwsmkakq"
PROD_REF = "besjtuodziykmjidubzw"


def load_env(path):
    env = {}
    with open(path) as fh:
        for line in fh:
            line = line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            k, v = line.split("=", 1)
            env[k.strip()] = v.strip().strip('"').strip("'")
    return env


def _request(url, headers, method="GET"):
    req = urllib.request.Request(url, headers=headers, method=method)
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            return resp.status, dict(resp.headers), resp.read().decode("utf-8", "replace")
    except urllib.error.HTTPError as exc:
        return exc.code, dict(exc.headers), exc.read().decode("utf-8", "replace")
    except Exception as exc:  # noqa: BLE001 - surfaced as evidence, never swallowed
        return -1, {}, f"TRANSPORT_ERROR: {exc}"


def mint_token(base_url, anon_key, email, password):
    """Return (uid, access_token) or raise with the server's own message."""
    url = f"{base_url}/auth/v1/token?grant_type=password"
    body = json.dumps({"email": email, "password": password}).encode()
    req = urllib.request.Request(
        url,
        data=body,
        headers={"apikey": anon_key, "Content-Type": "application/json"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            data = json.loads(resp.read().decode())
    except urllib.error.HTTPError as exc:
        raise RuntimeError(f"auth failed for {email}: {exc.code} {exc.read().decode()[:200]}")
    return data.get("user", {}).get("id"), data["access_token"]


def probe_select(base_url, anon_key, table, token=None, select="*", limit=5):
    """One reachability probe. Returns an evidence dict — never a bare bool."""
    qs = urllib.parse.urlencode({"select": select, "limit": str(limit)})
    url = f"{base_url}/rest/v1/{table}?{qs}"
    headers = {"apikey": anon_key, "Accept": "application/json"}
    if token:
        headers["Authorization"] = f"Bearer {token}"
    status, _hdrs, body = _request(url, headers)
    rows = None
    if status == 200:
        try:
            parsed = json.loads(body)
            rows = len(parsed) if isinstance(parsed, list) else None
        except json.JSONDecodeError:
            rows = None
    return {
        "url": url,
        "role": "authenticated" if token else "anon",
        "status": status,
        "rows": rows,
        "body_head": body[:300],
        "reachable": bool(status == 200 and rows),
    }
