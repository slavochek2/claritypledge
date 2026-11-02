#!/usr/bin/env python3
"""Read-only checks on event group chats through the Beeper local API.

  group-check.py preflight <type>   identity + moderation signals, reopens Beeper if it is down
  group-check.py recheck <slug>     are this event's sent posts still there?

Exit: 0 clean, 1 something needs the founder, 3 Beeper unreachable. Sends nothing.
"""
import json, os, re, subprocess, sys, time, unicodedata
from urllib.parse import quote

BASE = "http://localhost:23373"


def token():
    tok = os.environ.get("BEEPER_TOKEN")
    if tok:
        return tok
    # The token file's location lives in the gitignored channel config.
    env_file = json.load(open(".private/event-channels.json"))["beeper_env_file"]
    env = open(os.path.expanduser(env_file)).read()
    return re.search(r"BEEPER_TOKEN=(\S+)", env).group(1)


TOK = token()


def get(path):
    out = subprocess.run(
        ["curl", "-s", "--max-time", "30", "-K", "-", BASE + path],
        input=f'header = "Authorization: Bearer {TOK}"\n',  # stdin, never argv
        capture_output=True, text=True,
    ).stdout
    return json.loads(out)


def up():
    code = subprocess.run(
        ["curl", "-s", "-o", "/dev/null", "-w", "%{http_code}", "--max-time", "5", BASE + "/v1/info"],
        capture_output=True, text=True,
    ).stdout
    return code == "200"


def ensure_beeper():
    if up():
        return
    print("Beeper is down, reopening it")
    subprocess.run(["open", "-a", "Beeper Desktop"])
    for _ in range(24):
        time.sleep(5)
        if up():
            time.sleep(20)  # let the bridges reconnect
            return
    print("BEEPER UNREACHABLE")
    sys.exit(3)


def norm(s):
    return unicodedata.normalize("NFC", s or "").lower().strip()


def messages(chat):
    return get(f"/v1/chats/{quote(chat, safe='')}/messages").get("items", [])


def preflight(type_name):
    types = json.load(open(".private/event-channels.json"))["types"]
    entry = next(t for t in types if t["type"] == type_name) if isinstance(types, list) else types[type_name]
    blocked = {g["chatID"] for g in entry.get("do_not_post", [])}
    flagged = 0
    for g in entry["groups"]:
        if g.get("status") == "declined":
            continue
        chat = get(f"/v1/chats/{quote(g['chatID'], safe='')}")
        ok = (chat.get("type") == "group" and chat.get("accountID") == g["platform"]
              and norm(chat.get("title")) == norm(g.get("verified_name")) and g["chatID"] not in blocked)
        items = messages(g["chatID"])
        deleted = [m for m in items if m.get("isDeleted")]
        bot = [m for m in items if re.search(r"\b(banned|anti.?spam|no (ads|promo))\b", m.get("text") or "", re.I)]
        by = sorted({m.get("senderName") or "?" for m in deleted})
        status = "OK" if ok else "IDENTITY FAILED"
        print(f"{g['name']}: {status}; read {len(items)}; deleted {len(deleted)} {by if by else ''}; moderation words {len(bot)}")
        flagged += (not ok) or bool(deleted) or bool(bot)
    return 1 if flagged else 0


def recheck(slug):
    path = os.path.expanduser(f"~/.private/event-state/{slug}.groups.json")
    flagged = 0
    for g in json.load(open(path))["groups"]:
        if g["status"] != "sent":
            continue
        hit = [m for m in messages(g["chatID"]) if m.get("id") == g.get("sent_message_id")]
        if not hit:
            print(f"{g['name']}: not in the messages read, unknown")
        elif hit[0].get("isDeleted"):
            print(f"{g['name']}: DELETED")
            flagged = 1
        else:
            print(f"{g['name']}: still there")
    return flagged


if __name__ == "__main__":
    if len(sys.argv) != 3 or sys.argv[1] not in ("preflight", "recheck"):
        sys.exit(__doc__)
    ensure_beeper()
    sys.exit(preflight(sys.argv[2]) if sys.argv[1] == "preflight" else recheck(sys.argv[2]))
