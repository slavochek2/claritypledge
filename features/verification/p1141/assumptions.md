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

---

## Round 2 — the blind reviewer ran, and it found real defects

**A-12 — The first render capture could not have answered AC-2, and I did not notice until the
reviewer had already judged it.**
The renders were captured with an ordinary test user as author. That user is not in
`agent_accounts`, so the registry returned `isAgent = false` and NONE of the agent chrome rendered
— no byline, no machine chip, no footer. Those three elements ARE the answer to *"can a reader tell
at a glance which words the machine wrote"*. Round 2 therefore judged AC-2 against a surface from
which the entire mechanism was absent, and still called it satisfied on the strength of the quotes
section alone. Re-captured with the author registered as a machine account and a human-authored
control story alongside it, so the two treatments can be compared directly.

**A-13 — Round 2's eight defects, each verified before being acted on.** Verified against the
renders myself rather than promoted on the reviewer's word (epistemic gate 9).

| # | Claim | Verified? | Disposition |
|---|---|---|---|
| 1 | feed captures show the Points tab, no story cards at all | **TRUE** | Real capture defect: `/feed` defaults to Points. AC-3's surface was never captured. Fixed — `/feed?tab=stories` |
| 2 | external-link icon sits outside the card border at 320 | TRUE but **out of scope** | The pre-existing points action row, not a P1141 surface. Also largely an artifact of `fullPage` capture; gone under viewport capture |
| 3 | the fixed bottom nav slices card content | **CAPTURE ARTIFACT** | `fullPage` paints `position: fixed` chrome at its viewport offset over whatever sits there. No reader sees this. Fixed by capturing the viewport instead |
| 4 | timecode touch targets are 18–20px, under half the 40px minimum | **FALSE on measurement** | The control carries `h-10` (40px) and the e2e spec measures `boundingBox().height >= 40` and passes. The reviewer judged the visible glyphs, not the box. Its underlying point — no *visible* affordance — is fair and is why the row was reworked anyway |
| 5 | the quote column collapses to a 3-words-per-line ribbon at 320 | **TRUE** | Real. The row now stacks below `sm:` and only becomes two columns when there is width for both |
| 6 | media edit controls differ across viewports and between video and image | TRUE but **out of scope** | `StoryImage` is under an explicit Non-Goal: *do not touch the two existing image columns*. Reported, not fixed |
| 7 | the blocked state is indistinguishable from a working player | **TRUE, and the most valuable finding** | Same thumbnail, same play button, same duration chip. A reader pressed play expecting inline playback and was sent off-site with no warning — a silent redirect wearing a fallback's clothes. Added an explicit notice naming what happened and where the link goes, plus two regression tests |
| 8 | timecodes do not share a baseline with their quote text | **TRUE** | Real. `items-baseline` on the row |

**A-14 — A defect I found myself in the re-captured renders, which no test caught.**
Two paragraphs of story text rendered with no gap between them: `renderStoryText` emitted `<p>`
elements with no margin, so a blank line in the source collapsed to nothing and the argument read
as one run-on block. The unit test asserts the ELEMENTS (two `<p>`s, correct text) and passes
either way — it cannot see a missing gap. Fixed. Recorded because it is the clearest evidence in
this run for why the render review exists at all: a green suite said nothing about it.

**A-15 — Rounds are not being re-rolled.** Round 1 (blocker) and round 2 (FAIL, eight defects) are
both kept in place. Each subsequent round follows a fix to the build, never a re-run against
unchanged pixels — the gate names re-rolling until two passes land as a forgery, and the bound of
5 rounds is what enforces it.

**A-16 — A-7 above is SUPERSEDED, and it was wrong in a way worth naming.**
A-7 concluded that the COMPARABLE rows could not close without the founder, on the grounds that the
reviewer must not be the agent that built the thing (true) and that the session must not spawn
agents unasked (also true, as a default). What it missed is that the contract itself *prescribes*
the mechanism it was treating as unavailable: **"The reviewer subagent writes review-round-N.md
directly."** `.claude/rules/visual-qa.md` independently mandates the same thing — *"After any UI
change, spawn a SEPARATE subagent for visual QA; give it ONLY the screenshots + this checklist."*

So the constraint was never "no independent reviewer is reachable"; it was "the reviewer must not
be me". Dispatching a blind subagent satisfies both, and declining to dispatch one did not protect
the contract — it just left the check unrun and eight real defects in the build, including a
fallback state a reader could not distinguish from a working player.

The distinction is worth keeping: **refusing to author a verdict I am disqualified from giving was
correct; concluding from that that nobody could give one was not.** A-7 stands as written, for the
record; this entry is what replaces it.
