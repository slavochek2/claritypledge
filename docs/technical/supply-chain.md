# Supply-chain audit

One command audits every dependency manifest and lock in the repository for known-malicious
packages and unexcepted critical advisories. It is the check that answers "is anything we install
compromised right now", independent of what any single `npm audit` run happens to cover.

## Run it

```bash
./scripts/dep-audit.sh                         # whole repository
./scripts/dep-audit.sh --root DIR [--exceptions FILE]   # another tree / exceptions file
./scripts/test-p1563-dep-audit.sh              # the suite (needs network, about 80 seconds)
```

It needs `python3` (stdlib only), `npm`, and network access to the npm registry and `api.osv.dev`.
Only package names and versions are sent to OSV.

## What it checks

Manifests are discovered at run time and the exclusions are printed on every run: `node_modules`
and `.git` at any depth; `.claude` (skill templates there are not installed or deployed, and
`.claude/worktrees` holds other checkouts); and the test fixtures directory. Symlinked directories
and manifest files, and unreadable directories, are listed as INCOMPLETE, never skipped silently.

| Surface | Checked how |
|---|---|
| `package-lock.json` (v1, v2, v3) | `npm audit` on the full tree (dev, optional, peer; the caller's `NODE_ENV`, `npm_config_*` and npm config files are ignored), plus every locked version against OSV, bundled entries included. Needs a sibling `package.json`. Each registry entry's `resolved` tarball must be its own `name` and `version` under `https://registry.npmjs.org` and carry `integrity`; a `link` must stay inside the scan root. Otherwise INCOMPLETE |
| `deno.lock` (v1 to v5) | npm entries (each needs `integrity`) and exact-version `esm.sh` / `unpkg` / `jsdelivr` npm URLs against OSV |
| `deno.json`, `deno.jsonc`, `import_map.json` | covered only if its effective lock (`"lock": false` disables it; a `"lock"` path is honoured; an ancestor lock counts only through a `workspace` entry) lists every `npm:` / `jsr:` / URL import. Unlisted imports are INCOMPLETE and exact `npm:` ones still go to OSV |
| `.ts` `.tsx` `.js` `.mjs` sources | imports starting `npm:`, `jsr:`, `https://esm.sh/`, `https://deno.land/`, `https://cdn.jsdelivr.net/`, `https://unpkg.com/` must be listed in the nearest `deno.lock` at or above them, else INCOMPLETE (one inventory line per directory) |
| `requirements*.txt`, `*requirements*.txt`, `requirements/*.txt`, `requirements*.lock` | exact `==` pins against OSV (PyPI). CLEAN only when every line carries `--hash=` |
| `pyproject.toml`, `Pipfile`, `setup.py`, `setup.cfg`, `*.in`, `constraints*.txt`, and ranged or unhashed requirements | INCOMPLETE unless a fully hash-locked file in the same directory names that input's file name in its header (uv and pip-compile write the command line there). A sibling that does not name it covers nothing, and coverage never hides the input's own `-r` / `-e` / index problems |
| `package.json` | must have a sibling lock (or be listed in a workspace-root lock) |

Versions are looked up with OSV's `/v1/querybatch`, in chunks of 1000, with a timeout. A malicious
package is an OSV id starting `MAL-`: the OSV schema assigns that prefix to the OpenSSF Malicious
Packages Repository. An `npm audit` advisory titled "Malware in ..." is treated the same way.
Malicious hits can never be excepted.

## Exit codes

| Exit | Result | Meaning |
|---|---|---|
| 0 | CLEAN | Everything discovered was fully checked; no `MAL-` hit and no unexcepted critical |
| 1 | FINDING | Any `MAL-` hit, or any `critical` in the full `npm audit` tree not in the exceptions file |
| 2 | INCOMPLETE | Something could not be checked. Never reported as clean |

FINDING wins over INCOMPLETE and still lists the incomplete parts. INCOMPLETE covers: an OSV or
`npm audit` error, timeout, non-200 or malformed answer; a crash of the script itself (findings
already collected are printed and the exit is 1); an unparseable or unsupported manifest (yarn,
pnpm, poetry and similar locks); a `package.json` with no lock; a lock entry that is not the
registry package it claims to be; Python requirements with ranges, without hashes (transitive
dependencies not pinned), with an unfollowed `-r` / `-c` / `-e` / `-f` directive, with `--no-deps`
(pip rejects it in such a file), or with an index other than pypi.org; a dependency source OSV has
no ecosystem for (`jsr:`, `deno.land`, esm.sh version ranges); a malformed exceptions file
(wildcards are rejected: name the exact package and advisory id); and a scan root with no manifests.

The output ends with a coverage inventory: each manifest, its format, how many exact versions were
checked, `npm audit` counts by severity, and its outcome.

## Exceptions file

`scripts/dep-audit-exceptions.txt`, one entry per line, a reason after `#` is mandatory:

```
<manifest-relative-path> <package> <advisory-id> # reason
```

- The path is relative to the scan root. For an `npm audit` critical, `<advisory-id>` is the GHSA id
  (or numeric advisory source) the script prints next to the finding.
- For a source OSV cannot check, `<advisory-id>` is the word `unchecked` and `<package>` is the
  label the script printed (for example `deno.land/std@0.224.0`).
- Unused entries are reported as stale so the file shrinks when advisories are fixed.

## Known limits

- OSV has no ecosystem for JSR or `deno.land`; those entries are never silently passed, they are
  INCOMPLETE until explicitly accepted with `unchecked`.
- `npm audit` and OSV both lag a new compromise. A clean result means "no advisory published yet".
- The script reads lock files; it does not verify that a lock matches what is installed.
- `pip install` lines inside a Dockerfile are not parsed; those images are covered only through the
  requirements files they install from.
- An `esm.sh` URL in `deno.lock` pins one package version, but the code esm.sh serves for it is a
  bundle that can include transitive code the lock does not list. The audit sees the pinned
  package, not what is bundled into it.

## Install-time controls

What they buy: a dependency's install script never runs where a build or CI secret is present,
and a version published in the last 7 days is never picked up by resolution. What they do **not**
buy: a malicious version that is already in a lock still runs at *build* time (bundler plugins,
build tools) with whatever the build environment holds, and can change the shipped bundle.

| Where | Control |
|---|---|
| Production build (`vercel.json`) | `installCommand` is `npm ci --ignore-scripts --include=optional`. The Linux binaries the build needs (bundler, source-map CLI) come from the lock's optional packages, so no `npm rebuild` is needed; add one only for a package shown to fail without it |
| CI workflows that install | Same command, and `actions/checkout` with `persist-credentials: false`. A job that needs the Playwright browser installs it in its own step |
| `plugin-eval` workflow | The CLI is an exact version installed with scripts off, run through its `cli-wrapper.cjs` via a `claude` shim on `PATH`, with the auto-updater disabled |
| `postinstall` | Always installs the git hooks (the privacy gate depends on it); skips only the browser download when `CI` or `VERCEL` is set, and says so |
| `.npmrc` (root, `tools/kanban`, `cloud-functions/gcs-signed-url`) | `min-release-age=7` (days). npm reads `.npmrc` from the project root only, so each package directory carries its own |

**The cooldown, measured (npm 11.19.1):** applies to `npm install`/`npm update` resolution,
including transitive dependencies and `@latest`; an explicit too-new `pkg@x.y.z` fails with
`ETARGET`; `npm ci` from an existing lock ignores it (the lock is the pin). npm 10 and older ignore
the key, so it protects only on npm 11 or newer. For an urgent fix to a package inside the window,
use `--min-release-age-exclude=<pkg>` for that one command (or a `min-release-age-exclude[]=<pkg>`
line in `.npmrc`).

**Never** set `ignore-scripts=true` in a tracked `.npmrc`: developer installs would stop installing
the git hooks, silently.
