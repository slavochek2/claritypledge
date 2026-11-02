#!/usr/bin/env python3
"""Called by email-audience.sh. Past RSVPs, minus registered, host, test accounts and Mailgun suppressions."""
import base64, datetime, json, os, subprocess, sys

slug, word = sys.argv[1:3]
KEY = os.environ["PROD_SUPABASE_SERVICE_ROLE_KEY"]
REST = "https://besjtuodziykmjidubzw.supabase.co/rest/v1/"
MG = "https://api.eu.mailgun.net/v3/mg.claritypledge.com/"
AUTH = base64.b64encode(("api:" + os.environ["MAILGUN_API_KEY"]).encode()).decode()


def curl(url, config):
    return subprocess.run(["curl", "-sf", "--max-time", "60", "-K", "-", url], input=config,
                          capture_output=True, text=True, check=True).stdout


def q(path):
    return json.loads(curl(REST + path, f'header = "apikey: {KEY}"\nheader = "Authorization: Bearer {KEY}"\n'))


def rsvps(ids):
    out, offset = [], 0
    while True:
        page = q(f"event_rsvps?select=profile_id&event_id=in.({','.join(ids)})&limit=1000&offset={offset}")
        out += page
        if len(page) < 1000:
            return {r["profile_id"] for r in out}
        offset += 1000


events = q(f"events?select=id,slug,datetime,status,host_id&or=(title.ilike.*{word}*,slug.ilike.*{word}*)&limit=1000")
cur = next(e for e in events if e["slug"] == slug)
now = datetime.datetime.now(datetime.timezone.utc).isoformat()
past = [e for e in events if e["datetime"] < now and e["status"] != "cancelled" and e["id"] != cur["id"]]
assert past, "no past events matched"
attended, registered = rsvps([e["id"] for e in past]), rsvps([cur["id"]])
ids = sorted(attended - registered - {cur.get("host_id")})
profiles = []
for i in range(0, len(ids), 100):
    profiles += q(f"profiles?select=id,email,name,is_test_account&id=in.({','.join(ids[i:i + 100])})")
live = [p for p in profiles if p.get("email") and not p.get("is_test_account")]
suppressed, counts = set(), {}
emails = {p["email"].lower() for p in live}
for kind in ("unsubscribes", "bounces", "complaints"):
    items = json.loads(curl(MG + kind + "?limit=1000", f'header = "Authorization: Basic {AUTH}"\n')).get("items", [])
    hits = {x.get("address", "").lower() for x in items} & emails
    counts[kind] = len(hits)
    suppressed |= hits
final = [p for p in live if p["email"].lower() not in suppressed]
folder = f".private/campaigns/{slug}"
os.makedirs(folder, exist_ok=True)
target = f"{folder}/audience.md"
assert not os.path.exists(target), f"{target} exists; it may hold send status, not overwriting"
with open(target, "w") as f:
    f.write("| Name | Email | status | mailgun_id |\n|---|---|---|---|\n")
    for p in live:
        status = "suppressed" if p["email"].lower() in suppressed else "active"
        f.write(f"| {(p.get('name') or '').replace('|', ' ')} | {p['email']} | {status} |  |\n")
print(f"past events {len(past)}; unique people {len(attended)}; registered now {len(registered)}")
print(f"test accounts or no email removed {len(profiles) - len(live)}; suppressed {counts}")
print(f"TO EMAIL {len(final)} -> {target}")
