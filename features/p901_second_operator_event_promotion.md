---
status: week
type: task
rank: 1000790.0
created_date: '2026-06-05'
tags: [events, skills, delegation, promotion]
delivery_stage: uat
pipeline_ran: [create-spec, challenge-prd]
---

# P901: Second-Operator Event Promotion

## Problem

**Situation:** Event publishing on claritypledge.com needs no special access — `/events` is a live prod route with create/edit forms, and RLS already lets any authenticated user create events (host-scoped edit/delete). Banners auto-generate via the shared `generate-banner` edge function. The promotion skills (`.claude/commands/slava/events/promote-*.md`, 7 files) fan an event out to Luma, Eventbrite, Sola, todo.today, and Facebook.

**Complication:** The promote skills are structurally single-operator: they read prod via `PROD_SUPABASE_SERVICE_ROLE_KEY` (over-privileged — the data they read is public) and hardcode identity checks ("logged in as Vyacheslav Ladischenski"). A second operator cannot run them without receiving a full prod-admin credential and the founder's platform sessions — both unacceptable.

**Question:** How do the promote skills become operator-independent so a second operator (own machine, own ClarityPledge account, own platform accounts, zero shared secrets) can run the full publish+promote cycle?

## Motivation

- **Founder time:** event publishing + promotion currently consumes founder cycles that should go to product work.
- **Operator-independence proof:** first test that a ClarityPledge agent workflow can be run by someone other than the founder, supported by their own agent. If it works, the event motion can scale beyond one person.
- **Falsifiable hypothesis (learning-speed model):** a second operator completes a publish+promote cycle solo within 3 cycles, with ≤2 founder questions per cycle. Failure means the delivery method (docs, access, skill ergonomics) needs changing.

## Appetite

Medium blast radius: 7 skill files shared with the founder's own weekly flow — a bad edit breaks existing promotion. No `src/`, no DB, no infra changes. High reversibility: markdown-only, single `git revert`. Low decision density: identity model (own accounts), access model (anon-key reads), and config location (`.private/`) are already decided.

## Solution

1. **Operator config, local-only:** `.private/event-operator.json` (gitignored) with `operator_name` and `platforms` (subset of: luma, eventbrite, sola, todo-today, facebook, facebook-personal). Skills read it at runtime; **absent → current founder behavior unchanged** (all platforms, founder identity). Repo documents the shape only — each operator creates their own.
2. **De-privilege reads:** replace `PROD_SUPABASE_SERVICE_ROLE_KEY` curls in all promote skills with the same REST queries using the prod **anon key** (public by design — it ships in the deployed JS bundle; RLS enforces safety; events and banners are public-read). Key delivery: inline in the skill files as fallback, overridden by `VITE_SUPABASE_ANON_KEY` from `.env.local` when present. Also replace the `supabase projects api-keys` CLI calls in `promote-todo-today.md` and `promote-facebook.md` (they require Supabase org membership) with the same anon-key pattern. No secret env setup on operator machines.
3. **Banner path for operators:** skills download the existing public banner via `curl` (portable). The banner-upload branch of `event-photo-prep.sh` (service-key storage write, macOS-only `sips`) stays founder-only; when the banner is missing AND no service key is present, skills instruct "publish via the UI first — the banner auto-generates" instead of hard-exiting.
4. **Parameterize identity:** every "logged in as Vyacheslav Ladischenski" check becomes "logged in as the operator named in `.private/event-operator.json` (default: Vyacheslav Ladischenski)". `promote-facebook.md` gains a precondition: operator must be a member of the target groups (group discovery uses the operator's own session and memberships). `promote-facebook-personal.md` becomes "operator's own profile".
5. **Dispatch from config:** `promote-all.md` loads the operator config first and dispatches only the configured platforms, passing the operator name to platform skills.
6. **Operator guide:** new `docs/events/operator-guide.md` (public, generic) covering:
   - **Setup:** clone the repo (link to README), install/open Claude Code in VS Code, ClarityPledge account, own platform accounts, create `.private/event-operator.json`.
   - **Where to use what:** claritypledge.com/events UI for publishing (banner auto-generates); `/slava:events:promote-all` for promotion; kanban not required.
   - **How to ask questions:** ask Claude first in the repo (it loads this guide + the skills); escalate to the founder only when still stuck after that.
   - **Personalization:** own skill variants (e.g. custom banner styles) live in `~/.claude/commands/` (personal layer, no PR); improvements to shared skills go via PR.
   - **Model note:** skills are model-agnostic — run whatever the session uses; a step that fails on a smaller model is a skill-clarity bug worth filing.

## Risks / Non-Goals

### Risks
- **Breaking the founder's existing flow** while parameterizing shared skills. Mitigation: config-absent path must reproduce current behavior verbatim; verify with a founder-side dry run before merge.
- **Skill steps too founder-implicit for a second operator** (assumed context not written down). Mitigation: the supervised first cycle is the test; every question asked becomes a skill/guide edit.
- **Privacy leak** — operator personal details drifting into the public repo. Mitigation: spec, skills, and guide use "operator" generically; config with real names stays in gitignored `.private/`.
- **Geography is still founder-shaped:** skills hardcode `Asia/Bangkok` timezone and local defaults. Accepted for now (current operator is in the same region); generalize only when an operator outside the region exists.

### Non-Goals
- Do NOT modify `publish-run.md` or `re-create-event.md` (founder-only series flows — second operators publish single events via the UI).
- Do NOT create shared/ops platform accounts or share any credentials.
- Do NOT add storage policies or any DB migration (custom banner upload deferred until an operator needs it).
- Do NOT build an MCP server, CLI, or Agent-SDK agent (deferred until a second consumer exists).
- Do NOT modify `src/` or any runtime code.
- Do NOT put operator names, pronouns, or personal context in any repo file.
- Do NOT parameterize geography/timezone in this pass (see Risks — accepted limitation).

### Alternatives Considered
- **Scoped DB role / new RLS "event_manager"** — unnecessary: existing RLS already grants authenticated users host-scoped event powers.
- **Ops-account model (shared platform logins)** — rejected: credential sharing risk, lower operator ownership; platform listings link back to claritypledge.com, so the durable asset is unaffected.
- **Admin UI / API endpoint for publishing** — unnecessary: `/events` UI already exists and is the product surface.

### Rollback Strategy
`git revert` of the single feature commit restores all 7 skills; delete `docs/events/operator-guide.md`. No state, no migrations.

## Resolved Decisions

| # | Source | Finding | Resolution | Rationale |
|---|--------|---------|-----------|-----------|
| 1 | /challenge-prd | [BLOCK] `event-photo-prep.sh` WRITES to storage with service key (INSERT policy is service_role-only); "de-privilege reads" missed it | Operator path: banner always pre-exists via UI publish (auto-generated); skills download it with `curl`; upload branch stays founder-only; graceful instruction instead of hard exit | No DB change; matches the normal runtime order (publish before promote) |
| 2 | /challenge-prd | [BLOCK] Anon key is gitignored — "inline" delivery was unspecified | Inline in skill files as fallback + `VITE_SUPABASE_ANON_KEY` env override | Key is public by design (ships in JS bundle); zero setup for operators; rotation = env var or one mechanical edit |
| 3 | /challenge-prd | [BLOCK] `sips` resize is macOS-only; operator OS unqualified | Dissolved by #1 — operator path never runs photo-prep; script documented as founder-only (macOS) | Download-only path is portable |
| 4 | /challenge-prd | [WARN] `supabase projects api-keys` CLI calls need org membership | Explicitly in scope: replace with anon-key curls in both skills | Same access model as the other reads |
| 5 | /challenge-prd | [WARN] UAT criterion is human-dependent; can't gate a merge | Done-When split: technical items gate the merge; operator UAT tracked as the hypothesis result after ship | Branch can't wait weeks on a human; the UAT is the learning goal, not a code gate |
| 6 | /challenge-prd | [WARN] Name-sweep would trip on the founder's own name in existing series docs | Sweep scope = files modified by this spec; founder's public name allowed; "operator details" is the target | The privacy constraint protects the operator, not the founder's public identity |
| 7 | /challenge-prd | [WARN] Hardcoded geography (`Asia/Bangkok`, local defaults) narrows the operator-independence claim | Accepted limitation, documented in Risks; non-goal this pass | Current operator is in-region; generalize on demand |
| 8 | /challenge-prd | [NOTE] Strategic fit: ops work, advances no P0 hypothesis | Accepted: justified by founder-time + delegation proof; sized accordingly (markdown-only) | Capacity cost is low; the delegation lesson compounds |

## Done-When

Technical (gate the merge — verifiable by founder dry-run):

- [ ] With `PROD_SUPABASE_SERVICE_ROLE_KEY` unset, each promote skill's read step returns the upcoming event + banner URL (anon key).
- [ ] With no `.private/event-operator.json`, `/promote-all` behaves exactly as today (all platforms, founder identity).
- [ ] With a config naming a different operator + platform subset, `/promote-all` dispatches only those platforms and identity checks reference that operator.
- [ ] Operator path never requires the banner-upload branch of `event-photo-prep.sh`: skills download the existing public banner via `curl`; if the banner is missing AND no service key is present, the skill instructs "publish via the UI first" instead of hard-exiting.
- [ ] `docs/events/operator-guide.md` exists and a fresh Claude session can answer "how do I set up?" and "how do I promote an event?" from repo content alone.
- [ ] No file modified by this spec contains operator personal details (founder's own public name allowed; sweep scope = P901-touched files).

Hypothesis tracking (does NOT gate the merge — human-dependent):

- [ ] **UAT:** a second operator completes one supervised publish+promote cycle, then one **solo** cycle (founder not present and not contacted during the run) with ≤2 founder questions.
- **Definitions (so the metric can't drift):** a *question* = any ask to the founder required to proceed, sync or async. Log each with a type: **infrastructure** (setup, access, skill confusion — counts against this package) vs **product/judgment** (event content, strategy — out of scope). Questions answered by the operator's own Claude do not count, but the operator is asked to note roughly how many cycles of agent help were needed — total friction matters even when it never reaches the founder.
