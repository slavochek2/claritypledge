# p1563-dep-audit fixtures

Inputs for `scripts/test-p1563-dep-audit.sh`. They deliberately contain a known-malicious and a
known-critical dependency version.

Every manifest here is stored as `<real name>.fixture` (for example `package-lock.json.fixture`) so
that GitHub's dependency graph and other scanners do not parse them as real manifests of this
repository. The test copies each case into a temporary directory and strips the suffix before running
`scripts/dep-audit.sh` on it. Never rename them back in place and never install them.
