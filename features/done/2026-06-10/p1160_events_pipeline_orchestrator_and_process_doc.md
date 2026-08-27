---
status: all-done
type: task
rank: 71
workstream: infrastructure
created_date: '2026-08-26'
tags: [events, skills, orchestrator, process-docs]
pipeline_ran: [create-spec, dev]
drafted_by: opus
exec_model: sonnet
exec_effort: medium
driver: anomaly
completed_at: 2026-08-27
---

# P1160: Events pipeline has no orchestrator — the group-chat leg gets silently dropped

## Problem

**Situation:** Event promotion runs as two independent skill invocations with no handoff between
them: `/slava:events:promote-all` (five platforms) and `/slava:events:promote-groups` (WhatsApp/
Telegram community chats). Each keeps its own resume cache — `~/.private/event-state/<slug>.json`
and `~/.private/event-state/<slug>.groups.json` respectively (verified at `promote-all.md:55`,
`promote-groups.md:165`).

**Complication:** Because neither cache knows the other exists, a run that completes one leg and
abandons the other leaves no signal anywhere. On **July 5** groups went out and the platform leg
was silently abandoned — undetected for seven weeks, surfaced only when this session asked "how
did we promote last time." On **Aug 30** the same shape nearly repeated: three of five platforms
hit auth/consent walls mid-run (todo.today logged out, Eventbrite CAPTCHA + OAuth) instead of
being caught together in a preflight, and a stale **July 5** blurb sat in the shared group config
with zero unresolved `{placeholder}` tokens — the existing freshness guard would have passed it
and sent it to nine chats.

**Question:** Build a `/video-publish`-shaped orchestrator over the existing event-lifecycle
skills, with one combined status/resume view, and rewrite `docs/events/process.md` into the role
`docs/video-process.md` plays.

> Founder framing, verbatim: *"I think there is one skill that promotes... let's do 1 first, check
> and confirm."*

## Appetite

**Blast radius:** medium-high — shared `.claude/commands/` files that every future event run
loads; a wrong edit to a promotion skill sends wrong copy to live community groups. **Reversibility:**
high — all changes are markdown skill/doc files, `git revert`-able, no data migration.
**Decision density:** low — the three structural calls were already made with the founder (see
Alternatives Considered). Remaining open items are listed under Open Questions.

## Invariants

Harvested from `docs/decisions.md` — these predate this spec and must survive it.

- **The orchestrator never publishes.** *"Every Publish/Create click is the user's, never the
  skill's — the wrapper never publishes."* (2026-05-12 [process]) Applies to the new orchestrator
  exactly as it applies to `promote-all`.
- **`<slug>.groups.json` and `<slug>.json` stay separate and are never clobbered by each other**
  (`promote-groups.md:165`). A combined *view* over both is in scope; a combined *file that
  replaces* either is not.
- **The orchestrator sequences existing skills; it never reimplements them.** Same rule
  `docs/video-process.md` states for `/video-publish`: fix a weak result in the owning stage
  skill, never in the orchestrator.
- **Sibling skills, not flags** (2026-05-12) — `promote-facebook` (groups) and
  `promote-facebook-personal` stay separate files. Nothing in this spec merges skills.

## Solution

Three deliverables.

**1. A new orchestrator skill** at `.claude/commands/slava/events/` (final filename decided at
implementation time — a naming call, not a design one), modeled on `/video-publish`. It sequences
four stages over the existing skills:

```
CREATE                      ASSETS          PROMOTE (platforms)     PROMOTE (groups)     OPTIONAL
──────                      ──────          ───────────────────     ────────────────     ────────
Kickoff gate — which        /slava:         /slava:events:          /slava:events:       promote-dm
creation path?              content:        promote-all             promote-groups       promote-whatsapp
 · publish-event         →  gen-poster   →  (todo.today, FB      →  (WhatsApp /       →  promote-email
 · publish-run (AllTrails)                   personal, Luma,         Telegram chats)      — NOT auto-chained;
 · re-create-event (clone)                   Eventbrite, Sola)                            separate opt-in
```

**Human gates — four, and no more.** Video's principle is "only two, everything else autonomous";
events genuinely need more because the platform browser-clicks cannot be automated (confirmed live
this session):

1. **Kickoff** — which creation path, plus that skill's founder-only inputs.
2. **One combined copy review** — resolve *all* copy up front (platform blurb + every language's
   group blurb) and show it on one screen before any send touches anything. This is the shape the
   founder converged on by hand this session; encode it as the default.
   **This gate is NOT free, contrary to an earlier draft of this spec.** `promote-all.md:103-131`
   (step 3b) already resolves the canonical promo blurb and `:160-166` already stops for its own
   review (*"Here's the blurb from the series doc — paste it or reply with an edited version"*).
   The combined review must therefore **pass the approved blurb into `promote-all` and suppress
   step 3b's own stop**, or the orchestrator adds a duplicate approval turn. Implementing gate 2
   without editing step 3b is a defect, not a shortcut.
3. **Per-platform browser gates** — *inherited*, not added. The orchestrator wraps `promote-all`'s
   existing per-platform stops and adds zero approval turns around them.
4. **Group-send blast-radius confirmation** — already in `promote-groups` (type the exact count
   for 6+ groups). Unchanged.

**Resume behavior — this is the actual fix, and it must NOT be built by inference.**

Verified asymmetry between the two existing caches:
- `promote-all.md:53-70` initializes a **fixed five-key `status` map, all `pending`**, at step 2 —
  before any platform runs. Done-vs-pending is genuinely derivable from that file.
- `promote-groups.md:165` creates `{slug}.groups.json` **inside step 6, the per-group send**,
  after the blast-radius confirmation. There is no initialization step.

So an abandoned groups leg leaves **no file at all** — byte-identical to an event that legitimately
never had a groups leg. An orchestrator that merely "reads both state files" therefore **cannot
detect the July 5 failure**, which is the entire reason this spec exists.

**Requirement:** the orchestrator writes its own run record **at kickoff**, declaring which stages
are *in scope for this run*, before any stage executes. Absence of a stage result is then evidence
of abandonment rather than ambiguity. Reading the two existing caches supplies per-item detail; the
kickoff record supplies intent. This settles former Open Question 2 — the run record is a third
file in `~/.private/event-state/`, never a field appended to either existing file.

**2. Six mechanical fixes to the owning stage skills** (per the "fix it in the stage skill" rule):

| Fix | File(s) | Why |
|---|---|---|
| Auth/session preflight across all five platforms as step 1, before copy review | `promote-all.md` | Aug 30: 3 of 5 platforms hit walls mid-run instead of together at the start |
| Write→wait→re-read after any date/time write or file upload | `promote-luma.md`, `promote-facebook-personal.md`, `promote-todo-today.md` | Luma's date silently reverted after a screenshot showed it correct; Facebook's start time resets on every unrelated field edit (undocumented until now) |
| Staleness check on stored group blurbs — **assert as a token test, not a judgment call**: the resolved blurb MUST contain the current event's date string (and trail/venue token where the series defines one); fail closed if absent | `promote-groups.md`, `.private/event-channels.json` (schema note only) | The July 5 text had zero unresolved tokens and would have passed. Phrased as "verify it names the current event" this is an LLM judgment dressed as a gate and the Done-When could never be honestly satisfied; phrased as a substring assertion it is deterministic and testable. `{slug}.groups.json` already carries `blurb_hash` (`promote-groups.md:165` schema) to build on. |
| Verify-by-content after any batch send; re-verify each item individually before retrying after a connection error — never resend blind | `promote-groups.md` | Content search beat timestamp checks: one busy chat's timestamp moved from unrelated traffic. Include the search-index-lag fallback (`get_chat` last-activity) |
| Self-chat probe mandatory on **any** style/tone revision mid-run, not only once at the top | `promote-groups.md` | Three copy-style iterations went straight into three different live community groups today |
| ~~Remove the manual-drag fallback~~ — **DROPPED, already correct** | — | Verified: `promote-facebook-personal.md:77` and `promote-todo-today.md:60` already state it as a conditional (*"Fallback if `file_upload` returns 'Not allowed'"*), not a primary instruction; `promote-luma.md:71` has no drag fallback at all. The source plan's claim was wrong. No edit needed. |

**3. Rewritten `docs/events/process.md`** — same path, same role `docs/video-process.md` plays.
Current file is 156 lines written 2026-02-23, the day the first event shipped. Verified defects:
it contains **7 Ko Phangan references** while the operation is in Chiang Mai; it names **three
skills that do not exist** (`/publish-discussion`, `/publish-live`, `/publish-workshop`); it
documents **5 of the 14** files under `.claude/commands/slava/events/`; and it never mentions
group-chat posting at all — the exact channel that keeps getting dropped.

Required sections, mirroring `video-process.md`:
- ASCII pipeline diagram of the four stages.
- **Creation decision table** — the three creation skills, what input each takes, when to use
  which. Answers the confusion raised live this session.
- **"The orchestrator"** section — the new skill, its four gates, its resume behavior.
- **Skills reference table** — one row per skill for all 14 current files, invoke name, what it
  does. Group promotion gets a real entry; it has none today.
- No hardcoded city anywhere. `(future)`/`TBD` markers on event types with no skill yet
  (Discussion, Live session, Workshop) stay — that part is accurate, not stale.

Ko Phangan also appears in 8 other files (`promote-facebook.md` ×3, `promote-eventbrite.md` ×2,
`promote-sola.md` ×2, `promote-luma.md`, `promote-facebook-personal.md`, `promote-todo-today.md`,
`content/gen-poster.md`, `content/draft-email.md`) plus `docs/progress.md` and
`docs/facilitator-guide.md`. Those are **out of scope** — see Non-Goals.

## Risks / Non-Goals

| Risk | Label | Note |
|---|---|---|
| Removing the manual-drag cover-photo fallback breaks Facebook uploads | **MITIGATE** | A 2026-05-12 ruling records `file_upload` returning "Not allowed" on Facebook (CSP killed the remote-fetch path). Three successes in one session do not refute one recorded failure. Keep the fallback, demote it to a one-line "if `file_upload` errors" branch instead of a primary instruction — do not delete it. |
| Orchestrator's combined state clobbers `promote-all`'s or `promote-groups`' cache | MITIGATE | Read-only over both existing files; the orchestrator writes only its own run record. Named as an Invariant. |
| Orchestrator drifts into reimplementing stage logic over time | MITIGATE | State the "sequences, never reimplements" rule in the skill body itself, as `video-process.md` does. |
| A staleness check that greps the event date produces false positives on evergreen blurbs | ACCEPT | Failure mode is a spurious confirmation prompt, not a wrong send. Tolerable direction to fail in. |
| Ko Phangan references remain in 7 skill files after this ships | ACCEPT | CONFIRMED cosmetic — venue examples (`promote-facebook-personal.md:69`, `promote-todo-today.md:130`) and timezone notes that already name both cities (`promote-luma.md:112` *"Ko Phangan / Chiang Mai"*, `promote-sola.md:103`, `promote-eventbrite.md:80` *"CNX / Ko Phangan"*). None reach published copy. |
| **`promote-facebook.md:66-68` defaults to posting into two Koh Phangan groups** | **MITIGATE — was wrongly labelled ACCEPT** | CONFIRMED, and it is live: the file reads *"Founder defaults (config absent): Koh Phangan expats community — 8.4K members … Digital Nomads Koh Phangan"*, and `.private/event-operator.json` **does not exist** (`ls` → No such file). This is not a venue example — it is a wrong-audience send for every Chiang Mai event. Fix in this spec: either populate `facebook_groups` in the operator config or replace the hardcoded defaults with a fail-closed stop. |
| The orchestrator adds a wrapper layer over skills the founder also runs standalone | ACCEPT | Every stage skill stays independently invocable — the orchestrator is additive. |

**Non-Goals**
- Do NOT merge `publish-event`, `publish-run`, `re-create-event`. They take genuinely different
  inputs; the fix is a decision table, not a code consolidation. (Founder decision.)
- Do NOT modify `promote-eventbrite.md`, `promote-sola.md`, `promote-whatsapp.md`,
  `promote-email.md`, `promote-dm.md`, or the three creation skills.
- `promote-facebook.md` is **narrowly in scope for one change only** — the wrong-audience default
  group list (see Risks). Do NOT touch anything else in that file.
- Do NOT do a repo-wide Ko Phangan → Chiang Mai sweep. `docs/events/process.md` only.
- Do NOT change `.private/event-channels.json` **data** — freshness is a runtime check, not a
  stored field. Schema note only.
- Do NOT make the orchestrator publish anything. It never clicks Publish/Create.
- Do NOT auto-chain the optional DM/WhatsApp/email stage.

## Alternatives Considered

- **Patch only the platform→group handoff, not the full pipeline.** Rejected by the founder:
  scope is the full pipeline, video-style. A handoff patch fixes the July 5 symptom and leaves the
  create and asset stages just as unsequenced.
- **Merge the three creation skills into one with a mode flag.** Rejected — they take different
  inputs (a form, an AllTrails URL, a prior event to clone), and the 2026-05-12 "sibling skills,
  not flags" ruling covers exactly this shape. Documentation fix instead.
- **Build a generic process-doc runner (a skill that reads and executes any `*-process.md`).**
  Rejected — the pattern is implemented exactly once in this repo (`/video-publish` +
  `docs/video-process.md`); the software-delivery pipeline deliberately does *not* work this way
  (no skill reads `software-delivery-process.md`; routing lives inside `/pick-flow`). Generalizing
  from one instance is premature.
- **Write a new doc instead of rewriting `docs/events/process.md`.** Rejected by the founder —
  rewrite in place, same path and role as `docs/video-process.md`. A second doc would leave the
  stale one to be found first.

## Rollback Strategy

All changes are markdown under `.claude/commands/slava/events/` and `docs/events/`. `git revert`
of the ship commit restores every stage skill and the process doc. The new orchestrator file is
purely additive — deleting it leaves all existing skills independently invocable exactly as they
are today. No state-file format change, so `~/.private/event-state/*.json` written before or after
the change stays readable by both versions.

## Done-When

- [x] The orchestrator skill file exists and its body names each stage skill it sequences, plus
      the "sequences, never reimplements" rule verbatim
- [x] `grep -c "hangan" docs/events/process.md` returns 0
- [x] Every one of the 14 files under `.claude/commands/slava/events/` is named in the rewritten
      `docs/events/process.md`, verified by a loop over `ls` rather than by reading
- [x] `/publish-discussion`, `/publish-live`, `/publish-workshop` no longer appear as if they exist
      (they appear only as `(future)` / `TBD (does not exist yet)` markers)
- [x] `promote-facebook.md` no longer defaults to Koh Phangan groups: either
      `.private/event-operator.json` carries a `facebook_groups` array, or the skill stops and asks
      (config remains absent on this machine; the skill now fails closed and asks instead of
      defaulting)
- [x] A `docs/decisions.md` entry records the call to build an orchestrator for events and not for
      software-delivery-style work (pre-existing entry, 2026-08-26 "Events gets a
      /video-publish-style orchestrator...")

## Open Questions

1. Final skill name — `/slava:events:run`? `/slava:events:publish-and-promote`? Working name in
   the plan was `run`; not settled.
2. ~~Where does the orchestrator's own run record live?~~ **RESOLVED by the adversarial pass** —
   a third file in `~/.private/event-state/`, written at kickoff. See Solution. Neither existing
   file is appended to.
3. Does the operator config get a populated `facebook_groups` for Chiang Mai, or does
   `promote-facebook.md` fail closed with no defaults? [FOUNDER DECISION: which groups, if any,
   should a Chiang Mai event be posted into?]

## Related

- P901 `second_operator_event_promotion` (done) — prior work on the promotion leg
- P1134 `no_channel_attribution_on_outbound_links` (done)
- `docs/decisions.md` 2026-05-12 [process] — the fan-out ruling this spec inherits from
- Source plan: `~/.claude/plans/right-so-i-think-happy-zebra.md`

## Deferred — live-run checks moved to P1172

Six criteria on this spec each carried an honest `UNVERIFIED — requires a live run` note written
during implementation. They describe a **future event-promotion run**, not the artifact shipped
here (the orchestrator skill, the six stage-skill fixes, the rewritten process doc — all evidenced
above). They cannot be checked at ship time. Moved verbatim to **P1172**, which names its trigger
(the next real event promotion run). Moving them does not discharge them — they are still owed.
