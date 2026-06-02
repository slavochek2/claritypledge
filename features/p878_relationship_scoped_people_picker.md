---
status: week
type: story
rank: 1000768
workstream: C1
created_date: '2026-06-02'
tags: [people-picker, privacy, agreements, letters]
delivery_stage: create-spec
pipeline_ran: [create-spec]
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

5. **UI.** Typeahead dropdown on the existing email inputs. A selected result carries `profile_id` (used to address the invite server-side per P877); the raw email field remains as the first-contact fallback. Each result shows an `is_verified` / `has_pledged` badge to blunt name-impersonation.

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

- [ ] A user can type a name and pick, from a dropdown, a person they already share a letter/agreement/witness relationship with — without typing an email
- [ ] The search result payload contains no email (verified by inspecting the network response)
- [ ] The selected person is addressed by `profile_id`; the letter/agreement is created correctly end-to-end
- [ ] A non-admin user searching a stranger's name gets zero results (cannot discover people they have no relationship with)
- [ ] The founder's account (`is_admin = true`) can find any user by name
- [ ] First contact with a never-before-contacted person still works via email entry / invite link
- [ ] No personal email address appears anywhere in committed code (pre-commit privacy check passes)
- [ ] Rate limit returns gracefully (empty/throttled) under rapid repeated queries
- [ ] Regression coverage: search RPC never leaks email; non-admin scope enforced; admin override works

## UX Notes

- **Happy path:** focus email field → type ≥3 chars of a known contact's name → dropdown of ≤8 matches with avatar + name + verified badge → click → field resolves to that person (chip), invite addresses by `profile_id`.
- **Empty/no-match (non-admin):** "No one you've connected with matches. Enter their email to invite them." — routes to the first-contact email path; never implies the person doesn't exist on the platform (avoids account-existence oracle).
- **First-contact:** typing a full email that isn't in scope still works (post-P877 safe lookup / invite).
- **Loading:** debounced query (reuse the existing debounce in `create-agreement-page.tsx`); subtle spinner in the dropdown.
- **Self:** exclude the caller from results (existing "you can't invite yourself" guard).

## Acceptance Criteria

- [ ] Picker works on all three surfaces: letter recipient, agreement create, agreement accept
- [ ] Works on mobile (375/320px) and desktop — dropdown does not overflow the email field container
- [ ] Verified badge visible on results so the user can distinguish a real contact from a lookalike
- [ ] Non-admin cannot enumerate or contact strangers via the picker; admin (founder) can search all
- [ ] Falls back cleanly to email entry for first contact with no console errors

## UI Contract

| Element | Value | Context |
|---------|-------|---------|
| Min chars before search | 3 | All picker surfaces |
| Max results shown | 8 | Dropdown list |
| Result row | avatar + name + (verified/pledged badge) | No email, no slug-as-handle shown |
| No-match copy (non-admin) | "No one you've connected with matches. Enter their email to invite them." | Empty state |
| Selected state | name chip resolving to profile_id | Replaces raw email entry |
