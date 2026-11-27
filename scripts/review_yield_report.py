#!/usr/bin/env python3
"""P1734 reviewer yield report: reads the review tally file (JSON lines) and prints,
per reviewer slot, runs / verified-unique / dropped-per-run / availability and the
pre-registered Decision Criteria verdicts (spec features/p1734_reviewer_yield_ledger.md).

Reviewers are ALWAYS printed in the fixed slot order; never sorted by any count.
"""
import argparse
import datetime as dt
import json
import os
import random
import subprocess
import sys

SLOTS = ["gemini", "glm", "codex", "opus"]
PROTECTED = {"gemini", "codex", "opus"}
OUTCOMES = ["ok", "failed", "missing", "skipped", "not"]
KINDS = ["spec", "finish first", "finish freshness"]
BUCKETS = ["<20KB", "20-60KB", "60-150KB", ">=150KB", "unknown"]
VERDICTS = ["not enough runs", "keep", "remove", "stakes-gate", "watch"]


def verdict(runs, unique, has_high):
    """Spec Decision Criteria 1-5, in order. Exactly one verdict."""
    if runs < 20:
        return "not enough runs"
    if unique * 20 >= runs or has_high:
        return "keep"
    if unique == 0 and runs >= 60:
        return "remove"
    if unique == 0 and 40 <= runs <= 59:
        return "stakes-gate"
    return "watch"


def parse_ts(s):
    try:
        d = dt.datetime.fromisoformat(str(s).replace("Z", "+00:00"))
    except (ValueError, TypeError):
        return None
    if d.tzinfo is None:
        d = d.replace(tzinfo=dt.timezone.utc)
    return d


def load_records(path):
    latest = {}
    order = []
    notes = []  # waiver notes: counted in the window, never replace a round's record
    with open(path, encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if not line:
                continue
            try:
                r = json.loads(line)
            except ValueError:
                continue
            if not isinstance(r, dict) or not r.get("snapshot"):
                continue
            ts = parse_ts(r.get("ts"))
            if ts is None:
                continue
            r["_ts"] = ts
            if r.get("status") == "waiver":
                notes.append(r)
                continue
            if r["snapshot"] not in latest:
                order.append(r["snapshot"])
            latest[r["snapshot"]] = r  # latest record in file order wins
    return [latest[s] for s in order] + notes


def outcome_word(rec, slot):
    v = (rec.get("reviewers") or {}).get(slot)
    if not isinstance(v, str) or not v.strip():
        return "not"
    w = v.strip().split()[0].lower()
    return w if w in OUTCOMES else "not"


def bucket_of(rec):
    p = rec.get("prompt")
    if not isinstance(p, dict) or not isinstance(p.get("bytes"), (int, float)):
        return "unknown"
    b = p["bytes"]
    if b < 20 * 1024:
        return "<20KB"
    if b < 60 * 1024:
        return "20-60KB"
    if b < 150 * 1024:
        return "60-150KB"
    return ">=150KB"


def kind_of(rec):
    if rec.get("kind") == "spec":
        return "spec"
    return "finish freshness" if rec.get("round") == "freshness" else "finish first"


def answering_model(rec, slot):
    for a in rec.get("attempts") or []:
        if a.get("slot") == slot and a.get("ok"):
            # ask-model's header `requested=` is the model that ANSWERED (fallback_from= failed)
            return a.get("requested") or a.get("served") or "unknown"
    return "unknown"


def analyze(records):
    S = {s: {"runs": 0, "unique": 0, "unique_high": 0, "solo": 0, "ok_rounds": 0,
             "dropped": 0, "verified": 0,
             "counts": {k: 0 for k in OUTCOMES}, "tokens": [],
             "kind": {k: {"runs": 0, "unique": 0} for k in KINDS},
             "bucket": {b: {"runs": 0, "unique": 0} for b in BUCKETS}} for s in SLOTS}
    overlap = {}
    for i, a in enumerate(SLOTS):
        for b in SLOTS[i + 1:]:
            overlap[a + "+" + b] = 0
    req, srv, ans = {}, {}, {}
    out = {"slots": S, "overlap": overlap, "requested": req, "served": srv, "answering": ans,
           "abandoned": 0, "waived": 0, "rounds": 0, "gemini_fallback_rounds": 0}
    for r in records:
        st = r.get("status")
        if st == "abandoned":
            out["abandoned"] += 1
            continue
        if st in ("waived", "waiver"):
            out["waived"] += 1
            continue
        if st != "reviewed":
            continue
        out["rounds"] += 1
        words = {s: outcome_word(r, s) for s in SLOTS}
        ok = [s for s in SLOTS if words[s] == "ok"]
        kind, bucket = kind_of(r), bucket_of(r)
        for s in SLOTS:
            S[s]["counts"][words[s]] += 1
            if words[s] == "ok":
                S[s]["ok_rounds"] += 1
                if len(ok) > 1:
                    S[s]["runs"] += 1
                    S[s]["kind"][kind]["runs"] += 1
                    S[s]["bucket"][bucket]["runs"] += 1
                    m = ans.setdefault(answering_model(r, s), {"runs": 0, "unique": 0})
                    m["runs"] += 1
        rtok = {}
        for a in r.get("attempts") or []:
            slot = a.get("slot")
            okrow = bool(a.get("ok"))
            e = req.setdefault(a.get("requested") or "(none)", {"attempts": 0, "ok": 0})
            e["attempts"] += 1
            e["ok"] += okrow
            if a.get("served") or a.get("file"):  # skip the synthetic failed fallback row
                e = srv.setdefault(a.get("served") or "(none)",
                                   {"attempts": 0, "ok": 0, "assumed": False})
                e["attempts"] += 1
                e["ok"] += okrow
                if a.get("served_assumed"):
                    e["assumed"] = True
            if slot in S and okrow and isinstance(a.get("reasoning_tokens"), (int, float)):
                rtok[slot] = rtok.get(slot, 0) + a["reasoning_tokens"]
        for slot, total in rtok.items():
            S[slot]["tokens"].append(total)
        gat = [a for a in r.get("attempts") or [] if a.get("slot") == "gemini"]
        if (any(a.get("fallback_from") for a in gat)
                or any(not a.get("ok") for a in gat) and any(
                    a.get("ok") and a.get("requested") != b.get("requested")
                    for a in gat for b in gat if not b.get("ok"))):
            out["gemini_fallback_rounds"] += 1
        for d in r.get("defects") or []:
            raised = d.get("raised_by") or {}
            state = d.get("state")
            names = [s for s in SLOTS if s in raised]
            crit = "criteria" in raised  # a /finish criteria subagent: a peer, not a slot
            if state == "dropped":
                for s in names:
                    if words[s] == "ok" and len(ok) > 1:
                        S[s]["dropped"] += 1
            elif state == "verified":
                for s in names:
                    S[s]["verified"] += 1
                for i, a in enumerate(SLOTS):
                    for b in SLOTS[i + 1:]:
                        if a in raised and b in raised:
                            overlap[a + "+" + b] += 1
                for s in names:
                    if words[s] != "ok":
                        continue
                    if len(ok) == 1:
                        if not crit:
                            S[s]["solo"] += 1
                    elif len(names) == 1 and not crit:
                        S[s]["unique"] += 1
                        S[s]["kind"][kind]["unique"] += 1
                        S[s]["bucket"][bucket]["unique"] += 1
                        if d.get("severity") == "HIGH":
                            S[s]["unique_high"] += 1
                        ans[answering_model(r, s)]["unique"] += 1
    return out


def pct(x):
    return "n/a" if x is None else "%.0f%%" % (100 * x)


def overlaps(A, a, b):
    key = a + "+" + b if SLOTS.index(a) < SLOTS.index(b) else b + "+" + a
    shared = A["overlap"][key]
    small = min(A["slots"][a]["verified"], A["slots"][b]["verified"])
    return small > 0 and shared * 2 >= small


def build(A, past):
    rows = []
    for s in SLOTS:
        x = A["slots"][s]
        c = x["counts"]
        den = c["ok"] + c["failed"] + c["missing"]
        avail = (c["failed"] + c["missing"]) / den if den else None
        dpr = x["dropped"] / x["runs"] if x["runs"] else 0.0
        toks = sum(x["tokens"]) / len(x["tokens"]) if x["tokens"] else None
        rows.append({"reviewer": s, "runs": x["runs"], "unique": x["unique"],
                     "unique_high": x["unique_high"], "solo": x["solo"],
                     "ok_rounds": x["ok_rounds"], "dropped_per_run": round(dpr, 3),
                     "slot_counts": {"ok": c["ok"], "failed": c["failed"],
                                     "missing": c["missing"], "skipped": c["skipped"],
                                     "not triggered": c["not"]},
                     "availability_failures": None if avail is None else round(avail, 3),
                     "availability_denominator": den,
                     "tokens_per_run": None if toks is None else round(toks, 1),
                     "verdict": verdict(x["runs"], x["unique"], x["unique_high"] >= 1),
                     "items": []})
    by = {r["reviewer"]: r for r in rows}
    # rule 6 noise, rule 8 availability
    for r in rows:
        if r["runs"] >= 20 and r["dropped_per_run"] > 5:
            r["items"].append("tune item (noise: %.2f dropped/run)" % r["dropped_per_run"])
        den = r["availability_denominator"]
        fm = r["slot_counts"]["failed"] + r["slot_counts"]["missing"]
        if den >= 10 and fm * 3 > den:
            r["items"].append("fix-or-replace item (availability)")
    # rule 7 overlap guard over remove / stakes-gate slots
    acting = [s for s in SLOTS if by[s]["verdict"] in ("remove", "stakes-gate")]
    seen, hold, chosen = set(), set(), set()
    for s in acting:
        if s in seen:
            continue
        comp, stack = set(), [s]
        while stack:
            u = stack.pop()
            if u in comp:
                continue
            comp.add(u)
            stack.extend(v for v in acting if v not in comp and overlaps(A, u, v))
        seen |= comp
        cands = [u for u in SLOTS if u in comp and u not in PROTECTED]
        if len(comp) == 1:
            chosen |= set(cands)
        elif cands:
            best = max(cands, key=lambda u: (by[u]["dropped_per_run"], -SLOTS.index(u)))
            chosen.add(best)
            hold |= {u for u in cands if u != best}
    for s in acting:
        v = by[s]["verdict"]
        if s in PROTECTED:
            by[s]["items"].append(
                "founder item: %s verdict on a protected reviewer (receipt floor / Opus "
                "trigger are rules, not yield bets)" % v)
        elif s in hold:
            by[s]["items"].append("hold (overlap guard, re-read next month)")
        elif s in chosen:
            by[s]["items"].append("roster action: %s" % v)
    # rule 9 model trigger
    models = []
    for m in sorted(A["answering"]):
        cur = A["answering"][m]
        e = {"model": m, "runs": cur["runs"], "unique": cur["unique"],
             "unique_per_run": round(cur["unique"] / cur["runs"], 4) if cur["runs"] else None,
             "past_runs": 0, "past_unique_per_run": None, "trigger": False}
        p = past["answering"].get(m) if past else None
        if p:
            e["past_runs"] = p["runs"]
            e["past_unique_per_run"] = round(p["unique"] / p["runs"], 4) if p["runs"] else None
        if (cur["runs"] >= 40 and p and p["runs"] >= 40 and p["unique"] > 0
                and (cur["unique"] / cur["runs"]) * 2 < p["unique"] / p["runs"]):
            e["trigger"] = True
        models.append(e)
    return rows, models


def stats_tables(A):
    def tbl(d, served):
        return {k: {"attempts": v["attempts"], "ok": v["ok"],
                    "success_rate": round(v["ok"] / v["attempts"], 3) if v["attempts"] else None,
                    **({"served_assumed": v["assumed"]} if served else {})}
                for k, v in sorted(d.items())}
    return {"requested": tbl(A["requested"], False), "served": tbl(A["served"], True)}


def recheck(records, content_dir, seed):
    ver, drp = [], []
    for r in records:
        if r.get("status") != "reviewed":
            continue
        for d in r.get("defects") or []:
            if d.get("state") == "verified":
                ver.append((r, d))
            elif d.get("state") == "dropped":
                drp.append((r, d))
    rng = random.Random(seed)
    lines = ["", "Re-check sample (triage is the session's own; verify against stored content)"]
    for label, pool, n in (("verified", ver, 3), ("dropped", drp, 1)):
        if len(pool) < n:
            lines.append("%s: only %d eligible, re-checking all of them" % (label, len(pool)))
            pick = list(pool)
        else:
            pick = rng.sample(pool, n)
        for r, d in pick:
            ln = d.get("line")
            lines.append("- [%s] %s  %s:%s  snapshot %s" % (
                label, d.get("summary"), d.get("file"), ln if ln is not None else "?",
                r.get("snapshot")))
            h = d.get("content")
            path = os.path.join(content_dir, h) if h else None
            if path and os.path.isfile(path):
                with open(path, encoding="utf-8", errors="replace") as f:
                    src = f.read().splitlines()
                if not isinstance(ln, int) or isinstance(ln, bool):
                    lines.append("    no line recorded")
                elif ln < 1 or ln > len(src):
                    lines.append("    line %s is beyond the stored file (%d lines)" % (ln, len(src)))
                else:
                    for i in range(max(1, ln - 5), min(len(src), ln + 5) + 1):
                        lines.append("    %s %4d | %s" % (">" if i == ln else " ", i, src[i - 1]))
            else:
                lines.append("    " + (d.get("content_missing") or "content not stored"))
    return lines


def git_common_dir():
    try:
        return subprocess.check_output(
            ["git", "rev-parse", "--path-format=absolute", "--git-common-dir"],
            text=True, stderr=subprocess.DEVNULL).strip()
    except (subprocess.CalledProcessError, OSError):
        return None


def main():
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--tallies")
    ap.add_argument("--days", type=int)
    ap.add_argument("--since")
    ap.add_argument("--until")
    ap.add_argument("--json", action="store_true")
    ap.add_argument("--recheck", action="store_true")
    ap.add_argument("--seed", type=int)
    ap.add_argument("--content-dir")
    ap.add_argument("--table-test", action="store_true")
    a = ap.parse_args()

    if a.table_test:
        for runs in range(0, 81):
            for u in range(0, 6):
                for h in (0, 1):
                    print("%d,%d,%d,%s" % (runs, u, h, verdict(runs, u, bool(h))))
        return 0

    gc = git_common_dir()
    tallies = a.tallies or (os.path.join(gc, ".review-tallies") if gc else None)
    content_dir = a.content_dir or (os.path.join(gc, ".review-tally-content") if gc else "")
    if not tallies or not os.path.isfile(tallies):
        print("no tallies recorded yet")
        return 0

    now = dt.datetime.now(dt.timezone.utc)
    if a.since or a.until:
        try:
            start = dt.datetime.fromisoformat(a.since).replace(tzinfo=dt.timezone.utc) \
                if a.since else None
            end = (dt.datetime.fromisoformat(a.until).replace(tzinfo=dt.timezone.utc)
                   + dt.timedelta(days=1)) if a.until else now
        except ValueError:
            print("bad --since/--until (want YYYY-MM-DD)", file=sys.stderr)
            return 2
    else:
        start, end = now - dt.timedelta(days=a.days or 30), now

    allrecs = load_records(tallies)
    if a.until:  # exclusive at the next midnight
        win = [r for r in allrecs if (start is None or start <= r["_ts"]) and r["_ts"] < end]
    else:
        win = [r for r in allrecs if start <= r["_ts"] <= end]
    past = [] if start is None else [
        r for r in allrecs if start - dt.timedelta(days=90) <= r["_ts"] < start]
    if start is not None:
        start_txt = str(start.date())
    else:
        start_txt = str(min(r["_ts"] for r in win).date()) if win else "-"
    A, P = analyze(win), analyze(past)
    rows, models = build(A, P)
    tables = stats_tables(A)
    splits = {s: {"kind": A["slots"][s]["kind"], "bucket": A["slots"][s]["bucket"]}
              for s in SLOTS}
    splits["gemini_fallback_rounds"] = A["gemini_fallback_rounds"]

    if a.json:
        doc = {"reviewers": rows, "models": {"tables": tables, "answering": models},
               "overlap": A["overlap"], "splits": splits,
               "abandoned": A["abandoned"], "waived": A["waived"], "rounds": A["rounds"]}
        print(json.dumps(doc, indent=2))
        return 0

    o = ["Reviewer yield report: %s to %s, %d reviewed rounds, %d abandoned, %d waived" % (
        start_txt, (end - dt.timedelta(days=1)).date() if a.until else end.date(),
        A["rounds"], A["abandoned"], A["waived"]),
        "unique = no other reviewer in the round raised it, /finish criteria subagents included",
        ""]
    for r in rows:
        c = r["slot_counts"]
        o.append("%s: verdict=%s | dropped per run=%.2f | runs=%d unique=%d unique HIGH=%d "
                 "solo catches (separate)=%d | ok rounds=%d" % (
                     r["reviewer"], r["verdict"], r["dropped_per_run"], r["runs"], r["unique"],
                     r["unique_high"], r["solo"], r["ok_rounds"]))
        o.append("    slots ok=%d failed=%d missing=%d skipped=%d not triggered=%d | "
                 "availability failures=%s | tokens per run=%s" % (
                     c["ok"], c["failed"], c["missing"], c["skipped"], c["not triggered"],
                     pct(r["availability_failures"]),
                     "unreported" if r["tokens_per_run"] is None else r["tokens_per_run"]))
        for it in r["items"]:
            o.append("    item: " + it)
    o += ["", "Overlap (verified defects shared by a pair)"]
    for k, v in A["overlap"].items():
        o.append("  %s: %d" % (k, v))
    for title, key in (("Models by requested", "requested"), ("Models by served", "served")):
        o += ["", title]
        for m, v in tables[key].items():
            note = ""
            if key == "served" and v.get("served_assumed"):
                note = "  (served = requested (header has no served field))"
            o.append("  %s: attempts=%d ok=%d success=%s%s" % (
                m, v["attempts"], v["ok"], pct(v["success_rate"]), note))
    o += ["", "Answering models (runs belong to the model that answered)"]
    for m in models:
        o.append("  %s: runs=%d unique=%d past runs=%d%s" % (
            m["model"], m["runs"], m["unique"], m["past_runs"],
            "  item: benchmark re-run item" if m["trigger"] else ""))
    o += ["", "Splits (runs / verified-unique)"]
    for s in SLOTS:
        parts = ["%s %d/%d" % (k, v["runs"], v["unique"]) for k, v in splits[s]["kind"].items()]
        parts += ["%s %d/%d" % (k, v["runs"], v["unique"]) for k, v in splits[s]["bucket"].items()]
        o.append("  %s: %s" % (s, "; ".join(parts)))
    o.append("  gemini rounds that used the fallback: %d" % A["gemini_fallback_rounds"])
    if a.recheck:
        o += recheck([r for r in win], content_dir, a.seed)
    print("\n".join(o))
    return 0


if __name__ == "__main__":
    sys.exit(main())
