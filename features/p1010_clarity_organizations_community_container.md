---
status: today
type: story
rank: 0.25
created_date: '2026-07-23'
tags:
  - organizations
  - community
  - membership
  - coa
delivery_stage: architect
pipeline_ran:
  - create-spec
  - architect
locked_at: '2026-07-23T10:28:13.801Z'
---

# P1010: Clarity Organizations — community container (v1, two hardcoded orgs)

## Problem

**Situation:** ~6 Chiang Mai nomads and 3 interviewed high-integrity champions have no shared surface — they can't see each other, there's no visible boundary for who's "in," and no way to measure community effort.
**Complication:** A single public roster + terms-accept solves "see each other + a boundary" and is a small build with heavy reuse; the alternative (nothing, or private WhatsApp) sets no public norm.
**Question:** Ship a minimal, hardcoded organization container — two orgs, a roster, an accept-terms join — without building a multi-tenant platform.

## Appetite

Low–medium blast radius (new routes + two tables; **no existing flow changes — the `/events` redirect is deferred, so no existing route is touched**). Reversible (feature-branch, tables droppable). Low decision density — terms body reuses the existing oath; UX mirrors Meetup group page.

## Solution

Two hardcoded Clarity Organizations, `/org/cm` (nomad community) and `/org/champions`. Each renders a Meetup-style page with three tabs — **About** (the COA terms), **Members** (roster), **Events** (embedded calendar, optional per org) — and a persistent top-right CTA: **[Join]** for non-members, **[Manage membership ▾ · Leave]** for members.

- **Join = single-party COA accept.** Reuse the `accept-agreement` pattern (`accept-agreement-page.tsx` / `agreementsService`) stripped of counterparty, token, and email invite → inserts a membership row. Terms body = existing `VERIFIED_UNDERSTANDING_OATH`, accepted individually.
- **Members** reuses `PledgerCard` + the grid/carousel from `clarity-pledgers-page.tsx`, scoped to the org's roster.
- **About** reuses the `AgreementCertificate` render for the terms.
- **Events** reuses the existing Chiang Mai Google Calendar embed (`chiang-mai-page.tsx`), shown only when the org's `has_events` is true. (Reusing the app's **native `/events`** feature — list + RSVP + host — was considered and **deferred**: it needs an event↔org data link that doesn't exist, and pulls in host-event / native events, both out of v1 scope. v1 = read-only calendar embed.)
- **Data:** `organization` table (slug, name, blurb, `visibility` default public, `has_events`) + `membership` table (org_id, user_id, accepted_at, terms_version — the row **is** the COA acceptance). Both orgs seeded public.
- **Routing:** `/org/:slug` for the two seeded orgs. `/cm` stays the standalone calendar embed (unchanged). **`/events` stays unchanged in v1** — the general events list + primary nav are untouched. The `/events` → 301 `/org/cm` redirect (originally scoped here) is **deferred** by founder decision (2026-07-24): it repoints a live site-wide nav item, so revisit it only after self-serve org creation ships.

## Risks / Non-Goals

### Risks
- **Premature-build (flagged by adversarial review bf7b92e4):** no live prospect raised the org need; a no-code roster would test engagement for free. Mitigation: this is a **conscious founder override** (decisions.md 2026-07-23) — the 3 free tests (champion second-adoption, integrity-referral signal, budget-carving question) can run in parallel and still kill the arm cheaply.
- **Weak-signal metric:** a join is enthusiasm, not proof. Mitigation: track ≥1 member-originated second adoption as the real success metric, not join count.
- Concurrent multi-session edits clobbering work — commit incrementally.

### Non-Goals (do NOT build in v1)
- Do NOT build user-facing org creation (`/org/new`) — hardcode the two orgs.
- Do NOT build the discovery index (`/org`).
- Do NOT build private orgs, the invite engine, or the accept/reject → clarity-letter flow.
- Do NOT build the Clarity Ledger (L2 documented-behavior visibility) or badging/recognition (L3).
- Do NOT split event attendees into members/guests, and do NOT show "guests" on the roster. Attendee data needs native events (the calendar embed has none), and seeding non-accepting people as "members" would fabricate COA acceptance — the membership row *is* the acceptance record, so a padded roster dilutes the "these people committed" signal the page exists to show. **Cold-start (roster looks near-empty at launch) is handled by the empty-state (blurb + "Be the first to join" prompt) + the GTM to get real people to accept — never by padding the roster.** Revisit a guest/attendee concept only with native events.
- Do NOT let COA "join" creep into replacing the bilateral CPA in the paid funnel (per the 2026-07-23 org-terms deferral guardrail).

## Done-When

- [ ] `/org/cm` and `/org/champions` render with About / Members / Events tabs, Events defaulting.
- [ ] A logged-in non-member can Join (accept the COA) → appears on the Members roster with an accepted date.
- [ ] A member sees Manage membership · Leave; Leave removes them from the roster.
- [ ] Members roster reuses PledgerCard format and shows only that org's members.
- [ ] `/org/cm` Events tab shows the existing Chiang Mai calendar; `/org/champions` has no Events tab (`has_events` false).
- [ ] `/cm` calendar embed still works unchanged. (`/events` redirect **deferred** — not in v1 scope; revisit when create-org ships.)
- [ ] RLS: a user can only Join/Leave as themselves; rosters are publicly readable (public orgs).

## UX Notes

**Reference model: LinkedIn company header + Meetup group tabs.** We analyzed both. Take LinkedIn's header *polish* and Meetup's tab *semantics* — and deliberately NOT LinkedIn's "Follow" verb (passive followers) or its Posts/Jobs tabs.

```
/org/cm  (mirrors the Meetup group page structure)
┌────────────────────────────────────────────────────────────┐
│  [logo]  Clarity Community · Chiang Mai 🇹🇭                  │  ← LinkedIn-style header:
│          ◎ Chiang Mai   ·   👥 6 members                     │    logo · name · location ·
│          "<editable one-line blurb>"          ┌───────────┐ │    member count · one-line
│                                               │  Join     │ │    blurb (like LinkedIn's
│                                               └───────────┘ │    "Protecting co-founder…")
│  ┌────────┬─────────┬──────────┐                            │  ← Meetup tab bar:
│  │ About  │ EVENTS  │ Members  │   (Events underlined)       │    3 tabs only. NO Posts,
│  └────────┴─────────┴──────────┘                            │    NO Jobs, NO Follow.
│  … tab content …                                            │
└────────────────────────────────────────────────────────────┘
```

- **Header (LinkedIn-borrowed):** logo · org name · location · member count · one editable one-line blurb · persistent primary CTA top-right. No cover-photo requirement for v1 (optional).
- **Primary CTA (top-right, persistent across all three tabs):** non-member → **[Join]**; member → **[Manage membership ▾]** with **Leave** inside (this member/non-member swap IS the visible boundary — a stranger sees "Join," a member sees "Manage," legible at a glance).
- **Tabs (Meetup-borrowed):** About · Events · Members. Default = Events (`/org/cm`) / About (`/org/champions`). Drop Posts/Jobs (LinkedIn) and Discussions/Photos (Meetup) — Discussions is the deferred chat, the rest is noise for v1.
- **Members tab** = the `/pledgers` (`PledgerCard`) grid/carousel, scoped to this org. This is the "these are real people practicing" payoff — readable by non-members before they join.
- **Membership ≠ LinkedIn follow.** A member *accepted the COA*, not clicked follow. Keep the roster a list of people who committed, never a follower count.
- **Empty Members roster** shows the org blurb + a Join prompt, not a blank grid.
- Multi-viewport: verify header + tab bar + CTA at 375px and 320px (mobile-narrow is the overflow surface).

## Technical Architecture

### Technical Analysis

**Current code state:** No `organization` or `membership` table exists (`grep -rn "organization\|membership" docs/technical/database.md` — no hits). No prior org/membership feature work in `features/done/INDEX.md`. This is a net-new schema surface layered on top of the existing agreements + profiles infrastructure.

**Reuse inventory (verified against real code):**

| Spec-named item | Real path | Signature / notes |
|---|---|---|
| `accept-agreement-page.tsx` | `src/app/pages/accept-agreement-page.tsx` | Token/counterparty/email-invite-driven accept flow (`handleAccept`, `agreementsService.acceptAgreement`). Confirmed present — but the **flow being stripped**, not the file, is what's reused (see Architecture Decision 4). |
| `agreementsService` | `src/app/data/agreements-service.ts` (facade) + `.interface.ts` + `-real.ts` + `-mock.ts` | Facade selects real/mock via `VITE_USE_REAL_AGREEMENTS_API`. **This exact pattern has caused 3 documented prod incidents** (decisions.md: silent-mock-in-prod 2026-0x, points/stories/calibration mock re-export bypass, stories flag never set in Vercel) — see Architecture Decision 8. |
| `PledgerCard` | `src/app/components/social/pledger-card.tsx` | `PledgerCardProps { slug, name, role?, reason?, signedAt, avatarColor?, avatarUrl?, witnessCount?, reciprocations?, showStats?, showDate?, className?, style? }`. Renders a fixed blue "pledger" ring unconditionally (not a prop). |
| Grid/carousel in `clarity-pledgers-page.tsx` | `src/app/pages/clarity-pledgers-page.tsx` L94-193 | Confirmed — mobile horizontal snap-carousel (capped at `MAX_MOBILE_CAROUSEL=20`) + desktop CSS grid, both mapping `verifiedProfiles` to `PledgerCard`. Currently **inline in the page**, not an extracted component — Architecture Decision 6 extracts it. |
| `AgreementCertificate` | `src/app/components/agreements/agreement-certificate.tsx` | `AgreementCertificateProps { variant: 'creation'|'pending'|'active'|'celebration', creatorName, creatorSignedAt?, partnerName?, partnerSignedAt?, termsText?, agreementVersion?, footer?, ... }`. Confirmed present, bilateral by design (two `SignatureSlot`s) — Architecture Decision 4 maps org↔member onto creator↔partner slots. |
| Chiang Mai calendar embed | `src/app/pages/chiang-mai-page.tsx` | Google Calendar iframe (`buildEmbedUrl`), chrome-free layout. The **iframe + calendar ID**, not the whole page, is what the Events tab reuses. |
| `VERIFIED_UNDERSTANDING_OATH` | `src/app/content/verified-understanding-oath.ts` | Versioned registry (currently keys `4`, `5`), already the single shared source for both `PLEDGE_VERSIONS` and `AGREEMENT_VERSIONS`. |

**Dependencies:**
- `src/app/content/agreement-versions.ts` — the pattern to mirror for a new `coa-versions.ts` (see Decision 3).
- `supabase/migrations/20260602160000_p877_profiles_pii_column_grants.sql` — `profiles.email/linkedin_url/reason` are column-grant-gated; any new roster query touching them must reuse this gating, not bypass it (Decision 6).
- `supabase/migrations/20260616160000_p904_story_explain_backs.sql` — the canonical `SECURITY DEFINER` + `SET search_path = ''` + explicit `REVOKE ... GRANT EXECUTE TO authenticated` template this feature's one new RPC follows.
- `vercel.json` — server-side redirects live here (`"permanent": true` = real HTTP 301), not in `App.tsx`'s client-side `<Navigate replace>` pattern. The `/events` redirect (Decision 7) belongs here.

**Grounding conflict found — flag before `/dev` implements the `/events` redirect:**
`src/App.tsx` L859 registers `<Route path="/events/*" ... />` with the comment *"PROD-REACHABLE: `/events` is a live, nav-linked production feature (events list + RSVP), not a prototype — never dev-gate it."* The exact path `/events` (no sub-path) currently resolves to `EventsRoot` → `<Navigate to="list" replace>`, i.e. the general events list. **This route is linked from the primary site-wide bottom nav** (`bottom-nav.tsx`, `nav-links.ts`, `navigation-menu-items.tsx`, `simple-navigation.tsx`, plus `settings-page.tsx` and `profile-page-v2.tsx`) — not a stale/legacy URL. The spec's Appetite section calls the `/events` redirect "the only route touch" at "low–medium blast radius," but literally redirecting bare `/events` → `/org/cm` repoints the app's primary "Events" nav item, for every user regardless of location, to a Chiang-Mai-specific community page — a materially bigger behavior change than the spec's blast-radius estimate assumes. `/events/list`, `/events/:slug`, `/events/new` etc. are unaffected (Vercel `redirects` match `source` literally when it has no `:param`/wildcard, so an exact-match `/events` entry never touches `/events/*`). **This needs explicit founder confirmation before `/dev` wires it up** — designed as specified below, flagged, not silently built.

---

### Architecture Decisions

**1. Organizer representation — `membership.role` enum, not `organization.owner_id`**

- **Chosen:** `membership.role TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('member','organizer'))`. The organizer is a membership row like any other, with `role = 'organizer'`.
- **Rationale:** The membership table's entire premise is "the row IS the COA acceptance" (single source of truth for "is this person in the org"). An `organization.owner_id` FK creates a second, parallel source of truth: the organizer would need both an `owner_id` pointer AND (to appear on the roster, which is generated purely from `membership` rows) a separate `membership` row — two places that can drift (organizer changes without the membership row updating, or the membership row is deleted while `owner_id` still points at them). A role column keeps "who's in this org" and "who organizes it" the same query (`membership WHERE org_id = X`, filtered by `role`). It also extends to multiple organizers later (definitions.md's L2–L4 maturity ladder implies co-organizer/staff needs eventually) with zero schema change — just another row.
- **Trade-off:** No `NOT NULL FK`-level guarantee that an org always has ≥1 organizer (a `role`-based invariant is enforced by the seed migration, not the schema). Acceptable for two hardcoded, migration-seeded orgs; would need an application-level check if self-serve org creation ever ships.
- **Alternative rejected:** `organization.owner_id UUID REFERENCES profiles(id)`. Rejected because it forces dual-modeling (owner_id + a separate membership row for the same person) to satisfy both "who's the organizer" and "the roster shows everyone including the organizer," and doesn't extend to more than one organizer without adding a join table later — which is exactly what `membership.role` already is.
- **Security-relevant consequence (flagged for the Security agent, not resolved here):** clients must never be able to self-insert `role = 'organizer'` — the INSERT policy's `WITH CHECK` must pin client-originated rows to `role = 'member'` (see Decision 5). Organizer rows are seed-migration-only in v1.

**2. `organization` table shape**

```sql
CREATE TABLE public.organization (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug        TEXT NOT NULL UNIQUE,          -- 'cm', 'champions' — matches /org/:slug
  name        TEXT NOT NULL,
  blurb       TEXT CHECK (char_length(blurb) <= 200),
  visibility  TEXT NOT NULL DEFAULT 'public' CHECK (visibility IN ('public','private')),
  has_events  BOOLEAN NOT NULL DEFAULT false,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
```
- **Rationale:** Exactly the columns the spec names — no invented `logo_url` or `location` column. The mock's "📍 Chiang Mai 🇹🇭" line is rendered from `name`/`blurb` text, not a structured field, since the spec's column list doesn't include one and Done-When doesn't test it. **Flagging, not deciding:** the UX mock also says the blurb is "editable" — Done-When has no blurb-edit acceptance criterion, so v1 ships it seed-set and read-only; editing becomes a one-line UPDATE policy (`role='organizer' AND user_id=auth.uid()`) once actually requested.
- **`visibility` modeled now even though both v1 orgs are `public`:** costs one column + one RLS clause; avoids a schema rewrite when private orgs (explicit non-goal, deferred) eventually ship.
- **Trade-off:** No `logo_url`/`location` means the UX header can't render an actual location pin or logo image in v1 — text-only, per the mock's "No cover-photo requirement for v1 (optional)."
- **Member count** (👥 6 members in the header) is a live `COUNT(*)` over `membership`, not a stored counter column — no sync trigger needed at this scale (contrast with counter columns elsewhere in this codebase that exist for high-write tables).

**3. `membership` table shape**

```sql
CREATE TABLE public.membership (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id         UUID NOT NULL REFERENCES public.organization(id) ON DELETE CASCADE,
  user_id        UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  role           TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('member','organizer')),
  accepted_at    TIMESTAMPTZ NOT NULL DEFAULT now(),   -- the row IS the COA acceptance record
  terms_version  TEXT NOT NULL CHECK (terms_version IN ('4','5')),  -- mirrors clarity_agreements.agreement_version's CHECK-per-live-version pattern (P928)
  UNIQUE (org_id, user_id)
);
CREATE INDEX idx_membership_org  ON public.membership (org_id);
CREATE INDEX idx_membership_user ON public.membership (user_id);
```
- **Rationale:** `UNIQUE(org_id, user_id)` doubles as the "is this user already a member" existence check and makes Join idempotent via `ON CONFLICT DO NOTHING` (clicking Join twice is a no-op, not an error). `terms_version` is `TEXT` with an explicit value-list `CHECK`, matching `clarity_agreements.agreement_version`'s convention (not a native Postgres `ENUM` — the dominant, more-recent pattern in this schema per `grep` across migrations) — extending to a future oath version requires bumping this CHECK the same way P928 bumped `agreement_version`'s.
- **Naming collision flagged for implementers:** `membership.role` (member/organizer) is unrelated to `PledgerCardProps.role` (job title string, e.g. "Product Manager") and `profiles.role` — same word, different concept, different table. Don't thread one into the other.

**4. Single-party COA (Clarity Organization Agreement) join — stripping the accept-agreement pattern**

> **Naming:** COA = **Clarity Organization Agreement** (not "Community Oath"). The certificate title and all copy use "Clarity Organization Agreement."

- **Chosen:** Reuse `AgreementCertificate` directly, mapped onto its existing bilateral slots: the **creator slot renders the organization** (`creatorName = organization.name`, no `creatorSignedAt` needed — the org "signed" the moment it was created) and the **partner slot renders the joining member** (`partnerName = currentUser.name`, `partnerSignedAt = membership.accepted_at`). Non-member view = `variant="pending"` with a footer "I Accept & Join" button (mirroring `AcceptAgreementPage`'s `footer` prop pattern, minus the token/decline/partner-name-edit machinery that only exists for the bilateral, unauthenticated-invitee flow). Member view = `variant="active"`.
- **New content file:** `src/app/content/coa-versions.ts`, mirroring `agreement-versions.ts` — a `COA_VERSIONS` registry keyed the same as `VERIFIED_UNDERSTANDING_OATH` (`4`/`5`), with the **founder-approved single-party intro: `"By joining this clarity organization, I commit to every other member:"`** (generic — no org-name/member-name interpolation) instead of the bilateral "We, X and Y, agree to." Body text stays the identical shared `VERIFIED_UNDERSTANDING_OATH` constant — editing it once still converges pledge + agreement + COA. `CURRENT_COA_VERSION` constant lives in this same file (mirrors where `CURRENT_AGREEMENT_VERSION` lives, not `src/lib/constants.ts`).
- **Rationale:** No new certificate component, no new rendering logic — the entire "stripped of counterparty, token, and email invite" instruction from the spec is satisfied by simply not populating the token/email/decline props `AcceptAgreementPage` uses, and not creating a route for it at all (see Decision 5 — Join is inline on `/org/:slug`, no `/org/:slug/accept` route).
- **Trade-off:** `AgreementCertificate`'s props were designed bilaterally; using the creator slot to represent an organization (not a person) is a slight semantic stretch (no `creatorAvatarUrl`/`creatorProfileUrl` makes sense for an org — pass `undefined`). Acceptable for two hardcoded orgs; if orgs ever get profile pages, worth revisiting.
- **Alternative rejected:** A dedicated `/org/:slug/accept` route reusing `AcceptAgreementPage` verbatim. Rejected — that page's entire state machine (`unauthenticated` / `wrong-user` / token validation / decline dialog / OTP inline signup) exists to solve invitation-by-token-to-a-stranger, none of which applies to "an already-authenticated user clicks Join on a page they're already viewing." Building a new route to hold a stripped-down copy of that state machine adds a navigation hop and a page for no behavior the inline pattern doesn't already provide.

**5. Join / Leave mutation path — direct RLS-gated insert/delete, no RPC**

- **Chosen:** `organizationsService.joinOrganization(orgId)` calls `supabase.from('membership').insert({ org_id, user_id: auth.uid(), terms_version: String(CURRENT_COA_VERSION) })` directly (role omitted → defaults to `'member'`); `leaveOrganization(orgId)` calls `.delete().eq('org_id', orgId).eq('user_id', auth.uid())`. Both gated entirely by RLS:
  ```sql
  ALTER TABLE public.membership ENABLE ROW LEVEL SECURITY;

  CREATE POLICY membership_select ON public.membership FOR SELECT
    USING (
      user_id = auth.uid()
      OR EXISTS (SELECT 1 FROM public.organization o WHERE o.id = org_id AND o.visibility = 'public')
    );

  CREATE POLICY membership_insert ON public.membership FOR INSERT TO authenticated
    WITH CHECK (
      user_id = auth.uid()
      AND role = 'member'   -- blocks client-side self-elevation to 'organizer'
      AND EXISTS (SELECT 1 FROM public.organization o WHERE o.id = org_id AND o.visibility = 'public')
    );

  CREATE POLICY membership_delete ON public.membership FOR DELETE TO authenticated
    USING (user_id = auth.uid());
  ```
- **Rationale:** Join/Leave are "act as yourself, on your own row" mutations — the same shape as `clarity_agreements` creation (a direct client `.insert()` gated by RLS, per `agreements-service-real.ts::createAgreement`), not the cross-party token-verification shape that required `accept_agreement`'s `SECURITY DEFINER` RPC. No new PL/pgSQL function, no new attack surface, satisfies the Done-When bullet "a user can only Join/Leave as themselves" with plain policies.
- **Trade-off:** The `role = 'member'` guard in the INSERT policy is the only thing preventing privilege escalation — it must ship in the same migration as the table, not as a follow-up (Security Review to confirm this is airtight, e.g. that no other INSERT path bypasses it).
- **Alternative rejected:** `join_organization(p_org_slug)` / `leave_organization(p_org_slug)` `SECURITY DEFINER` RPCs (the `accept_agreement` pattern). Rejected — that pattern earns its complexity when the acceptor differs from a token-holder or needs server-stamped side effects (email, version pinning against tampering) the client can't be trusted with. Here the actor and the subject are the same authenticated user acting on their own row; RLS already expresses the entire authorization rule.

**6. Members roster read — new `get_organization_members` RPC, gated like `get_profile_by_id`, NOT like `get_featured_profiles`**

- **Chosen:** New `SECURITY DEFINER` RPC `public.get_organization_members(p_org_slug TEXT)`, `SET search_path = ''`, granted to `anon, authenticated` (Done-When: "rosters are publicly readable"). It joins `membership` → `organization` (by slug) → `profiles`, returning `profile_id, slug, name, avatar_color, avatar_url, accepted_at, org_role`, plus `reason`/`linkedin_url` **only when that profile's `is_verified AND has_pledged` is true** — i.e. the same **per-row conditional gate** `get_profile_by_id` uses, not `get_featured_profiles`' blanket `WHERE is_verified AND has_pledged` filter. This distinction matters: an org member need not be verified+pledged to appear on the roster at all (only to have their `reason`/`linkedin_url` shown) — filtering the roster query itself to verified+pledged would silently drop real members from Chiang Mai's roster.
- **Rationale:** `profiles.email/linkedin_url/reason` are column-grant-revoked from `anon`/`authenticated` (P877) — a plain client-side join (`membership.select('*, profiles(*)')`) 403s on those columns regardless of `membership`'s own RLS. A `SECURITY DEFINER` accessor is the established, only way to surface a safe subset (per `docs/technical/database.md` §RLS, P877).
- **Organizer surfacing:** query `ORDER BY (org_role = 'organizer') DESC, accepted_at ASC` — organizer sorts first. Satisfies carried-forward requirement "make sure the roster can surface who's the organizer" without a UI redesign.
- **Trade-off:** One more `SECURITY DEFINER` function to maintain the `REVOKE ALL ... GRANT EXECUTE` boilerplate for (per the P904 template) — the minimum viable cost of joining a PII-gated table safely.

**7. Routing**

- **`/org/:slug`** — one dynamic route (`OrgPage`), not two static `/org/cm` + `/org/champions` routes. The slug is a lookup key, not a self-serve creation surface (mirrors the existing `/p/:id` pattern) — it does not reopen the "Do NOT build `/org/new`" non-goal, since no UI ever offers a slug the founder didn't seed. Unknown slugs render a 404-equivalent state (org not found), not a create-flow.
- **Tabs are client-side component state** (`useState<'about'|'members'|'events'>`), not nested routes (`/org/:slug/members` etc.). No Done-When bullet requires a tab to be independently deep-linkable; adding 2-3 more routes for a fixed 3-tab v1 is routing surface the spec doesn't ask for. Default tab computed from `organization.has_events` (Events default for `cm`, About default for `champions`, per UX Notes).
- **`/events` → `/org/cm` (301): DEFERRED — not built in v1** (founder decision 2026-07-24). Grounding found `/events` is the live, primary-nav general events list, not a stale URL; a blanket 301 would repoint every user's Events nav to a Chiang-Mai-specific page. `/events` stays unchanged in v1. The redirect is revisited only after self-serve org creation ships, when repointing may be intentional. (Mechanism, if ever built: a `vercel.json` exact-match `source: "/events"` `"permanent": true` entry — which leaves `/events/list`, `/events/:slug` untouched — not a client-side `<Navigate>`.)
- **`/cm` is untouched** — no route change, per spec.

**8. Service layer — real-only, no mock/real facade split**

- **Chosen:** `src/app/data/organizations-service.interface.ts` (types + interface) + `src/app/data/organizations-service.ts` (single real implementation, exported directly — no facade, no `VITE_USE_REAL_*` env flag, no `-mock.ts` file). Tests mock at the module boundary (`vi.mock('@/app/data/organizations-service')`) rather than a hand-maintained parallel mock implementation.
- **Rationale:** The mock/real feature-flag facade (`agreements-service.ts`, `events-service.ts`, `points-service.ts`, `stories-service.ts`, `calibration-service.ts`) is a **documented, repeated prod-incident source in this exact codebase** — decisions.md records at minimum: (a) `VITE_USE_REAL_AGREEMENTS_API` shipped as `"true\n"` on Vercel, silently tree-shaking the real service into the mock, losing a real partnership agreement with zero Sentry/Mixpanel signal; (b) three separate mock services re-exporting the facade name, bypassing the flag entirely for any direct importer; (c) `VITE_USE_REAL_API` for stories never added to Vercel at all, running mock-mode in prod for months. This is not a hypothetical risk being traded off against convenience — it is a proven failure mode in three prior features. A new, smaller feature has no reason to opt into it.
- **Trade-off:** No built-in demo/storybook data source for `organizationsService` — acceptable because the two orgs are DB-seeded from day one (this is Wizard-of-Oz *content* seeding, not a client-side mock-data era the codebase needs to outgrow later, unlike agreements/events/points/stories which predate their real backends).
- **Alternative rejected:** Replicate the facade pattern for consistency with sibling services. Rejected on Security/correctness ranking (CLAUDE.md "Quality Over Build Speed") — consistency with a pattern that has caused three prod incidents is not a reason to repeat it.

**9. Seeding the two hardcoded orgs — migration-embedded INSERT, not a separate script**

- **Chosen:** The seed `INSERT`s for `organization` (both rows) and `membership` (one organizer row per org) live in the **same migration file** that creates the tables, using `ON CONFLICT (slug) DO NOTHING` / `ON CONFLICT (org_id, user_id) DO NOTHING` for idempotency. The organizer's `profiles.id` is resolved by a `(SELECT id FROM profiles WHERE slug = '<organizer-slug>')` subquery — **by public profile slug, never by email** (slugs are already public-facing, appearing in every `/p/:slug` URL; emails are the PII this repo's privacy rules exist to keep out of public files, including migrations, which ship in this public AGPL repo). Wrapped so a missing profile (e.g. a fresh test DB with no seeded profiles yet) skips the membership INSERT instead of failing the whole migration.
- **Rationale:** `./scripts/migrate.sh` is already the required post-migration step (`.claude/rules/database.md`) — folding the seed into the migration means test and prod both get the exact two orgs with zero extra manual step, and `ON CONFLICT DO NOTHING` makes re-running it safe (per `.claude/rules/database.md`'s "seed scripts must be idempotent and non-destructive").
- **Alternative rejected:** A standalone `scripts/archive/migrations/YYYYMMDD-seed-orgs.{ext}` script. Rejected — it's an extra manual step per environment (a failure mode: someone runs the migration but forgets the seed script, and the two org pages 404 with no signal), for content that's equally-well expressed as one more `INSERT` in the same file.

---

### Security Review

**RLS Policies:**
- ✅ **INSERT/DELETE bind to `auth.uid()` via plain RLS (Decision 5), never a client-passed `user_id`.** This is the correct call — it avoids the live `accept_agreement()` RPC trust model (`20260226130000_p443…`, `…p453…`, `…p466…`), which takes `p_partner_id` as a client-supplied UUID never checked against `auth.uid()`, safe *only* because of a secret token + a `creator != partner` guard that had to be patched **twice** (P453 + the 20260403 security-fix migration). Stripping the token while copying that signature shape would inherit an unauthenticated-impersonation hole with no compensating control. Decision 5 correctly does not.
- ✅ INSERT `WITH CHECK (… AND role = 'member')` blocks client self-elevation to `organizer` (Decision 1/5). Organizer rows are seed-migration-only.
- ⚠️ **`organization` table needs its own RLS** — Decision 2 defines the table but no policy. Add `ENABLE ROW LEVEL SECURITY` + `CREATE POLICY organization_select … USING (visibility = 'public')`. This is load-bearing: `membership_select`'s `EXISTS (… organization o WHERE … visibility = 'public')` subquery runs under the caller's rights, so `organization` must be selectable for the membership policy to resolve. (See Reconciliation below.)
- ✅ `membership_select` correctly gates on `visibility = 'public'` with an own-row exception (`user_id = auth.uid()`), so a member sees their row even if an org later flips private, but strangers can't enumerate a private roster.
- If any `SECURITY DEFINER` helper is added, use the **current** convention (`SET search_path = ''` + fully-qualified `public.` refs, per `…p877…` / `…p904…`), plus `REVOKE ALL … FROM public, anon` + `GRANT EXECUTE … TO authenticated` — not the older `search_path = public` form. Decision 6's RPC already specifies this.

**Authentication:**
- ⚠️ Join/Leave require auth **both** client-side (redirect unauthenticated clicks via `/login?redirect=…`, per `accept-agreement-page.tsx`) **and** DB-side (`TO authenticated` + `auth.uid()` in the policy). The client gate alone is not enforcement — Decision 5's policies supply the DB side; the client redirect must be wired in the `OrgPage`/service layer.
- ✅ Public roster read goes through a PII-gated `SECURITY DEFINER` accessor (Decision 6), not a raw `profiles` join — correct, since `profiles.email/linkedin_url/reason` are column-grant-revoked (P877). Decision 6's choice to gate `reason`/`linkedin_url` **per-row** (`get_profile_by_id` style) rather than filter the whole roster to verified+pledged (`get_featured_profiles` style) is the right call — org membership ≠ verified+pledged, so a blanket filter would silently drop real members.

**Input Validation:**
- ✅ Only two seeded orgs, no `/org/new` (Non-Goals) — no user-controlled org-creation surface. Unknown slugs render not-found, not a create flow (Decision 7).
- ✅ `org_id` is not trusted blindly: the INSERT policy's `EXISTS (… visibility = 'public')` + the FK constraint resolve the org server-side.
- ⚠️ **`terms_version` must be server-set, not client-supplied.** Decision 5's service passes `terms_version: String(CURRENT_COA_VERSION)` from the client. The `CHECK (terms_version IN ('4','5'))` blocks *nonexistent* versions but not a client sending `'4'` when current is `'5'` — a user could record acceptance of a stale oath, corrupting the audit trail. (See Reconciliation — fix via column `DEFAULT`, omit from client payload.)

**Data Protection:**
- ✅ `accepted_at DEFAULT now()` (Decision 3) is server-set — a client cannot backdate their COA acceptance record. Correct; mirrors `accept_agreement()` setting `partner_signed_at = now()` server-side.
- ✅ Roster PII scoped to name/slug/avatar/role via the Decision 6 accessor; no email or raw UUID in the public payload.
- No LLM/AI surface — AI Prompt Security review skipped (correct).

**Must-fix before `/dev`:**
1. Membership INSERT/DELETE bind `user_id = auth.uid()` via plain RLS — never a client-passed parameter. **(Already satisfied — Decision 5.)**
2. `accepted_at` server-set default. **(Already satisfied — Decision 3.)**
3. `terms_version` server-set default, omitted from client payload. **(Gap — see Reconciliation.)**
4. `organization` table `ENABLE ROW LEVEL SECURITY` + `organization_select USING (visibility='public')`. **(Gap — see Reconciliation.)**

### Reconciliation with Architecture Decisions (parent merge)

Two security must-fixes are **not** yet satisfied by the decisions above and are required in the same migration (Build Sequence step 1):

- **(A) `terms_version` server-set.** Change the `membership.terms_version` column to `NOT NULL DEFAULT '<CURRENT_COA_VERSION>' CHECK (terms_version IN ('4','5'))`, and **remove `terms_version` from the client insert** in Decision 5's `joinOrganization` (omit it, exactly as `role` is omitted → server default applies). Bumping the oath version becomes a one-line `DEFAULT` change alongside the `CHECK` bump, matching the P928 `agreement_version` pattern. This closes the stale-version audit hole without reintroducing an RPC.
- **(B) `organization` RLS.** Decision 2's table must also ship `ALTER TABLE public.organization ENABLE ROW LEVEL SECURITY;` + `CREATE POLICY organization_select ON public.organization FOR SELECT USING (visibility = 'public');`. Without it, both direct org reads and the `membership_select` visibility subquery fail. Seed INSERTs (Decision 9) run as the migration owner and are unaffected.

All other security findings are already satisfied by Decisions 1, 3, 5, and 6 — the impersonation risk (the highest-severity finding) was independently avoided by the architect's no-RPC/plain-RLS choice.

---

### Implementation Approach

#### Build Sequence

1. Write the migration: `organization` + `membership` tables, RLS policies (Decisions 2, 3, 5), `get_organization_members` RPC (Decision 6), seed INSERTs (Decision 9). **Security reconciliation (must-fix in this migration): (A) `membership.terms_version` gets `NOT NULL DEFAULT '<CURRENT_COA_VERSION>'` and is omitted from the client insert — server-set, not client payload; (B) `organization` gets `ENABLE ROW LEVEL SECURITY` + `organization_select USING (visibility = 'public')` — Decision 2 omitted it and `membership_select` depends on it.** Run `./scripts/migrate.sh` against test DB.
2. Regenerate `src/app/types/supabase.ts` from the updated schema.
3. Add `src/app/content/coa-versions.ts` (Decision 4).
4. Add `src/app/data/organizations-service.interface.ts` + `src/app/data/organizations-service.ts` (Decisions 5, 6, 8).
5. Extract `PledgerGrid` (grid + mobile carousel) out of `clarity-pledgers-page.tsx` into a shared component; add optional `badge?: string` prop to `PledgerCard` (organizer indicator, Decision 6).
6. Build `OrgHeader` (name, blurb, member count, Join/Manage·Leave CTA state-swap) and `OrgPage` (About/Members/Events tabs, default-tab logic, wires `organizationsService`).
7. Wire `/org/:slug` into `src/App.tsx`. **Do NOT add the `/events` redirect** — deferred by founder decision (2026-07-24); `/events` stays unchanged in v1.
8. Multi-viewport QA (375px, 320px, desktop) per `.claude/rules/visual-qa.md` — header + tab bar + CTA overflow check, empty-roster state, Join→Manage swap.

#### Files to Create

- `supabase/migrations/20260724120000_p1010_organizations_membership.sql`
- `src/app/content/coa-versions.ts`
- `src/app/data/organizations-service.interface.ts`
- `src/app/data/organizations-service.ts`
- `src/app/components/social/pledger-grid.tsx` (extracted from `clarity-pledgers-page.tsx`)
- `src/app/components/organizations/org-header.tsx`
- `src/app/pages/org-page.tsx`

#### Files to Modify

- `src/App.tsx` — add `/org/:slug` lazy route.
- ~~`vercel.json` — `/events` redirect~~ — **deferred (founder decision 2026-07-24); not touched in v1.**
- `src/app/components/social/pledger-card.tsx` — add optional `badge?: string` prop.
- `src/app/pages/clarity-pledgers-page.tsx` — switch to the extracted `PledgerGrid` component (behavior-preserving refactor).
- `src/app/types/supabase.ts` — regenerated types for `organization`/`membership`.

**Worktree recommended:** 11 files touched across schema, service layer, components, and routing (the `vercel.json` config touch is dropped with the deferred redirect) — still meets the 10+-files threshold in `docs/technical/worktree-setup.md`.
