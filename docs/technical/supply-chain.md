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
| `deno.lock` (v1 to v5) | npm entries (each needs `integrity`) and exact-version `esm.sh` / `unpkg` / `jsdelivr` npm URLs against OSV. Every `remote` value must be a sha256, every `redirects` chain must end at a hashed `remote` entry, and every `specifiers` entry must resolve to a package record in the lock; otherwise INCOMPLETE |
| `deno.json`, `deno.jsonc`, `import_map.json` | covered only if its effective lock (`"lock": false` disables it; a `"lock"` path is honoured; an ancestor lock counts only through a `workspace` entry) lists every `npm:` / `jsr:` / URL import. Unlisted imports are INCOMPLETE and exact `npm:` ones still go to OSV. An `importMap` path must stay inside the scan root, symlinks resolved, or it is not followed (INCOMPLETE) |
| `.ts` `.tsx` `.js` `.mjs` sources | imports starting `npm:`, `jsr:`, `https://esm.sh/`, `https://deno.land/`, `https://cdn.jsdelivr.net/`, `https://unpkg.com/` must be listed in the nearest `deno.lock` at or above them, else INCOMPLETE (one inventory line per directory). A source file over 2 MiB is not scanned and is listed as INCOMPLETE |
| `requirements*.txt`, `*requirements*.txt`, `requirements/*.txt`, `requirements*.lock` | exact `==` pins against OSV (PyPI). CLEAN only when every line carries `--hash=` |
| `pyproject.toml`, `Pipfile`, `setup.py`, `setup.cfg`, `*.in`, `constraints*.txt`, and ranged or unhashed requirements | INCOMPLETE unless a fully hash-locked file in the same directory names that input on a compile command in its header (`pip-compile`, `pip compile`, `uv pip compile`, `piptools compile`; uv and pip-compile write it there; `\`-continued comment lines are joined first), by a path among the arguments after `compile` that resolves to the input from the lock's directory. Prose that merely mentions a tool and a file name covers nothing, and the `-o` output and `-c` / `-r` / override files are not inputs. A sibling that does not name it covers nothing, and coverage never hides the input's own `-r` / `-c` / `-e` / `-f` / index problems: `*.in` and `constraints*.txt` are parsed like requirements files, and `index-url`, `extra-index-url`, `find-links` and index `url` keys in `pyproject.toml`, `Pipfile` and `setup.cfg` are checked (every URL on the line, not the first), and any URL at all under a `[tool.uv]`, `[tool.uv.*]`, `[tool.pip*]` or `[[source]]` section, inline tables and multi-line arrays included, must be the official PyPI index |
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
- Python index and source configuration is read only as lines inside those sections and as the
  `index-url` / `extra-index-url` / `find-links` / index `url` keys. Other shapes (`setup.py` code,
  multi-line `setup.cfg` values, dotted keys such as `tool.uv.index = ...` written outside a section) are not parsed.
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

## Edge functions (one locked graph)

Every function under `supabase/functions/` has a `deno.json` that points at the shared import map
(`supabase/functions/deno.json`, exact `npm:` versions of `@supabase/supabase-js` and `jose`) and the
committed `supabase/functions/deno.lock`. Source files import the bare names; `deno.land/std` and the
image-codec modules stay exact-version URLs whose module content the lock hashes. The deploy bundler
refuses a lock whose npm integrity or remote-module hash does not match
(`scripts/test-p1563-edge-lock.sh` proves both, against the same bundler the CLI deploys with).
`pre-commit-checks.sh` type-checks every staged `.ts` file in a function directory (not only `index.ts`) together with that function's `index.ts`, each with the function's own `deno.json`; a staged `_shared` file, `deno.json(c)`, `import_map.json` or `deno.lock` re-checks every function.

To bump a version: edit the shared `deno.json`, update the lock with
`deno cache --config supabase/functions/deno.json supabase/functions/*/index.ts` (without `--frozen`,
which is what refuses changes), run `scripts/test-p1563-edge-lock.sh`, and commit both files. `deno.lock` is gitignored everywhere else; this one file is un-ignored on purpose.

Not covered: the `.wasm` files the image-codec modules fetch at invocation time (not module imports,
so no lock sees them); and a deploy run with Docker unavailable, where the CLI falls back to
server-side bundling that has not been shown to enforce the lock.

## Python services (hash-locked per image target)

`services/transcribe` (GPU image, Python 3.11, linux x86_64) and `services/transcribe-room-batch`
(slim image, Python 3.12) each keep their ranged dependencies in `requirements.in` (the only file a
human edits) and install a fully hash-locked `requirements.txt` generated from it for the image's own
interpreter and platform. Dockerfiles run `pip install --require-hashes`; base images are pinned by
digest.

```bash
./scripts/lock-python-services.sh [transcribe|transcribe-room-batch|all]   # needs Docker
```

The script runs a digest-pinned `uv` image under `linux/amd64` (two packages are source-only and uv must
run their `setup.py` on the target platform, not on the developer machine) and applies a release-age
cutoff (`EXCLUDE_NEWER` in the script, the Python counterpart of `min-release-age`). Re-running it with
the same inputs reproduces the lock byte for byte.

**Source-only packages (the unavoidable sdists), all in `services/transcribe`:** `openai-whisper` and
`docopt`. Their source archive is hash-checked like any wheel, but `setup.py` runs at image build. Their
build tools (`pip`, `setuptools`, `wheel`) are hash-locked in `build-requirements.txt`, installed first,
and the main install uses `--no-build-isolation`, so no unhashed build dependency is fetched. (This also
replaces Ubuntu 22.04's pip 22.0.2, whose isolated build cannot read `openai-whisper`'s metadata.)

**Hugging Face models** are pinned to a commit with pyannote's `"<repo>@<sha>"` form
(`DIARIZATION_PIPELINE` in `diarizer.py`, `VAD_PIPELINE` in `vad.py`; `Pipeline.from_pretrained` in
pyannote.audio 3.1 has no `revision` argument). Not pinned: models those pipelines' `config.yaml` names
in turn (gated, so unreadable without a token), and Whisper's weights, which `openai-whisper` downloads
from a URL carrying the file's sha256 and verifies itself.
