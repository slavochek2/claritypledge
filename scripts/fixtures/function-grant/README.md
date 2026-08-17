# Fixtures for `scripts/test-function-grant-drift-check.py`

Synthetic snapshots in the shape `function-grant-drift-check.py --prod-json / --test-json`
consume: a JSON array of rows from its `GRANT_QUERY`.

**The function names here are invented and match nothing in this repo, deliberately.**

Two reasons, and the second is the load-bearing one:

1. A fixture built from the live surface would have to be regenerated every time a
   migration lands, and a stale fixture makes the suite fail for reasons unrelated
   to the code under test.
2. This repo is public. A committed snapshot of which live functions an anonymous
   caller can reach is exactly the disclosure P1066 kept out of its own spec — a
   fixture is a file like any other, and "it's only test data" is not a
   classification. Synthetic names carry the same assertions and disclose nothing.

Each fixture pairs with `allowlist-*.txt` in this directory. The suite always passes
an explicit `--allowlist` and an absent `--baseline`, so the repo's real allowlist
and the founder's machine-local backlog can never change a verdict.
