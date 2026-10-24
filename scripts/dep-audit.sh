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
#     package-lock.json (lockfileVersion 1/2/3)  -> npm audit (full tree; caller env and npm config
#                                                   files ignored) + every locked version (bundled
#                                                   ones included) against OSV (npm). INCOMPLETE if
#                                                   an entry is not the registry package it claims
#                                                   (resolved tarball must be its own name+version
#                                                   under https://registry.npmjs.org, with integrity),
#                                                   a link leaves the scan root, or there is no
#                                                   sibling package.json.
#     deno.lock (versions 1/2/3/4/5)             -> npm entries (integrity required) + exact
#                                                   esm.sh/unpkg/jsdelivr npm URLs -> OSV (npm);
#                                                   jsr:/deno.land/other hosts have no OSV ecosystem
#                                                   -> INCOMPLETE unless accepted with `unchecked`
#     deno.json, deno.jsonc, import_map.json    -> covered only if the config's effective lock
#                                                   (`"lock": false` disables; a `"lock"` path is
#                                                   honoured; an ancestor lock only via `workspace`)
#                                                   lists every npm:/jsr:/URL import
#     .ts/.tsx/.mts/.js/.mjs/.jsx sources       -> npm:/jsr:/esm.sh/deno.land/jsdelivr/unpkg
#                                                   imports must be listed in the nearest deno.lock
#                                                   at or above them, else INCOMPLETE (one line per dir)
#     requirements*.txt / *requirements*.txt / requirements/*.txt / requirements*.lock
#                                                -> exact `==` pins -> OSV (PyPI). CLEAN only when
#                                                   EVERY line carries --hash= (pip then refuses
#                                                   anything unlisted). Any include/constraint/
#                                                   editable/find-links directive, --no-deps (pip
#                                                   rejects it in a file), or an index other than
#                                                   pypi.org is INCOMPLETE.
#     pyproject.toml, Pipfile, setup.py, setup.cfg, *.in, constraints*.txt, and ranged/unhashed
#     requirements                               -> INCOMPLETE unless a fully hash-locked file in the
#                                                   same directory names that input's file name in its
#                                                   header comment (uv/pip-compile write the command).
#                                                   Coverage never erases the input's own directive,
#                                                   index or include problems.
#     package.json                               -> needs a sibling lock (or a workspace-root lock
#                                                   that lists it); otherwise INCOMPLETE
#     other lock formats (yarn.lock, pnpm-lock.yaml, poetry.lock, ...) -> unsupported -> INCOMPLETE
#     symlinked directories/manifest files and unreadable directories   -> listed, INCOMPLETE
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

IFS= read -r -d '' PY <<'PYEOF' || true
import atexit, fnmatch, http.client, json, os, shutil, tempfile, re, subprocess, sys, urllib.parse, urllib.request, urllib.error

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
SRC_EXT = (".ts", ".tsx", ".mts", ".js", ".mjs", ".jsx")
SRC_MAX_BYTES = 2 * 1024 * 1024
SPEC_RE = re.compile(r"""['"\x60]((?:npm|jsr):[^'"\x60\s]+|https://(?:esm\.sh|deno\.land|cdn\.jsdelivr\.net|unpkg\.com)/[^'"\x60\s]*)['"\x60]""")
EXACT_SEMVER = r"\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?"


# shell-safety (rules/shell-safety.md): no output line may carry redirect tokens, even when a
# library error text includes them (urllib prints "<urlopen error ...>").
_print = print
def print(*a, **k):
    _print(*[re.sub(r"[<>|]", lambda m_: {"<": "(", ">": ")", "|": "/"}[m_.group(0)], str(x)) for x in a], **k)


def _internal_error(etype, value, tb):
    # Top-level guard: an uncaught exception must never print a traceback and leave a caller
    # thinking the audit ran. It is INCOMPLETE (exit 2), unless a finding was already collected:
    # then that finding is printed and the exit is 1, so a crash cannot hide a malicious hit.
    try:
        found = [(mm.rel, f) for mm in (globals().get("manifests") or []) for f in mm.findings]
        found += [("osv", "MALICIOUS %s@%s (%s)" % (k[1], k[2], ", ".join(v))) for k, v in (globals().get("mal") or {}).items()]
        print("INCOMPLETE: internal error: %s (the report below is partial)" % etype.__name__)
        for rel, f in found:
            print("  FINDING: %s: %s" % (rel, f))
        globals()["_crash_found"] = bool(found)
        if found:
            print("RESULT: FINDING (exit 1); also INCOMPLETE: internal error")
        else:
            print("RESULT: INCOMPLETE (exit 2) - not verified clean")
        sys.stdout.flush()
    finally:
        shutil.rmtree(_cfgdir, True)
        os._exit(1 if globals().get('_crash_found') else 2)


sys.excepthook = _internal_error


# npm audit must not read the caller's user/global npm config (registry, omit, auth): two distinct
# empty files stand in for them (npm refuses the same path for both).
_cfgdir = tempfile.mkdtemp(prefix="dep-audit-")
atexit.register(shutil.rmtree, _cfgdir, True)
EMPTY_USERRC = os.path.join(_cfgdir, "userrc")
EMPTY_GLOBALRC = os.path.join(_cfgdir, "globalrc")
for _f in (EMPTY_USERRC, EMPTY_GLOBALRC):
    open(_f, "w").close()


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
if os.environ.get("DEP_AUDIT_SELFTEST_CRASH", "") not in ("", "late"):   # test-only: crash before any finding
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
        self.locked = False    # python: every requirement line exact and hashed
        self.kind = None
        self.header = ""       # python: leading comment block (where a lock names its sources)
        self.coverable = []    # python: problems a source-naming lock may cover (ranges, no hashes)
        self.lockinfo = None   # deno.lock: what the lock lists


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
    if base in ("pyproject.toml", "Pipfile", "setup.py", "setup.cfg") or base.endswith(".in") or re.fullmatch(r"constraints.*\.txt", base, re.I):
        return "pysrc"
    return None


srcfiles = []    # relative paths of JS/TS sources, scanned for remote imports


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
                if os.path.islink(os.path.join(dirpath, f)):
                    discovery_problems.append("symlinked manifest not followed: %s" % rel)
                else:
                    found.append(rel)
            elif f.endswith(SRC_EXT) and not os.path.islink(os.path.join(dirpath, f)):
                srcfiles.append(rel)
    return found


def dirname(rel):
    return os.path.dirname(rel)


def read_json(rel):
    with open(os.path.join(root, rel), encoding="utf-8") as fh:
        return json.load(fh)


# ---------- npm package-lock ----------
NPM_REGISTRY = "https://registry.npmjs.org/"


def registry_problem(key, name, ver, ent):
    """None if the entry is the registry package it claims to be, with integrity; else a short reason."""
    res = ent.get("resolved")
    if not isinstance(res, str) or not res.startswith(NPM_REGISTRY):
        host = re.match(r"([A-Za-z][A-Za-z0-9+.-]*://[^/@]*@?[^/]*)", res) if isinstance(res, str) else None
        where = re.sub(r"//[^/@]*@", "//", host.group(1)) if host else "no resolved URL"
        return "%s (%s)" % (key, where)
    # the tarball path must be this entry's own name and version (lockfile injection otherwise)
    expected = "%s%s/-/%s-%s.tgz" % (NPM_REGISTRY, name, name.rsplit("/", 1)[-1], ver)
    if res.split("#", 1)[0] != expected:
        return "%s (resolved tarball is not %s@%s)" % (key, name, ver)
    if not ent.get("integrity"):
        return "%s (no integrity)" % key
    return None


def link_problem(key, ent, lockdir):
    """A link entry must point inside the scan root."""
    res = ent.get("resolved")
    if not isinstance(res, str) or not res:
        return "%s (link without a target)" % key
    target = os.path.normpath(os.path.join(root, lockdir, res))
    try:
        inside = os.path.commonpath([target, root]) == root
    except ValueError:
        inside = False
    return None if inside else "%s (link target outside the scan root)" % key


def parse_package_lock(m):
    data = read_json(m.rel)
    lv = data.get("lockfileVersion")
    m.fmt = "package-lock.json (v%s)" % lv
    lockdir = os.path.dirname(m.rel)
    bad_src = []
    if lv in (2, 3) and isinstance(data.get("packages"), dict):
        for key, ent in data["packages"].items():
            if key == "" or not isinstance(ent, dict):
                continue
            if ent.get("link"):
                prob = link_problem(key, ent, lockdir)
                if prob:
                    bad_src.append(prob)
                continue
            if "node_modules/" not in key:      # a local workspace folder, not a registry package
                m.notes.append("local workspace entry not looked up: %s" % key)
                continue
            name = ent.get("name") or key.rsplit("node_modules/", 1)[-1]
            ver = ent.get("version")
            if not ver or not re.fullmatch(EXACT_SEMVER, ver):
                m.incomplete.append("lock entry without an exact version: %s" % key)
                continue
            m.pkgs.add(("npm", name, ver))          # bundled entries are looked up too
            if ent.get("inBundle"):
                continue                            # but have no resolved/integrity of their own
            prob = registry_problem(key, name, ver, ent)
            if prob:
                bad_src.append(prob)
    elif lv == 1 and isinstance(data.get("dependencies"), dict):
        stack = [("", data["dependencies"])]
        while stack:
            prefix, deps = stack.pop()
            for name, ent in deps.items():
                ver = ent.get("version", "")
                if re.fullmatch(EXACT_SEMVER, ver):
                    m.pkgs.add(("npm", name, ver))
                    if not ent.get("bundled"):
                        prob = registry_problem(prefix + name, name, ver, ent)
                        if prob:
                            bad_src.append(prob)
                else:
                    m.incomplete.append("lock entry without an exact version: %s@%s" % (name, ver))
                stack.append((prefix + name + "/", ent.get("dependencies", {})))
    else:
        m.incomplete.append("unsupported lockfileVersion %r" % (lv,))
        return
    if bad_src:
        m.incomplete.append("%d lock entr%s not the registry package they claim to be (outside %s, wrong tarball, no integrity, or link outside the scan root; OSV was asked about the claimed package, not what is installed): %s%s" % (
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
    env.update(NPM_CONFIG_UPDATE_NOTIFIER="false", NPM_CONFIG_FUND="false",
               NPM_CONFIG_USERCONFIG=EMPTY_USERRC, NPM_CONFIG_GLOBALCONFIG=EMPTY_GLOBALRC)
    p = None
    try:
        p = subprocess.run(["npm", "audit", "--json", "--package-lock-only",
                            "--include=dev", "--include=optional", "--include=peer",
                            "--registry=https://registry.npmjs.org/"], cwd=d, env=env,
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


class LockInfo:
    """What a deno.lock lists, in a version-independent shape."""
    def __init__(self):
        self.specs = set()    # 'npm:name@range', 'jsr:@scope/name@range' (as written in imports)
        self.npm = set()      # 'name@1.2.3'
        self.jsr = set()      # '@scope/name@1.2.3'
        self.remote = set()   # remote and redirect URLs


def parse_deno_lock(m):
    data = read_json(m.rel)
    if not isinstance(data, dict):
        m.incomplete.append("deno.lock is not a JSON object"); return
    ver = str(data.get("version", "1"))
    m.fmt = "deno.lock (v%s)" % ver
    li = m.lockinfo = LockInfo()
    npm = jsr = remote = None
    specifiers = {}
    redirects = data.get("redirects") or {}
    if ver == "1":
        remote = data
        npm, jsr = {}, {}
    elif ver == "2":
        nm_ = data.get("npm") or {}
        npm = nm_.get("packages", {}); jsr = {}; remote = data.get("remote", {})
        specifiers = {"npm:" + k: v for k, v in (nm_.get("specifiers") or {}).items()}
    elif ver == "3":
        pk = data.get("packages") or {}
        npm, jsr, remote = pk.get("npm", {}), pk.get("jsr", {}), data.get("remote", {})
        specifiers = pk.get("specifiers") or {}
    elif ver in ("4", "5"):
        npm, jsr, remote = data.get("npm", {}), data.get("jsr", {}), data.get("remote", {})
        specifiers = data.get("specifiers") or {}
    else:
        m.incomplete.append("unsupported deno.lock version %r" % ver); return
    li.specs |= set(specifiers)
    li.remote |= set(remote) | set(redirects)
    for key, val in npm.items():
        sp = split_npm_key(key)
        if sp and re.fullmatch(EXACT_SEMVER, sp[1]):
            m.pkgs.add(("npm", sp[0], sp[1]))
            li.npm.add("%s@%s" % sp)
            if ver != "1" and not (isinstance(val, dict) and val.get("integrity")):
                m.incomplete.append("deno.lock npm entry without integrity: %s" % key)
        else:
            m.incomplete.append("deno.lock npm entry not parseable: %s" % key)
    for key in jsr:
        li.jsr.add(key)
        m.unchecked.append(("jsr:" + key, "no OSV ecosystem for jsr"))
    for url in remote:
        r = remote_to_pkg(url)
        if r[0] == "npm":
            m.pkgs.add(r)
        else:
            m.unchecked.append((r[1], r[2]))


# ---------- deno config and source files ----------
def load_jsonc(rel):
    """JSON with // and /* */ comments and trailing commas (deno.jsonc)."""
    with open(os.path.join(root, rel), encoding="utf-8") as fh:
        t = fh.read()
    out, i, n, instr = [], 0, len(t), False
    while i < n:
        c = t[i]
        if instr:
            out.append(c)
            if c == "\\" and i + 1 < n:
                out.append(t[i + 1]); i += 1
            elif c == '"':
                instr = False
        elif c == '"':
            instr = True; out.append(c)
        elif t.startswith("//", i):
            while i < n and t[i] != "\n":
                i += 1
            continue
        elif t.startswith("/*", i):
            j = t.find("*/", i + 2)
            i = n if j == -1 else j + 2
            continue
        else:
            out.append(c)
        i += 1
    return json.loads(re.sub(r",(\s*[}\]])", r"\1", "".join(out)))


def spec_pkg(spec):
    """('npm', name, version) for an exact npm: / esm.sh style specifier, else None."""
    if spec.startswith("npm:"):
        mm = re.match(r"npm:/?((?:@[^/@]+/)?[^/@]+)@(" + EXACT_SEMVER + r")(?:/|$)", spec)
        return ("npm", mm.group(1), mm.group(2)) if mm else None
    if spec.startswith("https://"):
        r = remote_to_pkg(spec)
        return r if r[0] == "npm" else None
    return None


def spec_in_lock(spec, li):
    """Is this import specifier listed in the lock (specifiers / packages / remote)?"""
    if spec.endswith("/"):                                   # import-map prefix mapping
        if spec.startswith("https://"):
            return any(k.startswith(spec) for k in li.remote)
        return any(k.startswith(spec) for k in li.specs) or any(k.startswith(spec[4:]) for k in (li.jsr if spec.startswith("jsr:") else li.npm))
    for scheme in ("npm:", "jsr:"):
        if spec.startswith(scheme):
            mm = re.match(re.escape(scheme) + r"/?((?:@[^/@]+/)?[^/@]+)(?:@([^/]*))?", spec)
            if not mm:
                return False
            name, rng = mm.group(1), mm.group(2)
            norm = scheme + name + ("@" + rng if rng is not None else "")
            if norm in li.specs:
                return True
            if rng is not None and re.fullmatch(EXACT_SEMVER, rng):
                return ("%s@%s" % (name, rng)) in (li.npm if scheme == "npm:" else li.jsr)
            return False
    return spec in li.remote


def config_specs(data):
    """Remote specifiers in an import map / deno.json: imports and scopes values."""
    found = []
    maps = [data.get("imports")] + [v for v in (data.get("scopes") or {}).values()]
    for mp in maps:
        if isinstance(mp, dict):
            found += [v for v in mp.values() if isinstance(v, str) and re.match(r"(npm:|jsr:|https://)", v)]
    return found


def lock_for_config(m, data):
    """The deno.lock this config really uses: (lock_rel or None, [problems])."""
    d = dirname(m.rel)
    lk = data.get("lock")
    if lk is False:
        return None, ['lock disabled ("lock": false): imports are not pinned']
    path = lk if isinstance(lk, str) else (lk.get("path") if isinstance(lk, dict) else None)
    if isinstance(path, str):
        cand = os.path.normpath(os.path.join(d, path)) if d else os.path.normpath(path)
        return (cand, []) if cand in all_rels else (None, ['"lock" path %s is not a deno.lock found in the scan' % path])
    cand = (d + "/deno.lock") if d else "deno.lock"
    if cand in all_rels:
        return cand, []
    parts = d.split("/") if d else []
    for k in range(len(parts) - 1, -1, -1):          # an ancestor lock applies through a workspace
        anc = "/".join(parts[:k])
        lock_rel = (anc + "/deno.lock") if anc else "deno.lock"
        if lock_rel not in all_rels:
            continue
        sub = "/".join(parts[k:])
        for cfg in ("deno.json", "deno.jsonc"):
            cfg_rel = (anc + "/" + cfg) if anc else cfg
            if cfg_rel in all_rels:
                try:
                    ws = load_jsonc(cfg_rel).get("workspace")
                except (ValueError, OSError):
                    continue
                if isinstance(ws, dict):
                    ws = ws.get("members")
                if isinstance(ws, list) and any(isinstance(w, str) and fnmatch.fnmatch(sub, w.replace("./", "", 1).rstrip("/")) for w in ws):
                    return lock_rel, []
    return None, ["no deno.lock next to this config, and no ancestor config lists it in a workspace"]


def check_deno_config(m, lockinfo_of):
    m.fmt = os.path.basename(m.rel) + " (deno config)"
    data = load_jsonc(m.rel)
    if not isinstance(data, dict):
        m.incomplete.append("deno config is not an object"); return
    specs = config_specs(data)
    imp_map = data.get("importMap")
    if isinstance(imp_map, str):
        cand = os.path.normpath(os.path.join(dirname(m.rel), imp_map))
        try:
            specs += config_specs(load_jsonc(cand))
        except (OSError, ValueError):
            m.incomplete.append("importMap %s could not be read inside the scan root" % imp_map)
    for sp in specs:
        pk = spec_pkg(sp)
        if pk:
            m.pkgs.add(pk)
    lock_rel, problems = lock_for_config(m, data)
    for pr in problems:
        m.incomplete.append(pr)
    if not lock_rel:
        return
    li = lockinfo_of.get(lock_rel)
    if li is None:
        m.incomplete.append("lock %s could not be read" % lock_rel); return
    missing = sorted({sp for sp in specs if not spec_in_lock(sp, li)})
    if missing:
        m.incomplete.append("%d import(s) not listed in %s (lock out of date or never generated): %s%s" % (
            len(missing), lock_rel, "; ".join(missing[:5]), " ..." if len(missing) > 5 else ""))
    else:
        m.notes.append("covered by %s (all %d remote import(s) listed)" % (lock_rel, len(specs)))


def nearest_lock(dir_rel):
    parts = dir_rel.split("/") if dir_rel else []
    for k in range(len(parts), -1, -1):
        anc = "/".join(parts[:k])
        cand = (anc + "/deno.lock") if anc else "deno.lock"
        if cand in all_rels:
            return cand
    return None


def check_sources(lockinfo_of):
    """Edge-function style sources: remote imports with or without a deno config."""
    by_dir = {}
    for rel in srcfiles:
        try:
            if os.path.getsize(os.path.join(root, rel)) > SRC_MAX_BYTES:
                continue
            with open(os.path.join(root, rel), encoding="utf-8", errors="replace") as fh:
                specs = set(SPEC_RE.findall(fh.read()))
        except OSError:
            discovery_problems.append("unreadable source file: %s" % rel)
            continue
        if specs:
            by_dir.setdefault(dirname(rel), []).append((rel, specs))
    for d in sorted(by_dir):
        files = by_dir[d]
        m = Manifest((d + "/" if d else "") + "*.ts/js (remote imports)", "deno sources")
        m.kind = "denosrc"
        m.fmt = "source files with remote imports (%d)" % len(files)
        manifests.append(m)
        lock_rel = nearest_lock(d)
        li = lockinfo_of.get(lock_rel) if lock_rel else None
        allspecs = sorted({sp for _, sps in files for sp in sps})
        for sp in allspecs:
            pk = spec_pkg(sp)
            if pk:
                m.pkgs.add(pk)
        if not li:
            m.incomplete.append("%d file(s) import remote packages (e.g. %s: %s) with no deno.lock in this or an ancestor directory" % (
                len(files), os.path.basename(files[0][0]), sorted(files[0][1])[0]))
            continue
        missing = sorted({sp for sp in allspecs if not spec_in_lock(sp, li)})
        if missing:
            m.incomplete.append("%d import(s) in %d file(s) not listed in %s: %s%s" % (
                len(missing), len(files), lock_rel, "; ".join(missing[:5]), " ..." if len(missing) > 5 else ""))
        else:
            m.notes.append("%d file(s), all %d remote import(s) listed in %s" % (len(files), len(allspecs), lock_rel))


# ---------- python requirements ----------
# Option-only lines that add no packages and do not change where they come from.
# (options pip accepts inside a requirements file; --no-deps and the build flags are rejected by pip
# there, so they fall through to the INCOMPLETE branch below)
REQ_OK_OPTIONS = {"--require-hashes", "--only-binary", "--no-binary", "--prefer-binary",
                  "--hash", "--pre", "--trusted-host", "--no-index"}
REQ_INDEX_OPTIONS = {"--index-url", "-i", "--extra-index-url"}


def parse_requirements(m):
    m.fmt = "requirements (exact pins)"
    with open(os.path.join(root, m.rel), encoding="utf-8") as fh:
        text = fh.read().replace("\\\n", " ")
    bad = 0
    total = hashed = 0
    directives = []
    head = []
    for ln in text.splitlines():            # the leading comment block: where a lock names its sources
        if ln.strip() and not ln.lstrip().startswith("#"):
            break
        head.append(ln)
    m.header = "\n".join(head)
    for raw in text.splitlines():
        s = raw.split(" #", 1)[0].strip()
        if not s or s.startswith("#"):
            continue
        if s.startswith("-"):
            opt = re.split(r"[\s=]", s, maxsplit=1)[0]
            arg = s[len(opt):].lstrip(" =")
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
        m.coverable.append("%d requirement line(s) without an exact == pin (ranges/URLs/bare names): versions not determinable" % bad)
    if directives or bad or not total:
        return
    if hashed == total:
        m.locked = True; m.notes.append("fully hash-locked: pip refuses anything unlisted")
    else:
        m.coverable.append("transitive dependencies not pinned: %d of %d requirement line(s) carry no --hash (exact pins alone do not stop pip resolving new transitive versions)" % (total - hashed, total))


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
    except Exception as e:     # one bad manifest (incl. RecursionError) is that manifest's INCOMPLETE
        m.incomplete.append("unparseable manifest (%s: %s)" % (type(e).__name__, e))

# Deno: configs and remote-import sources are covered only by a lock that lists their imports.
lockinfo_of = {m.rel: m.lockinfo for m in manifests if m.kind == "denolock" and m.lockinfo}
for m in list(manifests):
    if m.kind == "denocfg":
        try:
            check_deno_config(m, lockinfo_of)
        except Exception as e:
            m.incomplete.append("unparseable deno config (%s: %s)" % (type(e).__name__, e))
try:
    check_sources(lockinfo_of)
except Exception as e:
    discovery_problems.append("source scan failed (%s)" % type(e).__name__)

# Python: an input that does not itself pin every line is covered only by a hash-locked lock in the
# same directory whose header names that input (uv/pip-compile write the command, which lists its
# sources). Coverage never erases the input's own directive/index/include problems.
def names_source(header, src_base):
    return re.search(r"(?<![A-Za-z0-9_.-])" + re.escape(src_base) + r"(?![A-Za-z0-9_-]|\.[A-Za-z0-9])", header) is not None


for m in manifests:
    if m.kind == "pysrc":
        m.fmt = os.path.basename(m.rel) + " (python input)"
        m.coverable.append("python input: dependencies are not pinned/checkable from it alone")
    if m.kind in ("pyreq", "pysrc") and m.coverable:
        lock = next((o for o in manifests if o is not m and o.kind == "pyreq" and o.locked
                     and dirname(o.rel) == dirname(m.rel) and names_source(o.header, os.path.basename(m.rel))), None)
        if lock:
            m.notes.append("covered by hash-locked %s (its header names %s)" % (lock.rel, os.path.basename(m.rel)))
        else:
            m.incomplete.extend(m.coverable + (["no fully hash-locked file in this directory names %s in its header (an independent file is never covered by a sibling)" % os.path.basename(m.rel)]))

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

if os.environ.get("DEP_AUDIT_SELFTEST_CRASH") == "late":    # test-only: crash after findings exist
    raise RuntimeError("selftest crash after lookup")

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
exc_abs = os.path.abspath(exc_path)
try:
    exc_inside = os.path.commonpath([exc_abs, root]) == root
except ValueError:
    exc_inside = False
print("exceptions file: %s (%s, %d entr%s)" % (os.path.relpath(exc_abs, root) if exc_inside else os.path.basename(exc_abs),
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

exec python3 -I -c "$PY" "$@"
