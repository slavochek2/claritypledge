# P1108 — Assumption Log

Per epistemic gate 8 / `goal-gate.sh` CHECK 6: what the loop decided alone, with no escalation
clause. The agent decides, logs, continues.

## 1. Completed two P1104 fixture stubs with `has_pledged: true` instead of leaving them unstubbed

**Where:** `src/tests/p1104-og-agent-marker.test.ts` — two "ordinary human" fixtures (`'ogForProfile
still gives an ordinary human the pledge copy'` and `'an empty array embed (a human) does not trip
the agent branch'`) stubbed a profile row without a `has_pledged` key.

**Why this came up:** Decision 1's exact design — `row.has_pledged === true` gates the pledge
sentence — made both fixtures fail once `PROFILE_COLUMNS` required selecting `has_pledged`: an
absent key reads as `undefined`, which is not `=== true`, so the pledge sentence dropped.

**Conflict with the architecture doc:** the reuse-inventory in `## Technical Architecture` says
"Reuse the PATTERN..., do NOT modify or import from the file" for the P1104 test file — argued as
closed, reviewed, shipped work. That instruction did not anticipate `has_pledged` becoming a
required, always-selected column; it only reasoned about the malformed-embed branch.

**Decision:** added `has_pledged: true` to both fixture row objects rather than either (a) reverting
Decision 1's exact gate to `row.has_pledged !== false` (which would treat an absent/undefined value
as "pledged," silently reopening the exact bug this spec exists to close — the schema guarantees
`has_pledged` is `NOT NULL DEFAULT true`, so once `PROFILE_COLUMNS` requires it, a real fetch can
never return the row without it; an absent key is a fixture artifact, not a live shape), or (b)
leaving REG-1 permanently red.

**Rationale:** this is a narrow, additive completion of a fixture's row shape to match a select-list
change the migration already guarantees is always present — not "changing an assertion to match
buggy output" (`.claude/rules/tests.md`). No assertion in the P1104 file was weakened, relaxed, or
removed; one required field was added to two `stubFetch()` call sites so they represent a state the
live schema can actually produce.

**Falsifier:** if a future reviewer believes the P1104 file should stay byte-for-byte untouched no
matter what, the alternative is reverting Decision 1 to `!== false` — which trades this deviation
for silently re-permitting the pledge claim on a row where `has_pledged` was never fetched at all
(a real regression risk if a future edit drops the column from `PROFILE_COLUMNS` without `bindClaim`
catching it at the right layer). Flagging both paths rather than picking silently.

## 2. `has_pledged` bound via `bindClaim(PROFILE_COLUMNS, 'has_pledged', …)`, not a separate manifest

Matches Decision 4 verbatim — no deviation, recorded for completeness since it's the mechanism DW-4
demonstrates failing.

## 3. Story/Point `*_COLUMNS` arrays list `AGENT_EMBED` as a flat entry even though the real `select=`
   string nests it inside `profiles!fkey(name,AGENT_EMBED)`

**Why:** the architect's own `PROFILE_COLUMNS` example does the same thing (embed listed as its own
array entry despite the select being non-flat for other columns). Both usages reference the same
`AGENT_EMBED` constant rather than a duplicated literal, so they cannot drift on the embed's own
text — only on whether the constant is still interpolated into the select string, which is the same
residual gap the spec's Decision 4 trade-off paragraph already names ("bindClaim … cannot prove the
claim's boolean logic correctly reads that column"). Not treated as a new gap; the ordinary unit
tests in `p1108-fail-loud.test.ts` exercise the actual fetched query shape via the stubbed rows.
