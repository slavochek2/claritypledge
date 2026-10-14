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

Two orders, because two orders run. A fresh environment or a replay applies migrations
in filename order; test and prod (migrate.sh) apply every version missing from remote
history AFTER everything already applied, whatever its timestamp. Staged files that are
new versions are therefore also judged as applying last, and a contradiction in either
order is refused. `--invariant` adds a whole-tree rule over the index: no unacknowledged
revoke-then-grant may end granted — which is what catches a re-assert being renamed
earlier, deleted, or edited so it no longer revokes.

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
  - The annotation is file-wide per version: one `widens-revoked-grant: V` line counts
    for every function in that file that V helped hold closed. A re-grant is
    acknowledged only when it cites EVERY revoke that held the role closed since it was
    last open, not just the newest. Only a real
    `--` comment that starts its line counts (not text in a string, a /* */ comment or
    a dollar-quoted body).
  - Merges by cherry-pick. /ship lands commits with cherry-pick, which runs no hook, so
    a contradiction that exists only once two branches combine is not checked when it
    forms. `--invariant` catches it on the next commit that stages any migration; until
    then nothing does. A ship-time / CI run of `--index --invariant` is the follow-up.
  - Which versions are applied is not known offline. "New version" means added (or
    renamed/copied to a new path) relative to HEAD; a modified file is judged in its
    filename position. A migration added earlier on the same branch, not yet applied,
    and then edited to add a grant is therefore judged in filename order only.
  - Nested /* */ comments and E'' strings with backslash escapes are not parsed as
    Postgres does, for both statement parsing and annotation detection.
  - Transaction control is refused, not modelled: a file with ROLLBACK / ROLLBACK TO /
    SAVEPOINT / ABORT that also GRANTs or REVOKEs function EXECUTE fails closed unless
    annotated `-- grant-order-transaction-control: <reason>` — after which its statements
    are taken at face value. COMMIT and other transaction statements are not inspected.
  - Generations: a DROP (or plain CREATE) of a matching overload ends the object, and the
    invariant judges earlier re-grants, and revoke-undone earlier revokes, within their
    own generation. A DROP of an argument-less name ends every overload; CREATE OR
    REPLACE never does.
  - Type identity drops typmods, so float(p) is always double precision (Postgres maps
    float(1..24) to real), and only built-in alias spellings are unified.
  - Live state. A grant changed out of band never appears in migration text; the
    grant-drift check (scripts/function-grant-drift-check.py) owns that question.

Usage
-----
  scripts/check-migration-grant-order.py FILE...   # refuse contradictions in FILEs
  scripts/check-migration-grant-order.py --tree    # audit every revoke→grant transition
  --index                                          # read the git index, not the disk
                                                   # (pre-commit: what will be committed)
  --invariant                                      # also refuse any unacknowledged
                                                   # revoke-then-grant that ends granted
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
# Matched against ONE real `--` comment (see annotation_versions), never the raw file.
MARKER_RE = re.compile(r"^--[ \t]*widens-revoked-grant:[ \t]*(\d{14})\b[ \t]*(\S.*)?$",
                       re.IGNORECASE)

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
# Only the head is matched: the reference runs to the BALANCED close of its argument
# list (closing_paren), since a DEFAULT expression can hold `)` of its own.
CREATE_RE = re.compile(r"^CREATE\s+(?:FUNCTION|PROCEDURE)\s+", re.IGNORECASE)

# Spellings Postgres treats as one type, mapped to the name format_type() prints.
TYPE_ALIASES = {
    "int": "integer", "int4": "integer", "int2": "smallint", "int8": "bigint",
    "bool": "boolean", "varchar": "character varying", "float8": "double precision",
    "float": "double precision", "float4": "real",
    "timestamptz": "timestamp with time zone", "timestamp without time zone": "timestamp",
    "timetz": "time with time zone", "time without time zone": "time",
    "decimal": "numeric", "char": "character", "bpchar": "character",
    "char varying": "character varying", "national character varying": "character varying",
    "national char varying": "character varying", "national character": "character",
    "national char": "character", "nchar": "character", "varbit": "bit varying",
}
# The multi-word type names. A multi-word argument that is NOT one of these starts with
# its name — including a name that is itself a type word: `time timestamptz` is an
# argument named time of type timestamptz.
MULTIWORD_TYPE_RE = re.compile(
    r"^(?:(?:timestamp|time)(?: (?:with|without) time zone)?"
    r"|character varying|char varying|double precision|bit varying"
    r"|national (?:character|char)(?: varying)?"
    r"|interval(?: (?:year|month|day|hour|minute|second)(?: to (?:month|hour|minute|second))?)?)$")
# Canonical built-ins whose internal array name is `_<name>` (`_text` IS text[]).
BUILTIN_TYPES = {
    "text", "uuid", "integer", "bigint", "smallint", "boolean", "json", "jsonb", "numeric",
    "character varying", "character", "timestamp with time zone", "timestamp", "time",
    "time with time zone", "date", "double precision", "real", "bytea", "interval", "oid",
    "bit varying",
}
ARG_MODES = {"in", "out", "inout", "variadic"}


def closing_paren(text, start):
    """Index of the `)` closing the first `(` at or after `start`, or None.

    Quoted text is skipped: `"f)"` is an identifier and `')'` a literal, neither a paren.
    """
    depth, quote = 0, None
    for i in range(start, len(text)):
        ch = text[i]
        if quote:
            if ch == quote:
                quote = None
        elif ch in "'\"":
            quote = ch
        elif ch == "(":
            depth += 1
        elif ch == ")" and depth:
            depth -= 1
            if not depth:
                return i
    return None


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
    # A function's argument types carry no typmod: f(varchar(32)) IS f(varchar) and
    # f(numeric(10, 2)) IS f(numeric). Stripped whole BEFORE tokenising, or the space in
    # `numeric(10, 2)` reads as an argument named `numeric(10,` of type `2)`.
    arg = re.sub(r"\s*\([^()]*\)", " ", arg)
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
    if len(tokens) > 1:
        whole = re.sub(r"^(?:pg_catalog|public)\.", "", " ".join(tokens).lower().replace('"', ""))
        if not MULTIWORD_TYPE_RE.match(re.sub(r"(?:\[\])+$", "", whole)):
            tokens = tokens[1:]
    t = " ".join(tokens).lower().replace('"', "")
    base, brackets = re.match(r"^(.*?)((?:\[\])*)$", t).groups()
    # Built-in types resolve through pg_catalog whether or not it is written.
    base = re.sub(r"^(?:pg_catalog|public)\.", "", base.strip())
    base = TYPE_ALIASES.get(base, base)
    if base.startswith("_") and TYPE_ALIASES.get(base[1:], base[1:]) in BUILTIN_TYPES:
        base, brackets = TYPE_ALIASES.get(base[1:], base[1:]), "[]"
    # Postgres does not distinguish array dimensions in a type: uuid[][] IS uuid[].
    return base + ("[]" if brackets else "")


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

    kind is 'grant', 'revoke', 'reset' (DROP, or a plain CREATE: the object that
    follows starts from default privileges, so nothing before it constrains it), or
    'txc' (ROLLBACK / ROLLBACK TO / SAVEPOINT / ABORT, outside comments and strings).
    """
    events, pos = [], 0
    for raw in code.split(";"):
        stmt_line = code.count("\n", 0, pos + len(raw) - len(raw.lstrip())) + 1
        pos += len(raw) + 1
        stmt = " ".join(raw.split())
        if not stmt:
            continue
        if re.match(r"^(?:ROLLBACK|SAVEPOINT|ABORT)\b", stmt, re.IGNORECASE):
            # Recorded, never interpreted: a GRANT/REVOKE a ROLLBACK undoes would
            # otherwise count as protection. See transaction_control_refusals.
            events.append((stmt_line, "txc", (("", ""), None), None))
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
            end = closing_paren(stmt, m.end()) if m else None
            if end is not None:
                events.append((stmt_line, "reset", parse_function_ref(stmt[m.end():end + 1]), None))
    return events


def version(fname):
    return os.path.basename(fname)[:14]


TXC_MARKER_RE = re.compile(r"^--[ \t]*grant-order-transaction-control:[ \t]*\S", re.IGNORECASE)


def annotation_versions(raw):
    """Versions cited by `-- widens-revoked-grant: <version> <reason>` annotations."""
    found = set()
    for comment in real_comments(raw):
        m = MARKER_RE.match(comment)
        if m and m.group(2) and m.group(2).strip():
            found.add(m.group(1))
    return found


def real_comments(raw):
    """Every `--` comment that starts its line, as text.

    Only these count as annotations. The same text inside a string literal, a /* */
    comment or a dollar-quoted body (a DO block, a function) is not an annotation, and
    matching the raw file let it acknowledge a widening.
    """
    found, i, n = [], 0, len(raw)
    while i < n:
        c = raw[i]
        if raw.startswith("/*", i):
            j = raw.find("*/", i + 2)
            i = n if j < 0 else j + 2
        elif raw.startswith("--", i):
            j = raw.find("\n", i)
            j = n if j < 0 else j
            if not raw[raw.rfind("\n", 0, i) + 1:i].strip():
                found.append(raw[i:j])
            i = j
        elif c in "'\"":
            j = i + 1
            while j < n and not (raw[j] == c and not raw.startswith(c * 2, j)):
                j += 2 if raw.startswith(c * 2, j) else 1
            i = j + 1
        elif c == "$" and re.match(r"\$\w*\$", raw[i:i + 64]):
            tag = re.match(r"\$\w*\$", raw[i:i + 64]).group(0)
            j = raw.find(tag, i + len(tag))
            i = n if j < 0 else j + len(tag)
        else:
            i += 1
    return found


class Ledger:
    """Replays events in migration order. Holds, per function and grant SOURCE (anon,
    authenticated, PUBLIC), the latest GRANT/REVOKE and the file it came from."""

    def __init__(self, state=None, seq=0, closers=None):
        self.state = dict(state or {})   # (name, args, source) -> (kind, file, seq, position)
        self.seq = seq
        # (name, args, source) -> every file that REVOKEd that source since it was last
        # granted. An acknowledgement must cite each of them, not just the newest.
        self.closers = dict(closers or {})

    def copy(self):
        return Ledger(self.state, self.seq, self.closers)

    def closing_revokes(self, name, args, role):
        """Every revoke that has held this role closed since it was last open."""
        files = set()
        for k, v in self.closers.items():
            if k[0] == name and k[2] in (role, "public") and (args is None or k[1] is None or k[1] == args):
                files.update(v)
        return files

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

    def overloads(self, name):
        return {k[1] for k in self.state if k[0] == name}

    def apply(self, fname, events, position):
        for _, kind, (name, args), source in events:
            self.seq += 1
            if kind == "txc":
                continue
            if kind == "reset":
                for k in self._reset_keys(name, args):
                    del self.state[k]
                    self.closers.pop(k, None)
            else:
                key = (name, args, source)
                self.state[key] = (kind, fname, self.seq, position)
                self.closers[key] = (self.closers.get(key, ()) + (fname,)) if kind == "revoke" else ()


def latest(evidence):
    """The most recent deciding entry, by position in the order replayed; within one file
    the direct source wins over PUBLIC."""
    return max(evidence, key=lambda e: (e[1][3], e[0] != "public"))


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


def index_added(dir_path):
    """Migrations that are NEW in the index relative to HEAD (added, or copied/renamed to
    a new path): new versions, which migrate.sh will apply after everything already
    applied. A modified file keeps its place — an applied version never re-runs."""
    out = _git(dir_path, "diff", "--cached", "--relative", "--name-only", "-z",
               "--diff-filter=ACR", "--", ".")
    return {p.decode("utf-8") for p in out.split(b"\0") if p}


def analyse(order, parsed, snapshot=()):
    """Replay `order` once. Returns (transitions, final_ledger, snapshots).

    A transition is a file after which a client role can execute a function that,
    before it, a REVOKE from an earlier file had closed — counting both of the role's
    grant sources. A grant on a function this file dropped first is a new object and
    does not count. An argument-less GRANT reaches every overload, so it is judged
    against each one's state, never the newest entry across them. `snapshots` holds the
    ledger just after each file in `snapshot`.
    """
    ledger, transitions, snapshots = Ledger(), [], {}
    for position, f in enumerate(order):
        raw, events = parsed[f]
        acked = annotation_versions(raw)
        before = ledger.copy()
        ledger.apply(f, events, position)
        if f in snapshot:
            snapshots[f] = ledger.copy()
        seen, resets = set(), []
        for line, kind, (name, args), source in events:
            if kind == "reset":
                resets.append((name, args))
                continue
            if kind != "grant":
                continue
            candidates = {args} if args is not None else (before.overloads(name) | {None})
            for ov in candidates:
                if any(rn == name and (ra is None or ra == ov) for rn, ra in resets):
                    continue
                for role in roles_for(source):
                    if (name, ov, role) in seen:
                        continue
                    was_open, closed_by = before.access(name, ov, role)
                    now_open, opened_by = ledger.access(name, ov, role)
                    if was_open or not closed_by or not now_open:
                        continue
                    seen.add((name, ov, role))
                    rsrc, (_, revoked_in, _, _) = latest(closed_by)
                    gsrc = latest([e for e in opened_by if e[1][1] == f] or opened_by)[0]
                    # An acknowledgement covers only the revokes it cites (Codex
                    # 2026-10-14): citing A must not exempt a different revoke Z that
                    # also held this role closed.
                    closing = before.closing_revokes(name, ov, role) or {revoked_in}
                    uncited = sorted(c for c in closing if version(c) not in acked)
                    transitions.append({
                        "file": f, "position": position, "line": line, "function": name,
                        "args": ov, "role": role,
                        "granted_as": label(role, gsrc), "revoked_as": label(role, rsrc),
                        "revoked_in": revoked_in, "closing": closing, "cited": acked,
                        "uncited": uncited, "acknowledged": not uncited, "ended": False,
                    })
        # Generations: a DROP (or plain CREATE) of a matching overload ends the object.
        # Transitions before it are judged within it — the invariant must not refuse
        # an old, since-closed restore because a NEW object of the same name is granted.
        for line, kind, (name, args), _ in events:
            if kind != "reset":
                continue
            for t in transitions:
                if (t["function"] == name and (args is None or t["args"] == args)
                        and (t["file"] != f or t["line"] < line)):
                    t["ended"] = True
    return transitions, ledger, snapshots


def fmt_fn(name, args):
    qual = ".".join(name)
    return f"{qual}({', '.join(args)})" if args is not None else f"{qual}(…any overload)"


def _refusals_in_order(order, target_names, parsed):
    transitions, final, after = analyse(order, parsed, snapshot=target_names)
    position = {f: i for i, f in enumerate(order)}
    refusals = []

    for t in transitions:
        if t["file"] in target_names and not t["acknowledged"]:
            refusals.append(
                f"{t['file']}:{t['line']}: widens-revoked — GRANTs {t['granted_as']} EXECUTE on "
                f"{fmt_fn(t['function'], t['args'])}, which {', '.join(t['uncited'])} revoked from "
                f"{t['revoked_as']}. If that is intended, say so in this file, once per revoke:\n"
                + "\n".join(f"      -- widens-revoked-grant: {version(u)} <why the revoke no longer holds>"
                            for u in t["uncited"]))

    # Every DROP / plain CREATE in this order, as (position, line, name, args).
    resets = [(position[g], line, name, args) for g in order
              for line, kind, (name, args), _ in parsed[g][1] if kind == "reset"]
    for f in sorted(target_names):
        seen = set()
        for line, kind, (name, args), source in parsed[f][1]:
            if kind != "revoke":
                continue
            # Generations, as the invariant judges them: a later DROP (or plain CREATE) of
            # this signature ends the object this revoke closed. A grant after it is on a
            # new object and undoes nothing; one before it ended with the object.
            if any(rn == name and (ra is None or ra == args)
                   and (rp, rl) > (position[f], line) for rp, rl, rn, ra in resets):
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
                later = [e for e in opened_by if e[1][3] > position[f]]
                if not is_open or not later:
                    continue
                # Exempt only when a later re-grant of this function and role cites EVERY
                # revoke that held it closed, this one among them. Citing a different
                # revoke exempts nothing (Codex 2026-10-14).
                if any(t["position"] > position[f] and t["function"] == name and t["args"] == args
                       and t["role"] == role and t["acknowledged"] and f in t["closing"]
                       for t in transitions):
                    continue
                gsrc, (_, gfile, _, _) = latest(later)
                refusals.append(
                    f"{f}:{line}: revoke-undone — REVOKEs {label(role, source)} EXECUTE on "
                    f"{fmt_fn(name, args)}, but {gfile} applies later and GRANTs it back "
                    f"({label(role, gsrc)}), so the run ends granted. Re-assert the revoke, "
                    f"from that same source, in a migration ordered after {version(gfile)}.")
    return refusals


def check_files(targets, files, parsed, pending=None):
    """Refusals for the target (staged) files, judged in BOTH orders that will run them.

    Filename order is what a fresh environment or a replay does. Apply order is what
    test and prod do: migrate.sh applies every version missing from remote history,
    whatever its timestamp, so a NEW file runs AFTER everything already applied — a
    GRANT dated before an applied REVOKE still lands last (Opus review 2026-10-14). A
    contradiction in either order is refused. `pending` names the targets that are new
    versions (None: all of them); an edited, already-applied file never re-runs, so
    moving it to the end would refuse comment-only edits to old migrations.
    """
    target_names = {os.path.basename(t) for t in targets}
    # A target the corpus does not hold has not been checked. Skipping it would report
    # "ok" for a file nobody read.
    missing = sorted(target_names - set(parsed))
    if missing:
        raise CannotRun(f"not found in the migrations being checked: {', '.join(missing)}")
    moved = target_names if pending is None else target_names & set(pending)
    apply_order = [f for f in files if f not in moved] + sorted(moved)
    refusals = []
    for order in (files, apply_order):
        for r in _refusals_in_order(order, target_names, parsed):
            if r not in refusals:
                refusals.append(r)
    return refusals


def check_invariant(files, parsed):
    """Whole-tree: no UNACKNOWLEDGED revoke-then-grant whose FINAL state is granted.

    Judging only the staged files' own statements misses every change that removes a
    re-assert rather than adding a grant: a `git mv` to an earlier timestamp, a delete,
    or an edit that stops it revoking. Each leaves an older unacknowledged re-grant as
    the last word. The real corpus holds one such re-grant (P1065), which a later
    migration re-asserts over, so it ends revoked and passes.
    """
    transitions, final, _ = analyse(files, parsed)
    refusals, seen = [], set()
    for t in transitions:
        key = (t["function"], t["args"], t["role"])
        if t["acknowledged"] or t["ended"] or key in seen or not final.access(*key)[0]:
            continue
        seen.add(key)
        refusals.append(
            f"invariant — {t['file']}:{t['line']} GRANTs {t['granted_as']} EXECUTE on "
            f"{fmt_fn(t['function'], t['args'])} back after {', '.join(t['uncited'])} revoked it, "
            f"unacknowledged, and nothing later revokes it again. Restore the re-assert, "
            f"or acknowledge the widening in {t['file']}.")
    return refusals


def transaction_control_refusals(files, parsed):
    """Fail closed on transaction control the ledger cannot interpret.

    `BEGIN; REVOKE ...; ROLLBACK;` leaves nothing revoked, yet the ledger would count
    the revoke as protection. Rather than model savepoints, a file that both controls
    transactions and GRANTs/REVOKEs function EXECUTE is refused unless it says why its
    grants are unaffected (`-- grant-order-transaction-control: <reason>`). Every file
    in the corpus is checked: the analysis of a staged file depends on all of them.
    On 2026-10-14 no migration in the repo contained such a statement.
    """
    refusals = []
    for f in files:
        raw, events = parsed[f]
        txc = [e[0] for e in events if e[1] == "txc"]
        if not txc or not any(e[1] in ("grant", "revoke") for e in events):
            continue
        if any(TXC_MARKER_RE.match(c) for c in real_comments(raw)):
            continue
        refusals.append(
            f"{f}:{txc[0]}: unsupported transaction control — ROLLBACK / SAVEPOINT in a migration "
            f"that GRANTs or REVOKEs function EXECUTE; this check cannot tell which grants survive. "
            f"Restructure, or annotate:\n"
            f"      -- grant-order-transaction-control: <why the grants and revokes are unaffected>")
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
    ap.add_argument("--invariant", action="store_true",
                    help="also refuse any unacknowledged revoke-then-grant in the whole corpus "
                         "whose final state is granted (pre-commit runs this whenever a staged "
                         "path is a migration: added, changed, renamed or deleted)")
    args = ap.parse_args()

    dir_path = args.dir or os.path.join(os.path.dirname(_HERE), "supabase", "migrations")
    if not os.path.isdir(dir_path):
        print(f"ERROR: migrations directory not found: {dir_path}", file=sys.stderr)
        return 2
    if not args.tree and not args.files and not args.invariant:
        ap.error("pass migration files, --invariant, or --tree")

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
        pending = index_added(dir_path) if args.index else None
        refusals = transaction_control_refusals(files, parsed)
        refusals += check_files(args.files, files, parsed, pending) if args.files else []
        if args.invariant:
            refusals += check_invariant(files, parsed)
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
    print(f"  ok: no grant-order contradiction in {len(args.files)} file(s)"
          + (f"; whole-tree invariant holds across {len(files)} migrations" if args.invariant else ""))
    return 0


if __name__ == "__main__":
    sys.exit(main())
