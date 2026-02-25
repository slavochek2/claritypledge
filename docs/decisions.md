# Decisions Log

Append-only log of architectural and product decisions. Newest entries at top.

**Format:**
```markdown
## YYYY-MM-DD: Decision Title

**Context:** Why this came up
**Decision:** What we chose
**Alternatives rejected:** What we didn't choose
**Consequences:** What this means going forward
```

---

## 2026-02-25 [process]: Parallel subagent codebase audit — pattern and findings

**Context:** Codebase had accumulated config drift, doc contradictions, and coupling issues across months of feature work. Ran a systematic audit using 4 parallel Explore agents (config, code, docs, spec-drift), each producing a prioritized report.
**Decision:** Use parallel Explore agents for periodic codebase health reviews — 4 agents × 10 min = full sweep, then fix agents in parallel. Total: ~1 hour for comprehensive audit + all fixes applied and verified.
**Alternatives rejected:** Manual review (too slow, misses cross-file patterns); single sequential agent (loses parallelism advantage).
**Consequences:** Run this pattern ~monthly or after a sprint of heavy feature work. Key findings that became fixes: (1) mock service files re-exported facade names (bypasses `VITE_USE_REAL_API`), (2) production components importing from prototype directory, (3) tsconfig alias pointing to non-existent path, (4) Supabase dev auth redirecting to wrong port, (5) duplicate docs causing contradictory agent guidance.
**References:** `docs/technical/architecture.md`

## 2026-02-25 [technical]: Service mock files must not re-export under facade name

**Context:** `points-service-mock.ts`, `stories-service-mock.ts`, and `calibration-service-mock.ts` each had a "legacy compatibility" block re-exporting `pointsService = mockPointsService` etc. — the same name used by the facade. Any code importing from the mock directly would get a hardcoded mock, silently bypassing `VITE_USE_REAL_API`.
**Decision:** Mock files export only their own name (`mockXxxService`). The facade (`xxx-service.ts`) is the only file that exports `xxxService`. Type re-exports in mock files are fine and retained.
**Alternatives rejected:** Keeping the legacy exports with a deprecation comment — creates ongoing confusion with no benefit since no consuming code used them.
**Consequences:** The switchable facade pattern is now correctly enforced. Applies to all future service additions: mock file → `mockXxxService` only, facade → `xxxService` only.
**References:** `src/app/data/points-service.ts`, `src/app/data/points-service-mock.ts`

## 2026-02-25 [technical]: Sitemap must use canonical routes, not redirect aliases

**Context:** Google Search Console flagged one page as "Page with redirect". The sitemap had `/clarity-champions`, but the actual route is `/pledgers` — `/clarity-champions` redirects to it. Google followed the redirect but flagged the sitemap URL as non-canonical.
**Decision:** Sitemap entries must always point to the canonical URL (the route the page renders on), never to a redirect alias.
**Alternatives rejected:** Removing the `/clarity-champions` redirect — it's a user-facing alias kept for usability.
**Consequences:** Whenever a route is renamed or aliased, update `public/sitemap.xml` to the canonical. The SEO component's `url` prop must also match the canonical (e.g., `url="/pledgers"`, not `url="/clarity-champions"`).
**References:** `public/sitemap.xml`, `src/app/pages/clarity-pledgers-page.tsx`

## 2026-02-25 [process]: Code review after test writing, not after committing

**Context:** After implementing inline text expand, the fix agent wrote 9 tests and they all passed. A code review subagent then found: (1) `QuotedStory` surface had zero tests despite being in scope, (2) slice/threshold mismatch (140 vs 150) was an implementation bug, (3) missing `role`/`tabIndex`/`onKeyDown` on interactive span. All three were caught by code review, not by green tests.

**Decision:** After any test-writing step, run a code review agent on the tests AND the implementation together before considering the work done. Green tests ≠ correct tests.

**Alternatives rejected:** Trusting green tests alone — they proved insufficient; the bugs were in what the tests didn't assert, not in what they did.

**Consequences:** `/fix` and `/dev` should include code review as a parallel step after tests pass, before committing. The verify + code-review-in-parallel pattern used this session is now the standard.

---

## 2026-02-25 [process]: Agent auto-commit policy + /status as universal reorient

**Context:** Sessions accumulated multiple finishing skills (/wrap, /ship, /status) with overlapping responsibilities, causing confusion about which to use when. Simultaneously, the insights report showed 28% of friction was git commit hygiene — lint errors and pre-commit failures at wrap time.

**Decision:** (1) Agents commit autonomously when a logical unit of work is complete and tests pass. Pushing always requires explicit user approval. (2) /wrap and /ship archived — redundant once agents commit during work rather than accumulating changes for a manual end-of-session commit. (3) /status is the single "reorient me" command for any moment (mid-session, end-of-session, after compaction). It outputs: Done / Problems / Open questions / Next — conversation memory only, no git scanning. (4) Pre-commit ESLint auto-fix added to pre-commit-checks.sh — fixes staged files before lint check, re-stages them, so fixable errors never block commits.

**Alternatives rejected:** Keeping /wrap as "commit + open questions ritual" — redundant with auto-commit. Per-edit ESLint hook (PostToolUse) — adds latency to every file write; pre-commit fix is sufficient since lint only matters at commit time.

**Consequences:** No manual closing ritual required. /status replaces /wrap for any "where are we?" need. Skills that auto-trigger (fix-kanban, kanban refresh) are internal — users never call them directly. /cleanup and /fix-kanban remain for explicit maintenance.

**References:** [status.md](../.claude/commands/slava/maintain/status.md), [pre-commit-checks.sh](../scripts/pre-commit-checks.sh), [CLAUDE.md](../CLAUDE.md#commit-discipline)

---

## 2026-02-25 [process]: Prod-first debugging + mandatory browser verify for UI fixes

**Context:** Insights analysis identified 45% of friction was "wrong approach" — Claude spending time on static code analysis when a direct prod query would surface the answer in 60 seconds. Separately, fixes were being declared done based on tests passing without browser confirmation, leading to incomplete fixes being discovered later.

**Decision:** (1) For runtime/data/behavior issues: first action is a live prod query (Supabase MCP, Sentry MCP, or curl). Static code reading only after real data is in hand. Exception: build/compile/type errors where no runtime data exists. (2) Browser verification is mandatory for any UI change — navigate to affected route, screenshot, confirm. "Tests pass" is necessary but not sufficient. Chrome DevTools MCP for headless, Claude in Chrome for authenticated pages.

**Alternatives rejected:** Static-first analysis — proven to waste time discovering missing DB columns after reading 10 files. Opt-in browser verify ("run /verify? y/n") — the opt-in pattern was consistently skipped, producing false "done" declarations.

**Consequences:** Debugging protocol documented in debugging.md. fix.md updated: browser check is automatic step in Phase 4, not optional. Any agent declaring a UI bug fixed without a screenshot is violating the protocol.

**References:** [debugging.md](../docs/technical/debugging.md), [fix.md](../.claude/commands/slava/build/fix.md), [CLAUDE.md](../CLAUDE.md#debugging)

---

## 2026-02-25 [process]: Three-layer CLAUDE.md edit protection

**Context:** Agents were bypassing the /claude-md validation gate and editing CLAUDE.md directly, causing rule contradictions and knowledge scatter (e.g. /spec-review mandatory in one file, optional in another after a single session).

**Decision:** Three-layer protection: (1) PreToolUse hook blocks all CLAUDE.md / rules/*.md edits, exits 1 unless `/tmp/.claude-md-gate-ok` marker exists; (2) `/claude-md` skill creates the marker after completing validation; (3) `/day-end` reviews any CLAUDE.md changes from the day via `/claude-md` subagent and outputs VALID/NEEDS REVISION in an AGENT CONFIG section.

**Alternatives rejected:** Advisory PostToolUse reminder only — proven ineffective (agents ignored it mid-flow). `/status` check — too late once changes are committed.

**Consequences:** Every CLAUDE.md edit requires an explicit gate step. The 30-minute marker expiry means one validation unlocks one edit session. Skill files (`.claude/commands/`) are NOT gated — only CLAUDE.md and `.claude/rules/*.md`.

**References:** [claude-md-gate-pre.sh](../.claude/hooks/claude-md-gate-pre.sh), [claude-md/SKILL.md](../.claude/commands/slava/maintain/claude-md/SKILL.md), [day-end.md](../.claude/commands/slava/day-end.md)

---

## 2026-02-25 [process]: Commit autonomous, push always needs user OK

**Context:** Reflected on commit/push ownership — agents were either asking for every commit (too slow) or unclear about push authority.

**Decision:** Agents commit independently when tests pass and change is clearly complete (during skill runs). In open-ended conversation, suggest the commit first. Push to remote always requires explicit user approval — ask before every push, no exceptions.

**Alternatives rejected:** Always ask before commit — unnecessary friction on skill runs. Full autonomy including push — too risky for shared remotes.

**Consequences:** Skill runs (`/dev`, `/fix`) are now fully autonomous through commit. Push is a deliberate human gate. Wired into CLAUDE.md Commit Discipline section.

---

## 2026-02-25 [process]: /spec-review made optional in Sequential Flow

**Context:** /spec-review was sitting in CLAUDE.md Sequential Flow as mandatory ("ALWAYS") but this was inconsistent — it adds overhead for simple features and was contradicted by the optional `*` notation used for /decompose.

**Decision:** /spec-review is optional (`*`), same as /decompose. Use when spec evolved significantly since architect review, or as a pre-dev sanity check. Updated in CLAUDE.md, generate-tests/SKILL.md, and docs/development-process.md.

**Alternatives rejected:** Keep mandatory — adds gate overhead for every feature regardless of complexity.

**Consequences:** Agents no longer run /spec-review by default. It's a judgment call for the developer/agent based on spec complexity.

---

## 2026-02-25 [product]: Mirror agent persona deferred — validate core loop first

**Context:** P425 spec included a post-save naming prompt ("Want to give your mirror a name?") to introduce the "mirror agent" concept. Spec review surfaced it as unvalidated: no storage, no service call, and the concept itself (AI as a named personal mirror) hadn't been tested with users.

**Decision:** Remove the mirror agent persona from V1 entirely. No naming prompt, no mirror name, no "mirror" framing surfaced to users. The AI just speaks. Mirror agent as a named, persistent entity is deferred until the core filing loop is validated.

**Alternatives rejected:** Visual stub (render prompt, no persistence) — rejected because a stub that does nothing on click actively damages trust on first use; better to not show it at all.

**Consequences:** Future features that want to introduce the mirror concept (naming, memory, persona) need a dedicated feature. P425 must not reference "your mirror" in any user-visible copy. The system prompt can use "mirror" internally to guide AI tone, but users never see the label.

**References:** [p425_ai_story_core_loop.md](../features/p425_ai_story_core_loop.md)

---

## 2026-02-25 [technical]: AI rate limiting pattern — sliding dual guard, user-friendly messaging

**Context:** P425 introduces the first Claude API edge function. Without rate limiting, a single user can make unlimited API calls — direct cost amplification. Fixed hourly windows are punishing (user hits limit at 11:59, resets at 12:00 but loses the previous window's allowance).

**Decision:** Two-guard sliding window pattern for any AI-backed edge function:
- **Burst guard:** max 10 calls per rolling 5 minutes (stops rapid-fire abuse)
- **Sustained guard:** max 30 calls per rolling 60 minutes (sliding, not fixed-hour reset)
- Track in `ai_rate_limits(user_id, called_at)` table. Query by time window on each call.
- On limit hit: return 429 with message `"You've been on a roll — take a short break and you can keep going in X minutes."` Never use the word "rate limited."

**Alternatives rejected:** Fixed hourly window — punishes legitimate users at the hour boundary; Deno KV — adds infrastructure not already in the stack; per-story limit — harder to implement and easier to game.

**Consequences:** All future AI edge functions should follow this pattern. The `ai_rate_limits` table is shared — future functions add a `feature` column to scope limits independently. User-friendly messaging is the standard: no technical jargon in rate limit responses.

**References:** [p425_ai_story_core_loop.md](../features/p425_ai_story_core_loop.md)

---

## 2026-02-25 [process]: Prod test agent for agent-driven post-deploy verification

**Context:** Stories were silently broken in production for months — no tests, no alerts, nothing caught it until a user noticed. Needed a way for the agent to verify prod DB/RLS without requiring slava's browser session.

**Decision:** Dedicated service account `test-agent@claritypledge.com` on prod with `is_verified=true`. Agent authenticates via `scripts/prod-smoke-test.mjs` to verify auth, profile, story INSERT/SELECT/DELETE, and public anon access. Credentials stored in `.env.local` (gitignored). Run after any deployment touching stories, auth, or RLS.

**Alternatives rejected:** Only relying on integration tests (they run against test DB, not prod schema/data); user browser testing (can't automate without user's credentials).

**Consequences:** Post-deploy verification is now 3-second automated check. Test agent must never leave data footprint (creates+deletes its own test rows). Documented in `.private/docs/testing.md` and referenced in `/ship` skill.

**References:** [prod-smoke-test.mjs](../../scripts/prod-smoke-test.mjs) · [.private/docs/testing.md](../../.private/docs/testing.md)

---

## 2026-02-25 [technical]: Service-layer errors must Sentry-capture — log() is DEV-only anti-pattern

**Context:** `createStory` was silently returning `null` in production with no visibility. The `log()` utility wraps `console.log` behind `import.meta.env.DEV` — it's a no-op in prod. Auth failures, RLS rejections, and Supabase errors were swallowed entirely.

**Decision:** All real service functions that can fail at auth or DB level must call `Sentry.captureMessage` / `Sentry.captureException` on every failure path, not just `log()`. Pattern added to `stories-service-real.ts`: auth check → Sentry error, INSERT failure → Sentry exception with context.

**Alternatives rejected:** Replacing `log()` with `console.error` (clutters prod logs and not structured); adding a prod-aware `log()` variant (more indirection, same risk of forgetting).

**Consequences:** Every new real service (`*-service-real.ts`) must follow this pattern. `log()` is fine for debug-level tracing — it's `log()` on error paths that's the anti-pattern. Sentry captures give actionable context (error code, user ID, hint).

**References:** [stories-service-real.ts](../../src/app/data/stories-service-real.ts)

---

## 2026-02-25 [process]: Feature flag env vars must be verified in Vercel at deploy time

**Context:** `VITE_USE_REAL_API` controlled mock vs. real stories service. It was set in `.env.local` but never added to Vercel. Result: prod ran mock mode for months, stories table was always empty, users got mock data.

**Decision:** Any `VITE_*` feature flag that switches prod behavior must be added to Vercel environment variables explicitly. Vercel does not inherit `.env.local`. VITE_* vars are baked at build time — missing = wrong build, not a runtime fallback.

**Alternatives rejected:** Defaulting to real API (safe but hides the gap); using runtime config (adds complexity, not our pattern).

**Consequences:** Deployment checklist must include: "Are all required VITE_* vars set in Vercel?" For any new feature flag, add to Vercel immediately when adding to `.env.local`. Never assume `.env.local` = Vercel.

---

## 2026-02-25 [technical]: Navigation guard without useBlocker (BrowserRouter constraint)

**Context:** P427 needed an unsaved-changes guard on the story detail page. `useBlocker` from react-router-dom was the obvious tool, but crashed the app with an error boundary.

**Decision:** `useBlocker` requires `createBrowserRouter` (data router context). The app uses `BrowserRouter` (no data router). Guard implemented via two mechanisms: (1) `handleBack` override that checks dirty state before calling `navigate()`, and (2) `popstate` event listener (capture phase) for browser back button.

**Alternatives rejected:** `useBlocker` (requires data router migration — too large a scope); `beforeunload` alone (only covers tab/window close, not SPA navigation).

**Consequences:** Every page that needs a navigation guard must override its own back-handler AND register a popstate listener. If we ever migrate to `createBrowserRouter`, replace both with `useBlocker`. `pendingNavigateRef` tracks the intended destination so the Leave button navigates to the right place regardless of how the prompt was triggered.

**References:** [story-detail-page.tsx](../../src/app/pages/story-detail-page.tsx)

## 2026-02-24 [product]: Calibration unlocks from any paraphrase exchange — no story, no perfect score (P413)

**Context:** Calibration was gated on 5 story verifications where speaker rated 10/10. In practice the bar stayed empty forever — required story selection, full rating flow, and a perfect speaker score. Real calibration data only needs two numbers: listener self-estimate + speaker's rating of them, which are available after any completed exchange.
**Decision:** Every completed paraphrase exchange (both ratings submitted) counts toward calibration, regardless of whether a story was selected and regardless of score. `story_id`/`version_id` are now nullable on `story_verifications`. Threshold stays at 5 to unlock the display.
**Alternatives rejected:** Separate lightweight table (unnecessary — `story_verifications` already holds all required fields; nullable FKs are simpler). Lowering the threshold below 5 (not needed — we just made 5 reachable, not too easy).
**Consequences:** Calibration bar will actually fill in normal usage. Any future trigger that touches `story_id` on this table must guard against NULL.
**References:** [p413 spec](../features/done/21_feb_26/p413_calibration_from_any_paraphrase.md)

---

## 2026-02-24 [process]: Done-Features INDEX.md as Institutional Memory Layer

**Context:** Agents start each session with no memory of past specs/decisions. `features/done/` had 70+ completed feature files — knowledge went in, nothing came out to inform future work. The write-only archive problem.
**Decision:** Maintain `features/done/INDEX.md` — one line per completed feature, grouped by domain, focused on gotchas/patterns/decisions. `/kdd` step 4.5 appends to it when a feature closes. CLAUDE.md "Before Starting Work" step 4 instructs agents to grep it before touching a related area.
**Alternatives rejected:** Grep-before-filing check (only catches duplicates at filing time, not the retrieval problem). Hook-based auto-update (produces title dumps, not learnings — quality requires judgment). Weekly agent regeneration (too infrequent, same quality problem).
**Consequences:** INDEX.md quality depends on `/kdd` discipline. If `/kdd` is skipped, INDEX.md drifts. The mechanism is correct; the lever is habit.
**References:** [features/done/INDEX.md](../features/done/INDEX.md)

---

## 2026-02-24 [product]: StoryGuideChat Embeds as Overlay — No Page Navigation (P428)

**Context:** P428 adds story filing from inside `/live` sessions. The initial P425 spec described navigating to `/chat?from=live&sessionId=XYZ`, which would redirect the user away from the active session. P428 requires the story-filing flow to be available without leaving `/live`.

**Decision:** `StoryGuideChat` is a self-contained component embeddable as a bottom-sheet overlay. P428 renders it over `/live` — no router navigation involved. Completion is signaled via `onStoryConfirmed(storyDraft)` callback; the overlay closes and the user returns to the session. P425 updated to match: "embed as overlay, pass sessionId as prop" (not "navigate to /chat").

**Alternatives rejected:**
- Navigate to `/chat?from=live` — removes user from the active session; back navigation is disruptive mid-session
- Modal on `/live` with router state — couples story filing to `/live` page internals; `StoryGuideChat` would need to know about the host route

**Consequences:** `StoryGuideChat` must never import from `react-router-dom` or call `navigate()` internally. The component receives all context (pointId, sessionId) as props and emits results via callbacks. This constraint must be enforced at code review for P425 and all future embeddings.

**References:** [P428](../features/drafts/p428_live_position_story_filing.md) | [P425](../features/p425_ai_story_core_loop.md)

---

## 2026-02-24 [technical]: Never Truncate Point Text in Voting Contexts (P434)

**Context:** Point statements had `line-clamp-2` applied in `StoryCardDetail`, `profile-page-v2`, `story-card-with-links`, `PointCardDetail`, and `point-card-with-links`. Discovered during `/verify` when a point was visually cut off mid-sentence. A user being asked to vote on a claim must be able to read it in full.

**Decision:** Two rules established:
1. **Browse vs. voting context:** `line-clamp-N` is acceptable on point text only in browse/scan contexts (e.g., content picker lists like `live-content-cards.tsx`). In any context where voting buttons (`PositionButtons`) are present, point text must never be clamped.
2. **`compact` prop decoupling:** Font size (`text-sm`) and truncation (`line-clamp-2`) are independent concerns. Never bundle them in the same conditional branch (`compact ? 'text-sm line-clamp-2' : 'text-base'`). A compact layout can use smaller text; it cannot truncate text the user must read to make a decision.

**Alternatives rejected:** Leaving truncation in compact mode as "acceptable for space reasons" — rejected because the user may encounter the compact variant in a voting context in the future.

**Consequences:** When adding `line-clamp` to any component that renders point text, check: are `PositionButtons` present anywhere in the render tree? If yes, no clamp. When adding a `compact` prop that affects text display, always keep font size and truncation as separate class conditions.

**References:** [P434](../features/done/21_feb_26/p434_point_statement_truncation.md)

---

## 2026-02-24 [product]: AI Story Filing Ships on `/chat` Page, Not Inline Panel (P425)

**Context:** Original P425 UX spec had the story-filing loop as an inline panel below `PositionButtons` on the point-detail page. After running `/ascii-flows` to map the interaction, the inline panel created a fragmented UX — user is mid-flow on point-detail, gets context-switched into a filing experience without a clear home.

**Decision:** Story filing lives on `/chat` — a persistent page. Entry from position: a single "Tell your story →" button navigates to `/chat?from=position&pointId=XYZ`. `/chat` without params shows a bare input ("What's on your mind?"). The `StoryGuideChat` component must remain embeddable (bottom-sheet overlay over `/live` for P428) — no page-level navigation coupling. `/chat` is NOT in bottom nav or desktop nav V1 — entry is exclusively via "Tell your story →" CTA on point-detail pages.

**Finalized UX decisions (2026-02-24):**
- **Mirror agent identity:** Personal mirror, not a product persona. No fixed name. User can name it after their first story is filed (stored in private settings, not visible to others).
- **Draft visibility:** `draft` is the fourth visibility state on the existing story card component (Draft / Private / Shared / Public) — no new component needed. Dynamic button label: Save draft / Save privately / Publish story based on selected state.
- **Context chip:** Reuses the existing point profile component, display-only (no position buttons). Position badge dropped from chip; story and story-point link persist.
- **Understanding arc:** Simplified pills showing rating history after second draft (v1: 6 → v2: 8...) — only appears after second iteration.
- **AI message format:** A/B/C options rendered as plain text in the message bubble; user replies via the input field.

**Alternatives rejected:**
- Inline panel below PositionButtons — fragments the experience, hard to return to, no persistent home
- Modal — same problem; takes over UI without giving user a dedicated space
- Nav item in V1 — entry via CTA is sufficient; adds nav complexity before proving the flow

**Consequences:**
- Entry is exclusively via "Tell your story →" CTA on point pages (V1)
- `/chat?from=position&pointId=XYZ` is the canonical entry URL from position flow
- `StoryGuideChat` must be embeddable (no router coupling) — tested by P428 bottom-sheet requirement
- `[▷ Start /live]` appears inline in the chat thread on a saved story card
- Draft state required in visibility model before P425 ships

**References:** [P425](../features/p425_ai_story_core_loop.md) | [P428 constraint](../features/drafts/p428_live_position_story_filing.md)

---

## 2026-02-24 [technical]: Story Visibility RLS — Correlated EXISTS over event_rsvps (P424)

**Context:** The `shared` visibility level was deferred at implementation (P126) — the RLS policy silently collapsed `shared` to author-only. P424 implemented the full three-branch policy.

**Decision:** RLS `shared` condition uses a correlated EXISTS subquery joining `event_rsvps` (co-registration). No denormalized table, no triggers, no materialized view.

```sql
OR (
  visibility = 'shared'
  AND auth.uid() IS NOT NULL
  AND EXISTS (
    SELECT 1 FROM event_rsvps reader_rsvp
    WHERE reader_rsvp.profile_id = auth.uid()
      AND EXISTS (
        SELECT 1 FROM event_rsvps author_rsvp
        WHERE author_rsvp.event_id = reader_rsvp.event_id
          AND author_rsvp.profile_id = stories.author_id
        UNION ALL
        SELECT 1 FROM events hosted
        WHERE hosted.id = reader_rsvp.event_id
          AND hosted.host_id = stories.author_id
      )
  )
)
```

**Client-side gate rule:** Remove client-side visibility guards once RLS is the enforcement layer. `getStory()` returning null = unauthorized — no need to distinguish "not found" from "forbidden" (enumeration prevention). Any consumer filtering by `visibility` in application code is a bug.

**Feed vs. contextual queries:** `getStoriesFeed()` has an explicit `.eq('visibility','public')` — shared stories intentionally excluded from global discovery. `getStoriesForPoints()` trusts RLS — shared stories surface in point context for co-registrants.

**Alternatives rejected:**
- Denormalized `story_access(story_id, viewer_id)` table — requires triggers/jobs to stay current as RSVPs change; premature at current scale.
- Postgres function `user_can_read_story()` — adds schema object for single call site; inline EXISTS is cleaner.

**Consequences:** "Shared" scope is permanently expanding — future RSVPs to any event the author ever attended auto-grant access. Safe, intended, but warrants tooltip copy that warns authors. If scale grows (tens of thousands of stories/users), add a materialized summary table.

**References:** [migration](../supabase/migrations/20260224120000_p424_visibility_model.sql)

---

## 2026-02-24 [product]: AI Story Filing = Calibration Session (P425/P419)

**Context:** Story filing was slow (hours manually), used a blank form with no scaffolding, and would block workshop participants. The existing `sifter-story.md` CLI skill already encoded the full calibration loop logic.

**Decision:** Story creation is a calibration session between user and AI:
1. Brain dump → AI mirrors as first-person story (NVC scaffolding, invisible to user)
2. 0-10 rating → banded AI responses: 10=save, 8-9=3 targeted correction options, 5-7=AI names its uncertainty + options, <5=re-attempt
3. Escape hatch after 3 iterations: "save at current rating or keep refining?"
4. Silent polish pass, then polished version shown to user before saving
5. Visibility selector (default: private)

Source of truth for prompt logic: `.claude/commands/slava/content/sifter-story.md` — build on it, never rebuild.

Two-spec architecture:
- **P425** (core loop): position-triggered, no point extraction. Ships first.
- **P419** (V1): extends P425 with standalone "Create Story" entry + point extraction after confirmation. Hooks in via `onStoryConfirmed(storyDraft)` callback — P419 must not modify `StoryGuideChat` internals.

**Alternatives rejected:**
- Manual concierge (Wizard of Oz) — building with AI agents is faster than running manually; concierge cost > build cost at current solo-dev scale
- Rebuilding sifter logic — escape hatch, banded responses, polish pass all already exist in sifter-story.md

**Consequences:** Every story filing session is a calibration artifact. Author explicitly confirms ≥8/10 before publish. Workshop participants can file without prior training.

**References:** [P425](../features/p425_ai_story_core_loop.md) | [P419](../features/p419_filing_chat_v1.md)

---

## 2026-02-24 [product]: Story Visibility Model — Shared = Co-Registration, Feed = Public Only (P424)

**Context:** "Shared" was always deferred (behaved like private in RLS). Default was "public" (privacy risk). UI order was Public→Shared→Private. No way to edit visibility after creation. "Shared" meaning was ambiguous.

**Decision:**
- `private`: author + explicitly granted users. Grant table deferred — RLS currently implements author-only as a temporary measure. "Private ≠ author-only" is the intent; the grant UI is a follow-on spec.
- `shared`: anyone who has registered for the same event as the author — past AND future signups. Scope is co-registration, not attendance. Audience expands as new people RSVP. Authors should be warned in UI that audience is permanently expanding.
- `public`: anyone, logged in or not
- Default changed from `public` → `private`
- UI order: Private → Shared → Public
- Global feed (`getStoriesFeed`): public-only. Shared stories are NOT surfaced in the general feed — they appear on specific point pages and profiles where RLS grants access to co-registrants. Per-event feed is a future spec.
- Edit visibility available post-creation (UI gap fixed)

**Implementation gotcha — three places change together:**
Changing DB column default alone is insufficient. Application layer sends the TypeScript default explicitly, overriding the DB default. Must change: (1) DB column default, (2) `createStory` TypeScript param default, (3) `mapStoryFromDb` + `updateStory` fallback values (`?? 'public'` → `?? 'private'`).

**Alternatives rejected:**
- Shared stories in global feed — "shared" means peer visibility within event circles, not broadcast
- Denormalized `story_access` table for RLS join — premature; existing `event_rsvps` UNIQUE index is sufficient at current scale

**Consequences:** New stories default private — safer for workshop participants. Shared stories become discoverable to event co-registrants via point pages. RLS is now the sole visibility enforcement for stories (client-side gate in `story-detail-page.tsx` removed).

**References:** [P424](../features/done/20_feb_26/p424_visibility_model.md)

---

## 2026-02-24 [process]: Vercel CLI token in .env.local for autonomous deployments

**Context:** Banner regeneration worked in dev but not prod. Root cause: `VITE_UNSPLASH_ACCESS_KEY` was in `.env.local` but never added to Vercel's environment variables. Features using `VITE_*` build-time vars require manual Vercel config on every new API key — easy to miss. Also needed a way for the agent to do this autonomously without browser automation.

**Decision:** `VERCEL_TOKEN` is now in `.env.local` (gitignored, never committed). Agent uses `vercel` CLI with `--token "$VERCEL_TOKEN"` for env var management and deployments. `.env.prod.example` updated to document `VITE_UNSPLASH_ACCESS_KEY` as required.

**Alternatives rejected:**
- Browser automation each time — fragile, session-dependent, slow
- Vercel MCP — no official MCP server exists

**Consequences:** Agent can now run `vercel env add KEY production --token "$VERCEL_TOKEN"` autonomously. Rule: any new `VITE_*` env var must be added to Vercel dashboard + `.env.prod.example`. VITE_* vars are **baked at build time** — changing them in Vercel requires a redeploy (not just a restart). Verify with: check all lazy chunks for the string, not just main bundle.

---

## 2026-02-24 [process]: Chrome Remote Desktop over noVNC for VM desktop access

**Context:** Need to interact with a headless VM desktop (solve LinkedIn CAPTCHAs, observe running GUI apps like LH). Built noVNC stack (Xvfb + x11vnc + websockify) — proved fragile: SSH tunnels die between sessions, websockify processes multiply, connection breaks frequently.

**Decision:** Replace noVNC with Chrome Remote Desktop (CRD). User accesses via `remotedesktop.google.com` in Chrome — no SSH tunnels, no port forwarding, no extra software on Mac. Google-managed infrastructure, extremely stable.

**Alternatives rejected:**
- noVNC — fragile 4-component chain (Xvfb → x11vnc → websockify → browser), repeated connection failures
- Direct VNC client (TigerVNC) — requires installing app on Mac, still needs SSH tunnel

**Consequences:** One-time CRD install on VM. User visits `remotedesktop.google.com` to see VM desktop anytime. Agent continues to use SSH + xdotool + CDP for programmatic control — CRD is for human interaction only (CAPTCHAs, visual observation). Xvfb still needed as the virtual display that both CRD and headless apps share.

---

## 2026-02-24 [product]: LinkedIn Helper 2 on GCP VM for LinkedIn outreach automation

**Context:** Need LinkedIn outreach to coaches as a growth channel for ClarityPledge. LH is a desktop Electron app (~$15/mo Pro) that automates LinkedIn messaging, connection requests, and campaign management.

**Decision:** Run LH on the existing `clarity-agent` GCP VM (same VM as cloud coding agents). Cloud deployment means campaigns run 24/7 without needing laptop open. Total cost: ~$15/mo LH + ~$3/day VM (VM already paid for coding agents).

**Key technical findings:**
- LH uses a **two-binary architecture**: main launcher (`/usr/lib/linked-helper/linked-helper`) spawns a separate per-account instance binary (`/usr/lib/linked-helper/resources/out/linked-helper`). The instance binary is a full Electron app that needs GPU flags for headless operation.
- **Fix**: Replace instance binary with a wrapper shell script that prepends `--no-sandbox --disable-dev-shm-usage --use-gl=egl-angle --use-angle=swiftshader "$@"` then calls the real binary (renamed to `linked-helper.real`). Without this, instance crashes immediately (`'disconnect' fired` error).
- **LinkedIn window is a separate X11 window** from the LH sidebar — not embedded via BrowserView. Content renders internally (CDP screenshots work) but doesn't composite to X11 display (rendering to EGL offscreen surface).
- **GCP datacenter IP** triggers LinkedIn CAPTCHA on first login — expected, one-time, solved by user via Chrome Remote Desktop.

**Alternatives rejected:**
- LH on local Mac — campaigns pause when laptop closes; cloud is right for 24/7 automation
- Residential proxy at setup — adds cost and complexity; not needed until LinkedIn is suspicious of activity patterns

**Consequences:** LH wrapper script must survive LH auto-updates (updater may overwrite `linked-helper` binary — monitor). First-login CAPTCHA requires user to open Chrome Remote Desktop and solve manually — agent never solves CAPTCHAs. After login, LH maintains LinkedIn session automatically.

**References:** [cloud-agent.md](cloud-agent.md)

---

## 2026-02-24 [technical]: Daily prod DB backup via GitHub Actions → GCS

**Context:** No automated backup existed for the Supabase prod DB. Supabase Free plan has zero automatic backups. A bad migration or accidental DROP would be unrecoverable.

**Decision:** `pg_dump` daily via GitHub Actions cron → gzip → `gs://claritypledge-db-backups/`, 7-day retention. Keyless GCP auth via Workload Identity Federation (no long-lived JSON key). Email alerts on failure via GitHub notification settings (already enabled).

**Alternatives rejected:**
- Supabase Pro ($25/mo) — adds daily backups but costs money; DIY solution is free
- Cron on clarity-agent VM — VM can't reach Supabase direct DB (IPv6-only); session pooler not reachable from VM either
- Supabase IPv4 add-on ($4/mo) — would unblock the VM path but unnecessary given GitHub Actions works
- Service account JSON key — replaced with WIF (no stored credential, token is short-lived per-run)

**Consequences:** Backup runs at 3am UTC daily. Connection uses session pooler `aws-1-ap-southeast-1.pooler.supabase.com:5432` (Singapore region — must match prod project region, not US East). To restore: `gunzip -c backup.sql.gz | psql <session-pooler-url>`. Documented in `.private/docs/backup-recovery.md`. `/weekly` skill checks backup freshness automatically.

**References:** [.github/workflows/db-backup.yml](../../.github/workflows/db-backup.yml), [backup-recovery.md](../../.private/docs/backup-recovery.md)

---

## 2026-02-24 [technical]: Validate Management API response body, not just HTTP status (P417)

**Context:** `profiles.bio` column was absent from prod despite `migrate.sh` reporting the migration "already applied". Supabase Management API returns HTTP 200 with a JSON error object `{"message":...,"code":...}` when SQL fails. The old `apply_via_api()` only checked HTTP status — treated 200 as success, inserted the version into `schema_migrations`, and silently left the schema unchanged. Every subsequent run skipped it.

**Decision:** Added `_check_api_success()` to `migrate.sh`: response body is a JSON array → success; JSON object with `message` key → SQL error, even if HTTP 200. Migration only recorded in history after body validation passes.

**Alternatives rejected:** Post-migration schema verification (query actual columns after apply) — more powerful but complex to implement generically for arbitrary SQL. Kept as a manual debugging step instead.

**Consequences:** `apply_via_api()` now fails loudly on SQL errors instead of silently recording them as applied. Regression test in `scripts/tests/test_migrate_api_response.sh`. When debugging save failures, always verify the column actually exists via REST API curl — don't trust migration history alone.

**References:** [scripts/migrate.sh](../../scripts/migrate.sh), [database.md](database.md)

## 2026-02-23 [process]: promote-blog approval via HTML page in browser

**Context:** Initial promote-blog skill presented copy variants and image options as plain text in the Claude chat window. Hard to review image thumbnails and compare copy side-by-side in a terminal context.
**Decision:** Generate a static HTML approval page at `/tmp/promote-blog-approval.html` and `open` it in the default browser. Page includes: post title + URL, 3 copy cards with full text, 3 image cards with `<img>` thumbnails (Unsplash `urls.regular?w=600`), photographer attribution, and a "[none]" text-only option. After opening, Claude asks for explicit "copy N + image X" confirmation before posting.
**Alternatives rejected:** Plain text in chat — no image preview, hard to compare copy variants at a glance.
**Consequences:** Approval step is now visual. The HTML file is ephemeral (`/tmp/`). Instruction banner must make clear both copy AND image are required (ambiguous "not what" reply cost us an image on the first real post).
**References:** [promote-blog.md](.claude/commands/slava/content/promote-blog.md)

## 2026-02-23 [process]: Blog distribution pipeline — ship-blog + promote-blog as separate skills

**Context:** Initial plan was to embed a LinkedIn post step directly inside `ship-blog`. On reflection, publishing to Ghost+email and distributing to LinkedIn are distinct actions: different timing, different approval flow, and LinkedIn is just the first channel.
**Decision:** Two skills. `ship-blog` = Ghost publish + email newsletter only. `promote-blog` = LinkedIn distribution via Postiz, with copy variants + Unsplash image selection + explicit user approval before posting. User decides when and whether to promote, separately from shipping.
**Alternatives rejected:** Inline LinkedIn step in `ship-blog` — would force automatic posting without approval, can't skip or delay, breaks the principle of "one action per skill."
**Consequences:** Content pipeline is now: `draft-blog` → `ship-blog` → (optionally) `promote-blog`. Each step is independent and reversible. Future channels (X, Instagram) can be added to `promote-blog` without touching `ship-blog`.
**References:** [ship-blog.md](.claude/commands/slava/content/ship-blog.md), [promote-blog.md](.claude/commands/slava/content/promote-blog.md)

## 2026-02-23 [technical]: Postiz API — session cookie auth, correct payload schema

**Context:** Setting up Postiz API calls for `promote-blog`. LinkedIn OAuth scope errors required patching Postiz container, and the API payload format was undocumented.
**Decision:** Three findings from live testing: (1) **Auth**: Postiz public API Bearer token returns 401 from CLI — use `POST /api/auth/login` with `{email, password, provider:"LOCAL"}` to get a session cookie, then use `-b cookie.txt` for subsequent calls. (2) **Payload schema**: `POST /api/posts` requires `{type:"schedule", date, shortLink:false, tags:[], posts:[{integration:{id}, value:[{content, image:[]}]}]}` — not the simpler `{type:"social", channels:[...], content}` shown in the UI docs. (3) **LinkedIn scope patch**: Postiz v2.19.0 requests `w_organization_social` (unavailable as self-service) for both personal and company LinkedIn channels. Fix: `sed -i` org scopes out of compiled JS in the running container. Survives `docker compose restart` but not `docker compose up -d` (container recreate).
**Alternatives rejected:** Bearer token auth — shows in UI as "Public API" token but returns 401 from external curl requests. Cookie session is the working path.
**Consequences:** `promote-blog` skill uses login→cookie→post→delete-cookie flow. After any Postiz container update, re-apply LinkedIn scope patch (see postiz.md). LinkedIn channel ID: `cmlzashw80001t86nxnlk6pi2`.
**References:** [postiz.md](docs/technical/postiz.md), [promote-blog.md](.claude/commands/slava/content/promote-blog.md)

## 2026-02-23 [process]: Sifter quality standards — collapse, hard-to-vary, polish pass

**Context:** First full sifter session (understanding-not-agreement) revealed gaps in the point and story extraction process: points were redundant angles on the same claim, the story had a backwards sentence and a redundant line, and the style was inconsistent (dashes, long sentences).
**Decision:** Four quality standards now enforced across sifter skills: (1) **Collapse pass** — before presenting points, ask "can these collapse into one harder claim?" Redundant angles are not variety. (2) **Hard-to-vary filter** — every word must be load-bearing; soft points that survive rewording are underspecified. (3) **Polish pass before saving** — story approval triggers a review gate (earn every sentence, check direction, remove redundancy) before writing to file; user sees polished version first. (4) **No dashes, short sentences** — em/en dashes break into separate sentences; if a sentence can be two, make it two.
**Alternatives rejected:** None — these emerged from observing failure modes in a live session, not from theoretical options.
**Consequences:** Story and point quality will be higher from first session. More back-and-forth at the extraction stage is acceptable if it produces tighter output. The user can still bypass ratings and state their own formulation directly.
**References:** `.claude/commands/slava/content/sifter-point.md`, `.claude/commands/slava/content/sifter-story.md`

## 2026-02-23 [technical]: Live session cleanup on tab close and logout

**Context:** Sessions only ended when users clicked "Leave." Tab close, browser close, logout, and network crash all left sessions open in the DB — partner stuck waiting indefinitely with no signal. Polling and realtime only detect changes; they can't detect client disappearance.
**Decision:** Two lightweight client-side hooks, no server infrastructure: (1) `pagehide` handler in `clarity-live-page.tsx` — fires `patchClaritySessionLiveState` (creator) or `clearSessionJoiner` (joiner) on actual page unload. (2) `signOut()` in `AuthContext` reads sessionStorage and calls cleanup before signing out. Both are best-effort (errors swallowed, flow continues). Chosen over heartbeat+TTL (needs DB column + cron, adds infrastructure) and Supabase Presence (requires rearchitecting detection layer).
**Alternatives rejected:** Heartbeat+TTL — solves crash/network-drop edge case but adds non-trivial infrastructure for a low-frequency problem. Supabase Presence — correct long-term answer but a refactor, not a fix. Do when session reliability becomes a real user complaint.
**Consequences:** ~90% of real-world ungraceful exits now clean up (tab close, logout, navigation away). Silent crashes and network drops remain unhandled (no heartbeat). Key guards needed: (a) gate `pagehide` on `view === 'live'` only — waiting-room close must not signal `sessionEnded`; (b) check `e.persisted` to skip bfcache suspends; (c) add `pageshow` handler to reset `iAmLeavingRef` on bfcache restore.
**References:** `src/app/pages/clarity-live-page.tsx`, `src/auth/AuthContext.tsx`

## 2026-02-23 [product]: Google OAuth = sign in OR sign up (Option B)

**Context:** Unregistered users invited to events landed on `/login`, clicked "Continue with Google", and were redirected to `/signup?message=no-account` — dropping their RSVP intent. The old P64 guard treated `source=login` with no existing account as an error.
**Decision:** Google auth creates an account if none exists, regardless of which page the user came from (`/login` or `/signup`). Magic link login stays strict — `LoginForm` still calls `checkEmailExists` before sending a link, so magic link remains login-only. New accounts created via login page get `has_pledged=false`.
**Alternatives rejected:** Option A (just carry the redirect params through) — fixes the RSVP intent loss but doesn't fix the deeper UX problem where users don't know which page they belong on.
**Consequences:** `/login` Google button is now effectively "sign in or sign up". Returning users: authenticated as before. New users: account created, redirected to `/events`. `source=login` no longer blocks profile creation in `AuthCallbackPage`.
**References:** [authentication.md](docs/technical/authentication.md), `src/auth/AuthCallbackPage.tsx:199`

## 2026-02-23 [process]: Content pipeline — two-folder structure and cross-link registry

**Context:** First blog post published end-to-end, exposing gaps in the pipeline: skills looked in wrong folders, no cross-linking mechanism, /story vs /sifter-story were confused.
**Decision:** `content/stories/` = raw blog narratives (output of `/story`). `content/blog/` = polished drafts (output of `/prepare-blog`). Both are blog pipeline. `content/sifter/sessions/` is completely separate (app content, not blog). `content/links.md` = canonical registry of terms to auto-link on first mention in every post.
**Alternatives rejected:** Single content folder (loses the raw/polished distinction); manual inline links (error-prone, not discoverable).
**Consequences:** `/draft-blog` searches `content/stories/` first, `content/blog/` second. After each post ships, add its URL to `content/links.md`. Skills (`draft-blog`, `ship-blog`) updated to reflect two-folder pattern.
**References:** [content-process.md](docs/content-process.md), [links.md](content/links.md)

## 2026-02-23 [technical]: Ghost newsletter email delivery verification pattern

**Context:** Ghost `/ghost/api/admin/emails/` endpoint returns 501 NotImplementedError. After publishing with `?newsletter=default-newsletter&email_segment=all`, there was no obvious way to verify email was actually queued.
**Decision:** Use `GET /ghost/api/admin/posts/{id}/?include=email` to check delivery. Wait ~15s after publish, then check `posts[0].email.status`. `submitted` = sent to Mailgun successfully. `pending` with error = Mailgun failure (usually invalid API key). `delivered_count` stays 0 without Mailgun webhooks — that's normal.
**Alternatives rejected:** `/emails/` endpoint (501), `/posts/{id}/test/` endpoint (404 — Ghost v5.130 has no test email feature).
**Consequences:** `/ship-blog` skill updated. If email shows `pending` + error, root cause is almost always the Mailgun API key — rotate at app.mailgun.com, update in Ghost Admin → Settings → Email newsletter → Mailgun.
**References:** [ship-blog.md](.claude/commands/slava/content/ship-blog.md), [ghost-blog.md](docs/technical/ghost-blog.md)

## 2026-02-23 [technical]: Router registration is a required step — page files don't auto-register

**Context:** `home-page.tsx` and `HomePage` component existed with full implementation (dashboard with events, people, quick actions), but navigating to `/home` rendered a blank page. React Router logged "No routes matched location '/home'". The file had been written but never added to `App.tsx`.

**Decision:** New pages must be explicitly registered as `<Route>` entries in `src/App.tsx`. Building a page file is not enough. Checklist when a page seems to exist but shows blank:
1. Check `App.tsx` for the route
2. Check the import at top of `App.tsx`
3. Check build hash in browser matches latest deployed build (stale cache can mask a working route)

**Alternatives rejected:** Auto-discovery via file-system routing (would require Vite plugin and architectural change; not worth it at current scale).

**Consequences:** Before declaring a page "done", verify it's navigable via its URL. The `/verify` skill catches this (blank page = functional fail), but the root cause is always App.tsx registration.

**References:** [App.tsx](../src/App.tsx)

## 2026-02-23 [technical]: Event lifecycle — datetime is truth, status is a derived cache

**Context:** `getPastEvents()` filtered on `status = 'completed'`, but no mechanism existed to transition events to that status (no UI, no trigger, no cron). Result: the Past tab was silently empty for every user since events launched. Discovered when a real hosted event (Clarity Dinner #1) disappeared after its datetime passed.

**Decision:** Treat `datetime` (+ `duration_minutes`) as the authoritative source of truth for whether an event is past. `status` is a DB cache that should reflect reality but can't be trusted as a gate.
- `getPastEvents()` now matches on `status = 'completed' OR (status = 'upcoming' AND datetime < now)` — defensive fallback so stale status never hides events again
- `EventDetail.isPast` and `EventCard` "attended" label use `endDate < new Date()`, not `status`
- A migration backfills any stuck `upcoming` events when the app deploys

**Alternatives rejected:** Pure cron/trigger to auto-complete status (adds infra complexity; the query fix is simpler and more resilient). Status-only gate (requires guaranteed transition, which is fragile).

**Consequences:** Any new query over the `events` table that filters by "is past" must use datetime, not status. Status remains useful for explicit cancellation and as a fast index hint, but never as a sole filter.

## 2026-02-22 [technical]: Navigation hierarchy — events-centric, explicit destinations over browser history

**Context:** Back buttons used `document.referrer` to detect "came from within the app" and call `navigate(-1)`, falling back to `/` or `/events`. This is broken in SPAs — `document.referrer` reflects the original page load URL, not the previous React route. Users clicking Back from point/story detail were landing on the fallback (`/events` or `/`) even when navigating within the app.

**Decision:** Explicit, hard-coded destinations per page based on the actual nav graph:
- **Story detail → author's profile** (`/p/:authorSlug`) — stories always belong to someone
- **Point detail → `navigate(-1)`** — points reachable from both story and profile; browser history handles both; fallback `/events`
- **Profile → `/events`** — events is the home base (app is events-centric, not profile-centric)
- **Pledge → `/p/:slug`** — always sub-page of its owner's profile

**Alternatives rejected:** `document.referrer` check (unreliable in SPA); passing `?from=` URL params (overengineered for current nav graph); always `navigate(-1)` (correct for in-app but gives no fallback for direct links).

**Consequences:** If the nav graph changes (e.g. points accessible from a new surface), revisit point detail's fallback. Profile's Back is unconditional — no history-aware behavior intentionally.

---

## 2026-02-20 [technical]: StoryCardDetail is single source of truth for linked point display (P407)

**Context:** Story detail page showed linked points twice: once inside `StoryCardDetail` (collapsible with full `QuotedPoint` cards), and again in `KeyPointsSection` (a flat list with unlink buttons). Both rendered the same `story.points` array. The `KeyPointsSection` list was built separately and never updated to use the richer `QuotedPoint` component.

**Decision:** Remove the point list from `KeyPointsSection` entirely. `KeyPointsSection` becomes the add-form only (textarea + position picker + Add Point button + `justCreated` banner). `StoryCardDetail` is the single display surface for linked points — it auto-expands on `isDetailView={true}` and provides position buttons.

**Alternatives rejected:** Keeping `KeyPointsSection` list and removing `StoryCardDetail`'s collapsible — would lose position buttons and the richer `QuotedPoint` UI. Adding unlink (✕) buttons to `QuotedPoint` inside `StoryCardDetail` — mixing display and edit concerns in a shared component.

**Consequences:** Any future edit controls on linked points (unlink, reorder) belong in `StoryCardDetail`, not in a separate list. `KeyPointsSection` props no longer include `points[]` — only `pointCount` for deciding whether to show the empty state vs. "Add a Point" button.

**References:** [P407 spec](../features/done/20_feb_26/p407_story-detail-points-unification.md)

---

## 2026-02-20 [process]: Agent-automated migrations via Management API PAT fallback

**Context:** Agents running `scripts/migrate.sh` couldn't apply migrations when the Supabase CLI primary path failed (pooler SASL auth from localhost is a known constraint). The Management API fallback already existed in the script, but it read the PAT exclusively from the macOS keychain — which agent sessions can't access. The only path forward was a human manually running `supabase login` or manually applying SQL.

**Decision:** Three-part fix to make the full migration cycle autonomous:
1. **PAT fallback in `migrate.sh`**: after the keychain lookup, fall back to `SUPABASE_ACCESS_TOKEN` from the env file. Agents add this token to `.env.local` once; keychain wins when humans run the script, env file wins when agents do.
2. **`schema_migrations` INSERT in `apply_via_api`**: after each successful Management API SQL apply, INSERT the version into `supabase_migrations.schema_migrations ON CONFLICT DO NOTHING`. This keeps CLI migration history in sync so future `db push` runs don't re-apply or error on already-applied files.
3. **`--env prod` flag**: `./scripts/migrate.sh --env prod` reads `.env.prod` instead of `.env.local`, giving a simple test→prod promotion path. `.env.prod.example` documents the required fields. `.env.prod` is gitignored.

**Alternatives rejected:** Storing the PAT in a shared secrets manager — over-engineering for a two-person project. Adding a separate `promote-to-prod.sh` — the env flag is simpler and self-documenting. CI/CD pipeline for migrations — added complexity, pooler auth issues would still block it from localhost runners.

**Consequences:** Agents can now create and apply migrations to test end-to-end without human touch. Promoting to prod is a one-liner. The PAT must be present in `.env.local` (`SUPABASE_ACCESS_TOKEN`) for agents; human runs are unchanged (keychain takes priority). See `.env.prod.example` for the prod credentials template.

**References:** [scripts/migrate.sh](../../scripts/migrate.sh) · [.env.prod.example](../../.env.prod.example) · [cli-tools.md](cli-tools.md)

---

## 2026-02-20 [technical]: Partial DB merge for live_state to prevent race-condition overwrites (P399)

**Context:** `updateLiveState()` in `clarity-live-page.tsx` did a full read-modify-write of the `live_state` JSON column: it read `confirmedLiveStateRef.current`, merged updates into it, and wrote the entire blob back. Because `confirmedLiveStateRef` can be stale (subscription skipped while in-flight, or partner selection not yet arrived), any partial write — a rating, `celebrationAcknowledgedBy` — from the participant with a stale ref would silently overwrite the partner's `selectedStoryData` → story disappeared mid-round for both participants.

**Decision:** Added `patch_live_state(p_session_id, p_patch)` Postgres RPC (`jsonb || merge`). `updateLiveState` now routes:
- **Partial merge** when updates don't include story/content fields → DB preserves whatever fields weren't in the update
- **Full overwrite** when updates intentionally set or clear story fields (story selection, "Speak Freely", round reset)

**Alternatives rejected:**
- *Fetch-then-write*: add a DB read before every write to get fresh state. Correct but adds a round-trip, and still has a narrow race window between read and write.
- *Never skip subscription events*: remove the in-flight guard. Would re-introduce the "flashing button" regression (old state delivered before DB save completes).
- *Surgical call-site fix (Option 1)*: explicitly preserve story fields in every `updateLiveState` call. Fragile — requires touching every call site and fails if the ref itself is stale.

**Consequences:** The write path for `live_state` now has two modes. Any new `updateLiveState` caller that doesn't include story fields in its `updates` object automatically uses partial merge — safe by default. Callers that intentionally clear story fields must include those keys in `updates` (which they already do).

**References:** [clarity-live-page.tsx:701](../src/app/pages/clarity-live-page.tsx) · [api.ts: patchClaritySessionLiveState](../src/app/data/api.ts) · [migration: 20260220130000_patch_live_state_rpc.sql](../supabase/migrations/20260220130000_patch_live_state_rpc.sql)

---

## 2026-02-19 [process]: /verify skill — two-party setup, resumability, triage mode (P397)

**Context:** `/verify` runs live UAT in Chrome. Two-party scenarios (any `/live` feature with a listener) required ~15 min of manual browser setup per session. Context resets wiped all in-progress results. When scenarios failed, the skill investigated root causes instead of moving on — turning UAT sessions into debugging sessions.

**Decision:** Six targeted edits to SKILL.md (no scripts, no new infrastructure):

1. **Resume detection (Step 2):** Parse the Test Execution Log table. Skip rows already marked ✅/❌/⏭️. If all done, jump to report. Max context loss on reset = 1 test.
2. **Two-party detection (Step 2):** Scan UAT scenarios for `**Requires:** two-party` tag. Set boot flag once; run boot macro before the first tagged scenario.
3. **Two-party boot macro (5a-TWO-PARTY):** Converted from prose documentation to an executable 5-step numbered procedure. Steps B1–B5: check listener tab → log in → creator creates session → listener joins → confirm IdleScreen on both. Failure at any step stops and reports exactly which step failed. Credentials reference `TEST_LISTENER_EMAIL`/`TEST_LISTENER_PASSWORD` from `.env.test.local` — no inline values.
4. **React Fill Macro as default (Step 5c):** `mcp__claude-in-chrome__fill` silently corrupts React-controlled inputs (failure surfaces only downstream, wasting the entire session setup). React Fill Macro using `nativeInputValueSetter` + dispatching both `input` and `change` events is now the documented default for all app inputs.
5. **Per-scenario scorecard write (Step 5f):** Write UAT result to the file after every scenario. Don't batch at Step 7. Step 7 is now a completeness check only.
6. **Triage Rule (after Step 5e):** On ❌/⚠️ — write result + expected/actual, move immediately to next scenario. Do NOT open source files. Do NOT investigate. Root cause is `/fix`'s job.

**Alternatives rejected:** Playwright-based two-party automation — heavier, separate from the visual UAT flow. Hardcoded credentials in SKILL.md — public repo, unacceptable.

**Consequences:** Two-party setup: ~15 min → under 2 min. Full 18-scenario session target: under 20 min. Scorecard is always current; sessions are resumable after context reset. Failures no longer derail the session. The `**Requires:** two-party` tag is the stable interface for future features — any feature UAT file can opt in.

**References:** [.claude/commands/slava/build/verify/SKILL.md](.claude/commands/slava/build/verify/SKILL.md) | [features/uat/p272.md](features/uat/p272.md)

---

## 2026-02-19 [technical]: Kanban status reversion — root cause confirmed, fix applied

**Context:** Cards manually moved to `all-done` via CardDialog status selector repeatedly reverted back to `done`. Happened twice across many cards.

**Root cause (confirmed via `git ls-files`):** The kanban PATCH handler moved files on disk using Node.js `rename()` but did NOT update git's index. As a result, git HEAD retained BOTH the old path (`features/done/5_feb_26/pXXX.md`) and the new path (`features/pXXX.md`). Any git operation that synced the working tree to HEAD (checkout, pull, reset, stash pop) restored the old `done/5_feb_26/` copy. The kanban scanner then found BOTH copies — one with `status: done` (in Done column) and one with `status: all-done` (in All Done). The user saw the card "back in Done" even though the `all-done` copy still existed.

**Decision:** Three-layer fix:
1. `moveAndStage()` — after every file move in the PATCH handler, call `spawnSync('git', ['add', '--', newPath])` and `spawnSync('git', ['rm', '--cached', '--', oldPath])` to stage the move in git's index immediately. Uses `spawnSync` with arg arrays (no shell, no injection risk).
2. `locked_at` frontmatter field — written on every manual status change via the kanban UI; agents must not override status if `locked_at` is present (rule in `.claude/rules/features.md`)
3. `all-done` documented in `.claude/rules/features.md` as a valid status with its file location semantics

**Alternatives rejected:** Using `git mv` — cleaner but adds git as a hard dep to the move logic; `spawnSync` pair is equivalent and easier to reason about. Prompting users to commit after every status change — error-prone, same problem will recur.

**Consequences:** Kanban file moves now auto-stage in git (index only, not committed). `git status` will show the moves as staged deletions/additions after the PATCH. Users should commit these alongside their normal work. If git is unavailable (no repo), `spawnSync` fails silently and the move still succeeds on disk.

---

## 2026-02-18 [technical]: Live session positions stored in live_state, not point_positions (P275)

**Context:** Unverified guests joining `/live` sessions were silently blocked from setting positions on points. `point_positions` INSERT policy requires `is_verified = true` — guests never complete verification and thus could never register positions during a session.

**Decision:** Store positions taken during a live session in `live_state.livePositions` (a JSONB field on `clarity_live_turns`), synced in real-time via the existing Supabase Realtime mechanism. For verified users, positions are also attempted to `point_positions` as a best-effort persistent write (fails silently for unverified guests — expected).

**Alternatives rejected:** Adding a bypass RLS policy for `point_positions` to allow unverified users — this would undermine the integrity constraint that only verified users' positions appear in the public position feed. Storing a "guest session" flag on users — adds complexity without clear benefit.

**Consequences:** `/live` positions are ephemeral by default; they exist for the session and are accessible via live_state. Verified users get persistence in `point_positions` for free. Code consuming point positions for calibration or profile display must NOT read from `live_state` — these are separate concerns. See P275 for migration details.

---

## 2026-02-18 [process]: Supabase migration workflow — scripts/migrate.sh + one-file-per-day rule

**Context:** Supabase CLI (`db push`) was completely blocked by a history sync issue: multiple migration files shared the same 8-digit date prefix (e.g., five files on `20260206_*.sql`). The CLI tracks one history entry per date (primary key = 8-digit timestamp), so those extra files appeared as permanently "untracked" — `db push` refused every time with "Found local migration files to be inserted before last migration." Attempts to use `--include-all` were unsafe (non-idempotent SQL). Direct DB access (`pg`, `psql`) failed — pooler rejects connections with "Tenant or user not found".

**Decision:** Two-part fix:
1. **One-time repair**: Renamed 11 untracked migration files to unique dates (preserving logical order, especially `p124_sub_room_guards` after `fix_event_sub_rooms_schema` which drops the table). Used `supabase migration repair --status applied` to mark each as applied without re-running SQL. History is now fully in sync.
2. **Permanent workflow**: `scripts/migrate.sh` — extracts DB password from `SUPABASE_DB_URL` in `.env.local`, runs `migration list` then `db push`. Run this after every new migration file. No Dashboard required.

**Rule going forward:** One migration file per day. If multiple same-day migrations are needed, use 14-digit timestamps (`YYYYMMDDHHMMSS`) to guarantee uniqueness.

**Alternatives rejected:** `--include-all` (re-runs already-applied SQL, unsafe for non-idempotent migrations like `CREATE TABLE`). Direct SQL via `pg` node client or `psql` (pooler returns "Tenant or user not found"; direct DB host DNS fails). Supabase Dashboard for every migration (manual, blocks agent autonomy).

**Consequences:** Agents can now create and apply migrations autonomously without human intervention. Migration workflow is `create .sql file → ./scripts/migrate.sh`. The old documented pattern (`--db-url` from `.mcp.json`) is obsolete — `.mcp.json` uses OAuth HTTP transport now, not a DB URL.

**References:** [cli-tools.md](technical/cli-tools.md) | [scripts/migrate.sh](../scripts/migrate.sh)

---

## 2026-02-18 [process]: AI-agent delivery pipeline — spec-as-reference + /decompose for large features

**Context:** Complex features (8-12 files, 6-10 build steps) produce specs of 700+ lines after PRD + UX + Architecture + Tests layers are appended. When /dev loads the full spec to begin implementation, spec alone consumes 30-40% of the context window before any code is read. Features of this size cannot complete in a single context window, and mid-feature compaction corrupts the build state.

**Decision:** Adopted the "spec-as-reference" pattern with `/decompose` orchestration for features above the complexity threshold:
- Spec file remains the single source of truth — all layers are appended to it as before.
- `/decompose` converts the build sequence into a task manifest (`## Implementation Tasks`) appended to the spec. Each task entry contains a title, acceptance criteria, and line-range references to the relevant spec sections.
- `/dev` operates as orchestrator: reads the task manifest only (~80 lines), then dispatches one subagent per task in sequence.
- Each subagent receives only its task entry plus the referenced spec line ranges (50-150 lines total) — never the full spec.
- No single agent ever loads more than ~150 lines of spec context.

**Alternatives rejected:** Team-based parallel agents — too much coordination overhead when tasks have sequential dependencies (DB schema must exist before service layer, service layer before UI). Splitting the spec file into per-layer files — fragments the single source of truth and breaks all existing `/dev` assumptions.

**Consequences:** Context usage on spec drops from 30-40% to under 10% per subagent. Each task runs in a fresh context window with no compaction risk. A failed task can be re-dispatched in isolation without restarting the session. Trade-off: subagents execute sequentially (one at a time), which is slower than a parallel team. `/decompose` adds one pipeline step — only triggered for features meeting the threshold: 5+ files OR 3+ concerns OR 6+ build steps. Below threshold, `/dev` is used directly as before.

---

## 2026-02-18 [process]: E2E test suite — move from sequential (1 worker) to parallel (3 workers)

**Context:** P277. Test suite took 43+ minutes with `workers: 1`. Question: can we parallelize safely given shared Supabase test DB?

**Decision:** `fullyParallel: true`, 3 workers local / 2 CI. Override via `PLAYWRIGHT_WORKERS` env var. Tests that query global state (e.g., "all pledgers" list) marked `mode: 'serial'` at the describe block level.

**Alternatives rejected:** Keeping sequential — too slow for iteration. Separate DB per worker — complex infrastructure overhead not worth it.

**Consequences:** Parallelization safety is now a test authoring rule: all `supabaseAdmin.from()` calls must be scoped by test-specific IDs. Any test touching global state must declare `test.describe.configure({ mode: 'serial' })`. Pre-existing audit confirmed only `pledgers-page.spec.ts` had global state — all others were already scoped.

**References:** [P277](../features/done/p277_e2e-parallelization-multi-worker-test-execution.md), [e2e-testing-guide.md](technical/e2e-testing-guide.md)

---

## 2026-02-18 [technical]: Story detail — author badge and viewer position are independent data

**Context:** On the story detail page, a point card shows the story author's stance badge (their position on their own point) and separately should show the viewing user's current position. These were conflated: the viewer's position was being displayed in the author badge slot.

**Decision:** `StoryCardDetail` now accepts `profileOwnerPositions` (author's positions, always from story owner's profile) as a separate prop from the viewer's position. The story detail page fetches both independently.

**Alternatives rejected:** Reusing a single position fetch — too easy to regress; the data has different semantics.

**Consequences:** Any page embedding `StoryCardDetail` must pass `profileOwnerPositions` explicitly, sourced from the story author's profile, not the viewing session. Added E2E regression test `e2e/story-position-isolation.spec.ts`.

---

## 2026-02-18 [product]: Profile UI — always show ear badge and calibration bar (empty state over hidden)

**Context:** P269 profile improvements. Ear badge (confirmed understanding count) and calibration bar were conditionally hidden when data was 0 / insufficient (< 5 sessions). Design question: show "🦻 0" and an empty calibration track, or hide them until data exists?

**Decision:** Always show both elements. Ear badge shows `🦻 {count}` even when count is 0. Calibration bar renders the track always — no dot when < 5 sessions, tooltip says "5 sessions needed to unlock". Zero count tooltip explains the metric ("stories you fully understood, as confirmed by their owners").

**Alternatives rejected:** Hide when zero — creates jarring appearance threshold, hides feature discovery for new users, simpler code but worse UX. Show placeholder text ("No data yet") — more words, less KISS than an empty bar.

**Consequences:** New users immediately see both elements and understand what they're earning toward. Consistent profile layout regardless of data state — no layout shift when first ear or calibration session arrives. `InlineCalibration` now accepts `UserCalibration | null` (null = empty state).

**References:** [P269](../features/p269_profile-ui-improvements.md)

---

## 2026-02-18 [process]: E2E test infrastructure — known failure categories + remediation plan

**Context:** Full E2E suite analysis: 118 pass / 79 fail / 43 min. All 79 failures are pre-existing (not regressions). Root causes identified and remediation specs created.

**Decision:** Three categories of pre-existing failures, each with a targeted fix spec:

1. **Two-party Realtime failures** (~30 tests, ~15 min wasted) — `browser.newContext()` creates isolated browser environments; Supabase Realtime WebSocket subscriptions do NOT propagate between contexts. DB is updated correctly but the Realtime event never arrives in the other context. Fix: DB polling helper `waitForDBPresence()` — P276.

2. **Mic permission headless** (~6 tests) — headless Chromium can't grant `getUserMedia` without `--use-fake-ui-for-media-stream` in `launchOptions`. Fix: one line in `playwright.config.ts` — P278.

3. **Parallelization blocked at workers: 1** (~21 min opportunity) — one real blocker found (`pledgers-page` global empty-state assertion), all other tests are already parallel-safe. Fix: `fullyParallel: true` + `workers: 3` — P277.

**Alternatives rejected:** Skipping/deleting failing two-party tests — they test real user flows; worth fixing. Mocking Supabase Realtime client-side — higher maintenance, couples tests to implementation details.

**Consequences:** Remediation order: P278 (10 min, safe) → P276 (90 min, fixes 30 tests) → run full suite → P277 (parallelization last, to verify clean baseline first). Target post-remediation: ~15 min suite runtime, ~50 failures → <10 failures.

**References:** [P276](../features/p276_fix-two-party-e2e-db-polling.md) | [P277](../features/p277_e2e-parallelization-multi-worker-test-execution.md) | [P278](../features/p278_e2e-quick-wins-mic-permission-template-skip-flaky-fixes.md)

---

## 2026-02-18 [product]: Unverified guest model — three rules, nothing else

**Context:** Unverified guests (people who join `/live` via invite without an account) accumulate in the DB with no verification path, no clear UX for blocked actions, and no defined lifecycle. We reviewed the full auth model, RLS policies, profile page behavior, and nav state to decide how much to change.

**Decision:** Three rules, keep everything else as-is:
1. Unverified guests are session-only participants — they join `/live`, participate, but cannot create stories, points, or persistent positions. RLS already enforces this; nothing to change.
2. The one verification moment is on `/live` join — when a new unverified guest enters their email and clicks Join, fire the standard Supabase magic link email (same template as signup). Only for `isNew: true`; no repeat emails on re-join.
3. No profile page until verified — `slug: null` means no `/p/username` URL. Own profile shows verification prompt, not content.

**Alternatives rejected:** Post-session email trigger (P41 model) — timing is worse, requires session-end tracking, and P41 has been stalled with dependencies for months. In-session verification prompts — adds complexity mid-flow. Custom email template — reusing the Supabase default is sufficient and removes all dependencies.

**Consequences:** P274 is the minimal implementation (one `signInWithOtp()` call in `getOrCreateGuestUser()` for `isNew: true` users). P273 adds a `useVerificationGate` hook for consistent blocked-action messaging. P41 (coaching teaser) remains a valid future upgrade — P274 is the mechanism, P41 is the content.

**References:** [P273](../features/p273_bug-create-story-unverified-error.md) | [P274](../features/p274_post-session-verification-email.md)

---

## 2026-02-18 [technical]: /live point positions stored in clarity_live_turns, not point_positions

**Context:** P272 requires either participant to update their position on linked points during a `/live` session. The listener is typically an unverified guest (`is_verified: false`). `point_positions` RLS blocks all writes from unverified users. If P272 writes to `point_positions`, the listener's position updates silently fail.

**Decision:** Positions set during a `/live` session are stored in `clarity_live_turns` (or a session-scoped field), not in `point_positions`. Live positions are ephemeral game state — they capture each participant's view before and after the verification round, not their public persistent stance. Persistent positions (shown on profile pages) remain in `point_positions` and require `is_verified: true`. After a round, a verified user's position MAY optionally be written to `point_positions` as a separate, non-blocking update.

**Alternatives rejected:** Relaxing `point_positions` RLS for active session context — more complex, higher risk of unintended access patterns, harder to reason about.

**Consequences:** `point_positions` RLS stays unchanged. P275 must be resolved before P272 ships. Any future feature writing live-session positions must follow the same pattern.

**References:** [P275](../features/p275_bug-live-positions-unverified-rls.md) | [P272](../features/p272_live-story-point-verification.md)

---

## 2026-02-18 [process]: Auto-sweep done/ archive via pre-commit (no manual folder management)

**Context:** `features/done/` root was accumulating loose files whenever features were marked done via Kanban drag-to-done or direct `git mv` — both paths bypass the `/done` skill, which already places files into `{N}_{mon}_{yy}` dated subfolders. The kanban scanner explicitly skips those dated subfolders (they're archives by design, invisible to kanban). The user was manually creating new subfolders when the root got crowded.

**Decision:** `scripts/sweep-done.sh` + pre-commit section 15. On every pre-commit run, any `.md` files sitting at `features/done/` root get auto-swept into the current month's dated subfolder. Script is silent when there's nothing to sweep. Uses `{N}_{mon}_{yy}` naming to stay compatible with `DATE_ARCHIVE_PATTERN` in `scanner-rules.ts`.

**Alternatives rejected:** Reading `completed_at` to route files to their exact completion month — bash `||` vs `|` precedence silently breaks the extraction pipeline (grep's output never reaches sed); and archive folder precision doesn't matter (git log has accurate dates). Switching to `YYYY-MM` naming — cleaner but would require updating `DATE_ARCHIVE_PATTERN` in scanner-rules.ts to keep the kanban archive behavior.

**Consequences:** done/ root stays clean with zero user involvement. Any path that lands files there (Kanban, manual mv, KDD) is caught before the next commit. The sweep runs at commit time, so "current month" is accurate enough for archive purposes.

**References:** [scripts/sweep-done.sh](scripts/sweep-done.sh) | [tools/kanban/lib/scanner-rules.ts](tools/kanban/lib/scanner-rules.ts)

---

## 2026-02-18 [process]: Mandatory integration test layer for every DB migration (P270)

**Context:** P160 (Private Session Mode) shipped with the `is_private` column missing from the production schema cache. The bug reached the `/live` page because 44 automated tests (unit, E2E, smoke, a11y) all mocked the DB, and 22 UAT scenarios were never executed. No layer verified that the migration was actually applied.

**Decision:** Every migration file in `supabase/migrations/` MUST have a corresponding `e2e/integration/` test that (1) proves the column/table exists, (2) tests the default value, and (3) tests non-default writes. The `generate-tests` agent now mandates this. The pre-commit hook warns when a `.sql` file is staged without an integration test.

**Alternatives rejected:** Relying on UAT execution alone — humans forget; relying on unit tests with mocks — they don't touch the real schema.

**Consequences:** Migration bugs are caught by CI before they reach production. `e2e/integration/migration-template.spec.ts` is the reference. `e2e/integration/p270-process-validation.spec.ts` is the retroactive test for P160.

**References:** [e2e-testing-guide.md](docs/technical/e2e-testing-guide.md) | [features/p270](features/p270_integration-test-coverage-for-db-migrations.md)

---

## 2026-02-18 [process]: UAT gate in /done skill + two-client pattern for E2E profile updates

**Context:** P160 UAT had 22 scenarios, all ⬜ (never executed), yet the feature was closed as done. Separately, `service_role` UPDATE on `profiles` proved unreliable in E2E helpers — PostgREST's `SET LOCAL ROLE` doesn't set the `current_setting('role')` GUC, so `auth.uid() = id` policies fail.

**Decision:** (1) The `/done` skill now checks for all-⬜ UAT before closing and warns the developer. (2) E2E helpers that need to update a user's own profile sign in as that user (user JWT) instead of using `supabaseAdmin`. Reference: `createListenerClient()` in `e2e/helpers/test-calibration.ts`.

**Alternatives rejected:** Hard-blocking on all-⬜ UAT — too strict, sometimes UAT is intentionally deferred. Using `supabase.rpc()` with `SET ROLE service_role` — not supported in PostgREST HTTP layer.

**Consequences:** Unexecuted UAT is visible before features are closed. Profile update helpers are reliable. Pattern is: service_role for schema-level checks (column existence), user JWT for data-level operations (profile updates).

**References:** [e2e-testing-guide.md](docs/technical/e2e-testing-guide.md) | [.claude/commands/slava/archive/done/SKILL.md](.claude/commands/slava/archive/done/SKILL.md)

---

## 2026-02-18 [process]: Migrate Supabase MCP from server-postgres to official HTTP transport

**Context:** `mcp__supabase__query` started returning "Tenant or user not found" from the Supabase connection pooler. The old config used `@modelcontextprotocol/server-postgres` with a hardcoded postgres connection string (pooler port 6543). Supabase now offers an official MCP server at `https://mcp.supabase.com/mcp` that uses OAuth.

**Decision:** Switch `.mcp.json` to `type: "http"` with the official Supabase MCP URL. Authenticate via `claude /mcp` → "supabase" → "Authenticate".

**Alternatives rejected:** Resetting the DB password and updating the connection string — would fix the symptom but keep the brittle direct-postgres approach.

**Consequences:** MCP auth is now OAuth-based (more stable, no hardcoded credentials). After any machine/session reset, need to re-run `claude /mcp` to re-authenticate. The old connection string in `.mcp.json.backup` should not be restored.

**References:** [cli-tools.md](docs/technical/cli-tools.md)

---

## 2026-02-18 [product]: Dual-track strategy revised — Coaching PRIMARY months 1-6, Recognition SECONDARY months 7-12

**Context:** Original dual-track (2026-02-11) positioned Recognition as PRIMARY and Coaching as SAFETY. Reality check: coaching validation is concrete and near-term; essays without real data are speculative; earning the right to write essays by having data first is more credible.

**Decisions made:**
1. **Coaching becomes PRIMARY (months 1-6):** Run founder sessions → build real calibration data → prove UX works with paying founders before writing essays about it
2. **Recognition becomes SECONDARY, data-driven (months 7-12):** Use founder session data as evidence for essays. "We ran sessions with 10+ founder pairs, here's what we measured" is more credible than theory-first positioning
3. **Co-founder pairs as primary C-track ICP:** Functioning but misaligned pairs (preventive, not therapeutic). Solo founders routed to community. Investor angle parked.
4. **Investor angle parked until month 4-6+:** Hypothesis noted but deferred — needs coaching validation and case study data first. See future-directions.md FD-2.

**Alternatives rejected:**
- Keep Recognition primary — no real data yet; waiting risks runway
- Abandon Recognition entirely — the long-term vision is still valid, just sequenced later
- Run both tracks fully in parallel — creates resource thrashing

**Consequences:**
- C2 rewritten: co-founder pair sessions (€300-500) not generic workshops ($100/person)
- C3 rewritten: retainer model (€800-1,500/month) not paid events
- C4 added: founder community milestone (€200-300/month add-on)
- R1 timing shifted: starts Month 5 (after C2/C3 build real data), not Month 1
- Lean canvas ICPs and channels updated to reflect new sequencing

---

## 2026-02-17 [product]: P160 — Recording opt-out for privacy-sensitive sessions

**Context:** Every `/live` session was recorded by default (audio → GCS → ML training pipeline). No opt-out existed. Friction points: users practicing with sensitive topics, new users before trust is established, coaches demoing to privacy-conscious clients.

**Decision:** Added per-session recording toggle (default ON, creator-controlled, set before session starts). Joiner inherits creator's setting. Private sessions: no mic permission requested, no audio captured, no GCS upload, no `ml_training_sessions` entry. Session still saved to DB. Toggle locks once session begins.

**Alternatives rejected:**
- Account-level "never record" preference: Loses granularity — users may want some sessions recorded and others not
- Always prompt (no default): Adds friction for the majority who want recording
- Recording off by default: Reduces ML training data unnecessarily; recorded data has consent value

**Consequences:**
- Widens the pool of users willing to try the product (removes recording as a barrier)
- Coach demos to privacy-conscious clients no longer blocked by recording objection
- ML training data only comes from explicitly consenting sessions
- Visual indicator on `/live` required to show current recording state to both participants

**References:** [P160](../features/p160_private_session_mode.md)

---

## 2026-02-12 [product]: Milestone Restructure — M1-M12 → R/C/E/X Track System

**Context:** Milestone analysis revealed structural issues:
- M1-M12 numbering implied linear sequence when actually 3 parallel tracks (Recognition PRIMARY, Coaching SAFETY, Exploratory FUTURE)
- MA/MB/MC buried recognition track (the primary goal) with inconsistent naming
- M6-M12 numbered as if sequential but actually require 12+ months scale to test
- M7+M8+M9 tested same group dynamics hypothesis with 70-80% overlap
- M12 fully redundant with M7/M8/M10 (all tested "history creates trust")
- Priority invisible — couldn't distinguish critical path from exploratory work

**Decision:** Restructured milestones using track-based naming:
- **R-track (Recognition - PRIMARY):** R1 Essay Writing, R2 Spec Publishing, R3 Recognition Checkpoint
- **C-track (Coaching - SAFETY):** C1 Stories+/live+Events, C2 First Workshops, C3 Paid Workshops
- **E-track (Enhancement - CONDITIONAL):** E1 Points+AI, E2 Partners+Async
- **X-track (Exploratory - REQUIRES SCALE):** X1 Asymmetric Conversion, X2 Social Dynamics (merged M7+M8+M9), X3 Network Effects (merged M10+M11+M12)

**Alternatives rejected:**
- Keep M1-M12 numbering, add track field: Numbering still implies false sequence
- Use status flags instead of tracks: Doesn't signal priority or dependencies
- Rename to "Phase 1, Phase 2...": Implies stages when tracks run parallel

**Consequences:**
- 15 milestones → 11 milestones (merged M7-M9, M10-M12; deleted redundant M12)
- Track visibility makes dual-track strategy explicit (recognition primary, coaching safety)
- Priority signaling: R > C > E > X (not sequential, but importance order)
- Clearer kill signals: If R-track fails, pivot to C-only; if C-track fails, stop; if both fail by Month 12, hard pivot or wind down
- Checkpoint gates explicit: Month 3 (both tracks show traction), Month 6 (revenue OR recognition), Month 12 (raise/pivot/continue)
- Files renamed: docs/milestones/m*.md → c*.md, r*.md, e*.md, x*.md
- Created docs/milestones/README.md explaining track system, critical path, decision framework
- Updated cross-references in: decisions.md, theory-of-change.md, lean-canvas.md, feature specs
- Feature frontmatter updated: `milestone: M1` → `milestone: C1` (etc.)

**Rationale:** Old structure optimized for a network-effects future that may never arrive. New structure optimizes for 0-6 month validation work that determines survival.

---

## 2026-02-12 [process]: Switched to taylorwilsdon/google_workspace_mcp for OAuth 2.1 security

**Context:** Using @dguido/google-workspace-mcp (npm) for Google Drive/Docs integration. After MCP config debugging session revealed security concerns, evaluated alternatives. taylorwilsdon's package offers OAuth 2.1 (vs 2.0), 100+ tools (vs 4), and active maintenance (v1.6.0 Feb 9, 2026).

**Decision:** Switched from @dguido/google-workspace-mcp to taylorwilsdon/workspace-mcp (Python/uvx).

**Key improvements:**
- OAuth 2.1 (newer, more secure standard)
- Comprehensive tools: Gmail, Calendar, Tasks, Chat, Forms, Search (not just Drive/Docs/Sheets/Slides)
- Stateless mode option (credentials in memory, not files)
- OAuth proxy for secure authentication flow
- Actively maintained (latest release 3 days ago)

**Alternatives rejected:**
- **Stay with @dguido** - Less secure (OAuth 2.0), limited features, less maintained
- **Google Official MCP** - Most secure (IAM, Model Armor) but unclear if publicly available vs enterprise-only
- **Other packages** (@iflow-mcp, @presto-ai, j3k0) - Less comprehensive or less maintained

**Consequences:**
- Requires Python 3.10+ and uvx (installed via `uv`)
- Different auth flow (OAuth in browser vs env vars only)
- More powerful but slightly more complex setup
- Future access to Gmail/Calendar features when needed

**References:**
- [MCP backup/recovery docs](technical/mcp-backup-recovery.md)
- [taylorwilsdon/google_workspace_mcp on GitHub](https://github.com/taylorwilsdon/google_workspace_mcp)

---

## 2026-02-11 [product]: Dual-track strategy — Recognition primary, coaching safety

> **⚠️ SUPERSEDED by 2026-02-18 entry below.** This entry used "SAFETY TRACK" language for coaching and "PRIMARY" for recognition. The 2026-02-18 decision reversed this: Coaching is now PRIMARY (months 1-6), Recognition is SECONDARY (months 7-12). The reasoning below is preserved for historical context.

**Context:** After 6+ months of strategic uncertainty (coach outreach? workshop pivot? story features?), clarified through founder introspection what success actually looks like. The real goal isn't €5k/month — it's being recognized as "the calibration person" in AI/rationalist circles. Revenue is necessary but instrumental. Coaching workshops provide validation and safety (€5k/month = "enough") while allowing 12 months to prove recognition track viable.

**Decision:** Dual-track strategy with explicit priority:

**PRIMARY TRACK (Recognition):**
- Goal: Be recognized as "the calibration person" in AI/rationalist communities
- Audience: Rationalists, LessWrong, AI researchers
- Positioning: "Calibration infrastructure for personal AI" (not just "communication tool")
- Activities: Essays, specs, technical writing, build-in-public
- Success signals: Essays reach 50+ readers, specs discussed on LW/X, inbound "you're the calibration expert" mentions
- Willing to raise: €100-200k from aligned funders if traction exists (recognition + essays, not just coaching revenue)

**SAFETY TRACK (Coaching):**
- Goal: €5k/month = "enough" to fund recognition work
- Audience: Workshop participants (revenue, not primary positioning)
- Activities: Donation-based workshops → paid tier after validation
- Success signals: 10 customers by Month 3, €3k/month by Month 6
- Role: Validates tool UX, provides case studies, but NOT primary identity

**Why dual-track (Trajectory Model):**
- **Current constraint:** Burnout, low savings, survival anxiety (need €2-3k to feel safe)
- **Month 1-3 (Fear-constrained):** Need cash to reduce survival anxiety → coaching provides bridge
- **Month 4-6 (Psychology recovering):** €5k achieved → less anxious → can focus on recognition work
- **Month 7-12 (Self-worth restoration):** Recognition signals appearing → confidence restored → can be bolder
- **Month 12+ (Unbounded potential):** If trajectory good (recognition + essays resonating) → raise €1M+, swing for 1B company, build calibration infrastructure at scale
- **€5k is not "enough" (ceiling)** — it's "minimum to recover psychology" (unlock point for bigger ambition)
- **Coaching is not fallback** — it's the bridge that restores capacity to solve bigger problems

**Checkpoints (not stop signals):**
- **Month 3:** <10 workshop customers AND essays <50 readers → **can't unlock Month 4-6 psychology recovery** → need to extend Month 1-3 constraints
- **Month 6:** <€3k/month revenue OR zero engagement on specs/essays → **can't unlock Month 7-12 self-worth restoration** → need to stay in recovery mode
- **Month 12:** Zero recognition signals (no inbound, no LW discussion, no "you're the expert") → **can't unlock unbounded ambition phase** → stay focused on smaller scope until recognition appears

These are GATES for unlocking next level, not reasons to quit. If trajectory is good at Month 12 (recognition appearing, essays resonating), constraints lift and ambition becomes unbounded.

**Alternatives rejected:**
- Coaching-only (ignore recognition) — Loses founder's intrinsic motivation, feels like compromise
- Recognition-only (ignore revenue) — Too risky, runs out of runway
- Pretend they're equal priority — False; recognition is PRIMARY, coaching is SAFETY
- Commit to one track now — 12 months needed to validate recognition viability

**Consequences:**
- lean-canvas.md updated: dual customer segments (AI researchers primary, workshop attendees secondary)
- milestones updated: C2 now framed as safety track, R1-R3 recognition track created (Feb 2026 restructure)
- Feature prioritization: Essays/specs infrastructure > workshop features (unless workshop validation failing)
- Brand positioning: Lead with "calibration for AI agents" not "communication workshops"
- Fundraising strategy: If essays reach 200+ readers + spec engagement, approach aligned VCs/angels
- 12-month checkpoint: Feb 2027 — if trajectory good, raise €1M+ and swing for 1B calibration infrastructure company

**Deutsch-compatible framing:**
- Problems are soluble (yes)
- But solving them requires resources and psychological safety (practical constraint)
- As early problems solved (money → psychology → recognition), capacity unlocks for bigger problems
- €5k is not the ceiling — it's the floor that enables swinging for 1B+ calibration infrastructure

**References:** [lean-canvas.md](lean-canvas.md) | [milestones/m2-first-workshops.md](milestones/m2-first-workshops.md)

---

## 2026-02-11 [process]: Kanban Tool - Single Source of Truth for Configuration

**Context:** Kanban tooling had hardcoded port numbers (9050, 9051) in 5 different files. During development, port references drifted out of sync (5050 vs 9050), causing a bug where the shell function and script disagreed about which port to use. Two launch mechanisms (shell function + script) duplicated logic. Root cause: copy-paste development without configuration abstraction.

**Decision:** Create single source of truth for configuration. Implement config-as-data pattern:
- Create `tools/kanban/config.ts` (TypeScript) + `config.cjs` (CommonJS wrapper for shell scripts)
- All consumers import from config instead of hardcoding
- Replace duplicate shell function with simple alias to unified script
- Add `--browser` flag support to launch script

**Alternatives rejected:**
- **Keep hardcoded ports** — would guarantee future drift as requirements change
- **Use environment variables** — overkill for tool-specific config, harder to discover
- **Keep both launch mechanisms** — duplicates logic, maintenance burden

**Consequences:**
- **Maintenance:** Changing ports now requires editing 1 file instead of 5
- **Consistency:** Single source of truth prevents drift
- **Pattern:** Establishes template for other tools (`tools/*/config.ts`)
- **Shell integration:** Config files can be consumed by both TypeScript (import) and shell scripts (node -e require)
- **Terminal restart required:** Shell alias won't work until terminal reloads (shell function in snapshot takes precedence)

**References:** `refactor(kanban): single config source + unified launch` (commit d4c93b5)

---

## Technical Debt / Intentional Decisions

- **Web3Forms API key in source**: The contact form on `/about` uses Web3Forms with a hardcoded access key. This is intentional - Web3Forms access keys are designed to be public (like Stripe publishable keys). Moving to env var is nice-to-have.
- **Mixpanel token in index.html**: Similarly, Mixpanel tokens are client-side by design. Environment variable would be cleaner but not a security issue.
- **"Clarity" naming in code**: Component names use "Clarity" prefix (e.g., `ClarityPledgeApp`, `ClarityChampionsPage`) which matches the brand name "Clarity Pledge".
- **Pledge Version 1 shows "Clarity Pledge"**: In `pledge-text.tsx`, version 1 of the pledge intentionally keeps the original "Clarity Pledge" title for historical accuracy. Users who signed v1 see their original pledge text.

---

## 2026-02-09 [process]: Tested and rejected Playwright CLI for browser automation

**Context:** Investigated adding Microsoft's `@playwright/cli` as a fourth browser automation tool. Research suggested it would be more token-efficient (~10-50 tokens/cmd) than Chrome DevTools MCP (~100-500 tokens/cmd) for agent-driven automation.

**Decision:** Do NOT add Playwright CLI. Keep existing three tools (Playwright Tests, Chrome DevTools MCP, Claude in Chrome).

**Testing results:**
- Installed `@playwright/cli` v0.1.0 globally
- Ran comparative tests: `open`, `snapshot`, `click`, `eval` commands
- **Token efficiency claim disproven:** Chrome DevTools MCP actually used FEWER tokens for simple operations (navigate: ~20 tokens vs CLI's ~56 tokens)
- CLI creates `.playwright-cli/` directory with files (undocumented, needs .gitignore)
- No clear advantage over existing tools

**Alternatives rejected:**
- **Add Playwright CLI anyway** — would increase complexity (3→4 tools) without proven benefit
- **Document CLI for niche use cases** — YAGNI; no demonstrated need

**Consequences:**
- KISS principle applied: tested, measured, rejected
- Stick with 3 browser tools; decision matrix remains simple
- Lesson: verify efficiency claims with actual testing before adding tools

**References:** Code review findings documented this testing session

---

## 2026-02-09 [technical]: Navigation simplification for /live sessions (P116, P128)

**Context:** During P116 (story/point detail pages) and P128 (/live beginning screen), the navigation menu was streamlined to support focused /live sessions. Users in active sessions should see minimal UI to avoid distraction.

**Decision:** Removed user-specific navigation links from the menu:
- **Removed:** "View My Profile" (`/me`) — users access their profile via Settings or direct URL
- **Removed:** "Dashboard" (`/home`) — merged into Events page functionality
- **Removed:** "Co-create" from logged-in menu — accessible via "My Events" page

**Rationale:**
- **Minimize distractions during /live:** Active sessions need focused UI, not full navigation
- **Stories/Points are the new profile:** With P117 backend shipped, profiles now center on stories/points, making separate "My Profile" link redundant
- **Events supersede Dashboard:** The Events page provides the same functionality as the old dashboard

**Migration path for users:**
- Profile access: Settings → profile link, or bookmark `/me` directly
- Event creation: Navigate to Events page
- Co-create functionality: Integrated into Events workflow

**Consequences:**
- Cleaner navigation during /live sessions (P128 `inActiveSession` flag hides nav items)
- Reduced menu clutter for authenticated users
- "Sandwich pattern" (P115): Public links (Pledgers, Manifesto, About) + separator + Account actions (Settings, Log Out)
- Existing `/me`, `/home`, `/co-create` routes still work (not deleted, just removed from nav)

**References:** [P116](../features/done/p116_story_point_detail_pages.md) | [P128](../features/archive/p128_live_beginning_screen.md) | commit 951bb7b

---

## 2026-02-07 [process]: Milestones replace hypotheses (P130)

**Context:** Hypotheses and kanban lived in separate worlds. Features had statuses and priorities but no "why." Hypotheses had validation logic but no "what to build." The roadmap existed only in conversation.

**Audit findings:**
- Focus page groups by `hypothesis:` field, but 3 key features (p303, p126, p305) used wrong fields (`tags:`, `tests:`) — invisible in grouping
- p80 referenced non-existent `H-GTM`
- Hypothesis labels were cryptic — no descriptions, no hover context
- `milestone:` field existed in kanban spec but was unused

**Decision:** Milestones replace hypotheses as the organizational unit. `hypotheses.md` deleted entirely — every piece has a better home.

**What changed:**

| Content | Old Location | New Location |
|---------|--------------|--------------|
| Active hypotheses (H-Stories, H-Biz, H-Recognition) | hypotheses.md | Milestone files R1, C1-C2 |
| Blocked hypotheses (H2-H7, H-Safety, H-AI) | hypotheses.md | Future milestone files X2-X3 (status: future) |
| North Star (H-Core) | hypotheses.md | X1 milestone file (status: future) |
| Evidence Base (research stats) | hypotheses.md | theory-of-change.md Evidence Base section |
| Validated (H1, H-Foundation) | hypotheses.md | theory-of-change.md Evidence Base section |
| Open Questions | hypotheses.md | Dissolved into milestone files |

**Milestone structure:**
```yaml
---
status: active | next | future
priority: p0 | p1 | p2 | p3
summary: "One line — shown on kanban hover and Focus page headers"
tests: [H-Stories]
answers: [OQ-6, OQ-7]
---

# Track-Name: Title

Use track prefixes: C (Coaching), R (Recognition), E (Enhancement), X (Exploratory)

**Build:** P126 → P128 → P124
**Done when:** [concrete exit criteria]
**Kill signal:** [when to abandon]
```

**Alternatives rejected:**
- Keep hypotheses.md, add milestones alongside: Two systems duplicating same info
- Rename hypotheses to milestones: Content needed restructuring, not just renaming
- Track milestones in kanban only: Need prose context, not just frontmatter

**Consequences:**
- Features link to milestones via `milestone: M{N}` frontmatter (replaces `hypothesis:`)
- Kanban Focus page will group by milestone (shows summary, done/kill signals)
- Milestone files = hypothesis + build plan + done signal + kill signal
- theory-of-change.md Evidence Base expanded with full research tables
- All doc references updated: CLAUDE.md, lean-canvas.md, decisions.md, definitions.md, README.md

**Files created:**
- `docs/milestones/m1-stories-live-events.md` (status: active)
- `docs/milestones/m2-first-workshops.md` (status: next)
- `docs/milestones/m3-points-ai-stories.md` (status: future)
- `docs/milestones/m4-paid-workshops.md` (status: future)
- `docs/milestones/m5-scale-partners-async.md` (status: future)
- `docs/milestones/m6-asymmetric-conversion.md` (status: future)
- `docs/milestones/m7-social-fomo.md` (status: future)
- `docs/milestones/m8-visibility-behavior.md` (status: future)
- `docs/milestones/m9-status-flip.md` (status: future)
- `docs/milestones/m10-certifications.md` (status: future)
- `docs/milestones/m11-cascade.md` (status: future)
- `docs/milestones/m12-safety-history.md` (status: future)

**Files deleted:**
- `docs/hypotheses.md`

**Feature frontmatter updated:**
- p305, p303 → `milestone: C1`
- p105 → `milestone: C2`, `priority: p2` (was p0), `status: backlog` (was week)
- p129, p80, p108 drafts → `milestone: C2`

**References:** [P130 spec](../features/p130_merge_hypotheses_into_milestones.md) | [milestones/](milestones/)

---

## Content pipeline — blog audience, voice guide, manifesto sequence

**Context:** Building out the build-in-public blog on Ghost. Needed to define who we're writing for, establish a consistent voice, and plan the first content sequence (chunking "The Clarity Tax" article into a subscriber drip).

**Decisions:**

**1. Blog audience = calibrated listeners (not general public, not coaches)**

People who already practice verification and are frustrated that others don't. They need validation and vocabulary, not education. This is NOT content marketing for coaches -- it's reputation building with the founder's natural audience.

**2. Build in public = freedom, not content marketing**

No content calendar, no SEO optimization. Write about whatever's interesting. The business benefits indirectly through reputation ("he's smart, what's he building?"), not through content-to-conversion funnels.

**3. Manifesto as email sequence (reader-first ordering)**

Chunk "The Clarity Tax" into 8 blog posts. Sequenced reader-first: start with THEIR experience (6 posts about their frustration, cost, blindspot, proof), then founder story (#7), then full manifesto (#8). Earn the right to talk about yourself.

**4. Content pipeline separation**

Raw stories from `/interview` and `/sifter` go to `content/stories/`. Blog posts go to `content/blog/` with frontmatter lifecycle: `draft -> preparing -> review -> published`. No folder moves -- status field tracks lifecycle.

**5. Citation standards**

Every claim must have inline links + full academic citations at bottom. No unsourced "studies show." When referencing own product concepts, link to own articles/sections.

**6. Voice guide extracted**

`content/voice.md` captures the founder's writing voice from existing material: 5 traits (contrarian, precise, narrative-led, confrontational, generous), sentence patterns, vocabulary, intellectual heroes. Skills (`/prepare-blog`, `/interview`, `/ship-blog`) now read voice.md + strategy.md first.

**Alternatives rejected:**
- Content calendar with SEO focus -- kills the "write what's interesting" energy that makes build-in-public authentic
- Coaches as blog audience -- too narrow, and content marketing for coaches doesn't match the founder's writing style
- General public as audience -- too broad, voice would be diluted
- Single manifesto publish -- too long, doesn't build anticipation or subscriber habit

**Consequences:**
- `content/voice.md` and `content/strategy.md` are new source-of-truth docs
- `content/blog/` is a new directory with lifecycle tracking
- `content/stories/` role clarified: raw material, not published content
- Three skills updated: `/prepare-blog`, `/interview`, `/ship-blog`
- One new skill created: `/interview` (journalist-style extraction)
- CLAUDE.md file locations table updated

**References:** [content/voice.md](../content/voice.md), [content/strategy.md](../content/strategy.md), [content/blog/](../content/blog/)

---

## 2026-02-05 [process]: CLAUDE.md governance — universal only, patterns to architecture.md

**Context:** During P118 review, discovered service layer pattern kept being rediscovered each session. Initial instinct was to add it to CLAUDE.md. Realized CLAUDE.md was growing without clear criteria for what belongs there.

**Decision:**
1. **CLAUDE.md = universal instructions only** (needed for ALL task types)
2. **Technical patterns → `docs/technical/architecture.md`** (new doc)
3. **Product decisions → `docs/decisions.md`** (already existed, no change)
4. **Added "Where to Write" table to CLAUDE.md** for routing guidance
5. **Created `/claude-md-check` skill** to validate proposed CLAUDE.md additions (later upgraded to `/claude-md-maintain` — automated agent vs manual checklist)

**Alternatives rejected:**
- Add everything to CLAUDE.md — leads to bloat, not everything is universal
- Use auto memory for patterns — too informal, not structured enough for technical patterns
- Build skill without simpler solution first — overkill before testing basic guidelines

**Consequences:**
- CLAUDE.md stays focused, loads faster in context
- Technical knowledge has a proper home (architecture.md)
- `/claude-md-maintain` (automated agent) prevents drift

---

## 2026-02-04 [technical]: Story versioning via versions table

**Context:** Designing stories/points backend (P117). Verifications need to reference the specific content that was verified, not the current (potentially edited) content.

**Decision:** Use a `story_versions` table with immutable snapshots. Verifications reference `version_id`. When story is created, version 1 is auto-created via trigger. When content changes, new version is created.

**Alternatives rejected:**
- Snapshot in verification table (`story_content_snapshot` column) — Duplicates content per verification. 50 verifications of same story version = 50 copies of content.
- No versioning (always reference current) — Verifications become meaningless after edit. "They understood version A" but now story is version B.

**Consequences:**
- Enables "view what was verified" without content duplication
- Clean normalized model: one row per version, verifications reference it
- Supports future "edit history" UI naturally
- Adds one table but removes data duplication

**References:** [p117_stories_points_backend.md](../features/p117_stories_points_backend.md), [20260204_stories_points_calibration.sql](../supabase/migrations/20260204_stories_points_calibration.sql)

---

## 2026-02-04 [technical]: Calibration averages computed on-read, not stored

**Context:** P117 stories/points backend originally had `listener_calibration_avg` and `speaker_calibration_avg` columns on profiles, updated by triggers.

**Decision:** Compute calibration averages on-read via `AVG()` query. Don't store them.

```sql
SELECT AVG(speaker_rating) as listener_avg
FROM story_verifications
WHERE listener_id = $user_id
```

**Alternatives rejected:**
- Trigger-updated stored columns — Adds trigger complexity. Must handle edge cases (first verification, deletes, etc.). The COUNT(*) pattern was already a performance bug; averages would be worse.
- Batch job recalculation — Infrastructure complexity for a query that runs in <100ms anyway.

**Consequences:**
- Profile calibration display queries on-demand (fast: <100ms even with 1000+ verifications)
- No trigger maintenance for averages
- If performance ever becomes an issue, can add cached columns later
- Simpler migration (fewer columns, no AVG triggers)

**References:** [p117_stories_points_backend.md](../features/p117_stories_points_backend.md)

---

## 2026-02-02 [product]: Stories-first model with holistic verification, points deferred

**Context:** Deep exploration of v9 "AI Stories" vision through Lean Startup Coach lens. The core question: what's the actual value proposition and what's the minimum needed to test it?

**Key insight:** The value isn't "see your calibration gap" (diagnostic) — it's "scale your inner world" (productive). Stories let authors verify understanding at scale without repeating themselves.

**Decision:** Stories-first, holistic verification, points deferred.

1. **Value prop reframe:** "Scale your inner world — know who understood, how well, where they diverge — without being present for every conversation"

2. **Build sequence (6 phases):**
   - Phase 1: Stories on profiles (mock, text only)
   - Phase 2: Backend + merge to product
   - Phase 3: /live starts with story context (events → select story → /live)
   - Phase 4a: Human verification (holistic — "did they get it?")
   - Phase 4b: Add points IF holistic is too vague
   - Phase 5: Sifter (AI story creation)
   - Phase 6: AI verification

3. **Holistic first:** Verification without points — listener explains back, speaker rates 0-10. Points add structure but aren't required for human verification. Add them only if holistic proves too vague.

4. **Critical hypothesis:** H-AI — "AI can verify understanding accurately enough that authors trust it." This is the bottleneck for scaling.

**Alternatives rejected:**
- AI-first (assume AI works, validate AI before backend) — Doesn't validate human flow first
- Points from start — Adds complexity before knowing if stories alone work
- v9 as Phase 2 scaling — v9 is actually a different value prop, not just scaling current product

**Consequences:**
- lean-canvas.md updated with "scale your inner world" value prop
- hypotheses.md gets H-AI hypothesis
- roadmap.md gets 6-phase build sequence
- definitions.md updated with Story as scaling mechanism
- Points are enhancement, not core — add after Phase 4a proves holistic verification works
- v9 vision stays in visions/, marked as "KISS version extracted to roadmap"
- Brand "Clarity Pledge" still fits — pledge is commitment, stories are how you scale that commitment

**The lean insight:** If human-to-human story verification doesn't work, AI won't save it. Validate the human loop first.

**References:** [v9 AI Stories vision](visions/v9.%20ai%20stories.md), [roadmap.md](roadmap.md), [lean-canvas.md](lean-canvas.md)

---

## 2026-02-03 [product]: Be your own coach first (supersedes coach partnership model)

**Context:** Mentor conversation with Andy. Realized the "coaches as partners" model still had a dependency — convincing coaches to participate. Andy validated: be your own first user, learn what works, build case studies.

**Decision:** Stop trying to sell to or partner with coaches. BE the coach yourself.

**The model:**
```
You (as coach/trainer) → Run events (donation-based) → Participants get value →
  → Prove tool works → Subscription revenue from participants/teams/businesses
```

**Why this is different from 6 months ago:**
- Then: Rejected coaching because "must think big as a company"
- Now: Psychologically freed after company bankruptcy. Coaching = learning path, not compromise.

**Key insight from Andy:** Being your own first user is the best way to identify real problems while having income.

**Consequences:**
- Updated H-Biz hypothesis (no longer about coach WTP)
- Updated lean-canvas customer segments
- Updated roadmap current focus
- Added Open Questions section to hypotheses.md
- Revenue model: donation-based events now, subscription later (if tool value proven)

**Open questions this creates:** (See milestone files for open questions)
- What exactly do people pay for?
- What proves TOOL adds value vs YOU?
- Retention mechanism?

**References:** [milestones/m2-first-workshops.md](milestones/m2-first-workshops.md), [lean-canvas.md](lean-canvas.md), [roadmap.md](roadmap.md)

---

## 2026-01-29 [product]: Coaches as partners, not customers (SUPERSEDED by 2026-02-03)

**Context:** Evaluating coach hypothesis. Realized €100/month subscription from coaches proves nothing and is hard to sell. Need a model that validates while building relationships.

**Decision:** Reframe coaches as **partners/founding members**, not customers. Revenue comes from participants (clients, businesses), not coaches.

**The model:**
```
Coach (partner) + You → Co-organize events → Participants get value →
  → Participants/companies pay
  → Coach gets: case study, better delivery, learning
  → You get: validation, distribution, learning
```

**Alternatives rejected:**
- Coaches as customers ($75/mo): Small signal, hard to sell, doesn't prove value chain
- Coaches as pure distributors: Still feels like "selling to" rather than "building with"

**Consequences:**
- p105 renamed to "Sales Playbook" with partnership model
- lean-canvas updated with new revenue model
- "Founding members" program for early coaches
- Charge where value lands (participants/businesses), not where relationships exist (coaches)
- GTM is "do things that don't scale" — co-organize events, learn together

**References:** [p105_sales_playbook.md](../features/p105_sales_playbook.md), [lean-canvas.md](lean-canvas.md)

---

## 2026-01-29 [process]: Documentation organization — GTM in feature docs, pivots in lean-canvas

**Context:** Needed clarity on where different types of knowledge live. GTM tactics, sales playbooks, and pivot options were unclear.

**Decision:**
- GTM/sales playbooks → feature docs (`features/p{N}_sales_playbook.md`)
- Pivot options → lean-canvas "Alternative Approaches" section
- Evidence base → theory-of-change.md Evidence Base section

**Alternatives rejected:**
- Separate docs for GTM, pivots, evidence: Too many docs to maintain
- Everything in lean-canvas: Makes it too long

**Consequences:**
- CLAUDE.md updated with doc organization
- lean-canvas gets "Alternative Approaches" section
- theory-of-change.md gets "Evidence Base" section (expanded in P130)

**References:** [CLAUDE.md](../CLAUDE.md), updated documentation sections

---

## 2026-01-29 [product]: Problem reframe — measurement impossible, not training expensive

**Context:** Clarifying what problem we solve for coaches. Initial framing was "calibration training is too expensive/slow." After reflection, realized this was imprecise.

**The insight:** The problem isn't "training is expensive." The problem is **understanding calibration was unmeasurable**.

**What we measure:** Understanding calibration — the gap between listener's confidence ("I understood") and speaker's verification ("they actually understood"). This is metacomprehension accuracy via speaker verification.

**Why this was impossible before:**
- Self-reports don't work (metacomprehension accuracy is only r=0.24 — people don't know what they don't know)
- Talk-time ratios (Gong, Chorus) measure behavior, not comprehension
- 360 feedback buries listening as 1 item of 30, rated by people guessing
- No tool asked the speaker to verify understanding

**What we do differently:** Speaker verification — the only person who knows if you understood is the person you were trying to understand.

**Implication for coach pitch:**
- OLD: "Help clients improve faster" (efficiency play, competes with training)
- NEW: "Prove what you can only assert" (new capability that didn't exist)

**Consequences:**
- Updated lean-canvas.md job-to-be-done
- Updated C2 milestone (H-Biz hypothesis)
- Updated p105_sales_playbook.md validation questions
- This is category creation, not competition with training companies

**References:** [definitions.md](definitions.md) — Understanding Calibration section

---

## 2026-01-28 [product]: Monetization strategy — consulting as customer discovery

**Context:** Need $5K/month eventually, but also need to validate coach hypothesis. Tension between "make money now" and "validate before building."

**Decision:** Revenue activities MUST align with product validation. Consulting/coaching becomes customer discovery for Clarity Pledge, not a separate income stream.

**Key insight:** Every paid session is:
- Revenue ($)
- Customer research (insights)
- Case study material (proof)
- Testimonial (social proof)
- Newsletter content (distribution)

**Alternatives rejected:**
- Separate consulting track (splits focus, delays product)
- Build first, monetize later (runs out of runway)
- Skip validation, charge coaches immediately (might build wrong thing)

**Consequences:**
- Demo Kit created to enable /live demos during coach conversations
- Newsletter started to document journey + warm leads
- Free pilots with coaches OK (validate usage before asking for payment)
- Pricing decision deferred until spread signal validated

**References:** [p106_demo_kit.md](../features/p106_demo_kit.md), [p105_sales_playbook.md](../features/p105_sales_playbook.md)

---

## 2026-01-28 [process]: Newsletter infrastructure — Ghost self-hosted + n8n

**Context:** Need newsletter for audience building and coach outreach. Wanted independence and automation potential.

**Decision:** Ghost self-hosted + n8n for automation. Start manual, automate after validation.

**Alternatives rejected:**
- Substack (easy but walled garden, limited API)
- Buttondown (good API but less features)
- Build custom (too much effort before validation)

**Consequences:**
- Use $25K Google Cloud credits for hosting
- Phase 1: Manual posting (validates content resonates)
- Phase 2: n8n automation (after 10 coaches)
- Phase 3: Full pipeline with Whisper transcription, auto-posting (after PMF)
- Subscriber = User sync deferred until 100+ subscribers

**References:** [p108_newsletter_automation.md](../features/p108_newsletter_automation.md)

---

## 2026-01-28 [product]: Pricing model — validate both, decide later

**Context:** Should coaches pay ($75/month) or be free (growth engine) while teams pay ($500/month)?

**Decision:** Don't commit to pricing model yet. Validate both signals first:
1. Will coaches USE the tool? (even if free)
2. Does spread happen? (coach → client → team)

**Math reality:**
- At $75/coach, need 67 coaches for $5K/month
- Unlikely in 6 months with organic growth
- Either: higher price, add high-ticket, or accept longer timeline

**Timeline accepted:**
- Month 3: $300-500 (3-5 coaches)
- Month 6: $1,500 (20 coaches)
- Month 12: $5,000 (50+ coaches OR team tier)

**Alternatives rejected:**
- Commit to $75/coach now (might be wrong price)
- Free forever for coaches (delays all revenue)
- Skip coaches, go direct to teams (no distribution channel)

**Consequences:**
- Offer coaches FREE pilot (remove barrier to validation)
- ASK "would you pay $75/month?" but don't require it
- Add H-Biz-9 (spread signal) to validation questions
- Pricing decision after Phase 1.5 (spread validated or not)

**References:** [roadmap.md](roadmap.md), [p105_sales_playbook.md](../features/p105_sales_playbook.md)

---

## 2026-01-28 [product]: Demo Kit — /live needs prepared content

**Context:** /live works for 1-on-1 when ideas are prepared. Doesn't work well for ad-hoc conversations.

**Decision:** Create Demo Kit with 3-5 prepared ideas from the article. Use these in coach demos.

**Why this matters:**
- Without prepared content, demos fail
- Demo failure = can't validate coach hypothesis
- This was a blocking issue

**Consequences:**
- Created [p106_demo_kit.md](../features/p106_demo_kit.md) with 5 demo ideas
- Created [p107_live_readiness.md](../features/p107_live_readiness.md) to verify flow works
- Must test /live with Demo Kit before coach outreach

**References:** [p106_demo_kit.md](../features/p106_demo_kit.md), [p107_live_readiness.md](../features/p107_live_readiness.md)

---

## 2026-01-28 [product]: Research validates thesis, identifies market gap

**Context:** Before investing more time, we needed to validate the foundational assumption: does calibration (verified understanding) actually matter for business outcomes? And what's the competitive landscape?

**Research conducted:**
- Phase 0: Terminology mapping across 10+ fields
- Track A: Value of calibration (literature review)
- Track B: Competitive landscape

**Key findings:**

| Finding | Source |
|---------|--------|
| r=.39 listening → work outcomes (N=400K) | Kluger et al. 2023 meta-analysis |
| r=.47 listening → sales performance | Kluger et al. 2023 |
| r=.28 listening → reduced burnout | Kluger et al. 2023 |
| 60% fewer hospital readmissions with teach-back | Heart failure meta-analysis |
| 75% of listening research relies on self-reports | Kluger et al. 2023 |
| No tool measures whether listener actually understood | Competitive research |

**Decision:** Proceed with confidence. The foundational thesis is validated (mixed-to-strong evidence). The market gap is real — everyone believes listening matters, no one measures whether understanding actually happened.

**Strategic implications:**
1. Don't oversell causal claims (say "associated with" not "causes")
2. Healthcare teach-back is our strongest proof point
3. Measurement IS the moat (we're first to productize listening fidelity)
4. Training fails (12% transfer) — we're a practice system, not training

**New concept documented:** Protocol-Led Growth — the explain-back protocol spreads free (coaches → clients → teams); the measurement captures value.

**References:**
- [p272_calibration_outcomes_research.md](../features/done/p272_calibration_outcomes_research.md)
- [Kluger et al. 2023](https://link.springer.com/article/10.1007/s10869-023-09897-5)

---

## 2026-01-28 [product]: Coaches as first paying customer hypothesis

**Context:** Founder was paralyzed by uncertainty about revenue. Previous plan (free workshops → hope → business conversion) had too many uncertain steps. 

**The insight:** The tool reveals a blindspot people don't know they have (listener miscalibration). The person who's blind won't pay — but the person who SEES the blindspot in someone else will pay. Coaches see their clients' blindspots.

**Decision:** Test hypothesis that executive/leadership/communication coaches will pay $50-100/month for a diagnostic tool that objectively measures their clients' communication calibration gap.

**Why coaches:**
- They see the blindspot in clients (so they'll pay, not the blind person)
- They already charge money (understand paying for tools)
- Tool is diagnostic infrastructure, not "selling yourself"
- Sale is fixed transaction: "here's a tool, $50/month"
- Aligned with mission (coaches spread calibrated communication through clients)

**Path from coaches to vision:**
- Coaches → use tool with clients
- Clients → experience calibration revelation → some bring to teams
- Teams → organizational adoption
- Organizations → institutions
- Institutions → democratic deliberation infrastructure

This is staged ambition, not selling out. The protocol is the same at all scales.

**Validation plan:**
- 5 coach conversations in 2 weeks
- Ask: Do you have clients with listener miscalibration? Would you pay for proof tool?
- Success: 3+ confirm pain, 2+ would pay

**Alternatives rejected:**
- Individuals (end users) — won't pay for problem they don't know they have
- Businesses/teams directly — diffuse pain, requires enterprise sales
- Facilitators — need to run workshops (extra effort)
- Keep building features and hope — maximum uncertainty over maximum time

**What's deferred:**
- Stories, Points, Sifter, reputation systems, event features, community features
- All Phase 2+ until coach hypothesis validated

**Concerns to validate:**
- Trust: Will clients believe a tool the coach uses? (Or need neutral/group proof?)
- Retention: Will coaches use ongoing or just once per client?

**References:**
- [p105_sales_playbook.md](../features/p105_sales_playbook.md) — full validation plan
- [milestones/m2-first-workshops.md](milestones/m2-first-workshops.md) — H-Biz hypothesis

---

## 2026-01-27 [product]: Product reframe — "Event" = any meeting with protocol commitment

**Context:** Following the Cold Start insight, explored what actually proves behavior change. Workshops alone don't prove anything — behavior change is proven by ongoing use. Realized "events" shouldn't mean "special workshops" but any meeting where people commit to using the protocol.

**Decision:** The product is:
> **Any meeting where people commit to verified understanding.**

- "Event" = team standup, 1:1, board meeting, workshop, any meeting
- Workshop is one entry point (training), not the product itself
- Behavior change measured by: do teams keep using /live in their own meetings?
- Calibration over time proves the protocol works

**Alternatives rejected:**
- Workshop as product — doesn't prove ongoing behavior change, not scalable, consulting trap
- /live only for "special occasions" — limits adoption, no habit formation
- Separate "workshop mode" vs "meeting mode" — unnecessary complexity, same protocol

**Consequences:**
- Product positioning shifts: "/live for your team's meetings" not "/live for Clarity workshops"
- Success metric: teams create recurring events and keep using /live
- Workshop becomes onboarding/training, not the core product
- Event model already supports this (any meeting can be an "event")
- Revenue path: teams pay for ongoing calibration tracking, not one-time workshops

**References:** Conversation on 2026-01-27 about behavior change measurement

---

## 2026-01-27 [product]: Cold Start Problem — Trigger, Not Tool

**Context:** Through iterative simplification of P98 (Sifter) and P97 (Profile), discovered that the core problem isn't the tool or content complexity — it's that /live has no trigger. Users like /live, praise it, but say "on what? when?" The tool works but sits unused.

Prior attempts:
- Pledge as identity → people sign but don't act differently
- /live as tool → interesting, not sticky, no retention
- Stories/Points as content → supposed to be "the what" but became too complex

**Decision:** The trigger must come from OUTSIDE the product, not inside. Event organizers provide the "when" (event) and "what" (topics). Individual users don't have intrinsic triggers. This confirms B2B2C as the right model.

**Alternatives rejected:**
- Stories/Points as trigger — too complex, still requires users to create content first (chicken-egg)
- Calibration revelation as trigger — requires /live sessions first to have calibration data (chicken-egg)
- Pledge identity as trigger — tested and failed; people sign but behavior doesn't change
- Building more product — the problem isn't features, it's the cold start loop

**Consequences:**
- B2B2C (Event Organizers) confirmed as primary customer — they provide the trigger individuals lack
- Individual pledger features (Profile redesign, Sifter) deprioritized until event loop validated
- Next step: Run ONE event with organizer-provided topics, manual facilitation, no new code
- P97 and P98 scope dramatically reduced or deferred
- 10 days spent on prototype was "tuition" — deep understanding of model, knowledge of what's NOT needed

**References:** Conversation on 2026-01-27 about simplification spiral and cold start realization

---

## 2026-01-26 [process]: Standalone skills as source of truth, prep-spec agents as pointers

**Context:** `/prep-spec` had 12 agent prompt files in `agents/` directory. Two issues emerged:
1. "Challenge" agents (Lean Startup Coach, Innovation) were opt-in and rarely ran — but their value is catching what you *don't* see
2. Agent prompts duplicated content that could be standalone skills

**Decision:**
1. **Challenge agents default ON** — Lean Startup Coach and Innovation Agent are now opt-out, not opt-in
2. **Standalone skills as source of truth** — Created `/lean` and `/innovate` as standalone skills
3. **Agents as pointers** — `agents/lean-startup-coach.md` and `agents/innovation.md` just say "read from /lean" or "/innovate"
4. **Merged overlapping agents** — Definitions + Philosophy → `alignment.md`, Lean Canvas + Theory of Change → `business.md`

**Pattern established:**
```
/lean           ← standalone, source of truth, invokable directly
/innovate       ← standalone, source of truth, invokable directly
/prep-spec      ← orchestrator, agents are pointers to standalone skills
```

**Alternatives rejected:**
- **Keep agents as full prompts** — Duplication, can't invoke directly
- **Delete agents entirely** — Breaks prep-spec's roster table
- **Keep Challenge agents opt-in** — Defeats their purpose (catching blind spots)

**Consequences:**
- Agent count reduced 14 → 10 (with 4 redirect files)
- `/lean` and `/innovate` can be run standalone anytime
- Future agents that make sense standalone should follow this pattern
- Challenge agents run by default in prep-spec

**References:**
- [.claude/commands/lean/index.md](../.claude/commands/lean/index.md)
- [.claude/commands/innovate/index.md](../.claude/commands/innovate/index.md)
- [.claude/commands/prep-spec/SKILL.md](../.claude/commands/prep-spec/SKILL.md)

---

## 2026-01-26 [process]: Unified /dev workflow replacing /loop, /quick-dev, /bmad:dev

**Context:** Three overlapping development commands existed:
- `/loop` — 476 lines, comprehensive TDD + visual checks + debugging
- `/quick-dev` — Thin BMAD wrapper delegating to external YAML
- `/bmad:bmm:agents:dev` — Agent persona wrapper requiring "staying in character"

Users didn't know which to use. Logic was scattered. Parallelization opportunities were missed.

**Decision:** Consolidate into single `/dev` skill with:
1. **Smart parallelization** — Analyzes task dependency graph, spawns parallel agents for independent work
2. **UAT integration** — Auto-generates acceptance tests via `/generate-uat` subagent if missing
3. **Subagent verification** — `/design-audit` runs in fresh context at end
4. **Context-aware skill loading** — Auto-loads relevant skills (Vercel, Supabase) based on detected work
5. **Built-in debugging protocol** — Root cause investigation, no separate `/debugging` needed
6. **Wave-based execution** — Groups tasks into dependency waves, parallelizes within waves

**Alternatives rejected:**
- **Keep all three** — Confusing, duplicated logic, no parallelization
- **Merge into /loop** — Name doesn't convey "development workflow"
- **BMAD agent approach** — Persona overhead not needed for task execution

**Consequences:**
- `/loop`, `/quick-dev`, `/bmad:bmm:agents:dev` now redirect to `/dev`
- Single entry point for all development work
- Agents spawn for: UAT generation, parallel tasks, design audit
- Skills loaded dynamically based on context (React → Vercel practices, DB → Supabase practices)

**References:** [.claude/commands/dev.md](../.claude/commands/dev.md)

---

## 2026-01-26 [technical]: Thread lines for Point → Position → Story hierarchy

**Context:** P103 quote pattern shows `{Name} {verb}:` labels on nested Stories under Points, but the visual connection between Point at top and Stories below wasn't clear. Users couldn't immediately see "this Story supports that Point."

**Decision:** Add Twitter-style thread lines to show visual hierarchy:
```
Point
│
├─ AGREE
│  │
│  ├─ Alice Chen strongly agrees:
│  │  ┌──────────────────┐
│  │  │ Story content... │
│  │  └──────────────────┘
│  │
│  └─ Carol Davis agrees:
│     ┌──────────────────┐
│     │ Story content... │
│     └──────────────────┘
```

**Alternatives rejected:**
- **Indent only** — Shows nesting but no visual "connection" between elements
- **Keep as-is** — Position label + quoted box alone doesn't show relationship to Point above
- **Color coding** — Would conflict with existing position-based color semantics

**Consequences:**
- New CSS pattern for thread lines (vertical line with horizontal connectors)
- Apply to: PointDetail position sections, potentially Profile expanded views
- Pattern documented in design-system.md under "Thread Lines"
- Enables future use in any parent-child UI relationships

**References:** [p103_point_quote_pattern.md](../features/p103_point_quote_pattern.md)

---

## 2026-01-26 [product]: /live verification — Story first, Points unlock after

**Context:** Designing card-based verification in /live. Stories have linked Points. Question: how do they interact during verification?

**Decision:** Story → Verified (≥8/10) → Points unlocked for position staking.

- Partner must understand Story before staking positions on linked Points
- Points are "locked" until Story verification passes
- Enforces "can't disagree until you acknowledge their Story"

**Alternatives rejected:**
- Points and Story separate (verify independently) — Loses the "understand WHY before reacting to WHAT"
- Points first, Story optional — Backwards; claims without context invite shallow reactions
- Points always visible — No incentive to actually understand the Story

**Consequences:**
- UI shows Points as "locked, will unlock after understanding"
- <8/10 rating keeps Points locked, offers "try again"
- Creates meaningful sequence: listen → understand → react

**References:** [p371_live_verification_with_cards.md](../features/p371_live_verification_with_cards.md)

---

## 2026-01-26 [technical]: /live card selection — you only see your own cards

**Context:** In /live with cards, should you see your cards, their cards, or both?

**Decision:** You only see YOUR cards. Partner sees THEIR cards on their device.

- No "shared deck" to manage
- No browsing partner's cards
- Speaker picks their own card to verify

**Alternatives rejected:**
- Shared deck with suggestions — Coordination overhead, who picks next?
- See both (my cards / their cards tabs) — Unnecessary; they pick theirs, you pick yours
- System suggests cards — Over-engineered for MVP

**Consequences:**
- Simpler UI: just "My Cards" list
- No negotiation about what to verify
- Clear ownership: your card = your verification to initiate

**References:** [p371_live_verification_with_cards.md](../features/p371_live_verification_with_cards.md)

---

## 2026-01-26 [product]: /live works without cards (cardless mode)

**Context:** What if someone has no sifted Stories/Points yet? Can they still use /live?

**Decision:** Yes. Cardless mode = existing /live flow (explain-back, rating) without a linked card.

**Alternatives rejected:**
- Require cards to use /live — Blocks new users, adds friction
- Auto-create card from conversation — Complex, AI mid-session

**Consequences:**
- [Pick cards] and [Just talk] both available
- Cardless verifications still captured (rating without card reference)
- Low barrier to entry; cards enhance but don't gate

**References:** [p371_live_verification_with_cards.md](../features/p371_live_verification_with_cards.md)

---

## 2026-01-26 [product]: "Speak freely" as escape hatch at every step

**Context:** The card verification flow has multiple steps (explain-back, rating, position staking). What if someone wants to exit?

**Decision:** "Speak freely" available at every step. Returns to open conversation.

**Alternatives rejected:**
- No escape (must complete flow) — Too rigid, people leave
- "Cancel" that aborts entirely — Too harsh; "speak freely" keeps session alive

**Consequences:**
- Every verification screen has [Speak freely] option
- Session continues even if formal flow is skipped
- Respects that conversations are fluid, not always structured

**References:** [p371_live_verification_with_cards.md](../features/p371_live_verification_with_cards.md)

---

## 2026-01-26 [product]: Session history only (not full history) for MVP

**Context:** Should /live show history of all past verifications, or just this session?

**Decision:** Session history only — shows cards verified in current /live session.

**Alternatives rejected:**
- Full history (all past sessions) — Needs UI for browsing, filtering; complexity
- No history — Loses context of what we've verified together

**Consequences:**
- Bottom of /live shows "This Session" with verified cards + ratings
- Full history is future enhancement
- Keeps /live focused on current conversation

**References:** [p371_live_verification_with_cards.md](../features/p371_live_verification_with_cards.md)

---

## 2026-01-26 [product]: Sifter-first model — sift before /live, not unified

**Context:** Designing P98 Sifter Prototype. Three models emerged:
- Model A: Two separate flows (/sift standalone, /live with partner)
- Model B: /live IS the sifter (AI partner mode if no human joins)
- Model C: Sifter-first, then optionally invite to /live

**Decision:** Model C — Sifter-first, /live optional.

User journey: **Clarify → Share → Verify**
1. User dumps thoughts → AI extracts Stories/Points → refine to 10/10
2. Sifted content saved to profile
3. User can then "Invite someone to verify" → starts /live with that content as context

**Alternatives rejected:**
- Model A (two separate flows) — Duplication, users confused about when to use which
- Model B (/live IS sifter) — Mixes mental models (verification vs extraction). /live is for human connection, not AI chat.

**Consequences:**
- Sifting is valuable solo (even without /live)
- /live becomes verification of *sifted* content, not raw thoughts
- Higher quality inputs to verification (already 10/10 understood by AI)
- Existing Stories/Points on profile are "already sifted" — skip to invite

**References:** [p289_sifter_prototype.md](../features/p289_sifter_prototype.md) | [p58_sifter_mvp.md](../features/p58_sifter_mvp.md)

---

## 2026-01-26 [product]: Existing profile content treated as "already sifted"

**Context:** If user has Stories/Points on their profile, should they re-sift before inviting someone to verify?

**Decision:** No. Content on profile is already sifted (reached 10/10 during original creation). User can go directly to "Invite to verify."

**Alternatives rejected:**
- Require re-sifting — Unnecessary friction; content already went through 10/10 process
- Optional re-sift — Adds UI complexity for edge case

**Consequences:**
- Profile content has two CTAs: "Invite to verify" (primary), "Refine" (secondary, if they want to re-sift)
- New content goes through Sifter; existing content skips it
- Simplifies the "what do I do with my content" decision

**References:** [p289_sifter_prototype.md](../features/p289_sifter_prototype.md)

---

## 2026-01-23 [technical]: Story-Point display — cards show counts, detail pages show grouped content

**Context:** Reviewing LinkedIn-like prototype UX. The 2026-01-22 decision said "show linked items inline, not counts" but applying this everywhere created visual overload. StoryCards showed full Point position breakdowns; PointCards showed all quoted Stories; Point detail pages showed Stories flat without position grouping.

**Decision:**

**1. Profile cards (StoryCard, PointCard) — show counts, not inline content**
- StoryCard: Show "🔗 2 points" count. Clicking opens story to see Points.
- PointCard: Show "📖 2 stories" OR collapsible "Your 2 stories" (only THIS user's stories on their profile)
- Rationale: Cards are for scanning. Curiosity drives clicks to detail pages.

**2. Story detail page — show all linked Points inline**
- One user's story links to Points they found relevant. Show them.
- This is per-user content, makes sense inline.

**3. Point detail page — group Stories by position**
- Stories explain positions. Different users have different positions.
- Layout: Position sections (Agree/Disagree/Unsure), each containing Stories from users with that position.
- No "All" tab — default view shows all positions grouped. Tabs filter to single position.
- No icons on tabs — just "Agree (2)" | "Disagree (0)" | "Unsure (2)"
- No recursive quoting — Stories on Point page don't re-quote the Point
- Empty positions: Show section with "(no stories yet)" for discoverability

**4. Position badge placement**
- When viewing all positions: Show position badge (e.g., "Agrees") ABOVE story content
- When filtered to single position: Hide badge (redundant)

**Alternatives rejected:**
- Inline everything everywhere (original decision) — Visual overload on cards
- Hide Stories on Point detail (just show counts) — Loses the "why" behind positions
- Flat Story list on Point page — Ignores that Stories explain specific positions

**Consequences:**
- Updates 2026-01-22 decision: "inline not counts" applies to DETAIL pages, not cards
- StoryCard and PointCard components simplified
- Point detail page needs refactor: position-grouped layout
- Remove "Verify" button from Point detail (outdated)
- Remove checkmark/x/dash icons from position tabs

**References:** [p60_navigating_stories_and_points.md](../features/p60_navigating_stories_and_points.md) | 2026-01-22 decision below

---

## 2026-01-23 [product]: Event page — no tabs, outcomes focus, card selection inside /live

**Context:** Designing event verification flow (P85) for physical events. Originally had Info/Feed tabs on event page. Realized "feed" was wrong mental model.

**Decision:**
- **No tabs on event page** — Single page with info + participants + outcomes
- **No "feed"** — At physical events, people match in person. Don't need digital content discovery.
- **Card selection happens inside /live** — Same UI pattern everywhere (profiles and /live sessions)
- **Event page shows outcomes** — Verification count, avg understanding, leaderboard with ears (👂)
- **Ears = calibration reputation** — Shows on participant list, creates social proof

**Alternatives rejected:**
- Info/Feed tabs — Added complexity, feed doesn't fit physical event model
- Digital partner matching — Unnecessary for in-person events
- Content browsing on event page — Wrong place; browse profiles or select inside /live
- Separate "explore" feed — Just use same card component everywhere

**Consequences:**
- Event page is simpler (one view)
- Card selection UI component shared between profiles and /live
- Event outcomes section drives H4 (visibility, was H2) and H3 (FOMO, was H0b)
- No presence system needed — link/QR sufficient for /live pairing

**References:** [p369_event_verification_flow.md](../features/p369_event_verification_flow.md) | [milestones/m8-visibility-behavior.md](milestones/m8-visibility-behavior.md)

---

## 2026-01-23 [product]: H3 hypothesis — Social FOMO drives adoption (was H0b)

**Context:** Realized that showing calibration scores (ears 👂) on participant lists serves dual purpose: visibility (now H4) and social FOMO (new hypothesis, now H3).

**Decision:** Added H3 hypothesis (was H0b) to test whether seeing others' calibration motivates non-participants to verify.

**Alternatives rejected:**
- Merging with H2 (now H2) — H2 is self-revelation ("I didn't realize I was miscalibrated"), H3 is social ("others have it, I want it")
- Deferring — FOMO is core to event outcomes design, need to track it from first event

**Consequences:**
- H2 test event should track: Did seeing others' ears drive participation?
- Event outcomes section explicitly shows leaderboard to trigger FOMO
- Success criteria: Users mention wanting calibration after seeing others' scores

**References:** [milestones/m7-social-fomo.md](milestones/m7-social-fomo.md)

---

## 2026-01-23 [process]: Build order — Verification flow before Sifter

**Context:** Was unclear whether to build Sifter (P58) or verification flow (P85) first. Both seemed necessary for H2 test.

**Decision:** Verification flow (P85) before Sifter (P58). Manual seeding is sufficient for H2 test.

**Alternatives rejected:**
- Sifter first — Would automate seeding but verification loop needs to work first
- Both in parallel — Too much scope, verify the core loop first

**Consequences:**
- Phase 0: P85 Event Verification Flow (connect /live to content)
- Phase 3: Sifter (after verification works)
- First event can use manually seeded Stories/Points
- Proves loop works before automating the seeding

**References:** [roadmap.md](roadmap.md#build-phases) | [p58_sifter_mvp.md](../features/p58_sifter_mvp.md)

---

## 2026-01-22 [technical]: Calibration display — inline bar with 7-level brackets

**Context:** Calibration was shown as a separate card (sidebar on desktop, below profile on mobile). Discussed making it part of the profile card, and needed to define meaningful labels for calibration gaps.

**Decision:**
- **Placement:** Inline inside profile card, below stats (one unified "who is this person" card)
- **Visual:** Single horizontal bar with two icons positioned on it:
  - 👂 Ear (Lucide `Ear`) = Listener calibration
  - 🎤 Mic (Lucide `Mic`) = Speaker calibration
- **Direction:** Left = underconfident, Right = overconfident (intuitive: "over" = more = right)
- **7-level brackets** (gap = actual - self, on 1-10 rating scale):

| avgGap | Label |
|--------|-------|
| < -2 | Very overconfident |
| -2 to -1 | Overconfident |
| -1 to -0.5 | Somewhat overconfident |
| -0.5 to +0.5 | Well calibrated |
| +0.5 to +1 | Somewhat underconfident |
| +1 to +2 | Underconfident |
| > +2 | Very underconfident |

- **Tooltips:** Hover icon shows state + explanation (e.g., "Overconfident as Listener: How well you predict you understand others")

**Alternatives rejected:**
- Two separate bars (listener/speaker) — More visual noise, single bar with two markers is cleaner
- Percentage display ("78%") — Doesn't communicate direction (over vs under)
- Emoji icons — Too colorful/distracting, grey Lucide icons better
- Green center line — Too prominent, subtle grey tick mark instead
- 3-level brackets (over/calibrated/under) — Not granular enough, 7 mirrors position scale

**Consequences:**
- `InlineCalibration` component in `CalibrationDisplay.tsx` handles this
- Full `CalibrationDisplay` component still exists for other contexts if needed
- Bar direction is inverted from mathematical convention (positive gap = left)

**References:** [CalibrationDisplay.tsx](../src/app/prototypes/linkedin-like/components/shared/CalibrationDisplay.tsx) | [types.ts](../src/app/prototypes/shared/types.ts#L267-L300)

---

## 2026-01-22 [technical]: Story-Point relationship is N:N (many-to-many)

**Context:** Designing data model for Stories and Points. Initially considered 1:N (each Point belongs to one Story). User raised: "What if multiple Stories reference the same Point?"

**Decision:** N:N relationship with junction table `story_points`. A Story can link to multiple Points; a Point can be linked from multiple Stories.

**Key insight:** Users don't manually create Points — AI extracts them from Stories and handles linking. The "add existing point" UX isn't user-facing, it's AI-facing. This removes the main argument against N:N (creation flow complexity).

**Why N:N wins:**
- AI can deduplicate Points across Stories (same claim, multiple experiences)
- Enables "join existing Point" feature (P58 future enhancement)
- Matches philosophy: Points are shared claims, Stories are personal context
- No user-facing UX burden since AI handles linking

**Alternatives rejected:**
- 1:N (Point belongs to one Story) — Forces Point duplication when multiple Stories support same claim; doesn't match how Points work (global claims, not owned)

**Consequences:**
- Data model needs `story_points` junction table instead of `story_id` FK on points
- AI Sifter must check for existing matching Points before creating new ones
- Point detail pages show all linked Stories (already implemented in prototype)

**References:** [p58_sifter_mvp.md](../features/p58_sifter_mvp.md#data-model) | [p60_navigating_stories_and_points.md](../features/p60_navigating_stories_and_points.md)

---

## 2026-01-22 [technical]: Show linked items inline, not counts

**Context:** StoryCard showed a "🔗 1" badge for linked Points count, then displayed only 1 Point below. PointCard similarly showed a "📖 1" count then 1 Story. Users asked "why show a count when I could just see the actual items?"

**Decision:**
- Remove count badges for linked items (Pin count on Stories, BookOpen count on Points)
- Show ALL linked items inline (max 3, with "+N more" overflow link)
- On profile pages, prioritize profile owner's stories first in PointCard
- Remove `hideLinkedPoints` prop — always show linked content

**Alternatives rejected:**
- Keep count badge + show 1 item — Redundant; count is information about data we could just show
- Expand/collapse toggle — Adds interaction cost, hides value-adding content by default
- Always show all (no limit) — Could get unwieldy with 10+ linked items

**Consequences:**
- Cards are slightly taller when multiple linked items exist
- Simpler component API (no `hideLinkedPoints` prop)
- Users see full context without clicking
- Overflow links drive navigation to detail pages when >3 items

**References:** [roadmap.md](roadmap.md#q2-how-do-stories-link-to-multiple-points) — MVP was "1:1" but prototype now shows many-to-many

---

## 2026-01-21 [product]: Feed shows Points with Stories from your network

**Context:** Points in the feed feel random. No indication WHY a Point is relevant to you. Discussed showing quoted Stories from people you know (same event attendees, future Clarity Partners).

**Decision:**
- Points in feed show QuotedStory from people in your network (attended same event)
- Show up to 3 relevant Stories max if multiple matches
- This explains "why am I seeing this?" — someone you know shared their experience

**Alternatives rejected:**
- Badge only ("Sarah from TechConf quoted") — Less context, Stories ARE the context
- Sort boost without showing — User doesn't understand why order changed
- Dedicated "From network" tab — Fragments the feed unnecessarily

**Consequences:**
- PointCard in feed needs to filter linkedStories by user's event co-attendees
- Reuse existing `QuotedStory` component
- When Clarity Partners (P83) ships, add that as another relevance signal

**References:** [p83_clarity_partners.md](../features/p83_clarity_partners.md) — future expansion

---

## 2026-01-21 [product]: Story visibility model — Private / Shared / Public

**Context:** Designing P60 (Exploration UX) revealed unclear story visibility. Original spec said "private by default" but didn't define how stories become visible to others, especially within events.

**Decision:** Three visibility levels:
- **Private** — Only author sees (drafts)
- **Shared** — Event participants see (event feed)
- **Public** — Everyone sees (global feed, profile)

"Shared" chosen over "event-private" because it's extensible — future: shared with specific individuals via chat.

**Alternatives rejected:**
- Two levels (private/public) — No event scoping
- "Event-private" label — Too specific, doesn't extend to future sharing

**Consequences:**
- Story model needs `visibility` field: `private | shared | public`
- Event feed shows `shared` stories from that event
- Future chat sharing can reuse `shared` + recipient list

**References:** [p60_navigating_stories_and_points.md](../features/p60_navigating_stories_and_points.md)

---

## 2026-01-21 [product]: Verification only makes sense with story author

**Context:** P60 exploration surfaced question: can I verify understanding of Sarah's story with Bob (not Sarah)?

**Decision:** No. Verification is always 1:1 with the story author. The goal is confirming YOU understood THEIR experience — a third party can't validate that.

**Alternatives rejected:**
- Allow any pair to verify any story — Doesn't make sense epistemologically
- Group verification — Too complex, dilutes the 1:1 understanding check

**Consequences:**
- "Verify" button must indicate WHO you'll verify with (show author)
- /live session is always requester + story author
- Stories must have exactly one author (no co-authored stories)

**References:** [p60_navigating_stories_and_points.md](../features/p60_navigating_stories_and_points.md) | [p55_understanding_verification_loop.md](../features/done/p55_understanding_verification_loop.md)

---

## 2026-01-21 [technical]: Global notification bell for verification requests

**Context:** How does a story author know someone wants to verify? Options: email, event-page-only badge, or global in-app notifications.

**Decision:** Global bell icon in top-right nav with badge count. Tapping shows dropdown with pending requests.

**Alternatives rejected:**
- Email only — Users are on platform at events, email is friction
- Event-page-only badge — User might browse elsewhere, misses notification
- No notifications (polling) — Poor UX, author never knows

**Consequences:**
- Need notification infrastructure (bell icon, badge, dropdown)
- First notification type: verification request
- Pattern extends to future notifications (chat messages, etc.)

**References:** [p60_navigating_stories_and_points.md](../features/p60_navigating_stories_and_points.md)

---

## 2026-01-21 [product]: Verification stays event-scoped for MVP

**Context:** P60 spec said "anyone can request verification from any public story" but this creates spam and requires network/connection features labeled "post-MVP."

**Decision:** Verification only available within events for MVP. The "Verify" button appears on shared stories within an event context, not on random public stories.

**Alternatives rejected:**
- Open verification (anyone can request) — Spam risk, no coordination mechanism
- Connection-gated (must connect first) — Requires network feature, too heavy for MVP
- Chat-coordinated — Requires chat feature, too heavy for MVP

**Consequences:**
- "Verify" button only on event-scoped stories
- No network/connections needed for MVP
- Event = implicit trust boundary / social graph
- Public story feed can exist but without "Verify" buttons

**References:** [p60_navigating_stories_and_points.md](../features/p60_navigating_stories_and_points.md)

---

## 2026-01-19 [technical]: Avatar ring effect via background-padding, not Tailwind ring utilities

**Context:** P75 Compact Profile Card needed a blue ring around pledger avatars. During code review, discovered the initial implementation used `ring-blue-500` which only sets color without visible ring (requires `ring` or `ring-2` for thickness).

**Decision:** Use `p-1 bg-blue-500` on the avatar container to create the ring effect. The 4px padding with solid blue background creates a visually identical ring around the circular avatar.

**Alternatives rejected:**
- `ring-2 ring-blue-500` — Tailwind's ring utility, but ring appears outside the element's box model which can cause layout issues with adjacent content
- Inline avatar implementation with ring (chosen for P75, but identified as tech debt) — P76 will refactor to use `GravatarAvatar` component with `isPledger` prop

**Consequences:**
- Simple, predictable ring that's part of the avatar's box model
- P76 will standardize this pattern in `GravatarAvatar` component with `isPledger` prop
- Ring width is fixed at 4px (`p-1`); larger avatars may want `p-1.5` or `ring-3`

**References:** [compact-profile-card.tsx](../src/app/components/profile/compact-profile-card.tsx) | [p365_pledger_avatar_distinction.md](../features/p365_pledger_avatar_distinction.md)

---

## 2026-01-19 [technical]: Service abstraction pattern with feature flag for backend rollout

**Context:** P61 Events feature needed to transition from mock data to real Supabase backend without breaking existing UI or requiring big-bang deployment.

**Decision:**
1. **Interface-based service abstraction** — Both `events-service-mock.ts` and `events-service-real.ts` implement same `EventsService` interface
2. **Feature flag switch** — `VITE_USE_REAL_EVENTS_API` env var selects which implementation to use
3. **Archive mock data** — Move to `_archive/` folder rather than delete, keeping tests working and reference available

**Alternatives rejected:**
- Direct replacement (delete mock, add real) — too risky, no rollback path
- Branch-based deployment — harder to test real API locally while keeping prod stable
- Runtime feature flag in UI — unnecessary complexity, env var is simpler

**Consequences:**
- Can test real API locally while prod stays on mock
- Pattern reusable for future features (Stories, Points) needing gradual backend rollout
- Tests import mock service directly, unaffected by env var

**References:** [events-service.interface.ts](../src/app/data/events-service.interface.ts) | [events-service.ts](../src/app/data/events-service.ts) | [p358.1_events_production.md](../features/p358.1_events_production.md)

---

## 2026-01-18 [product]: Position scale and calibration approach for Points

**Context:** Needed to define how users track positions on Points and how the system identifies "good listeners" without gatekeeping.

**Decision:**
1. **7-point Likert scale (-3 to +3)** for positions on Points — standard in social science, balances granularity with cognitive ease
2. **Decentralized calibration** — no gatekeeping; weight contributions by track record instead
3. **Personal baseline for conversion** — compare user's conversion rate to their own history, not global rates

**Alternatives rejected:**
- -5 to +5 scale — too granular, people struggle to distinguish adjacent values
- -2 to +2 scale — loses nuance between "disagree" and "strongly disagree"
- Pre-certified "expert listeners" — gatekeeping creates dogmatic traps
- Global conversion baselines — confounded by topic and selection bias

**Consequences:**
- Data model: `position` column as smallint (-3 to 3), per-user conversion history
- No admin role needed for "certifying" listeners — system self-calibrates

**References:** [philosophy.md](philosophy.md#the-measurement-stack)

---

## 2026-01-18 [process]: /kdd entries now reference source files

**Context:** Decision log entries explain *what* was decided but don't point to *where* to learn more. Makes the log less navigable.

**Decision:** Add a `**References:**` field to the /kdd format with markdown links to relevant files and sections.

**Alternatives rejected:** None — pure improvement.

**Consequences:** Entries are now navigable; readers can dig deeper into the source material.

**References:** [SKILL.md](.claude/commands/kdd/SKILL.md)

---

## 2026-01-18 [product]: Brand architecture — "ClarityPledge" stays as umbrella name

**Context:** The product expanded from "just a pledge" to a full Sensemaking Platform (see product pivot decision below — pledge alone had unclear growth path, events became the growth engine). Question arose: is "ClarityPledge" too specific for an expanding toolkit?

**Decision:** Keep "ClarityPledge" as the umbrella brand because:
- The Pledge embeds the product's DNA — closed-loop communication, explain-back verification
- It's a "values-based brand" (like Patagonia) where the name signals the philosophy, not the feature set
- The .com domain with two real English words is a significant branding asset
- The Pledge becomes the "why" behind the "what" — all tools exist to uphold the Pledge's values

**Alternatives rejected:**
- Rebrand to generic umbrella (e.g., "ClearSync", "SenseForge") — loses the unique origin story and moral hook
- Parent/child architecture (broader company name + "Clarity Pledge" as one product) — adds complexity without clear benefit
- Keep name but downplay pledge feature — feels like false advertising if the pledge isn't central

**Consequences:**
- Every tool must genuinely support "closed-loop communication" — the name is a promise
- Marketing angle: "Tools for people who value clarity" or "Communication tools for those who value understanding"
- The Pledge is now a "graduation" feature (~1% of users) rather than the entry point
- Risk accepted: name sounds "formal/serious" — may not fit if we later add playful features

---

## 2026-01-17 [product]: Product pivot — Sensemaking Platform with Events as growth engine

**Context:** The Clarity Pledge product (sign pledge → profile → endorsements) is live but has unclear growth path. Vision docs (v7, v0 theory of change, P58 Sifter) describe a larger Sensemaking Platform. We needed to decide: two products or one? What's the build sequence?

**Decision:** One product, two user journeys:
- **Journey A:** Event attendee → verifier → maybe pledger (1%)
- **Journey B:** Organic visitor → pledger → maybe event host
- Events are the growth engine (organizers bring users)
- Pledge becomes a "graduation" feature for ~1% of engaged users
- Stories AND Points both needed — Points filter where to verify, Stories provide what to verify

**Build sequence (5 days):**
1. Events backend (worktree-4)
2. /live connection from event (skip QR, "verify with [person]")
3. Stories + Points in profile (mockup with fake data)
4. Sifter (mockup + AI agent)
5. Calibration banner (understanding gap metrics)

**Alternatives rejected:**
- Stories only, Points later — Without Points, you verify randomly. Points tell you WHERE understanding gaps matter.
- Sifter first — Complex to build. Mockup-first approach validates UX before backend investment.
- Two separate products — Same auth, same profiles, shared components. One codebase, two journeys.
- Full backend before mockups — Mockups with fake data let us validate UX faster.

**Consequences:**
- `mvp_pledge.md` to be archived — it describes old product
- New `product-vision.md` needed — single source of truth for Sensemaking Platform
- `CLAUDE.md` needs Product Overview section
- P55 likely outdated — needs review against new direction
- /live enhancement: verify Stories, suggest Points for position-taking
- Calibration = Understanding Gap (self-rating vs speaker verification after explain-back)

---

## 2026-01-17 [technical]: P66 - Live meeting hosting requires authentication

**Context:** Anyone could start a Clarity Live meeting without an account. We wanted accountability and quality by requiring registration.

**Decision:** Gate meeting hosting behind auth, but keep joining open:
- Guests on `/live` → redirected to `/signup`
- Guests on `/live/CODE` → can join (invited participants don't need accounts)
- Logged-in users → can host meetings
- Non-pledged users (has_pledged=false) CAN host — they're still verified users

**Alternatives rejected:**
- Require pledge to host — too restrictive; many users want to try meetings before committing to pledge
- Show different page content based on auth — adds complexity; redirect is simpler
- Auto-redirect back to `/live` after signup — KISS principle; user can navigate via nav

**Consequences:**
- Analytics event stays `try_meeting` (renaming breaks historical data)
- Button text changed from "Try a Clarity Meeting" → "Start a Clarity Meeting" to match gated UX
- P66.1 added page-load redirect (not just button-click gate)

---

## 2026-01-17 [process]: Knowledge-Driven Development (KDD) adoption

**Context:** Documentation goes stale immediately. Feature docs are written once during planning but never updated after implementation. Trade-offs and "why" decisions are lost to git commit history where they're hard to find.

**Decision:** Adopt a minimal knowledge capture system:
- `docs/decisions.md` (this file) - append-only log of trade-offs and reasoning
- `/kdd` skill - manual command to capture decisions when they matter
- `features/archive/` - where completed feature docs go after merge

**Alternatives rejected:**
- CHANGELOG.md - Git log already tracks changes; we need "why" not "what"
- ARCHITECTURE.md - CLAUDE.md already covers this
- Pre-merge hooks - Too much friction; manual discipline is enough
- Auto-archival with pattern matching - Fragile and over-engineered

**Consequences:**
- Run `/kdd` after finishing features with interesting trade-offs
- Move feature docs to `features/archive/` manually after merge
- This file grows indefinitely (append-only) - newest at top for easy reading
