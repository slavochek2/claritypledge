#!/usr/bin/env python3
"""
P1102 — refuse a migration whose EXECUTE grant contradicts another migration.

READ-ONLY. Reads .sql files off disk; never connects to a database.

Why this exists
---------------
Whenever two migrations touch the same privilege, the later timestamp wins on every
ordered apply, regardless of which one is correct. P1093 revoked `authenticated` on a
writer; a drift remediation written hours later restored the grant, with a LATER
timestamp. On a fresh environment, a replay, or the pending prod deploy, the restore
ran after the revoke and re-opened the hole — and the run ended green. Nothing
generating that remediation could see that it contradicted a migration already in
the repo (docs/decisions.md 2026-08-18, P1093 → P1102).

So two shapes are refused, for the client roles anon and authenticated. Access is
modelled the way Postgres holds it: per function, a role-direct grant and a PUBLIC grant
are separate sources, and a role can execute when EITHER is granted. REVOKE FROM PUBLIC
removes only the PUBLIC grant; REVOKE FROM anon only anon's direct grant. A source no
migration ever mentions counts as not granted.

  widens-revoked   After this file a role can execute a function that, before it, a
                   REVOKE from an EARLIER migration had closed. Widening a deliberate narrowing is a human decision,
                   so it must say so: `-- widens-revoked-grant: <version> <reason>`,
                   where <version> is the revoking migration's 14-digit prefix. Citing
                   the version is the point — it proves the author found the revoke.
  revoke-undone    This file's REVOKE closed a role, and a LATER migration's GRANT
                   (direct or PUBLIC) leaves it open at the end of the sequence. Ordered apply will
                   undo this revoke. No annotation can fix that; re-assert the revoke
                   in a migration ordered last (P1093 did exactly this).

The asymmetry is deliberate and is the one the grant-drift check makes: a narrowing
that wins on timestamp is at worst an outage, which is loud; a widening that wins is
a vulnerability, which is silent. Only the widening needs a human in the loop.

Known limitations (epistemic gate 7b — the honest list; not fixed, by decision):
  - Grants issued dynamically (EXECUTE 'GRANT ...' inside a DO block or a function
    body). Bodies are blanked before parsing, so those statements are invisible.
  - `GRANT ... ON ALL FUNCTIONS IN SCHEMA`, ALTER DEFAULT PRIVILEGES, and the default
    grants a new function receives (PUBLIC, and Supabase's role-direct defaults). A
    source no statement mentions counts as not granted, and a function created after a
    DROP starts with no state rather than as granted.
  - Overloads written without an argument list (`ON FUNCTION fn`) are matched to
    every overload of that name, which can over-report.
  - ALTER FUNCTION ... RENAME / SET SCHEMA, and CREATE OR REPLACE changing what the
    signature means: identity changes are not followed.
  - Unqualified function names are taken as `public` regardless of search_path; type
    names are canonicalised only for pg_catalog built-ins (domains and user types in
    other schemas compare by spelling).
  - Roles other than anon/authenticated/PUBLIC, role membership (GRANT anon TO x),
    WITH GRANT OPTION / REVOKE GRANT OPTION FOR, and GRANTED BY are not modelled.
  - A half-revoke (one source revoked, the other still granted — P1066) is not an
    ordering problem and is not refused here.
  - The annotation is file-wide per version: one `widens-revoked-grant: V` line
    acknowledges every function in that file whose closing revoke was in V.
  - Live state. A grant changed out of band never appears in migration text; the
    grant-drift check (scripts/function-grant-drift-check.py) owns that question.

Usage
-----
  scripts/check-migration-grant-order.py FILE...   # refuse contradictions in FILEs
  scripts/check-migration-grant-order.py --tree    # audit every revoke→grant transition
  --index                                          # read the git index, not the disk
                                                   # (pre-commit: what will be committed)
  --dir DIR                                        # migrations directory (default:
                                                   # supabase/migrations here)

A function's identity is schema + name + INPUT argument types (OUT parameters dropped;
IN/INOUT/VARIADIC mode words and argument names stripped), with built-in type spellings
canonicalised (pg_catalog.uuid = uuid, int4 = integer, varchar(32) = character varying,
uuid ARRAY = uuid[]).

Exit codes: 0 no refusal · 1 a contradiction was refused · 2 could not run.
--tree reports and exits 0: the corpus predates this check, and a whole-tree gate
would hold every commit hostage to history (the same reason P1042 scopes to staged
files). Its output is the audit trail for P1102's sibling review.
"""

import argparse
import importlib.util
import os
import re
import subprocess
import sys

_HERE = os.path.dirname(os.path.abspath(__file__))
try:
    _spec = importlib.util.spec_from_file_location(
        "_function_grant_drift_check", os.path.join(_HERE, "function-grant-drift-check.py"))
    _fgd = importlib.util.module_from_spec(_spec)
    _spec.loader.exec_module(_fgd)
except Exception as exc:  # noqa: BLE001 — any import failure means the check cannot run
    # An uncaught traceback exits 1, which callers read as "refused" — a finding.
    print(f"ERROR: cannot load function-grant-drift-check.py: {type(exc).__name__}: {exc}",
          file=sys.stderr)
    print("The check did NOT run. This is not a clean result.", file=sys.stderr)
    sys.exit(2)

# Comments, string literals and dollar-quoted bodies blanked, line structure kept.
# Reused rather than restated: it already carries the review fixes for quoted
# identifiers holding apostrophes (P1327).
sql_code = _fgd._sql_code

CLIENT_ROLES = ("anon", "authenticated", "public")
# The roles a PUBLIC grant or revoke can open or close.
EXPANDED_ROLES = ("anon", "authenticated")
# [ \t] rather than \s throughout: \s crosses the newline, and the next line of SQL
# would then be read as the annotation's reason.
MARKER_RE = re.compile(r"^[ \t]*--[ \t]*widens-revoked-grant:[ \t]*(\d{14})\b[ \t]*(\S.*)?$",
                       re.IGNORECASE | re.MULTILINE)

_PRIV = r"(?:EXECUTE|ALL(?:\s+PRIVILEGES)?)"
GRANT_RE = re.compile(
    rf"^GRANT\s+{_PRIV}\s+ON\s+(?:FUNCTION|ROUTINE|PROCEDURE)\s+(.+?)\s+TO\s+(.+?)"
    r"(?:\s+WITH\s+GRANT\s+OPTION)?(?:\s+GRANTED\s+BY\s+\S+)?$", re.IGNORECASE | re.DOTALL)
REVOKE_RE = re.compile(
    rf"^REVOKE\s+{_PRIV}\s+ON\s+(?:FUNCTION|ROUTINE|PROCEDURE)\s+(.+?)\s+FROM\s+(.+?)"
    r"(?:\s+GRANTED\s+BY\s+\S+)?(?:\s+(?:CASCADE|RESTRICT))?$", re.IGNORECASE | re.DOTALL)
DROP_RE = re.compile(
    r"^DROP\s+(?:FUNCTION|ROUTINE|PROCEDURE)\s+(?:IF\s+EXISTS\s+)?(.+?)(?:\s+(?:CASCADE|RESTRICT))?$",
    re.IGNORECASE | re.DOTALL)
# CREATE without OR REPLACE makes a new object, which starts from default privileges.
CREATE_RE = re.compile(r"^CREATE\s+(?:FUNCTION|PROCEDURE)\s+(.+?\))", re.IGNORECASE | re.DOTALL)

# Spellings Postgres treats as one type, mapped to the name format_type() prints.
TYPE_ALIASES = {
    "int": "integer", "int4": "integer", "int2": "smallint", "int8": "bigint",
    "bool": "boolean", "varchar": "character varying", "float8": "double precision",
    "float": "double precision", "float4": "real",
    "timestamptz": "timestamp with time zone", "timestamp without time zone": "timestamp",
    "timetz": "time with time zone", "time without time zone": "time",
    "decimal": "numeric", "char": "character", "bpchar": "character",
}
# First words of multi-word type names. An argument whose first word is one of these
# is a bare type; otherwise a two-or-more-word argument starts with its name.
MULTIWORD_TYPE_STARTS = {"timestamp", "time", "character", "double", "bit", "interval", "national"}
ARG_MODES = {"in", "out", "inout", "variadic"}


def split_top_level(text, sep=","):
    parts, depth, cur = [], 0, []
    for ch in text:
        if ch == "(":
            depth += 1
        elif ch == ")":
            depth -= 1
        if ch == sep and depth == 0:
            parts.append("".join(cur))
            cur = []
        else:
            cur.append(ch)
    parts.append("".join(cur))
    return [p.strip() for p in parts if p.strip()]


def normalise_arg(arg):
    """One argument's contribution to the signature, or None when it has none.

    Postgres identifies a function by its INPUT types: an OUT parameter is not part of
    the signature, so f(IN p uuid, OUT r text) IS f(uuid). INOUT and VARIADIC arguments
    are inputs and keep their types; the mode word and the argument name are dropped.
    """
    arg = re.split(r"\s+DEFAULT\s+|\s*=\s*", arg, maxsplit=1, flags=re.IGNORECASE)[0]
    # `uuid ARRAY`, `uuid ARRAY[3]`, `uuid [ ]` and `uuid[3]` are all uuid[]: Postgres
    # ignores declared array bounds. Folded BEFORE tokenising, or `uuid ARRAY` reads as an
    # argument named uuid of type "array".
    arg = re.sub(r"\s+array\b(?:\s*\[\s*\d*\s*\])?", "[]", arg, flags=re.IGNORECASE)
    arg = re.sub(r"\s*\[\s*\d*\s*\]", "[]", arg)
    tokens = arg.split()
    if tokens and tokens[0].lower() == "out":
        return None
    if tokens and tokens[0].lower() in ARG_MODES:
        tokens = tokens[1:]
    # Judge the first word without its schema: `pg_catalog.timestamp with time zone` is a
    # bare type, not an argument named `pg_catalog.timestamp`.
    if len(tokens) > 1 and tokens[0].lower().strip('"').split(".")[-1] not in MULTIWORD_TYPE_STARTS:
        tokens = tokens[1:]
    t = " ".join(tokens).lower().replace('"', "")
    base, brackets = re.match(r"^(.*?)((?:\[\])*)$", t).groups()
    # Built-in types resolve through pg_catalog whether or not it is written, and a
    # function's argument types carry no typmod: f(varchar(32)) IS f(varchar).
    base = re.sub(r"^(?:pg_catalog|public)\.", "", base.strip())
    base = " ".join(re.sub(r"\([^)]*\)", " ", base).split())
    return TYPE_ALIASES.get(base, base) + brackets


def parse_function_ref(ref):
    """`public.fn(uuid, text)` -> (('public', 'fn'), ('uuid', 'text')); `fn` -> (('public', 'fn'), None).

    The schema is part of the identity: public.f(uuid) and private.f(uuid) are two
    functions, and merging them both invents refusals and hides real ones. Unqualified
    means public — the schema every migration here writes to.
    """
    ref = ref.strip()
    if "(" in ref:
        name, args = ref.split("(", 1)
        args = args.rsplit(")", 1)[0]
        argt = tuple(t for t in (normalise_arg(a) for a in split_top_level(args)) if t is not None)
    else:
        name, argt = ref, None
    parts = [p[1:-1].replace('""', '"') if p.startswith('"') else p.lower()
             for p in re.findall(r'"(?:[^"]|"")+"|[^."\s]+', name.strip())]
    schema = parts[-2] if len(parts) >= 2 else "public"
    return (schema, parts[-1] if parts else ""), argt


def parse_roles(text):
    """The grant SOURCES a GRANT/REVOKE names: any of 'anon', 'authenticated', 'public'.

    Never expanded. Postgres keeps a role-direct grant and a PUBLIC grant as two ACL
    entries and a role can execute when EITHER is present: REVOKE FROM PUBLIC removes
    only the PUBLIC entry, REVOKE FROM anon only anon's. Treating PUBLIC as shorthand for
    both roles let a PUBLIC grant survive same-file direct revokes, and let a later
    REVOKE FROM PUBLIC pass as a re-assert over a direct grant (Codex probes, 2026-10-13).
    """
    out = []
    for r in split_top_level(text):
        r = r.strip().strip('"').lower()
        if r.startswith("group "):
            r = r[6:].strip()
        if r in CLIENT_ROLES and r not in out:
            out.append(r)
    return out


def roles_for(source):
    """The client roles a statement to `source` can open or close."""
    return EXPANDED_ROLES if source == "public" else (source,)


def label(role, source):
    return f"{role} (via PUBLIC)" if source == "public" else role


def parse_events(code):
    """Yield (line, kind, (name, args), source|None) in statement order.

    kind is 'grant', 'revoke' or 'reset' (DROP, or a plain CREATE: the object that
    follows starts from default privileges, so nothing before it constrains it).
    """
    events, pos = [], 0
    for raw in code.split(";"):
        stmt_line = code.count("\n", 0, pos + len(raw) - len(raw.lstrip())) + 1
        pos += len(raw) + 1
        stmt = " ".join(raw.split())
        if not stmt:
            continue
        for regex, kind in ((GRANT_RE, "grant"), (REVOKE_RE, "revoke")):
            m = regex.match(stmt)
            if m:
                if kind == "revoke" and re.match(r"^REVOKE\s+GRANT\s+OPTION", stmt, re.IGNORECASE):
                    break
                for ref in split_top_level(m.group(1)):
                    for source in parse_roles(m.group(2)):
                        events.append((stmt_line, kind, parse_function_ref(ref), source))
                break
        else:
            m = DROP_RE.match(stmt)
            if m:
                for ref in split_top_level(m.group(1)):
                    events.append((stmt_line, "reset", parse_function_ref(ref), None))
                continue
            m = CREATE_RE.match(stmt)
            if m:
                events.append((stmt_line, "reset", parse_function_ref(m.group(1)), None))
    return events


def version(fname):
    return os.path.basename(fname)[:14]


class Ledger:
    """Replays events in migration order. Holds, per function and grant SOURCE (anon,
    authenticated, PUBLIC), the latest GRANT/REVOKE and the file it came from."""

    def __init__(self, state=None, seq=0):
        self.state = dict(state or {})   # (name, args, source) -> (kind, file, seq)
        self.seq = seq

    def copy(self):
        return Ledger(self.state, self.seq)

    def _lookup(self, name, args, source):
        hits = [v for k, v in self.state.items() if k[0] == name and k[2] == source
                and (args is None or k[1] is None or k[1] == args)]
        return max(hits, key=lambda h: h[2]) if hits else None

    def _reset_keys(self, name, args):
        # A DROP of one overload resets that overload only. It must not erase a word
        # spoken about every overload (args None), which still binds the others.
        return [k for k in self.state if k[0] == name and (args is None or k[1] == args)]

    def access(self, name, args, role):
        """(is_open, evidence) for a client role.

        Open when the role's direct grant OR the PUBLIC grant is present. A source with
        no statement in the corpus counts as not granted. Evidence is the deciding
        entries as [(source, (kind, file, seq))]: the grants when open, the revokes when
        closed (empty when nothing was ever said).
        """
        srcs = [(role, self._lookup(name, args, role)), ("public", self._lookup(name, args, "public"))]
        grants = [(s, v) for s, v in srcs if v and v[0] == "grant"]
        if grants:
            return True, grants
        return False, [(s, v) for s, v in srcs if v and v[0] == "revoke"]

    def apply(self, fname, events):
        for _, kind, (name, args), source in events:
            self.seq += 1
            if kind == "reset":
                for k in self._reset_keys(name, args):
                    del self.state[k]
            else:
                self.state[(name, args, source)] = (kind, fname, self.seq)


def latest(evidence):
    """The most recent deciding entry; within one file the direct source wins over PUBLIC."""
    return max(evidence, key=lambda e: (e[1][1], e[0] != "public"))


class CannotRun(Exception):
    """The check cannot reach a verdict; callers exit 2, never 0."""


def load(dir_path):
    files = sorted(f for f in os.listdir(dir_path) if f.endswith(".sql"))
    parsed = {}
    for f in files:
        with open(os.path.join(dir_path, f), "r", encoding="utf-8") as fh:
            raw = fh.read()
        parsed[f] = (raw, parse_events(sql_code(raw)))
    return files, parsed


def _git(dir_path, *args):
    p = subprocess.run(["git", "-C", dir_path, *args], capture_output=True)
    if p.returncode != 0:
        raise CannotRun(f"git {' '.join(args)} failed: "
                        f"{p.stderr.decode('utf-8', errors='replace').strip()}")
    return p.stdout


def load_index(dir_path):
    """The corpus as the commit will record it: every migration in the INDEX, read from
    its staged blob.

    The working tree is the wrong source for a pre-commit gate. A contradictory GRANT
    staged and then overwritten on disk without restaging is what gets committed while
    the disk copy passes; an untracked re-assert sitting on disk is not committed at
    all, yet would hide the revoke it re-asserts. Same source scripts/check-disclosure.sh
    reads (`git show :path`).
    """
    entries = {}
    for rec in _git(dir_path, "ls-files", "-s", "-z", "--", ".").split(b"\0"):
        if not rec:
            continue
        meta, path = rec.split(b"\t", 1)
        _, sha, stage = meta.split()
        path = path.decode("utf-8")
        if "/" in path or not path.endswith(".sql"):
            continue
        if stage != b"0":
            raise CannotRun(f"{path} is unmerged in the index (stage {stage.decode()})")
        entries[path] = sha.decode()
    files = sorted(entries)
    # One `git cat-file --batch` for every blob: a process per migration made this gate
    # take ~14s on 413 files, on every commit that stages a migration.
    p = subprocess.run(["git", "-C", dir_path, "cat-file", "--batch"],
                       input="".join(entries[f] + "\n" for f in files).encode(), capture_output=True)
    if p.returncode != 0:
        raise CannotRun(f"git cat-file --batch failed: {p.stderr.decode('utf-8', errors='replace').strip()}")
    out, pos, parsed = p.stdout, 0, {}
    for f in files:
        nl = out.index(b"\n", pos)
        header = out[pos:nl].split()
        if len(header) != 3 or header[1] != b"blob":
            raise CannotRun(f"{f}: unexpected index entry ({out[pos:nl].decode(errors='replace')})")
        size = int(header[2])
        raw = out[nl + 1: nl + 1 + size].decode("utf-8")
        pos = nl + 1 + size + 1
        parsed[f] = (raw, parse_events(sql_code(raw)))
    return files, parsed


def analyse(files, parsed, snapshot=()):
    """Walk the corpus once. Returns (transitions, final_ledger, snapshots).

    A transition is a file after which a client role can execute a function that,
    before it, a REVOKE from an earlier file had closed — counting both of the role's
    grant sources. A grant on a function this file dropped first is a new object and
    does not count. `snapshots` holds the ledger just after each file in `snapshot`.
    """
    ledger, transitions, snapshots = Ledger(), [], {}
    for f in files:
        raw, events = parsed[f]
        acked = {m.group(1) for m in MARKER_RE.finditer(raw)
                 if m.group(2) and m.group(2).strip()}
        before = ledger.copy()
        ledger.apply(f, events)
        if f in snapshot:
            snapshots[f] = ledger.copy()
        seen, resets = set(), []
        for line, kind, (name, args), source in events:
            if kind == "reset":
                resets.append((name, args))
                continue
            if kind != "grant" or any(rn == name and (ra is None or ra == args) for rn, ra in resets):
                continue
            for role in roles_for(source):
                if (name, args, role) in seen:
                    continue
                was_open, closed_by = before.access(name, args, role)
                now_open, opened_by = ledger.access(name, args, role)
                if was_open or not closed_by or not now_open:
                    continue
                seen.add((name, args, role))
                rsrc, (_, revoked_in, _) = latest(closed_by)
                gsrc = latest([e for e in opened_by if e[1][1] == f] or opened_by)[0]
                transitions.append({
                    "file": f, "line": line, "function": name, "args": args, "role": role,
                    "granted_as": label(role, gsrc), "revoked_as": label(role, rsrc),
                    "revoked_in": revoked_in, "acknowledged": version(revoked_in) in acked,
                })
    return transitions, ledger, snapshots


def fmt_fn(name, args):
    qual = ".".join(name)
    return f"{qual}({', '.join(args)})" if args is not None else f"{qual}(…any overload)"


def check_files(targets, files, parsed):
    target_names = {os.path.basename(t) for t in targets}
    # A target the corpus does not hold has not been checked. Skipping it would report
    # "ok" for a file nobody read.
    missing = sorted(target_names - set(parsed))
    if missing:
        raise CannotRun(f"not found in the migrations being checked: {', '.join(missing)}")
    transitions, final, after = analyse(files, parsed, snapshot=target_names)
    refusals = []

    for t in transitions:
        if t["file"] in target_names and not t["acknowledged"]:
            refusals.append(
                f"{t['file']}:{t['line']}: widens-revoked — GRANTs {t['granted_as']} EXECUTE on "
                f"{fmt_fn(t['function'], t['args'])}, which {t['revoked_in']} revoked from "
                f"{t['revoked_as']}. If that is intended, say so in this file:\n"
                f"      -- widens-revoked-grant: {version(t['revoked_in'])} <why the revoke no longer holds>")

    for f in sorted(target_names):
        seen = set()
        for line, kind, (name, args), source in parsed[f][1]:
            if kind != "revoke":
                continue
            for role in roles_for(source):
                if (name, args, role) in seen:
                    continue
                seen.add((name, args, role))
                # Only a revoke that actually closed the role can be undone; a half-revoke
                # (the other source still granted) is P1066's problem, not ordering.
                closed, by = after[f].access(name, args, role)
                if closed or not any(e[1][1] == f for e in by):
                    continue
                is_open, opened_by = final.access(name, args, role)
                later = [e for e in opened_by if e[1][1] > f]
                if not is_open or not later:
                    continue
                # An acknowledgement covers the revoke it names, for this function and role.
                if any(t["acknowledged"] and t["file"] > f and t["function"] == name
                       and t["args"] == args and t["role"] == role for t in transitions):
                    continue
                gsrc, (_, gfile, _) = latest(later)
                refusals.append(
                    f"{f}:{line}: revoke-undone — REVOKEs {label(role, source)} EXECUTE on "
                    f"{fmt_fn(name, args)}, but {gfile} sorts later and GRANTs it back "
                    f"({label(role, gsrc)}), so every ordered apply ends granted. Re-assert "
                    f"the revoke, from that same source, in a migration ordered after {version(gfile)}.")
    return refusals


def main():
    ap = argparse.ArgumentParser(description="Refuse migrations whose EXECUTE grants contradict "
                                             "another migration (P1102). Read-only.")
    ap.add_argument("files", nargs="*", help="migration files to check (typically the staged ones)")
    ap.add_argument("--tree", action="store_true",
                    help="report every revoke-then-grant transition in the corpus; exits 0")
    ap.add_argument("--dir", help="migrations directory (default: supabase/migrations)")
    ap.add_argument("--index", action="store_true",
                    help="read migrations from the git index (what the commit will hold), "
                         "not the working tree — the mode pre-commit uses")
    args = ap.parse_args()

    dir_path = args.dir or os.path.join(os.path.dirname(_HERE), "supabase", "migrations")
    if not os.path.isdir(dir_path):
        print(f"ERROR: migrations directory not found: {dir_path}", file=sys.stderr)
        return 2
    if not args.tree and not args.files:
        ap.error("pass migration files, or --tree")

    try:
        files, parsed = load_index(dir_path) if args.index else load(dir_path)
        if args.tree:
            transitions, final, _ = analyse(files, parsed)
            print(f"{len(transitions)} revoke-then-grant transition(s) across {len(files)} migrations:")
            for t in transitions:
                is_open, ev = final.access(t["function"], t["args"], t["role"])
                now = (f"{'grant' if is_open else 'revoke'} by {latest(ev)[1][1]}" if ev
                       else "reset since")
                print(f"  {t['file']}:{t['line']}  {t['granted_as']} on {fmt_fn(t['function'], t['args'])}"
                      f"  revoked in {t['revoked_in']}"
                      f"  [{'acknowledged' if t['acknowledged'] else 'UNACKNOWLEDGED'}; final: {now}]")
            return 0
        refusals = check_files(args.files, files, parsed)
    except (OSError, UnicodeDecodeError, CannotRun) as exc:
        print(f"ERROR: {exc}", file=sys.stderr)
        print("The check did NOT run. This is not a clean result.", file=sys.stderr)
        return 2

    for r in refusals:
        print(f"  REFUSED {r}")
    if refusals:
        print(f"  {len(refusals)} grant-order contradiction(s). Two migrations disagreeing on a "
              "privilege is resolved by timestamp on every apply, not by which one is right (P1102).")
        return 1
    print(f"  ok: no grant-order contradiction in {len(args.files)} file(s)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
