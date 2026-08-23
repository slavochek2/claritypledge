# P1141 — assumptions log

Every call the loop made alone. There is no escalation clause: the agent decides, logs, continues.
The log is the price of not being interrupted.

Run: 2026-08-23, worktree w3, branch `feature/p1141-story-video-quotes`.

---

**A-1 — The seal migration is based on P975, not P833, and the spec's own build sequence pointed at
the wrong base.**
Build step 2 says `CREATE OR REPLACE` on top of "the current `p833` body verbatim". P833 is not the
current definition — P898, P914, P952 and P975 all redefine `seal_and_send_letter` after it. A first
draft built from P833 was written and staged, and `sd-guard-completeness.test.ts` failed it
immediately, naming three guards that would have been silently dropped: the self-send exception, the
resolvable-email exception, and the `p878_relationship_scope` token. Rebased on P975. **The spec text
is wrong on this point and should be corrected** — it names a specific stale migration, which is the
exact regression shape the canary exists to catch.

**A-2 — The blocked-player threshold is derived, not a fixed 10 seconds.**
Decision 4's own ⚠ CHALLENGED block says a fixed constant is the shape `docs/decisions.md`
2026-07-31 decision (3) rejects, and asks the build to settle it. Settled as: derive from
`navigator.connection.rtt × 20` when available, else the navigation entry's `responseEnd × 8`,
clamped to `[10s, 30s]`. Both signals exist **before** any load event, which is the constraint a
blocked embed imposes (it never produces an `embedFetchDuration`, so the prescribed clamp formula
cannot be lifted as-is). The floor sits above the ~7.6s a measured-successful cross-origin embed
took, and the bias is deliberately toward waiting — a false "blocked" notice on a working player
sends the reader off-site, which is worse than a few extra seconds. Asserted by test at the 7.6s
mark. Rationale recorded inline in `story-video-player.tsx`.

**A-3 — P540's linkify tests were edited, and that is a spec supersession, not a test fudge.**
Ten assertions in `src/tests/p540-linkify-markdown.test.ts` required a markdown link with an
ARBITRARY label to render as a link — the exact permission the 2026-08-20 finding names, and the
one P1141 narrows. The labels were changed to match their destinations; every XSS assertion in the
file is untouched, and the supersession is recorded in a header comment on the file itself. The
mismatch cases now live in `p1141-linkify-structure.test.tsx`. **Flagged rather than assumed
harmless:** this is the one place in the run where a pre-existing test's assertions were rewritten.

**A-4 — A real defect in `linkify.ts` was fixed, outside the strict letter of the spec.**
The (d) autolink case exposed it: `<https://example.com>` produced an href carrying the closing
`>`, because `TRAILING_PUNCT` did not include it — a link that renders as correct and resolves to a
404. `>` was added to the trailing set. In scope by the "obvious guards in the code path you're
touching" exception, and found by a test the spec required rather than by browsing.

**A-5 — The 320px horizontal overflow on the story detail page is pre-existing and was NOT fixed.**
A control probe measured the overflow at 320px on a story with no video and on a story with one and
got an identical set of offending elements both times — a 44px-min toolbar button row spilling ~19px.
P1141's own subtree is clean at every viewport. The e2e overflow assertion is therefore scoped to
P1141's subtree, with the reason inline in the spec file, rather than asserting on
`documentElement` and either failing for someone else's defect or silently fixing out-of-scope UI.
Filed to `docs/process-learnings.md` as `due: month`.

**A-6 — `RD-4` was exercised: `./scripts/migrate.sh` ran against the TEST database.**
Both P1141 migrations applied. Prod remains untouched and ALWAYS-ASK. `stamp-deploy-manifest.sh`
refused to run from a worktree and must be run from the main checkout before ship — noted, not
worked around.

**A-7 — The two COMPARABLE rows (AC-2, AC-3) are NOT discharged, and the loop did not attempt to
discharge them.**
The contract's blind-reviewer clause is explicit that the reviewer "must not be the agent that built
the thing", and records that every rejected version in P1083's four rounds had already passed its
own implementer's review. This agent built every surface under review, so any verdict it wrote would
be exactly the artefact the clause forbids. Additionally the session's standing instruction is not
to spawn agents unless the user requests it. `review-round-1.md` therefore records the blocker
rather than a verdict. **This is the one gate check that cannot close without the founder** — either
by dispatching an independent reviewer or by reviewing the renders themselves.

**A-8 — Story content never waits on the player, and this was treated as non-negotiable.**
`StoryVideoQuotes` and the argument render synchronously regardless of player state; the player's
`blocked` flag only chooses between a seek button and an open-the-source link. Asserted directly in
both the unit and the real-route e2e specs.

**A-9 — The quotes section renders on the detail surface only.**
Decision 6 says only the dedicated detail surface mounts a live player; the quotes section is wired
to `isDetailView` on the same reasoning. A card showing quotes without a player to seek would be a
list of dead timecodes.

**A-10 — `subjectName` comes from `stripAgentPrefix(story.authorName)`, not from a new column.**
The UI Contract's `{Full Name}` is the byline value, and the byline already derives from the profile
name. No new field was introduced to carry it — that would be a second place the two could disagree,
which is what the single-stored-field design exists to prevent.

**A-11 — RD-3 was honoured: no filter for third-party identifiers was added.**
The founder ruled a public comment on a public video is public speech and quotable. Recorded here so
a later reader does not mistake the absence of a filter for an oversight, per the ruling's own
instruction not to re-raise it inside this spec's build.
