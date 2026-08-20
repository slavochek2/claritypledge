---
status: week
type: task
rank: 40
created_date: '2026-08-19'
tags: [previews, og, truthfulness, crawlers]
feature_type: backend
delivery_stage: architect
pipeline_ran: [create-spec, architect]
driver: anomaly
---

# P1108: Link previews must say true things, and keep saying them

## Run This

Run from `<cp-root>/.claude/worktrees/w1` — the claimed worktree for this spec:

    /goal "./scripts/goal-gate.sh p1108 exits 0, output pasted. Stop after 30 turns."

That one line is the whole invocation. `/goal` is native Claude Code, not a repo
skill, so the founder types it — no agent can invoke it on their behalf. The
condition names an exit code deliberately: `/goal`'s evaluator judges the
**transcript** and runs nothing itself, so the only condition it cannot be talked
out of is one naming an artifact the loop cannot author. `goal-gate.sh` reads
this spec's `## Verification Contract` and nothing else; the criteria are pinned
by SHA-256 on `main` so the branch under judgement cannot delete a row it is
about to fail.

Everything the loop needs is below. Nothing else has to be passed to it.

Still the founder's, after the loop is green: **DW-7** (live `curl` with a
crawler user-agent against a deployed URL — nothing here touches a deployed
target) and the push, which is never pre-approvable.

## Problem

**Situation:** Two independent preview systems exist. Thirty page files set their own meta tags in the app. Four page types — events, stories, points, profiles — have a **second**, separately hand-written preview built by `api/og.ts`. `vercel.json:117-135` routes only those four paths to it, and only for a fixed crawler user-agent list (Facebook, Twitter, Telegram, WhatsApp, LinkedIn, Slack, Discord). Everything else falls through to the SPA, whose meta tags no crawler executes.

**Complication:** The in-app tags are therefore decorative for sharing on all thirty pages, and the four crawler handlers are the only preview anyone actually sees — each with its description written by hand and no rule about whether it is true. `api/og.ts:117-137` builds, for **any** profile slug:

> `{name} signed the Clarity Pledge — a public commitment to clear communication.`

It never checks whether they signed. It does not select `has_pledged`, so it cannot. **Every non-pledger's shared profile link asserts they took the oath.** This is invisible when opening the link yourself, because a browser never takes the crawler path — which is why it has survived.

Found while scoping `features/p1104_agents_must_be_visually_distinguishable.md`, which needs the same surface to stop attributing a machine's reading to a person. That spec does not fix this; it is not agent-specific and predates agents entirely.

**Question:** What makes preview text true today across the four live handlers, and true by default for the next page type someone adds?

## Appetite

**Medium blast radius, entirely outward-facing.** Nothing in the app changes; what changes is what strangers see in a chat thread. **Reversible** — the handlers are pure functions of a database row.

**Decision density: low.** One founder decision on scope (below); the rest follows from what the data supports.

## Solution

Direction only; `/architect` owns the design.

1. **Audit the four live handlers** for claims not supported by the row they fetch. The profile one is known. The others emit `by {authorName}`, `Shared by {creatorName}` and event copy — each needs the same question asked.
2. **A claim must be backed by a fetched column.** The profile bug exists because the description asserts something the query never retrieved. Any preview sentence stating a fact about a person or object must read that fact, or not state it.
3. **A default that fails safe.** When a column is missing, absent, or false, the preview degrades to a description that asserts nothing about the subject rather than to a flattering constant.
4. **Something that keeps it true for page five.** Today a new page type gets a hand-written description with no check. Whatever form this takes — a shared builder, a test, a checklist in the crawler file — the goal is that the next person adding a handler cannot repeat the profile mistake silently.
5. ~~Decide the fate of the orphan pages~~ — **split out to P1128.** See `## Resolved Decisions`.

**Scope — `[FOUNDER DECISION]` — ANSWERED 2026-08-20.** See `## Resolved Decisions` below.

## Risks / Non-Goals

### Risks

- **A preview bug cannot be seen by looking.** Opening the link in a browser shows the real page; only a crawler user-agent gets the false text. **MITIGATE:** verification is `curl` with a crawler user-agent against a live URL, with the output pasted — never "I opened it and it looked fine."
- **Fixing the text without fixing the fetch reproduces the bug one column over.** The profile handler cannot check the pledge because it does not select it. **MITIGATE:** for each claim, confirm the column is in the `select` list before trusting the condition that reads it.
- **A guard nobody has watched fail is not a guard.** Per `.claude/rules/epistemic.md` gate 7, whatever mechanism is added in step 4 must be seen to fail on a deliberately false preview before it is trusted. **MITIGATE:** paste the failing output.
- **Changed preview text does not propagate.** Facebook, LinkedIn and Slack cache previews; a fixed description may keep showing the old one for existing links. **ACCEPT and state it** — this bounds what "fixed" means for links already in the wild.

### Non-Goals

- **Do NOT add the agent marker here.** That is P1104. This spec makes preview text true about people; P1104 decides what an agent's preview says.
- **Do NOT redesign preview images, banners, or card layout.** Text truthfulness only.
- **Do NOT touch the in-app meta tags** except to answer question 5 about which pages need a handler.
- **Do NOT add new crawler routes** without deciding they are needed — each is a new surface to keep true.
- **Do NOT let this block P1104 or the first event.** They are independent; this one is not reachable at an event.

### Alternatives Considered

- **Fix the profile string only.** One line, and it leaves three unaudited handlers plus no rule for the next one. Rejected: the pattern is the defect, not the sentence.
- **Delete the crawler path and rely on in-app tags.** Crawlers do not execute the SPA, so previews would degrade to nothing for all four types. Rejected on outcome.
- **Server-render every page.** Solves it permanently and is a different product. Out of appetite.

### Rollback Strategy

Each handler is a pure function of a fetched row; reverting one is restoring its previous string. No data, no schema, no migration.

## A second untrue thing the same handler says (found 2026-08-20, verified)

The pledge claim above asserts something false about a **person**. There is a second defect in the
same file that asserts something false about an **agent**, and it has the same root shape: a value
that can be absent for two different reasons, collapsed into one.

`api/og.ts` decides whether to add the agent disclosure — *"a machine-generated reading, not the
person"* — from a single embedded lookup. `supabaseGet()` returns `null` on **any** non-OK
response (`api/og.ts:28`), and `agentOperator()` returns `null` on any missing or malformed embed
(`api/og.ts:80-90`). A permission error, a timeout, and a genuinely absent agent row all become
the same `null`.

That value is the **sole** gate on the agent branch — on `main` (read at `31a94e56`, re-confirmed unchanged at `5ce4c7c4`) the ternaries sit at
lines **107 and 110** (story title / description), **134** (point description), and **156 and 169**
(profile description / image). So when the lookup fails for any reason, the card renders the
**non-agent branch**: an agent account is presented to the crawler as an ordinary human, with the
disclosure removed from both title and description. The page itself stays correctly marked — only
the shared preview lies, which is exactly why this class of defect survives here.

**Provenance, corrected 2026-08-20.** When first written, this section cited lines 108/111/135/157
and said "verified by reading those lines". Those line numbers were read on
`feature/p1104-agents-visually-distinguishable`, which was then unmerged — the file on `main` had
no agent logic at all, so the section described code this spec could not reach. P1104 has since
merged (`2879fc0f`, spec at `features/done/2026-06-10/p1104*`) and the code is now on `main`, one
line off from the branch numbers after the merge. The finding was always correct; only its address
was wrong. Line numbers above re-read on `main` 2026-08-20.

**The exposure window is still open.** `origin/main` is at `d40c4582` (2026-08-18) and local `main`
is 93 commits ahead; `git branch -r --contains 2f55f559` returns empty, so no P1104 commit is on
any remote. Nothing described here is deployed. **This spec must land before the next deploy** —
once deployed, a preview shared during the window stays wrong in Facebook/LinkedIn/Slack caches
even after a fix.

**Why this belongs to P1108, not P1104 or P1124.** It is not agent-specific in mechanism — it is
the same "unchecked claim in a hand-written crawler description" pattern this spec exists to close,
and the same fail-open collapse. P1104 ships the agent marker but does not touch this behaviour;
P1124 (operator FK) makes the lookup *more* likely to fail, because a second foreign key to
`profiles` makes the existing embed ambiguous and an ambiguous embed fails at request time.

**The asymmetry that makes it a defect rather than a design choice.** The in-app path fails
**closed** on purpose: `src/app/data/agent-accounts-service.ts:24-29` throws rather than returning
an empty result, and its comment states that treating a failed fetch as "no agents" would render
every agent account as a person — *"the exact harm P1104 exists to prevent."* The crawler path does
precisely what that comment forbids.

**Adds to this spec's scope:**

- [ ] A failed or unreadable agent lookup never produces the ordinary-person preview — the handler
      fails loud instead, demonstrated by forcing the failure (epistemic gate 7), not by reasoning
- [ ] "No agent account exists" and "the agent lookup failed" are distinguishable in the handler

## Resolved Decisions

**Scope (`[FOUNDER DECISION]`) — answered 2026-08-20: option A.**

**IN this spec:**

1. The four live handlers audited for unbacked claims (`ogForEvent`, `ogForStory`, `ogForPoint`, `ogForProfile`).
2. The pledge claim fixed — `ogForProfile` must read `profiles.has_pledged` before asserting the oath.
3. The agent fail-open fixed — a failed lookup must never render the ordinary-person card.
4. The durable mechanism (step 4) that keeps handler five true.

**OUT — split to P1128:** the survey of pages that render the in-app SEO component and have no
crawler handler. Reason: it is a classification exercise, not a defect, and no command decides
"classified with a reason". Keeping it here would be the one line in this spec an unattended run
cannot finish.

**Ordering, decided with the above:**

- **P1108 before the next deploy.** Not deployed yet; see the exposure-window note above.
- **P1108 before P1124.** P1124 adds a second FK from `agent_accounts` to `profiles`, which makes
  the existing PostgREST embed ambiguous and fails at request time — i.e. it raises the rate at
  which this spec's fail-open would fire. P1124 already carries a `Depends on P1104` block and is
  unblocked as of 2026-08-20; it must not start before this lands.

**Not re-opened:** shipping P1104 carrying this defect was deliberate and is recorded in
`docs/decisions.md` via `7dcece79` ("Routed to P1108, which already exists for the same class of
defect in the same file"). This spec accepts that routing rather than revisiting it.

## Done-When

- [ ] Each of the four live handlers is listed with every factual claim its description makes, and the column backing that claim — or the claim removed
- [ ] `curl` with a crawler user-agent against a **non-pledger** profile returns a description that does not say they signed the pledge — output pasted
- [ ] `curl` with a crawler user-agent against a pledger profile still says so — output pasted, so the fix is not "delete the sentence"
- [ ] The mechanism from step 4 has been watched to fail on a deliberately false preview, with a non-zero exit or a visibly failing check — output pasted
- [ ] A crawler request for an agent profile whose agent lookup FAILS does not render the ordinary-person card — forced-failure output pasted
- [ ] `./scripts/goal-gate.sh p1108` exits 0, output pasted

## Phase 0 Triage (goalify)

Eight checkboxes exist: six under `## Done-When` and two under **Adds to this spec's scope**.
Classified before any contract was written, so the agent that wants to emit is not the sole grader
of whether it may.

| # | line (abbrev) | class | note |
|---|---|---|---|
| DW-1 | four handlers listed with every claim + backing column | MECHANICAL* | *shape-only: a command can assert the audit table exists with one row per handler; it cannot assert the list is exhaustive. `bindClaim` (Decision 4) is what gives this teeth at runtime. |
| DW-2 | `curl` crawler-UA vs **non-pledger** — no pledge claim | **BLOCKED** | needs a deployed target. See below. |
| DW-3 | `curl` crawler-UA vs pledger — claim still present | **BLOCKED** | needs a deployed target. See below. |
| DW-4 | mechanism watched to fail, non-zero exit | MECHANICAL | `bindClaim` unit tests make the fail path permanent, not a one-time demo. |
| DW-5 | agent lookup FAILS → not the ordinary-person card | **BLOCKED** | phrased as a crawler request; unit-testable via a stubbed non-OK fetch. |
| DW-6 | `goal-gate.sh p1108` exits 0 | MECHANICAL | self-referential; the finish line. |
| SA-1 | failed/unreadable lookup never yields ordinary-person preview | MECHANICAL | stubbed `{ok:false}` + malformed-embed cases. |
| SA-2 | "no agent" vs "lookup failed" distinguishable | MECHANICAL | Decision 3's `AgentLookup` union; asserted by type + test. |

**The blocker, stated plainly.** DW-2, DW-3 and DW-5 are written as `curl` against a live URL. An
unattended pre-deploy loop cannot produce a deployed target, and this is not a new discovery — the
shipped P1104 test file says so in its own header: *"these tests call the exported handler directly
with a stubbed fetch, which is the closest automated proxy to the Done-When `curl` step (that step
needs a deployed target and stays manual)."* As written, HUMAN-ONLY is 3/8 = 37.5%, above goalify's
25% refusal threshold. **This spec is not loopable until that is resolved** — resolved in
`## Resolved Decisions (goalify)`.

## Resolved Decisions (goalify)

Two questions, both answered by the founder on 2026-08-20. Append-only: nothing above this line was
rewritten.

**1. The three live-`curl` lines (DW-2, DW-3, DW-5) — "loop proves it in tests, founder curls after
deploy."**

The loop satisfies unit-level equivalents against a stubbed fetch, all CI-tier. The live `curl`
becomes **one new HUMAN-ONLY row, DW-7**, run once after deploy and before any link is shared.

*The honest bound, stated because the spec's own Risks section demands it:* the loop never proves
the **deployed** thing. It proves the code path. The spec says *"a preview bug cannot be seen by
looking"* and names `curl` as the only honest check — that check still has to happen, it just
happens after deploy and by a person. DW-7 is not a formality; it is the row that closes the
original defect. The alternative considered and rejected was giving the unattended loop real
Supabase credentials to curl a local server, which `scripts/goal-gate.sh` refuses on principle in
its own header (handing an unattended loop admin credentials on the database its tests assert
against, in a public repo).

**2. `esc()` hardening — folded INTO P1108**, against the recommendation to file it separately.

The founder's call. It gets contract row **ESC-1**: `esc()` must escape all five of `&`, `"`, `<`,
`>`, `'`. Consequence recorded honestly: this widens the pinned contract past `## Non-Goals`' "text
truthfulness only" boundary, and the finding is verified **not currently exploitable** — so ESC-1
is hardening, not a defect fix, and must not be described as closing a live vulnerability.

**Phase 2 (visual reference) — skipped, not deferred.** `feature_type: backend`. No rendered
surface, no screenshots, zero COMPARABLE rows. `goal-gate.sh` CHECK 5 therefore skips the
blind-reviewer requirement by its own logic, and no reviewer roster is recorded because none is
owed.

## Technical Architecture

### Technical Analysis

**Current code state.** `api/og.ts` (267 lines) is a single Vercel serverless function. `vercel.json:117-140` rewrites four bot-UA-gated paths to it (`/events/:slug`, `/story/:id`, `/point/:id`, `/p/:slug`); everything else falls through to the SPA. The function has four route handlers (`ogForEvent`, `ogForStory`, `ogForPoint`, `ogForProfile`), one shared fetcher (`supabaseGet`), one shared agent-embed reader (`agentOperator`), and an HTML builder (`ogHtml`). No try/catch exists anywhere around a route handler call — a thrown exception from `supabaseGet` today would surface as an unhandled rejection, not a controlled response, because `supabaseGet` currently never throws (see below).

**Claim audit — the four handlers, line-numbered against `api/og.ts` on `main` at `5ce4c7c4`:**

| Handler | Claim in the description | Backed by | Status |
|---|---|---|---|
| `ogForEvent` (:45-72) | date/location or raw `description` text | `datetime`, `location`, `description` — all in `select=title,description,datetime,location,banner_url` | **Clean.** Every word in the description is either a fetched column verbatim or a formatted date/location built from fetched columns. No synthesized assertion. |
| `ogForStory` (:92-117) | `"by {authorName}"` / `"read by {authorName}"`; excerpt or `"A story shared … by {authorName}"`; agent branch `"A machine-generated reading … operated by {operator}"` | `profiles.name` and `profiles!stories_author_id_fkey(name, agent_accounts(operator_name))` — both selected at :95 | **Clean**, but the agent claim currently trusts `agentOperator()`'s null-collapse (Problem 3 below). No pledge or trust claim is made here. |
| `ogForPoint` (:119-141) | `"Shared by {creatorName}"`; agent branch `"a machine-generated reading operated by {operator}"` | `profiles.name` and the same embed, selected at :122 | **Clean**, same caveat as `ogForStory`. |
| `ogForProfile` (:143-175) | **`"{name} signed the Clarity Pledge — a public commitment to clear communication."`** (both the with-role and without-role branches, :158-160); agent branch `"…operated by {operator}…"` | **Nothing.** `select=name,role,avatar_url,banner_url,agent_accounts(operator_name)` (:146) never selects `has_pledged`. This is the P1108 root cause. | **Defect.** Every non-agent profile is asserted to have signed, unconditionally. |

Confirms the spec's own claim (`## Problem`): `ogForProfile` is the sole defect among the four for the *pledge* claim; the other three are already claim-clean because P1104 (merged, `2879fc0f`) built them with the embed pattern from the start. Problem 3 (the agent fail-open) is orthogonal and touches all three handlers that read `agentOperator()` — story, point, profile.

**`profiles.has_pledged`** — `supabase/migrations/20250101_initial_schema.sql:16`: `has_pledged boolean not null default true` (comment: "false for /live registrations, true for /sign-pledge"). Column is non-nullable with a default, so a plain `select` always returns a boolean, never `null`/`undefined` — no extra null-handling needed once it's in the select list.

**The fail-open mechanism, precisely.** `supabaseGet()` (:16-31) does `if (!res.ok) return null;` — a 401/403/500/timeout-that-doesn't-throw on the Supabase REST call collapses to the exact same `null` as `res.ok && rows.length === 0` (a genuinely nonexistent row). Every `ogFor*` handler does `if (!row) return null;` right after, so a permission error and a bad slug produce the same downstream behavior — falling through to the router's generic site-level fallback. That part is not what the spec section "A second untrue thing" is about, though; the section is precise: it's the profile row **fetch succeeding** (the row exists, `name`/`role` come back) while `agentOperator(profile)` (:81-90) reads a missing-or-malformed `agent_accounts` sub-value as "no agent" — the SAME collapse, one level down, on the embedded relation instead of the top-level row. `agentOperator` returns `null` for: no `profile` at all, `embed` falsy, `embed` not an object, or `operator_name` not a non-empty string. All four of those cases are currently indistinguishable from "genuinely not an agent."

**Why a fully green suite already sits on top of this bug — epistemic gate 7b, a live instance.** `src/tests/p1104-og-agent-marker.test.ts`'s `stubFetch(row)` helper (:34-41) is hardcoded to `return { ok: true, json: async () => [row] } as unknown as Response;` — every one of its 10 tests, without exception, stubs a successful fetch. The helper is **structurally incapable** of emitting `ok: false`, a rejected/thrown fetch, or a malformed (non-object, non-array) embed value — those inputs are simply not expressible through its signature. That is exactly why P1108's Problem 3 defect survived a 10/10 green run: the suite modeled every shape `agentOperator` and `supabaseGet` were ever exercised against except the one that matters here. Per gate 7b, this means the new P1108 test file must not just add assertions on top of the same fixture — it must extend the fixture surface to emit the failure shapes the P1104 helper cannot, or the new tests would be as blind to this class as the old ones were.

**Reuse inventory (mandatory — every file that touches this surface):**

| File | What it is | Reuse decision |
|---|---|---|
| `api/og.ts` | The subject. All four handlers, `supabaseGet`, `agentOperator`, `ogHtml`, the `ROUTES` table, and `handler()`. | Modify in place — this is the fix target. |
| `src/tests/p1104-og-agent-marker.test.ts` | 10 existing tests exercising `api/og.ts` by importing the default handler and stubbing `global.fetch`. Every fixture stubs `ok: true` — none simulates a fetch failure. Two fixtures omit the `agent_accounts` key from the row entirely (relying on `undefined === falsy` in the old `agentOperator`). Its `stubFetch` helper is hardcoded to `ok: true` — see the gate-7b paragraph above. | **Reuse the PATTERN (`makeRes`/`makeReq`/`stubFetch` shape), do NOT modify or import from the file, and do NOT extend its `stubFetch` in place.** Argued: (1) it is P1104's shipped, reviewed test surface — closed work, not P1108's to edit; (2) `stubFetch`'s signature (`Record<string, unknown> → Response`) has no parameter for "fail this way," so making it fail-capable means changing its signature, which changes what all 10 existing call sites pass — that IS modifying the file, not reusing it; (3) a new, differently-named local helper in the P1108 file (same three-function shape, copied not imported) can express `ok: false`, a rejecting `fetch`, and a malformed embed value from the start, which is the extension gate 7b requires. New behavior (fail-loud on a bad HTTP response, the malformed-embed-shape case) is additive and does not change what P1104's 10 tests assert for the happy paths they cover — designed below so none of their fixtures cross into the new `'malformed'` branch. |
| `scripts/dev-agent-fixture.mjs` | Founder-run, TEST-DB-only script that creates one agent account + two humans via `create_or_reuse_agent_account`. Idempotent, has `--clean`. | **Not reused directly** — it seeds real Supabase rows for manual/`curl` verification (Done-When bullets 2-3 and 5 need a live non-pledger profile and a live pledger profile). The unit-level fail-loud tests (bullet 4-equivalent, and the pledge-gating tests) use `stubFetch`, matching the existing P1104 test's approach — no DB round trip, CI-tier. |
| `scripts/setup-verify-agent.ts` | Creates a permanent `/verify` browser-QA account. Unrelated surface (in-app auth), not reused. | N/A |
| `scripts/goal-gate.sh` | Generic per-spec gate; reads a `## Verification Contract` table from the spec (not written by `/architect` — that's `/goalify`'s job) and runs the `MECHANICAL` rows' commands, checking exit codes. Also globs `src/tests/${PN}-*.test.ts` as evidence a contract's MECHANICAL claims have a real artifact. | Not modified. Naming the new test file `src/tests/p1108-*.test.ts` satisfies its glob (`CHECK 1`) automatically. |
| `api/csp-report.ts`, `api/series-redirect.ts` | The other two Vercel functions. `csp-report.ts` swallows its own POST failures with a bare `catch {}` (deliberate — it must never surface to the reporting browser). `series-redirect.ts` wraps its whole body in `try { … } catch { redirect fallback }`. | **Precedent for "wrap the risky call, respond safely on catch," not for silently equating failure with absence.** Neither of these two files has an "assert a fact about a specific person" problem — they're the closest in-repo precedent for the *shape* of the fix (try/catch around a fetch, safe fallback response), not for the specific collapse this spec exists to close. |
| `src/app/data/agent-accounts-service.ts:20-35` | The in-app agent lookup. Throws (`if (error) throw error`) rather than returning an empty `Map` on failure, with an explicit comment: an empty-on-failure result "renders every agent account as a person — the exact harm P1104 exists to prevent." | **This is the design precedent Decision 2 below follows**, adapted for a crawler (one-shot request, no client-side retry/pending-state affordance — see Decision 2's trade-off). |
| `docs/technical/database.md` | Human-readable schema reference. | Read for `has_pledged`; no update needed (column already documented, not being added). |

No existing helper builds OG descriptions from claim+column pairs — the "shared builder" named as one option in the spec's step 4 does not exist yet. Decision 4 below designs it.

### Architecture Decisions

**Decision 1 — `ogForProfile` selects `has_pledged` and gates the pledge sentence on it.**

- **Chosen:** Add `has_pledged` to the `select=` list at `api/og.ts:146`. Replace the unconditional pledge sentence with a version gated on `row.has_pledged === true`. When `false`, the description drops to a claim-free sentence: `"{name} — {role}."` (role present) or `"{name} on ClarityPledge."` (no role) — describes the subject without asserting anything unverified, matching the "fails safe … asserts nothing about the subject" language in `## Solution` item 3.
- **Rationale:** This is the literal bug named in `## Problem`. `has_pledged` is `not null default true` (verified against the migration, not inferred), so once selected it is always a real boolean — no extra null-coalescing needed, unlike `has_pledged` reads elsewhere in the codebase that wrap it in `COALESCE(p.has_pledged, false)` for a different (aggregate/RPC) context where the column could come from a join.
- **Trade-off:** Every non-pledger's card gets measurably thinner copy — one clause disappears. Accepted: a thin true sentence beats a rich false one, and this is exactly what `## Solution` item 3 asks for.
- **Alternative rejected:** Keep the sentence but soften it ("may have signed the Clarity Pledge"). Rejected — a hedge is still an unbacked claim about probability, not a fact read from the row, and it reads worse than simply not saying it.

**Decision 2 — `supabaseGet` throws on a non-OK HTTP response; `handler()` catches and returns a subject-silent fallback, not a 500 and not the ordinary-person card.**

- **Chosen:** `supabaseGet` currently does `if (!res.ok) return null;`. Change it to `throw` a small `OgFetchError` on `!res.ok`, so a non-OK response is no longer indistinguishable from "row not found" (`res.ok && rows.length === 0`, which still legitimately returns `null` — a bad slug should keep falling through to the generic card, that behavior is correct and unchanged). The four `ogFor*` handlers are unchanged at their `if (!row) return null` lines — a real 404-shaped absence still works exactly as today. `handler()`'s route loop gets a `try { og = await route.handler(match); } catch (err) { … }` around the single `await route.handler(match)` call. On catch: `console.error` (server-side visibility, matching the existing `console.error` convention at :223), then respond `200` with a **new, dedicated "fetch failed" `OgData`** — generic title/description (no name, no pledge claim, no agent claim), but `url` set to the actual requested path (`${BASE_URL}${ogPath}`, not the sitewide `BASE_URL}` the existing route-miss fallback uses) so the card's canonical URL still matches what was shared. `Cache-Control` on this branch is **`public, s-maxage=60, stale-while-revalidate=0`** — a short bounded cache, NOT `no-store`. See `#### Reconciliation with the Security Review` below: this cell was changed from the architect's original `no-store` to resolve a direct contradiction with Security ⚠️2. The reasoning the architect gave still holds (a transient blip must not be baked in for the `s-maxage=3600` the success path uses), and 60s satisfies it — a degraded card clears within a minute instead of an hour — while also bounding origin load to roughly one request per URL per minute at the edge, which `no-store` did not.
- **Rationale, argued against the alternatives (per the architect brief's explicit ask):**
  - **500 (rejected as the default):** unambiguous "this failed" signal, cheap to test (`status !== 200`). But `series-redirect.ts` and `csp-report.ts` (the other two functions in this repo) both already choose "catch, respond safely" over "let it 500" — this repo's convention leans safe-response. More concretely for THIS surface: Facebook/LinkedIn/Slack cache aggressively and treat a 5xx response as "no preview available" for that URL until their next re-crawl (which can be days), so a transient Supabase blip during the exact moment someone shares a link could produce a **blank** share card that outlives the outage — worse than the status quo bug in one respect (total information loss vs. a wrong-but-plausible-looking one) while fixing it in another (no false claim). Given the spec's own framing — "a generic card asserts nothing but also loses the true information" — losing true information for a transient window is the smaller cost than a crawler-cached blank link.
  - **Generic card with no name at all (chosen):** never asserts anything about the subject — not their pledge status, not their agent status, not even their existence as distinct from a broken link — so it cannot be false. Costs specificity (the shared link's own title momentarily reads as if it were the homepage), recoverable on the next crawl once the transient failure clears (short cache).
  - **Omit the person, but keep a "this is a ClarityPledge profile" shell with just the URL slug in the title (not fetched, not verified):** considered and rejected — the slug itself is user-chosen and can already carry a name-like string (e.g., a slug matching someone's real name), so echoing it back is not meaningfully safer than the generic card and adds a second thing to keep truthful for no real benefit.
  - This is a real trade-off, not a clean win — recorded as an explicit choice rather than an implied default, per the brief's instruction.
- **Trade-off:** During any transient Supabase failure (not just permission/agent-embed related — this also now applies to event/story/point fetches, since the throw is in the shared `supabaseGet`), ALL four route types degrade to the generic card instead of their real content, for the duration of the failure. Accepted — this widens Decision 2's blast radius from "profile+agent" to "all four handlers," but that widening is itself the fix for Problem 1's general form (any handler's fetch failure was already silently "not found"-shaped; now it's uniformly fail-loud-then-safe-respond instead of silently wrong for whichever handler happens to read a truthy-looking null).
- **Alternative rejected:** Keep `supabaseGet` returning `null` on `!res.ok`, and instead add a SEPARATE lower-level check inside `ogForProfile` specifically for the agent embed (e.g., a second fetch just for `agent_accounts`). Rejected: this only fixes the profile handler (Non-Goal-adjacent scope creep the other direction — the spec explicitly wants this closed as a *pattern*, not a profile-only patch, echoing `## Alternatives Considered`'s rejection of "fix the profile string only"), and it would require a second round-trip per profile request the current single-query embed design deliberately avoids (P1104's own rationale for using the FK embed in the first place).

**Decision 3 — `agentOperator` returns a 3-way result (`no-agent` / `agent` / `malformed`) instead of collapsing to `null`; `malformed` throws (caught by Decision 2's same try/catch).**

- **Chosen:**
  ```ts
  type AgentLookup =
    | { kind: 'no-agent' }
    | { kind: 'agent'; operator: string }
    | { kind: 'malformed' };

  function agentOperator(profile: Record<string, unknown> | null): AgentLookup {
    if (!profile) return { kind: 'no-agent' };
    if (!('agent_accounts' in profile)) return { kind: 'no-agent' };
    const embed = profile.agent_accounts;
    if (embed === null) return { kind: 'no-agent' };
    const row = Array.isArray(embed) ? (embed.length > 0 ? embed[0] : null) : embed;
    if (row === null) return { kind: 'no-agent' };
    if (typeof row !== 'object') return { kind: 'malformed' };
    const name = (row as Record<string, unknown>).operator_name;
    if (typeof name !== 'string' || name.length === 0) return { kind: 'malformed' };
    return { kind: 'agent', operator: name };
  }
  ```
  Each of the three call sites (`ogForStory`, `ogForPoint`, `ogForProfile`) replaces `const operator = agentOperator(profile);` with a switch that throws on `'malformed'` (letting Decision 2's try/catch catch it and produce the subject-silent card) and otherwise reads `operator` from the `'agent'` case.
- **Rationale:** Directly answers the Done-When bullet "'No agent account exists' and 'the agent lookup failed' are distinguishable in the handler" — at the type level, not just by convention. `'no-agent'` covers: no profile, key genuinely absent, embed `null` (the real PostgREST shape for a to-one relation with no match), or an empty array (`[]`, the to-many shape with no match) — all of these are the **real, reachable, safe** absence shapes. `'malformed'` covers only shapes that a correctly-functioning PostgREST response would never actually produce (embed present as a non-null, non-array, non-object primitive; or an object missing `operator_name` as a string) — reserved for "something is wrong," not "no agent," and is the direct fix for the spec's literal complaint that "a permission error, a timeout, and a genuinely absent agent row all become the same null."
- **Why the key-absent case is `'no-agent'`, not `'malformed'`, despite the spec text citing "missing … embed" as part of the bug:** The dominant, real-world trigger for "the agent lookup failed" (a permission error, an ambiguous-embed 300/400 from P1124's future second FK, a timeout) now fails at the **whole-request** level and is caught by Decision 2 — `agentOperator` is never even reached with a partially-failed fetch, because `supabaseGet` throws before `ogForProfile` gets a row at all. A key-truly-absent-from-an-otherwise-successful-200-response is not a shape PostgREST produces for this embed (verified against P1104's own migration: the FK is `agent_accounts.profile_id → profiles.id`, a to-one embed, and PostgREST always emits the key for a requested to-one embed, `null` when unmatched). Treating "key absent" as `'malformed'` was considered and rejected because it would also reclassify the **existing** `p1104-og-agent-marker.test.ts` fixtures that omit the `agent_accounts` key from their stub rows (2 of the 10 tests) as failures, forcing a rewrite of P1104's already-shipped, already-reviewed test file for a shape distinction that has no real-world trigger. Reserving `'malformed'` for a genuinely-wrong-*type* (not merely an absent key) keeps the fix surgical and leaves that file untouched, per the reuse inventory above.
- **Trade-off:** `'malformed'` is now reachable only by a genuine runtime-shape bug (a future code change that puts something unexpected in `profile.agent_accounts`), not by any of today's real failure paths — which are already caught one level up by Decision 2. It is still worth keeping as defense-in-depth and because the Done-When bullet asks for the distinction explicitly, but it is not doing the primary work; Decision 2 is.
- **Alternative rejected:** Treat "key absent" as `'malformed'` too (maximally strict). Rejected for the test-churn reason above, and because it protects against a shape that cannot occur given P1104's schema — see `.claude/rules/epistemic.md` gate 3 ("test model claims against fixture, not prose"): the embed's to-one shape was verified against the migration, not assumed.

**Decision 4 — a claim/column binding, checked at module load, so handler five cannot repeat the mistake silently.**

- **Chosen:** A tiny exported function, checked once per claim at the top of `api/og.ts` (module scope, so it runs on every import — including every test run and the first real request after a deploy):
  ```ts
  /** Throws if `column` is not present in `selectedColumns` — a preview sentence
   *  asserting `claim` must be backed by a column this handler actually fetches.
   *  Runs at MODULE LOAD, not per-request: a handler that claims a column it
   *  forgot to select fails on the very first import, not in a code review. */
  function bindClaim(selectedColumns: readonly string[], column: string, claim: string): void {
    if (!selectedColumns.includes(column)) {
      throw new Error(
        `og.ts claim binding violated: "${claim}" requires column "${column}" to be ` +
        `selected, but only [${selectedColumns.join(', ')}] is fetched.`,
      );
    }
  }
  ```
  Each handler defines its select-column list as a named `const` array and calls `bindClaim` once per **synthesized** claim (a sentence asserting something beyond echoing a fetched field verbatim) right after the array, e.g.:
  ```ts
  const PROFILE_COLUMNS = ['name', 'role', 'avatar_url', 'banner_url', 'has_pledged', AGENT_EMBED] as const;
  bindClaim(PROFILE_COLUMNS, 'has_pledged', 'signed the Clarity Pledge');
  bindClaim(PROFILE_COLUMNS, AGENT_EMBED, 'is a machine-generated reading, operated by {operator}');
  ```
  `ogForStory` and `ogForPoint` get the same treatment for their agent-disclosure claim. `ogForEvent` gets **no** `bindClaim` calls, with a one-line comment explaining why: every word in its description is either a fetched column verbatim (`description`) or a formatted `datetime`/`location` — it makes no synthesized assertion, so there is nothing to bind.
- **Rationale:** This is "capable of being watched to FAIL" (epistemic gate 7) in the cheapest way available — no manifest file to keep in sync, no separate lint rule to write and maintain, no CI step beyond what already runs. Deleting a column from a `*_COLUMNS` array while its `bindClaim` call stays in place throws immediately, at import time — `npm test` (any test importing `api/og.ts`), a bare `npx tsx -e "import('./api/og.ts')"`, or the first prod request after a bad deploy, all fail loud the same way. This is deliberately NOT a TypeScript-only guarantee: `tsconfig.app.json:33` scopes to `include: ["src"]` and does not cover `api/`, so `npx tsc -p tsconfig.app.json` (the CI typecheck gate) never typechecks this file — a runtime assertion tied to the actual column-name strings is the only mechanism that can catch this drift for a directory the type-checker doesn't reach.
- **Demonstrating the fail path (Done-When bullet 4):** temporarily delete `'has_pledged'` from `PROFILE_COLUMNS`, run `npx vitest run src/tests/p1108-claim-binding.test.ts` (or any command that imports `api/og.ts`), paste the thrown error + non-zero exit, then restore the column. A permanent, CI-run regression test additionally unit-tests `bindClaim` in isolation (fabricated arrays, no fetch involved) so the fail path stays exercised on every run, not only once during this implementation — see Build Sequence.
- **Trade-off:** `bindClaim` only proves the column is *fetched* — it cannot prove the claim's boolean logic correctly reads that column (e.g., a handler could select `has_pledged` and then ignore it, always asserting the pledge anyway). That residual gap is closed by the ordinary unit tests in the new test file (Decision 1's positive/negative pledge assertions), not by this mechanism — `bindClaim` and the test file are complementary, not redundant: one guards "did you forget to fetch it," the other guards "did you use it correctly."
- **Alternative rejected:** A markdown/JSON "claim manifest" listing every handler's claims and required columns, checked by a script that diffs it against `ROUTES`. Rejected — it is a second source of truth that can drift from the code the same way the original bug drifted from `## Solution`'s own description of the problem (a list describing the code is exactly the shape of thing this spec exists to stop trusting). `bindClaim` inlines the assertion next to the claim it guards, so there is nothing to keep in sync.
- **Alternative rejected:** An ESLint rule flagging string literals matching claim-like phrases without a nearby conditional. Rejected — regex-over-source-text is fragile (a rephrased sentence evades it, a legitimate unrelated string trips it), and this repo's ESLint config (`eslint.config.js`) has no precedent for a custom rule of this shape; building one would be new infrastructure for a problem `bindClaim` solves with a five-line function.

### Security Review

Scope: the change P1108 proposes to `api/og.ts` — truthful preview descriptions (read `profiles.has_pledged` before claiming a pledge), and a fail-loud agent-lookup path instead of the current fail-open "renders as ordinary person." No LLM in this feature — AI Prompt Security section skipped per instructions.

**RLS Policies:**

- ✅ **`has_pledged` is already anon-readable — safe to add to the `ogForProfile` select.** `profiles` RLS is `USING (true)` (row-level, `supabase/migrations/20260602160000_p877_profiles_pii_column_grants.sql:387` `REVOKE SELECT ON public.profiles FROM anon, authenticated;` immediately followed by an explicit column grant). The column allowlist (`p877` migration, ~L389, reapplied identically at `supabase/migrations/20260605002428_p886_reapply_p877_column_gate.sql:38`) is:
  `id, name, role, avatar_color, is_verified, created_at, updated_at, slug, pledge_version, accepted_terms_version, has_pledged, avatar_url, avatar_provider, ears_count, verification_session_count, bio, banner_url, banner_generation_attempted, is_test_account, is_certifier`.
  `has_pledged` is on that list. `email`, `linkedin_url`, `reason` are the only three columns held back from anon/authenticated (per the P877 header comment, `supabase/migrations/20260602160000_p877_profiles_pii_column_grants.sql:5-14`), and none of those are touched by this spec. Adding `has_pledged` to the REST select in `api/og.ts` requires no RLS/grant change.
- ✅ **`has_pledged` is documented as not-PII and already publicly exposed elsewhere.** `supabase/migrations/20260727140000_p1010_members_has_pledged.sql:19,64`: *"has_pledged is NOT PII: it is already returned ungated by get_featured_profiles"* — and it's also returned unconditionally by `get_profile_by_id`/`get_profile_by_slug` (`supabase/migrations/20260602160000_p877_profiles_pii_column_grants.sql:71`). So exposing it per-slug in a link preview discloses nothing the profile page and existing public RPCs don't already disclose.
- ✅ **`agent_accounts(operator_name)` embed IS anon-readable today — this is NOT the cause of the fail-open.** The task asked me to check whether the embed being unreadable is itself the root cause; it is not. `supabase/migrations/20260819120000_p1104_agent_accounts.sql`:
  - `REVOKE ALL ON TABLE public.agent_accounts FROM PUBLIC, anon, authenticated;` (L36)
  - `GRANT SELECT (profile_id, operator_name) ON public.agent_accounts TO anon, authenticated;` (L46) — explicitly includes `operator_name`, the only column `AGENT_EMBED` (`api/og.ts:78`) selects.
  - `CREATE POLICY "agent_accounts are publicly readable" ON public.agent_accounts FOR SELECT USING (true);` (L48-50)
  - `subject_key` is deliberately withheld (not granted), but it is never selected by `api/og.ts`.
  Checked the two later P1104 migrations for anything that narrows this: `20260819140000_p1104_harden_agent_prefix_guard.sql` and `20260819160000_p1104_reserve_agent_name_at_the_table.sql` touch only `create_or_reuse_agent_account` and `DELETE/TRUNCATE` on `service_role` — no SELECT grant or policy change. **This changes the fix framing the spec should adopt:** the fail-open (`api/og.ts:80-90`, `agentOperator()` returning `null` on any missing/malformed embed, combined with `supabaseGet` at `api/og.ts:28` collapsing every non-OK response to `null`) is caused by conflating "the embed came back structurally empty" with "the request itself failed" (network error, timeout, or — per the spec's own P1124 note — an embed that becomes ambiguous once a second FK to `profiles` exists and PostgREST 300s). It is not an RLS/grant gap today. The fix belongs in `supabaseGet`/`agentOperator`'s error handling (distinguish HTTP status / ambiguous-embed error from "0 rows"), not in RLS.
- ✅ `events`, `stories`, `points` are all `USING (true)`-readable with no column-level REVOKE found (`supabase/migrations/20260118_create_events.sql:42`, `supabase/migrations/20260204_stories_points_calibration.sql:319,345`) — the existing embeds (`profiles!stories_author_id_fkey(name,agent_accounts(operator_name))` etc.) already work today; nothing about this spec's changes alters that surface.

**Authentication:**

- ✅ **Unauthenticated by design, and that's already priced in.** `/api/og` is reachable two ways: the crawler-UA rewrite (`vercel.json:117-137`, trivially spoofable — matching is a plain UA regex on `facebookexternalhit|Facebot|Twitterbot|TelegramBot|WhatsApp|LinkedInBot|Slackbot|Discordbot`) and directly at `/api/og?path=...` (acknowledged in-code, `api/og.ts:237-238`: *"the endpoint is directly addressable, so this is reachable without going through the bot-UA rewrite"*). Anyone can hit this handler for any profile/story/point/event without spoofing anything. This is pre-existing behavior, not introduced by P1108, but it means: **everything this handler renders must already be treated as public data**, which the RLS findings above confirm it is.
- ⚠️ **Fail-loud must not leak Supabase error detail to this same unauthenticated, spoofable caller — this is a real risk in the *not-yet-built* part of the spec.** Today, `supabaseGet` (`api/og.ts:16-31`) swallows every non-OK response into `null` with no logging and no body ever reaching the client (`if (!res.ok) return null;`, `api/og.ts:28`) — that's actually a good existing property: a Supabase error body (which can include table/column names, PostgREST hints) never reaches the caller. The spec's new requirement — *"a failed lookup must never render the ordinary-person card"* and *"fails loud instead"* (spec `## Done-When` and the "Adds to this spec's scope" block) — has no implementation yet (`/architect` owns the design). Whatever replaces the current `null`-collapse must preserve the same non-leak property: log the Supabase error server-side (`console.error`, matching the existing pattern at `api/og.ts:223`), but the HTTP response body sent to the anonymous caller should stay a generic/safe state (e.g., a neutral "preview unavailable" card, or an HTTP error with **no** Supabase error text, stack trace, table name, or PostgREST hint in the body). Flagging this now because it's the one part of the change where a naive implementation (`res.status(500).send(String(error))` or similar) would newly leak internal detail through a surface anyone can hit by setting a UA header.
- ⚠️ **Cache-Control on the new fail-loud path — verify before shipping.** Currently every response path (success at `api/og.ts:249` and the generic fallback at `api/og.ts:265`) sets `Cache-Control: public, s-maxage=3600, stale-while-revalidate=86400`, which bounds repeat-request cost at the CDN. If the new fail-loud path returns a non-200 status, confirm Vercel's edge still honors that Cache-Control header for it (some CDNs skip caching non-2xx by default) — otherwise a forced-failure condition (e.g., hammering an ambiguous-embed profile once P1124 lands) becomes an uncached, unbounded per-request DB hit that a spoofed-UA caller can drive at will. This is a Done-When item already ("forced-failure output pasted") but the DoS angle specifically (repeatability/cost, not just correctness of the failure) should be part of what's checked when that output is produced.

**Input Validation:**

- ✅ **PostgREST filter injection is not reachable via `slug`/`id`.** Every dynamic value goes through `encodeURIComponent()` before being interpolated into `slug=eq.${...}` / `id=eq.${...}` (`api/og.ts:48,95,122,146`). `encodeURIComponent` encodes `,` (blocks PostgREST's comma-separated multi-value / `or=(...)`-style syntax), `&`, `=`, `?`, `#`, `;`, `:`, `/`. It does **not** encode `.`, `*`, `'`, `!`, `~`, `(`, `)` — but none of those let an attacker escape the value position: the filter is always `column=eq.<value>`, so a `.` inside `<value>` doesn't start a new operator (the `eq.` prefix is fixed by the template literal, not attacker-controlled), and `*` has wildcard meaning only under `like`/`ilike`, not `eq`. Verified against the four call sites — all use `eq.` exclusively. No operator-injection path found.
- ✅ **The path-parsing guard (`api/og.ts:239-241`) is adequate for what it's used for.** `req.query.path` array-vs-string is handled (`Array.isArray(pathParam) ? pathParam[0] : pathParam`), and `ogPath` falls back to `/` unless it starts with `/` and has no `//`. `ogPath` is only matched against the fixed internal `ROUTES` regex array (`api/og.ts:205-213`) and never used to build a redirect/href, so the guard is sufficient for its role; it is not, and doesn't need to be, an open-redirect defense.
- ✅ **`operator_name` (free text, no format validation — P1124 will loosen this further) is escaped before reaching HTML, same as every other dynamic value.** Every `OgData` field flows through `esc()` in `ogHtml()` (`api/og.ts:179-181,186-197`) before insertion — including the `desc`/`title` strings that embed `operator` (`api/og.ts:107-111,134-136,156-160`).
- ⚠️ **`esc()` is incomplete but not currently exploitable, given how it's used — worth hardening anyway since this spec is touching this exact file and P1124 widens the operator_name input surface.** `esc()` (`api/og.ts:180-181`) replaces `&`, `"`, `<` but not `>` or `'`. Every dynamic value lands either (a) inside a **double-quoted** HTML attribute (`content="${esc(...)}"`, `og:title`/`og:description`/`og:image`/`twitter:*`/`description` — all double-quoted, `<` and `"` are the only two characters that matter for attribute breakout, both are escaped) or (b) inside the `<title>` text node, where only `<` matters (also escaped) since there's no unescaped `>` immediately preceded by attacker-controlled `<`. So today, with only double-quoted attributes and no single-quoted ones in this file, a bare `'` or `>` in `operator_name` cannot break attribute or tag structure. **Recommendation, not a blocker for this spec:** add `>` → `&gt;` and `'` → `&#39;` to `esc()` as defense-in-depth, since (a) it costs nothing, (b) `operator_name` is explicitly called out in the spec as "free text with nothing validating it (P1124 exists to fix that)", and (c) relying on "we only ever use double quotes" is a convention, not an invariant the file enforces — a future edit adding a single-quoted attribute would silently reintroduce a real breakout.
- ✅ No new query params or user-supplied structural input introduced by this spec's changes — `has_pledged` is a boolean read from the DB row, not user input.

**Data Protection:**

- ✅ **No PII beyond what's already public reaches the preview via this change.** `has_pledged` (not PII, see RLS section) and `operator_name` (already publicly disclosed by design — `create_or_reuse_agent_account` requires a non-empty operator_name specifically so an agent always has "an answerable human," `supabase/migrations/20260819120000_p1104_agent_accounts.sql:~115-120`) are the only fields this spec's scope touches. `email`, `linkedin_url`, `reason` remain REVOKEd from anon/authenticated and are not selected anywhere in `api/og.ts`.
- ✅ No new write path, no new table, no schema change in this spec's scope — confirmed no migration exists yet for P1108 (none of the four migrations found in this review belong to it; they're all P1104/P877/P886/P1010).
- **Unverified:** I did not find or read an existing automated test that exercises the crawler UA regex end-to-end (e.g., confirming `Slackbot` in a UA header actually reaches `api/og.ts` in prod routing) — the spec's own Done-When items require `curl` with a crawler UA against a live URL as the verification method, which is the correct approach; I have not run that curl myself as part of this static review.

---

**Summary for `/architect`:** The RLS/grants layer is not blocking this change — `has_pledged` and `agent_accounts(operator_name)` are both already anon-readable, so the pledge-claim fix and the fail-open fix are pure application-logic changes to `api/og.ts`, not schema/grant changes. The one place a real new risk can be introduced is the **fail-loud implementation itself**: because this endpoint is unauthenticated and trivially reachable by anyone forging a UA header, whatever replaces the current silent `null`-collapse must (1) not put raw Supabase/PostgREST error text in the HTTP response body, and (2) keep a Cache-Control policy on the failure path so a forced-failure condition can't be used to drive unbounded, uncached DB load.

**Provenance:** produced by the Security agent to `p1108-security-review.md` and merged from that file, not from its reply. The three load-bearing claims (`has_pledged` in the anon grant, `agent_accounts` SELECT granted to anon, `esc()` omitting `>`/`'`) were re-verified by command in the main session before merge — the agent's cited line numbers for the p1104 migration were off by ~10 (actual: 46 / 57 / 59-61); the substance held.

#### Reconciliation with the Security Review

Run by the main session at merge time, per `/architect`'s mandatory step: every ⚠️ finding in the
Security Review checked against the Architecture Decisions and Build Sequence for contradiction.
Three findings, three outcomes.

| ⚠️ | finding | verdict | action |
|---|---|---|---|
| 1 | Fail-loud must not leak Supabase/PostgREST error text to the unauthenticated caller | **consistent** | Decision 2 already specifies `console.error` server-side + a generic body with no name, no claim, no error text. No change. |
| 2 | Keep a cache policy on the failure path or a forced failure becomes an unbounded, uncached DB-hit path a spoofed-UA caller can drive | **CONTRADICTED** | Decision 2 originally specified `no-store`, which is the uncached case Security named. **Changed to `public, s-maxage=60, stale-while-revalidate=0`** in Decision 2, `#### Files to Modify`, `> **SUPERSEDED by `## Verification Contract` — the single test file below is split into four.**
> This section was written before the contract was measured. It proposed one file,
> `src/tests/p1108-og-truthful-claims.test.ts`, with per-row `-t` name filters. That was dropped
> after measuring that **vitest exits 0 when a `-t` filter matches nothing in a file that exists**
> (`--passWithNoTests=false` does not change it — checked against a control). One trivial test
> would then have turned every filtered contract row green having asserted nothing.
>
> The contract therefore runs **whole files**, whose absence is a measured exit 1. Write these four
> instead of the single file named below, keeping every behaviour this section specifies — nothing
> about the coverage changes, only how it is distributed:
>
> | file | covers |
> |---|---|
> | `src/tests/p1108-pledge-claim.test.ts` | DW-2 + DW-3 — non-pledger omits the pledge sentence, pledger still asserts it |
> | `src/tests/p1108-claim-binding.test.ts` | DW-4 — `bindClaim` throws when a claimed column is not in the select list |
> | `src/tests/p1108-fail-loud.test.ts` | DW-5 + SA-1 + SA-2 — `ok:false`, a rejecting fetch, and the (c)/(d) key-absent vs malformed-embed pair |
> | `src/tests/p1108-esc.test.ts` | ESC-1 — `esc()` escapes all five characters |
>
> All four keep the `p1108-` prefix `goal-gate.sh` CHECK 1 globs for, and all four are CI-tier.

#### Files to Create` (the test asserts the literal header), and Build Sequence step 2. |
| 3 | `esc()` omits `>` and `'` — defense-in-depth, explicitly "not a blocker" | **not addressed** | Deliberately left OUT of scope. See below. |

**On ⚠️2, why 60s and not `no-store` or 3600.** The architect's stated reason for `no-store` was
sound and is preserved: a transient blip must not be baked into the edge for the hour the success
path caches. But `no-store` achieves that by removing caching entirely, which is precisely the
amplification Security flagged — this endpoint is reachable by anyone who sets a user-agent header,
so an uncached failure path is a request-per-crawl DB hit under exactly the conditions (a Supabase
outage or permission error) where the database is already unhealthy. A short positive TTL satisfies
both: the degraded card self-clears within a minute, and origin load stays bounded at roughly one
request per URL per minute at the edge. Neither original position survives unchanged; this is a
third option, recorded as such.

**On ⚠️3, why `esc()` hardening is not in this spec.** Security itself labels it *"Recommendation,
not a blocker"* and verified it is **not currently exploitable** — every dynamic value lands in a
double-quoted attribute or the `<title>` text node, and `<` and `"` are both escaped. Adding it
here would be unrequested scope creep into a file this spec already touches, which CLAUDE.md's
Transparency Principle asks be raised rather than silently shipped. **Raised, not taken:** it is a
two-character change with a real rationale (`operator_name` is unvalidated free text and P1124
widens that surface; "we only ever use double quotes" is a convention this file does not enforce).
**ANSWERED 2026-08-20: fold into P1108.** The founder chose to include it against the
recommendation to split. It therefore carries a contract row (ESC-1) and is no longer optional.
Recorded as a deliberate widening of `## Non-Goals`' "text truthfulness only" — see
`## Resolved Decisions (goalify)`.

### Implementation Approach

**Worktree recommended:** this spec touches `api/og.ts` (serverless function boundary) and will run unattended through `/goalify` + `goal-gate.sh`, matching the worktree-required pattern for `.sh`/`api/`-touching unattended runs per `.claude/rules/git.md`.

**Contract shape for `/goalify`:** every check this design proposes is a command-and-exit-code (MECHANICAL) — four `npx vitest run src/tests/p1108-*.test.ts` invocations (see the superseding note above), the manual `bindClaim` demonstration, `./scripts/goal-gate.sh p1108` itself. This is a backend spec with no visual surface (`feature_type: backend`, no UI Contract), so no COMPARABLE row is proposed and `goal-gate.sh`'s blind-reviewer round should skip entirely, as it does whenever a contract has zero COMPARABLE rows. The two live-`curl` Done-When bullets are the only HUMAN-ONLY-shaped items in this design; `## Phase 0 Triage (goalify)` above already flags them as blocked for an unattended loop and that resolution belongs to `/goalify`, not to this section.

#### Files to Create

- ~~`src/tests/p1108-og-truthful-claims.test.ts`~~ **→ split into the four files named in the superseding note above.** Everything this bullet specifies still applies, distributed across them. New CI-tier test files (glob-matched by `goal-gate.sh` CHECK 1's `src/tests/${PN}-*.test.ts` pattern; the `p1108-` prefix is the exact string that glob requires). Reuses the P1104 file's `makeReq`/`makeRes`/`stubFetch` *shape* copied in as local, differently-named helpers (`ogReq`/`ogRes`/`stubOgFetch`) — not imported, per the reuse-inventory argument above — with `stubOgFetch` widened from the start to accept a mode, not just a row, so it can express what P1104's version structurally cannot (gate-7b paragraph above): `stubOgFetch({ ok: true, row })`, `stubOgFetch({ ok: false, status: 403 })`, `stubOgFetch({ reject: new Error('ETIMEDOUT') })`. Run with `npx vitest run src/tests/p1108-og-truthful-claims.test.ts` — no database, no browser, no deployed URL; this is the CI-tier half of the contract. Covers:
  - `ogForProfile` on a non-pledger (`has_pledged: false`) does not contain "Signed the Clarity Pledge" / "signed the Clarity Pledge" (Done-When bullet 2, unit-level companion to the required live `curl`).
  - `ogForProfile` on a pledger (`has_pledged: true`) still contains it (Done-When bullet 3, unit-level companion).
  - A non-OK `fetch` response (`stubOgFetch({ ok: false, status: 403 })`) for the profile route: response status is 200, body does NOT contain the fetched name string, does NOT contain "Signed the Clarity Pledge", `Cache-Control` header is `public, s-maxage=60, stale-while-revalidate=0` (assert the literal string — a regression to `no-store` or to the 3600 success-path value must fail this test). Same shape repeated for the event/story/point routes (Decision 2's blast radius is all four handlers, so all four get a case).
  - A **rejecting** `fetch` (`stubOgFetch({ reject: new Error('ETIMEDOUT') })`, modeling a real network timeout rather than an HTTP error response) for the profile route: same assertions as the non-OK case above — this is the shape neither `supabaseGet`'s old code nor the P1104 fixture could ever exercise, so it is the one most directly demonstrating the gate-7b gap is closed.
  - **The distinguishing pair, both in this file, asserted to diverge:** (c) a well-formed 200 response whose row has NO `agent_accounts` key at all (`stubOgFetch({ ok: true, row: { name: 'A Human', role: 'Engineer', avatar_url: null, banner_url: null, has_pledged: true } })`) → asserted to render the **normal human card** (contains "Signed the Clarity Pledge", no agent language, no fallback) — safe absence, per Decision 3. (d) a well-formed 200 response whose `agent_accounts` value is a malformed type (`agent_accounts: 42` — a shape PostgREST cannot actually produce, deliberately picked to exercise the `'malformed'` branch) → asserted to render the **subject-silent fallback**, not the human card and not the agent-disclosure card. Same input class (a 200, a real row) but the embed's shape alone must flip the outcome — that flip IS the Done-When "distinguishable in the handler" bullet, made observable in one test file instead of asserted only by code-reading.
  - `bindClaim` unit tests: throws when the column is absent from the array, does not throw when present — the permanent, CI-run demonstration of Decision 4's fail path (Done-When bullet 4's durable half; the manual delete-and-run is the one-time demonstration, pasted into the PR/ship notes).

#### Files to Modify

- `api/og.ts` — all four decisions land here:
  - `supabaseGet`: throw `OgFetchError` on `!res.ok` (Decision 2).
  - `agentOperator`: return the 3-way `AgentLookup` union instead of `string | null` (Decision 3); update its 3 call sites (`ogForStory`, `ogForPoint`, `ogForProfile`).
  - `ogForProfile`: add `has_pledged` to `select=`, gate the pledge sentence (Decision 1).
  - Add `bindClaim` + per-handler `*_COLUMNS` consts + call sites (Decision 4).
  - `handler()`: wrap `await route.handler(match)` in try/catch; add the subject-silent fallback `OgData` + the short-bounded `public, s-maxage=60, stale-while-revalidate=0` cache header on the catch path (Decision 2, as reconciled).
- `features/p1108_link_previews_say_true_things.md` — this file: `pipeline_ran`/`delivery_stage` already stamped above; no further edits from this agent.

#### Build Sequence

1. `agentOperator` → `AgentLookup` union (Decision 3) + update its 3 call sites to throw on `'malformed'`. Land first because Decision 2's catch handler needs something to catch, and this defines what "malformed" throws.
2. `supabaseGet` throw-on-`!res.ok` (Decision 2) + `handler()` try/catch + subject-silent fallback `OgData` + the short-bounded `s-maxage=60` header (NOT `no-store` — see Reconciliation). Run the existing `p1104-og-agent-marker.test.ts` suite here — all 10 must still pass unmodified (reuse-inventory precondition); if any fail, the design in Decision 3 has a gap, stop and re-diagnose before continuing.
3. `ogForProfile`: select `has_pledged`, gate the pledge sentence (Decision 1).
4. `bindClaim` + per-handler column consts + call sites, all four handlers (Decision 4).
5. Write the **four** test files named in the superseding note above (all six bullet groups, including the fetch-reject case and the (c)/(d) distinguishing pair, distributed across them). Run each of the four `npx vitest run src/tests/p1108-*.test.ts` commands the contract names — CI-tier, no DB, no browser — and paste each passing output.
6. Demonstrate Decision 4's fail path by hand once (delete a column, re-run the same command, paste the throw + non-zero exit code, restore) — Done-When bullet 4's non-durable half.
7. Live verification against a deployed URL (`curl` with a crawler UA) for Done-When bullets 2 and 3 specifically (the pledge claim) — needs `scripts/dev-agent-fixture.mjs` (or an existing test-DB profile) for a live non-pledger/pledger row; this step is local-tier, not CI-tier, per `goal-gate.sh`'s two-tier split. Done-When bullet 5 (agent lookup fails) is already covered CI-tier by step 5's (d) case above — a live forced-failure curl is not required to satisfy it, only the phrasing of the Done-When line invites reading it that way.
8. `./scripts/goal-gate.sh p1108` — requires `/goalify` to have run first and written the `## Verification Contract` section this spec does not yet have.

## Verification Contract

Seven rows. One HUMAN-ONLY (14%), under goalify's 25% refusal threshold. Zero COMPARABLE — a
backend surface with no rendered output, so `goal-gate.sh` CHECK 5 skips the blind-reviewer
requirement by its own logic and no reviewer roster is owed.

**Two parser facts this table is built around, both verified by reading and running, not assumed:**

1. `goal-gate.sh:122-130` parses each row with `awk -F'|'` and takes the command from field 4. **No
   command here contains a `|`** — a pipe would silently shift the fields and run the wrong string.
2. `contract_hash()` (`goal-gate.sh:110`) hashes **only** the `## Verification Contract` body. The
   loop may therefore append `## Claim Audit` to this spec without breaking the pin.

**Why no `-t` filters — a vacuity hole found by measurement.** The first draft of this contract gave
each row its own `npx vitest ... -t "<name>"` filter. Measured: when the target file is **absent**
vitest exits 1 (good), but when the file **exists and the filter matches nothing, vitest exits 0**.
`--passWithNoTests=false` does not change this — it governs missing files only, confirmed against a
control. So once the loop created the file with a single trivial test, all seven filtered rows would
have gone green having asserted nothing. Every MECHANICAL row below therefore runs a **whole file**,
whose absence is a measured non-zero exit.

| line | class | decided by | artifact |
|---|---|---|---|
| DW-1 every claim of the four handlers listed with its backing column | MECHANICAL | `test "$(grep -c '^- \*\*ogFor' features/p1108_link_previews_say_true_things.md)" -ge 4` | `## Claim Audit` in this spec |
| DW-2 + DW-3 non-pledger card omits the pledge sentence, pledger card still asserts it | MECHANICAL | `npx vitest run src/tests/p1108-pledge-claim.test.ts` | src/tests/p1108-pledge-claim.test.ts |
| DW-4 the claim-binding mechanism has been watched to fail | MECHANICAL | `npx vitest run src/tests/p1108-claim-binding.test.ts` | src/tests/p1108-claim-binding.test.ts |
| DW-5 + SA-1 + SA-2 a failed lookup yields the subject-silent card with a bounded cache header, and no-agent stays distinguishable from lookup-failed | MECHANICAL | `npx vitest run src/tests/p1108-fail-loud.test.ts` | src/tests/p1108-fail-loud.test.ts |
| ESC-1 esc() escapes all five of ampersand, double-quote, less-than, greater-than, apostrophe | MECHANICAL | `npx vitest run src/tests/p1108-esc.test.ts` | src/tests/p1108-esc.test.ts |
| REG-1 the shipped P1104 suite still passes unmodified | MECHANICAL | `npx vitest run src/tests/p1104-og-agent-marker.test.ts` | src/tests/p1104-og-agent-marker.test.ts |
| DW-7 live curl with a crawler user-agent against a deployed non-pledger, pledger and agent URL | HUMAN-ONLY | founder, POST-DEPLOY | — |

**DW-6 is deliberately not a row.** `./scripts/goal-gate.sh p1108 exits 0` is the finish line itself;
a row invoking the gate from inside the gate would recurse. It is satisfied when the gate exits 0,
not by a check the gate runs on itself.

**Required `## Claim Audit` format.** DW-1 counts list items, not table rows, because a table row
starts with `|` and would break the parser above. Write one line per handler beginning exactly
`- **ogForEvent**`, `- **ogForStory**`, `- **ogForPoint**`, `- **ogForProfile**`, each naming that
handler's factual claims and the column backing each.

### Residual gaps in this contract — stated, not papered over

- **Row granularity is coarser than Done-When granularity.** Rows 2 and 4 each cover more than one
  checkbox, because the decider is a whole file. A file containing only one of its two required
  assertions passes the gate. Nothing mechanical closes this; it is a review obligation at ship.
- **DW-1's command is shape-only.** It counts four list items. It cannot decide whether the audit is
  *exhaustive* — only that four handlers were written down. `bindClaim` (Decision 4) is what gives
  the claim/column binding runtime teeth; DW-1 only proves the audit was written.
- **Nothing here proves the deployed artifact.** Every MECHANICAL row runs against a stubbed `fetch`
  with no database and no browser. A fully green gate is not evidence that any real crawler sees a
  true preview — that is DW-7's job, it is HUMAN-ONLY, and it happens after deploy.
- **The gate stops on a pasted exit code, not on the exit code.** `goal-gate.sh`'s own header says
  so. Forgery and decay are caught at the merge boundary by CI — and CI runs on `origin`, which is
  93 commits behind. Until this repo is pushed, the CI half of that guarantee is not connected.

## Phase 4 — red-first evidence (run 2026-08-20, before the loop existed)

Every MECHANICAL command run through `bash -o pipefail -c`, the same way `goal-gate.sh:196` runs it.

```
exit=1   test "$(grep -c '^- \*\*ogFor' features/p1108_link_previews_say_true_things.md)" -ge 4
exit=1   npx vitest run src/tests/p1108-pledge-claim.test.ts
exit=1   npx vitest run src/tests/p1108-claim-binding.test.ts
exit=1   npx vitest run src/tests/p1108-fail-loud.test.ts
exit=1   npx vitest run src/tests/p1108-esc.test.ts
exit=0   npx vitest run src/tests/p1104-og-agent-marker.test.ts
```

Five of six fail now, which is the point: none of them can pass until the work is actually done.

**REG-1 is flagged `unproven` by this pass, honestly.** It exits 0 today because it is the
regression baseline — the shipped P1104 suite, 10 tests, currently green. Its fail path was NOT
exercised here, because doing so would mean breaking `api/og.ts` on main. It is a real check (it
fails the moment P1104's behaviour regresses) but this pass did not watch it fail, and per goalify's
own rule that is recorded rather than assumed.

## Artifacts the gate requires beyond the code (repo facts, discovered by running it)

Running `./scripts/goal-gate.sh p1108 --tier ci` on the empty branch surfaced three required
artifacts that the Verification Contract does not itself name. Recorded here so the run does not
discover them at turn 25:

- `features/uat/p1108.md` — CHECK 4. Every scorecard row must carry a result; the gate's words are
  *"a contract with no scorecard cannot decay, it never existed."*
- `features/verification/p1108/assumptions.md` — CHECK 6. Every call made alone. There is no
  escalation clause: decide, log, continue. The log is the price of not being interrupted.
- `features/verification/p1108/feedback.md` — CHECK 6. **Two numbers, never one**: `corrections
  given` and `turns consumed`. The gate greps for both strings and fails if either is absent —
  quality bought with runaway spend reads as success on a one-axis scoreboard.

CHECK 5 (blind-reviewer rounds) **skipped itself** on this run — confirmed empirically, not
predicted: the contract has zero COMPARABLE rows, so no reviewer is owed and none should be
manufactured.
