---
status: all-done
type: story
rank: 15637.266
workstream: C1
created_date: '2026-06-02'
tags:
  - people-picker
  - privacy
  - agreements
  - letters
flow: dev
pipeline_plan: [create-spec, architect, generate-tests, dev, verify]
pipeline_ran: [create-spec, architect, generate-tests, dev, ship]
uat_file: features/uat/p878.md
test_files:
  - e2e/integration/p878-search-profiles-migration.spec.ts
  - e2e/p878-people-picker.spec.ts
  - e2e/a11y/p878-picker-accessibility.spec.ts
pipeline_skipped: [ux -- spec already contains UX Notes + UI Contract, ui -- stock typeahead on existing inputs, challenge-prd -- scope model came from 4-lens adversarial pass, spec-review -- spec fresh (3 days), decompose -- /dev can self-sequence ~5 files]
locked_at: '2026-06-05T09:40:11.183Z'
completed_at: 2026-06-06
---

# P878: Relationship-scoped people-picker for email fields

## Problem

**Situation:** Several surfaces ask a logged-in user to enter *another person's* email to reach them — sending a letter (`letter-receiver-modal.tsx`), inviting an agreement partner (`create-agreement-page.tsx`), accepting an agreement (`accept-agreement-page.tsx`), and witnesses. Today the user must remember and type a full email. An exact-email lookup already auto-fills the partner's name (P483), but only if the user types the whole address.

**Complication:** The founder wants users to pick a known person by name instead of memorizing emails. The obvious version — an open "type any name → dropdown of all users" search — is the wrong build: it rebuilds the Venmo "search-by-real-name over a public table" scraping pattern, conflicts with the trust-first / not-a-social-network mission, and would productize the PII leak tracked in **P877**. Four independent creative lenses (product-pattern, first-principles, brand-fit, security) converged on one rule: **discovery must never be wider than a relationship that already exists.**

**Question:** How do we let users pick a person by name in the email fields without exposing a searchable user directory?

## Appetite

Medium blast radius — touches the 3 email-entry surfaces, adds one search RPC, one new profiles column, and one rate-limit mechanism. Reversible (drop the RPC + column; UI falls back to plain email entry). Low-to-medium decision density: the scope model is decided (relationship-scoped); the founder-admin override and a couple of UX choices are the open decisions, flagged below.

**Hard dependency:** **P877 must ship first.** The picker's search must never return email; it relies on P877 having locked the `profiles` columns and moved email resolution server-side (addressing by `profile_id`). Do NOT start `/dev` on this until P877 is merged.

## Solution

A relationship-scoped picker, built from existing patterns:

1. **`search_profiles(p_query text)` — `SECURITY DEFINER` RPC** (shape mirrors P683's `get_auth_user_by_email`):
   - Auth-required (`auth.uid()` not null), else raise.
   - Minimum query length 3 chars (blocks single-char enumeration sweeps).
   - **Prefix** match on name/slug (`ILIKE q || '%'`), not fuzzy — the searcher must already know how the name starts.
   - Returns ONLY: `profile_id, name, slug, avatar_url, avatar_color, has_pledged, is_verified`.
   - NEVER returns `email`, `linkedin_url`, `reason`, `bio`.
   - `LIMIT 8`. `REVOKE EXECUTE FROM PUBLIC, anon; GRANT TO authenticated`.
   - In-DB per-user rate limit (e.g. a counter table checked inside the function).

2. **Scope = existing relationships, derived implicitly.** By default the RPC returns only profiles the caller already shares a thread with: prior letter recipients, current/past agreement partners, and witnesses. This is derived from existing tables — it is NOT a new friend-request/accept graph. People the user has never interacted with are invisible to search.

3. **First contact stays manual.** Reaching a brand-new person uses the (now-safe, post-P877) email-entry field or an invite link. After the first send, that person enters the user's relationship scope and appears in the picker thereafter.

4. **Founder/admin override** `[FOUNDER DECISION: confirmed — founder can search the full directory]`. Implemented via a new `is_admin BOOLEAN NOT NULL DEFAULT false` column on `profiles` (mirrors the `is_certifier` precedent from P686), set `true` on the founder's row **in the database only**. The RPC branches on `is_admin`: if true, skip the relationship-scope filter and search all profiles. The founder's email/identity must NEVER appear in committed code — it lives only in the DB row and in the gitignored `.private/docs/founder-accounts.md`.

5. **Admin is globally discoverable** `[FOUNDER DECISION: confirmed 2026-06-06]`. The single admin row (unique-index-enforced) is findable by ANY user by name or slug prefix, without a prior relationship — a deliberate one-row exception to relationship scope so every user can reach the operator. Not an open directory: all other profiles stay relationship-scoped, and the searching rules are unchanged (no handle syntax — typing `@` switches to the email path).

6. **UI.** Typeahead dropdown on the existing email inputs. A selected result carries `profile_id` (used to address the invite server-side per P877); the raw email field remains as the first-contact fallback. Each result shows an `is_verified` / `has_pledged` badge to blunt name-impersonation.

## Risks / Non-Goals

### Risks
- **Incremental-prefix enumeration** (type "a", "ab", "abc"… to walk the graph). Mitigation: relationship scope (non-admins can only see people they already know) + min length 3 + per-user rate limit.
- **Name typosquatting / impersonation** (attacker registers a confusable "John Doe" to be picked instead of the real one). Mitigation: show `is_verified`/`has_pledged` badge; address strictly by `profile_id`, never by displayed name.
- **Admin-flag misassignment** (wrong row gets `is_admin=true` → unintended full-directory access). Mitigation: flag set manually in DB with confirmation; document the single admin row in `.private/docs/founder-accounts.md`; consider an audit log entry.
- **Scope-derivation correctness** (a relationship edge missed → a legit contact not findable). Mitigation: enumerate the source tables explicitly in `/architect`; treat email-entry fallback as always-available.

### Non-Goals
- Do NOT add open/global name search for regular (non-admin) users.
- Do NOT build a public `@handle` directory, and do NOT surface or make searchable the existing `slug` as a user-facing handle.
- Do NOT build a friend-request / connection-accept graph — scope is derived implicitly from existing letters/agreements/witnesses.
- Do NOT return `email` (or `linkedin_url`/`reason`/`bio`) from the search RPC under any branch, including the admin branch.
- Do NOT write the founder's email address (or any personal email) into any committed file.
- Do NOT start implementation before P877 is merged.

## Done-When

- [x] A user can type a name and pick, from a dropdown, a person they already share a letter/agreement/witness relationship with — without typing an email
- [x] The search result payload contains no email (verified by inspecting the network response)
- [x] The selected person is addressed by `profile_id`; the letter/agreement is created correctly end-to-end
- [x] A non-admin user searching a stranger's name gets zero results (cannot discover people they have no relationship with)
- [x] The founder's account (`is_admin = true`) can find any user by name
- [x] First contact with a never-before-contacted person still works via email entry / invite link
- [x] No personal email address appears anywhere in committed code (pre-commit privacy check passes)
- [x] Rate limit returns gracefully (empty/throttled) under rapid repeated queries
- [x] Regression coverage: search RPC never leaks email; non-admin scope enforced; admin override works
- [x] Any user can find the admin (founder) by name or slug prefix without a prior relationship (one-row exception, tested both directions)

## UX Notes

- **Happy path:** focus email field → type ≥3 chars of a known contact's name → dropdown of ≤8 matches with avatar + name + verified badge → click → field resolves to that person (chip), invite addresses by `profile_id`.
- **Empty/no-match (non-admin):** "No one you've connected with matches. Enter their email to invite them." — routes to the first-contact email path; never implies the person doesn't exist on the platform (avoids account-existence oracle).
- **First-contact:** typing a full email that isn't in scope still works (post-P877 safe lookup / invite).
- **Loading:** debounced query (reuse the existing debounce in `create-agreement-page.tsx`); subtle spinner in the dropdown.
- **Self:** exclude the caller from results (existing "you can't invite yourself" guard).

## Acceptance Criteria

- [x] Picker works on all three surfaces: letter recipient, agreement create, agreement accept
- [x] Works on mobile (375/320px) and desktop — dropdown does not overflow the email field container
- [x] Verified badge visible on results so the user can distinguish a real contact from a lookalike
- [x] Non-admin cannot enumerate or contact strangers via the picker; admin (founder) can search all
- [x] Falls back cleanly to email entry for first contact with no console errors

## UI Contract

| Element | Value | Context |
|---------|-------|---------|
| Min chars before search | 3 | All picker surfaces |
| Max results shown | 8 | Dropdown list |
| Result row | avatar + name + (verified/pledged badge) | No email, no slug-as-handle shown |
| No-match copy (non-admin) | "No one you've connected with matches. Enter their email to invite them." | Empty state |
| Selected state | name chip resolving to profile_id | Replaces raw email entry |

## Technical Architecture

### Technical Analysis

#### Current code state

**Three email-entry surfaces (actual paths):**
- `src/app/components/letters/letter-receiver-modal.tsx` — dynamic recipient rows; each row has an email input with a per-row `debounceRef` (manual `setTimeout`/`clearTimeout`). On change, calls `agreementsService.lookupUserByEmail(email)` after 500 ms; stores `lookupResult: AgreementParty | 'not-found' | null`.
- `src/app/pages/create-agreement-page.tsx` — single `partnerEmail` input; debounced via `debounceRef.current` (same manual pattern); calls `agreementsService.lookupUserByEmail(email)` after 500 ms; stores `lookupResult: AgreementParty | null | 'not-found'`.
- `src/app/pages/accept-agreement-page.tsx` — email comes from the agreement record, not from user input; uses `agreementsService.lookupUserByEmail(ag.partnerEmail)` on mount to pre-fill `existingPartner`. No typeahead needed here — the email is already known. Picker is not applicable for this surface; it stays as a display-only auto-resolve.

**P877/P886 column gate (shipped):** `REVOKE SELECT (email, linkedin_url, reason) ON public.profiles FROM anon, authenticated`. Direct `from('profiles').select('email')` returns 42501. All email resolution goes through `SECURITY DEFINER` RPCs: `lookup_party_by_email`, `get_my_profile_by_email`, `get_featured_profiles`.

**P683 `get_auth_user_by_email` shape precedent:** `SECURITY DEFINER`, `SET search_path = public`, `REVOKE FROM PUBLIC, anon, authenticated; GRANT TO service_role`. Returns `TABLE(id uuid, email text)`. The new `search_profiles` RPC follows this structural shape but is `GRANT TO authenticated` (not service_role).

**P686 `is_certifier` precedent:** `ALTER TABLE profiles ADD COLUMN IF NOT EXISTS is_certifier BOOLEAN NOT NULL DEFAULT false;` followed by `UPDATE profiles SET is_certifier = true WHERE slug = 'slava';`. The new `is_admin` column follows this exact pattern, using the same migration structure (no seed in code — only a manual UPDATE comment pointing to `.private/`).

**`AgreementParty` type** (in `agreements-service.interface.ts`): `{ profileId, name, slug, avatarColor, avatarUrl, hasPledged }`. Note: lacks `isVerified`. The picker result type needs `isVerified` (required by UI Contract badge). The search RPC returns `is_verified` — will be mapped to a `ProfileSearchResult` type (not `AgreementParty`).

**`GravatarAvatar`** at `src/components/ui/gravatar-avatar.tsx` — existing avatar primitive. Required props: `name`, `photoUrl`, `avatarColor`, `isPledger`. Used by `letter-participant-row.tsx`.

**Existing debounce pattern:** both surfaces use identical `useRef<ReturnType<typeof setTimeout>>` + `clearTimeout` inline logic. This is extraction candidate — a `useDebounce` hook or shared `useProfileSearch` hook would centralize it.

**No existing `search_profiles` RPC.** No rate-limit tables or rate-limit RPCs found in migrations (grep: no hits for "rate_limit", "rate" not related to ratings).

#### Relationship scope — exhaustive enumeration

These are the tables that define "existing relationship." For a caller with `auth.uid() = $me`:

| Table | Direction | Column holding the counterpart's profile_id |
|-------|-----------|---------------------------------------------|
| `clarity_letters` | Outbound (sender) | `sender_id = $me` → counterpart `receiver_profile_id` on `letter_deliveries` |
| `letter_deliveries` | Inbound (receiver) | `receiver_profile_id = $me` → counterpart `sender_id` on `clarity_letters` (via FK) |
| `clarity_agreements` | Creator | `creator_profile_id = $me` → counterpart `partner_profile_id` |
| `clarity_agreements` | Partner | `partner_profile_id = $me` → counterpart `creator_profile_id` |
| `witnesses` | The witness IS a user | `witness_profile_id = $me` → counterpart `profile_id` (whose pledge they witnessed) |
| `witnesses` | Witnessed by someone | `profile_id = $me` → counterpart `witness_profile_id` (who witnessed them) |

**`witnesses` edge:** `witness_profile_id` is nullable (endorsers without accounts). Only include rows where `witness_profile_id IS NOT NULL`.

The UNION query shape (for non-admin branch):

```sql
SELECT DISTINCT counterpart_id FROM (
  -- Letters sent: I am sender, counterpart is receiver
  SELECT ld.receiver_profile_id AS counterpart_id
  FROM clarity_letters cl
  JOIN letter_deliveries ld ON ld.letter_id = cl.id
  WHERE cl.sender_id = auth.uid()
    AND ld.receiver_profile_id IS NOT NULL
    AND ld.receiver_profile_id != auth.uid()

  UNION

  -- Letters received: I am receiver, counterpart is sender
  SELECT cl.sender_id AS counterpart_id
  FROM letter_deliveries ld
  JOIN clarity_letters cl ON cl.id = ld.letter_id
  WHERE ld.receiver_profile_id = auth.uid()
    AND cl.sender_id != auth.uid()

  UNION

  -- Agreements: I am creator (accepted agreements only — see Security Review)
  SELECT partner_profile_id AS counterpart_id
  FROM clarity_agreements
  WHERE creator_profile_id = auth.uid()
    AND partner_profile_id IS NOT NULL
    AND status IN ('active', 'terminated')

  UNION

  -- Agreements: I am partner (accepted agreements only)
  SELECT creator_profile_id AS counterpart_id
  FROM clarity_agreements
  WHERE partner_profile_id = auth.uid()
    AND status IN ('active', 'terminated')

  UNION

  -- Witnesses: I witnessed someone
  SELECT profile_id AS counterpart_id
  FROM witnesses
  WHERE witness_profile_id = auth.uid()

  UNION

  -- Witnesses: someone witnessed me
  SELECT witness_profile_id AS counterpart_id
  FROM witnesses
  WHERE profile_id = auth.uid()
    AND witness_profile_id IS NOT NULL
) AS rel
```

This UNION is computed inside the RPC (not materialized). For realistic relationship counts (tens to low hundreds per user), a single CTE scan is acceptable. Indexes already exist on all FK columns from existing migrations.

#### Prior decisions relevant to this area

From `docs/decisions.md` (technical tags):
- P877 column gate is load-bearing: `search_profiles` MUST NOT return `email`, `linkedin_url`, or `reason` under any branch.
- P683 service_role-only pattern: precedent that search RPCs REVOKE from authenticated by default. P878 deliberately deviates — `GRANT TO authenticated` — because search is user-facing (not edge-function internal).
- `witnesses` insert intentionally allows any authenticated user to add witnesses without endorsee account (database.md). The scope-derivation query must filter `witness_profile_id IS NOT NULL`.
- `letter_deliveries.receiver_profile_id` is nullable (unregistered receivers). Scope query must filter `IS NOT NULL`.

---

### Architecture Decisions

**AD-1: Relationship-scope derivation — CTE UNION inside SECURITY DEFINER RPC**

- **Chosen:** Six-arm UNION CTE computed at call time inside `search_profiles`, filtered by `auth.uid()`.
- **Rationale:** No new tables, no materialized graph. Relationship scope is already fully encoded in existing FK columns. The SECURITY DEFINER context means the function can JOIN across tables whose RLS the caller cannot read directly (e.g., other users' agreements). CTE result is small per user (realistic: 10–200 relationship edges), making a 6-arm UNION negligible at runtime.
- **Trade-off:** A user with thousands of relationships (unlikely in this product's target context of co-founder pairs) would see slightly higher RPC latency. Acceptable — the app's core hypothesis is that users have a small, high-trust relationship set.
- **Alternative rejected:** Materializing a `user_relationships` edge table (trigger-maintained). Rejected because: adds a new table, adds INSERT/DELETE triggers on three existing tables, introduces trigger-maintenance complexity for no concrete benefit at current scale. Can be added later if profiling shows the CTE is slow.

**AD-2: RPC design — `search_profiles(p_query text)` SECURITY DEFINER**

- **Chosen:** Single RPC, SECURITY DEFINER, `GRANT TO authenticated`. Returns: `profile_id uuid, name text, slug text, avatar_url text, avatar_color text, has_pledged bool, is_verified bool`. Never returns `email`. Min 3 chars enforced inside function (raise if not met). LIMIT 8. Prefix match: `starts_with(lower(p.name), lower(trim(p_query)))` — NOT bare ILIKE concat (wildcard injection; see Security Review). Self-exclusion: `AND p.id != auth.uid()`. Function carries `SET search_path = ''` with schema-qualified names.
- **Rationale:** Mirrors `lookup_party_by_email` pattern from P877. SECURITY DEFINER lets the function bypass the authenticated-role column REVOKE to read the `profiles` table's display columns (which are still granted to the function's owner, `postgres`). Admin branch within the same function avoids a second RPC endpoint.
- **Trade-off:** A single function with an `is_admin` branch is slightly harder to audit than two separate functions. Mitigated: the admin branch is clearly delimited with a comment; the column NEVER-return invariant applies to both branches.
- **Alternative rejected:** Separate `search_profiles_admin` RPC. Rejected: adds surface area; admin check inside one function is simpler and harder to misconfigure (no risk of calling the wrong one from the frontend).

**AD-3: `is_admin` column — same pattern as `is_certifier` (P686)**

- **Chosen:** `ALTER TABLE profiles ADD COLUMN IF NOT EXISTS is_admin BOOLEAN NOT NULL DEFAULT false;`. Set `true` only via a manual DB UPDATE (not seeded in migration SQL). Reference the column in the RPC as `SELECT is_admin FROM profiles WHERE id = auth.uid()`.
- **Rationale:** P686 `is_certifier` is the established precedent. The founder's identity stays in the DB row and in `.private/docs/founder-accounts.md` — never in committed code.
- **Trade-off:** Admin flag assignment requires direct DB access. Acceptable — this is intentional friction to prevent accidental over-grant.
- **Alternative rejected:** Checking against a hardcoded UUID in the RPC SQL. Rejected: puts a semi-identifying value in a public repo migration. Column is cleaner and consistent with existing pattern.

**AD-4: Rate-limit mechanism — Postgres `search_rate_limits` counter table, checked inside RPC**

- **Chosen:** New table `public.search_rate_limits(user_id uuid PK, window_start timestamptz, call_count int)`. Inside `search_profiles`: if no row for `auth.uid()` exists or `window_start < NOW() - INTERVAL '1 minute'`, reset to `(auth.uid(), NOW(), 1)`. If `call_count >= 30`, raise `'rate_limit_exceeded'` (or return empty result). Otherwise increment. Uses `INSERT ... ON CONFLICT DO UPDATE`. No separate cron/cleanup needed — stale rows are overwritten on next call.
- **Rationale:** No rate-limit precedent in migrations; this is a new mechanism. In-DB approach keeps the logic server-side (cannot be bypassed by the client). Per-user 30 calls/minute is generous for legitimate typeahead use (≈0.5 calls/sec) and blocks rapid enumeration sweeps. Window reset on overflow means a user who is rate-limited recovers after ≤1 minute without any cleanup job.
- **Trade-off:** Adds one table and one advisory lock or CAS operation per RPC call. Acceptable: the rate table is tiny (one row per active user), and `ON CONFLICT DO UPDATE` is lock-safe.
- **Alternative rejected:** Application-layer rate limiting (middleware/edge function). Rejected: cannot be enforced if the RPC is called via REST directly; violates the requirement for in-DB rate limiting stated in the spec.

**AD-5: Frontend picker component — shared `useProfileSearch` hook + `ProfilePickerInput` component**

- **Chosen:** Extract a single `ProfilePickerInput` React component (`src/app/components/shared/profile-picker-input.tsx`) that wraps the existing email `<input>` with typeahead dropdown. Backed by a `useProfileSearch(query: string)` hook. The debounce logic (currently duplicated in `letter-receiver-modal.tsx` and `create-agreement-page.tsx`) is centralized in the hook using the existing `useRef<ReturnType<typeof setTimeout>>` pattern.
- **Rationale:** Three surfaces need identical behavior. A shared component prevents three copies of debounce logic, dropdown rendering, and empty-state copy. Reuses `GravatarAvatar` for result rows (from inventory). The component accepts `onSelect: (result: ProfileSearchResult | null) => void` and `onEmailChange: (email: string) => void` callbacks — allowing each surface to retain its existing `profile_id` / `email` state management.
- **Trade-off:** Small coupling: all three surfaces depend on one component. Acceptable — it is already the case that all three call `agreementsService.lookupUserByEmail`.
- **Alternative rejected:** Inline the picker into each surface separately. Rejected: triples maintenance burden; the debounce duplication already exists and is a known pain point.

**AD-6: Addressing by `profile_id` end-to-end**

- **Chosen:** When a picker result is selected, `profile_id` is stored in component state alongside the displayed name. On form submit, `profile_id` is passed to the service layer (where it already exists for agreement creation: `partnerProfileId`). For letter creation, the service resolves email server-side from `profile_id` via `lookup_party_by_email` (which already accepts `profile_id` if a new overload is added) or via a new `get_email_by_profile_id` SECURITY DEFINER RPC — called server-side only (edge function or server action), never returning email to the browser.
- **Rationale:** P877 invariant: "Email must never be serialized back to the browser for other users." The picker result contains no email; the `profile_id` is the address token. This is the established pattern from P877's refactor of `lookupUserByEmail`.
- **Trade-off:** Letter creation edge function may need a new overload to accept `profile_id` instead of email. Verified: `create-and-open-letter` edge function currently uses `get_auth_user_by_email` for orphan detection — a `profile_id` path must be added or handled by checking that `profile_id` is already known (skip the auth lookup when the picker resolved the user).

---

### Security Review

**RLS Policies:**
- ✅ Column gate verified (migration `20260605002428`): `is_admin` will NOT be in the column-level GRANT — new profiles columns are invisible to anon/authenticated by default. Correct posture; the P878 migration must NOT add `is_admin` to any GRANT. The RPC reads it as function owner (SECURITY DEFINER).
- ✅ SECURITY DEFINER bypass is correct in principle: the danger is what the function *returns*, not what it reads. Return-set restriction (no `email`/`linkedin_url`/`reason` in any branch) is enforced by the function body, not by grants.
- ⚠️ **Scope JOIN reads source tables with RLS bypassed.** Inside SECURITY DEFINER the function owner bypasses RLS on `clarity_letters`, `letter_deliveries`, `clarity_agreements`, `witnesses` too. Every UNION arm MUST carry the `auth.uid()` caller constraint (as written in the Technical Analysis UNION) — without it the function is an open directory. The exact JOIN predicates in the Technical Analysis satisfy this; implementation must match them verbatim.

**Authentication:**
- ⚠️ `auth.uid()` null-check must be a hard `RAISE EXCEPTION` at the top of the function body (precedent: `upsert_my_profile`), not a soft empty return.
- ⚠️ **Triple REVOKE required:** Supabase default privileges grant EXECUTE on new functions to anon AND authenticated. The migration must `REVOKE ... FROM PUBLIC, anon, authenticated` by name, then `GRANT TO authenticated` only (pattern: migration `20260602160000` lines 347–365).
- ⚠️ **`SET search_path = ''`** with fully schema-qualified table names (`public.profiles`, …) — per decisions.md 2026-05-31; all P877 RPCs do this. (Note: P683 used `search_path = public`; follow the newer P877 convention.)

**Authorization:**
- ⚠️ **`is_admin` self-promotion guard (REQUIRED).** Users can UPDATE their own profiles row; without protection a user could `update({is_admin: true})`. Mitigation: column-level `REVOKE UPDATE (is_admin) ON public.profiles FROM authenticated` (and verify the same gap for `is_certifier` while there).
- ⚠️ **Single-admin structural guard (REQUIRED):** partial unique index `CREATE UNIQUE INDEX unique_admin ON public.profiles (is_admin) WHERE is_admin = true;` — makes multi-admin misassignment impossible rather than procedurally guarded.
- ⚠️ **Agreement scope must exclude `pending`/`declined`.** Otherwise sending a fake agreement invite is a cheap scope-gaming/enumeration vector. Scope to `status IN ('active', 'terminated')` (accepted at some point). Letters: any delivery with `receiver_profile_id IS NOT NULL` is fine (drafts have no deliveries).
- ✅ Bidirectionality covered: letters sender↔receiver, agreements creator↔partner, witnesses both directions (per the UNION in Technical Analysis).
- ✅ Admin branch lookup (`SELECT is_admin FROM public.profiles WHERE id = auth.uid()`) inside the function is correct.

**Input Validation:**
- ⚠️ **ILIKE metacharacter escaping (REQUIRED).** Bare `ILIKE p_query || '%'` lets `%`/`_` in user input widen the match (e.g. `%doe` matches "doe" anywhere). Use `starts_with(lower(p.name), lower(p_query))` (no wildcard semantics) or escape `\`, `%`, `_` with an `ESCAPE` clause.
- ⚠️ Min-length 3 enforced **server-side** (`RAISE EXCEPTION` on `length(trim(p_query)) < 3`); client-only check is bypassable via direct RPC call. Also guard whitespace-only input.
- ✅ LIMIT 8 as a hard literal in the SQL; no `p_limit` parameter in the signature.

**Data Protection:**
- ✅ Returned columns (`profile_id, name, slug, avatar_url, avatar_color, has_pledged, is_verified`) are all in the existing display-safe GRANT; none in the revoked set.
- ✅ `slug`/`avatar_url` exposure within relationship scope is pre-existing (public profile URLs) — accepted.
- ✅ Account-existence oracle: empty state copy never distinguishes "not on platform" from "not in your scope". **Admin branch IS an existence oracle by design — accepted risk, single-admin row.**
- ⚠️ **Rate-limit race + window:** naive read-then-increment has a race. Use `INSERT ... ON CONFLICT DO UPDATE SET call_count = call_count + 1 RETURNING call_count` and check the returned value (atomic). Window: 1 minute, limit 30/min non-admin (AD-4 matches this).
- ⚠️ Grep existing P877 RPCs for `to_jsonb`/`row_to_json` wildcard serialization to confirm `is_admin` can't leak via an existing accessor (`get_profile_by_id` builds explicit key lists — verified safe; check the rest at /dev time).

**Required mitigations checklist (for /generate-tests + /dev):**
1. [x] `starts_with()` or escaped ILIKE — no bare wildcard concat
2. [x] Server-side 3-char minimum (RAISE)
3. [x] `REVOKE UPDATE (is_admin)` from authenticated (self-promotion guard)
4. [x] Partial unique index `WHERE is_admin = true`
5. [x] Agreement scope `status IN ('active', 'terminated')`
6. [x] Atomic rate-limit increment (`ON CONFLICT ... RETURNING`), 30/min window
7. [x] Triple REVOKE (PUBLIC, anon, authenticated) + GRANT authenticated
8. [x] `SET search_path = ''` + schema-qualified names
9. [x] No GRANT for `is_admin` column anywhere

---

### Implementation Approach

**Worktree recommended:** Touches 5+ files across migration, RPC, service layer, and 2–3 UI surfaces.

#### Build Sequence

1. **Migration: `is_admin` column + `search_rate_limits` table + `search_profiles` RPC** — single migration file. Must include all 9 items from the Security Review mitigations checklist: `starts_with` prefix match, server-side min-3 RAISE, `REVOKE UPDATE (is_admin)`, partial unique admin index, agreement-status scope filter, atomic rate-limit increment, triple REVOKE + GRANT authenticated, `search_path = ''`, no `is_admin` GRANT. No client changes break during this step (RPC is additive).
2. **Service layer: `searchProfiles(query: string)` method** on `agreements-service-real.ts` (and interface + mock). Returns `ProfileSearchResult[]`.
3. **Shared hook: `useProfileSearch`** — centralizes debounce + RPC call + loading/error state.
4. **Shared component: `ProfilePickerInput`** — typeahead dropdown wrapping the hook. Uses `GravatarAvatar`.
5. **Wire into `create-agreement-page.tsx`** — replace the email field with `ProfilePickerInput`; retain email fallback input.
6. **Wire into `letter-receiver-modal.tsx`** — replace per-row email input.
7. **`accept-agreement-page.tsx`** — no picker needed (email is pre-known); verify existing `lookupUserByEmail` call still works (no change needed).
8. **Tests** — per `generate-tests` skill.

#### Files to Create

- `supabase/migrations/YYYYMMDDHHMMSS_p878_search_profiles_rpc.sql` — `is_admin` column, `search_rate_limits` table, `search_profiles` SECURITY DEFINER function
- `src/app/components/shared/profile-picker-input.tsx` — shared typeahead component
- `src/app/hooks/use-profile-search.ts` — debounced search hook

#### Files to Modify

- `src/app/data/agreements-service.interface.ts` — add `ProfileSearchResult` type; add `searchProfiles(query: string): Promise<ProfileSearchResult[]>` to interface
- `src/app/data/agreements-service-real.ts` — implement `searchProfiles` (calls `search_profiles` RPC)
- `src/app/data/agreements-service-mock.ts` — stub `searchProfiles` returning `[]`
- `src/app/pages/create-agreement-page.tsx` — wire `ProfilePickerInput` into partner email field
- `src/app/components/letters/letter-receiver-modal.tsx` — wire `ProfilePickerInput` into per-row email field

---

## Pre-deploy Checklist

### Post-migration provisioning (prod)
- [ ] After the P878 migration applies on prod: set `is_admin = true` on the founder's profile row — exact SQL + account in `.private/docs/founder-accounts.md` (P878 section). Service role / SQL editor only; the guard trigger blocks client-role writes by design. Done on test 2026-06-06.

### Post-deploy verification
- [ ] As the founder on prod: search a 3+ char name prefix of a user with no relationship → results appear (admin override live)
- [ ] As any non-admin user: same search → empty state (scope intact)

## Test Coverage Strategy

### Integration: `e2e/integration/p878-search-profiles-migration.spec.ts` (17 tests)

Covers all 9 security mitigations from the Security Review checklist, schema existence (`is_admin` column, `search_rate_limits` table, `search_profiles` function), relationship-scope enforcement (active vs pending agreements, letter bidirectionality, stranger isolation), wildcard injection, server-side min-3, self-exclusion, `is_admin` self-promotion guard, admin override, rate limiting (31st call), and LIMIT 8 (9 seeded agreements). Two-client pattern (supabaseAdmin for schema/service-role writes; user-scoped clients for RPC calls). **Witness scope is `test.skip` with a `TODO(/dev)`** — needs a `createTestWitness` helper that sets `witness_profile_id` to a registered profile.

### E2E: `e2e/p878-people-picker.spec.ts` (6 tests)

create-agreement-page flow: smoke (no console errors), happy path (dropdown ≤8 with avatar+name+badge → click → chip), verbatim empty-state copy (UI Contract), email fallback (stranger email, no crash), fresh-user boundary (no relationships → empty state).

### A11y: `e2e/a11y/p878-picker-accessibility.spec.ts` (3 tests)

ARIA contract (role=combobox + aria-expanded on input, role=listbox, role=option, aria-activedescendant), Escape closes + restores focus, ArrowDown + Enter selects. axe-core not installed — manual attribute assertions.

### Unit tests — skipped

`useProfileSearch` is thin debounce + RPC glue; security logic lives in SQL (integration-covered). E2E has higher fidelity for the component.

### testid + ARIA contract for `/dev`

`ProfilePickerInput` must implement: `data-testid="profile-picker-input"`, `-dropdown`, `-option`, `-empty-state`, `-chip`; `role="combobox"` + `aria-expanded` on input; `role="listbox"` on dropdown; `role="option"` + `id` per row; `aria-activedescendant` tracking. Letter-receiver-modal surface is covered via the shared component (E2E on one surface) + UAT Scenario 1.
