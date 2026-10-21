#!/usr/bin/env python3
"""supabase-tokens-parse.py — INBOX-P174 follow-up. Reads the text of the Supabase dashboard Access
Tokens page (what the Claude in Chrome get_page_text tool returns) and says which management tokens
are expired, expiring soon, or full-access (LEGACY).

Why: a dead keychain token went unnoticed for three weeks (2026-09-30 to 2026-10-21), and a
full-access CLI token appeared the morning of 2026-10-21 against the 2026-09-30 decision that none
should exist. /day already visits the dashboard in Chrome for the usage check; this reads one more page.

Usage: supabase-tokens-parse.py [--warn-days N] [--today YYYY-MM-DD] [FILE]   (stdin when no FILE)
Output, redirect-safe by design (no angle brackets or pipes, .claude/rules/shell-safety.md).
Never prints any part of a token string, masked or not (P1526): only names and dates.
  TOKEN <state> <expires YYYY-MM-DD or never> <days left or -> <name>
        state: ok | expiring | expired | legacy
  TOKENS: <ok|problem|not-run> <plain detail>
Exit 0 ok, 1 problem (any expired, expiring within N days, or LEGACY), 2 not-run (no token rows:
signed out or the wrong page).
"""
import argparse, datetime as dt, re, sys

MASK_RE = re.compile(r"^sbp_\S*[•*]{3,}\S*$")
# "22 minutes ago 19 Jan 2027", "3 hours ago Never", "Never used Never"
EXP_RE = re.compile(r"(Never|\d{1,2} [A-Z][a-z]{2} \d{4})\s*$")


HEADERS = {"TOKEN", "LAST USED", "EXPIRES"}
WHEN_RE = re.compile(r"\bago\b|^Never used\b", re.I)


def clean(s, n=80):
    return re.sub(r"[<>|]", " ", s).strip()[:n]


def safe_name(s):
    """A name that looks like a key, or a table header, is never printed (P1526)."""
    if "sbp_" in s or MASK_RE.match(s) or re.fullmatch(r"[A-Za-z0-9]{10,}", s) or s.upper() in HEADERS or re.search(r"[•*]{3,}", s):
        return "name-withheld"
    return clean(s)


def parse(text, today, warn_days):
    lines = [l.strip() for l in text.splitlines()]
    rows, unreadable = [], []
    for i, l in enumerate(lines):
        if not MASK_RE.match(l):
            continue
        # Name: nearest non-empty line above, skipping the LEGACY badge line.
        legacy, j, name = False, i - 1, ""
        while j >= 0:
            if lines[j] == "LEGACY":
                legacy = True
            elif lines[j]:
                name = lines[j]
                break
            j -= 1
        # Expiry: the next two non-empty lines below, joined. The page puts "3 hours ago 19 Jan 2027"
        # on one line for scoped tokens but "3 hours ago" and "Never" on two for LEGACY ones (2026-10-21).
        below, k = [], i + 1
        while k < len(lines) and len(below) < 2 and not MASK_RE.match(lines[k]):
            if lines[k]:
                below.append(lines[k])
            k += 1
        # One line ("22 minutes ago 19 Jan 2027") when it reads as last-used plus expiry; otherwise
        # last-used and expiry sit on two lines and the expiry is the LAST date or Never of the pair.
        m = None
        if below and WHEN_RE.search(below[0]):
            m = EXP_RE.search(below[0])
        if not m and len(below) >= 2:
            # Two-line form only: the second line is the expiry and NOTHING else ("Never" or a date),
            # so a following token's name ("Never expires deploy") can never be borrowed.
            if re.fullmatch(r"Never|\d{1,2} [A-Z][a-z]{2} \d{4}", below[1]):
                m = re.match(r".*", below[1])
        if not m and legacy:
            # Fail closed: a LEGACY badge is a finding even when its dates cannot be read.
            rows.append(("legacy", "unknown", "-", safe_name(name) if name else "name-withheld"))
            continue
        if not name or not m:
            unreadable.append(i)
            continue
        if m.group(0).strip() == "Never":
            exp, days = None, None
        else:
            exp = dt.datetime.strptime(m.group(0).strip(), "%d %b %Y").date()
            days = (exp - today).days
        if legacy:
            state = "legacy"
        elif days is not None and days < 0:
            state = "expired"
        elif days is not None and days <= warn_days:
            state = "expiring"
        else:
            state = "ok"
        rows.append((state, exp.isoformat() if exp else "never", "-" if days is None else str(days), safe_name(name)))
    keyish = sum(1 for l in lines if l.startswith("sbp_"))
    badges = sum(1 for l in lines if l == "LEGACY")
    if keyish != len(rows) + len(unreadable) or badges != sum(1 for r in rows if r[0] == "legacy"):
        unreadable.append(-1)
    return rows, len(unreadable)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--warn-days", type=int, default=21)
    ap.add_argument("--today")
    ap.add_argument("file", nargs="?")
    a = ap.parse_args()
    today = dt.date.fromisoformat(a.today) if a.today else dt.date.today()
    text = open(a.file).read() if a.file else sys.stdin.read()
    rows, unreadable = parse(text, today, a.warn_days)
    for r in rows:
        print("TOKEN " + " ".join(r))
    if unreadable:
        # Fail closed: a row we could not read may be exactly the one that matters.
        print(f"TOKENS: problem {unreadable} token row(s) could not be read, so the page is not certified; read the tokens page by hand")
        return 1
    if not rows:
        print("TOKENS: not-run no token rows on the page (signed out, or not the Access Tokens page)")
        return 2
    bad = [r for r in rows if r[0] != "ok"]
    if not bad:
        soonest = min((int(r[2]) for r in rows if r[2] != "-"), default=None)
        tail = f", next expiry in {soonest} days" if soonest is not None else ""
        print(f"TOKENS: ok {len(rows)} tokens, none expired, none within {a.warn_days} days, no full-access token{tail}")
        return 0
    parts = []
    for state, label in (("legacy", "full-access (LEGACY)"), ("expired", "expired"), ("expiring", f"expiring within {a.warn_days} days")):
        names = [r[3] for r in bad if r[0] == state]
        if names:
            parts.append(f"{len(names)} {label}: " + ", ".join(names))
    print("TOKENS: problem " + "; ".join(parts))
    return 1


if __name__ == "__main__":
    sys.exit(main())
