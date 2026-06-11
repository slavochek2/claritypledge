---
status: week
type: story
rank: 1000929.0
created_date: '2026-06-11'
tags: [pledge, versioning, oath, grandfathering]
delivery_stage: create-spec
pipeline_ran: [create-spec]
---

# P929: Re-pledge always adopts the current oath version

## Problem

**Situation:** Each signed pledge stores a `pledge_version`. Certificates render the *stored* version, so a v4 signer keeps the v4 oath even after newer versions ship — grandfathering, by design.

**Complication:** When a user *withdraws* their pledge (`has_pledged → false`) and then *re-pledges*, the system **preserves their old stored version** instead of adopting the current one. Root cause: the pledge write path uses `existingProfile?.pledgeVersion ?? CURRENT_PLEDGE_VERSION` (`AuthCallbackPage.tsx:303`), `set_my_pledge(p_pledged)` only flips `has_pledged` without touching `pledge_version`, and withdraw leaves the profile row (and its `pledge_version`) intact. So a deliberate withdraw + fresh re-pledge silently keeps the OLD wording. Surfaced while testing the P928 oath v4→v5 bump.

**Question:** How do we make a *fresh pledge action* (new sign OR re-pledge after withdrawal) always store `CURRENT_PLEDGE_VERSION`, WITHOUT bumping existing active pledgers who never re-pledge?

## Appetite

Medium blast radius — touches the pledge write path (RPC and/or sign-flow upsert) which every signer hits. Reversible (git revert; no destructive data change — only newly-written rows get the current version). Decision density: the product decision is made (founder: re-pledge adopts current). One design choice remains for `/architect`/`/dev`: *where* the bump fires (RPC vs sign-flow upsert).

## Solution

Bump `pledge_version` to `CURRENT_PLEDGE_VERSION` at the moment the user **takes the pledge** (the explicit pledge action), and ONLY there. The bump must NOT fire on passive login / auth-callback for an already-active pledger — that path keeps its current preserve-existing semantics so grandfathered signers stay on their stored version.

The TS constant `CURRENT_PLEDGE_VERSION` stays the single source of truth — the version value flows from the client into the write, never hardcoded in SQL (avoids TS/SQL divergence). See Alternatives Considered for the two candidate seams.

## Risks / Non-Goals

### Risks
- **Accidentally bumping grandfathered active pledgers.** If the bump fires on login instead of the pledge action, every v4 signer silently becomes v5 on next visit — breaks the integrity model (a certificate would show wording they never signed). Mitigation: the bump fires only on the explicit take-the-pledge action; covered by a regression test asserting passive login preserves an active pledger's stored version.
- **`set_my_pledge` is a guarded SECURITY DEFINER RPC.** Changing its signature touches trust-column plumbing (P880). Mitigation: `pledge_version` is NOT a P880 trust column (only `has_pledged`/`is_verified` are guarded), so it can be written via the normal `upsert_my_profile` path or a widened `set_my_pledge` — no guard-trigger conflict. Verify against the P880 migration before choosing the seam.

### Non-Goals
- Do NOT change the oath registry, `VERIFIED_UNDERSTANDING_OATH`, `PLEDGE_VERSIONS`, or `CURRENT_PLEDGE_VERSION` value — P928 owns the oath text/version; this spec only changes WHEN a stored version is adopted.
- Do NOT bump `pledge_version` on passive login / auth-callback for active pledgers (preserve-existing stays).
- Do NOT touch the agreement version path (`clarity_agreements.agreement_version` / `set_my_pledge` is pledge-only) — agreements are a separate surface.
- Do NOT retroactively migrate existing rows — only new pledge actions adopt current; existing signers stay grandfathered until they themselves re-pledge.

## Done-When

- [ ] Withdraw + re-pledge (same account) stores `pledge_version = CURRENT_PLEDGE_VERSION` and the certificate renders the current oath
- [ ] A brand-new pledger stores `CURRENT_PLEDGE_VERSION` (unchanged behavior, regression-guarded)
- [ ] An active pledger who only logs in (no pledge action) keeps their stored version — NOT bumped
- [ ] The version written is sourced from the TS `CURRENT_PLEDGE_VERSION` constant, not a hardcoded SQL literal
- [ ] Tests cover all three paths above (re-pledge bump / new-pledge / passive-login preserve)

## Acceptance Criteria

- [ ] A user who withdraws and re-pledges sees the current oath wording on their certificate
- [ ] Grandfathered active pledgers are visibly unaffected until they re-pledge
- [ ] No regression to the new-user sign flow

## Alternatives Considered

- **(a) Widen `set_my_pledge(p_pledged, p_version)`** — client passes `CURRENT_PLEDGE_VERSION`; the RPC sets `pledge_version = p_version` when `p_pledged = true`. Pro: the bump is co-located with the authoritative pledge state change, one server round-trip, hard to bypass. Con: touches a SECURITY DEFINER signature (careful re: grants/P880).
- **(b) Sign-flow upsert sets `pledge_version = CURRENT`** — the `/sign-pledge` submission's `upsert_my_profile` call passes the current version explicitly (instead of preserving). Pro: no RPC signature change. Con: must be certain this path is the ONLY re-pledge entry point, and that passive auth-callback still preserves (two call sites of `upsert_my_profile` to keep distinct).

`/architect` to pick the seam against the live RPC + write-path code.
