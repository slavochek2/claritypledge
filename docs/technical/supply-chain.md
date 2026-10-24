# Supply-chain audit

One command audits every dependency manifest and lock in the repository for known-malicious
packages and unexcepted critical advisories. It is the check that answers "is anything we install
compromised right now", independent of what any single `npm audit` run happens to cover.

## Run it

```bash
./scripts/dep-audit.sh                         # whole repository
./scripts/dep-audit.sh --root path/to/dir      # any other tree
./scripts/dep-audit.sh --exceptions FILE       # alternative exceptions file
./scripts/test-p1563-dep-audit.sh              # the suite (needs network, about 80 seconds)
```

It needs `python3` (stdlib only), `npm`, and network access to the npm registry (for `npm audit`)
and `api.osv.dev`. Only package names and versions are sent to OSV.

## What it checks

Manifests are discovered at run time and the exclusions are printed on every run: `node_modules`
and `.git` at any depth; `.claude` (skill templates there are not installed or deployed, and
`.claude/worktrees` holds other checkouts); and the test fixtures directory.

| Manifest | Checked how |
|---|---|
| `package-lock.json` (v1, v2, v3) | `npm audit` on the full tree, plus every locked version against OSV |
| `deno.lock` (v2 to v5) | npm entries and exact-version `esm.sh` / `unpkg` / `jsdelivr` npm URLs against OSV |
| `requirements*.txt`, `requirements*.lock` | every exact `==` pin against OSV (PyPI) |
| `package.json` | must have a sibling lock (or be listed in a workspace-root lock) |

Versions are looked up with OSV's `/v1/querybatch`, in chunks of 1000, with a timeout. A malicious
package is an OSV id starting `MAL-`: the OSV schema assigns that prefix to the OpenSSF Malicious
Packages Repository. Malicious hits can never be excepted.

## Exit codes

| Exit | Result | Meaning |
|---|---|---|
| 0 | CLEAN | Everything discovered was fully checked; no `MAL-` hit and no unexcepted critical |
| 1 | FINDING | Any `MAL-` hit, or any `critical` in the full `npm audit` tree not in the exceptions file |
| 2 | INCOMPLETE | Something could not be checked. Never reported as clean |

FINDING wins over INCOMPLETE, and still lists the incomplete parts. INCOMPLETE covers: OSV or
`npm audit` error, timeout or non-200; an unparseable or unsupported manifest (yarn, pnpm, poetry
and similar locks); a `package.json` with no lock; a requirements file with ranges instead of
exact pins; a dependency source OSV has no ecosystem for (`jsr:`, `deno.land`, esm.sh version
ranges); a malformed exceptions file; and a scan root with no manifests at all.

The output ends with a coverage inventory: each manifest, its format, how many exact versions were
checked, `npm audit` counts by severity, and its outcome.

## Exceptions file

`scripts/dep-audit-exceptions.txt`, one entry per line, a reason after `#` is mandatory:

```
<manifest-relative-path> <package> <advisory-id> # reason
```

- The path is relative to the scan root.
- For an `npm audit` critical, `<advisory-id>` is the GHSA id (or the numeric advisory source) the
  script prints next to the finding.
- For a source OSV cannot check, `<advisory-id>` is the word `unchecked` and `<package>` is the
  label the script printed (for example `deno.land/std@0.224.0`).
- Unused entries are reported as stale so the file shrinks when advisories are fixed.

## Known limits

- OSV has no ecosystem for JSR or `deno.land`; those entries are never silently passed, they are
  INCOMPLETE until explicitly accepted with `unchecked`.
- `npm audit` and OSV both lag a new compromise. A clean result means "no advisory published yet".
- The script reads lock files; it does not verify that a lock matches what is installed.

## Install-time controls

(filled in by the P1563 merge)
