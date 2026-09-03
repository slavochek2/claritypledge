# Fixture — a clean stage file (P1210 DW-12 must-pass)

Ask the owning tool and read its verdict; the reuse check lives inside the tool.

    yt fetch <video-id> --store   # prints HIT or MISS; do not look in the directory

Reconcile bytes against the ledger with the parameterised checker:

    node scripts/points/store-reconcile.mjs --store-root "$DIARIZE_STORE" --ledger "$AGENT_LEDGER"

The four store names are given once in docs/points-process.md; this file restates no path.
