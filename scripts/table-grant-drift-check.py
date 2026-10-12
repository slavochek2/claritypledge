#!/usr/bin/env python3
"""
P1321 step 2 — table- and column-grant drift: live prod vs live test vs the migrations.

READ-ONLY. Every live read goes through scripts/supabase-readonly-sql.py (a Database:Read
token on the /database/query/read-only endpoint). This script issues no DDL and no DML.

Why this exists
---------------
The repo's two drift checks compare POLICIES (rls-drift-check.py) and function EXECUTE
grants (function-grant-drift-check.py). Neither reads table or column privileges, so a
recorded test/prod divergence on a column grant (P1207 "D-3": prod correct, test not)
went unnoticed by every standing check. A row policy says nothing about which COLUMNS a
role may read or write; `REVOKE SELECT ON t` plus `GRANT SELECT (a, b) ON t` is how this
schema hides a column, and if one half did not take effect the column is exposed.

What it compares
----------------
For roles anon and authenticated, privileges SELECT / INSERT / UPDATE / DELETE:

  - table level   has_table_privilege(role, table, priv)
  - column level  has_column_privilege(role, table, column, priv) where it is TRUE but the
                  table-level privilege is FALSE (i.e. a column-only grant). Every other
                  column is implied by the table-level answer, so this is complete.

These are EFFECTIVE privileges — they include PUBLIC grants, role membership and owner
defaults. Not information_schema (role-filtered: returns nothing to the read-only role —
decisions.md 2026-09-14 [technical], P1214) and not raw aclexplode() (misses a NULL ACL
and membership — see check-p1207-privilege-floor.py TRAP 2).

The MIGRATIONS leg replays every static GRANT/REVOKE on a table or view, in file order,
on top of Supabase's default privileges (20250101_initial_schema.sql: `grant all on
tables to ... anon, authenticated`). TRUNCATE/REFERENCES/TRIGGER/MAINTAIN are out of
scope here; check-p1207-privilege-floor.py owns that class.

Blindness guard
---------------
Before any comparison, each environment must answer three controls correctly or the run
exits 2: anon CAN select public.events (a published table), anon can NOT select
public.agent_accounts (revoked by migration), and the column query returns at least one
column-only grant (public.event_room_members carries several). A detector that went
blind would pass every comparison by returning nothing; the controls make it fail loud.

Exit codes
----------
  0  no drift in the compared legs
  1  drift (details on stdout)
  2  could not run (credentials, API error, a failed liveness control, a missing
     migrations dir, ANY uncaught exception in replay or the live read — never 1)

Gating beyond grant drift: a live table with NO CREATE in the replayed migrations
(unmodelled) on which anon or authenticated holds any SELECT/INSERT/UPDATE/DELETE
(table-level or column-only) exits 1 — its exposure is unexplained by the migrations. An
unmodelled table with no client privilege stays report-only. A GRANT/REVOKE on a
table that the replay could not parse also exits 1.

Usage
-----
  scripts/table-grant-drift-check.py                    # prod vs test vs migrations
  scripts/table-grant-drift-check.py --env test         # test vs migrations only
  scripts/table-grant-drift-check.py --env prod
  scripts/table-grant-drift-check.py --json
  scripts/table-grant-drift-check.py --summary          # one/two lines, for callers like /day
  scripts/table-grant-drift-check.py --migrations-dir DIR   # replay a different tree
  scripts/table-grant-drift-check.py --self-test        # offline: replay model only

What it does NOT cover: other schemas, sequences, functions (function-grant-drift-check
owns those), RLS policies (rls-drift-check owns those), grants issued from dynamic SQL
inside a DO block or function body (reported as unmodelled when a table's live state
cannot be explained), and the four privileges named above.
"""
import argparse
import importlib.util
import json
import os
import re
import subprocess
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
ROLES = ("anon", "authenticated")
PRIVS = ("SELECT", "INSERT", "UPDATE", "DELETE")
COLUMN_PRIVS = ("SELECT", "INSERT", "UPDATE")

_scope = None


def strip_noise(text):
    """One tokenizer for strings/comments/dollar bodies (check-rls-scope.py's). Loaded lazily so a
    broken import surfaces inside main's guard as exit 2, never as a bare traceback (exit 1)."""
    global _scope
    if _scope is None:
        spec = importlib.util.spec_from_file_location(
            "_rls_scope", os.path.join(HERE, "check-rls-scope.py"))
        mod = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(mod)
        _scope = mod
    return _scope._strip_noise(text)


# ---------------------------------------------------------------------------
# Migrations leg — replay GRANT/REVOKE on tables and views
# ---------------------------------------------------------------------------

def _ident(name):
    """`public."Foo"` / `public.foo` / `foo` -> `foo`; None for another schema."""
    name = name.strip().strip(";")
    parts = [p.strip().strip('"') for p in re.split(r"\.(?=(?:[^\"]*\"[^\"]*\")*[^\"]*$)", name)]
    if len(parts) == 2:
        if parts[0].lower() != "public":
            return None
        return parts[1].lower()
    return parts[0].lower()


def _split_top(text):
    """Split on commas outside parentheses."""
    out, depth, cur = [], 0, []
    for ch in text:
        if ch == "(":
            depth += 1
        elif ch == ")":
            depth -= 1
        if ch == "," and depth == 0:
            out.append("".join(cur))
            cur = []
        else:
            cur.append(ch)
    out.append("".join(cur))
    return [x.strip() for x in out if x.strip()]


class Model:
    """Expected privileges per table: table-level and column-only grants, per grantee.

    grantee is anon / authenticated / public (PUBLIC's grants are inherited by both roles).
    """

    def __init__(self):
        self.tables = {}  # name -> {"tbl": {grantee: set(priv)}, "col": {grantee: {priv: set(col)}}}
        self.unparsed = []  # (file, statement) for GRANT/REVOKE on tables we could not read
        self.unparsed_table = []  # subset that may touch a public table (gating)
        self.applied = 0  # GRANT/REVOKE statements replayed onto a modelled table

    def create(self, name, if_not_exists=False):
        if name in self.tables and if_not_exists:
            return
        self.tables[name] = {
            "tbl": {"anon": set(PRIVS), "authenticated": set(PRIVS), "public": set()},
            "col": {g: {p: set() for p in PRIVS} for g in ("anon", "authenticated", "public")},
        }

    def drop(self, name):
        self.tables.pop(name, None)

    def rename(self, old, new):
        if old in self.tables:
            self.tables[new] = self.tables.pop(old)

    def apply(self, verb, privs, tables, grantees):
        for t in tables:
            if t not in self.tables:
                continue  # granted on something not created by a migration we model
            self.applied += 1
            m = self.tables[t]
            for g in grantees:
                for priv, cols in privs:
                    if priv not in PRIVS:
                        continue
                    if cols is None:
                        if verb == "grant":
                            m["tbl"][g].add(priv)
                        else:
                            m["tbl"][g].discard(priv)
                            # Postgres: revoking a table privilege also revokes it on
                            # every column.
                            m["col"][g][priv].clear()
                    else:
                        if verb == "grant":
                            m["col"][g][priv].update(cols)
                        else:
                            m["col"][g][priv].difference_update(cols)

    def expected(self, table):
        """-> ({role: set(priv)} table-level, {role: {priv: set(col)}} column-only)."""
        m = self.tables[table]
        tbl, col = {}, {}
        for r in ROLES:
            tbl[r] = m["tbl"][r] | m["tbl"]["public"]
            col[r] = {}
            for p in COLUMN_PRIVS:
                if p in tbl[r]:
                    col[r][p] = set()  # implied by the table-level grant
                else:
                    col[r][p] = m["col"][r][p] | m["col"]["public"][p]
        return tbl, col


_CREATE_TABLE = re.compile(
    r"^create\s+(?:(?:global\s+|local\s+)?(?:temporary|temp)\s+|unlogged\s+)?table\s+"
    r"(if\s+not\s+exists\s+)?([\w.\"]+)", re.I)
_CREATE_VIEW = re.compile(
    r"^create\s+(or\s+replace\s+)?(?:(?:temporary|temp)\s+)?(?:recursive\s+)?(materialized\s+)?view\s+"
    r"(if\s+not\s+exists\s+)?([\w.\"]+)", re.I)
_DROP = re.compile(r"^drop\s+(?:table|view|materialized\s+view)\s+(?:if\s+exists\s+)?(.+?)(?:\s+(?:cascade|restrict))?$", re.I)
_RENAME = re.compile(r"^alter\s+(?:table|view|materialized\s+view)\s+(?:if\s+exists\s+)?(?:only\s+)?([\w.\"]+)\s+rename\s+to\s+([\w\"]+)$", re.I)
_GRANT = re.compile(
    r"^(grant|revoke)\s+(?:grant\s+option\s+for\s+)?(.+?)\s+on\s+(.+?)\s+(?:to|from)\s+(.+?)"
    r"(?:\s+with\s+grant\s+option|\s+granted\s+by\s+\S+|\s+cascade|\s+restrict)*$", re.I | re.S)
_NOT_A_TABLE = re.compile(
    r"^(function|functions|procedure|procedures|routine|routines|schema|sequence|sequences|"
    r"type|domain|database|language|large\s+object|tablespace|foreign\s+)", re.I)


def _col_ident(text):
    """A quoted column keeps its case (`"Name"`), an unquoted one folds to lower."""
    text = text.strip()
    if text.startswith('"') and text.endswith('"'):
        return text[1:-1]
    return text.lower()


def _parse_privs(text):
    out = []
    for item in _split_top(text):
        m = re.match(r"^(\w+(?:\s+privileges)?)\s*(?:\((.*)\))?$", item.strip(), re.S)
        if not m:
            return None
        word = m.group(1).lower().split()[0]
        cols = None
        if m.group(2) is not None:
            cols = {_col_ident(c) for c in m.group(2).split(",") if c.strip()}
        if word == "all":
            out.extend((p, cols) for p in PRIVS)
        else:
            out.append((word.upper(), cols))
    return out


def replay(migrations_dir):
    model = Model()
    files = sorted(f for f in os.listdir(migrations_dir) if f.endswith(".sql"))
    for fname in files:
        with open(os.path.join(migrations_dir, fname)) as fh:
            raw = fh.read()
        cleaned = strip_noise(raw)
        # Statement text must keep quoted identifiers ("Foo"), which strip_noise blanks,
        # so split on the cleaned copy's semicolons and read the raw slice.
        start = 0
        for i, ch in enumerate(cleaned):
            if ch != ";":
                continue
            stmt_raw = raw[start:i]
            stmt_clean = cleaned[start:i]
            start = i + 1
            norm = " ".join(stmt_clean.split())
            if not norm:
                continue
            # Re-insert quoted identifiers from the raw slice where the cleaned copy blanked
            # them: use the raw text whitespace-normalised, minus comments.
            body = " ".join(_strip_comments_only(stmt_raw).split())
            low = norm.lower()
            if low.startswith("create") and " table " in f" {low} ":
                m = _CREATE_TABLE.match(body)
                if m:
                    name = _ident(m.group(2))
                    if name:
                        model.create(name, if_not_exists=bool(m.group(1)))
                continue
            if low.startswith("create") and " view " in f" {low} ":
                m = _CREATE_VIEW.match(body)
                if m:
                    name = _ident(m.group(4))
                    if name and not (m.group(1) and name in model.tables):
                        model.create(name, if_not_exists=bool(m.group(3)))
                continue
            if low.startswith("drop "):
                m = _DROP.match(body)
                if m:
                    for n in _split_top(m.group(1)):
                        name = _ident(n)
                        if name:
                            model.drop(name)
                continue
            if low.startswith("alter ") and " rename to " in low:
                m = _RENAME.match(body)
                if m:
                    old, new = _ident(m.group(1)), m.group(2).strip('"').lower()
                    if old:
                        model.rename(old, new)
                continue
            if low.startswith(("grant ", "revoke ")):
                m = _GRANT.match(body)
                if not m:
                    model.unparsed.append((fname, body[:160]))
                    # No ON ... TO shape at all: `GRANT role TO role` membership is not a
                    # table grant; anything mentioning ON might be one — gate on it.
                    if re.search(r"\son\s", " " + body + " ", re.I) and not _NOT_A_TABLE.match(
                            re.sub(r"^.*?\son\s+", "", body, count=1, flags=re.I | re.S)):
                        model.unparsed_table.append((fname, body[:160]))
                    continue
                verb, privs_txt, on_txt, roles_txt = m.groups()
                on_txt = on_txt.strip()
                if _NOT_A_TABLE.match(on_txt):
                    continue
                privs = _parse_privs(privs_txt)
                if privs is None:
                    # `GRANT role TO role` (membership) has no ON; a parse failure here is
                    # a table grant we could not read — surface it, never drop it silently.
                    model.unparsed.append((fname, body[:160]))
                    model.unparsed_table.append((fname, body[:160]))
                    continue
                if re.match(r"^all\s+tables\s+in\s+schema\s+public$", on_txt, re.I):
                    tables = list(model.tables)
                elif re.match(r"^all\s+tables\s+in\s+schema\s+", on_txt, re.I):
                    continue
                else:
                    on_txt = re.sub(r"^table\s+", "", on_txt, flags=re.I)
                    tables = [t for t in (_ident(x) for x in _split_top(on_txt)) if t]
                grantees = []
                for r in _split_top(roles_txt):
                    r = r.strip().strip('"').lower()
                    if r in ("anon", "authenticated", "public"):
                        grantees.append(r)
                model.apply(verb.lower(), privs, tables, grantees)
    return model


def _strip_comments_only(text):
    """Remove -- and /* */ comments, keep strings and quoted identifiers."""
    text = re.sub(r"/\*.*?\*/", " ", text, flags=re.S)
    return re.sub(r"--[^\n]*", " ", text)


# ---------------------------------------------------------------------------
# Live leg
# ---------------------------------------------------------------------------

class CouldNotRun(Exception):
    pass


def run_sql(env, sql):
    proc = subprocess.run(
        [sys.executable, os.path.join(HERE, "supabase-readonly-sql.py"), "--env", env],
        input=sql, capture_output=True, text=True, timeout=180)
    if proc.returncode != 0:
        raise CouldNotRun(f"{env}: supabase-readonly-sql.py exit {proc.returncode}: "
                          f"{(proc.stdout or proc.stderr).strip()[:300]}")
    try:
        rows = json.loads(proc.stdout)
    except ValueError as exc:
        raise CouldNotRun(f"{env}: non-JSON output: {exc}")
    if not isinstance(rows, list):
        raise CouldNotRun(f"{env}: expected a JSON array, got {type(rows).__name__}")
    return rows


TABLE_SQL = """
SELECT c.relname AS t, r.role, p.priv,
       has_table_privilege(r.role, c.oid, p.priv) AS ok
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
CROSS JOIN (VALUES ('anon'), ('authenticated')) r(role)
CROSS JOIN (VALUES ('SELECT'), ('INSERT'), ('UPDATE'), ('DELETE')) p(priv)
WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p', 'v', 'm')
"""

COLUMN_SQL = """
SELECT c.relname AS t, a.attname AS col, r.role, p.priv
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
JOIN pg_attribute a ON a.attrelid = c.oid AND a.attnum > 0 AND NOT a.attisdropped
CROSS JOIN (VALUES ('anon'), ('authenticated')) r(role)
CROSS JOIN (VALUES ('SELECT'), ('INSERT'), ('UPDATE')) p(priv)
WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p', 'v', 'm')
  AND has_column_privilege(r.role, c.oid, a.attnum, p.priv)
  AND NOT has_table_privilege(r.role, c.oid, p.priv)
"""

COLUMNS_ALL_SQL = """
SELECT c.relname AS t, a.attname AS col
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
JOIN pg_attribute a ON a.attrelid = c.oid AND a.attnum > 0 AND NOT a.attisdropped
WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p', 'v', 'm')
"""

CONTROL_SQL = """
SELECT has_table_privilege('anon', 'public.events', 'SELECT') AS anon_reads_events,
       has_table_privilege('anon', 'public.agent_accounts', 'SELECT') AS anon_reads_agent_accounts
"""


def fetch_live(env):
    ctl = run_sql(env, CONTROL_SQL)
    if not ctl or ctl[0].get("anon_reads_events") is not True:
        raise CouldNotRun(f"{env}: liveness control failed — anon should read public.events "
                          f"(got {ctl!r}); the privilege read is blind or the schema moved")
    if ctl[0].get("anon_reads_agent_accounts") is not False:
        raise CouldNotRun(f"{env}: liveness control failed — anon should NOT read "
                          f"public.agent_accounts (got {ctl!r}); the check cannot discriminate")
    tbl_rows = run_sql(env, TABLE_SQL)
    col_rows = run_sql(env, COLUMN_SQL)
    all_cols = run_sql(env, COLUMNS_ALL_SQL)
    if not tbl_rows:
        raise CouldNotRun(f"{env}: table-privilege query returned no rows")
    if not any(r["t"] == "event_room_members" for r in col_rows):
        raise CouldNotRun(f"{env}: column-privilege control failed — no column-only grant "
                          f"seen on public.event_room_members; the column read is blind")
    live = {}
    for r in tbl_rows:
        t = live.setdefault(r["t"], {"tbl": {x: set() for x in ROLES},
                                     "col": {x: {p: set() for p in COLUMN_PRIVS} for x in ROLES},
                                     "cols": set()})
        if r["ok"]:
            t["tbl"][r["role"]].add(r["priv"])
    for r in col_rows:
        live[r["t"]]["col"][r["role"]][r["priv"]].add(r["col"])
    for r in all_cols:
        if r["t"] in live:
            live[r["t"]]["cols"].add(r["col"])
    return live


# ---------------------------------------------------------------------------
# Comparison
# ---------------------------------------------------------------------------

def _diff_one(table, a_name, a, b_name, b, columns):
    """a, b: (tbl {role: set}, col {role: {priv: set}}). -> list of finding dicts."""
    out = []
    for role in ROLES:
        for priv in PRIVS:
            ia, ib = priv in a[0][role], priv in b[0][role]
            if ia != ib:
                out.append({"table": table, "role": role, "priv": priv, "column": None,
                            a_name: ia, b_name: ib})
        for priv in COLUMN_PRIVS:
            if priv in a[0][role] or priv in b[0][role]:
                continue  # table-level difference already reported, or both implied
            ca = a[1][role][priv] & columns
            cb = b[1][role][priv] & columns
            for col in sorted(ca ^ cb):
                out.append({"table": table, "role": role, "priv": priv, "column": col,
                            a_name: col in ca, b_name: col in cb})
    return out


def object_drift(live):
    """Tables/columns present in one environment only — schema drift, not grant drift."""
    p, t = live["prod"], live["test"]
    out = [(f"table {x}", "prod only") for x in sorted(set(p) - set(t))]
    out += [(f"table {x}", "test only") for x in sorted(set(t) - set(p))]
    for table in sorted(set(p) & set(t)):
        out += [(f"column {table}.{c}", "prod only") for c in sorted(p[table]["cols"] - t[table]["cols"])]
        out += [(f"column {table}.{c}", "test only") for c in sorted(t[table]["cols"] - p[table]["cols"])]
    return out


def exposed_unmodelled(live_env, table):
    """Client privileges (table-level or column-only) anon/authenticated hold on a live table."""
    t = live_env[table]
    out = []
    for role in ROLES:
        for priv in sorted(t["tbl"][role]):
            out.append(f"{role} {priv}")
        for priv in COLUMN_PRIVS:
            if priv not in t["tbl"][role] and t["col"][role][priv]:
                out.append(f"{role} {priv}({len(t['col'][role][priv])} col)")
    return out


def gating_unmodelled(envs, live, unmodelled):
    """[(env, table, [privs])] for unmodelled tables a client role can touch."""
    out = []
    for env, table in unmodelled:
        privs = exposed_unmodelled(live[env], table)
        if privs:
            out.append((env, table, privs))
    return out


def compare(envs, live, model):
    findings, unmodelled = [], []
    if len(envs) == 2:
        p, t = live["prod"], live["test"]
        for table in sorted(set(p) & set(t)):
            cols = p[table]["cols"] & t[table]["cols"]
            for f in _diff_one(table, "prod", (p[table]["tbl"], p[table]["col"]),
                               "test", (t[table]["tbl"], t[table]["col"]), cols):
                f["leg"] = "prod-vs-test"
                findings.append(f)
    for env in envs:
        for table in sorted(live[env]):
            if table not in model.tables:
                unmodelled.append((env, table))
                continue
            exp = model.expected(table)
            got = (live[env][table]["tbl"], live[env][table]["col"])
            for f in _diff_one(table, "migrations", exp, env, got, live[env][table]["cols"]):
                f["leg"] = f"{env}-vs-migrations"
                findings.append(f)
    return findings, unmodelled


def render(envs, findings, unmodelled, model, live):
    gated = gating_unmodelled(envs, live, unmodelled)
    gated_keys = {(e, t) for e, t, _ in gated}
    print("=" * 78)
    print("TABLE/COLUMN GRANT DRIFT CHECK (P1321) — " + " vs ".join(envs + ["migrations"]))
    print("=" * 78)
    for env in envs:
        print(f"{env}: {len(live[env])} tables/views in public; liveness controls passed")
    print(f"migrations: {len(model.tables)} tables/views modelled, "
          f"{model.applied} GRANT/REVOKE applications replayed")
    if not findings and not gated and not model.unparsed_table:
        print("\nRESULT: no drift — every compared privilege agrees.")
    elif not findings:
        print("\nRESULT: GATING — no grant drift on modelled tables, but see below.")
    else:
        print(f"\nRESULT: DRIFT — {len(findings)} finding(s). A True/False pair is the effective")
        print("privilege on each side. Converge the live side to the migrations with a migration,")
        print("or, if the migrations are wrong, fix them — never edit a live grant by hand.\n")
        for leg in sorted({f["leg"] for f in findings}):
            print(f"  [{leg}]")
            for f in [x for x in findings if x["leg"] == leg]:
                where = f"{f['table']}.{f['column']}" if f["column"] else f["table"]
                sides = ", ".join(f"{k}={v}" for k, v in f.items()
                                  if k not in ("table", "role", "priv", "column", "leg"))
                print(f"    {f['role']:13s} {f['priv']:6s} {where}   {sides}")
    if len(envs) == 2:
        drift = object_drift(live)
        if drift:
            print(f"\nIN ONE ENVIRONMENT ONLY (report-only schema drift, {len(drift)}):")
            for what, where in drift:
                print(f"    {what}: {where}")
    if gated:
        print(f"\nUNMODELLED AND CLIENT-REACHABLE (GATING, {len(gated)}) — live, no CREATE in the")
        print("migrations replayed, and anon/authenticated hold privileges no migration explains:")
        for env, t, privs in gated:
            print(f"    {env}: {t}: {', '.join(privs)}")
    quiet = [(e, t) for e, t in unmodelled if (e, t) not in gated_keys]
    if quiet:
        print(f"\nUNMODELLED (report-only, no client privilege) — live, but no CREATE replayed:")
        for env, t in quiet:
            print(f"    {env}: {t}")
    if model.unparsed_table:
        print(f"\nUNPARSED GRANT/REVOKE touching a table (GATING, {len(model.unparsed_table)}):")
        for fname, stmt in model.unparsed_table[:20]:
            print(f"    {fname}: {stmt}")
    other = [u for u in model.unparsed if u not in model.unparsed_table]
    if other:
        print(f"\nUNPARSED GRANT/REVOKE, not table-shaped (report-only, {len(other)}):")
        for fname, stmt in other[:20]:
            print(f"    {fname}: {stmt}")
    print("\nWHAT THIS CHECK DOES NOT COVER: other schemas, sequences, functions, RLS policies,")
    print("TRUNCATE/REFERENCES/TRIGGER/MAINTAIN, and grants issued by dynamic SQL.")


# ---------------------------------------------------------------------------
# Self-test — the replay model must score known shapes correctly, offline
# ---------------------------------------------------------------------------

def self_test():
    import tempfile
    cases = [
        ("default grants", "create table public.a (id int);", "a",
         {"anon": set(PRIVS), "authenticated": set(PRIVS)}, {}),
        ("table revoke, column re-grant (the event_room_members shape)",
         "create table public.b (id int, secret text, open text);\n"
         "revoke select on public.b from anon, authenticated;\n"
         "grant select (id, open) on public.b to anon;",
         "b", {"anon": {"INSERT", "UPDATE", "DELETE"}, "authenticated": {"INSERT", "UPDATE", "DELETE"}},
         {("anon", "SELECT"): {"id", "open"}}),
        ("PUBLIC grant is inherited",
         "create table c (id int);\nrevoke all on table c from anon, authenticated;\n"
         "grant select on c to public;", "c",
         {"anon": {"SELECT"}, "authenticated": {"SELECT"}}, {}),
        ("table revoke clears column grants",
         "create table d (id int);\nrevoke update on d from anon;\ngrant update (id) on d to anon;\n"
         "revoke update on d from anon;", "d",
         {"anon": {"SELECT", "INSERT", "DELETE"}, "authenticated": set(PRIVS)},
         {("anon", "UPDATE"): set()}),
        ("grant inside a function body is not a grant",
         "create table e (id int);\nrevoke all on e from anon;\n"
         "create function f() returns void language sql as $$ grant select on e to anon $$;", "e",
         {"anon": set(), "authenticated": set(PRIVS)}, {}),
        ("quoted multi-line column list",
         'create table "g" (id int, "Name" text);\nrevoke select on public."g" from anon;\n'
         'grant select (\n  id,\n  "Name"\n) on public."g" to anon;', "g",
         {"anon": {"INSERT", "UPDATE", "DELETE"}, "authenticated": set(PRIVS)},
         {("anon", "SELECT"): {"id", "Name"}}),
    ]
    failures = 0
    for label, sql, table, want_tbl, want_cols in cases:
        with tempfile.TemporaryDirectory() as d:
            with open(os.path.join(d, "20990101000000_x.sql"), "w") as fh:
                fh.write(sql)
            model = replay(d)
        if table not in model.tables:
            print(f"  FAIL {label}: table {table} not modelled")
            failures += 1
            continue
        tbl, col = model.expected(table)
        ok = all(tbl[r] == want_tbl[r] for r in ROLES)
        for (r, p), cols in want_cols.items():
            ok = ok and col[r][p] == cols
        print(f"  {'PASS' if ok else 'FAIL'} {label}" + ("" if ok else f": tbl={tbl} col={col}"))
        failures += 0 if ok else 1
    # Discrimination control: the real tree must model event_room_members as column-scoped.
    real = replay(os.path.join(os.path.dirname(HERE), "supabase", "migrations"))
    if "event_room_members" in real.tables:
        tbl, col = real.expected("event_room_members")
        scoped = "SELECT" not in tbl["anon"] and col["anon"]["SELECT"]
        print(f"  {'PASS' if scoped else 'FAIL'} real tree: event_room_members anon SELECT is column-scoped")
        failures += 0 if scoped else 1
    else:
        print("  FAIL real tree: event_room_members not modelled")
        failures += 1
    failures += _self_test_gating()
    print(f"\nself-test: {'ok' if not failures else f'{failures} FAILED'}")
    return 1 if failures else 0


def _live_table(tbl=(), col=None):
    """A synthetic live entry: tbl = privileges both roles hold; col = {priv: cols} for anon."""
    t = {"tbl": {r: set(tbl) for r in ROLES},
         "col": {r: {p: set() for p in COLUMN_PRIVS} for r in ROLES}, "cols": {"id"}}
    for p, cols in (col or {}).items():
        t["col"]["anon"][p] = set(cols)
    return t


def _self_test_gating():
    """Fixtures for the unmodelled-table gate and the exit-2 contract."""
    import contextlib
    import io
    import tempfile
    failures = 0

    def check(label, ok, detail=""):
        nonlocal failures
        print(f"  {'PASS' if ok else 'FAIL'} {label}" + ("" if ok else f": {detail}"))
        failures += 0 if ok else 1

    def run(argv, live=None, boom=None):
        """Run main() with fetch_live stubbed; -> (rc, stdout)."""
        global fetch_live
        real = fetch_live

        def fake(env):
            if boom:
                raise boom
            return live
        fetch_live = fake
        buf = io.StringIO()
        try:
            with contextlib.redirect_stdout(buf):
                rc = main(argv)
        finally:
            fetch_live = real
        return rc, buf.getvalue()

    with tempfile.TemporaryDirectory() as d:
        with open(os.path.join(d, "20990101000000_x.sql"), "w") as fh:
            fh.write("create table public.known (id int);")
        base = ["--env", "test", "--migrations-dir", d]
        known = _live_table(PRIVS)
        rc, out = run(base, {"known": known, "ghost": _live_table(("SELECT",))})
        check("unmodelled table with anon/authenticated SELECT exits 1", rc == 1 and "ghost" in out, (rc, out[-200:]))
        rc, out = run(base, {"known": known, "ghost": _live_table((), {"SELECT": ["id"]})})
        check("unmodelled table with a column-only grant exits 1", rc == 1, (rc, out[-200:]))
        rc, out = run(base, {"known": known, "ghost": _live_table(())})
        check("unmodelled table with NO client privilege stays report-only (exit 0)", rc == 0 and "ghost" in out, (rc, out[-200:]))
        rc, out = run(base, {"known": known})
        check("everything modelled and agreeing exits 0", rc == 0, (rc, out[-200:]))
        with open(os.path.join(d, "20990102000000_y.sql"), "w") as fh:
            fh.write("grant select! on public.known to anon;")
        rc, out = run(base, {"known": known})
        check("an unparsed table GRANT exits 1", rc == 1 and "UNPARSED" in out, (rc, out[-200:]))
        os.remove(os.path.join(d, "20990102000000_y.sql"))
        rc, out = run(["--env", "test", "--migrations-dir", os.path.join(d, "nope")], {"known": known})
        check("missing --migrations-dir exits 2", rc == 2, (rc, out[-200:]))
        rc, out = run(base, boom=KeyError("t"))
        check("KeyError in the live read exits 2", rc == 2 and "COULD NOT RUN" in out, (rc, out[-200:]))
        rc, out = run(base, {"known": {"tbl": {}}})
        check("malformed live shape (KeyError downstream) exits 2", rc == 2, (rc, out[-200:]))
    # Broken check-rls-scope.py next to a copy of this checker -> exit 2, not a traceback (1).
    with tempfile.TemporaryDirectory() as d:
        import shutil
        shutil.copy(os.path.abspath(__file__), os.path.join(d, "table-grant-drift-check.py"))
        with open(os.path.join(d, "check-rls-scope.py"), "w") as fh:
            fh.write("raise RuntimeError('broken import')\n")
        mig = os.path.join(d, "m")
        os.mkdir(mig)
        with open(os.path.join(mig, "20990101000000_x.sql"), "w") as fh:
            fh.write("create table public.t (id int);")
        proc = subprocess.run([sys.executable, os.path.join(d, "table-grant-drift-check.py"),
                               "--env", "test", "--migrations-dir", mig],
                              capture_output=True, text=True, timeout=60)
        check("broken check-rls-scope.py import exits 2", proc.returncode == 2
              and "COULD NOT RUN" in proc.stdout, (proc.returncode, proc.stdout[-200:], proc.stderr[-200:]))
    return failures


def _run(args):
    envs = [args.env] if args.env else ["prod", "test"]
    if not os.path.isdir(args.migrations_dir):
        raise CouldNotRun(f"migrations dir not found: {args.migrations_dir}")
    model = replay(args.migrations_dir)
    live = {env: fetch_live(env) for env in envs}
    findings, unmodelled = compare(envs, live, model)
    gated = gating_unmodelled(envs, live, unmodelled)
    gating = bool(findings or gated or model.unparsed_table)
    if args.json:
        print(json.dumps({"findings": findings, "unmodelled": unmodelled,
                          "unmodelled_gating": gated, "unparsed": model.unparsed,
                          "unparsed_table": model.unparsed_table}, indent=1, default=sorted))
    elif args.summary:
        bits = []
        if findings:
            bits.append(f"{len(findings)} grant drift finding(s)")
        if gated:
            bits.append(f"{len(gated)} unmodelled table(s) reachable by anon/authenticated: "
                        + ", ".join(f"{e}:{t}" for e, t, _ in gated[:8]))
        if model.unparsed_table:
            bits.append(f"{len(model.unparsed_table)} unparsed table GRANT/REVOKE")
        if bits:
            print("TABLE GRANT DRIFT: " + "; ".join(bits) + ".")
        else:
            quiet = len([1 for e, t in unmodelled if (e, t) not in {(a, b) for a, b, _ in gated}])
            quiet += len([u for u in model.unparsed if u not in model.unparsed_table])
            extra = f" (+{quiet} report-only)" if quiet else ""
            print(f"Table grants: clean ({' vs '.join(envs + ['migrations'])}; "
                  f"{sum(len(v) for v in live.values())} live tables compared){extra}.")
    else:
        render(envs, findings, unmodelled, model, live)
    return 1 if gating else 0


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[1])
    ap.add_argument("--env", choices=("prod", "test"))
    ap.add_argument("--json", action="store_true")
    ap.add_argument("--summary", action="store_true",
                    help="one line of output, for callers like /day")
    ap.add_argument("--migrations-dir",
                    default=os.path.join(os.path.dirname(HERE), "supabase", "migrations"))
    ap.add_argument("--self-test", action="store_true")
    args = ap.parse_args(argv)
    # Exit 1 means "drift found". Anything that stops the check reaching a verdict --
    # a missing dir, an unexpected row shape, a crash in the replay -- is exit 2, never 1.
    try:
        if args.self_test:
            return self_test()
        return _run(args)
    except (CouldNotRun, subprocess.TimeoutExpired) as exc:
        print(f"COULD NOT RUN: {exc}")
        return 2
    except Exception as exc:  # noqa: BLE001 -- deliberate catch-all, see above
        print(f"COULD NOT RUN: unexpected {type(exc).__name__}: {exc}")
        return 2


if __name__ == "__main__":
    sys.exit(main())
