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

So two shapes are refused, for anon / authenticated / PUBLIC only. PUBLIC is expanded to
anon AND authenticated in both directions. For a GRANT that is exact: a PUBLIC grant
reaches both roles. For a REVOKE it is an intent reading, not an effect: REVOKE ... FROM
PUBLIC leaves a role-direct grant in place (P1066), so it may over-refuse a later grant
to that role. That is the safe direction, and the annotation below resolves it.

  widens-revoked   This file GRANTs a role EXECUTE on a function, and the last
                   statement any EARLIER migration made for that role and function
                   was a REVOKE. Widening a deliberate narrowing is a human decision,
                   so it must say so: `-- widens-revoked-grant: <version> <reason>`,
                   where <version> is the revoking migration's 14-digit prefix. Citing
                   the version is the point — it proves the author found the revoke.
  revoke-undone    This file REVOKEs, and a LATER migration's GRANT for the same role
                   and function survives to the end of the sequence. Ordered apply will
                   undo this revoke. No annotation can fix that; re-assert the revoke
                   in a migration ordered last (P1093 did exactly this).

The asymmetry is deliberate and is the one the grant-drift check makes: a narrowing
that wins on timestamp is at worst an outage, which is loud; a widening that wins is
a vulnerability, which is silent. Only the widening needs a human in the loop.

What it does NOT see (epistemic gate 7b — the honest list):
  - Grants issued dynamically (EXECUTE 'GRANT ...' inside a DO block or a function
    body). Bodies are blanked before parsing, so those statements are invisible.
  - `GRANT ... ON ALL FUNCTIONS IN SCHEMA` and ALTER DEFAULT PRIVILEGES. Supabase's
    default privileges grant EXECUTE on every new function; a function created after a
    DROP is therefore treated as having no prior state rather than as granted.
  - Overloads written without an argument list (`ON FUNCTION fn`) are matched to
    every overload of that name, which can over-report.
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

A function's identity is schema + name + argument types, with built-in type spellings
canonicalised (pg_catalog.uuid = uuid, int4 = integer, varchar(32) = character varying).

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
# What PUBLIC expands to. Every comparison is made per client role, never on PUBLIC itself.
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
    arg = re.split(r"\s+DEFAULT\s+|\s*=\s*", arg, maxsplit=1, flags=re.IGNORECASE)[0]
    tokens = arg.split()
    if tokens and tokens[0].lower() in ARG_MODES:
        tokens = tokens[1:]
    # Judge the first word without its schema: `pg_catalog.timestamp with time zone` is a
    # bare type, not an argument named `pg_catalog.timestamp`.
    if len(tokens) > 1 and tokens[0].lower().strip('"').split(".")[-1] not in MULTIWORD_TYPE_STARTS:
        tokens = tokens[1:]
    t = " ".join(tokens).lower().replace('"', "")
    t = re.sub(r"\s+\[", "[", t)
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
        argt = tuple(normalise_arg(a) for a in split_top_level(args))
    else:
        name, argt = ref, None
    parts = [p[1:-1].replace('""', '"') if p.startswith('"') else p.lower()
             for p in re.findall(r'"(?:[^"]|"")+"|[^."\s]+', name.strip())]
    schema = parts[-2] if len(parts) >= 2 else "public"
    return (schema, parts[-1] if parts else ""), argt


def parse_roles(text):
    """Client roles a GRANT/REVOKE speaks for, as [(role, spelled)].

    PUBLIC includes every role, so `TO PUBLIC` / `FROM PUBLIC` speaks for anon AND
    authenticated: a GRANT TO PUBLIC re-opens a function revoked from anon, and a GRANT
    TO anon after a REVOKE FROM PUBLIC re-grants anon (/finish review 2026-10-13).
    `spelled` keeps what the migration wrote, for the message. A role named directly in
    the same statement wins over its PUBLIC expansion.
    """
    out = {}
    for r in split_top_level(text):
        r = r.strip().strip('"').lower()
        if r.startswith("group "):
            r = r[6:].strip()
        if r == "public":
            for role in EXPANDED_ROLES:
                out.setdefault(role, "public")
        elif r in EXPANDED_ROLES:
            out[r] = r
    return list(out.items())


def role_label(role, spelled):
    return f"{role} (via PUBLIC)" if spelled == "public" else role


def parse_events(code):
    """Yield (line, kind, (name, args), role|None, spelled|None) in statement order.

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
                    for role, spelled in parse_roles(m.group(2)):
                        events.append((stmt_line, kind, parse_function_ref(ref), role, spelled))
                break
        else:
            m = DROP_RE.match(stmt)
            if m:
                for ref in split_top_level(m.group(1)):
                    events.append((stmt_line, "reset", parse_function_ref(ref), None, None))
                continue
            m = CREATE_RE.match(stmt)
            if m:
                events.append((stmt_line, "reset", parse_function_ref(m.group(1)), None, None))
    return events


def version(fname):
    return os.path.basename(fname)[:14]


class Ledger:
    """Replays events in migration order and answers 'what was the last word on
    (function, role) before this point, and from which file?'."""

    def __init__(self):
        self.state = {}   # (name, args, role) -> (kind, file)

    def _keys(self, name, args):
        return [k for k in self.state if k[0] == name and (args is None or k[1] is None or k[1] == args)]

    def _reset_keys(self, name, args):
        # A DROP of one overload resets that overload only. It must not erase a word
        # spoken about every overload (args None), which still binds the others.
        return [k for k in self.state if k[0] == name and (args is None or k[1] == args)]

    def last_word(self, name, args, role):
        """The latest grant/revoke covering (name, args, role), or None."""
        hits = [self.state[k] for k in self._keys(name, args) if k[2] == role]
        if not hits:
            return None
        # Entries are (kind, file, seq); the highest sequence number is the latest word.
        return max(hits, key=lambda h: h[2])

    def apply(self, fname, events, seq_start):
        seq = seq_start
        for _, kind, (name, args), role, spelled in events:
            seq += 1
            if kind == "reset":
                for k in self._reset_keys(name, args):
                    del self.state[k]
            else:
                prev = self.state.get((name, args, role))
                if prev and prev[1] == fname and prev[0] == kind and prev[3] != "public":
                    spelled = prev[3]   # the file also named the role directly; say that
                self.state[(name, args, role)] = (kind, fname, seq, spelled)
        return seq


def file_net(events):
    """Per (name, args, role): this file's final grant/revoke, whether a reset of that
    function preceded it inside the file, and the line it was made on.

    "That function" means the same schema, name AND overload: dropping f(text) says
    nothing about f(uuid)."""
    net, resets = {}, []
    for line, kind, (name, args), role, spelled in events:
        if kind == "reset":
            resets.append((name, args))
            continue
        was_reset = any(rn == name and (ra is None or ra == args) for rn, ra in resets)
        prev = net.get((name, args, role))
        if prev and prev[0] == kind and prev[3] != "public":
            spelled = prev[3]
        net[(name, args, role)] = (kind, was_reset, line, spelled)
    return net


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
    parsed = {}
    for f in files:
        raw = _git(dir_path, "cat-file", "blob", entries[f]).decode("utf-8")
        parsed[f] = (raw, parse_events(sql_code(raw)))
    return files, parsed


def analyse(files, parsed):
    """Walk the corpus once. Returns (transitions, final_ledger).

    A transition is a file whose net word on (function, role) is GRANT while the last
    word from an earlier file was REVOKE, with no reset of the function in between.
    """
    ledger, seq, transitions = Ledger(), 0, []
    for f in files:
        raw, events = parsed[f]
        acked = {m.group(1) for m in MARKER_RE.finditer(raw)
                 if m.group(2) and m.group(2).strip()}
        for (name, args, role), (kind, was_reset, line, spelled) in file_net(events).items():
            if kind != "grant" or was_reset:
                continue
            prior = ledger.last_word(name, args, role)
            if prior and prior[0] == "revoke" and prior[1] != f:
                transitions.append({
                    "file": f, "line": line, "function": name, "args": args, "role": role,
                    "granted_as": role_label(role, spelled),
                    "revoked_as": role_label(role, prior[3]),
                    "revoked_in": prior[1], "acknowledged": version(prior[1]) in acked,
                })
        seq = ledger.apply(f, events, seq)
    return transitions, ledger


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
    transitions, final = analyse(files, parsed)
    refusals = []

    for t in transitions:
        if t["file"] in target_names and not t["acknowledged"]:
            refusals.append(
                f"{t['file']}:{t['line']}: widens-revoked — GRANTs {t['granted_as']} EXECUTE on "
                f"{fmt_fn(t['function'], t['args'])}, which {t['revoked_in']} revoked from "
                f"{t['revoked_as']}. If that is "
                f"intended, say so in this file:\n"
                f"      -- widens-revoked-grant: {version(t['revoked_in'])} <why the revoke no longer holds>")

    for f in sorted(target_names):
        for (name, args, role), (kind, _, line, spelled) in file_net(parsed[f][1]).items():
            if kind != "revoke":
                continue
            last = final.last_word(name, args, role)
            if last and last[0] == "grant" and last[1] > f:
                # The later grant may itself be an acknowledged widening of THIS revoke;
                # then a human has already decided the order, and it is not an accident.
                if any(t["file"] == last[1] and t["revoked_in"] == f and t["acknowledged"]
                       for t in transitions):
                    continue
                refusals.append(
                    f"{f}:{line}: revoke-undone — REVOKEs {role_label(role, spelled)} EXECUTE on "
                    f"{fmt_fn(name, args)}, but {last[1]} sorts later and GRANTs it back "
                    f"({role_label(role, last[3])}), so every ordered apply ends "
                    f"granted. Re-assert the revoke in a migration ordered after {version(last[1])}.")
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
            transitions, final = analyse(files, parsed)
            print(f"{len(transitions)} revoke-then-grant transition(s) across {len(files)} migrations:")
            for t in transitions:
                last = final.last_word(t["function"], t["args"], t["role"])
                now = f"{last[0]} by {last[1]}" if last else "reset since"
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
