#!/usr/bin/env bash
# dep-audit.sh — audit every dependency manifest/lock under a scan root (P1563 item 10).
#
# Usage:  scripts/dep-audit.sh [--root DIR] [--exceptions FILE]
#   --root DIR         scan root (default: repository root)
#   --exceptions FILE  exceptions file (default: scripts/dep-audit-exceptions.txt)
# Environment:
#   DEP_AUDIT_OSV_URL  OSV batch endpoint (default https://api.osv.dev/v1/querybatch); used by the
#                      tests to simulate a lookup failure
#   DEP_AUDIT_SELFTEST_CRASH  test-only: any non-empty value raises inside the script to prove the
#                      top-level guard turns an unexpected crash into INCOMPLETE (exit 2)
#
# EXIT CODES (three distinct outcomes; INCOMPLETE is never reported or exited as clean)
#   0  CLEAN       every discovered manifest was fully checked: no malicious (MAL-) advisory, and no
#                  critical npm-audit finding outside the exceptions file
#   1  FINDING     any MAL- advisory hit on an exact locked version, OR any `critical` severity in a
#                  full-tree `npm audit` that is not listed in the exceptions file. Wins over 2, but
#                  the incomplete parts are still listed.
#   2  INCOMPLETE  something could not be checked: OSV lookup error/timeout/non-200, npm audit
#                  failure, unparseable or unsupported manifest, package.json with no lock, a
#                  requirements file with non-exact pins, a dependency source OSV has no ecosystem
#                  for (jsr:, deno.land, ...), no manifests found at all, a bad exceptions file.
#
# WHAT IT CHECKS
#   Discovery is at run time (os.walk) with an explicit, printed exclusion list:
#     node_modules, .git          any depth (installed code / VCS internals)
#     .claude                     relative to the scan root: skill templates under .claude/commands
#                                 are not installed or deployed (.claude/worktrees is listed too:
#                                 other checkouts of this repo, not part of this tree)
#     scripts/fixtures/p1563-dep-audit   this script's own test fixtures (they hold known-bad versions
#                                 on purpose; also stored under non-manifest names, see the test)
#   Formats and surfaces:
#     package-lock.json (lockfileVersion 1/2/3)  -> npm audit (full tree, env-independent) + OSV
#                                                   (npm). INCOMPLETE if an entry is not from
#                                                   https://registry.npmjs.org or lacks integrity,
#                                                   or if there is no sibling package.json.
#     deno.lock (versions 1/2/3/4/5)             -> npm entries + exact esm.sh/unpkg/jsdelivr npm
#                                                   URLs -> OSV (npm); jsr:/deno.land/other hosts
#                                                   have no OSV ecosystem -> INCOMPLETE unless
#                                                   accepted with an `unchecked` exception line
#     deno.json, deno.jsonc, import_map.json     -> covered by a deno.lock in the same or an
#                                                   ancestor directory, else INCOMPLETE
#     requirements*.txt / *requirements*.txt / requirements/*.txt / requirements*.lock
#                                                -> exact `==` pins -> OSV (PyPI). CLEAN only when
#                                                   EVERY line carries --hash= (pip then refuses
#                                                   anything unlisted) or the file sets --no-deps with
#                                                   every line exact; exact pins alone are INCOMPLETE
#                                                   (transitive dependencies not pinned). Any
#                                                   include/constraint/editable/find-links directive,
#                                                   or an index other than pypi.org, is INCOMPLETE.
#     pyproject.toml, Pipfile, setup.py, *.in, constraints*.txt
#                                                -> never parsed; INCOMPLETE unless a fully
#                                                   hash-locked requirements file sits in the same
#                                                   directory. A ranged requirements file is covered
#                                                   the same way.
#     package.json                               -> needs a sibling lock (or a workspace-root lock
#                                                   that lists it); otherwise INCOMPLETE
#     other lock formats (yarn.lock, pnpm-lock.yaml, poetry.lock, ...) -> unsupported -> INCOMPLETE
#     symlinked or unreadable directories met during discovery        -> listed, INCOMPLETE
#   An npm-audit advisory titled "Malware in ..." is treated like MAL-: FINDING, never excepted.
#   Dockerfile `pip install` lines are NOT parsed (documented limit).
#   Malicious advisory = OSV id starting `MAL-`. Source: the OSV schema's database-prefix table maps
#   MAL to the OpenSSF "Malicious Packages Repository" (https://ossf.github.io/osv-schema/), and the
#   live lookup in test-p1563-dep-audit.sh confirms keyv@6.0.0 returns MAL-2026-11524.
#
# EXCEPTIONS FILE  one entry per line:  <manifest-relative-path> <package> <advisory-id> # reason
#   A reason after `#` is mandatory. Applies to npm-audit criticals (package + GHSA id or numeric
#   advisory source) and to `unchecked` entries (advisory-id literally `unchecked`). Never to MAL-.
#
# An unexpected crash (uncaught exception) is INCOMPLETE too: it prints `INCOMPLETE: internal error`
# and exits 2, never 1.
# Only package names and versions are sent to OSV. No credentials are read or sent.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
export DEP_AUDIT_REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
export DEP_AUDIT_DEFAULT_EXCEPTIONS="$SCRIPT_DIR/dep-audit-exceptions.txt"

command -v python3 >/dev/null || { echo "dep-audit: python3 not found" >&2; exit 2; }
command -v npm >/dev/null || { echo "dep-audit: npm not found (cannot run npm audit)" >&2; exit 2; }

PY=$(cat <<'PYEOF'
import http.client, json, os, re, subprocess, sys, urllib.parse, urllib.request, urllib.error

EXCLUDE_NAMES = ["node_modules", ".git"]                      # any depth
EXCLUDE_RELPATHS = [".claude", ".claude/worktrees", "scripts/fixtures/p1563-dep-audit"]  # relative to root
OSV_URL = os.environ.get("DEP_AUDIT_OSV_URL", "https://api.osv.dev/v1/querybatch")
OSV_CHUNK = 1000
OSV_TIMEOUT = 60
OSV_MAX_PAGES = 20
NPM_AUDIT_TIMEOUT = 240
UNSUPPORTED_LOCKS = {"yarn.lock", "pnpm-lock.yaml", "poetry.lock", "Pipfile.lock", "uv.lock",
                     "Cargo.lock", "go.sum", "bun.lock", "bun.lockb", "npm-shrinkwrap.json",
                     "Gemfile.lock", "composer.lock", "pdm.lock"}
EXACT_SEMVER = r"\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?"


# shell-safety (rules/shell-safety.md): no output line may carry redirect tokens, even when a
# library error text includes them (urllib prints "<urlopen error ...>").
_print = print
def print(*a, **k):
    _print(*[re.sub(r"[<>|]", lambda m_: {"<": "(", ">": ")", "|": "/"}[m_.group(0)], str(x)) for x in a], **k)


def _internal_error(etype, value, tb):
    # Top-level guard: an uncaught exception must never exit 1 (= FINDING) or print a traceback and
    # leave a caller thinking the audit ran. It is INCOMPLETE, always.
    try:
        print("INCOMPLETE: internal error: %s" % etype.__name__)
        print("RESULT: INCOMPLETE (exit 2) - not verified clean")
        sys.stdout.flush()
    finally:
        os._exit(2)


sys.excepthook = _internal_error


def die(msg):
    print("dep-audit: " + msg, file=sys.stderr)
    sys.exit(2)


# ---------- args ----------
root = os.environ["DEP_AUDIT_REPO_ROOT"]; root_label = "."
exc_path = os.environ["DEP_AUDIT_DEFAULT_EXCEPTIONS"]
args = sys.argv[1:]
i = 0
while i < len(args):
    if args[i] == "--root" and i + 1 < len(args):
        root = args[i + 1]; root_label = args[i + 1]; i += 2
    elif args[i] == "--exceptions" and i + 1 < len(args):
        exc_path = args[i + 1]; i += 2
    else:
        die("usage: dep-audit.sh [--root DIR] [--exceptions FILE]")
if not os.path.isdir(root):
    die("scan root is not a directory: " + root_label)
root = os.path.abspath(root)
if os.environ.get("DEP_AUDIT_SELFTEST_CRASH"):   # test-only: proves the top-level guard exits 2
    raise RuntimeError("selftest crash")


class Manifest:
    def __init__(self, rel, fmt):
        self.rel = rel; self.fmt = fmt
        self.checked = 0
        self.findings = []     # strings
        self.incomplete = []   # strings
        self.notes = []
        self.audit_counts = None
        self.pkgs = set()      # (ecosystem, name, version)
        self.unchecked = []    # (label, why)
        self.criticals = []    # (package, [ids], title)
        self.locked = False    # python: fully hash-locked (or --no-deps with exact pins)


manifests = []

# ---------- exceptions ----------
exceptions = {}   # (rel, package, advisory) -> reason
exc_problems = []
exc_state = "absent"
if os.path.isfile(exc_path):
    exc_state = "present"
    try:
        with open(exc_path, encoding="utf-8") as fh:
            for n, line in enumerate(fh, 1):
                s = line.strip()
                if not s or s.startswith("#"):
                    continue
                left, _, reason = s.partition("#")
                parts = left.split()
                if len(parts) != 3 or not reason.strip():
                    exc_problems.append("line %d: expected '<path> <package> <advisory-id> # reason'" % n)
                    continue
                if parts[1] in ("?", "*") or parts[2] in ("?", "*", "unattributed"):
                    exc_problems.append("line %d: wildcard or unattributed entries are not allowed; name the exact package and advisory id" % n)
                    continue
                exceptions[tuple(parts)] = reason.strip()
    except (OSError, ValueError) as e:
        exc_problems.append("unreadable: %s" % type(e).__name__)
used_exceptions = set()


def excepted(rel, pkg, ids):
    for a in ids:
        k = (rel, pkg, a)
        if k in exceptions:
            used_exceptions.add(k)
            return True
    return False


# ---------- discovery ----------
discovery_problems = []


def kind_of(rel):
    base = os.path.basename(rel); parent = os.path.basename(os.path.dirname(rel))
    if base == "package-lock.json": return "npmlock"
    if base == "package.json": return "pkgjson"
    if base == "deno.lock": return "denolock"
    if base in ("deno.json", "deno.jsonc", "import_map.json"): return "denocfg"
    if base in UNSUPPORTED_LOCKS: return "unsupported"
    if re.fullmatch(r".*requirements.*\.(txt|lock)", base, re.I) or (parent == "requirements" and base.endswith(".txt")):
        return "pyreq"
    if base in ("pyproject.toml", "Pipfile", "setup.py") or base.endswith(".in") or re.fullmatch(r"constraints.*\.txt", base, re.I):
        return "pysrc"
    return None


def discover():
    found = []

    def onerr(e):
        discovery_problems.append("unreadable directory: %s (%s)" % (os.path.relpath(str(e.filename), root), type(e).__name__))

    for dirpath, dirnames, filenames in os.walk(root, onerror=onerr):
        rel_dir = os.path.relpath(dirpath, root)
        rel_dir = "" if rel_dir == "." else rel_dir
        keep = []
        for d in sorted(dirnames):
            rd = (rel_dir + "/" + d) if rel_dir else d
            if d in EXCLUDE_NAMES or rd in EXCLUDE_RELPATHS:
                continue
            if os.path.islink(os.path.join(dirpath, d)):
                discovery_problems.append("symlinked directory not followed: %s" % rd)
                continue
            keep.append(d)
        dirnames[:] = keep
        for f in sorted(filenames):
            rel = (rel_dir + "/" + f) if rel_dir else f
            if kind_of(rel):
                found.append(rel)
    return found


def read_json(rel):
    with open(os.path.join(root, rel), encoding="utf-8") as fh:
        return json.load(fh)


# ---------- npm package-lock ----------
NPM_REGISTRY = "https://registry.npmjs.org/"


def registry_problem(key, ent):
    """None if the lock entry is a registry package with integrity, else a short description."""
    res = ent.get("resolved")
    if not isinstance(res, str) or not res.startswith(NPM_REGISTRY):
        host = re.match(r"([A-Za-z][A-Za-z0-9+.-]*://[^/@]*@?[^/]*)", res) if isinstance(res, str) else None
        where = re.sub(r"//[^/@]*@", "//", host.group(1)) if host else "no resolved URL"
        return "%s (%s)" % (key, where)
    if not ent.get("integrity"):
        return "%s (no integrity)" % key
    return None


def parse_package_lock(m):
    data = read_json(m.rel)
    lv = data.get("lockfileVersion")
    m.fmt = "package-lock.json (v%s)" % lv
    bad_src = []
    if lv in (2, 3) and isinstance(data.get("packages"), dict):
        for key, ent in data["packages"].items():
            if key == "" or not isinstance(ent, dict) or ent.get("link"):
                continue
            if "node_modules/" not in key:      # a local workspace folder, not a registry package
                m.notes.append("local workspace entry not looked up: %s" % key)
                continue
            if ent.get("inBundle"):
                continue
            name = ent.get("name") or key.rsplit("node_modules/", 1)[-1]
            ver = ent.get("version")
            if not ver or not re.fullmatch(EXACT_SEMVER, ver):
                m.incomplete.append("lock entry without an exact version: %s" % key)
                continue
            m.pkgs.add(("npm", name, ver))
            prob = registry_problem(key, ent)
            if prob:
                bad_src.append(prob)
    elif lv == 1 and isinstance(data.get("dependencies"), dict):
        def walk(deps, prefix):
            for name, ent in deps.items():
                ver = ent.get("version", "")
                if re.fullmatch(EXACT_SEMVER, ver):
                    m.pkgs.add(("npm", name, ver))
                    if not ent.get("bundled"):
                        prob = registry_problem(prefix + name, ent)
                        if prob:
                            bad_src.append(prob)
                else:
                    m.incomplete.append("lock entry without an exact version: %s@%s" % (name, ver))
                walk(ent.get("dependencies", {}), prefix + name + ">")
        walk(data["dependencies"], "")
    else:
        m.incomplete.append("unsupported lockfileVersion %r" % (lv,))
        return
    if bad_src:
        m.incomplete.append("%d lock entr%s not from %s or without integrity (OSV was asked about the registry package, not what is installed): %s%s" % (
            len(bad_src), "y" if len(bad_src) == 1 else "ies", NPM_REGISTRY.rstrip("/"), "; ".join(bad_src[:5]),
            " ..." if len(bad_src) > 5 else ""))
    d = os.path.dirname(m.rel)
    if ((d + "/package.json") if d else "package.json") not in all_rels:
        m.incomplete.append("lock has no sibling package.json: npm audit would audit the parent tree, so it was not run")
        return
    run_npm_audit(m)


def run_npm_audit(m):
    d = os.path.join(root, os.path.dirname(m.rel))
    # Full-tree audit regardless of the caller's environment: NODE_ENV=production or
    # npm_config_omit=dev would silently drop dev-only criticals, so every variable that can
    # narrow the audited tree is removed and the inclusion flags are explicit.
    env = {k: v for k, v in os.environ.items()
           if k.upper() != "NODE_ENV" and not re.match(
               r"(?i)npm_config_(omit|production|only|also|include|dev|optional|workspace|workspaces|"
               r"include_workspace_root|audit_level)$", k)}
    env.update(NPM_CONFIG_UPDATE_NOTIFIER="false", NPM_CONFIG_FUND="false")
    p = None
    try:
        p = subprocess.run(["npm", "audit", "--json", "--package-lock-only",
                            "--include=dev", "--include=optional", "--include=peer"], cwd=d, env=env,
                           capture_output=True, text=True, timeout=NPM_AUDIT_TIMEOUT)
        rep = json.loads(p.stdout)
    except subprocess.TimeoutExpired:
        m.incomplete.append("npm audit timed out after %ds" % NPM_AUDIT_TIMEOUT); return
    except (ValueError, OSError, subprocess.SubprocessError):
        m.incomplete.append("npm audit produced no parseable JSON (exit %s)" % (p.returncode if p is not None else "not run")); return
    try:
        if not isinstance(rep, dict):
            raise TypeError("report is not an object")
        if "error" in rep or "metadata" not in rep:
            err = rep.get("error") or {}
            msg = (err.get("summary") or err.get("code")) if isinstance(err, dict) else None
            m.incomplete.append("npm audit failed: %s" % (msg or "no metadata"))
            return
        counts = rep["metadata"].get("vulnerabilities", {})
        m.audit_counts = counts
        malware = []
        seen = set()
        for name, v in (rep.get("vulnerabilities") or {}).items():
            for via in v.get("via", []):
                if not isinstance(via, dict):
                    continue
                title = str(via.get("title", ""))
                ghsa = (via.get("url") or "").rstrip("/").rsplit("/", 1)[-1]
                ids = [x for x in (ghsa, str(via.get("source", ""))) if x]
                pkg = via.get("name") or name
                key = (pkg, tuple(ids))
                if key in seen:
                    continue
                if title.startswith("Malware in"):      # malicious package: like MAL-, never excepted
                    seen.add(key)
                    malware.append((pkg, ids, title))
                elif via.get("severity") == "critical":
                    seen.add(key)
                    m.criticals.append((pkg, ids, title))
        if counts.get("critical", 0) > 0 and not m.criticals and not malware:
            m.criticals.append(("?", ["unattributed"], "critical reported without advisory detail"))
    except (AttributeError, TypeError, KeyError, IndexError, ValueError) as e:
        m.audit_counts = None; m.criticals = []; malware = []
        m.incomplete.append("npm audit output not understood (%s)" % type(e).__name__)
        return
    for pkg, ids, title in malware:
        m.findings.append("npm audit MALWARE advisory %s %s %s" % (pkg, "/".join(ids), title))
    for pkg, ids, title in m.criticals:
        if not excepted(m.rel, pkg, ids):
            m.findings.append("npm audit CRITICAL %s %s %s" % (pkg, "/".join(ids), title))


# ---------- deno.lock ----------
def split_npm_key(key):
    """'name@1.2.3' or '@scope/name@1.2.3_peer@2.0.0' -> (name, version) or None."""
    at = key.find("@", 1)
    if at == -1:
        return None
    name, ver = key[:at], key[at + 1:].split("_", 1)[0]
    return name, ver


def remote_to_pkg(url):
    """Map a deno.lock `remote` URL to ('npm', name, ver) | ('unchecked', label, why)."""
    m_ = re.match(r"https?://([^/]+)/(.*)$", url)
    if not m_:
        return ("unchecked", url, "unrecognised URL")
    host, path = m_.group(1), m_.group(2)
    if host in ("esm.sh", "cdn.jsdelivr.net", "unpkg.com", "esm.run"):
        p = path
        if host == "cdn.jsdelivr.net":
            if not p.startswith("npm/"):
                return ("unchecked", host + "/" + "/".join(p.split("/")[:2]), "not an npm path")
            p = p[4:]
        p = re.sub(r"^\*", "", p)
        p = re.sub(r"^(v\d+|stable)/", "", p)
        if re.match(r"(gh|jsr|pr)/", p):
            return ("unchecked", host + "/" + "/".join(p.split("/")[:3]), "non-npm esm.sh source")
        nm = re.match(r"((?:@[^/@]+/)?[^/@]+)@([^/?&#]+)", p)
        if not nm:
            return ("unchecked", host + "/" + p.split("/")[0], "no version in URL")
        if re.fullmatch(EXACT_SEMVER, nm.group(2)):
            return ("npm", nm.group(1), nm.group(2))
        return ("unchecked", "%s/%s@%s" % (host, nm.group(1), nm.group(2)), "version is a range, not exact")
    if host == "deno.land":
        nm = re.match(r"(std)@([^/]+)", path) or re.match(r"(x/[^/@]+)@([^/]+)", path)
        if nm:
            return ("unchecked", "deno.land/%s@%s" % (nm.group(1), nm.group(2)), "no OSV ecosystem for deno.land")
    return ("unchecked", host + "/" + "/".join(path.split("/")[:2]), "no OSV ecosystem for this host")


def parse_deno_lock(m):
    data = read_json(m.rel)
    if not isinstance(data, dict):
        m.incomplete.append("deno.lock is not a JSON object"); return
    ver = str(data.get("version", "1"))
    m.fmt = "deno.lock (v%s)" % ver
    npm = jsr = remote = None
    if ver == "1":
        remote = data
        npm, jsr = {}, {}
    elif ver == "2":
        npm = (data.get("npm") or {}).get("packages", {}); jsr = {}; remote = data.get("remote", {})
    elif ver == "3":
        pk = data.get("packages") or {}
        npm, jsr, remote = pk.get("npm", {}), pk.get("jsr", {}), data.get("remote", {})
    elif ver in ("4", "5"):
        npm, jsr, remote = data.get("npm", {}), data.get("jsr", {}), data.get("remote", {})
    else:
        m.incomplete.append("unsupported deno.lock version %r" % ver); return
    for key in npm:
        sp = split_npm_key(key)
        if sp and re.fullmatch(EXACT_SEMVER, sp[1]):
            m.pkgs.add(("npm", sp[0], sp[1]))
        else:
            m.incomplete.append("deno.lock npm entry not parseable: %s" % key)
    for key in jsr:
        m.unchecked.append(("jsr:" + key, "no OSV ecosystem for jsr"))
    for url in remote:
        r = remote_to_pkg(url)
        if r[0] == "npm":
            m.pkgs.add(r)
        else:
            m.unchecked.append((r[1], r[2]))


# ---------- python requirements ----------
# Option-only lines that add no packages and do not change where they come from.
REQ_OK_OPTIONS = {"--require-hashes", "--only-binary", "--no-binary", "--prefer-binary", "--no-deps",
                  "--hash", "--pre", "--trusted-host", "--no-index", "--use-pep517", "--no-use-pep517",
                  "--no-build-isolation", "--no-emit-index-url", "--no-annotate"}
REQ_INDEX_OPTIONS = {"--index-url", "-i", "--extra-index-url"}


def parse_requirements(m):
    m.fmt = "requirements (exact pins)"
    with open(os.path.join(root, m.rel), encoding="utf-8") as fh:
        text = fh.read().replace("\\\n", " ")
    bad = 0
    total = hashed = 0
    no_deps = False
    directives = []
    for raw in text.splitlines():
        s = raw.split(" #", 1)[0].strip()
        if not s or s.startswith("#"):
            continue
        if s.startswith("-"):
            opt = re.split(r"[\s=]", s, maxsplit=1)[0]
            arg = s[len(opt):].lstrip(" =")
            if opt == "--no-deps":
                no_deps = True
            if opt in REQ_OK_OPTIONS:
                continue
            if opt in REQ_INDEX_OPTIONS:
                try:
                    u = urllib.parse.urlsplit(arg.split()[0]) if arg.split() else None
                    official = bool(u and u.scheme == "https" and u.hostname == "pypi.org" and u.username is None)
                except ValueError:
                    official = False
                if not official:
                    directives.append("%s: index is not https://pypi.org, so OSV names may not be what is installed" % opt)
                continue
            directives.append("%s: install-changing directive not followed (includes/constraints/editable/find-links/unknown)" % opt)
            continue
        total += 1
        if re.search(r"(^|\s)--hash=\S+", s):
            hashed += 1
        s = s.split(";", 1)[0].strip()
        s = re.split(r"\s--", s, maxsplit=1)[0].strip()
        mm = re.fullmatch(r"([A-Za-z0-9][A-Za-z0-9._-]*)(?:\[[^\]]*\])?\s*===?\s*([A-Za-z0-9.!+_-]+)", s)
        if mm and "*" not in mm.group(2):
            name = re.sub(r"[-_.]+", "-", mm.group(1)).lower()
            m.pkgs.add(("PyPI", name, mm.group(2)))
        else:
            bad += 1
    for d in sorted(set(directives)):
        m.incomplete.append("requirements directive: " + d)
    if bad:
        m.incomplete.append("%d requirement line(s) without an exact == pin (ranges/URLs/bare names): versions not determinable" % bad)
    if directives or bad or not total:
        return
    if hashed == total:
        m.locked = True; m.notes.append("fully hash-locked: pip refuses anything unlisted")
    elif no_deps:
        m.locked = True; m.notes.append("--no-deps with exact pins on every line")
    else:
        m.incomplete.append("transitive dependencies not pinned: %d of %d requirement line(s) carry no --hash (exact pins alone do not stop pip resolving new transitive versions)" % (total - hashed, total))


# ---------- package.json ----------
def check_package_json(m, all_rels):
    data = read_json(m.rel)
    m.fmt = "package.json"
    d = os.path.dirname(m.rel)
    for lock in ("package-lock.json",):
        if (d + "/" + lock if d else lock) in all_rels:
            m.notes.append("covered by sibling " + lock); return
    deps = any(data.get(k) for k in ("dependencies", "devDependencies", "optionalDependencies", "peerDependencies"))
    if not deps and not data.get("workspaces"):
        m.notes.append("declares no dependencies: nothing to lock"); return
    # workspace member covered by an ancestor lock that lists this directory?
    parts = d.split("/") if d else []
    for k in range(len(parts)):
        anc = "/".join(parts[:k])
        lock_rel = (anc + "/package-lock.json") if anc else "package-lock.json"
        if lock_rel in all_rels:
            try:
                pk = read_json(lock_rel).get("packages", {})
            except (ValueError, OSError):
                continue
            sub = "/".join(parts[k:])
            if sub in pk:
                m.notes.append("covered by workspace lock " + lock_rel); return
    m.incomplete.append("package.json has no lock file: dependency versions not pinned/checkable")


# ---------- run ----------
rels = discover()
all_rels = set(rels)
for rel in rels:
    base = os.path.basename(rel)
    kind = kind_of(rel)
    m = Manifest(rel, base)
    m.kind = kind
    manifests.append(m)
    try:
        if kind == "npmlock":
            parse_package_lock(m)
        elif kind == "denolock":
            parse_deno_lock(m)
        elif kind == "pkgjson":
            check_package_json(m, all_rels)
        elif kind == "unsupported":
            m.fmt = base + " (unsupported)"
            m.incomplete.append("unsupported lock format: not checked")
        elif kind == "pyreq":
            parse_requirements(m)
        else:
            pass   # denocfg / pysrc are resolved against the other manifests below
    except (ValueError, OSError, KeyError, TypeError, AttributeError, IndexError) as e:
        m.incomplete.append("unparseable manifest (%s: %s)" % (type(e).__name__, e))

# Coverage: an input file that does not itself pin everything is covered by a lock next to it
# (python) or at or above it (deno), the same idea as package.json + package-lock.json.
def dirname(rel):
    return os.path.dirname(rel)


for m in manifests:
    if m.kind in ("pyreq", "pysrc") and not m.locked:
        lock = next((o for o in manifests if o is not m and o.kind == "pyreq" and o.locked
                     and dirname(o.rel) == dirname(m.rel)), None)
        if lock:
            m.incomplete = []
            m.fmt = m.fmt if m.kind == "pyreq" else m.rel.rsplit("/", 1)[-1] + " (python input)"
            m.notes.append("covered by hash-locked " + lock.rel)
        elif m.kind == "pysrc":
            m.fmt = m.rel.rsplit("/", 1)[-1] + " (python input)"
            m.incomplete.append("python input with no fully hash-locked requirements file in the same directory: dependencies not pinned/checkable")
    elif m.kind == "denocfg":
        m.fmt = m.rel.rsplit("/", 1)[-1] + " (deno config)"
        parts = dirname(m.rel).split("/") if dirname(m.rel) else []
        cands = [("/".join(parts[:k]) + "/deno.lock") if k else "deno.lock" for k in range(len(parts), -1, -1)]
        lock = next((c for c in cands if c in all_rels), None)
        if lock:
            m.notes.append("covered by " + lock)
        else:
            m.incomplete.append("deno config with no deno.lock in the same or an ancestor directory: imports not pinned/checkable")

# `unchecked` entries: INCOMPLETE unless accepted by an exception line
for m in manifests:
    for label, why in m.unchecked:
        if excepted(m.rel, label, ["unchecked"]):
            m.notes.append("accepted unchecked: %s" % label)
        else:
            m.incomplete.append("not checkable (%s): %s" % (why, label))

# ---------- OSV batch lookup ----------
queries = sorted({p for m in manifests for p in m.pkgs})


def osv_post(payload):
    req = urllib.request.Request(OSV_URL, data=json.dumps(payload).encode(),
                                 headers={"Content-Type": "application/json", "User-Agent": "dep-audit/1"})
    with urllib.request.urlopen(req, timeout=OSV_TIMEOUT) as r:
        if r.status != 200:
            raise RuntimeError("HTTP %s" % r.status)
        return json.loads(r.read())


def q(p, token=None):
    d = {"package": {"name": p[1], "ecosystem": p[0]}, "version": p[2]}
    if token:
        d["page_token"] = token
    return d


mal = {}            # (eco,name,ver) -> sorted MAL ids
failed = set()      # packages whose lookup did not complete
lookup_errors = []
for start in range(0, len(queries), OSV_CHUNK):
    chunk = queries[start:start + OSV_CHUNK]
    try:
        body = osv_post({"queries": [q(p) for p in chunk]})
        res = body.get("results") if isinstance(body, dict) else None
        if not isinstance(res, list) or len(res) != len(chunk):
            raise RuntimeError("OSV returned %s results for %d queries" % (len(res) if isinstance(res, list) else "no", len(chunk)))
        for p, r in zip(chunk, res):
            if not isinstance(r, dict):
                raise RuntimeError("OSV result entry is not an object for %s@%s" % (p[1], p[2]))
            ids = {v["id"] for v in (r.get("vulns") or [])}
            token, pages = r.get("next_page_token"), 0
            while token:
                pages += 1
                if pages > OSV_MAX_PAGES:
                    raise RuntimeError("OSV pagination exceeded %d pages for %s@%s" % (OSV_MAX_PAGES, p[1], p[2]))
                r2 = osv_post({"queries": [q(p, token)]})["results"][0]
                if not isinstance(r2, dict):
                    raise RuntimeError("OSV page result is not an object for %s@%s" % (p[1], p[2]))
                ids |= {v["id"] for v in (r2.get("vulns") or [])}
                token = r2.get("next_page_token")
            hits = sorted(i for i in ids if i.startswith("MAL-"))
            if hits:
                mal[p] = hits
    except (urllib.error.URLError, urllib.error.HTTPError, http.client.HTTPException, OSError, RuntimeError,
            ValueError, KeyError, IndexError, AttributeError, TypeError) as e:
        lookup_errors.append("OSV lookup failed for %d version(s): %s: %s" % (len(chunk), type(e).__name__, e))
        failed.update(chunk)

for m in manifests:
    m.checked = len([p for p in m.pkgs if p not in failed])
    for p in sorted(m.pkgs):
        if p in mal:
            m.findings.append("MALICIOUS %s@%s (%s)" % (p[1], p[2], ", ".join(mal[p])))
    nfail = len([p for p in m.pkgs if p in failed])
    if nfail:
        m.incomplete.append("OSV lookup failed for %d of %d versions" % (nfail, len(m.pkgs)))

# ---------- report ----------
print("dep-audit: scan root: %s" % root_label)
print("exclusions: %s (any depth); %s (relative to scan root)" % (", ".join(EXCLUDE_NAMES), ", ".join(EXCLUDE_RELPATHS)))
print("OSV endpoint: %s" % OSV_URL)
print("exceptions file: %s (%s, %d entr%s)" % (os.path.relpath(exc_path, root) if exc_path.startswith(root) else os.path.basename(exc_path),
                                               exc_state, len(exceptions), "y" if len(exceptions) == 1 else "ies"))
print("manifests discovered: %d; distinct versions sent to OSV: %d" % (len(manifests), len(queries)))
print()
print("COVERAGE INVENTORY")
for m in manifests:
    state = "FINDING" if m.findings else ("INCOMPLETE" if m.incomplete else "OK")
    line = "  [%s] %s  format=%s  versions-checked=%d" % (state, m.rel, m.fmt, m.checked)
    if m.audit_counts is not None:
        c = m.audit_counts
        line += "  npm-audit: critical=%d high=%d moderate=%d low=%d info=%d total=%d" % (
            c.get("critical", 0), c.get("high", 0), c.get("moderate", 0), c.get("low", 0), c.get("info", 0), c.get("total", 0))
    print(line)
    for n in m.notes:
        print("      note: " + n)
    for f in m.findings:
        print("      FINDING: " + f)
    for f in m.incomplete:
        print("      INCOMPLETE: " + f)

findings = [(m.rel, f) for m in manifests for f in m.findings]
incomplete = [(m.rel, f) for m in manifests for f in m.incomplete]
global_inc = list(lookup_errors) + ["exceptions file: " + p for p in exc_problems] + discovery_problems
if not manifests:
    global_inc.append("no manifests found under the scan root (wrong --root?)")
stale = sorted(set(exceptions) - used_exceptions)
if stale:
    print()
    for k in stale:
        print("note: unused exception (stale?): %s %s %s" % k)
if global_inc:
    print()
    for g in global_inc:
        print("INCOMPLETE: " + g)

print()
print("SUMMARY: %d manifest(s), %d finding(s), %d incomplete item(s)" % (len(manifests), len(findings), len(incomplete) + len(global_inc)))
if findings:
    print("RESULT: FINDING (exit 1)" + ("; also INCOMPLETE parts listed above" if incomplete or global_inc else ""))
    sys.exit(1)
if incomplete or global_inc:
    print("RESULT: INCOMPLETE (exit 2) - not verified clean")
    sys.exit(2)
print("RESULT: CLEAN (exit 0)")
sys.exit(0)
PYEOF
)

exec python3 -I -c "$PY" "$@"
