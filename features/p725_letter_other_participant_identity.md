---
status: backlog
type: story
rank: 50
created_date: '2026-04-17'
tags:
  - letters
  - inbox
  - sent
  - results
  - reading
  - identity
  - profile
  - navigation
delivery_stage: park
pipeline_ran:
  - create-spec
  - architect
  - generate-tests
  - spec-review
  - dev
  - park
uat_file: features/uat/p725.md
test_files:
  - e2e/integration/p725-db-migrations.spec.ts
  - e2e/p725-letter-identity.spec.ts
  - e2e/a11y/p725-accessibility.spec.ts
---

# P725: Other participant identity across letter surfaces

## Problem

**Situation:** The other participant's identity (author for recipients, recipient for authors) surfaces inconsistently across letter surfaces:

- **Inbox + Sent tabs:** name is plain text, not linked to profile.
- **Letter-reading page (`/letter/:id`):** author identity not surfaced prominently or linked.
- **Results page (`/letter/:id/results`):** other participant visible only if they took positions on points.

Additionally, **letters navigation** places Drafts before Inbox and scopes "New draft" to the Drafts tab only.

**Complication:** Identity appears linkable → plain text → missing → linkable as the user walks inbox → reading → results. Creation is navigation-gated instead of always-available.

**Question:** How do we surface the other participant's identity consistently across all letter surfaces, and improve letters navigation primitives?

## Appetite

Medium blast radius. Touches `inbox-tab.tsx`, `sent-tab.tsx`, the reading page, results page, and letters-section navigation. DB changes: extend `get_inbox_items` to include `actor_slug`; verify results query returns other-participant profile data (may need extension). Reversible — all changes additive. Low-medium decision density — remaining edge cases have specified fallbacks.

## Solution

**Shared primitives (used in every part):**
- Component: `PersonAvatar` wrapper **on surfaces that render an avatar** (reading page, results page identity row, results point-level avatars) — avoids forgetting `isPledger`. Inbox/sent rows are name-only, no avatar; see AD6.
- Name fallback chain: `full_name` → `slug` → `"Someone"`.
- Null/missing slug → plain text, no link.
- Deleted profile → "Deleted user" plain text, no link.
- Every name link inside a clickable card uses `stopPropagation` so card-level navigation isn't triggered.

### Part 1 — Inbox + Sent tabs: linked identity

1. Extend `get_inbox_items` DB function: JOIN `profiles` on `actor_id`, return `actor_slug text` (nullable).
2. Extend sent-tab data fetch to return recipient `slug` (verify whether dedicated RPC or client-side query; extend accordingly).
3. Add `actor_slug?: string | null` to `InboxItem` type; equivalent for sent-tab item type.
4. Wrap actor name (inbox) and recipient name (sent) in `<Link to="/p/:slug">` when slug is present.
5. Anonymous types (`link_respondent`, `link_respondent_in_progress`) render "Someone" plain text, no link.
6. Sent tab public-link letters (no specific recipient): render "Public link letter" placeholder.

### Part 2 — Letter-reading page (`/letter/:id`)

1. **Placement:** replace the plain-text "From {senderName}" line inside `LetterCover` (currently `letter-cover.tsx` lines 68-70) with `<LetterParticipantRow>`. Pass `roleLabel="From"` to match existing copy.
2. Extend `LetterCover` props: `senderSlug?: string | null`, `senderAvatarUrl?: string | null`, `senderAvatarColor?: string`, `senderHasPledged?: boolean`. Reading page surfaces these from `letter.sender_slug` / `sender_avatar_url` / etc. after the reading RPC returns them (AD3).
3. Post-open (`LetterReadingFlow`) already surfaces sender via the focus header — no additional identity row needed there.
4. Name links to `/p/:slug` when available.
5. Same fallback chain and `stopPropagation` rules as Part 1.

### Part 3 — Results page: identity header + linked point avatars

1. **Pre-spec check:** verify `get_letter_results` (or page query) returns other-participant `slug` + `avatar_url`. If missing, extend the query in this spec (adds a migration).
2. Add a compact identity row below FocusHeader, above the story walk:
   - Avatar (sm) + name + role label: "Letter from [Name]" (recipient view) or "Letter to [Name]" (author view).
   - Name links to `/p/:slug` when slug available.
3. Other-participant avatars on individual points also link to `/p/:slug` (consistency rule).
4. Public link letter with no deliveries → "Public link letter" placeholder (no avatar, no link).
5. Anonymous (`link_respondent`) completion → "Someone" plain text + initials avatar.

### Part 4 — Navigation

1. Tab order: **Inbox → Sent → Drafts**. Inbox is the default landing tab.
2. Persistent "New draft" CTA visible on all three tabs.

### Part 5 — Progressive render + truncation

1. Name renders immediately from already-fetched letter data; avatar + link upgrade when profile data arrives (no skeleton, no flash).
2. Name truncation: ~24 chars mobile (<480px), ~40 chars desktop; ellipsis on overflow.

## Risks / Non-Goals

### Risks
- **`profiles.slug` column is nullable:** legacy profiles may have `slug = NULL`. Fallback to plain text handles this. Separate P-number will enforce NOT NULL.
- **Results query profile data:** verify during Part 3 step 1. Adds a DB migration if missing.
- **Nested tap targets:** every name link inside a clickable card requires `stopPropagation`. Cover in acceptance tests — easy to miss visually.
- **Anonymous link respondents are a permanent state in current code** (`receiver_profile_id IS NULL` at completion). Part 1 + Part 3 fallbacks handle this.
- **Part 4 (navigation) is conceptually separable from identity** — kept in this spec because blast radius overlaps (same letters-section components) and changes are small. Split to P-XXX if scope concerns arise in /architect.

### Non-Goals
- No message/chat action in identity rows (separate product concern).
- No author-side read receipts on results row → separate P-number.
- No inbox grouping for multi-response letters → separate P-number.
- No product change requiring profile creation on save for public-link responders → separate P-number.
- No enforcement of `profiles.slug NOT NULL` → separate P-number.
- No changes to P724 (visibility treatment).
- No redesign of `/p/:slug` destination page.

## Done-When

### Identity
- [x] `get_inbox_items` returns nullable `actor_slug` for all item types
- [x] Sent-tab fetch returns recipient `slug`
- [x] Inbox: registered actor names link to `/p/:slug`; `link_respondent` types render "Someone" plain text
- [x] Sent: recipient names link to profile when available; public-link letters show placeholder
- [x] Letter-reading page: author identity at top, linked when slug available
- [x] Results page: other-participant identity row renders regardless of position data
- [ ] Results page: other-participant avatars on individual points link to profile — deferred (UAT-9 manual; requires PointRow slug plumbing, non-blocking)
- [x] Correct role label on results: "Letter from [Name]" or "Letter to [Name]"
- [x] Public link letter with no deliveries: identity row shows "Public link letter" placeholder
- [ ] Deleted profile: "Deleted user" plain text — defensive only (FK blocks profile deletion in current schema; see Security Review)

### Navigation
- [x] Tab order is Inbox → Sent → Drafts; Inbox is default
- [x] "New draft" CTA visible on all three tabs

### Quality
- [x] Name truncation applied (24 mobile / 40 desktop)
- [ ] Progressive render: name shows immediately, avatar/link upgrades on profile load — manual UAT
- [ ] Mobile (375px) and desktop (1280px) visual QA pass — pending /verify
- [ ] Dark mode pass — pending /verify

## Acceptance Criteria

### Tap contract
- [x] Inbox/Sent card: tap name → `/p/:slug`; tap Open/Results button → open letter (card body itself is not a tap target; no change to current button-only navigation)
- [x] Results header: tap name → profile
- [ ] Results point-level: tap other-participant avatar → profile — deferred (UAT-9 manual)

### Content
- [x] Registered actor with slug: name + avatar; name is a link
- [x] Registered actor without slug: plain text, no broken link (E2E skipped post-P736 — covered by component null-guard)
- [x] `link_respondent` (anonymous completion): "Someone responded to _{title}_" — "Someone" plain text + initials avatar; title italic (existing copy preserved)
- [x] `link_respondent_in_progress` (anonymous in progress): "Someone is responding to _{title}_" — "Someone" plain text, no link; title italic (existing copy preserved)
- [ ] Deleted profile (actor_id → deleted row): "Deleted user" plain text, no link — defensive only (FK blocks today)
- [x] Name fallback chain: `full_name` → `slug` → `"Someone"` (never email prefix)
- [x] Role label matches view: recipient sees "from", author sees "to"

### Edge cases
- [x] Long name > 24 chars mobile: truncated with ellipsis
- [x] Long name > 40 chars desktop: truncated with ellipsis
- [ ] Profile JOIN slow: name renders immediately; avatar + link arrive without flash — manual UAT
- [x] Public link letter with 0 deliveries: "Public link letter" placeholder

### Navigation
- [x] Default landing on `/letters` opens Inbox
- [x] "New draft" button visible on Inbox, Sent, Drafts
- [x] "New draft" action from any tab opens the same creation flow

## UX Notes

- **Consistency rule:** the other participant's name and avatar are always clickable when a slug exists. No surface-specific exceptions.
- **Role label phrasing:** "Letter from [Name]" / "Letter to [Name]" — confirm matches existing letter copy elsewhere in the app; adjust if the codebase uses different phrasing for this relationship.
- **Never render an email prefix** as a name fallback. Slug is the public handle the user chose.
- **Avatar component:** when an avatar is rendered (reading page, results page identity row, results point-level avatars), always use `PersonAvatar` wrapper (not `GravatarAvatar` directly) so `isPledger` is never forgotten. Blue pledge ring comes for free. Inbox/sent rows do not render avatars — see AD6.
- **Tab order change** may feel disruptive to existing users. Ship without a tooltip unless data suggests otherwise.
- **`stopPropagation` discipline:** every name link inside a clickable card needs it. Cover in tests — regression risk is easy to miss visually.

### Follow-up P-numbers to file (carved out during spec refinement)

- Enforce `profiles.slug NOT NULL` — audit prod, backfill, migrate. Enables removing null-slug fallback branches here.
- Remove `link_respondent` branch in `get_inbox_items` after P684 ships — P684 already gates public-letter response persistence on signup, so the anonymous-completed state becomes unreachable. 1-line cleanup task, not a product change.
- Inbox grouping for multi-response letters — UX + DB change for letters with N>2 responses.
- Author-side read receipts on results page — "read X min ago" signal next to the identity row.

## Technical Architecture

### Technical Analysis

**Reuse Inventory**

`PersonAvatar` — `./src/components/ui/person-avatar.tsx` (main) / w2 mirror. Takes `person: PersonRef`. `PersonRef` has `name`, `slug?`, `avatarColor?`, `avatarUrl?`, `hasPledged`, `badgeCount?`. No change to this component required.

`GravatarAvatar` — `src/components/ui/gravatar-avatar.tsx`. Direct usage is the wrong pattern; always use `PersonAvatar` per `.claude/rules/src.md`.

`FocusHeader` — `src/app/components/layout/focus-header.tsx`. Props: `onBack`, `label?`. Used on letter-reading page and results page (inferred from imports — confirmed present in bottom-nav.tsx focus-routes). **Results page currently has no FocusHeader** — `letter-results-page.tsx` renders `<main>` directly, jumping straight into `<StoryWalk>`. The identity row will render between the page `<main>` open and `<StoryWalk>`.

`InboxItem` type — `src/app/types/index.ts` line 1416. Fields: `type`, `delivery_id`, `letter_id`, `title`, `actor_name`, `timestamp`, `read_at`, `completed_at`, `steps_completed?`, `total_steps?`. No `actor_slug` field today.

`get_inbox_items()` RPC — `supabase/migrations/20260413110000_p699_inbox_items_no_param.sql`. Returns JSONB array. Branch 1 (received): JOINs `profiles p ON p.id = cl.sender_id`, returns `actor_name = COALESCE(p.name, 'Someone')` — no `slug`. Branch 2 (responses): LEFT JOINs `profiles p ON p.id = ld.receiver_profile_id`, returns `actor_name = COALESCE(p.name, 'Someone')` — no `slug`. Function is parameterless (`auth.uid()` internal). Callers: `getInboxItems()` in `letters-service.ts` (one caller).

`get_letter_results()` RPC — `supabase/migrations/20260413130000_p699_results_profile_data.sql`. Returns `sender_profile JSONB` and `receiver_profile JSONB`, each containing `name`, `avatar_url`, `avatar_color`, `role`, `has_pledged`, `ears_count`. **No `slug` field** in either profile object. The `ResultsProfileData` interface in `letters-service.ts` also has no `slug` field. This is the gap that requires a migration (Part 3 pre-check is confirmed: extension required).

`ResultsProfileData` — `src/app/data/letters-service.ts` line 1162. Fields: `id`, `name`, `avatarUrl?`, `avatarColor?`, `role?`, `hasPledged`, `earsCount`. Missing `slug`.

Letter-reading page — `src/app/pages/letter-reading-page.tsx`. Route `/letter/:id` (id = deliveryId). Already receives `sender_display_name`, `sender_avatar_url`, `sender_avatar_color`, `sender_has_pledged` from `get_letter_for_reading` / `get_letter_for_public_reading` RPCs (added in P697 migration). No `sender_slug` field today. The reading RPCs already JOIN `profiles` on `cl.sender_id`.

Sent tab data fetch — `SentTab` calls `getAllSentLetters(userId)` (direct PostgREST query on `clarity_letters` with join to `clarity_docs`) then `getDeliveriesForLetters()` (calls `get_deliveries_with_progress` RPC). Recipient slugs come from `LetterDelivery.receiver_profile_id`. No slug data in either path today. The `RecipientRow` component renders `delivery.receiver_name || delivery.receiver_email || 'Anonymous'` — no slug link.

Tab order — `src/app/pages/letters-page.tsx`. Current order in DOM: Drafts → Sent → Inbox. Default tab fallback: `'drafts'`. `"New Draft"` button renders only when `activeTab === 'drafts'`.

Deleted profile FK — `letter_deliveries.receiver_profile_id REFERENCES profiles(id)` with no `ON DELETE` clause (defaults to `NO ACTION`, which in PostgreSQL behaves like `RESTRICT` in transactional context). Profile deletion would be blocked by an existing delivery row unless the account deletion flow uses a cascade or sets `receiver_profile_id = NULL`. Based on the P524/P520 decisions in `decisions.md`, account deletion is not yet shipped (P520 not built), so deleted profile scenario cannot currently occur in prod. The "Deleted user" fallback is defensive for future use.

---

**How letter components fetch + render today**

- **Inbox tab:** Polls `getInboxItems()` → RPC returns JSONB array → mapped to `InboxItem[]`. `ItemMessage` renders `item.actor_name` as plain `<span>`. No link, no avatar.
- **Sent tab:** `getAllSentLetters` + `getDeliveriesForLetters` → `RecipientRow` shows `displayName` as plain text. Expand required to see recipients.
- **Letter-reading page:** Multiple RPC paths; sender identity available as display name + avatar. Name shown in `LetterCover` via `senderName` state (text only; no slug link).
- **Letter-results page:** `getLetterResults()` returns full `senderProfile` + `receiverProfile` objects. `StoryWalk` receives them and uses `badgeProfile` for per-story point avatars. No identity row above the story walk. No profile link anywhere.

---

### Architecture Decisions

**AD1 — DB function for inbox slug: additive field on existing RPC**

- Chosen: Extend `get_inbox_items()` with a new migration that uses `CREATE OR REPLACE FUNCTION`. Both branches already JOIN or LEFT JOIN `profiles`; adding `p.slug` to the `jsonb_build_object` in each branch is a purely additive change. Add `actor_slug text` to the `InboxItem` TypeScript type as `actor_slug?: string | null`.
- Rationale: One call site (`getInboxItems`), one caller (`InboxTab`). Additive field cannot break existing consumers. No signature change — DROP+recreate not required.
- Trade-off: `actor_slug` will be `null` for `link_respondent` / `link_respondent_in_progress` types (receiver_profile_id IS NULL → LEFT JOIN returns NULL) — this is correct by design, no special-casing needed.
- Alternative rejected: Separate RPC for inbox-with-slugs — redundant, two functions to maintain.

**AD2 — Sent tab slug: extend `get_deliveries_with_progress` RPC**

- Chosen: Add `receiver_slug text` to the `get_deliveries_with_progress` RPC response via a new migration. The RPC already has `receiver_profile_id`; a LEFT JOIN to `profiles` on that FK adds the slug field. Add `receiver_slug?: string | null` to `LetterDelivery` type.
- Rationale: `SentTab` already uses this RPC via `getDeliveriesForLetters`. Extending it keeps the data model centralized. `RecipientRow` can then render a link when `delivery.receiver_slug` is non-null.
- Trade-off: `get_deliveries_with_progress` is called for all sent letters on tab open; the additional LEFT JOIN on an indexed column (`profiles.id`) adds negligible cost.
- Alternative rejected: Client-side lookup of slugs from profile IDs — N+1 fetch pattern, slower, violates architecture rule against nested selects.

**AD3 — Letter-reading page slug: extend reading RPCs**

- Chosen: Add `sender_slug` to the `jsonb_build_object` in both `get_letter_for_reading` and `get_letter_for_public_reading`. Both RPCs already LEFT JOIN `profiles` on `cl.sender_id` (added by P697). `CREATE OR REPLACE FUNCTION` is safe here — no signature change, only an added field in the JSONB output. Update `ClarityLetter` type or the local reading state to surface `sender_slug`. Render as linked name when non-null.
- Rationale: All data is already in the JOIN; one field addition, no new query.
- Trade-off: Reading-page letter object is a bespoke JSONB shape (not a typed DB row); a new `sender_slug` key in the JSON requires a corresponding TS field. Low risk — additive.
- Alternative rejected: Separate profile lookup after reading page load — adds async step, introduces possible mismatch between sender name (from RPC) and slug (from profile service).

**AD4 — Results page slug: extend `get_letter_results` + `ResultsProfileData`**

- Chosen: Add `slug text` to both `v_sender_profile_json` and `v_receiver_profile_json` in the `get_letter_results` RPC. Add `slug?: string | null` to `ResultsProfileData` interface and the mapping code in `getLetterResults()`. New migration required (DROP + recreate not needed — adding a field to a JSONB column returned from a TABLE function does not change the table's return type signature).
- Rationale: The RPC already fetches both profiles via `SELECT ... FROM profiles`; adding `p.slug` is a single-field addition. The TypeScript `ResultsProfileData` just needs the new optional field.
- Trade-off: `receiver_profile` is `null` for public-link letters with no receiver — the identity row in this case shows "Public link letter" placeholder, handled in the render layer with no DB change.
- Alternative rejected: Fetching slug client-side via `getProfileById` after results load — extra round-trip, also mismatches the "name renders immediately" progressive render requirement.

**AD5 — Identity row component: new shared component `LetterParticipantRow`**

- Chosen: Create `src/app/components/letters/letter-participant-row.tsx`. Props: `name: string`, `slug?: string | null`, `avatarUrl?: string | null`, `avatarColor?: string`, `hasPledged?: boolean`, `roleLabel: string` (e.g. "Letter from" or "Letter to"). Renders `PersonAvatar` (sm) + role label + name (linked when slug present, plain text otherwise). `stopPropagation` on the name link.
- Rationale: Used on results page identity row, letter-reading page (cover + completion summary), and potentially other avatar-bearing surfaces. Single component eliminates drift between avatar-bearing surfaces. Spec's consistency rule requires identical behaviour across those.
- **Scope clarification:** `LetterParticipantRow` owns the *avatar-bearing* surfaces only. Inbox/sent rows render name + link inline without an avatar (AD6) and therefore keep their own `Link` markup. They share the truncation (`max-w-[24ch] sm:max-w-[40ch] truncate`) and touch-target (`min-h-[40px]`) classes with this component; the two patterns intentionally use the same utility classes so visual consistency survives even without a shared component.
- Trade-off: A new file vs. inline JSX — justified here because the same avatar+link JSX would appear in 4+ places.
- Alternative rejected: Inline JSX per surface — copy-drift risk on the fallback chain and `stopPropagation` discipline.

**AD6 — `PersonRef` shape for inbox/sent name links**

- Chosen: Inline construction of `PersonRef` at the call site in `ItemMessage` and `RecipientRow`. Do not define a new type. Shape: `{ name: item.actor_name, slug: item.actor_slug ?? null, hasPledged: false }`. `hasPledged` and `avatarColor` are not available from the inbox RPC and are not needed for the name-only link treatment (avatars are not shown in inbox/sent rows per the spec's identity treatment for those surfaces).
- Rationale: Inbox and sent card rows show name + link only — not a full avatar. `PersonAvatar` is appropriate only on reading/results pages where full profile data is available. Using `PersonRef` + `PersonAvatar` in inbox rows would require fetching pledge status, which is out of scope.
- Trade-off: Inbox/sent name links do not show the pledge ring — acceptable, ring is an avatar-level decoration and avatars are not part of the inbox card design.
- Alternative rejected: Extend RPC to include `has_pledged` for inbox items — scope creep; pledge ring not in spec for those surfaces.

**AD7 — Branch strategy: build on `feature/letters-ship` vs. branch from main**

- Chosen: P725 branches off `feature/letters-ship` (w2). All letter components targeted by P725 (`inbox-tab.tsx`, `sent-tab.tsx`, `letters-page.tsx`, `letter-reading-page.tsx`, `letter-results-page.tsx`, `story-walk.tsx`) are already living in w2 on `feature/letters-ship` and are not yet on main. Building P725 off main would require waiting for `feature/letters-ship` to merge and then rebasing — or duplicating DB migrations that P699/P697/etc. already provide.
- Rationale: Both specs modify overlapping files. Branching off `feature/letters-ship` gives P725 all current letter infrastructure without conflicts. When `feature/letters-ship` merges to main, P725's branch is automatically based on that commit.
- Trade-off: If `feature/letters-ship` is not yet merged when P725 development starts, the developer must keep w2's branch updated via `git rebase` or `git merge`. This is the normal multi-feature worktree flow.
- Alternative rejected: P725 branches from main and rebases over `feature/letters-ship` at merge time — rebasing over a large branch increases conflict surface unnecessarily.

**AD8 — Tab order + "New Draft" CTA: single-file config change in `letters-page.tsx`**

- Chosen: Reorder `TabsTrigger` / `TabsContent` elements in `letters-page.tsx` from Drafts→Sent→Inbox to Inbox→Sent→Drafts. Change default tab fallback from `'drafts'` to `'inbox'`. Move the "New Draft" `<Popover>` outside the `{activeTab === 'drafts' && ...}` guard so it renders for all three tabs.
- Rationale: All logic lives in one file, one function component. Three surgical edits: tab order (DOM reorder), fallback value (string change), CTA visibility guard (remove condition).
- Trade-off: Reordering `TabsContent` elements alongside `TabsTrigger` is required — shadcn/ui `Tabs` matches content to trigger by `value`, not DOM position, so reordering triggers alone suffices. But reordering content too keeps the code readable.
- Alternative rejected: Separate navigation component — over-engineering a 3-line change.

---

### Security Review

**RLS Policies:**
- ✅ `profiles` SELECT is `using (true)` — public-readable. Returning `slug` through inbox/results RPCs exposes nothing that wasn't already queryable directly.
- ✅ No new RLS policies required. P725 is exclusively additive on existing columns and RPCs.

**Authentication:**
- ✅ `get_inbox_items()` reads `auth.uid()` internally (parameterless since P699); returns `'[]'::jsonb` if NULL.
- ✅ `get_letter_results()`, `get_letter_for_reading`, `get_letter_for_public_reading` are `SECURITY DEFINER` with internal `auth.uid()` checks. Authentication surface is not widened by slug additions.

**Authorization:**
- ✅ `get_inbox_items` Branch 1 filters on `ld.receiver_profile_id = v_user_id`; Branch 2 on `cl.sender_id = v_user_id`. Slug of the other party was already implicitly authorized (recipient knows sender, sender knows responder).
- ✅ `get_letter_results` receiver path requires `ld.receiver_profile_id = auth.uid()`; sender path requires `auth.uid() = v_sender_id`. No enumeration attack possible.
- ✅ No cross-user data leakage introduced by slug fields.

**Input Validation:**
- ✅ P725 is output-only from a DB perspective — `slug` is *returned*, not accepted. No new parameters, no new attack surface.

**Data Protection / PII:**
- ✅ `slug` is already public (profiles RLS allows anon reads). Adding it to authenticated RPC responses exposes nothing new.
- ✅ `link_respondent` anonymous respondents: LEFT JOIN yields `slug IS NULL` → UI fallback renders "Someone" plain text. Correct by design.
- ⚠️ **"Deleted user" fallback is unreachable in current schema** — see FK / Cascade section below. The UI code should still be written defensively.

**FK / Cascade behavior:**
- ⚠️ `letter_deliveries.receiver_profile_id` and `clarity_letters.sender_id` both reference `profiles(id)` with no `ON DELETE` clause → defaults to `NO ACTION` / `RESTRICT`. **Any user involved in a letter cannot be deleted at the profile level** — the FK rejects the DELETE.
- ✅ P520 (account deletion) is not yet shipped in prod — so deleted-profile scenarios cannot currently occur.
- **Reconciliation:** The `"Deleted user"` UI branch is defense-in-depth for future schema evolution (e.g., if P520 changes FK to `SET NULL`) or service_role bypass. No Build Sequence change needed. E2E tests should NOT attempt to actually delete a sender/receiver profile — the FK will reject it. Unit-test the UI fallback by passing `null` profile data directly.

**Auth-gated pages:**
- ✅ Slug links navigate to `/p/:slug`, which is a public browse page. Linking from an auth-gated surface to a public page introduces no bypass.
- ✅ Slug is included only in RPC responses that already enforce authentication. No new SSR path, no new server-side route.

**AI Prompt Security:** N/A — feature does not touch LLM prompts.

**Summary:** No blocking issues. One spec-schema gap documented (Deleted-user fallback is defensive-only under current FK behavior).

---

### Implementation Approach

**Worktree recommendation:** P725 should be developed in a new worktree branching from `feature/letters-ship` (w2). All target letter components exist only in that branch. Command: from w2, `git checkout -b feature/p725-letter-identity` then set up a new worktree slot (w3 or the next available).

#### Build Sequence

1. **Migration: extend `get_inbox_items`** — add `actor_slug` to both UNION ALL branches. Update `InboxItem` type.
2. **Migration: extend `get_deliveries_with_progress`** — add `receiver_slug` to recipient rows. Update `LetterDelivery` type.
3. **Migration: extend `get_letter_results`** — add `slug` to both profile JSONB objects. Update `ResultsProfileData` + mapping code.
4. **Migration: extend reading RPCs** — add `sender_slug` to `get_letter_for_reading` and `get_letter_for_public_reading`. Update ClarityLetter type / reading-page state.
5. **Create `LetterParticipantRow` component** — shared identity row used in steps 6–8.
6. **Inbox tab** — add slug link to `ItemMessage`; `stopPropagation` on name links.
7. **Sent tab** — add slug link to `RecipientRow`; "Public link letter" placeholder for mode=one-to-many with no specific recipient.
8. **Letter-reading page** — show `LetterParticipantRow` (author) at top of reading cover / below header.
9. **Results page** — add `LetterParticipantRow` (other participant) above `StoryWalk`; link point-level avatars in `StoryWalk` to `/p/:slug` when slug available; pass `slug` from `ResultsProfileData` to `StoryWalk`.
10. **Navigation** — tab order (Inbox → Sent → Drafts), default tab (`inbox`), persistent "New Draft" CTA.
11. **Progressive render + truncation** — name truncation CSS (`max-w-[24ch] sm:max-w-[40ch] truncate`); confirm name renders before avatar/slug upgrade on each surface.

#### Files to Create

- `src/app/components/letters/letter-participant-row.tsx` — new shared identity row component
- `supabase/migrations/YYYYMMDDHHMMSS_p725_inbox_actor_slug.sql` — extends `get_inbox_items`
- `supabase/migrations/YYYYMMDDHHMMSS_p725_deliveries_receiver_slug.sql` — extends `get_deliveries_with_progress`
- `supabase/migrations/YYYYMMDDHHMMSS_p725_results_profile_slug.sql` — extends `get_letter_results`
- `supabase/migrations/YYYYMMDDHHMMSS_p725_reading_rpc_sender_slug.sql` — extends reading RPCs

#### Files to Modify

- `src/app/types/index.ts` — add `actor_slug?: string | null` to `InboxItem`; add `receiver_slug?: string | null` to `LetterDelivery`
- `src/app/data/letters-service.ts` — add `slug?: string | null` to `ResultsProfileData`; update `getLetterResults()` mapping; update `LetterDelivery` mapping in `getDeliveriesForLetters()`
- `src/app/components/letters/inbox-tab.tsx` — update `ItemMessage` to link actor name when `actor_slug` present
- `src/app/components/letters/sent-tab.tsx` — update `RecipientRow` to link name when `receiver_slug` present; add "Public link letter" placeholder
- `src/app/components/letters/story-walk.tsx` — no new slug props needed; `slug` is now on `senderProfile`/`receiverProfile` via `ResultsProfileData` (AD4). Wrap the per-point `badgeProfile` avatar with `<Link to="/p/:slug">` when `badgeProfile.slug` is present. If the avatar link lives inside `LiveStoryCardExpanded`, add a `badgePersonSlug?: string | null` prop to that component instead.
- `src/app/pages/letter-results-page.tsx` — add `LetterParticipantRow` above `StoryWalk`; read slug from `resultsData.senderProfile.slug` / `resultsData.receiverProfile?.slug`
- `src/app/pages/letter-reading-page.tsx` — pass new sender-identity props (`senderSlug`, `senderAvatarUrl`, `senderAvatarColor`, `senderHasPledged`) to `LetterCover`; surface `sender_slug` from loaded letter data (AD3)
- `src/app/components/letters/letter-cover.tsx` — accept new sender-identity props; render `LetterParticipantRow` in place of plain-text "From {senderName}" line (lines 68-70)
- `src/app/pages/letters-page.tsx` — reorder tabs (Inbox → Sent → Drafts), change default to `'inbox'`, make "New Draft" CTA persistent

## Test Coverage Strategy

**What's Tested:**
- ✅ All 4 DB migrations — integration tests verify `actor_slug`, `receiver_slug`, `slug` (profiles), `sender_slug` exist in RPC responses before and after (two-client pattern: service role + JWT)
- ✅ Inbox sender link — E2E verifies name is an `<a href="/p/:slug">` link
- ✅ Inbox tap contract — E2E: name → profile; card body → letter (stopPropagation regression risk per spec)
- ✅ Inbox anonymous "Someone" — E2E: text not inside an anchor element
- ✅ Sent recipient link — E2E verifies `/p/:slug` link in sent tab
- ✅ Sent tap contract — E2E: name link → profile page
- ✅ Sent public link placeholder — E2E: "Public link letter" text visible
- ✅ Reading page sender identity — E2E: name visible, linked to `/p/:slug`
- ✅ Results identity row — E2E: renders for both sender and receiver perspectives
- ✅ Results role labels — E2E: "Letter from" (recipient), "Letter to" (author)
- ✅ Navigation: default Inbox, tab order Inbox→Sent→Drafts, New Draft on all 3 tabs
- ✅ Null-slug boundary — E2E: no link rendered when slug=null (seeded via supabaseAdmin UPDATE)
- ✅ Truncation CSS — E2E: overflow ellipsis CSS verified via getComputedStyle
- ✅ Keyboard accessibility — a11y: Tab reachability, Enter navigation, focusable links
- ✅ Accessible link labels — a11y: non-empty, non-generic accessible names
- ✅ Touch target size — a11y: ≥40px height on identity links

**What's NOT Tested (rationale):**
- ❌ Deleted profile "Deleted user" — FK blocks real profile deletion in current schema; defensive UI branch untestable in E2E without schema change (P520 not shipped)
- ❌ Progressive render (name before avatar) — requires network throttling simulation; covered in UAT-manual
- ❌ Avatar pledge ring — visual CSS decoration; covered in UAT-manual
- ❌ stopPropagation on mobile touch — touch events differ from pointer events; covered in UAT-17/18 manual
- ❌ Dark mode visual pass — requires visual comparison tool; covered in UAT-20 manual
- ❌ Results point-avatar links — `StoryWalk` internal avatars require completed delivery with positions data; covered in UAT-9 manual

**Test Pyramid:**
```
       /\
      /  \   27 E2E
     /____\
    / 11 INT \
   /__________\
   11 A11y + 21 UAT
```

**Files generated:**
- `e2e/integration/p725-db-migrations.spec.ts` — 11 integration tests
- `e2e/p725-letter-identity.spec.ts` — 27 E2E tests
- `e2e/a11y/p725-accessibility.spec.ts` — 11 a11y tests
- `features/uat/p725.md` — 21 UAT scenarios

**Estimated run time:** ~45–60 seconds (E2E + integration, parallel workers)
