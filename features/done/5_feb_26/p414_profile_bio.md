---
status: done
completed_at: "2026-02-23"
type: feature
rank: 125466
workstream: foundation
created_date: 2026-02-23
tags: []
uat_file: features/uat/p414.md
test_files:
  - src/tests/linkify.test.ts
  - e2e/integration/p414-profile-bio-migration.spec.ts
  - e2e/p414-profile-bio.spec.ts
  - e2e/p414-smoke.spec.ts
  - e2e/a11y/p414-accessibility.spec.ts
---

# P414: Profile bio

## Problem

Users have no way to add a short self-description to their profile. Coaches want to share context about their work and include links (LinkedIn, personal site) — similar to a LinkedIn headline/about.

## Solution

Add a `bio` field (plain text, 160 char max) to profiles. Render it on the profile card below the role. URLs in the text are auto-detected and rendered as clickable links. Editable in profile settings.

## Technical Notes

- DB: `bio` column (`text`, nullable) on `profiles` table
- Type: add `bio?: string | null` to `Profile` type
- Display: `compact-profile-card.tsx` — render bio below role with `linkifyText()` utility
- Settings: add textarea to profile settings page (160 char limit + live counter)
- Linkify: regex-based URL parser → wraps in `<a target="_blank" rel="noopener noreferrer">`. Block `javascript:` scheme. Match `https?://` and bare `domain.com` patterns.

## Acceptance Criteria

- [ ] `bio` column exists on `profiles` table
- [ ] Bio displays below role on profile card (only when non-empty)
- [ ] URLs in bio render as tappable links (muted blue, open in new tab)
- [ ] `javascript:` and other dangerous schemes are blocked
- [ ] Settings page has bio textarea with 160 char limit and live counter
- [ ] Hint "Links auto-detected and made clickable" shown below textarea
- [ ] Empty bio hides the bio section entirely (no blank space)

## Testing

Run `/generate-tests` scoped to `linkifyText()` utility before implementing.

---

## Technical

### Technical Analysis

**Current state:**
- Profile display: `src/app/components/profile/compact-profile-card.tsx` — renders avatar, name, role, pledge CTA. No bio field.
- Profile page: `src/app/pages/profile-page-v2.tsx` — uses `compact-profile-card.tsx` as the header card.
- Settings: `src/app/pages/settings-page.tsx` — has `name`, `role`, `linkedinUrl`, `reason` fields. Follows a clean pattern: state per field, single `updateProfile()` call on save.
- `updateProfile()`: `src/app/data/api.ts:662` — explicit `updates` type. `bio` is not yet a field.
- `Profile` type: `src/app/types/` — needs `bio?: string | null` added.
- No `linkifyText()` utility exists anywhere in the codebase.
- Migration naming: `YYYYMMDD[HHMMSS]_description.sql` — today is `20260223`.

**Dependencies:**
- No new npm packages needed (regex-based linkify, no library required).

---

### Architecture Decisions

**Decision 1: Plain text storage, linkify on render**
- **Chosen:** Store raw plain text in DB; parse and render links only at display time.
- **Rationale:** Simplest data model. No markdown, no stored HTML. Single source of truth. Avoids stored XSS.
- **Trade-off:** Linkify runs on every render — negligible cost for a short string.
- **Alternative rejected:** Store with markdown → adds a markdown parser dependency and a richer editor, overkill for a 160-char field.

**Decision 2: `linkifyText()` returns `ReactNode[]`, not an HTML string**
- **Chosen:** `src/app/utils/linkify.ts` — pure function `linkifyText(text: string): ReactNode[]` returning an array of text nodes and `<a>` elements. Rendered directly as React children (no raw HTML injection).
- **Rationale:** Avoids raw HTML string rendering entirely. Each segment is either a plain string (safe React text node) or a React `<a>` element with controlled props. No unsafe patterns needed. Easily unit-tested.
- **Trade-off:** Slightly more complex return type than a plain string.
- **Alternative rejected:** Return an HTML string rendered via a raw HTML approach — higher XSS risk surface, overkill for a simple split-and-wrap operation.

**Decision 3: Allowlist URL scheme (not blocklist)**
- **Chosen:** Only emit `<a>` for `https://`, `http://`, and bare `domain.tld` patterns. Everything else is rendered as a plain text node.
- **Rationale:** Safer than blocking specific schemes — anything not on the allowlist is ignored automatically.
- **Implementation:** Bare domain `href` must be prefixed with `https://` to avoid relative URL resolution.

---

### Security Review

**RLS Policies:**
- ✅ `profiles` UPDATE policy (`USING (auth.uid() = id)`) correctly restricts writes to the row owner. Adding `bio` requires no new policy.
- ✅ SELECT is public (`USING (true)`) — bio is intentionally public data, consistent with `name` and `role`.
- ⚠️ No column-level restrictions exist on UPDATE — a user with a valid session can PATCH any mutable column on their own row directly via the Supabase REST API. Pre-existing issue. Mitigation: `bio` must be added explicitly to `updateProfile()` types (not via a catch-all).
- ✅ Service-role INSERT bypass (`20260212`) is scoped to `TO service_role` — does not affect user-facing writes.

**Authentication:**
- ✅ Settings page redirects unauthenticated users to `/sign-pledge`. RLS enforces ownership server-side.
- ✅ `bio` must be added explicitly to the `updates` type in `updateProfile()`.

**Input Validation:**
- ⚠️ Add `CHECK (bio IS NULL OR length(bio) <= 160)` DB constraint in the migration. Client `maxLength={160}` alone is bypassable via direct API calls.
- ✅ Using `ReactNode[]` approach for linkify means text segments are plain React strings (not injected HTML) — XSS-safe by construction.
- ⚠️ Bare domain `href` must be prefixed with `https://` (not left as a relative path).
- ✅ Allowlist approach (only `https?://` and bare domains) naturally blocks dangerous schemes.
- ✅ Unit tests must cover injection attempts (`javascript:`, `vbscript:`, `data:`, `<script>` in text).

**Data Protection:**
- ✅ Bio is voluntary public self-description (same sensitivity as `role`). No encryption or masking required.
- ✅ No PII concern specific to this field.

---

### Implementation Approach

**Files to create:**
1. `src/app/utils/linkify.ts` — `linkifyText(text: string): ReactNode[]` pure utility
2. `supabase/migrations/20260223_p414_profile_bio.sql` — adds `bio TEXT` column with 160-char CHECK constraint

**Files to modify:**
1. `src/app/data/api.ts` — add `bio?: string` to `updateProfile()` updates type
2. `src/app/types/index.ts` (or wherever `Profile` is defined) — add `bio?: string | null`
3. `src/app/components/profile/compact-profile-card.tsx` — render bio below role using `linkifyText()`
4. `src/app/pages/settings-page.tsx` — add `bio` state + textarea (160 char, live counter, hint text)

**Build sequence:**
1. Migration — add `bio` column with CHECK constraint
2. `Profile` type — add `bio?: string | null`
3. `updateProfile()` — add `bio?: string` to updates type
4. `linkifyText()` utility — `ReactNode[]` return, allowlist URLs, prefix bare domains with `https://`
5. `compact-profile-card.tsx` — display bio (only if non-empty)
6. `settings-page.tsx` — edit bio (textarea + counter + hint)
7. Run migration: `./scripts/migrate.sh`

---

## Test Coverage Strategy

**What's tested:**
- ✅ `linkifyText()` utility (unit) — URL detection, scheme allowlist, bare domain prefixing, injection attempts, edge cases
- ✅ DB migration (integration) — bio column exists, NULL default, 160-char CHECK constraint, RLS owner write, RLS cross-user block
- ✅ Profile display (E2E) — bio shown/hidden, URL renders as link, link attributes correct
- ✅ Settings edit (E2E) — textarea present, counter live-updates, 160-char cap, save persists, pre-populate
- ✅ Accessibility — textarea has label, keyboard focusable, links have text and are keyboard-reachable
- ✅ Smoke — profile page and settings page load without console errors

**What's NOT tested (rationale):**
- ❌ React rendering of bio text node directly — covered by E2E display tests
- ❌ Full settings form (name, role, etc.) — pre-existing, not P414 scope

**Test pyramid:**
```
        /\
       /  \    6 E2E + 2 smoke + 4 a11y
      /----\
     / 5 INT \
    /----------\
   /  27 UNIT   \
```

**Files generated:**
- `src/tests/linkify.test.ts` — 27 unit tests
- `e2e/integration/p414-profile-bio-migration.spec.ts` — 5 integration tests
- `e2e/p414-profile-bio.spec.ts` — 6 E2E tests
- `e2e/p414-smoke.spec.ts` — 2 smoke tests
- `e2e/a11y/p414-accessibility.spec.ts` — 4 accessibility tests
- `features/uat/p414.md` — 10 UAT scenarios

**Total:** 44 automated tests + 10 UAT scenarios

---

## UX

### User Flows

**Display path (profile card):**
1. Visitor or owner navigates to `/p/{slug}`.
2. App fetches profile. `bio` field is populated from the `profiles` row.
3. If `bio` is non-empty: bio is rendered below the role line, above the divider, using `linkifyText()` to turn detected URLs into `<a>` elements.
4. If `bio` is `null`, empty string, or whitespace-only: the bio block is omitted entirely — no blank space, no placeholder text.
5. The pledge CTA (`View My Pledge` / `Take the Pledge` / `View their pledge →`) renders below the divider, unchanged.

**Edit path (settings page):**
1. Authenticated user navigates to `/settings`.
2. Page pre-populates the bio textarea with the current `bio` value (empty string if `null`).
3. User types or edits bio text. Live counter updates on every keystroke: `{n} / 160`.
4. At 160 characters the textarea stops accepting input (`maxLength={160}` enforced client-side; DB CHECK constraint enforces server-side). Counter turns red at limit.
5. URLs typed into the textarea are plain text — no live preview. Hint text below the field explains the auto-detection.
6. User clicks `Save Changes`. `updateProfile()` is called with `bio: bio.trim() || undefined`. On success: toast confirms, `hasChanges` resets.
7. If `bio` is cleared entirely, `undefined` is sent — DB stores `NULL`, bio section disappears from the profile card.

---

### Screen Designs

**Profile card — bio visible:**
```
┌─────────────────────────────────────────────────┐
│  [●]  Sarah Chen                                │
│       Executive Coach · ICF PCC                 │
│                                                 │
│       Helping leaders communicate with          │
│       clarity under pressure. 10+ yrs.          │
│       linkedin.com/in/sarahchen                 │
│                                                 │
│  ─────────────────────────────────────────────  │
│  [  View My Pledge  ]                           │
└─────────────────────────────────────────────────┘
```
- Bio sits between the role line and the horizontal divider.
- URLs render as tappable links: muted blue (`text-blue-500`), `target="_blank"`, `rel="noopener noreferrer"`.
- Plain text segments render as regular `text-sm text-muted-foreground`.
- Bio wraps naturally — no fixed height or truncation.

**Profile card — bio empty (no bio section rendered):**
```
┌─────────────────────────────────────────────────┐
│  [●]  Sarah Chen                                │
│       Executive Coach · ICF PCC                 │
│                                                 │
│  ─────────────────────────────────────────────  │
│  [  View My Pledge  ]                           │
└─────────────────────────────────────────────────┘
```
- Role line is immediately followed by the divider. No gap, no empty bio block.

**Settings page — bio field (inserted after Role, before Save):**
```
┌─────────────────────────────────────────────────┐
│  ← Back                                         │
│  Settings                                       │
│  Update your public profile information         │
├─────────────────────────────────────────────────┤
│  Name *                                         │
│  [ Sarah Chen                               ]   │
│                                                 │
│  Role / Position                                │
│  [ Executive Coach · ICF PCC                ]   │
│                                                 │
│  Bio                                            │
│  [ Helping leaders communicate with         ]   │
│  [ clarity under pressure. 10+ yrs.         ]   │
│  [ linkedin.com/in/sarahchen               ]   │
│  Links auto-detected and made clickable.        │
│                                          112/160 │
│                                                 │
│  LinkedIn URL                                   │
│  [ https://linkedin.com/in/sarahchen        ]   │
│                                                 │
│  What inspired me to take the pledge?           │
│  [ ...                                      ]   │
│                                                 │
│  [ ✓ Save Changes ]  No changes to save         │
└─────────────────────────────────────────────────┘
```
- Field label: `Bio` — not "Description", not "About".
- Textarea: `rows={3}`, `resize-none`, matches existing `reason` textarea styling (`px-4 py-3 rounded-lg border border-input bg-background focus:outline-none focus:ring-2 focus:ring-ring`).
- Hint text: `Links auto-detected and made clickable.` — rendered as `text-sm text-muted-foreground` below the textarea, left-aligned.
- Character counter: right-aligned below the textarea, `{n}/160`. Turns `text-red-500` at 160 (matches `reason` counter pattern).
- Hint and counter appear on the same row: hint left, counter right.

---

### Edge Cases

| Case | Behavior |
|---|---|
| Empty bio (null or `""`) | Bio block hidden on profile card. Textarea pre-fills empty. Saving empty bio sends `undefined` → DB stores NULL. |
| Whitespace-only bio | Treated as empty: `bio.trim()` sends `undefined` on save; display side trims before checking emptiness. |
| Bio with only URLs | Entire bio renders as links. No plain text segments. Card shows one or more clickable links below the role line. |
| Bio at exactly 160 chars | Counter shows `160/160` in red. No further typing accepted. Save succeeds if other fields are valid. |
| Bio with mixed text and URLs | Text segments render as plain `text-muted-foreground`, URL segments render as blue `<a>` links. Both inline within the same `<p>` element. |
| Very long single URL (no spaces) | URL regex matches the full token; rendered as a single link. Wraps naturally in the card layout. No truncation. |
| Dangerous URL schemes (`javascript:`, `vbscript:`, `data:`) | Allowlist approach: only `https://`, `http://`, and bare `domain.tld` patterns emit `<a>` elements. Dangerous schemes are rendered as plain text. |
| `<script>` or HTML in bio text | `linkifyText()` returns `ReactNode[]` — text segments are plain React strings, never injected as raw HTML. XSS is structurally impossible. |
| Bio saved then cleared | User deletes all text in textarea → Save sends `undefined` → DB stores NULL → bio block disappears from profile card on next load. |
| No role set, bio set | Bio renders directly below the name line (role line is already conditionally hidden when `profile.role` is falsy). |
| Role set, no bio | Profile card shows name + role + divider + CTA. No bio block. Identical to current behaviour. |

---

### Accessibility

**Textarea label:**
- `<label htmlFor="bio">Bio</label>` — explicit label association via `id="bio"` on the textarea.
- No `aria-required` needed — bio is optional.

**Character counter:**
- Counter `<span>` is `aria-live="polite"` so screen readers announce the updated count without interrupting the user mid-type.
- Alternatively, the counter `id` is referenced via `aria-describedby="bio-counter"` on the textarea so the count is surfaced in the field's accessible description.

**Links in bio (profile card):**
- Each `<a>` element rendered by `linkifyText()` uses the URL text as its accessible name. No additional `aria-label` needed when the link text is the full URL (descriptive enough).
- Links are natively keyboard-focusable (`Tab` key). No additional `tabIndex` required.
- `target="_blank"` links include `rel="noopener noreferrer"` — standard practice, no UX impact.

**Keyboard navigation (settings page):**
- Bio textarea appears in natural DOM order after Role, before LinkedIn URL.
- `Tab` from Role input → Bio textarea → LinkedIn URL input. No skip or reordering needed.
- `Shift+Tab` reverses the order as expected.

**Focus ring:**
- Textarea uses `focus:ring-2 focus:ring-ring` — consistent with all other inputs on the settings page. Visible focus indicator satisfies WCAG 2.1 SC 2.4.7.

**Colour contrast:**
- Bio text uses `text-muted-foreground` (existing token, meets contrast requirements as used elsewhere for role/secondary text).
- Links use `text-blue-500` — same token as pledge CTAs elsewhere in the card. Contrast verified as part of the existing design system.

---

### Responsive

Bio text wraps naturally within the card and settings form at all viewport widths. No special treatment is needed:
- Mobile (`< 640px`): bio wraps inside the existing card padding (`p-6`). Long URLs break at word boundaries naturally (CSS `word-break: break-word` is inherited from the card container).
- Desktop: bio renders inline with the existing card width. No fixed width or max-width overrides.
- Textarea in settings: `w-full` matches the existing Name, Role, and LinkedIn inputs — fills the container at all widths.
