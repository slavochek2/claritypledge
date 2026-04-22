#!/usr/bin/env python3
"""
Scan Claude Code session transcripts for tool-call inefficiencies.

Usage:
  python3 scripts/scan-transcript-efficiency.py
  python3 scripts/scan-transcript-efficiency.py --days 14
  python3 scripts/scan-transcript-efficiency.py --output .private/reports/efficiency/2026-04-22.md
  python3 scripts/scan-transcript-efficiency.py --sample 30
  python3 scripts/scan-transcript-efficiency.py --verify-baseline

Patterns detected:
  P1. Same file Read twice in one session (suppressed when file changed between reads
      or non-overlapping line ranges).
  P2. Read-after-Edit/Write verification loop (sub-case a: post-Edit likely waste;
      sub-case b: post-Write sometimes legitimate — tracked separately).
  P3. Sequential single-tool read-only calls that could have been parallel.
      Dependency detection: skip if current input derives a token from prior result.
  P4. Subagent re-searches — NOT measurable (no isSidechain records in JSONL).
  P5. Repeated git status (>3 per session).
"""
from __future__ import annotations

import argparse
import json
import os
import random
import re
from collections import defaultdict
from dataclasses import dataclass, field
from datetime import datetime
from pathlib import Path

TRANSCRIPT_DIR = os.path.expanduser(
    "~/.claude/projects/-Users-slavochek-Projects-public-claritypledge/"
)
DEFAULT_REPORT_DIR = ".private/reports/efficiency"

READ_ONLY_TOOLS = {"Read", "Grep", "Glob"}
READ_ONLY_BASH_PREFIXES = (
    "git status",
    "git log",
    "git diff",
    "git show",
    "git branch",
    "ls ",
    "find ",
    "grep ",
    "rg ",
    "cat ",
    "head ",
    "tail ",
    "wc ",
    "pwd",
    "echo ",
    "du ",
    "stat ",
    "file ",
    "which ",
    "type ",
)


def is_read_only_bash(cmd: str) -> bool:
    c = cmd.strip()
    if not c:
        return False
    if any(tok in c for tok in ("rm ", " > ", " >> ", "mv ", "cp -", "npm install", "git push", "git commit", "git add", "git branch -d", "git branch -D", "git reset", "git checkout --", "git restore", "git rebase", "git merge")):
        return False
    for p in READ_ONLY_BASH_PREFIXES:
        if c.startswith(p.rstrip()):
            return True
    return c in ("ls", "pwd")


@dataclass
class P3Sample:
    prev_name: str
    prev_input: str
    curr_name: str
    curr_input: str
    dt_seconds: float
    session_id: str


@dataclass
class SessionStats:
    session_id: str
    file_path: str
    file_size: int
    assistant_msgs: int = 0
    total_output_tokens: int = 0
    total_cache_creation: int = 0
    total_cache_read: int = 0
    p1_redundant_reads: int = 0
    p1_waste_tokens: int = 0
    p1_examples: list = field(default_factory=list)
    # P2 sub-case a: post-Edit (likely waste); b: post-Write (sometimes legitimate)
    p2a_hits: int = 0
    p2b_hits: int = 0
    p2_waste_tokens: int = 0
    p2_examples: list = field(default_factory=list)
    p3_hits: int = 0
    p3_waste_tokens: int = 0
    p3_examples: list = field(default_factory=list)
    p3_samples: list = field(default_factory=list)
    p5_git_status_count: int = 0
    p5_examples: list = field(default_factory=list)
    score: int = 0


def parse_ts(ts: str) -> float:
    try:
        return datetime.fromisoformat(ts.replace("Z", "+00:00")).timestamp()
    except Exception:
        return 0.0


def extract_result_text(content) -> str:
    if isinstance(content, str):
        return content
    if isinstance(content, list):
        parts = []
        for block in content:
            if isinstance(block, dict) and block.get("type") == "text":
                parts.append(block.get("text", ""))
            elif isinstance(block, str):
                parts.append(block)
        return " ".join(parts)
    return str(content or "")


def has_derived_token(curr_input: str, prev_result: str, min_len: int = 8) -> bool:
    """Return True if any meaningful token from curr_input appears in prev_result.

    This detects dependent pairs like Bash(ls dir) → Read(file-from-ls):
    the file path token from the Read input will appear in the ls result.
    """
    if not prev_result or not curr_input:
        return False
    tokens = [t for t in re.split(r"[\s/\-:]+", curr_input) if len(t) >= min_len]
    prev_lower = prev_result.lower()
    return any(t.lower() in prev_lower for t in tokens)


def analyze_session(file_path: str) -> SessionStats | None:
    session_id = Path(file_path).stem
    size = os.path.getsize(file_path)
    stats = SessionStats(session_id=session_id, file_path=file_path, file_size=size)

    events = []
    tool_use_meta: dict[str, dict] = {}
    tool_result_errored: dict[str, bool] = {}
    # tool_use_id -> truncated result text, for P3 dependency detection
    tool_result_content: dict[str, str] = {}

    with open(file_path, "r", encoding="utf-8", errors="replace") as f:
        for line in f:
            line = line.strip()
            if not line:
                continue
            try:
                obj = json.loads(line)
            except Exception:
                continue
            etype = obj.get("type")
            ts = parse_ts(obj.get("timestamp", "") or "")
            is_sidechain = bool(obj.get("isSidechain", False))
            uuid = obj.get("uuid", "")

            if etype == "assistant":
                msg = obj.get("message") or {}
                usage = msg.get("usage") or {}
                ot = int(usage.get("output_tokens", 0) or 0)
                cc = int(usage.get("cache_creation_input_tokens", 0) or 0)
                cr = int(usage.get("cache_read_input_tokens", 0) or 0)
                stats.assistant_msgs += 1
                stats.total_output_tokens += ot
                stats.total_cache_creation += cc
                stats.total_cache_read += cr
                content = msg.get("content") or []
                tool_uses = []
                for block in content:
                    if not isinstance(block, dict):
                        continue
                    if block.get("type") == "tool_use":
                        tu = {"id": block.get("id"), "name": block.get("name"), "input": block.get("input") or {}}
                        tool_uses.append(tu)
                        tin = tu["input"]
                        name = tu["name"]
                        if name in ("Read", "Edit", "Write"):
                            tool_use_meta[tu["id"]] = {"name": name, "file_path": tin.get("file_path", ""), "ts": ts, "is_sidechain": is_sidechain}
                        elif name == "Bash":
                            tool_use_meta[tu["id"]] = {"name": "Bash", "command": tin.get("command", ""), "ts": ts, "is_sidechain": is_sidechain}
                        elif name in ("Grep", "Glob"):
                            tool_use_meta[tu["id"]] = {"name": name, "pattern": tin.get("pattern", "") or tin.get("query", ""), "path": tin.get("path", ""), "ts": ts, "is_sidechain": is_sidechain}
                events.append({"ts": ts, "type": "assistant", "is_sidechain": is_sidechain, "uuid": uuid, "tool_uses": tool_uses, "output_tokens": ot, "cache_creation": cc})

            elif etype == "user":
                msg = obj.get("message") or {}
                content = msg.get("content") or []
                if isinstance(content, list):
                    for block in content:
                        if not isinstance(block, dict):
                            continue
                        if block.get("type") == "tool_result":
                            tid = block.get("tool_use_id")
                            if tid:
                                tool_result_errored[tid] = bool(block.get("is_error", False))
                                tool_result_content[tid] = extract_result_text(block.get("content") or "")[:3000]
                events.append({"ts": ts, "type": "user", "is_sidechain": is_sidechain, "uuid": uuid})

    # Pattern 1: duplicate Reads (suppressed when file changed between reads or non-overlapping ranges)
    path_reads: dict[str, list[dict]] = defaultdict(list)
    for i, ev in enumerate(events):
        if ev["type"] != "assistant" or ev["is_sidechain"]:
            continue
        for tu in ev.get("tool_uses", []):
            if tu["name"] == "Read":
                fp = tu["input"].get("file_path", "")
                path_reads[fp].append({"idx": i, "ts": ev["ts"], "tu_id": tu["id"], "offset": tu["input"].get("offset"), "limit": tu["input"].get("limit")})

    for fp, reads in path_reads.items():
        if not isinstance(fp, str) or len(reads) < 2:
            continue
        seen = []
        for r in reads:
            overlap = False
            for prev in seen:
                def _int(v, d):
                    try:
                        return int(v) if v is not None else d
                    except Exception:
                        return d
                p_start = _int(prev["offset"], 1) or 1
                p_end = p_start + (_int(prev["limit"], 10_000_000) or 10_000_000) - 1
                c_start = _int(r["offset"], 1) or 1
                c_end = c_start + (_int(r["limit"], 10_000_000) or 10_000_000) - 1
                if c_start <= p_end and p_start <= c_end:
                    file_changed = any(
                        tu["name"] in ("Edit", "Write") and tu["input"].get("file_path") == fp
                        for ev2 in events[prev["idx"] + 1 : r["idx"]]
                        if ev2["type"] == "assistant"
                        for tu in ev2.get("tool_uses", [])
                    )
                    if not file_changed:
                        overlap = True
                        break
            if overlap:
                stats.p1_redundant_reads += 1
                stats.p1_waste_tokens += events[r["idx"]]["output_tokens"] + events[r["idx"]]["cache_creation"]
                if len(stats.p1_examples) < 3:
                    stats.p1_examples.append(fp)
            seen.append(r)

    # Pattern 2: Read-after-Edit/Write (2 sub-cases tracked separately)
    for i, ev in enumerate(events):
        if ev["type"] != "assistant" or ev["is_sidechain"]:
            continue
        for tu in ev.get("tool_uses", []):
            if tu["name"] not in ("Edit", "Write"):
                continue
            edit_fp = tu["input"].get("file_path", "")
            if not edit_fp or tool_result_errored.get(tu["id"], False):
                continue
            is_edit = tu["name"] == "Edit"
            seen_asst = 0
            j = i + 1
            while j < len(events) and seen_asst < 2:
                ev2 = events[j]
                if ev2["type"] == "assistant" and not ev2["is_sidechain"]:
                    seen_asst += 1
                    for tu2 in ev2.get("tool_uses", []):
                        if tu2["name"] == "Read" and tu2["input"].get("file_path") == edit_fp:
                            if is_edit:
                                stats.p2a_hits += 1
                            else:
                                stats.p2b_hits += 1
                            stats.p2_waste_tokens += ev2["output_tokens"] + ev2["cache_creation"]
                            if len(stats.p2_examples) < 3:
                                stats.p2_examples.append(edit_fp)
                            break
                j += 1

    # Pattern 3: sequential parallelizable calls — dependency detection via result content
    prev_asst: dict | None = None
    for ev in events:
        if ev["type"] != "assistant" or ev["is_sidechain"]:
            continue
        tool_uses = ev.get("tool_uses", [])
        if len(tool_uses) != 1:
            prev_asst = None
            continue
        tu = tool_uses[0]
        name = tu["name"]
        is_ro = False
        curr_input_str = ""
        ro_sig = None
        if name in READ_ONLY_TOOLS:
            is_ro = True
            if name == "Read":
                curr_input_str = tu["input"].get("file_path", "")
                ro_sig = ("Read", curr_input_str)
            elif name == "Grep":
                curr_input_str = f"{tu['input'].get('pattern', '')} {tu['input'].get('path', '')}"
                ro_sig = ("Grep", tu["input"].get("pattern", ""), tu["input"].get("path", ""))
            elif name == "Glob":
                curr_input_str = tu["input"].get("pattern", "")
                ro_sig = ("Glob", curr_input_str)
        elif name == "Bash":
            cmd = tu["input"].get("command", "")
            if is_read_only_bash(cmd):
                is_ro = True
                curr_input_str = cmd
                ro_sig = ("Bash", cmd[:200])
        if not is_ro:
            prev_asst = None
            continue

        if prev_asst is not None:
            dt = ev["ts"] - prev_asst["ts"]
            if 0 < dt <= 60:
                prev_name = prev_asst["name"]
                # Hard exclusion: Grep → Read is almost always dependent
                if not (prev_name == "Grep" and name == "Read"):
                    prev_result = tool_result_content.get(prev_asst.get("tool_use_id", ""), "")
                    if not has_derived_token(curr_input_str, prev_result):
                        stats.p3_hits += 1
                        stats.p3_waste_tokens += ev["output_tokens"] + ev["cache_creation"]
                        if len(stats.p3_examples) < 3:
                            stats.p3_examples.append(f"{prev_name} -> {name}")
                        stats.p3_samples.append(P3Sample(
                            prev_name=prev_name,
                            prev_input=str(prev_asst.get("sig", ""))[:200],
                            curr_name=name,
                            curr_input=curr_input_str[:200],
                            dt_seconds=dt,
                            session_id=stats.session_id,
                        ))

        prev_asst = {"ts": ev["ts"], "name": name, "sig": ro_sig, "tool_use_id": tu["id"]}

    # Pattern 5: git status spam (>3 per session)
    for ev in events:
        if ev["type"] != "assistant" or ev["is_sidechain"]:
            continue
        for tu in ev.get("tool_uses", []):
            if tu["name"] == "Bash":
                cmd = (tu["input"].get("command", "") or "").strip()
                if re.match(r"^git status(\s|$)", cmd):
                    stats.p5_git_status_count += 1
                    if len(stats.p5_examples) < 3:
                        stats.p5_examples.append(cmd[:80])

    return stats


def load_baseline(report_dir: Path) -> dict | None:
    for rpt in sorted(report_dir.glob("*.md"), reverse=True):
        m = re.search(r"<!--\s*SCANNER_METRICS:\s*({.*?})\s*-->", rpt.read_text())
        if m:
            try:
                return json.loads(m.group(1))
            except Exception:
                pass
    return None


def main():
    ap = argparse.ArgumentParser(description="Scan session transcripts for tool-call inefficiencies.")
    ap.add_argument("--days", type=int, default=7, help="Days window (default: 7)")
    ap.add_argument("--output", type=str, default=None, help="Output path (default: .private/reports/efficiency/<today>.md)")
    ap.add_argument("--sample", type=int, default=20, help="P3 spot-check sample size (default: 20)")
    ap.add_argument("--verify-baseline", action="store_true", help="Compare against most recent prior report")
    args = ap.parse_args()

    today = datetime.now().strftime("%Y-%m-%d")
    report_dir = Path(DEFAULT_REPORT_DIR)
    report_dir.mkdir(parents=True, exist_ok=True)

    if args.output:
        report_path = Path(args.output)
        report_path.parent.mkdir(parents=True, exist_ok=True)
    else:
        report_path = report_dir / f"{today}.md"

    baseline = load_baseline(report_dir) if args.verify_baseline else None

    window_s = args.days * 24 * 3600
    now = datetime.now().timestamp()
    files = [str(f) for f in Path(TRANSCRIPT_DIR).glob("*.jsonl") if (now - f.stat().st_mtime) <= window_s]

    print(f"Scanning {len(files)} files (last {args.days} days)...")
    all_stats: list[SessionStats] = []
    total_bytes = 0
    for i, f in enumerate(files):
        total_bytes += os.path.getsize(f)
        try:
            s = analyze_session(f)
            if s:
                all_stats.append(s)
        except Exception as e:
            print(f"  error in {f}: {e}")
        if (i + 1) % 25 == 0:
            print(f"  {i+1}/{len(files)}")

    total_sessions = len(all_stats)
    total_output_tokens = sum(s.total_output_tokens for s in all_stats)
    total_cache_creation = sum(s.total_cache_creation for s in all_stats)
    total_cache_read = sum(s.total_cache_read for s in all_stats)

    p1_total = sum(s.p1_redundant_reads for s in all_stats)
    p1_tokens = sum(s.p1_waste_tokens for s in all_stats)
    p2a_total = sum(s.p2a_hits for s in all_stats)
    p2b_total = sum(s.p2b_hits for s in all_stats)
    p2_total = p2a_total + p2b_total
    p2_tokens = sum(s.p2_waste_tokens for s in all_stats)
    p3_total = sum(s.p3_hits for s in all_stats)
    p3_tokens = sum(s.p3_waste_tokens for s in all_stats)
    p5_sessions = [s for s in all_stats if s.p5_git_status_count > 3]
    p5_total_extra = sum(max(0, s.p5_git_status_count - 3) for s in p5_sessions)

    for s in all_stats:
        s.score = s.p1_waste_tokens + s.p2_waste_tokens + s.p3_waste_tokens + max(0, s.p5_git_status_count - 3) * 500

    top_sessions = sorted(all_stats, key=lambda s: s.score, reverse=True)[:10]

    def top_n(attr_hits: str, attr_tokens: str, n: int = 5) -> list[SessionStats]:
        return sorted([s for s in all_stats if getattr(s, attr_hits, 0) > 0], key=lambda s: getattr(s, attr_tokens), reverse=True)[:n]

    def short(s: SessionStats) -> str:
        return f"`{s.session_id[:8]}` ({s.file_size/1024:.0f}KB)"

    all_p3_samples: list[P3Sample] = [sample for s in all_stats for sample in s.p3_samples]
    sample_size = min(args.sample, len(all_p3_samples))
    p3_spot_check = random.sample(all_p3_samples, sample_size) if all_p3_samples else []

    metrics = {"p1": p1_total, "p2": p2_total, "p3": p3_total, "p5": p5_total_extra, "sessions": total_sessions, "date": today, "days": args.days}
    lines = []
    lines.append(f"<!-- SCANNER_METRICS: {json.dumps(metrics)} -->")
    lines.append("")
    lines.append("# Claude Code Transcript Efficiency Report")
    lines.append("")
    lines.append(f"**Generated:** {datetime.now().isoformat(timespec='seconds')}")
    lines.append(f"**Window:** last {args.days} days ({today})")
    lines.append("")
    lines.append("> **Honesty note:** Numbers below are raw counts from automated heuristics. The P3 (sequential-parallelizable) detector has known false positives — see the spot-check sample in §3. Estimated true waste rate: unknown until manually reviewed. Do not use raw counts to drive rule edits without a manual spot-check confirming >50% of flagged instances are genuine.")
    lines.append("")

    if baseline:
        prev_date = baseline.get("date", "?")
        lines.append("## Week-over-Week Comparison")
        lines.append("")
        lines.append(f"| Pattern | Previous ({prev_date}) | Current ({today}) | Δ |")
        lines.append("|---------|----------------------|------------------|---|")
        for key, label in [("p1", "P1 duplicate Reads"), ("p2", "P2 Read-after-Edit/Write"), ("p3", "P3 sequential"), ("p5", "P5 git-status extra")]:
            prev_val = baseline.get(key, 0)
            curr_val = metrics[key]
            delta = curr_val - prev_val
            arrow = "↑" if delta > 0 else ("↓" if delta < 0 else "—")
            lines.append(f"| {label} | {prev_val} | {curr_val} | {arrow} {abs(delta)} |")
        lines.append("")

    lines.append("## 1. Summary")
    lines.append("")
    lines.append(f"- Sessions scanned: **{total_sessions}**")
    lines.append(f"- Transcript bytes: **{total_bytes/1024/1024:.1f} MB**")
    lines.append(f"- Total output tokens: **{total_output_tokens:,}**")
    lines.append(f"- Total cache-creation tokens: **{total_cache_creation:,}**")
    lines.append(f"- Total cache-read tokens: **{total_cache_read:,}**")
    lines.append("")
    pattern_rank = sorted([
        ("P1 duplicate Reads", p1_tokens, p1_total, "redundant Reads"),
        ("P2 Read-after-Edit/Write", p2_tokens, p2_total, "verification reads"),
        ("P3 sequential-parallelizable", p3_tokens, p3_total, "extra round-trips"),
        ("P5 git-status spam", p5_total_extra * 500, p5_total_extra, "extra git status calls"),
    ], key=lambda t: t[1], reverse=True)
    lines.append("**Raw counts by pattern:**")
    for idx, (name, tok, hits, unit) in enumerate(pattern_rank, 1):
        lines.append(f"{idx}. **{name}** — {hits:,} {unit}, ~{tok:,} tokens in redundant msgs")
    lines.append("")
    lines.append("**P4 (subagent re-searches): not measurable.** No `isSidechain: true` records found — subagent telemetry is not in this data source.")
    lines.append("")

    lines.append("## 2. Per-pattern findings")
    lines.append("")

    lines.append("### P1: Duplicate Reads")
    lines.append("")
    lines.append("Suppressed when file changed between reads or non-overlapping line ranges.")
    lines.append(f"- **Raw count:** {p1_total:,} across {sum(1 for s in all_stats if s.p1_redundant_reads)} sessions")
    lines.append(f"- **Token proxy:** ~{p1_tokens:,}")
    lines.append("")
    for s in top_n("p1_redundant_reads", "p1_waste_tokens"):
        ex = s.p1_examples[0] if s.p1_examples else "—"
        lines.append(f"- {short(s)} — {s.p1_redundant_reads} redundant, ~{s.p1_waste_tokens:,} tok; e.g. `{ex}`")
    lines.append("")

    lines.append("### P2: Read-after-Edit/Write")
    lines.append("")
    lines.append("CLAUDE.md rule: 'Do NOT re-read a file you just edited to verify.'")
    lines.append(f"- **Sub-case a (post-Edit — likely waste):** {p2a_total:,} across {sum(1 for s in all_stats if s.p2a_hits)} sessions")
    lines.append(f"- **Sub-case b (post-Write — sometimes legitimate for convergence):** {p2b_total:,} across {sum(1 for s in all_stats if s.p2b_hits)} sessions")
    lines.append(f"- **Combined token proxy:** ~{p2_tokens:,}")
    lines.append("")
    for s in top_n("p2_waste_tokens", "p2_waste_tokens"):
        ex = s.p2_examples[0] if s.p2_examples else "—"
        lines.append(f"- {short(s)} — {s.p2a_hits + s.p2b_hits} hits (a:{s.p2a_hits}/b:{s.p2b_hits}), ~{s.p2_waste_tokens:,} tok; e.g. `{ex}`")
    lines.append("")

    lines.append("### P3: Sequential Parallelizable Calls")
    lines.append("")
    lines.append("Two consecutive single-tool read-only msgs within 60s. Dependency check: skip if current input contains a token (≥8 chars) from prior result. Hard exclusion: Grep→Read.")
    lines.append(f"- **Raw count:** {p3_total:,} across {sum(1 for s in all_stats if s.p3_hits)} sessions")
    lines.append(f"- **Token proxy:** ~{p3_tokens:,}")
    lines.append("")
    for s in top_n("p3_hits", "p3_waste_tokens"):
        ex = s.p3_examples[0] if s.p3_examples else "—"
        lines.append(f"- {short(s)} — {s.p3_hits} hits, ~{s.p3_waste_tokens:,} tok; e.g. `{ex}`")
    lines.append("")

    lines.append("### P5: `git status` Repetition (>3 per session)")
    lines.append("")
    lines.append(f"- **Sessions exceeding threshold:** {len(p5_sessions)}")
    lines.append(f"- **Extra calls above threshold:** {p5_total_extra}")
    lines.append("")
    for s in sorted(p5_sessions, key=lambda s: s.p5_git_status_count, reverse=True)[:5]:
        lines.append(f"- {short(s)} — {s.p5_git_status_count} `git status` calls")
    lines.append("")

    lines.append("## 3. P3 Spot-Check Sample")
    lines.append("")
    lines.append(f"Random sample of {sample_size} flagged P3 pairs (of {len(all_p3_samples)} total). Review to estimate false-positive rate before drawing any conclusions.")
    lines.append("")
    if p3_spot_check:
        lines.append("| # | Prev tool | Prev input (truncated) | Curr tool | Curr input (truncated) | Δt(s) |")
        lines.append("|---|-----------|------------------------|-----------|------------------------|-------|")
        for i, s in enumerate(p3_spot_check, 1):
            prev_in = s.prev_input.replace("|", "\\|")[:60]
            curr_in = s.curr_input.replace("|", "\\|")[:60]
            lines.append(f"| {i} | {s.prev_name} | `{prev_in}` | {s.curr_name} | `{curr_in}` | {s.dt_seconds:.1f} |")
    else:
        lines.append("*No P3 samples to display.*")
    lines.append("")

    lines.append("## 4. Session Hotlist")
    lines.append("")
    lines.append("| Session | Size | P1 | P2 | P3 | P5 | Score (tok) |")
    lines.append("|---|---|---|---|---|---|---|")
    for s in top_sessions:
        lines.append(f"| `{s.session_id[:8]}` | {s.file_size/1024:.0f}KB | {s.p1_redundant_reads} | {s.p2a_hits + s.p2b_hits} | {s.p3_hits} | {s.p5_git_status_count} | {s.score:,} |")
    lines.append("")

    report_path.write_text("\n".join(lines))
    print(f"\nReport: {report_path}")
    print(f"Sessions: {total_sessions} | Bytes: {total_bytes/1024/1024:.1f}MB")
    print(f"P1={p1_total} P2={p2_total}(a:{p2a_total}/b:{p2b_total}) P3={p3_total} P5_extra={p5_total_extra}")
    if args.verify_baseline and baseline:
        print(f"Baseline: {baseline.get('date', '?')} — P1={baseline.get('p1', 0)} P2={baseline.get('p2', 0)} P3={baseline.get('p3', 0)} P5={baseline.get('p5', 0)}")


if __name__ == "__main__":
    main()
