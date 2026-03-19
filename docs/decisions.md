# Decisions Log

Append-only log of architectural and product decisions. Newest entries at top.

## 2026-03-19 [technical]: Performance — defer analytics, lazy-import all pages, self-host fonts

**Context:** Lighthouse audit showed 1.2MB of third-party JS (LogRocket 794KB + Mixpanel 436KB) loading eagerly, 12 synchronously imported pages, render-blocking SW registration, and a 700ms Google Fonts waterfall (3-hop chain: HTML → CSS → API → woff2). Signed-in users saw two sequential loading states: ClarityPageLoader (300-500ms waiting for profile fetch) then FeedSkeleton (200-800ms for feed queries).
**Decision:** Six changes shipped as P553 + P555: (1) LogRocket deferred via `requestIdleCallback`, (2) 10 pages converted to `React.lazy()`, (3) preconnect hints for Supabase, (4) `registerSW.js` deferred via `injectRegister: 'script-defer'`, (5) immutable cache headers for hashed assets in vercel.json, (6) KaTeX CSS lazy-loaded with /manifesto route only. P555 added: (7) HomeRedirect redirects on `session` check (~10ms) instead of waiting for profile fetch, (8) Google Fonts self-hosted (Inter + Playfair Display woff2 in `public/fonts/`). Critically, `/challenge-prd` caught that Supabase already caches auth sessions in localStorage — a proposed `cp-auth-hint` localStorage fast-path was redundant and would have created divergent state.
**Alternatives rejected:** (1) localStorage auth hint — Supabase already does this; adding a second cache creates divergent state for zero gain. (2) Feed data prefetch — `getPublicPointsFeed` needs `viewerUserId` for position data; prefetching without it causes a flash. (3) Navigation progress indicator — `react-router-dom` v6 with `BrowserRouter` doesn't support `useNavigation()`; would require migrating to `createBrowserRouter`. (4) Remove LogRocket entirely — deferred for now, decision pending on whether Sentry alone suffices.
**Consequences:** LCP improved from 918ms to ~400-500ms (lab). Critical path from 1,848ms to ~200ms. Auth redirect from 300-500ms to ~10ms. Font waterfall eliminated. Remaining bottleneck: LogRocket still loads 794KB (deferred but not removed). Next opportunity: evaluate dropping LogRocket entirely.
**References:** [P553 spec](features/done/22_mar_26/p553_performance_defer_eager_js.md), [P555 spec](features/done/22_mar_26/p555_auth_fast_path_loading_ux.md)

## 2026-03-19 [technical]: Ghost code injection — stop before DB edit, never restart

**Context:** Ghost caches settings (including `codeinjection_head`) in memory. When using `docker restart`, Ghost writes its in-memory cache back to SQLite on shutdown, overwriting any direct DB edits made while Ghost was running. Three rounds of `docker cp` → edit → `docker restart` were silently lost before discovering this.
**Decision:** Correct deployment pattern: `docker stop` → `docker cp` DB out → edit via Python/sqlite3 → `docker cp` DB back → `docker start`. Never use `docker restart` for code injection changes. This supersedes the pattern documented in the 2026-03-19 "Ghost code injection as full styling layer" entry (which said `docker restart`).
**Alternatives rejected:** (1) Ghost Admin API PUT `/settings/` — returns 501 NotImplementedError on Ghost v5.130 with our API key. (2) Ghost Admin UI — works but not scriptable.
**Consequences:** All future Ghost code injection updates must stop the container first. ~15s downtime per deploy (13s Ghost boot). The `/tmp/fix-ghost-subscribe.py` pattern (uploaded script, stop→edit→start) is the reference implementation.

## 2026-03-19 [product]: Blog Subscribe button — Ghost Portal modal, not page navigation

**Context:** The header "Subscribe" button on blog.claritypledge.com linked to `BL + '/'` (the blog homepage) — effectively a no-op. The 2026-03-19 nav entry previously rejected Ghost Portal because it showed "Already a member? Sign in" (confusing: Ghost login ≠ ClarityPledge login). This session found a way to fix the blocker.
**Decision:** Subscribe button now uses `href="#/portal/signup"` + `data-portal="signup"` to trigger Ghost's native Portal signup modal. Three customizations applied via polling JS (200ms interval, injecting into Portal's same-origin iframe): (1) hide `.gh-portal-signup-message` ("Already a member? Sign in"), (2) rename "Sign up" → "Subscribe" on `.gh-portal-btn-main`, (3) existing disclaimer text ("subscribing to newsletter, not creating platform account") remains. Polling was necessary because MutationObserver fires before the iframe's internal DOM renders.
**Alternatives rejected:** (1) Page navigation to `/#subscribe` — only works on landing page, not from article pages. (2) MutationObserver on portal root — fires too early, before iframe content renders. (3) Custom modal (no Ghost Portal) — reinvents what Ghost already provides.
**Consequences:** Subscribe is now accessible from every blog page via the header button. Ghost Portal handles email collection, magic link flow, and member creation. The polling script adds ~0ms overhead (200ms interval, exits after first injection). Reversal of the earlier "rejected" status for Ghost Portal — the iframe CSS injection technique unblocked it.

## 2026-03-19 [product]: Ghost blog — reduce self-branding to one functional mention

**Context:** Blog homepage showed the author's name 3 times in a single viewport: "FEATURED" label (hardcoded in JS), "BY VYACHESLAV LADISCHENSKI" byline on the featured post, and the bio card at the bottom. Plus "By Vyacheslav Ladischenski" on the subscribe landing overlay. With only one published article, "FEATURED" was meaningless and "More posts coming soon" signaled incompleteness.
**Decision:** Remove all redundant self-branding: (1) "FEATURED" label — deleted from JS, (2) author byline on featured post and post list — show date only, (3) "By Vyacheslav Ladischenski" on landing overlay — removed, (4) "More posts coming soon" — removed entirely. Keep the bio card ("Fractional Chief Clarity Officer") as the sole name-adjacent element — it's functional (drives to ladischenski.com services page). Also fixed sidebar layout: when no additional posts exist, sidebar was centered due to empty flex sibling; now pinned right via `justify-content: flex-end` + `width: 100%` on the wrapper.
**Alternatives rejected:** (1) Keep all branding — looks like territory-marking on a solo blog. (2) Remove bio card too — loses the services CTA, the one place where self-reference serves the reader. (3) Replace full name with "Slava" — still redundant when it appears 3 times.
**Consequences:** Author identity conveyed once via bio card (role + CTA), not repeated. Pattern: on a solo creator blog, let content establish authority — explicit bylines add noise. Sidebar layout now handles the 1-post state gracefully; will auto-switch to two-column when more posts are published.

## 2026-03-19 [product]: Ghost blog typography — match Substack's visual density via font-size compensation

**Context:** Blog articles on blog.claritypledge.com were visually different from Substack despite matching computed CSS values (19px, 728px width, 20px paragraph spacing). Side-by-side comparison revealed Inter font renders 9% wider per character than SF Pro Display — same px size, different visual density.
**Decision:** Use 17px Inter to match 19px SF Pro Display visual weight. Override Ghost's CSS Grid layout (`display: block !important`) to eliminate the hidden 48px gutters constraining paragraphs to 632px inside a 728px container. Kill `margin-top` on paragraphs (Ghost theme added 28px, doubling the 20px gap). Text color `rgb(54,55,55)` (dark gray, not black). All changes via Ghost code injection CSS.
**Alternatives rejected:** (1) Switch font to SF Pro Display — not available on non-Apple devices. (2) Keep 19px Inter — visually heavier than reference. (3) Change Ghost theme — brittle, theme updates would overwrite.
**Consequences:** Blog typography now matches Substack's reading experience. Code injection is the entire styling layer — Ghost theme provides structure, we override everything visual. Font-size compensation is a reusable pattern when matching designs across different typefaces.

## 2026-03-19 [product]: Ghost blog nav — "Clarity Pledge · Blog" identity with Subscribe + Log in

**Context:** Blog used the same nav as claritypledge.com main site (Events, Blog, Start a Clarity Session). Readers couldn't tell they were on the blog vs the main site. Ghost's built-in portal modal showed a confusing "Sign in" link for Ghost membership, not ClarityPledge accounts.
**Decision:** Custom nav: "Clarity Pledge · Blog" logo (left), Subscribe button + Log in link (right). Subscribe links to blog homepage (landing overlay handles the form). Log in links to claritypledge.com/login. Removed tag labels, excerpt, and author byline from article pages. Hamburger menu retains cross-nav links to main site.
**Alternatives rejected:** (1) Ghost portal signup modal — shows "Sign in" for Ghost membership, confusing since we want ClarityPledge login. (2) Inline subscribe dropdown in nav — unusual UX pattern, no established sites do this. (3) Keep main site nav — doesn't signal "you're reading a blog."
**Consequences:** Blog has clear identity separate from main site. Subscribe flow goes through our controlled landing overlay (no Ghost portal confusion). All article metadata (tag, excerpt, byline) hidden — clean title → image → content layout.

## 2026-03-19 [technical]: Ghost code injection as full styling layer — override theme, don't modify it

**Context:** Multiple iterative fixes to Ghost blog layout required: content width, paragraph spacing, grid layout override, typography, nav changes. All done via Ghost's `codeinjection_head` setting in the SQLite DB.
**Decision:** Ghost code injection CSS is the complete visual layer. Pattern: `docker cp` DB out → Python sqlite3 update → `docker cp` back → `docker restart`. Theme provides structural HTML; code injection overrides all visual properties with `!important` where needed. Key overrides: `display: block !important` (kills Ghost grid), `margin-top: 0 !important` (kills theme paragraph margins), `letter-spacing: normal` (overrides theme's negative tracking).
**Alternatives rejected:** (1) Edit Ghost theme files directly — fragile, lost on theme updates. (2) Create custom Ghost theme — high maintenance for what's essentially CSS overrides. (3) Use Ghost Admin UI settings — limited to basic colors/fonts, can't override grid layout.
**Consequences:** All blog visual changes are in one place (code injection). Deployment is: edit Python script → SCP → run → restart. Takes ~15 seconds per change + 12s Ghost restart. The entire code injection block is now ~1200 lines (CSS + JS for nav, layout, subscribe).

## 2026-03-19 [process]: Content pipeline — /enhance-blog skill added after /draft-blog

**Context:** First blog post enhanced with interactive visuals manually. Process was repeatable: fetch → brainstorm ideas → falsify to budget → build blocks → preview → insert. Created as a skill to avoid ad-hoc work next time.
**Decision:** New skill `/enhance-blog` in `content/` namespace. Position in pipeline: after `/draft-blog`, before `/ship-blog` (optional step). Brainstorms 60 ideas via subagent, falsifies to text-based budget (1 block per 400-600 words, max 5) via second subagent, builds in parallel, serves local preview page for user review before inserting into Ghost.
**Alternatives rejected:** (1) No skill — do manually each time. (2) Simpler skill without brainstorm/falsify — would produce the same 4 obvious ideas every time instead of discovering creative options.
**Consequences:** Content pipeline is now: `/story` → `/prepare-blog` → `/draft-blog` → `/enhance-blog` (optional) → `/ship-blog`. Updated in `docs/content-process.md`.
**References:** [content-process.md](content-process.md), [.claude/commands/slava/content/enhance-blog.md](../.claude/commands/slava/content/enhance-blog.md)

## 2026-03-19 [technical]: Ghost SQLite write contention — 1s delay required for Admin API member creation

**Context:** Syncing 36 verified ClarityPledge users to Ghost as named newsletter subscribers. Ghost on Docker uses SQLite. First run sent rapid-fire POST requests — all returned HTTP 201 with valid member IDs, but data was silently lost (only 2 of 36 persisted). Second run with 500ms delay lost data after ~12 creates (JSON parse error from Ghost). Third run with 1s delay succeeded: all 34 new members persisted.
**Decision:** All Ghost Admin API write operations must include a minimum 1s delay between requests. This applies to member creation, post updates, and any sequential write pattern. The delay is documented in `/sync-ghost-members` skill.
**Alternatives rejected:** (1) No delay — returns 201 but silently drops data. (2) 500ms delay — still causes intermittent failures under sustained writes. (3) Batch endpoint — Ghost Admin API has no bulk member creation endpoint.
**Consequences:** Member sync for ~36 users takes ~40s. Acceptable for current scale. If user count grows significantly, consider migrating Ghost to MySQL/Postgres to eliminate SQLite contention.
**References:** [sync-ghost-members.md](.claude/commands/slava/client/sync-ghost-members.md)

## 2026-03-19 [product]: Sync verified users to Ghost — overrides "defer until 100+" decision

**Context:** Wanted to personalize Ghost newsletter outreach with subscriber names. Prior decision (2026-01-28) deferred user→subscriber sync until 100+ subscribers. With 36 verified users and Ghost newsletters becoming the primary outreach channel, the sync is now valuable.
**Decision:** Sync all verified ClarityPledge users (name + email) to Ghost as free members. Exclude: unverified users (never confirmed email — hurts deliverability), test accounts (`*@claritypledge.com`). Created `/sync-ghost-members` skill in `client/` namespace for repeatable execution.
**Alternatives rejected:** (1) Include unverified users — risk of bounces and spam reports from unconfirmed addresses. (2) Keep deferring — prevents personalized newsletters, no cost to syncing now. (3) Automated webhook sync — premature; manual skill invocation sufficient at current scale.
**Consequences:** Ghost now has 36 named subscribers ready for `{{name}}` personalization in newsletters. Run `/sync-ghost-members` before each newsletter to pick up new signups. Automated sync (Supabase webhook → Ghost) becomes worthwhile at ~100+ users with regular newsletter cadence.
**References:** [sync-ghost-members.md](.claude/commands/slava/client/sync-ghost-members.md), [development-process.md](docs/development-process.md) "Client & Outreach Skills" section

## 2026-03-19 [product]: Blog visual enhancement — interactive JS blocks over static images

**Context:** First long-form blog post ("Two Skills That Will Define the Next Generation of Founders") needed visual breaks in a 2000+ word essay. Options: static images, AI-generated infographics, or interactive JS.
**Decision:** Self-contained HTML/CSS/JS blocks embedded as Ghost HTML cards. Three block types: (1) animated number counters (IntersectionObserver-triggered), (2) interactive 2×2 matrix (hover/tap to reveal descriptions), (3) animated circular flow diagram (auto-advancing, click to pause). No external dependencies — everything inline.
**Alternatives rejected:** (1) Static images — no engagement, feel decorative on a raw personal essay. (2) AI-generated infographics — risk looking "produced" and undercut the honest tone. (3) Publish text-only first, add visuals later — user chose to build visuals now.
**Consequences:** Blog posts can now include interactive JS blocks. Pattern established: analytical visuals (diagrams, matrices, counters) fit the brand; decorative imagery doesn't. Blocks stored in `.private/blog-visuals/` for reuse. Ghost HTML cards preserve `<script>` tags.

## 2026-03-19 [product]: Blog embed strategy — point-only at article end, no story embed

**Context:** Blog post had both a story embed and a point embed at the end. The story compressed the same narrative the reader just spent 8 minutes reading.
**Decision:** Show only the point embed (collapsed) at article end. Remove the story iframe. The blog article IS the story — the story embed is redundant. Point = action CTA ("agree or disagree").
**Alternatives rejected:** (1) Both embeds — visual clutter, unclear which to engage first. (2) Story only — no engagement hook, read-only format. (3) Point expanded — too heavy after a long article.
**Consequences:** Blog→ClarityPledge conversion funnel is: read article → take position on point → explore linked story from within the point. One CTA, one action.

## 2026-03-19 [technical]: Ghost Admin API — lexical HTML card format and post-level CSS injection

**Context:** Needed to insert interactive HTML blocks into a Ghost blog post programmatically and apply post-scoped CSS overrides.
**Decision:** Lexical HTML card node format: `{type: 'html', version: 1, html: '<full html>'}`. Post-level CSS via `codeinjection_head` field on the post object. Ghost theme class names for read-more cards: `article.gh-card.post` with children `.gh-card-image`, `.gh-card-excerpt`, `.gh-card-meta`.
**Alternatives rejected:** None — this is the only documented path for Ghost's lexical editor API.
**Consequences:** Future blog posts can be enhanced via API. Inline `style="opacity:0"` on elements breaks CSS class-based transitions (inline beats ID+class specificity) — use CSS-only initial state. Race conditions on `updated_at` can silently drop changes — always fetch fresh `updated_at` before PUT.
**References:** [Ghost Admin API docs](https://ghost.org/docs/admin-api/)

## 2026-03-19 [product]: P539 — Calibration zero-state: "Listening calibration" on all profiles, segmented bar, neutral text

**Context:** P152's calibration display showed the same empty bar for both "no data" and "mid-calibration" — misleading. P539 redesigned the zero-state through iterative exploration: dots → segmented bar → metadata-line → final design. Multiple design rounds surfaced key product decisions.
**Decision:** (1) Header: "Listening calibration" (coach-facing term from definitions.md). Not "Understanding Calibration" (too long) or "Calibration" (too vague). (2) Show on ALL profiles (own + guest) — social accountability ("you have 2/5, do 3 more"). Originally hid on guest profiles, reversed after realizing the progress display creates peer pressure. (3) Tooltip text is neutral — states the measurement ("Confidence matches verified understanding"), no judgment or encouragement. Works identically for own and guest profile views. (4) Segmented bar (thin, h-1.5, bg-blue-400/70) for <5 sessions — visual continuity with the calibration bar it becomes. Dots rejected (looked like gamification/punch card). (5) Text: "N more clarity sessions needed" — "clarity sessions" anchors the term, "needed" is action-framing. (6) Separate `calibrationLoaded` flag — calibration renders as soon as its data arrives, not after all content loads.
**Alternatives rejected:** (A) Dots (w-2.5 circles) — looked cheap/gamified, like a loyalty punch card. (B) Tiny inline bar (w-16) for calibrated state — too small to show meaningful position differences. (C) Hide on guest profiles — lost the social accountability benefit. (D) "Well calibrated" label below bar — redundant with tooltip. (E) "Understanding Calibration" header — too wordy, "Listening calibration" matches coach vocabulary.
**Consequences:** Ears count redesign surfaced as follow-up: ears should require rating=10 (not ≥8), cap at 10 per person (not 1 per distinct person). Separate change-request needed.
**References:** [P539 spec](features/done/22_mar_26/p539_calibration_zero_state_redesign.md), `src/app/components/profile/calibration-display.tsx`

## 2026-03-19 [technical]: Pyannote pre-load fix: 71 min → 8 min. Speaker split still broken (99.7%/0.3%)

**Context:** Pyannote diarization on Cloud Run L4 GPU took 76 min for 30 min audio. Root cause identified from GitHub issues #1403, #1452, #1453: pyannote's internal `crop()` reads thousands of tiny audio slices from disk. Fix: pre-load entire WAV into memory, pass `{"waveform": tensor, "sample_rate": int}` instead of file path. Result: **8 min** (10x speedup). However, speaker attribution is still 99.7%/0.3% — pyannote assigns nearly all speech to one speaker on `amix`-mixed two-phone audio. The speed was never the real problem; the diarization quality on mixed same-room audio is fundamentally broken.
**Decision:** Keep the pre-load fix (deployed as rev 014). P552 separate-channel approach was wrong (both phones in same room capture both speakers — "recorder = speaker" assumption fails). Next step: research whether diarization on same-room mixed audio is solvable, or if the approach needs to change entirely (energy-based gating, voice enrollment, or external API like Deepgram multichannel).
**Alternatives rejected:** (A) P552 separate-channel "skip diarization" — reverted, wrong assumption. (B) Accept 99.7%/0.3% — unusable for FCO workflow. (C) Increase timeout further — speed is now 8 min, not the bottleneck.
**Consequences:** Speed problem solved. Quality problem is the open blocker. Requires research: how do Deepgram, AssemblyAI, and others handle diarization of mixed same-room audio? Is pyannote's 99.7%/0.3% a configuration issue (e.g., `amix` destroys phase information that pyannote needs) or a fundamental limitation? The `amix` filter averages channels — this may remove the spatial cues pyannote relies on. Alternative: pass separate channels as stereo (preserving spatial information) instead of mixing to mono.
**References:** `services/transcribe/diarizer.py`, pyannote GitHub #1403

## 2026-03-19 [technical]: Unify link systems — auto-URL + markdown in one function, hints survive /falsify

**Context:** Two parallel link systems: `linkifyText()` (auto-URL, bio only) and `<LinkedText>` (markdown `[text](url)`, stories/points). Different syntax, different colors (`text-blue-500` vs `text-blue-600`), inconsistent documentation. Users paste raw URLs in stories → plain text. /innovate recommended dropping form hints ("auto-URL is the discoverability") but /falsify killed all 3 proposals: (1) the bio's own hint proves auto-detection alone was deemed insufficient, (2) auto-URL actively suppresses markdown discovery — users stop exploring once basic case works, (3) `[text](url)` is not a power-user feature — it's the only named link mechanism.
**Decision:** (1) Extend `linkifyText()` with two-phase parsing: markdown first (regex), then auto-URL on remaining segments. (2) Keep form hints with concrete examples ("Paste URLs or write `[click here](https://...)` for named links") — not abstract syntax. (3) Replace all `<LinkedText>` consumers (8 files), delete component. (4) Standardize to `text-blue-500`, `text-muted-foreground` for hints.
**Alternatives rejected:** (A) Drop hints entirely (auto-URL is enough) — /falsify killed this: named links undiscoverable, bio hint is standing counter-evidence. (B) Abstract syntax in hints (`[text](url)`) — intimidating for non-technical co-founders, concrete example teaches better. (C) Rich text editor (Tiptap) — massive scope increase for a problem solvable with regex.
**Consequences:** One link system everywhere. Any new text surface uses `linkifyText()` — no decision needed. Pre-commit script fix: `--diff-filter=d` excludes deleted files from ESLint (bug found during P540).
**References:** [P540 spec](features/done/22_mar_26/p540_hyperlink_consistency.md)

## 2026-03-18 [technical]: Pyannote diarization is 100x slower than benchmarks — separate-channel transcription eliminates it

**Context:** Pyannote 3.1 diarization on Cloud Run L4 GPU takes 76 minutes for 30 min audio (2.5x real-time). Pyannote's own benchmark is ~45 seconds — we're 100x slower (likely ONNX CPU fallback or disk I/O). But the deeper insight: we already have separate phone recordings per speaker (`recorder_wavs` in `audio.py`), but `_merge_wavs()` mixes them into one stream via `amix`. Diarization then spends 76 min recovering what we already had.
**Decision:** (1) Build separate-channel transcription as primary path — transcribe each phone independently, interleave by timestamp. Drops pipeline from 79 min to ~4 min. (2) Fix pyannote speed (verify GPU, remove ONNX) as fallback for single-phone sessions. (3) Use round structure from events.json for structured portions.
**Alternatives rejected:** (A) Accept 76 min diarization — unusable for regular workflow. (B) Switch to Deepgram API — unnecessary now that separate-channel eliminates diarization. (C) Skip pyannote fix — still needed as fallback for single-phone recordings.
**Consequences:** P546's word-level merger code is still correct and deployed (revision 013). The merger works regardless of whether speaker labels come from diarization or channel separation. The architecture change is in `audio.py` (stop mixing) and `pipeline.py` (transcribe channels separately).
**References:** Research report at `~/Documents/Speaker_Diarization_Speed_Research_20260318/`, `services/transcribe/audio.py`

## 2026-03-18 [process]: Cloud Run GPU pipeline needs DB progress tracking before deploying new code

**Context:** P546 (transcription quality improvements) deployed to Cloud Run revision 011. The pipeline started processing H44Q9H — Whisper completed (10495 words in 186s), diarization started — then silence. No transcript stored, no error logged, no way to determine what happened. 30+ minutes of blind polling. Root cause analysis: the pipeline runs as a synchronous HTTP handler doing 20-70 min GPU work with no progress reporting, no crash recovery, and no observability past the HTTP timeout. Without visibility, debugging a new code change that crashes mid-pipeline is a guessing game.
**Decision:** Revert to pre-P546 pipeline code (proven on 28 sessions) + baked Whisper model. Before re-attempting P546: add `processing_status` tracking (write status at each pipeline stage to DB). Only then redeploy P546 changes — any failure will show exactly where it died.
**Alternatives rejected:** (A) Increase timeout and retry blindly — if it's a code bug, wastes GPU time. (B) Wait for scheduler to pick it up — could fail the same way with no visibility. (C) Switch to Cloud Run Jobs — right long-term but scope creep for 3-5 sessions/month.
**Consequences:** P546 code changes (word-level merger, VAD, language hint) are written, tested (13 unit tests pass), committed to git, but NOT deployed. Next step: add progress tracking (~30 min work), then redeploy P546.
**References:** [P546 spec](features/done/23_mar_26/p546_transcription_quality_improvements.md), `services/transcribe/pipeline.py`

## 2026-03-18 [technical]: Bake Whisper model into Docker image — eliminates Cloud Run cold start failures

**Context:** Cloud Run GPU instances download the 1.5GB Whisper large-v3-turbo model on every cold start from HuggingFace CDN. Download intermittently fails with SHA256 checksum mismatch, killing the instance with no recovery (maxScale=1, GPU quota=1). This caused all E7QDTX/H44Q9H reprocessing attempts to fail on revision 010.
**Decision:** Pre-download model at Docker build time (`RUN python -c "import whisper; whisper.load_model('large-v3-turbo', download_root='/app/models')"`) and set `WHISPER_CACHE_DIR=/app/models`. Image grows from ~2GB to ~4GB but cold start is reliable — model loads from local cache in 6s instead of 25s+ network download.
**Alternatives rejected:** (A) Retry loop on download — still fragile, adds cold start latency. (B) GCS model cache — faster than HuggingFace but still a network download. (C) min-instances=1 (keep warm) — $730/mo for 3-5 sessions.
**Consequences:** Cold start is reliable. Build time increased by ~5min (model download). All future revisions include the model. `transcriber.py` checks `WHISPER_CACHE_DIR` env var and passes `download_root` to `whisper.load_model()`.
**References:** `services/transcribe/Dockerfile`, `services/transcribe/transcriber.py`

## 2026-03-18 [technical]: P546 transcription quality — innovate→falsify→challenge narrowed 7 items to 3

**Context:** Corpus audit of 28 sessions revealed 5 transcription quality problems (broken diarization, hallucinations, language misattribution, mega-segments, ambient noise). Original P546 spec proposed 7 fixes. The /innovate skill generated 30 alternatives (including WhisperX, Deepgram API, Gemini audio-native analysis). The /falsify skill stress-tested top 5 candidates.
**Decision:** Narrowed to 3 changes: (1) word-level diarization alignment in merger.py (the core fix — word timestamps exist but were thrown away), (2) pyannote VAD preprocessing to eliminate hallucinations on silence, (3) language hint to Whisper. Rejected: WhisperX (stale lib, Oct 2023), Deepgram (recurring cost when $25k GCP credits exist, destroys voice profiles), Gemini audio (incompatible with structured pipeline), hallucination post-filter (brittle hardcoded patterns), round structure correction (fights pyannote). Phased approach: fix, measure, then decide on remaining items.
**Alternatives rejected:** Deepgram API ($0.26/session recurring cost vs $0 self-hosted with GCP credits, no speaker embeddings). WhisperX (last release Oct 2023, 326 open issues, pyannote 3.0 vs our 3.1). All-7-items-at-once (items 3-7 premature without measurement).
**Consequences:** P546 code written and unit-tested but deployment blocked by observability gap (see decision above). The /innovate→/falsify→/challenge-prd sequence proved effective for infrastructure decisions — not just product features.
**References:** [P546 spec](features/done/23_mar_26/p546_transcription_quality_improvements.md)

## 2026-03-18 [process]: Confirm problem framing before creating specs (/create-prd step 1.5)

**Context:** P544 was created with a "gating" framing, then fully rewritten after user pushed back twice and the frame shifted to "feedback not gates." One round of spec creation wasted. Root cause via /falsify: neither `/create-prd` nor its agent had a pre-flight check for whether the user agrees on the problem framing.
**Decision:** Added step 1.5 to `/create-prd` agent: paraphrase the problem statement back, ask "is this the right framing?", resolve pushback before structuring. Skipped `/quick-feature` — it's a 30-second skeleton where framing checks add inappropriate friction.
**Alternatives rejected:** (A) Add to `/quick-feature` too — defeats its purpose as fast idea capture. (B) Discipline-only (process-learnings entry) — /falsify proved it doesn't wire into any agent workflow.
**Consequences:** One additional exchange at the start of `/create-prd`. Prevents wasted spec rewrites when the problem framing is unsettled. Process-learnings entry graduated (removed).
**References:** [create-prd agent](../.claude/commands/slava/build/create-prd/agent.md), [create-prd.md](../.claude/commands/slava/build/create-prd.md)

## 2026-03-18 [technical]: Unmocked services in component tests cause phantom unhandled rejections

**Context:** `profile-page-v2-points-regression.test.tsx` blocked pre-commit hooks with `window is not defined` — but only in the full suite, never in isolation. 5-why traced it to: agreements-service (added in P422) was never mocked, so the real supabase client ran inside `Promise.all()`, its async chain outlived the test, resolved after jsdom teardown destroyed `window`, and React's scheduler hit the missing `window` in `resolveUpdatePriority`.
**Decision:** When a component test mocks N-1 of N services in a `Promise.all`, the Nth unmocked service runs real network calls that outlive the test. Mock ALL services a component calls, not just the ones being tested. The fix for this instance: add `vi.mock('@/app/data/agreements-service')` returning empty arrays.
**Alternatives rejected:** (A) Adding `@vitest-environment jsdom` directive — already present, wasn't the issue. (B) Increasing test timeout — masks the real problem (unmocked async outliving teardown).
**Consequences:** Pattern for future component tests: grep for all service imports in the component under test, ensure every one is mocked. When a new service is added to a component (like P422 adding agreements), existing tests for that component need a new `vi.mock` line.
**References:** `src/tests/profile-page-v2-points-regression.test.tsx`

## 2026-03-18 [product]: Quality criteria are feedback signals, not publication gates

**Context:** Audited 9 prod points against sifter-point criteria. Initial framing: separate point types (feed vs pedagogical vs branded), gate creation, enforce different quality standards per context. User pushback revealed this was wrong on three fronts: (1) the line between "community" and "pedagogical" content is subjective — who decides? (2) gating contradicts Popperian epistemology — conjectures should be freely offered, refutation improves them (3) positions on ALL content create common knowledge, and position shifts after story exposure = the story performance metric (error correction made visible).
**Decision:** Point quality criteria (falsifiable, counterfactual, hard-to-vary, voice) become AI-generated feedback shown to authors at creation time — not publication gates. Any claim can enter the system. Scores are advisory metadata visible to authors and optionally to readers. Story performance is operationally defined as position shifts on connected points after story exposure. P544 rewritten to reflect this. P550 filed for visual quality indicators.
**Alternatives rejected:** (1) Separate content types with different quality criteria per context — subjective line, adds schema complexity for 9 points. (2) Gate publication with minimum score threshold — contradicts epistemology, suppresses "wrong enough to be interesting" claims. (3) Remove pedagogical/branded points from DB, make static — forecloses position-taking which IS the product mechanism.
**Consequences:** philosophy.md updated to make this principle explicit. Sifter skills (sifter-point.md, sifter-definitions.md) need updating: show scores to user, remove "structural gate" language. Future point creation flow shows AI quality feedback before publish. No score blocks publication.
**References:** [P544](../features/p544_prod_point_quality_audit.md), [P550](../features/p550_point_story_quality_indicators.md), [sifter-point.md](../.claude/commands/slava/content/sifter-point.md)

## 2026-03-18 [technical]: Embed default collapsed + expanded URL param (P548)

**Context:** Story and point embeds auto-expanded linked content, taking excessive vertical space in blog posts. Both components hardcoded `isEmbed` into `useState` initializers. /innovate generated 30 alternatives; /falsify tested top 3 against first principles.
**Decision:** Default both embeds to collapsed. Add `?expanded=true` URL param for opt-in expansion. ShareDialog generates the param — user never types it manually. The /falsify critique ("permanent API surface for one author") was resolved because the dialog handles URL construction, not the user.
**Alternatives rejected:** (A) Just remove auto-expand, no param — forecloses ability to ever have expanded embeds. (B) Remove linked content from embeds entirely — non-proportional, loses value of showing author's stance on linked points.
**Consequences:** `useEmbedNavigation` hook now returns `{ isEmbed, isExpanded, embedNavigate }`. Existing `?embed=true` URLs become collapsed (intentional). ShareDialog redesigned: stacked Link + Embed sections (no tabs), Collapsed/Expanded preset row under embed code.
**References:** `features/done/24_mar_26/p548_embed_collapse_control.md`

## 2026-03-18 [product]: Coach-as-channel — filed as hypothesis (H-CoachChannel), not promoted to primary

**Context:** Conversation analysis (36 Claude.ai conversations, Mar 10-18) surfaced consistent signal: Canvas v2 falsification rejected EA investors (pool too small), validated coaching market ($100B+, existing alignment vocabulary, active tool adoption). Multiple conversations positioned coaches as PRIMARY distribution channel.
**Decision:** File as new hypothesis (H-CoachChannel) with EXPLORE status, not promote to primary channel. Evidence is strong but untested — zero coaches have been approached. Coaches need proof (events + paid sessions) before being pitched. Sequence: prove model yourself → events → paid sessions → THEN approach coaches.
**Alternatives rejected:** (A) Promote immediately to primary channel in lean-canvas — premature commitment to untested bet.
**Consequences:** H-CoachChannel added to hypotheses.md, blocked by H-PairsReturn. Coach/OD use case in lean-canvas updated with Canvas v2 falsification results. Approach coaches after events + PWIW sessions produce proof.
**References:** `docs/hypotheses.md` (H-CoachChannel), `docs/lean-canvas.md` (Promising Use Cases)

## 2026-03-18 [product]: Pay-what-it's-worth replaces €199 fixed price for C1 entry point

**Context:** €199 Alignment Check was stripped from ladischenski.com because (1) 4 services was 1 too many on the page, (2) Slava started offering free/PWIW sessions. ladischenski.com/thank-you page now shows PWIW model: deposit upfront based on expected value, refund any amount after based on perceived value. This generates genuine WTP signal without the "ask" barrier. Aligns with donation-after-session model in lean-canvas validation status.
**Decision:** Replace €199 fixed price with pay-what-it's-worth in the price ladder. Communicate PWIW upfront (not retroactively — asking completed pairs after the fact is a trust breaker). Kill condition unchanged: if 5 pairs' total voluntary payments < €200, problem isn't painful enough to monetize.
**Alternatives rejected:** (1) Keep €199 — creates ask barrier that blocks WTP signal. (2) Pure donation (no upfront framing) — loses anchoring and feels ambiguous.
**Consequences:** Lean-canvas price ladder updated. Future sessions must communicate PWIW before the session, not after. Data from PWIW sessions directly instruments H-WTP-Pain.
**References:** `docs/lean-canvas.md` (Price Ladder), ladischenski.com/thank-you

## 2026-03-18 [product]: Intelligence infrastructure as strategic through-line — coaching IS data collection

**Context:** Multiple conversations converged on reframing ClarityPledge from "calibration coaching service" to "building the world's first dataset of measured human misunderstanding." This connects the coaching service (data collection) to mirror agents (data application) and explains why service revenue is strategic, not just survival.
**Decision:** Add "intelligence infrastructure" through-line to lean-canvas UVP shared foundation. Every session generates labeled calibration data — measured gaps between perceived and actual understanding. This isn't a pivot; it's naming what the coaching service already produces. The dataset powers future mirror agents and predictive misunderstanding detection.
**Alternatives rejected:** (1) Keep as future direction only — loses the strategic thread. (2) Replace coaching UVP — premature, coaching is current reality.
**Consequences:** Added to lean-canvas UVP. Reframes progress metric: session count and labeled data volume matter alongside revenue.
**References:** `docs/lean-canvas.md` (UVP Shared Foundation)

## 2026-03-18 [product]: Individual is buyer, pair is delivery — messaging targets the frustrated founder

**Context:** Conversation analysis surfaced: "The frustrated half of the pair reaches for the wallet. The other person is delivery context." Current lean-canvas and ladischenski.com address the pair jointly. But deductively: both co-founders rarely feel equal urgency. One person feels misaligned; they seek help; both arrive for the session.
**Decision:** Accept as messaging insight — message the frustrated individual ("I help founders who feel misunderstood by their co-founder"), deliver to the pair. Not a product change (delivery is still dyadic). Applies to P545 positioning and outreach copy.
**Alternatives rejected:** (1) Redesign product for individual use — protocol requires a dyad. (2) Keep pair-addressed messaging only — misses the buyer's emotional state.
**Consequences:** P545 ladischenski.com copy should speak to the frustrated individual. Outreach messages target one person. Both arrive for delivery. Verify in next sessions: do both actually show up, or does one drop?
**References:** P545, `docs/lean-canvas.md` (Customer Segments)

## 2026-03-18 [process]: Validate manually before building — P518, P546, P547 all start with manual testing

**Context:** Transcript analysis produced 3 specs (P518 session bookends, P546 diarization, P547 AI post-session coach). Each could be built immediately. But the underlying signals (is the qualifying question useful? is the pipeline worth fixing vs. buying? do education emails change behavior?) are all unvalidated.
**Decision:** Manual-first for all three: (1) P518 — ask the qualifying question verbally in next 3 sessions before coding it into the app. (2) P546 — benchmark Deepgram API on 3 sessions (half-day) before committing to pipeline rewrite (multi-day). (3) P547 — manually read 5 transcripts and send personalized education emails before automating detection+sending.
**Alternatives rejected:** Build all three immediately — would produce code for signals that might be wrong. The qualifying question might not produce useful data. Deepgram might be good enough. Education emails might not change behavior.
**Consequences:** P518/P547 implementation delayed by 1-2 weeks. P546 implementation depends on Deepgram benchmark result. All three specs remain in today/week status as written specs, not in-progress code.
**References:** P518, P546, P547

## 2026-03-18 [technical]: Embed symmetry — point embeds auto-expand stories, ShareButton wires fromUserId

**Context:** Story embeds already auto-expanded linked points (`useState(isEmbed)`) and passed `fromUserId` for position badges. Point embeds had neither: stories started collapsed, and the quote-pattern ShareButton (used on profile pages) omitted `fromUserId` from the generated embed URL. The `from` param handling in `point-detail-page.tsx` already worked — it was just never triggered.
**Decision:** (1) Point card `storiesExpanded` initializes to `isEmbed` (matching story card pattern). (2) Quote-pattern ShareButton passes `fromUserId={profileOwner?.id}`. Both embed types are now symmetric: author position visible, linked content expanded.
**Alternatives rejected:** (1) Keep stories collapsed in embeds — defeats the purpose of showing context. (2) Add `from` param only to point-detail-page ShareButton — profile page is where most embeds originate.
**Consequences:** Embed system is now complete and symmetric. Any new linked content type in embeds should follow: auto-expand + pass context user via `from` param.
**References:** `src/app/components/social/point-card-with-links.tsx`, `src/app/components/shared/ShareDialog.tsx`

## 2026-03-18 [product]: Problem statement refined — "can't distinguish agreement from understanding" not just "listeners overestimate"

**Context:** First systematic transcript corpus analysis (28 sessions, 68K words, 18+ pairs). Jb explicitly asked: "Is it about clarity or is it about agreement?" Stefan proved the conflation by accidentally giving a 5 when he cognitively understood at 9+ but disagreed. ~60% of sessions show surface paraphrase (repeating words, not interpreting meaning). The lean-canvas Problem section says "listeners overestimate comprehension" — true but incomplete.
**Decision:** The core problem is the metacognitive distinction itself: people conflate agreeing with understanding. "We're on the same page" means "I agree" not "I verified comprehension." This must be named explicitly in every session's first 2 minutes and reflected in lean-canvas Problem section.
**Alternatives rejected:** Keep "listeners overestimate" as primary framing — it's accurate but misses that the deeper issue is categorical (two concepts conflated), not quantitative (one number too high).
**Consequences:** Lean-canvas Problem section needs a "conflation problem" paragraph. Onboarding must lead with the agree/understand distinction before any protocol interaction. P518 pre-session nudge and P547 post-session coach both reference this.
**References:** `.private/docs/analysis/transcript-analysis-2026-03-18.md`, P518, P547

## 2026-03-18 [product]: Positioning shift — "co-founder de-risking" → "alignment on values, vision, and lean canvas"

**Context:** Transcript analysis showed deepest sessions are about fears, values, and identity — not business strategy. David called it "like a counselor." Victoria shared social anxiety. Jan surfaced fear of repeating past patterns. Sessions positioned as business calibration stayed shallow. The energy is in relationship depth at the values layer.
**Decision:** Reposition ladischenski.com from fear-based "prevent co-founder split" to generative "get explicitly aligned on values, vision, lean canvas." Same ICP (co-founders with active decisions), different entry point (values, not strategy). Conflict-prevention proof points stay as supporting evidence, not the lead.
**Alternatives rejected:** (1) Keep "de-risking" framing — fights against where the protocol naturally goes. (2) Pivot to "relationship tool" for all dyads — too broad, loses co-founder ICP specificity.
**Consequences:** P545 tracks the ladischenski.com copy changes. Lean-canvas Customer Segments ICP qualifier should note: "facilitation dependency confirmed — self-serve pairs default to surface paraphrase."
**References:** P545, `.private/docs/analysis/transcript-analysis-2026-03-18.md`

## 2026-03-18 [product]: Session bookends model — pre-session goal+depth, post-session qualifying question

**Context:** ~40% of sessions fail due to topic inadequacy. Zero pairs expressed that their gap was costing them anything (H-WTP-Pain signal). No data exists on whether sessions produce meaningful value vs. polite demos. P518 originally covered only pre-session goal alignment.
**Decision:** Expand P518 to "Session Bookends": (1) pre-session: goal alignment + topic depth ladder (4 levels, default Level 3/values), (2) post-session: one qualifying question — "Did this reveal something you didn't know?" (binary Yes/No/Not sure). Both optional. Post-session signal instruments H-WTP-Pain and enables discarding trivial sessions from calibration data.
**Alternatives rejected:** (1) Multi-question survey post-session — feels like a form, users skip. (2) Mandatory pre-session — kills momentum for event demos. (3) No post-session signal — can't distinguish meaningful sessions from polite ones.
**Consequences:** P518 revised. Topic depth ladder becomes a facilitator tool. Post-session data feeds H-WTP-Pain analysis.
**References:** P518, `.private/docs/analysis/transcript-analysis-2026-03-18.md`

## 2026-03-18 [technical]: Diarization root cause — segment-level merger discards word timestamps

**Context:** Transcript quality audit found 70-99% of words attributed to one speaker (e.g., Florrie session: Slava 12,302 words, Florrie 27). Whisper hallucinations ("Thank you" x53, "Продолжение следует..." x54). Language misattribution from noise.
**Decision:** Root cause is `merger.py` operating at segment-level (entire 10-60s Whisper segments assigned to one speaker) when word-level timestamps already exist (`word_timestamps=True`) but are discarded. Fix priority: (1) word-level alignment in merger, (2) VAD pre-processing to eliminate hallucinations, (3) hallucination post-filter, (4) round structure as ground truth correction. Also benchmark Deepgram Nova-2 ($0.13/session) as buy-vs-build alternative.
**Alternatives rejected:** Switching to large-v3 model (problems are pipeline architecture, not model accuracy — 2-3x slower for marginal improvement).
**Consequences:** P546 tracks implementation. Transcripts are currently unreliable for automated analysis (P547 AI coach depends on P546 shipping first). Stay with large-v3-turbo.
**References:** P546, `services/transcribe/merger.py`, `services/transcribe/transcriber.py`

## 2026-03-18 [technical]: Embeds render identically to regular views — no special text stripping

**Context:** Blog embeds previously stripped markdown links (`[text](url)` → `text`), removed raw URLs, and hid TagPills to save vertical space. This created two rendering paths (embed vs regular) with subtle divergence — links weren't clickable in embeds, tags were invisible.
**Decision:** Remove all embed-specific text processing. Embeds now use `LinkedText` (clickable links) and show `TagPills` everywhere. Truncation at 750 chars still applies for compact iframes.
**Alternatives rejected:** Keep stripping for "cleaner" embed look — adds maintenance burden for marginal space savings, and clickable links in embeds are valuable for engagement.
**Consequences:** One rendering path for all contexts. Embeds may be slightly taller due to TagPills, but `ResizeObserver` handles iframe height automatically.
**References:** `src/app/components/social/point-card-with-links.tsx`, `src/app/components/social/story-card-with-links.tsx`

## 2026-03-18 [product]: Prod points must pass sifter-point quality gate — audit found 7 of 9 failing

**Context:** Audited all 9 prod points against the sifter-point skill's own criteria (falsifiable, counterfactual, hard-to-vary, stranger test, disagreement filter, mechanism/stance type). Only Points 3 and 4 pass. Issues: Point 7 is a CTA (not a point), Points 8 & 9 are duplicates, Point 5 mixes mechanism with stance, Point 6 is near-redundant with Point 3, Point 2 hedges its claim into unfalsifiability, and 6 of 9 use em dashes (banned). Four points contain marketing hyperlinks (fails stranger test).
**Decision:** Two distinct point types are now explicit: **mechanism** (third-person, impersonal — "The speaker knows what they meant") and **stance** (first-person, personal rule — "I treat every agreement as a test"). These must not be conflated in a single point. Prod insertion requires passing the same quality gate that sifter-point applies during extraction. P544 tracks the cleanup work (blocked by P523).
**Alternatives rejected:** (1) Leave prod points as-is — they're the first thing users see; quality matters. (2) Rewrite now before P523 — P523 may change point schema/versioning; rewrites should land on the new schema.
**Consequences:** Future point creation (whether via sifter or manual) must pass: falsifiable, counterfactual, hard-to-vary, stranger test, no marketing links in statement text. The mechanism/stance distinction should be reflected in definitions.md when P523 lands.
**References:** [sifter-point.md](../.claude/commands/slava/content/sifter-point.md), [sifter-definitions.md](../.claude/commands/slava/content/sifter-definitions.md), [P544](../features/p544_prod_point_quality_audit.md)

## 2026-03-18 [technical]: Remove stale embed expand guards — ResizeObserver already handles iframe height

**Context:** Blog embeds showed "1 point" / "1 story" as clickable labels, but clicking navigated to a new tab instead of expanding inline. The code had `isEmbed` guards with comments saying "iframe can't resize." Meanwhile, a `ResizeObserver` + `postMessage` resize mechanism had been added to both `story-detail-page.tsx` and `point-detail-page.tsx` — and was already working (position dropdown proved it).
**Decision:** Remove all `!isEmbed` guards on expand behavior in `story-card-with-links.tsx` and `point-card-with-links.tsx`. Let the existing resize mechanism handle height changes.
**Alternatives rejected:** (1) Keep navigation-to-new-tab behavior — worse UX, breaks flow for blog readers. (2) Add a separate "embed expand" mode with height limits — overengineering when ResizeObserver already works.
**Consequences:** Points and stories now expand inline in blog embeds. The pattern is established: any new expandable content in embeds should rely on ResizeObserver, not add `isEmbed` guards.
**References:** [story-card-with-links.tsx](../src/app/components/social/story-card-with-links.tsx), [point-card-with-links.tsx](../src/app/components/social/point-card-with-links.tsx)

## 2026-03-18 [technical]: Verify point IDs against position data before embedding

**Context:** Blog article embedded Point `333cf3a3` but user's position was on duplicate Point `76f003ef` (same statement text, different IDs). Embed showed no position.
**Decision:** Swapped embed to correct ID. Before embedding any point, verify the ID has actual position data via `point_positions` query.
**Alternatives rejected:** Deleting duplicate now (deferred to `/abandoned-points` sweep).
**Consequences:** Duplicate points exist in prod. Use `/maintain:abandoned-points` periodically.
**References:** `content/articles/a6_two-skills-next-generation-founders.md`

## 2026-03-18 [product]: Story embeds show author's position on linked points (extend embed-position pattern)

**Context:** Story embeds on Ghost blog and Videoask showed linked points as generic cards — no author name, no position badge. The `?from=userId` mechanism (decision 2026-03-17) solved point embeds, but story embeds had two separate gaps: (1) `embedPoints[].positions` was hardcoded to `{}`, stripping the author's position data; (2) linked points were hidden in embed mode (`!isEmbed` guard on the expand section).
**Decision:** Three changes: (1) `story-detail-page.tsx` populates `embedPoints` with the story author's position from `storyAuthorPositions` state; (2) `story-card-with-links.tsx` auto-expands linked points in embed mode; (3) points toggle in embed mode collapses/expands instead of navigating away. This means a single story embed is self-contained — shows the story text AND the author's stance on linked points via the QuotedPoint quote pattern (name + position badge above quoted box).
**Alternatives rejected:** Requiring users to embed story + point as separate iframes (fragile, position context lost); adding a new "story+position" embed type (overengineered).
**Consequences:** Story embeds are now richer — suitable for blog posts and feedback forms where the author's stance is the point. Embed height auto-adjusts via existing ResizeObserver. The embed resize script in the iframe snippet handles the taller content automatically.
**References:** `src/app/pages/story-detail-page.tsx`, `src/app/components/social/story-card-with-links.tsx`, branch `feature/embed-position-context`

## 2026-03-17 [product]: ThreadLine is the universal "belongs to" visual pattern — use for ALL expanded children, including single items

**Context:** P542 introduced ThreadLine for stories expanded from point page positions. Audit found `PointCardWithLinks` and `LiveStoryCardExpanded` had `if (items.length === 1)` branches skipping ThreadLine for single items. On mobile, single expanded items looked indistinguishable from the next card.
**Decision:** ThreadLine wraps ALL expanded children, regardless of count. Removed all `length === 1` special-case branches. The connecting line communicates "belongs to the thing above" — needed even with one child.
**Alternatives rejected:** ThreadLine only for 2+ items (lost hierarchy for singles); indentation without lines (ambiguous).
**Consequences:** Any future expand-to-show-children pattern should use ThreadLineGroup/ThreadLineItem. The `length === 1` bypass is a known anti-pattern.
**References:** `point-card-with-links.tsx`, `live-story-card-expanded.tsx`, `profile-page-v2.tsx`

## 2026-03-17 [product]: Position list stories collapse behind chevron with accordion (P542)

**Context:** P411's inline story cards on point page position list created "double duty" — name row was both position entry and story header. In long lists, position badges detached from the point they referred to.
**Decision:** Stories collapse behind blue `> story` chevron. Accordion (one at a time). ThreadLine when expanded. Avatar+name repeated in card header. Viewer's "Add your story" CTA replaces chevron when no story.
**Alternatives rejected:** Indent group (confuses list), card-wrap (heavy), always-visible inline (the problem).
**Consequences:** Position list scannable regardless of story count. Profile pages unchanged. `showQuotePattern` superseded for `context="point-detail"`.
**References:** `features/done/23_mar_26/p542_point_page_story_collapse.md`, P411, P103

## 2026-03-17 [process]: Pick-flow must include /challenge-prd for redesigns and enforce /ux drop rule strictly

**Context:** `/pick-flow` for P542 missed `/challenge-prd` and recommended dropping `/ux` despite net-new interaction pattern. Drop-/ux rule requires ALL three conditions but hard rule was too permissive.
**Decision:** Three fixes: (1) redesign template includes `/challenge-prd`; (2) `/ux` rule rewritten for explicit ALL-three check; (3) `/challenge-prd` rule includes redesigns.
**Alternatives rejected:** Relying on user to catch missed steps (fragile).
**Consequences:** Pick-flow stricter for redesigns. "ASCII covers happy path" ≠ UX resolved.
**References:** `.claude/commands/slava/build/pick-flow/SKILL.md`

## 2026-03-17 [product]: Point embed includes sharer's position via `?from=userId`

**Context:** When sharing a point from your profile, the embed showed a neutral point with no position selected. But you're sharing *your position*, not just the point.
**Decision:** `ShareButton` accepts `fromUserId` prop. When on a profile page, `PointCardWithLinks` passes `profileOwner.id`. Embed URL becomes `?embed=true&from={userId}`. The existing `point-detail-page.tsx` embed mode already reads `?from` and shows that user's position + linked stories.
**Alternatives rejected:** Screenshot of position (static, doesn't let reader interact); separate "position card" component (overengineered for one param addition).
**Consequences:** Any shared embed from a profile context now shows the sharer's stance. Blog embeds can include `?from=` to show the author's position.
**References:** `src/app/components/shared/ShareDialog.tsx`, `src/app/pages/point-detail-page.tsx:302-330`

## 2026-03-17 [process]: Image redaction uses Vision OCR substring bounding boxes (v3)

**Context:** Needed to redact email addresses from a Gmail screenshot for blog use. Three approaches tried: (1) pixel coordinate guessing with CoreGraphics — wrong every time, 5+ iterations; (2) Vision OCR line-level bounding boxes — still guessing which portion of a line to cover; (3) `VNRecognizedText.boundingBox(for: Range<String.Index>)` — exact pixel coordinates for any substring within a recognized line.
**Decision:** v3 — single Swift script, pass text patterns as CLI args, Vision finds exact bounding boxes per substring, draws redaction rectangles. Single pass, no iteration.
**Alternatives rejected:** v1 coordinate guessing (fundamentally broken — agent can't know pixel positions); v2 line-level OCR (still guessing within lines); installing ImageMagick/PIL (unnecessary dependency when native API exists).
**Consequences:** `/redact-image` skill v3 is reusable for any screenshot. Key lesson: when a tool-based approach fails twice with the same symptom, research the API instead of improvising.
**References:** `.claude/commands/slava/content/redact-image.md`

## 2026-03-17 [process]: draft-blog uses Nano Banana Pro instead of Unsplash

**Context:** Blog feature images were sourced from Unsplash (stock photos, requires attribution). AI-generated images are unique, on-brand, and attribution-free.
**Decision:** `/draft-blog` now uses Gemini native image gen (`gemini-3-pro-image-preview`) with 16:9 aspect ratio for blog headers. Fallback chain: Gemini → Imagen 4 → skip. Also added iframe embed support (Ghost `html` card nodes) and `content/articles/` search path.
**Alternatives rejected:** Keep Unsplash (generic, attribution overhead); DALL-E (separate API key, not on GCP credits).
**Consequences:** Feature images are generated per-article. No Unsplash key needed. Embeds of ClarityPledge points/stories work in Ghost posts.
**References:** `.claude/commands/slava/content/draft-blog.md`, `.claude/commands/slava/content/gen-image.md`

## 2026-03-17 [technical]: CTA color is bg-blue-500, not bg-primary

**Context:** 404 page used `bg-primary text-primary-foreground` for buttons. In the design system, `--primary` resolves to near-black (`240 5.9% 10%`), which looked generic. The actual CTA pattern (nav bar "Start a Clarity Session") uses `bg-blue-500 hover:bg-blue-600 text-white`.
**Decision:** All page-level CTAs and action links use `bg-blue-500`/`text-blue-500` (blue-500 family), not `bg-primary`. `bg-primary` is reserved for form elements and shadcn components.
**Alternatives rejected:** Updating `--primary` CSS variable to blue (would break shadcn defaults globally).
**Consequences:** When adding new standalone pages, use `text-blue-500` for links and `bg-blue-500` for filled buttons. Check `simple-navigation.tsx` for the canonical CTA pattern.

## 2026-03-17 [technical]: 404 catch-all route with animated variants

**Context:** Any misspelled URL (e.g., `/agreement-template` instead of `/partner-template`) rendered a blank white page — React Router's `No routes matched` warning appeared only in console. Zero user feedback.
**Decision:** Add `<Route path="*">` as last route in App.tsx, rendering a 404 page inside `ClarityLandingLayout`. Three CSS-only animation variants built at `/tree/404-*` for comparison. Production default: "Drift" (floating ghost 404 letters). Alternatives kept as prototypes.
**Alternatives rejected:** Redirect-to-home (loses the "you made a typo" signal). Static text only (missed opportunity for personality).
**Consequences:** All unknown URLs now show a friendly 404 with nav + footer. Variants live at `/tree/404-drift`, `/tree/404-glitch`, `/tree/404-compass` for future A/B or redesign.
**References:** [not-found-page.tsx](src/app/pages/not-found-page.tsx)

## 2026-03-17 [product]: Zero-position points hidden from listings ("graveyard")

**Context:** Points with zero positions (all positions withdrawn or abandoned after creation) polluted the feed, profile, and live session picker with content nobody engaged with.
**Decision:** Filter zero-position points at query level — hidden from all listing surfaces (feed, profile, live picker) but still accessible via direct URL and story-linked quotes. No DB schema change; no `is_archived` column. Points are kept in the database for reference.
**Alternatives rejected:** (A) DB status column (`active`/`archived`) — schema migration + new concept to maintain for a problem solvable with a WHERE clause. (B) Feed + profile only (keep live picker unfiltered) — abandoned points have no social proof, no value as session content.
**Consequences:** Any future listing surface must use the filtered service methods (`getPublicPointsFeed`, `getPointsForProfileDisplay`). Direct access (`getPoint`, `getPointWithCounts`) deliberately bypasses the filter. The P523 standalone creation flow has a transient zero-position window — this is expected and correct.
**References:** [features/done/23_mar_26/p543_hide_zero_position_points.md](../features/done/23_mar_26/p543_hide_zero_position_points.md)

## 2026-03-17 [technical]: Feed position changes use optimistic UI, not refetch

**Context:** The feed page previously disabled `onPositionChange` callback entirely (commit 840250d4) to avoid flash-reload. P543 made this a correctness bug — without a callback, removed positions never triggered the graveyard filter.
**Decision:** Surgical optimistic updates: position removal → parent `setPoints` either removes card (if last position) or decrements count. Position setting → card's local state (`localPosition` + `adjustPositionCounts`) handles the visual update. No full `fetchData()` call on position change.
**Alternatives rejected:** (A) Re-enable `fetchData` as callback — works but causes visible flash/reload of entire feed. (B) SWR/React Query cache invalidation — over-engineering for a single mutation path.
**Consequences:** Position counts on feed cards can drift from server truth between page loads. This is acceptable — counts are approximate social signals, not financial data. Next page load resyncs from DB.
**References:** `src/app/pages/feed-page.tsx`, `src/app/components/feed/feed-point-card.tsx`

## 2026-03-17 [product]: Transcript corpus analysis — Protocol Anthropologist + Blindspot Hunter design

**Context:** 34 past sessions batch-transcribed. Need to extract product insights from the corpus — but running everything through a hypothesis lens risks confirmation bias (only seeing what you expect).
**Decision:** Three-agent pipeline: (1) Protocol Anthropologist — tests transcripts against `hypotheses.md` + `lean-canvas.md`, (2) Blindspot Hunter — reads same transcripts with NO hypothesis access, finds surprises, (3) Synthesis — merges both + generates per-pair FCO recommendations. Single output mode (not PM vs FCO split — same person). Mixpanel events available on-demand as enrichment tool, not always loaded. Pair linkage via `creator_profile_id + joiner_profile_id` (no formal pairs table needed yet).
**Alternatives rejected:** (A) Single-agent analysis — confirmation bias, sees only what hypotheses predict. (B) Two output modes (PM + FCO) — same person, same output. (C) Skip Mixpanel entirely — easy to pull, enriches timing questions. (D) Formal pairs table — overkill, profile ID combination query is sufficient.
**Consequences:** Skill at `.claude/commands/slava/maintain/analyze-transcripts.md`. Run monthly or after batch transcription. Output to `.private/docs/analysis/` (PII in transcripts — never committed). The Blindspot Hunter's independence is the key design constraint — it must never see hypotheses.md.
**References:** `.claude/commands/slava/maintain/analyze-transcripts.md`, `docs/hypotheses.md`

## 2026-03-17 [technical]: Transcription pipeline robustness — detect at backend, defer prevention to frontend

**Context:** Batch transcription of 34 sessions: 1 failed (VD8SNS) due to 5-byte corrupt `chunk_000.webm`. /falsify analysis identified 8 failure modes, triaged via critique + falsification agents.
**Decision:** Apply 3 backend detection fixes now (skip recorder with corrupt chunk_000 < 1KB, try/except on events.json parse, log chunk gap warnings). Defer frontend upload reliability (retry logic + chunk manifest) — it's the true root cause but requires multi-file feature work for a 3% failure rate. GPU quota increase requested (1→5 L4 instances in us-east4) for event parallelism.
**Alternatives rejected:** (A) Comprehensive validation at every boundary — /falsify proved 7 of 8 items are detection (post-hoc), not prevention. Only upload reliability (#8) addresses the root cause, and it needs both frontend retry + backend manifest. (B) Skip corrupt chunks instead of skipping the recorder — fails because chunk_000 carries WebM headers; subsequent chunks are headerless continuation bytes. (C) Fix all 8 failure modes now — 5 are non-issues (name collision near-zero probability, chunk_000 race impossible with 30x timing margin, audio-too-short handled by Whisper, missing recorder already graceful).
**Consequences:** Pipeline handles corrupt uploads gracefully (skips recorder, processes the other). VD8SNS retry succeeded. Future: if failure rate exceeds ~5%, file a spec for frontend upload reliability (retry queue + manifest).
**References:** `services/transcribe/audio.py`, GCP quota case #705d0068a

## 2026-03-17 [technical]: Replace react-markdown with marked — eliminate recurring Vite 504 "Outdated Optimize Dep"

**Context:** 4 Vite 504 incidents in 5 weeks despite 4 layers of workarounds (optimizeDeps.include, holdUntilCrawlEnd, per-worktree cache isolation, postinstall cache nuke). Root cause: `optimizeDeps.include` is a hint, not a guarantee — lazy-loaded routes with deep ESM-only dep trees trigger mid-session re-optimization. `react-markdown` v10 (ESM-only) pulled 40+ transitive deps via unified/remark/rehype. The `postinstall` script (`rm -rf node_modules/.vite*`) nuked the cache on every `npm install`, ensuring cold starts.
**Decision:** Replace `react-markdown` + `rehype-katex` + `remark-math` with `marked` (CJS, zero transitive deps) + `katex` (direct). Created `src/lib/markdown.ts` with 3 isolated `Marked` instances: `safeMd` (user content — strips HTML, validates link protocols), `trustedMd` (committed content like ToS), `articleMd` (manifesto — KaTeX, heading IDs, paragraph anchors, CTA injection markers). Removed `rm -rf node_modules/.vite*` from `postinstall` (Vite's cache hash auto-invalidates when deps change — the nuke was redundant and actively harmful).
**Alternatives rejected:** (A) Remove deps from optimizeDeps.include (makes problem worse — falsification proved it), (B) Build-time Vite plugin (custom plugin maintenance across Vite versions), (C) Switch bundler entirely (absurd cost for a dev-only issue), plus 20 creative proposals tested via /falsify — all either failed falsification or scored lower than marked.
**Consequences:** 98 packages removed from node_modules, 3 added. The structural condition for the 504 (deep ESM tree + lazy routes + cache nuke) no longer exists. `marked` is CJS with zero deps — Vite pre-bundles it in <10ms. Key learnings: (1) `marked` v17 custom renderers receive raw markdown in `text`, must use `this.parser.parseInline(tokens)` for rendered HTML, (2) `marked.use()` mutates global singleton — must use `new Marked()` for isolation, (3) `sanitizeHref()` needed for user-generated content (javascript:/data: URI XSS).
**References:** `src/lib/markdown.ts`, `vite.config.ts` (optimizeDeps), `package.json` (postinstall)

## 2026-03-17 [product]: Transcript nudge guard — only on explicit session end

**Context:** The transcript nudge ("Transcribing your session...") showed on `PartnerLeftScreen` for all cases. But `PartnerLeftScreen` renders in two scenarios: (1) creator clicks "End Session" (`sessionEnded=true`) — session is truly over, (2) partner leaves/disconnects (`sessionEnded=false`) — partner might rejoin via P511 grace period. Showing "Transcribing..." in case 2 is premature — the session isn't necessarily over.
**Decision:** Guard the transcript nudge on `sessionEnded === true`. When a partner just leaves, only "Start New Session" shows. Transcription is only triggered by the person who exits (line 2401 of clarity-live-page), and the grace period allows rejoin, so the nudge should wait for a definitive end.
**Alternatives rejected:** Always showing the nudge — misleading when session might resume. Showing a conditional message ("Your partner left, but the session is still open") — adds complexity for a rare edge case.
**Consequences:** Clean separation: explicit end = transcript + history nudge. Partner left = just the button. Consistent with P511 grace period semantics.

## 2026-03-17 [product]: Drop "by {name}" from all card footer labels — context already in header

**Context:** Point card footers showed "N stories by {name}" and story card footers showed "N points by {name}". On mobile with long names (e.g. "Vyacheslav Ladischenski"), the label consumed most of the row width, pushing share/open icons to wrap. User flagged via screenshot: "is this the best we can do?"
**Decision:** Remove "by {name}" suffix everywhere — label is now just "N stories" / "N points". The author is already shown in the card header above (avatar + name + position badge). Live session mode already used this pattern ("N stories" without attribution), making this consistent. Found in 4 surfaces: `point-card-with-links.tsx` (2 footer variants), `story-card-with-links.tsx`, `live-story-card-expanded.tsx`, and `profile-page-v2.tsx` (inline story card rendering that bypasses the shared component — caught only after user reported the fix didn't work).
**Alternatives rejected:** (1) Conditional — drop "by {name}" on own profile only, keep on others. Creates two code paths for the same label, every new surface needs "which variant?" decision. (2) Move icons to separate row — bigger DOM change, more visual complexity, solves spacing but not redundancy. (3) First name only — still redundant with header, still needs conditional logic for own vs others.
**Consequences:** All card footer labels are now short and consistent across own profile, other profiles, feed, live session, and embed. The `profile-page-v2.tsx` inline story card rendering is a known duplication surface — any future footer label changes need to check both the shared component AND the profile page inline version.
**References:** `src/app/components/social/point-card-with-links.tsx`, `src/app/components/social/story-card-with-links.tsx`, `src/app/components/social/StoryCardDetail.tsx:304`, `src/app/components/partners/live-story-card-expanded.tsx`, `src/app/pages/profile-page-v2.tsx:1210`

## 2026-03-17 [product]: Agreement export certificate — remove QR, metadata, use navy seal

**Context:** P538 agreement download/share feature added a PNG export of the agreement certificate. Initial design included a QR code next to the partner signature, an "Active since" date, agreement ID (A-NNNN), and a claritypledge.com footer. Screenshot review revealed: (1) QR cramped the signature area, (2) gold seal color didn't match brand navy, (3) metadata was noise on a clean certificate.
**Decision:** Remove QR code entirely — digital exports are shared via messaging where the link is already in the share text (you can't scan a QR on the screen you're viewing). Remove "Active since", displayId, and claritypledge.com footer. Change seal from gold (#D4AF37) to brand navy (#002B5C).
**Alternatives rejected:** (1) Move QR below signatures (still redundant for digital-only use). (2) Keep metadata in smaller font (still noise — the agreement page has this info already).
**Consequences:** Export certificate is signatures + seal only. If physical printing becomes a use case, QR can be re-added behind a print-mode flag.
**References:** `src/app/components/agreements/export-agreement-certificate.tsx`

## 2026-03-17 [product]: Guest post-session CTA — single-line value prop over card

**Context:** After a /live session ends, anonymous guests saw a bordered card titled "Keep your session insights" with a paragraph listing 3 benefits (save positions, track calibration, join as host). Screenshot review flagged it as overengineered for the context — too many words, unnecessary card wrapper.
**Decision:** Replace the card with a single centered line: "Access your transcript and AI session insights" + the same Create Free Account button and login link. No card border, no paragraph, no multi-benefit copy. The button label already says what it does.
**Alternatives rejected:** (1) Keep card but shorten copy — still unnecessary visual weight for a post-session nudge. (2) Remove CTA entirely — loses the signup conversion opportunity.
**Consequences:** Cleaner post-session experience. Copy now promises transcript + AI insights — these features should exist when guests sign up (or the copy is misleading).
**References:** `src/app/components/partners/live-mode-view.tsx`

## 2026-03-17 [process]: Playwright port detection must mirror Vite worktree patterns

**Context:** `playwright.config.ts` only recognized legacy `claritypledge-N` worktree naming. `vite.config.ts` had 3 patterns (wN, claritypledge-N, named worktrees). Running E2E tests from `.claude/worktrees/w2` caused Playwright to fall back to port 5173 (Vite default), spawning a ghost dev server on the wrong port. Discovered via `/screenshot-debug` when `localhost:5173` showed a 404 — the real app runs on 5001.
**Decision:** Synced `getWorktreePort()` in `playwright.config.ts` to match all 3 patterns from `vite.config.ts`. Added `PORT LOGIC: Must stay in sync with...` cross-reference comments in both files. Removed 5173 fallback — unknown directories now default to 5001 (main repo port).
**Alternatives rejected:** (1) Shared utility module — over-engineering for 2 consumers with a function that changes ~yearly; cross-reference comments are sufficient. (2) Fix Playwright only without cross-reference — same divergence would recur on the next pattern addition.
**Consequences:** Any future worktree pattern addition must update both files. Comments make this visible at edit time.
**References:** `playwright.config.ts`, `vite.config.ts`

## 2026-03-17 [process]: KDD decisions without follow-up tasks — systematic gap

**Context:** Screenshot debug session surfaced a calibration zero-state bug with a prior decision (2026-03-16) to make `/ux` build `/tree` preview pages. That decision was "Status: proposed" but never filed as a task. Investigation found 6-7 other orphaned decisions with the same pattern.
**Decision:** Add a follow-up scan step to `/kdd` (Step 4.5) that detects actionable language in new decision Consequences and prompts spec creation. Filed as P541.
**Alternatives rejected:** (1) Relying on `/day`/`/weekly` — already exist, missed 6-7 decisions. (2) Auto-creating specs — too aggressive for conditional items.
**Consequences:** Every decision with follow-up work surfaced immediately. Existing orphans triaged in next `/weekly`.
**References:** P541 (`features/p541_kdd_decision_followup_tracking.md`)

## 2026-03-17 [technical]: Embed iframe resize must include portal dropdown height

**Context:** P521 portal dropdown fix (2026-03-16) worked in regular views but broke in Ghost blog embeds — the intensity dropdown was clipped at the iframe boundary. Root cause: `createPortal(dropdown, document.body)` escapes `overflow:hidden` containers but NOT iframe boundaries. The embed wrapper's `ResizeObserver` measured only `el.scrollHeight` of the wrapper div — the portal dropdown lives on `document.body` outside the wrapper's DOM tree, so its height was never reported to the parent iframe.
**Decision:** Add `MutationObserver` on `document.body` (childList only) to detect portal additions/removals. In `reportHeight`, query `document.querySelector('[role="listbox"]')` and include its `getBoundingClientRect().bottom + window.scrollY` in the max height calculation. Applied to both `point-detail-page.tsx` and `story-detail-page.tsx` embed wrappers.
**Alternatives rejected:** (1) Render dropdown inline (not portal) in embed mode — reverts the overflow:hidden clipping P521 fixed. (2) Increase iframe height to 450px — wastes space, defeats auto-resize. (3) Flip dropdown upward — complex positioning logic for marginal UX gain.
**Consequences:** Embed iframes auto-expand when dropdown opens and shrink when it closes. Pattern applies to any future portal elements in embeds — the `[role="listbox"]` selector is specific to the intensity dropdown; new portals need their own selector or a generic approach.
**References:** `src/app/pages/point-detail-page.tsx`, `src/app/pages/story-detail-page.tsx`, P521 decision below

## 2026-03-17 [technical]: Vite optimizeDeps.include — eliminate recurring 504 "Outdated Optimize Dep"

**Context:** "Module load failed" errors on `/live` started occurring regularly. The March 13 fix (`cacheDir` per worktree) solved multi-worktree cache corruption, but a single long-running dev server still hit 504s when Vite lazily discovered new deps mid-session and re-optimized, invalidating all previously served bundles. Research confirmed 3 commits (Mar 13-14) addressing the same root family, plus Vite upstream issues (#14284, #13506).
**Decision:** Three layered fixes: (1) `optimizeDeps.include` listing all 36 project deps — prevents lazy discovery entirely (canonical fix per Vite docs). (2) `holdUntilCrawlEnd: false` — Vite 6 option, serves deps immediately and re-optimizes incrementally for any unlisted dep. (3) `postinstall` clears `node_modules/.vite*` — prevents stale cache after dependency upgrades. Docker was considered and rejected — the 504 is internal to a single Vite process, not an environment isolation problem.
**Alternatives rejected:** (1) Docker — solves environment isolation, not Vite's internal dep optimization lifecycle. (2) `server.force: true` — forces full re-optimization on every server start, slower and doesn't prevent mid-session invalidation. (3) Status quo + manual `rm -rf .vite` — treats symptoms, not cause.
**Consequences:** Dev server should no longer produce 504 errors during normal development. The `include` list must be updated when new heavy dependencies are added (low maintenance — happens rarely).
**References:** `vite.config.ts`, [vitejs/vite#14284](https://github.com/vitejs/vite/issues/14284)

## 2026-03-17 [process]: Pre-commit hook hardening — scoped ESLint, stable symlink, branch guard

**Context:** KDD commit blocked 4 times by pre-existing ESLint errors in e2e files. Root cause analysis (via /falsify) found: (1) pre-commit runs `eslint .` (whole repo) instead of staged files, (2) hook symlink pointed to worktree w2's copy (fragile), (3) main worktree drifted to a feature branch with no return mechanism, (4) ESLint config lacked `.spec.ts` override for e2e files.
**Decision:** Four mechanical fixes: (1) Scope ESLint to staged `.ts/.tsx` files only in pre-commit. (2) Hook symlink always derives from `git-common-dir` (main repo). (3) Add `e2e/**/*.ts` override to ESLint config. (4) Add branch guard to `/ship` — ensures main worktree returns to `main` after merge.
**Alternatives rejected:** (1) "Worktree-only" policy (remove branch exception) — falsification showed removing doc text has no enforcement. The exception is useful; the gap was in `/ship`. (2) Downgrade all e2e `no-unused-vars` to `warn` — masks genuine unused imports. Instead, added `.spec.ts` to existing test override pattern.
**Consequences:** Doc-only commits no longer blocked by unrelated lint errors. Hook survives worktree deletion. Main worktree returns to `main` after shipping.

## 2026-03-17 [process]: Client lifecycle reference doc — centralizes all client-facing links and templates

**Context:** During a session, the wrong Tally form was used (booking form instead of feedback form). Three Tally forms, VideoAsk, WhatsApp templates, and a new referral page exist but were undocumented.
**Decision:** Created `.private/docs/client-lifecycle.md` as single reference. Private because it contains contact details. Added client/sales trigger to KDD privacy gate.
**Alternatives rejected:** (1) Documenting in CLAUDE.md — too much detail, private info. (2) Keeping scattered — caused wrong-link mistake.
**Consequences:** All client-related skills should reference this doc. New `client/` skill namespace proposed.
**References:** `.private/docs/client-lifecycle.md`

## 2026-03-17 [product]: Pay-what-it's-worth referral model — post-testimonial conversion flow

**Context:** Needed a referral mechanism that feels like a gift, not a marketing ask.
**Decision:** After testimonial (Tally + VideoAsk), client lands on `ladischenski.com/thank-you` offering to gift up to 3 friends a risk-free clarity session within 7 days. WhatsApp share pre-fills intro. Model: meaningful deposit upfront, return any amount after based on value felt.
**Alternatives rejected:** (1) Direct booking link — too transactional. (2) Email share — WhatsApp more personal.
**Consequences:** Static framing (3 friends, 7 days — not enforced technically).

## 2026-03-17 [product]: Video testimonial via VideoAsk — 3-question guided flow

**Context:** Needed video testimonials. Researched 5 platforms; VideoAsk chosen for guided format. Free: 20 min/month.
**Decision:** 3 questions: (1) biggest challenge before, (2) one example of how work helped, (3) what to say to someone hesitant. Embedded in Tally feedback form. Service-agnostic (no label — client describes in own words).
**Alternatives rejected:** (1) Shosay — less polished. (2) 2 questions — loses peer recommendation. (3) Generic "would you recommend" — non-answers.

## 2026-03-17 [product]: Session-end screen nudges toward transcript and session history

**Context:** Session history (`/sessions`) was discoverable only through the hamburger menu — 2 clicks away, no hint it exists. After a session ends, authenticated users saw only a "Start New Session" button (dead end). Transcripts are processed async, so users had no indication their session was being saved or where to find it.
**Decision:** (1) Session-end screen shows "Transcribing your session..." with spinner + link to Session History for authenticated users. (2) Session history page promotes TranscriptRow above rounds (was buried at the bottom). (3) Consistent copy across both surfaces: "Transcribing your session..." instead of "Transcript processing...". Guests still see signup CTA (unchanged).
**Alternatives rejected:** Deep-linking to `/sessions/{id}` — transcript isn't ready immediately, so the specific session page would show a processing state that feels broken. Toast notification — adds a new UI pattern and disappears quickly, easy to miss. The end screen is the natural high-attention moment.
**Consequences:** Session history becomes discoverable at the moment users are most likely to want it. The pattern can extend to other post-session surfaces if needed.

## 2026-03-16 [technical]: P511 session resilience — implementation learnings (banner, polling, heartbeat)

**Context:** P511 shipped session resilience (grace period, rejoin, banner). Implementation revealed three gotchas not in the original architecture.
**Decision:** (1) **Banner must render inside `<main>`, not between nav and main.** The nav is `fixed z-50`. A banner between nav and main at any z-index either fights the nav (z-50 = overlaps avatar) or loses to page content (z-40 = profile images cover it). Inside `<main>` with `relative z-40` it's structurally below nav, above content. (2) **`useActiveSession` polling must use `getActiveSessionByCode` (not `getClaritySession`).** Session "ended" state lives in `live_state.sessionEnded` JSONB field — there is no `ended_at` column. `getClaritySession` doesn't check this; `getActiveSessionByCode` does. (3) **Creator-only heartbeats (Decision 5b).** Anonymous joiners can't call `update_last_activity` RPC (no `auth.uid()`). Creator's heartbeat keeps session alive for both participants. If creator disconnects, grace period starts for joiner — acceptable trade-off.
**Alternatives rejected:** (1) Banner as `sticky` between nav and main — z-index conflict with fixed nav regardless of value chosen. (2) Both parties heartbeat — requires a second auth path for anonymous joiners (session token). Deferred complexity.
**Consequences:** All future global banners (offline, install, session) must render inside `<main>` to avoid z-index fights with fixed nav. The `getActiveSessionByCode` function is the correct API for any code that needs to know if a session is "still active."
**References:** `features/done/23_mar_26/p511_session_resilience.md`

## 2026-03-16 [process]: Two-party test fixture built — P497 MVP after 3 sessions of deferral

**Context:** P497 (multi-user test fixtures) was filed 2026-03-12 as a dependency of P496 (done). It sat in backlog while P504, P509, P510, P511 shipped — each hitting the same wall: "can't verify /live session state via automation." P511 was the third session where the agent proposed a workaround instead of fixing the root cause. The user broke the cycle by asking "how do we make sure this doesn't happen again?"
**Decision:** Built `createTwoPartySession()` in `e2e/helpers/test-session.ts` — composes existing helpers (P496 `getTestAuthContext`, P276 `mockMicPermission` + `waitForDBPresence`, `supabaseAdmin` direct insert). Also `createTestSessionInDB()` for DB-only scenarios. Built inline on the P511 branch, not as a separate spec — the lean path for glue code that composes existing pieces.
**Alternatives rejected:** (1) Full P497 Playwright fixture (`test.use({ users: 'host+guest' })`) — nice but over-engineered for current needs. (2) Filing a separate spec — would sit in backlog again. (3) Continuing to work around it with manual verification — the pattern that failed 3 times.
**Consequences:** Every future `/live` E2E test can import `createTwoPartySession()`. The full P497 fixture (with Playwright `test.extend`) is a follow-up if the helper is used in 5+ test files. Process learning: when the same infrastructure gap blocks 3+ features, build it inline on the current feature — don't file it separately.
**References:** `e2e/helpers/test-session.ts`, `features/p497_e2e_multi_user_fixtures.md` (still in backlog for full fixture)

## 2026-03-16 [technical]: P537 useAuth memoization — useCallback + useMemo on context providers, but data-status wrapper still needed

**Context:** /falsify surfaced that `useAuth()` returned unstable references for `refreshProfile` and `signOut` (new function on every render). This caused AuthCallbackPage's `useEffect` to re-fire `processAuth()` when unrelated child re-renders occurred (root cause of the double-upsert bug found during ClarityLoader work).
**Decision:** (1) Wrap `refreshProfile` in `useCallback([userId, fetchProfileForUser])`, `signOut` in `useCallback([])`, and the context value in `useMemo`. (2) The `data-status={status}` wrapper in AuthCallbackPage is **still required** even after memoization — removing it causes 2 auth tests to fail. Root cause: React's render-skip optimization when `status` isn't consumed in JSX is a separate issue from unstable refs. Both fixes are needed.
**Alternatives rejected:** (1) Remove data-status wrapper after memoization — tested, fails (2/9 auth tests break). (2) Restructure AuthCallbackPage's useEffect to not depend on render timing — correct but high-risk refactor of critical auth code.
**Consequences:** Pattern for all context providers: always wrap function values in useCallback and the value object in useMemo. The data-status wrapper is documented with a comment explaining why it's load-bearing.

## 2026-03-16 [process]: Remove `.expected-branch` hook — worktrees are the concurrency mechanism

**Context:** P495 shipping session: multiple concurrent Claude sessions fought over the repo — overwriting `.expected-branch`, causing HEAD lock errors, requiring emergency `git stash` and worktree w8 creation. `/falsify` confirmed the hook is a single-writer design used in a multi-writer environment (no session ID, no session-end lifecycle in Claude Code hooks). The hook only works for single-session scenarios, where worktrees already provide isolation.
**Decision:** Deleted `branch-assert.sh`, the SessionStart hook that wrote `.expected-branch`, and the PreToolUse entry that checked it. Worktrees (`.claude/worktrees/w1`, `w2`, etc.) are the sole concurrency mechanism. Advisory `git status --short` check before `/dev` remains in CLAUDE.md.
**Alternatives rejected:** (1) Per-worktree `.expected-branch-{slot}` files — adds complexity for a mechanism that worktrees make redundant. (2) Automated session-detection gate — impossible with current Claude Code hook primitives (no inter-session IPC, no session ID exposed to hooks). (3) Keep the hook — accepts recurring friction for zero safety benefit under concurrency.
**Consequences:** No branch-drift protection for sessions that skip worktrees. Acceptable: worktree-first is already policy, and the hook was already broken in the multi-session case. If Claude Code adds session-aware hooks in the future, revisit.
**References:** `.claude/settings.json`, `docs/technical/worktree-setup.md`

---

## 2026-03-16 [technical]: JSONB merge is the default write path — full overwrite only for story fields and explicit clears

**Context:** Celebration deadlock on prod: both users clicked Continue on a 10/10 round (free conversation, no story selected), both got stuck at "Waiting for partner to continue..." indefinitely. P525's per-role boolean fix (Mar 16) prevented array-level races but didn't fix the DB write routing. The P399 routing condition `(touchesStory || !storyIsActive || hasExplicitClears)` sent ALL writes through full overwrite when no story was active. Two simultaneous full overwrites = last-writer-wins = partner's celebration boolean erased. The reactive `useEffect` safety net couldn't recover because the DB never held both booleans as `true` simultaneously.
**Decision:** Removed `!storyIsActive` from the routing condition. Extracted `shouldUseFullOverwrite()` as a testable pure function. New condition: `(touchesStory || hasExplicitClears)`. JSONB merge (`patch_live_state`) is now the default for all writes that don't touch story fields and don't clear fields. This aligns the code with P399's original stated intent ("partial merge when updates don't include story/content fields").
**Alternatives rejected:** (1) Force-using patch path only for celebration writes — treats symptom, leaves rating writes and phase changes vulnerable to the same race. (2) Adding a server-side trigger to detect both booleans — adds DB complexity for a client-side routing bug.
**Consequences:** Any `updateLiveState` call that doesn't include story keys or `undefined` values now uses atomic JSONB merge. This is strictly safer for concurrent writes. Full overwrite still fires for round resets (which include `undefined` for clearing fields) and story selection. The `storyIsActive` variable is removed from the routing path entirely — `stateBeforeUpdate` is passed to `shouldUseFullOverwrite()` for documentation but not used.
**References:** P399 (original JSONB merge), P525 (per-role booleans), `src/app/pages/clarity-live-page.tsx:shouldUseFullOverwrite()`

---

## 2026-03-16 [process]: /ux should prototype experiential forks before spec lock-in

**Context:** P521 ran the full pipeline for Option D (row replacement). User rejected D during prototype testing, chose Option A (auto-dropdown). Spec, UX, tests all rewritten. Root cause via /falsify: /challenge-prd treats all decisions as analytically resolvable, but interaction-pattern choices can only be evaluated by experiencing them.
**Decision:** Strengthen `/ux` to detect "experiential forks" — when 2+ viable interaction patterns exist, `/ux` builds throwaway interactive comparisons in `/tree` before proceeding. No new pipeline stage.
**Alternatives rejected:** (B) Prototype gate in /pick-flow — pipeline complexity. (C) Do nothing — P521 proved hours of rework.
**Consequences:** `/ux` skill update needed. Status: proposed — implement via `/claude-md` gate.

## 2026-03-16 [technical]: P495 Cloud Run GPU transcription pipeline — deployment pattern and gotchas

**Context:** P495 adds automatic transcription of /live sessions using Whisper + pyannote diarization on Cloud Run with L4 GPU. Deployed to us-east4 (only region with GPU quota granted). Multiple dependency compatibility issues discovered during GPU builds.
**Decision:** (1) Pin ML dependencies strictly: `torch>=2.1.0,<2.6.0` (pyannote JIT breaks on 2.6+), `numpy>=1.24.0,<2.0.0` (np.NaN removed in 2.0), `huggingface_hub>=0.20.0,<0.24.0` (use_auth_token removed in 0.24). (2) Cloud Scheduler polls every 5 min — not real-time, but adequate for async transcription. Max 1 GPU instance (quota). (3) DB stores `start_ms`/`end_ms` (milliseconds) — TypeScript types must match exactly or timestamps render as NaN. (4) Recording is gated by `import.meta.env.PROD` — dev servers never record audio, so transcription can only be tested on prod/preview builds.
**Alternatives rejected:** (1) Real-time transcription via WebSocket — too complex for v1, polling is simpler and GPU cold start makes real-time impractical. (2) CPU-only transcription — too slow (10x+ slower than GPU for speaker diarization). (3) Storing timestamps as seconds — kept ms to match pyannote's native output and avoid precision loss.
**Consequences:** GPU costs ~$0.50/hr but scale-to-zero means cost is per-transcription only. Future: backfill script can create pending jobs for 45 existing recorded sessions. Type/DB field name mismatches are a recurring gotcha — verify DB column names before defining TypeScript interfaces.
**References:** [P495 spec](features/p495_live_session_transcription.md), `services/transcribe/requirements.txt`

## 2026-03-16 [technical]: Standardize core page widths to max-w-2xl (672px)

**Context:** Profile page used `max-w-lg` (512px) while feed/settings/create-story used `max-w-2xl` (672px). On desktop, profile wasted ~60% of viewport as white space. Same card components rendered at different widths depending on which page hosted them.
**Decision:** Standardize all core content pages to `max-w-2xl`: profile, point-detail, story-detail, profile-connections. Cards are width-agnostic (fill their parent) — fix is purely at the page container level. Embed containers (`max-w-[550px]`) left untouched.
**Alternatives rejected:** (1) `max-w-3xl` (768px) — too wide for current content density (fewer sections than LinkedIn). (2) Cards self-constraining — more defensive but harder to maintain, pages should own layout. (3) Keep `max-w-lg` — status quo leaves cramped feel.
**Consequences:** Consistent 672px content column across all core pages. Profile name no longer truncates on mobile (removed `truncate`, added `flex-wrap`). Point card action rows no longer overflow on narrow viewports (added `flex-wrap`).
**References:** [P531 spec](features/done/23_mar_26/p531_standardize_page_widths.md), [P532 spec](features/done/23_mar_26/p532_point_card_actions_overflow_mobile.md)

## 2026-03-16 [technical]: ClarityLoader — Draw → Breathe animation, CSS-only anti-flash

**Context:** All ~16 full-page loading states used generic Lucide `LoaderIcon` (spinning asterisk). No brand identity. Loading states flash for milliseconds on fast pages — jarring blue flash and disappear.
**Decision:** (1) **Draw → Breathe animation:** C stroke draws once via `stroke-dashoffset` (1.2s), then settles into gentle opacity pulse. Blue rectangle stays solid, only C animates. Chosen via demo page with 11 variants + creative agent (8 more concepts) + neutral judge agent scoring 19 options on 6 criteria. (2) **Logo only, no text:** Removed "Completing Verification" / "Loading..." — flashes awkwardly on fast loads, the branded animation speaks for itself. Error states still show text. (3) **CSS-only anti-flash:** `.clarity-page-loader` has `opacity:0` + `animation: clarity-appear 200ms ease-out 300ms forwards`. Loads under 300ms = no loader shown. No JS timers — prevents test interference (JS useState timers caused auth flow tests to double-fire processAuth). (4) `data-status={status}` wrapper in AuthCallbackPage — keeps `status` in React's render tree to prevent render-skip optimization that changed useEffect firing pattern.
**Alternatives rejected:** (1) JS setTimeout for delayed appearance — caused extra re-renders, broke critical auth flow tests. (2) Focus/Resolve (blur→sharp) on whole logo — too heavy visually. (3) Breathing Logo (scale pulse) — too subtle per user feedback. (4) Text labels on loading states — flash and disappear on fast loads.
**Consequences:** Consistent branded loading experience across all pages. CSS anti-flash is zero-overhead (no JS, no state). Demo page at `/tree/loading-demo` for future animation explorations.

## 2026-03-16 [process]: Creative → Judge agent pattern for subjective design decisions

**Context:** Choosing a loading animation is subjective — "feeling of clarity" can't be evaluated with code review. Needed to explore creative space broadly, then evaluate objectively.
**Decision:** Two-phase agent pattern: (1) **Creative agent** generates 6-8 bold concepts with metaphor analysis and CSS feasibility assessment. Give it brand context + explicit permission to think outside the box. (2) **Neutral judge agent** rates all options (existing + new) on weighted criteria (brand alignment 25%, loading affordance 20%, calm 20%, implementation 15%, versatility 10%, distinctiveness 10%) with verdicts for top/bottom 3 and a single final recommendation. Both agents are general-purpose, not specialized.
**Alternatives rejected:** (1) Just pick one ourselves — misses creative options we wouldn't think of. (2) User picks from a small set — too narrow, confirmation bias. (3) Single agent does both — creative and critical thinking conflict in one prompt.
**Consequences:** Reusable pattern for any subjective design decision (color palettes, copywriting tone, illustration style). The demo page pattern (build all variants on a /tree route) pairs well with this agent pattern.

## 2026-03-16 [process]: Visual QA — spawn separate subagent, never self-review

**Context:** P521 position button redesign went through 5+ rounds of "it's ready" → user finds visual bugs. Root cause: the implementing agent reviewed its own screenshots with confirmation bias — checked "does it render" not "does it look right."
**Decision:** After any UI change, spawn a SEPARATE subagent for visual QA. Give it ONLY screenshots + a 10-point checklist. Do NOT give it the code diff or intent. The implementing agent must NOT declare "ready" based on its own review. Added `.claude/rules/visual-qa.md`.
**Alternatives rejected:** (1) Just "be more careful" — doesn't work, confirmation bias is structural. (2) Always run `/verify` — too heavy for prototype iteration.
**Consequences:** Visual bugs caught before user sees them. Slight overhead (1 subagent spawn per UI change). Checklist is mechanical — prevents the "looks fine to me" failure mode.

## 2026-03-16 [product]: P521 position buttons — auto-dropdown replaces hidden chevrons

**Context:** Position buttons had tiny ChevronDown arrows for 7-point intensity selection that no user discovered. Progressive label truncation ("Dis...", "Ag") was ugly. Zero-counts "(0)" were noise. Explored 4 options: (A) auto-dropdown, (B) expand-below, (C) tooltip hint, (D) row replacement. User rejected D (disorienting) during prototype testing.
**Decision:** Option A — click Agree/Disagree selects default immediately + auto-opens intensity dropdown. Click away = accept default (0 extra clicks). Pick intensity = 1 extra click. Unsure selects immediately (no dropdown). Intensity shown in button label: Agree+ (strongly), Agree− (somewhat), Agree (default).
**Alternatives rejected:** (B) expand-below — layout shift in tight containers. (C) tooltip — not discoverable on mobile. (D) row replacement — user found it disorienting, lost context.
**Consequences:** Intensity is discoverable (dropdown is RIGHT THERE) without requiring discovery of a tiny chevron. Same `onPositionClick(PositionType)` API — zero consumer changes needed.

## 2026-03-16 [technical]: P521 portal dropdown + ResizeObserver for position buttons

**Context:** Position buttons appear in 8+ surfaces (feed card, profile, story detail, quoted point, live session) with varying container widths (235px–500px). Parent cards use `overflow:hidden` for rounded corners, clipping absolutely-positioned dropdowns. CSS media queries don't work for simulated viewport widths in prototypes.
**Decision:** (1) Dropdown rendered via `createPortal(dropdown, document.body)` — escapes any overflow:hidden container. Position calculated via `getBoundingClientRect()`. (2) `ResizeObserver` measures container width internally — component decides full-text vs icon-only without consumer involvement. Threshold: 270px. Two modes only, no intermediate truncation.
**Alternatives rejected:** (1) CSS container queries (`@container`) — Tailwind v3.3+ feature, adds complexity. (2) `containerWidth` prop — requires consumers to know their own width.
**Consequences:** Component is fully self-contained. Works in all 8+ surfaces without consumer changes. Portal dropdown needs click-outside handler that checks both button row AND portal element.

## 2026-03-16 [product]: Off-boarding split — withdraw pledge (P524) vs delete account (P520)

**Context:** Gosha (first pledger exit request, March 2026) asked to leave via WhatsApp. Three-day back-and-forth ensued. `/challenge-prd` on the initial combined spec surfaced 3 BLOCKs: agreement termination flow undefined, post-withdrawal profile state undefined, PII inventory missing. Codebase investigation revealed `has_pledged: false` already works everywhere (pledgers page, featured profiles, badge, re-pledge upgrade flow).
**Decision:** Split into two features. (1) **P524 — Withdraw pledge** (inline toggle, shipped): `updateProfile({ has_pledged: false })` in settings. All downstream queries already filter on `has_pledged: true`. Re-pledge via existing `/sign-pledge` upgrade flow. (2) **P520 — Delete account** (separate spec, not yet built): edge function for `auth.users` deletion, migration to orphan points/events (`SET NULL` instead of CASCADE), agreement termination, PII cleanup for non-FK'd tables.
**Key insight — community data must survive user deletion:** Points have positions from other users. `ON DELETE CASCADE` on `first_validator_id` would destroy other people's contributions. Decision: orphan points and events (`SET NULL`), delete personal data (stories, positions, witnesses, agreements).
**Alternatives rejected:** (A) Combined spec with both actions (over-scoped for C1 phase). (B) "Pause" as separate state (adds complexity — withdraw is already reversible). (C) Delete everything including community data (destroys other users' contributions).
**Consequences:** P524 is shipped. P520 needs: migration (`ALTER TABLE points/events`), edge function (`delete-account`), explicit cleanup for `terms_acceptances` and `session_consents` (no FK constraints). Agreement termination: set `status: terminated` silently, then delete rows. Deleted profile slug shows "This profile no longer exists."
**References:** `features/p520_pledge_withdrawal_account_deletion.md`, `features/p524_withdraw_pledge_toggle.md`, `claude-conversations/2026-03/2026-03-13-Отзыв карточки clarity pledge.md`

## 2026-03-16 [technical]: Server-side account creation for agreement signing (P527)

**Context:** New users invited to sign a partner agreement had to: click invite → enter name → click "Sign" → check email for magic link → click link → return to app. The email round-trip added zero security value (they clicked the invite FROM their email) and caused drop-off at the highest-engagement moment. P488 had already solved this for existing users via magic links embedded in the invitation email.
**Decision:** New edge function `create-and-sign` handles the full flow server-side: validates invitation token + expiry → creates auth user via `auth.admin.createUser({ email_confirm: true })` → creates profile → calls `accept_agreement` RPC → generates session token via `auth.admin.generateLink()` → returns `hashed_token` to client. Client exchanges token via `supabase.auth.verifyOtp({ token_hash, type: 'magiclink' })` — no redirect, no email. Fallback: if edge function fails, client falls back to existing OTP flow (graceful degradation).
**Key patterns established:** (1) `verifyOtp` with server-generated `hashed_token` for instant auth without email — new pattern, reusable for any flow where server knows user identity. (2) Email pinning: client sends `{ agreementId, token, partnerName }` only — edge function derives email from DB, never trusts client. (3) Dual profile creation (AuthCallbackPage + edge function) — accepted trade-off; edge function creates minimal profile, AuthCallbackPage upserts on subsequent login. ToS version (`'v1.1'`) hardcoded in edge function — must update on ToS bump.
**Alternatives rejected:** (A) Client-side `signInWithOtp` without email — impossible, Supabase always sends email for new users. (B) Custom JWT — bypasses Supabase session management. (C) Redirect through AuthCallbackPage after createUser — reintroduces redirect chain.
**Consequences:** Agreement signing is now instant for all users (new + existing). The `create-and-sign` edge function is a new deploy dependency — added to deploy manifest. The `verifyOtp` pattern can be reused for future flows needing server-side auth (e.g., event RSVP auto-login).

## 2026-03-16 [process]: Deploy manifest — catch undeployed infra before merge

**Context:** P504 (AI-generated banners) shipped frontend code to prod but the edge function and DB migrations were never deployed. Result: silent 404s and missing columns. No error surfaced until manual testing days later. The env var corruption incident (same week) was a similar class — code shipped but infrastructure didn't follow.
**Decision:** Added a deploy manifest system: `supabase/deploy-manifest.json` records SHA256 hashes of all edge functions and migration versions at deploy time. `/ship` step 3.6 diffs the manifest against local filesystem before merging — catches undeployed functions and unapplied migrations with zero API calls (auth-resilient, works offline). Scripts: `stamp-deploy-manifest.sh` (writes after deploy), `check-deploy-manifest.sh` (reads before merge), `deploy-functions.sh` (deploys + stamps).
**Alternatives rejected:** (1) Check via Supabase Management API at merge time — requires auth token, fails when PAT expires, adds network dependency to the merge flow. (2) Manual checklist in /ship — relies on discipline, exactly what failed with P504.
**Consequences:** Every `/ship` now validates infra parity before merging. New edge functions or migrations that aren't deployed will block the merge with a clear diff showing what's missing. The manifest is committed to git so drift is visible in PRs.

## 2026-03-16 [process]: Privacy scanning must be principle-based, not pattern-based

**Context:** Weekly review discovered real client first names (3 individuals) with identifying context (profession, relationship dynamics, behavioral observations) in 4 public docs. Pre-commit §17 only checks owner email patterns. The `/privacy` skill existed but was manual and optional — an info reminder, not a gate. Names leaked because the threat model covered credentials and owner PII but had no category for third-party personal information.
**Decision:** (1) Expanded `/privacy` skill from pattern-matching to principle-based review: "Would this harm someone — anyone — if they found it?" Added third-party PII, behavioral observations, and session content as hard red flag categories. (2) Pre-push hook now blocks pushes with docs/ changes unless a fresh `.privacy-reviewed` timestamp exists. (3) `/privacy` stamps `.privacy-reviewed` on completion. The system now catches unknown privacy categories, not just enumerated patterns.
**Alternatives rejected:** (1) Add a name list to pre-commit (brittle — needs updating after every session). (2) Heuristic regex for capitalized proper nouns (too many false positives — flags "Supabase", "Vercel", etc.).
**Consequences:** Every push that touches docs/ requires `/privacy` review. Principle-based scanning means new categories of sensitive information are caught without updating the scanner. Trade-off: adds ~2 min to push flow for doc-heavy commits.

## 2026-03-16 [technical]: Batch Mixpanel instrumentation for 7 shipped features

**Context:** Mixpanel event audit (via /weekly) found 7 features shipped without analytics: P458 (auth gate), P491 (hashtag feed), P502 (anon position CTA), P505 (feed sort), P508 (partner template), feed card share buttons, and embed views. At 61 users, manual observation still works — but events enable answering "is anyone using what I built?" without checking prod manually.
**Decision:** Added 10 analytics.track() calls across 10 source files: `auth_gate_triggered/completed`, `feed_tag_filtered/cleared`, `feed_sort_changed`, `anon_position_cta_shown/clicked`, `partner_template_viewed`, `feed_card_shared`. Updated `docs/technical/analytics.md` with all new events + documented existing PWA events (`pwa_install_prompted`, `pwa_ios_instructions_shown`).
**Alternatives rejected:** (1) Skip all — valid at 61 users but misses the habit of instrumenting at ship time. (2) Add only P1 events — partial, same effort to add all 7 since the pattern is mechanical.
**Consequences:** analytics.md is now the authoritative event catalog. Future features should add events at ship time, not in a batch audit.

## 2026-03-16 [process]: Process-learnings.md graduation pattern

**Context:** process-learnings.md accumulated 14 proposed items over 3 weeks with zero resolved. The file became a graveyard — items that were decisions (not tasks), behavioral observations (not process fixes), and already-specced features (P517, P518) mixed together.
**Decision:** Established graduation pattern: (1) Items that are decisions → delete from process-learnings, capture in decisions.md with `[process]` tag. (2) Items that are behavioral patterns → move to `pp/docs/decisions.md`. (3) Items that map to existing specs → delete, add reference comment. (4) Items with no recurrence → defer (leave in file, monitor). Empty process-learnings.md is healthy. After cleanup: 14 → 4 items (3 deferred, 1 with active bugs filed as P528-530).
**Alternatives rejected:** (1) Leave all items and add "resolved" status — file grows without bound, becomes noise. (2) Delete everything and start fresh — loses the deferred items that still matter.
**Consequences:** process-learnings.md is now a short active queue, not an archive. /weekly step 2.5 checks for items >2 weeks old.

## 2026-03-16 [technical]: Two-party coordination fields must use per-role keys, never shared arrays

**Context:** P525 investigation revealed that `celebrationAcknowledgedBy` (a JSON array both users append to) caused permanent deadlocks via JSONB `||` merge — last writer wins, one user's acknowledgment lost. The initial fix used two boolean keys (`celebrationAcknowledgedByCreator`, `celebrationAcknowledgedByJoiner`) but the UI check was role-blind (checked either boolean instead of the current user's), creating a second deadlock. Fixed by threading `isCreator` prop + adding a reactive `useEffect` safety net.
**Decision:** Any `live_state` field that both users write to must use per-role keys (one key per participant), never a shared array or accumulator. The JSONB `||` merge handles different keys atomically but overwrites same keys. Additionally, any UI that reads coordination state must be role-aware — check only the current user's key.
**Alternatives rejected:** (1) Array-append RPC (`jsonb_set` with array concatenation) — adds DB-level complexity, new migration, still needs duplicate handling. (2) Optimistic client-side merge with retry — adds complexity, theoretical race window remains. (3) Version counter with compare-and-swap — over-engineered for a 2-participant system.
**Consequences:** Pattern to follow for any future two-party coordination: use `fieldByCreator`/`fieldByJoiner` keys. Thread `isCreator` to any component that reads coordination state. Add reactive `useEffect` watching both keys as a safety net for simultaneous actions.
**References:** `features/done/22_mar_26/p525_live_state_deadlock_prevention.md`, P399 (predecessor — JSONB `||` merge for story data)

## 2026-03-16 [technical]: Sentry PII scrubbing required for live_state snapshots

**Context:** P525 added Sentry exception capture for `updateLiveState` failures. `live_state` contains user display names (`checkerName`, `currentSpeaker`, etc.) and user-authored story content (`selectedStoryData`). Sentry's `sendDefaultPii: false` does NOT cover explicitly attached `extra` data — only auto-collected PII (IP, cookies).
**Decision:** Create `sanitizeLiveStateForSentry()` utility that strips PII fields and keeps only structural/diagnostic fields (phase, round, submission flags, timestamps). All Sentry captures must use sanitized snapshots.
**Alternatives rejected:** (1) Send full snapshots and rely on `sendDefaultPii` — doesn't work for `extra` data. (2) Don't send state at all — loses the debugging value.
**Consequences:** Any future Sentry instrumentation that attaches user data must go through a sanitizer. Names in live_state are functional data within the app but become PII when sent to a third-party service.

## 2026-03-16 [process]: Worktree slots are unlimited — use next available wN

**Context:** `/dev` skill had a hardcoded two-slot limit (w1, w2) that stopped and asked the user when both were occupied. The user correctly pointed out this is artificial — git worktrees have no slot limit.
**Decision:** Dynamic slot allocation: check `git worktree list`, pick the next available `wN` (w1, w2, w3, ...), create it without asking. Port formula: `5000 + N * 100` (w3 = 5300).
**Alternatives rejected:** Asking user which worktree to free up — unnecessary friction.
**Consequences:** `/dev` skill updated. No more blocking on "both slots occupied."

## 2026-03-16 [process]: Prod verification via Playwright with persistent test account

**Context:** After fixing the agreements env var bug, we couldn't verify the fix on prod — Claude in Chrome dies after ~5min (MV3 service worker timeout), and Playwright was limited to the test project (P496 constraint: "Supabase test project only"). Manual browser verification is unreliable as a process.
**Decision:** Create a persistent test account on prod (`e2e-agent@claritypledge.com`) and write Playwright-based prod verification tests. Run with `VERIFY_PROD=1`. Documented in `/verify` (Step 2b), `/dev` (Step 9.8), `/fix`, and `docs/technical/e2e-testing-guide.md`. Template: `e2e/verify-prod-agreements.spec.ts`.
**Alternatives rejected:** (1) Fix Claude in Chrome MV3 timeout — upstream Chrome issue, not in our control. (2) Programmatic user creation on prod per test — too risky, test user cleanup failures leave orphans. Persistent account avoids this.
**Consequences:** Agents can now autonomously verify features on prod after deploy. The test account is permanent and should not be deleted. Future prod verification tests follow the same pattern: sign in as `e2e-agent`, inject session, navigate `claritypledge.com`, assert, cleanup test data.

## 2026-03-16 [technical]: Vercel env var `\n` corruption silently disables feature flags

**Context:** `VITE_USE_REAL_AGREEMENTS_API` on Vercel prod had value `"true\n"` (literal backslash-n appended). The comparison `=== 'true'` evaluated false, causing the prod build to tree-shake the real agreements service and ship the mock instead. Agreements appeared to work (mock returned data, toast fired) but nothing hit the database. Pair B's real partnership agreement was lost. No Sentry errors, no Mixpanel events — completely silent.
**Decision:** (1) Fixed the env var. (2) Added Mixpanel tracking to the full agreement flow (`agreement_create_started/success/failed`, `agreement_accept_*`, `partners_page_loaded`) so silent failures become visible. (3) Future env var additions should verify the deployed bundle contains the expected code path (`curl bundle.js | grep "table_name"`).
**Alternatives rejected:** (1) Remove the feature flag entirely (always use real service) — premature; the mock is still useful for local dev when DB is down. (2) Use `startsWith('true')` instead of `===` — masks the real problem; env vars should be clean.
**Consequences:** Any `VITE_*` env var set via CLI must be verified after setting. The `vercel env pull` command may show `\n` artifacts — verify via the deployed JS bundle, not the pull output.

## 2026-03-16 [infrastructure]: Two-party test coverage guardrail in /dev and /generate-tests

**Context:** P495 shipped a bug where `createTranscriptionJob` was inside `stopAndUploadRecording` which early-returned when no recording was active. The RPC never fired. No test caught it because no two-party E2E test existed for the session-end flow. The agent verified the fix by reading code but couldn't reproduce the failure — it was only caught by running the actual flow in a headless browser.
**Decision:** Add structural guardrails in two skills: (1) `/dev` pre-flight step 0.3 runs a concrete `grep` for existing two-party tests when the spec touches `/live` or `clarity_sessions` — flags if none exist. (2) `/generate-tests` adds a "two-party test rule" that scaffolds host+guest E2E tests using existing helpers (`getTestAuthContext`, `mockMicPermission`, `waitForDBPresence`).
**Alternatives rejected:** (1) `/self-test` skill using Chrome DevTools MCP — fragile, not repeatable by CI, duplicates Playwright capabilities. (2) Adding the check to `/dev` step 6 (skeptic check) — too vague; free-form thinking prompts aren't enforceable. Pre-flight with a concrete grep is mechanical. (3) Splitting tests between `integration` and `chromium` Playwright projects — diverges from existing pattern where all two-party tests run under `chromium` with inline `supabaseAdmin` assertions.
**Consequences:** Every future `/live` feature will have the agent check for two-party test coverage before implementation begins. The P495 integration test (`e2e/integration/p495-transcription-trigger.spec.ts`) serves as the reference pattern.

## 2026-03-16 [technical]: Distinguish manually-entered vs auto-filled state before clearing

**Context:** P483 added email-lookup auto-fill for partner name in agreement creation. The reset logic (`setPartnerName('')`) fired unconditionally on every email keystroke — wiping manually-entered names. Users who typed name first, email second had to re-enter the name.
**Decision:** Only clear `partnerName` when `isPartnerNameLocked` is true (i.e., the name was auto-filled by lookup). Manually-entered names are never cleared by email field changes. Added `isPartnerNameLocked` to `useCallback` dependency array to prevent stale closure reads.
**Alternatives rejected:** (1) Track name source with a separate `nameSource: 'manual' | 'lookup'` state — over-engineered for a boolean distinction already captured by `isPartnerNameLocked`. (2) Reorder UI to force email-first flow — breaks the certificate's natural document hierarchy.
**Consequences:** Pattern to follow: when a field can be populated by both user input and auto-fill, track the source before resetting. The `isPartnerNameLocked` boolean already served as this signal — the bug was not using it as the clear condition.
**References:** `src/app/pages/create-agreement-page.tsx` (lines 127-131)

## 2026-03-15 [product]: Post-session offer system — personalized offer pages on ladischenski.com

**Context:** First paid de-risking session conducted with a warm lead (couple, referred from a ClarityPledge event). Needed a follow-up offer system that: captures learnings from each interaction (not just converts), works for couples AND co-founders, and can be generated quickly for each new lead.
**Decision:** (1) Personalized static HTML offer pages at `ladischenski.com/for/{name}/` — not PDFs, not generic landing pages. Each page is tailored with session observations and specific offer details. (2) Two-step reveal: observations visible on load → "I'm interested" / "Not right now" buttons. Price only shown after self-selection (micro-commitment). (3) Decline path captures rejection reason via Web3Forms (5 radio options + free text → email notification). (4) Payment via Wise payment links (lowest fees for EU, ~0.4-0.7% vs Stripe 1.5-2.5%). (5) Observations split into "Habits to keep" / "Habits to build" — actionable, not just feedback. (6) `/create-offer` skill created to generate future offers in ~10 minutes from session notes. (7) Legal infrastructure added to ladischenski.com: privacy policy, terms of service, footer with TechSalesBox OÜ entity.
**Alternatives rejected:** (1) PDF one-pager (frozen once sent, can't update, no analytics potential). (2) Passphrase-gated page (adds friction without real security — the URL itself is private enough). (3) Stripe for payments (higher fees, more setup for the same outcome). (4) Price visible on load (SaaS conversion research shows interest-gating increases conversion for warm leads). (5) Tally embed for decline form (Web3Forms already integrated, one less dependency).
**Consequences:** ladischenski.com now serves dual purpose: coaching landing page + personalized offer delivery. The `/create-offer` skill templates this for reuse. Wise Business account is the payment backbone. Future offers should reference and improve on this template. Each decline email feeds back into offer optimization.
**References:** `~/Projects/public/ladischenski-com/public/for/victoria/index.html` (template), `.claude/commands/slava/content/create-offer.md` (skill)

## 2026-03-15 [product]: Pricing structure — €950 for 2 sessions + bonus, with value anchoring

**Context:** First coaching package needed pricing. The service is clarity practice sessions (90 min each) for couples or co-founders. The free initial session establishes trust and demonstrates value.
**Decision:** (1) Core package: €950 for 2 sessions (90 min each). (2) Bonus third session offered free as "gift" (not discount — more value, not cheaper value). (3) Free session anchored at €250 value in the offer page copy. (4) Full refund guarantee after session 1 — "no form, no questions, no awkwardness." (5) Referral: friends get first session at €150 instead of €250 (mentioned only in feedback Tally, not on offer page). (6) Session format: "online or in person — flexible scheduling."
**Alternatives rejected:** (1) Discount instead of bonus session (trains people to expect discounts). (2) Per-session pricing without package (no commitment, harder to build on session 1). (3) Higher anchor for free session (€475/session math exists but "I typically value" felt dishonest for a first-ever session).
**Consequences:** The €950 price point needs validation — decline form data will show if price is the primary objection. If 4/5 declines cite price, consider a lighter package. The bonus session framing ("my gift to you") reinforces reciprocity without discounting.

## 2026-03-15 [process]: Conversion psychology applied to offer pages — Cialdini principles for warm leads

**Context:** Multiple agent passes (conversion copywriting, sales psychology, funnel design) were run against the offer page to optimize for a therapist audience — someone who would see through cheap manipulation.
**Decision:** (1) Reciprocity: name the gift value explicitly ("session worth €250"). (2) Loss aversion: "what you practiced starts to fade within 2-3 weeks without structure." (3) Commitment/consistency: identity statements about what they already did ("you chose to practice, not just talk"). (4) Scarcity with reason: honest schedule constraint, not arbitrary deadline. (5) Authority: link to published research (SSRN paper) — one line, not a CV dump. (6) Price last: only shown after "I'm interested" click (progressive disclosure). (7) Decline path equally dignified: "Completely fine" with no persuasion — the absence of pressure IS the persuasion for sophisticated audiences.
**Alternatives rejected:** (1) Showing price upfront (loses micro-commitment opportunity). (2) Testimonials/case studies (impossible at n=1, don't fake it). (3) Countdown timer urgency (a therapist would see through it instantly). (4) Email capture on decline (already have their contact via WhatsApp).
**Consequences:** These principles should be encoded in the `/create-offer` skill and refined with each offer. The decline form data will validate which principles land and which don't. Framework applies equally to co-founder offers — adjust framing, keep psychology.

## 2026-03-15 [process]: AI design tooling — Stitch 2.0 for prototyping, skip SuperDesign and Polymet

**Context:** Evaluated three AI design tools (SuperDesign, Google Stitch 2.0, Polymet) for three use cases: CP landing page conversion optimization, ladischenski.com improvements, and P517 /live interaction redesign (sliders + turn-taking). Friend uses SuperDesign MCP in terminal-only workflow with Playwright verification.
**Decision:** (1) Use Google Stitch 2.0 (free, 350 gen/month) for visual design exploration and interactive prototyping. Best design quality (Gemini-powered), only free tool with clickable prototypes. (2) Install `stitch-mcp` to bridge designs into Claude Code. (3) Skip SuperDesign — it's a "design orchestrator" that delegates generation to your IDE's LLM. On Opus, it adds workflow structure (`.superdesign/` folder, `style.md`) but not quality beyond what Claude already produces. (4) Skip Polymet — ~$50/mo for capabilities Stitch provides free. (5) For P517 specifically: interactive prototype in Stitch BEFORE `/ux` — static mockups can't validate whether sliders feel right.
**Alternatives rejected:** (1) SuperDesign as primary tool (value proposition collapses when LLM is already strong — it's a recipe book, not a chef). (2) Polymet for React/shadcn output (cost unjustified when Claude Code generates equivalent React). (3) Build a custom `/design-explore` skill instead (premature — try Stitch first, build skill only if the workflow proves valuable).
**Consequences:** `stitch-mcp` needs installation before P517 design work. P517 workflow becomes: `/ascii-flows` → Stitch 2.0 interactive prototype → `/ux` → `/architect` → `/dev`. Landing page redesign (CP, ladischenski.com) can use Stitch for visual exploration whenever prioritized.
**References:** Research report at `~/Documents/AI_Design_Tools_Comparison_20260315/`

## 2026-03-15 [product]: Session resilience — pagehide must not kill sessions; grace period + rejoin is the correct model

**Context:** Live session observations (2026-03-14) showed users repeatedly losing sessions and unable to return. 5-whys root cause analysis identified 7 session-killing paths, all tracing to one architectural flaw: the `pagehide` handler assumes "page closing = permanent departure." On mobile, pages are frequently *suspended* (not destroyed) — app backgrounding, pull-to-refresh, tab switching, memory pressure. The handler immediately patches the DB, destroying the session before the user can return.
**Decision:** (1) Only the "End Session" button should immediately kill a session. (2) All other departures (refresh, navigate, tab close, network drop) get a 2-3 minute grace period. (3) Both creator AND joiner can rejoin within the grace period. (4) "Active session" banner on all pages with rejoin button. (5) Remove the P410 navigation confirmation dialog — sessions survive navigation. (6) Add `last_activity_timestamp` for grace period detection. Filed as P511.
**Alternatives rejected:** (1) Keep current behavior, just add better error recovery (addresses symptoms, not root cause). (2) Use WebSocket heartbeat instead of grace period (fragile on mobile networks). (3) Never auto-expire sessions (creates zombie sessions).
**Consequences:** P410 (nav guard) will be superseded. The departure detection system (P126) stays but its role changes: instead of signaling "partner left permanently," it signals "partner disconnected, starting grace timer." Session DB schema needs `last_activity_at` column.
**References:** `features/p511_session_resilience.md`, `.private/docs/user-feedback.md` (2026-03-14 observations)

## 2026-03-15 [product]: Target audience refined — "people whose conversations carry risk if they're wrong"

**Context:** Live session observations showed that general "communication practice" framing doesn't land. Participant C (NVC coach, Mar 12) didn't see the point. General audiences don't feel the friction is worth it. But people in high-stakes partnerships — where being wrong costs money, trust, or trajectory — immediately get it.
**Decision:** Target audience is: co-founder partnerships, business partnerships, married couples making joint high-stakes decisions (finances, relocation, parenting strategy), professional pairs where miscommunication has real consequences. NOT: general communication practice, conflict resolution, relationship counseling (that's therapy/NVC territory). The differentiator: "Do your conversations carry risk if you're wrong?"
**Alternatives rejected:** (1) Broad "communication skills" positioning (too generic, competes with NVC/therapy). (2) Only co-founders (too narrow — married couples with joint stakes have the same need).
**Consequences:** Event positioning, landing page copy, and content strategy should lead with risk/stakes framing, not "better communication." The calibration framing ("smaller friction now prevents bigger problems later") resonates with this audience.
**References:** `.private/docs/user-feedback.md` (2026-03-14, items #13-16)

## 2026-03-15 [process]: User feedback pipeline — raw observations → .private → root cause analysis → specs with 5-whys

**Context:** Session observations produced 16 items (product insights, UX bugs, event positioning learnings) but no structured process existed to turn them into actionable specs. Previous feedback (Participant C, Mar 12) was captured but not systematically processed.
**Decision:** Pipeline: (1) Capture raw observations in `.private/docs/user-feedback.md` with date and context. (2) Classify: bugs → `/create-bug` with 5-whys root cause analysis, product insights → `/quick-feature` or update hypotheses, event learnings → update session script. (3) Run 5-whys root cause analysis for ALL bugs before filing — not just the obvious ones. Filing symptoms without root causes leads to wrong fixes.
**Alternatives rejected:** (1) File specs immediately from raw observations (skips root cause, leads to symptom-fixing). (2) Wait for a dedicated "feedback processing" skill (the pipeline works with existing skills). (3) Create a dedicated skill now (premature — run the pipeline manually 2-3 more times to learn the pattern first).
**Consequences:** `.private/docs/user-feedback.md` is the intake. Each batch of observations should produce: root-cause-analyzed bug specs + feature ideas + doc updates. Consider creating a `/session-debrief` skill after 2-3 more manual runs.
**References:** `.private/docs/user-feedback.md`

## 2026-03-15 [technical]: Parallel bug fixes in isolated worktrees — 5 agents, 5 worktrees, sequential merge

**Context:** 5 bugs identified from session observations (P512-P516) all touched overlapping files (`clarity-live-page.tsx`, `live-mode-view.tsx`). Needed to fix all simultaneously without merge conflicts during implementation.
**Decision:** Each bug gets its own worktree (agent isolation). Agents work in parallel. Merge into main one at a time in order of least conflict risk (smallest changes first, largest last). Pre-commit checks run in each worktree. All 5 merged cleanly with no conflicts.
**Alternatives rejected:** (1) Sequential fixes on main (slower, context switching). (2) All fixes in one branch (can't parallelize, harder to revert individual fixes). (3) One agent doing all 5 (serial, no speed benefit).
**Consequences:** Pattern works well for 3-5 related bugs touching the same files. Key: merge in order of increasing file-touch surface. For >5 bugs or deep conflicts, may need a different strategy.

## 2026-03-15 [process]: Verify the user's naming scheme before diagnosing sorting bugs

**Context:** User reported stories/points on profile were "not sorted top to bottom" with sequence 7,5,3,4,2,6,1. Investigation assumed "#st1–#st7" referred to creation order. In reality, stories contain `#stN` hashtags in their content representing a logical narrative sequence — and the stories were NOT created in that sequence. The `created_at`-based sort was working correctly; it just produced a different order than the `#stN` numbering.
**Decision:** Fixed by updating `created_at` timestamps on prod to match the intended `#stN` sequence (5 stories, 5 points). The earlier code fix (adding `.order()` to sub-queries) was still valid but addressed a secondary issue, not the user's complaint.
**Alternatives rejected:** (A) Sort by `stN` tag at query time — fragile, couples display order to content hashtags. (C) Add `display_order` column — unnecessary schema change for 7 records with stable ordering.
**Consequences:** When a user reports ordering issues, first ask: "What determines the expected order?" Don't assume `created_at` = intended sequence. The `#stN` tags in story content are the user's canonical numbering — content was authored out of sequence.

## 2026-03-14 [product]: On-page banners only where compositionally integrated — OG-only for stories, removed from points

**Context:** P504 added AI-generated banners uniformly across stories, points, profiles, and events. On profiles, P510 redesigned the banner into a LinkedIn-style header (96px avatar overlap, name beside avatar, pencil icon controls) — compositionally integrated. On stories and points, banners sat as disconnected rectangular blocks above content cards: 29% mobile viewport consumed, no information value, no visual integration with the card below. Analysis of 30 layout variants via `/ascii-flows` confirmed no practical integration pattern exists for card-based detail pages.
**Decision:** (1) Stories: remove `<BannerDisplay>` and `<BannerControls>` from story-detail-page.tsx; keep `bannerUrl` in OG meta tags for social sharing; keep fire-and-forget generation in `createStory()`. Add subtle 3px `border-top` with `authorAvatarColor` for visual identity. (2) Points: remove `<BannerDisplay>` from point-detail-page.tsx; remove `generateAIBanner()` from `createPoint()` — points have no sharing surface, generation is pure waste. (3) Profiles: P510 LinkedIn-style layout stays. (4) Events: unchanged.
**Alternatives rejected:** (1) Keeping story banners on-page with card integration (no viable layout found across 30 variants). (2) Removing banner generation entirely from stories (OG value preserved for LinkedIn/Twitter previews). (3) Adding banner to point OG (points aren't shared externally).
**Consequences:** Banner components (`BannerDisplay`, `BannerControls`, `useBanner`) remain shared — used by profiles and events. The rule: banners display on-page only when compositionally integrated with the content (profile avatar overlap, event header). Disconnected decorative blocks above cards are not banners — they're noise.
**References:** `features/done/22_mar_26/p519_remove_story_point_on_page_banners.md`, `features/done/22_mar_26/p510_profile_banner_ux_polish.md`

## 2026-03-14 [technical]: Shared banner component architecture — BannerDisplay, BannerControls, useBanner

**Context:** P504 needed banners on 4 entity types (stories, points, profiles, events). Events already had inline banner code from P489. Rather than 4 independent implementations, extracted shared components.
**Decision:** (1) `BannerDisplay` — renders banner image with gradient fallback, configurable height/rounded corners. (2) `BannerControls` — two variants: `default` (full buttons for profiles/events) and `pills` (compact for inline use). Supports regenerate, remove, and Unsplash search. (3) `useBanner` hook — manages banner state, generation, removal with optimistic updates and `banner_generation_attempted` guard (prevents re-triggering on every mount). (4) `generateAIBanner` edge function extended from event-only to support story/point/profile entity types with entity-specific prompts. (5) `overflow-hidden` must NOT be added to banner wrapper divs — StoryCardDetail deliberately removed it for dropdown menus.
**Alternatives rejected:** Per-entity inline banner code (P489 pattern — works for one entity, doesn't scale to four).
**Consequences:** Adding banners to a new entity type requires: add `banner_url` column, call `generateAIBanner` on creation, render `<BannerDisplay>` + optional `<BannerControls>` with `useBanner`. The `overflow-hidden` lesson: wrapper divs around components with dropdowns must not clip overflow.
**References:** `src/app/components/shared/banner/`, `supabase/functions/generate-banner/index.ts`

## 2026-03-14 [technical]: Explicit `.order()` required on all Supabase queries rendering ordered lists

**Context:** Stories and points on profile pages appeared in arbitrary order. Four `story_points` and `stories` sub-queries lacked `.order()`, so PostgreSQL returned rows in heap order — which silently shifted whenever rows were inserted, deleted, or vacuumed. Unlinking and re-linking a position created a new `story_points` row with a fresh `created_at`, changing its physical position.
**Decision:** Added explicit sorting to all four surfaces: application-level sort by `point.created_at DESC` for linked points within story cards (both `getStoryWithPoints` and `getStoriesByAuthorWithPoints`), `story.createdAt DESC` for `getStoriesForPoints`, and `.order('created_at', { ascending: false })` for linked stories query in `profile-page-v2.tsx`. Used application-level sort (not just DB `.order()`) for junction table queries where the sort key comes from a joined table.
**Alternatives rejected:** Adding a `sort_order` column to `story_points` (unnecessary complexity — `created_at` on the target table is the natural sort key). Using `referencedTable` in Supabase `.order()` (orders nested objects, not parent rows in 1:1 joins).
**Consequences:** Rule: every Supabase `.select()` that feeds a rendered list must have an explicit `.order()` or an application-level sort. Relying on insertion order is a latent bug.
**References:** `src/app/data/stories-service-real.ts`, `src/app/pages/profile-page-v2.tsx`

## 2026-03-14 [technical]: Event emails — split past-event guard, add name personalization, add send tracking

**Context:** Post-event feedback emails (Tally form via Mailgun) never sent for the AI event (Mar 12, 11 attendees). Root cause: all 11 RSVPs were walk-in signups created *after* the event started. The edge function's past-event guard (`if (eventDatetime <= now) return`) blocked ALL emails — including feedback, which should always be sent. Additionally, emails had no personal greeting despite `profiles.name` being available. No mechanism to detect or recover from send failures.
**Decision:** Three fixes: (1) Split the guard — confirmation+reminder skip for past events, feedback always scheduled (sent immediately if event already ended, or scheduled for 2h after event end using `duration_minutes`). (2) All email templates in both `send-event-emails` and `send-agreement-emails` now include "Hi {FirstName}," greeting via shared `greeting()` / `firstName()` helpers. (3) P509: new `email_send_log` table tracks every `sendEmail()` call (sent/failed + mailgun_message_id + error_message). Backfill script at `scripts/resend-feedback.sh` queries for missing feedback sends and resends.
**Alternatives rejected:** Auto-retry queue (over-engineered at ~3 events/year), cron-based feedback sender (adds infrastructure for a problem the guard fix prevents).
**Consequences:** Walk-in RSVPs now get feedback emails. Every email send is auditable. Manual backfill available for recovery. The `status` field on events was confirmed as non-authoritative — `datetime` is truth (comment added to `events-service-real.ts`). `api.ts` has broken status-only filtering but it's dead code (nothing imports those functions).
**References:** `supabase/functions/send-event-emails/index.ts`, `supabase/functions/send-agreement-emails/index.ts`, `supabase/migrations/20260314123817_add_email_send_log.sql`, `scripts/resend-feedback.sh`, `features/p509_email_send_tracking.md`

## 2026-03-14 [technical]: position-helpers.ts is the canonical home for all position utilities

**Context:** `adjustPositionCounts()` (optimistic count adjustment) was copy-pasted in 5 files with identical 20-line `useMemo` blocks. `toSevenPointCounts()` was duplicated in 3 files. `useEmbedNavigation` (embed detection + navigation) was inline in 3 components. `StoryAuthor` interface was defined identically in 2 files. A 1-month git retrospective + `/falsify` (30 creative alternatives, 7 rejected as overkill) identified these as zero-risk extractions.
**Decision:** (1) `adjustPositionCounts()` and `toSevenPointCounts()` live in `src/app/utils/position-helpers.ts` — this extends the 2026-03-13 seven-point init decision: not just "use 7 keys" but "use the shared function." (2) `useEmbedNavigation()` hook in `src/app/hooks/useEmbedNavigation.ts` — replaces embed detection + conditional `window.open` vs `navigate()` pattern. (3) `StoryAuthor` interface canonical in `point-card-with-links.tsx`, re-exported from `story-card-with-links.tsx`.
**Alternatives rejected:** (1) `formatTimeAgo` extraction — 5 copies with 3 different output formats, needs UX decision first. (2) ShareDropdown/ShareHub consolidation — different interaction models per surface. (3) Skeleton component unification — low value, high blast radius.
**Consequences:** Net -118 lines. Any new component needing position count adjustment imports `adjustPositionCounts` — no more copy-paste. `position-helpers.ts` is now the single file to check when position logic changes.
**References:** commit `520a694a`

## 2026-03-14 [process]: Retrospective duplication analysis — git lookback + /falsify filtering

**Context:** Suspected component duplication across the codebase. Manual code review is slow; gut feeling said "we keep rebuilding the same thing."
**Decision:** Method: (1) 1-month `git log` scan for new component creation, (2) parallel agents comparing current `src/` for duplicate patterns, (3) `/falsify` to challenge all proposals (root-cause → critique → falsification → synthesis). Of 10 original proposals, 7 were rejected as overkill or misdirected. Root cause was identified as prototype-to-production type fragmentation (already resolved by P507). Only zero-risk pure-function extractions survived falsification.
**Alternatives rejected:** Full component audit without falsification — would have produced a long list of "could consolidate" items with no prioritization signal.
**Consequences:** The `/falsify` filter is the key differentiator — without it, retrospective analysis produces noise. Future retrospectives should follow: gather → classify → falsify → extract only what survives.
**References:** This session's conversation, commit `520a694a`

## 2026-03-14 [process]: Zombie Vite server prevention — kill-on-start + pre-commit scan + dev-mode error message

**Context:** Multi-worktree development produces zombie Vite dev servers — processes that survive worktree deletion and hold ports indefinitely. An AI agent misidentified which port belonged to which worktree, killed the correct w0 server, and had to restart it. Root cause analysis (5-why + /falsify with 30 creative alternatives benchmarked) identified 5 root causes; the top two open risks were: (1) no cleanup on worktree teardown, (2) no port→worktree attribution for operators.
**Decision:** Three mechanical fixes, zero new infrastructure: (1) `check-worktree-env.sh` (predev hook) now kills any existing process on the worktree's deterministic port before Vite starts — zombie never accumulates. (2) `pre-commit-checks.sh` section 19 scans all Vite-range ports for processes whose cwd no longer exists — catches edge cases. (3) `ChunkErrorBoundary` in `App.tsx` now shows "Module load failed — check your dev server terminal" in dev mode instead of the misleading "New version available" (which implied a deployment version mismatch).
**Alternatives rejected:** (1) Standalone `scripts/worktree-ports.sh` diagnostic — failed MECHANICAL criterion (requires remembering to run). (2) pm2/systemd process supervisor — new infrastructure overhead for a ~weekly problem. (3) Skip ChunkErrorBoundary fix — falsification showed triggers exist beyond cache corruption (file renames, Vite restarts); P135 was historical evidence of this exact failure. (4) PID file registry — stale on crash, adds moving parts.
**Consequences:** `npm run dev` is now self-healing: always kills stale occupant before binding. Combined with `strictPort: true` and `cacheDir` isolation (2026-03-13), the full zombie prevention chain is: deterministic port → isolated cache → kill-on-start → pre-commit scan → accurate error message.
**References:** [vite.config.ts](vite.config.ts), [check-worktree-env.sh](scripts/check-worktree-env.sh), [pre-commit-checks.sh](scripts/pre-commit-checks.sh), [App.tsx ChunkErrorBoundary](src/App.tsx)

## 2026-03-13 [technical]: Seven-point position scale requires full-key initialization everywhere

**Context:** After adding a point to a story, position counts showed `NaN` on all buttons. The optimistic UI update in `handlePointAdded` initialized a 3-key default object (`{ agree: 0, disagree: 0, unsure: 0 }`) but the display component expects `SevenPointCounts` (7 keys: strongly_disagree through strongly_agree). `getGroupCount()` sums multiple keys per button — summing `undefined` values produces `NaN`.
**Decision:** Every place that creates a default position-count object must use all 7 keys. The 3-key shorthand from the old 3-point scale is never safe — even if only 3 buttons are visible, the grouping logic reads all 7 keys.
**Alternatives rejected:** Making `getGroupCount` tolerant of missing keys — masks the real bug and makes it harder to detect future mismatches.
**Consequences:** Search for `agree: 0, disagree: 0, unsure: 0` patterns when touching position code — any 3-key init is a latent NaN bug.
**References:** [P506 spec](features/done/22_mar_26/p506_auto_extract_hashtags.md), commit `b97dad42`

## 2026-03-13 [technical]: Surface audit pattern — grep all consumers when adding display-layer features

**Context:** P491 added tag pills to feed/detail/live cards but missed 5 surfaces: QuotedPoint in StoryCardDetail, story-card-with-links, live-story-card-expanded PointRow, and 2 preview components in live-content-cards. The pattern: main card components got updated, but quoted/embedded point sub-components were consistently skipped.
**Decision:** When adding a display-layer feature (pills, badges, formatting), grep for ALL consumers of the underlying data field (e.g., `point.statement`, `story.content`) — not just the obvious top-level cards. QuotedPoint, preview, and embedded components are the most commonly missed surfaces.
**Alternatives rejected:** Centralizing all point rendering into one component — too many context-specific layouts (profile, feed, live, detail) with different interaction models.
**Consequences:** Future display features should start with `grep -r "point.statement\|point.text\|story.content" src/` to enumerate all render sites before coding.
**References:** [P503 spec](features/done/22_mar_26/p503_profile_tag_pills.md)

## 2026-03-13 [technical]: Prototype cleanup — extract production code, then delete

**Context:** 4 prototype directories (premium, converged, events-mock, linkedin-like) plus `prototypes/shared/` were dead code on the `/tree` page, but production code had 47 imports reaching into prototype folders. The prototype `Story.text`/`Point.text` types diverged from production `Story.content`/`Point.statement` — production code was converting shapes before passing to shared UI components that lived in prototype folders.
**Decision:** Three-phase approach: (1) delete zero-import prototypes (premium, converged, events-mock), (2) extract production code from `prototypes/shared/` → `utils/position-helpers.ts` + `utils/format-time.ts` + `types/index.ts`, (3) move linkedin-like shared components → `components/shared/` with a `prototype-types.ts` bridge file preserving the divergent type shapes. Clean Architecture was evaluated and rejected — existing folder structure already had homes for everything.
**Alternatives rejected:** (1) Clean Architecture pattern — overkill for a React app where the problem is misplaced files, not missing layers. (2) Rewrite all consumers to use production types directly — risky, would require changing component prop signatures across 16 files simultaneously. (3) Delete everything and fix forward — too many production imports to break at once.
**Consequences:** `prototypes/events/` remains (real production `/events` route, rename is a separate task). `prototype-types.ts` is tech debt — components still consume the old `Story.text`/`Point.text` shapes. Future cleanup: align component props to production types directly. 19K lines deleted, 6 new files created.
**References:** [P507 spec](features/done/22_mar_26/p507_remove_dead_prototypes.md)

## 2026-03-13 [technical]: Vite cacheDir isolation per worktree

**Context:** With 5 concurrent worktrees (w1-w4 + named), all symlink `node_modules/` to the main repo. Vite's dep optimization cache (`node_modules/.vite/deps/`) was shared across all dev servers. Concurrent servers overwrote each other's pre-bundled dependencies, causing cascading React crashes (`useRef`/`useMemo` null — React dispatcher corruption from stale bundles) and 504 "Outdated Optimize Dep" errors.
**Decision:** Set `cacheDir` in `vite.config.ts` per worktree slot using the existing `getWorktreeSlot()` detection. Main repo → `node_modules/.vite`, w1 → `.vite-w1`, named worktrees → `.vite-<name>`.
**Alternatives rejected:** (1) Separate `node_modules` per worktree — wastes 500MB+ disk per slot, breaks the symlink convention. (2) Only run one dev server at a time — defeats the purpose of worktrees for parallel work.
**Consequences:** Each Vite server has an isolated dep cache. No cross-contamination. Cache rebuilds on first start per worktree (few seconds). Named worktrees (e.g. `landing-v4-artistic`) also get isolated caches.
**References:** [vite.config.ts](../vite.config.ts), [worktree-setup.md](technical/worktree-setup.md)

## 2026-03-13 [product]: Anonymous position — optimistic UI + localStorage, not redirect

**Context:** P458 shipped an auth-gate redirect when anonymous users clicked position buttons. This redirect killed engagement — users got ripped away from content to a signup page, and embed visitors on Ghost blog left the article entirely. The 5-step funnel (click → signup → email → magic link → position saved) was too much friction for a low-commitment interaction.
**Decision:** Replace the redirect with optimistic UI: anonymous click highlights the button visually (separate `anonPosition` state), shows an inline CTA ("Sign up or log in to save your position"), and stores the position in localStorage (`cp-anon-positions`). On signup, all stored positions are batch-restored before the P458 single-position handler runs. Aggregate counts are NOT adjusted for anonymous positions (no ghost data) — the `anonPosition` state is never fed into the count adjustment `useMemo`. CTA links carry auth-gate URL params as fallback for the specific point the user clicked.
**Alternatives rejected:** (1) Keep redirect — high bounce rate, embed visitors lost. (2) Increment counts optimistically for anon — creates ghost data that inflates aggregates. (3) Show a modal/popup instead of inline CTA — too aggressive, contradicts the "soft hint" design ethos proven in P490 live sessions. (4) Cookie-based instead of localStorage — cookies sent to server on every request, unnecessary for client-only state.
**Consequences:** Anonymous visitors can now interact with the core product action (position-taking) without friction. Signup conversion funnel shortened from 5 steps to 2 (click CTA → auth). Embed visitors stay on the blog article. Batch-restore must run BEFORE the P458 single-position handler in AuthCallbackPage (the handler does navigate+return, which would skip batch restore).
**References:** [P502 spec](features/done/22_mar_26/p502_anon_position_optimistic_ui.md), predecessor [P458](features/done/22_mar_26/p458_anon_position_auth_gate.md)

## 2026-03-13 [product]: Feed sort toggle — URL-param approach, not auto-detect sequential tags

**Context:** Stories #st1–#st9 form a teaching sequence that reads backwards when the feed defaults to newest-first. Blog embeds (blog.claritypledge.com) don't carry auth (localStorage isolation in cross-origin iframes), making the main feed the better sharing vehicle for interactive content. Question arose: should hashtag-filtered views auto-detect sequences and flip sort?
**Decision:** Add `?sort=oldest` URL parameter + lightweight UI toggle in the tab bar row. No auto-detection of sequential tags, no per-tag sort memory. Button label shows the action ("Oldest first" / "Newest first"), not current state. Sort happens at DB level (not client-side array reversal) to handle pagination correctly.
**Alternatives rejected:** (1) Auto-reverse for specific tags — fragile, requires hardcoding which tags are sequential. (2) Auto-reverse for all tag-filtered views — confusing for non-sequential hashtags like #communication. (3) Client-side sort reversal — breaks pagination when >50 items exist. (4) Blog embed auth fix — separate, bigger effort (cross-origin session relay).
**Consequences:** Shareable teaching sequence links: `/feed?tag=understanding&sort=oldest`. Blog embed auth remains a separate future feature. The toggle is always visible (not tag-conditional) for general utility.
**References:** [P505 spec](features/done/22_mar_26/p505_feed_sort_toggle.md)

## 2026-03-13 [product]: Profile metadata — LinkedIn-style icon+link pairs, not bold numbers

**Context:** P462 originally made the partner count a bold navy `text-xl` number, LinkedIn "500+ connections" style. User feedback: "big number looks ugly" — it broke the profile header's visual rhythm where everything else is `text-sm`.
**Decision:** Profile metadata links (pledge, partners) use `text-sm text-blue-500 font-semibold` with a leading Lucide icon (ScrollText for pledge, Users for partners). No arrows, no oversized numbers. Links stacked vertically (not inline with dot separator) for mobile tap targets. Positioned as a cluster after role/LinkedIn, before calibration bar and bio.
**Alternatives rejected:** (1) Bold navy `text-xl` number — too heavy, breaks hierarchy. (2) Same-line dot separator like LinkedIn ("Pledge · 6 Partners") — wraps awkwardly on mobile with two separate link targets. (3) Muted gray link — doesn't signal interactivity. (4) No icon — works but loses visual differentiation between the two links.
**Consequences:** All future profile metadata links should follow this pattern: `text-sm text-blue-500` + Lucide icon + label. "See my X" verbs dropped — blue color signals clickability, verb is redundant.
**References:** [P462 spec](features/done/22_mar_26/p462_partner_count_header_prominence.md)

## 2026-03-13 [product]: Conversation analysis — park positioning upgrades until revenue validates

**Context:** `/claude-conversations-to-cp` analyzed 30 Claude.ai conversations (Mar 7-13). Three strategic questions surfaced: (1) should coaches/OD replace founders as primary channel? (2) should Pinker+Popper "common knowledge filtering" framing upgrade theory-of-change? (3) does capability transfer after one session contradict FCO retainer model?
**Decision:** Park all three. (1) Coaches added as EXPLORE row in lean-canvas, not primary channel — one falsification session in Claude ≠ market signal. (2) Positioning upgrade parked — Claude literally named the pattern: "I make the seeing feel like the doing." No doc rewrite before a paying customer confirms framing. (3) Retainer model stands — 30 sessions of behavioral data (nobody self-serves) outweighs one philosophical conversation about capability transfer.
**Alternatives rejected:** Encoding the coaching pivot or epistemological reframe into strategy docs now — each would be the 5th+ positioning iteration without market validation.
**Consequences:** Strategy docs stay stable. Coach channel gets explored when a demo with one real coach exists. Workshop signal (participants want false-belief highlighting app) logged in H-PairsReturn for mirror agent roadmap. Externality claim gap added to process-learnings.
**References:** [lean-canvas.md](docs/lean-canvas.md), [hypotheses.md](docs/hypotheses.md), [process-learnings.md](docs/process-learnings.md)

## 2026-03-13 [technical]: Guard every removePosition call path — cascade destroys story links

**Context:** Story 6 got silently delinked from its point on prod (2026-03-13 05:19 UTC). Forensic analysis: user toggled position off on feed card → `removePosition()` DELETE → cascade trigger `cascade_position_removal_to_story_points` fired → story_points row destroyed. Re-adding position doesn't restore the link. The detail page, profile page, and story-detail page all used `useRemovePositionGuard` (P401/P402) — but `feed-point-card.tsx` was the single unguarded path.
**Decision:** (1) Added `useRemovePositionGuard` to feed-point-card.tsx — now every removePosition call path in the app shows the confirmation dialog. (2) Removed `onPositionChange={fetchData}` from feed-page.tsx — optimistic state in feed-point-card already adjusts counts correctly; the full refetch caused a loading flash on every position click.
**Alternatives rejected:** (1) Remove the cascade trigger entirely — too risky, it protects data integrity for intentional removals. (2) Add a reverse trigger to restore links on re-add — complex, fragile, treats symptom not cause. (3) Skip dialog for 0-linked-stories on feed — guard always shows (profile warning path); consistent with detail page.
**Consequences:** No unguarded removePosition paths remain. Feed position changes are instant (optimistic). Any future surface rendering position buttons must use `useRemovePositionGuard` for toggle-off.
**References:** [feed-point-card.tsx](src/app/components/feed/feed-point-card.tsx), [remove-position-dialog.tsx](src/app/components/shared/remove-position-dialog.tsx), [feed-page.tsx](src/app/pages/feed-page.tsx)

## 2026-03-13 [process]: Worktree setup — resolve main repo via git, not dirname

**Context:** All npm/npx commands (vite, vitest, eslint, playwright) failed with exit code 194 in worktree w2. Root cause: `setup-worktree.sh` computed `MAIN_REPO` as `dirname "$0"/..` — when invoked from a worktree's copy of the script (agent CWD = worktree), `$0` resolved to the worktree's scripts/ directory, making `MAIN_REPO` = worktree root. This created a circular `node_modules` symlink (pointing to itself), causing node to find no packages.
**Decision:** Replace `dirname "$0"/..` with `git rev-parse --path-format=absolute --git-common-dir | dirname` — this always returns the main repo's `.git` directory regardless of invocation context. One-liner, no conditionals needed.
**Alternatives rejected:** (1) Document "always run from main repo" — fragile, agents forget. (2) Check if symlink is circular after creation — detection without prevention is backwards.
**Consequences:** `setup-worktree.sh` is now safe to invoke from any directory (main repo, worktree, or absolute path). No behavioral change when invoked correctly from main repo.
**References:** [setup-worktree.sh](scripts/setup-worktree.sh), [worktree-setup.md](docs/technical/worktree-setup.md)

## 2026-03-13 [product]: "X understood" pill always visible, even at zero

**Context:** The understood pill was inconsistent — embeds always showed it (using legacy `verificationCount`), but feed/profile/detail hid it when count was 0 (using `understoodCount`). Two field names, two display policies.
**Decision:** Always show the pill on all surfaces, even "0 understood". Unified field name to `understoodCount` everywhere. Legacy `verificationCount` eliminated from codebase.
**Alternatives rejected:** (1) Keep hiding at zero — rejected because "0 understood" is informative (story hasn't been verified yet, invites action). (2) Rename to `verificationCount` everywhere — rejected because `understoodCount` matches the DB column `understood_count` and the product language.
**Consequences:** Every story card now shows a count pill. Future surfaces don't need to add `> 0` guards. The prototype types (`prototypes/shared/types.ts`) now match production types.
**References:** [P501 spec](features/done/22_mar_26/p501_unify_understood_pill.md)

## 2026-03-13 [technical]: Blank page from missing env vars — accepted residual risk

**Context:** When `VITE_SUPABASE_URL` is undefined (missing `.env.local`), `supabase.ts` line 7 throws at ES module evaluation time — before `createRoot` or `root.render` execute. React error boundaries can't catch module-eval throws. Static imports are hoisted, so a pre-import check in `main.tsx` is structurally impossible without converting to dynamic `import()`. The only UI signal is a console error against a blank `<div id="root">`.
**Decision:** Accept residual risk. The `predev` npm hook covers the systematic path (worktrees via `npm run dev`). Uncovered paths (direct `vite`, fresh clone without `.env.local`) produce a clear console error and self-correct in <60 seconds. No additional code change.
**Alternatives rejected:** (1) Dev-only error banner in `main.tsx` — impossible with static imports; would require dynamic `import()` restructuring. (2) React error boundary — architecturally impossible; module-eval throws happen before React exists. (3) Converting `supabase.ts` throw to graceful fallback — would mask configuration errors in prod.
**Consequences:** Developers who bypass `npm run dev` will see a blank page with console error. This is an acceptable DX trade-off — the error message is clear, the fix is obvious (create `.env.local`), and the `predev` hook prevents the most common trigger.
**References:** `src/lib/supabase.ts` (line 7), `src/main.tsx` (static imports), `scripts/check-worktree-env.sh`

## 2026-03-13 [process]: Pre-commit hook must never mutate the git index

**Context:** During a `git commit` with 2 files staged, section 13c of `pre-commit-checks.sh` ran `git rm --cached` and `git rm` to auto-fix duplicate specs (files in both `features/` and `features/done/`). This mutated the index during the hook, deleted files from disk, and exited with warnings (not errors) — so git committed the wrong files. Required manual recovery via `git reflog`. Investigated via `/falsify`: P2 (stash/restore) FAILS because `git stash --keep-index` doesn't protect the index from `git rm --cached`; P3 (snapshot guard) is marginal — detects after disk damage already happened.
**Decision:** Replace `git rm` calls in section 13c with a hard error (`ERRORS++`) that prints the exact copy-pasteable fix command and blocks the commit. Pre-commit hooks must be read-only — no `git rm`, `git add`, `git mv`, or any index mutation. Also added `predev` npm hook (`scripts/check-worktree-env.sh`) to auto-detect worktrees missing `.env.local` and run `setup-worktree.sh`.
**Alternatives rejected:** `git stash --keep-index` isolation (doesn't protect index, only working tree). Index snapshot guard at end (detect-and-abort after damage). Removing section 13c entirely (still want the check, just not the auto-fix). Post-commit hook (can't block). CI-only check (too late for local dev).
**Consequences:** Commits with duplicate specs now fail with an actionable error instead of silently destroying files. Worktrees auto-heal on `npm run dev`. Rule: any future pre-commit check must be read-only — if it wants to fix something, print the command and block.
**References:** `scripts/pre-commit-checks.sh` (section 13c), `scripts/check-worktree-env.sh`, `scripts/setup-worktree.sh`

## 2026-03-13 [technical]: Profile fetch failure silently logs out users across 12+ pages

**Context:** Two-user /live flow: user B scans QR code, gets forced to re-login despite valid Supabase session. Root cause: `fetchProfileForUser` in `AuthContext.tsx` used `getProfile()` which flattens server errors and "not found" into the same `null`. On cold start (no cached profile in `previousUserRef`), a transient network error or 5xx → `user = null` → all 12+ pages that check `user` treat the user as logged out. Most failures are silent: forms render but submit does nothing, no error toast. The `previousUserRef` guard only protects warm sessions (profile loaded once already).
**Decision:** Switch from `getProfile()` to `getProfileResult()` (discriminated union: `not_found` vs `server_error`). Retry up to 3 attempts with 1s delay on `server_error`; immediate return on `not_found`. Added `useCallback` for stable function identity and `isMounted` guard to prevent state updates after unmount during retry delays.
**Alternatives rejected:** Adding retry at the `getProfile` level (would retry "not found" too). Adding a third auth state like `profileFetchFailed` (invasive — every consumer page would need updating). Retroactive unit test (closure inside AuthProvider makes direct testing involved; the logic is a simple retry loop covered by the type system).
**Consequences:** Transient Supabase errors add up to 2s latency (worst case) instead of false logout. `console.warn` fires on retry, `console.error` on final failure — visible in Sentry. Happy path (profile exists, no error) has zero delay. Pattern: always distinguish "not found" from "server error" in auth-critical paths.
**References:** [AuthContext.tsx](src/auth/AuthContext.tsx), [api.ts `getProfileResult`](src/app/data/api.ts)

## 2026-03-13 [process]: Agent verification failures — root cause analysis and E2E auth infra

**Context:** Analysis of 173 "can't verify" instances across 2 weeks (Feb 11 – Mar 12) revealed 67% trace to one root cause: agents lack authenticated browser sessions. Headless tools (Chrome DevTools MCP, Playwright) start fresh sessions without cookies. The only tool with real auth (Claude in Chrome) disconnects after ~5min (MV3 service worker timeout, upstream issues #26347/#27826). Secondary causes: two-user flows untestable (12 cases), chrome-extension:// URL errors (15 cases), subagent isolation (10 cases), macOS keychain (8 cases, already fixed).
**Decision:** Three-tier fix: (1) P496 `getTestAuthContext()` — programmatic auth bypass via Supabase Admin API + password sign-in + localStorage injection into Playwright BrowserContext. Tests use real user JWTs (not service_role), so RLS is exercised. (2) P497 multi-user fixtures (depends on P496). (3) P498 Playwright storageState for manual visual QA sessions. Also added `.claude/rules/browser.md` to prevent chrome-extension:// navigation.
**Alternatives rejected:** Waiting for Chrome extension MV3 fix (unknown timeline, external dependency). Mocking auth (defeats purpose — RLS wouldn't be tested). Expanding manual QA (doesn't scale, 67% of failures would persist).
**Consequences:** Agents can now create authenticated browser sessions in E2E tests (5/5 smoke tests passing). P497/P498 in backlog for multi-user and visual QA coverage. Browser URL guard eliminates 9% of failures immediately.
**References:** [auth-context.ts](e2e/helpers/auth-context.ts), [browser.md](.claude/rules/browser.md), P496/P497/P498 specs

## 2026-03-12 [process]: Terms version bump must be enforced mechanically, not by memory

**Context:** ToS was materially updated on 2026-03-04 (Gemini AI processing, partner agreements, story visibility) but `CURRENT_TERMS_VERSION` was never bumped from `v1.0`. Users who accepted before the update were never re-prompted — a legal compliance gap. Root cause: the `/tos-review` skill didn't include a version bump step, and no pre-commit check caught the drift.
**Decision:** Three-layer enforcement: (1) `/tos-review` skill Stage 7b — mandatory version bump step, (2) pre-commit check in `scripts/pre-commit-checks.sh` — warns if `tos.md` or `copy.ts` changes without `constants.ts`, (3) unit test in `consent-api.test.ts` hardcodes expected version. Bumped to `v1.1`.
**Alternatives rejected:** Manual discipline alone (already failed once). Automated version derivation from git hash (too opaque for legal audits — need human-readable version).
**Consequences:** Next ToS update will trigger warnings at skill, pre-commit, and test levels. Version must be bumped explicitly, which creates a clear audit trail.
**References:** [constants.ts](src/lib/constants.ts), [tos-review skill](.claude/commands/slava/maintain/tos-review/SKILL.md), [pre-commit-checks.sh](scripts/pre-commit-checks.sh)

## 2026-03-12 [technical]: Google OAuth — use `select_account` not `consent` prompt

**Context:** Google sign-in was noticeably slow. Root cause: `prompt: 'consent'` in `signInWithGoogle()` forced the full Google permissions consent screen on every login, even for returning users. Combined with `access_type: 'offline'` (requests refresh token, unnecessary for client-side SPA).
**Decision:** Changed to `prompt: 'select_account'` (account picker only, skips consent if already granted) and removed `access_type: 'offline'`. Also scoped the `/live` user migration check to `isLiveRegistration` only (saves a DB query for 90%+ of OAuth flows).
**Alternatives rejected:** Removing `prompt` entirely (would auto-select single-account users but confusing for multi-account). Keeping `access_type: 'offline'` (no server-side token refresh needed).
**Consequences:** Returning Google users see account picker only (faster). First-time users still see consent once (automatic). Avatar fetching still works (profile scope granted on first consent).
**References:** [api.ts signInWithGoogle](src/app/data/api.ts), [AuthCallbackPage.tsx](src/auth/AuthCallbackPage.tsx)

## 2026-03-12 [technical]: CTA visibility must use shouldShowStoryCTA utility — never inline conditions

**Context:** P494 found two "Tell your story →" CTA blocks (in `point-detail-page.tsx` and `point-card-with-links.tsx`) with inverted visibility logic — showing for anonymous users (`!user`) instead of authenticated users with a position and no story. Root cause: P458 added these as anonymous signup nudges. When the product intent changed (CTA only for auth + position + no story), correct blocks were added alongside but the P458 blocks were never removed. The `shouldShowStoryCTA` utility in `types.ts` already enforces the correct three-condition gate and is used by `live-story-card-expanded.tsx`, but the two oldest surfaces predated it.
**Decision:** All "Tell your story" / story CTA visibility must go through the `shouldShowStoryCTA` utility (or its equivalent conditions). Never add inline `!user` or `!currentUserId` checks for CTA rendering — the utility is the single source of truth for the three-condition gate (logged in + position set + no existing story).
**Alternatives rejected:** Keeping the anonymous CTA as a signup nudge (confusing UX — user can't write a story without logging in, so the CTA creates a dead-end experience).
**Consequences:** When iterating on the same UI surface across multiple features (P451→P456→P458→P465→P487→P494), old conditional blocks can survive with stale or inverted logic. Pattern to watch: after changing CTA intent, grep for ALL surfaces showing the old CTA text and verify conditions on each.
**References:** `src/app/prototypes/shared/types.ts` (shouldShowStoryCTA), P458, P494

## 2026-03-12 [technical]: Polling drift check must cover all mutable live state fields

**Context:** P490 discovered that guest positions weren't syncing to the host because `livePositions` was missing from the polling drift check in `clarity-live-page.tsx`. The drift check compares 14+ fields between server and local state — any omission silently breaks sync for that field.
**Decision:** When adding new mutable fields to live session state, always add a corresponding drift comparison (JSON.stringify for objects/arrays, direct comparison for primitives) AND include it in the `serverHasUpdate` OR chain AND add it to Mixpanel analytics. The `celebrationAcknowledgedBy` pattern (JSON.stringify comparison) is the template for object fields.
**Alternatives rejected:** Replacing granular drift checks with a full-state hash (loses per-field analytics and makes debugging harder).
**Consequences:** New live state fields require a 3-point checklist: (1) drift variable, (2) OR chain inclusion, (3) analytics label.
**References:** [clarity-live-page.tsx](src/app/pages/clarity-live-page.tsx) ~line 791

## 2026-03-12 [process]: skipMicCheck URL param for browser automation of /live sessions

**Context:** `/verify` browser automation couldn't complete two-party /live session testing because `navigator.mediaDevices.getUserMedia()` triggers a native Chrome permission dialog that no MCP tool can dismiss. The mic check gates session entry via two code paths: `completeJoin()` (guest join flow) and `gateMicAndGoLive()` (authenticated user direct navigation).
**Decision:** Added `?skipMicCheck=true` URL param that bypasses both mic gates. This follows the same pattern as `joinSessionIsPrivate` (P160 private sessions already skip mic). Not a security concern — mic is for UX quality, not access control.
**Alternatives rejected:** Chrome DevTools `Browser.grantPermissions` (not exposed via MCP tools). Mocking `getUserMedia` globally (affects real audio recording). E2E tests already mock it differently.
**Consequences:** `/verify` skill's two-party boot macro should always append `?skipMicCheck=true` to both host and guest URLs.
**References:** [clarity-live-page.tsx](src/app/pages/clarity-live-page.tsx)

## 2026-03-12 [product]: Feed is the authenticated home page, auth default redirect → /feed

**Context:** P491 Hashtag Feed introduced `/feed` as the public discovery surface. With feed as the primary content page, authenticated users landing on `/events` post-login felt wrong — events are secondary to the content discovery loop.
**Decision:** (1) HomeRedirect sends authenticated+verified users from `/` to `/feed`. (2) AuthCallbackPage default redirect changed from `/events` to `/feed`. Both changes ensure feed is the first thing users see. History (sessions) moved to dropdown menu.
**Alternatives rejected:** Keep `/events` as post-login default (breaks mental model of feed-as-home). Redirect to `/sessions` (too narrow — sessions are a subset of activity).
**Consequences:** All login flows (magic link, Google, pledge signup) now land on `/feed`. Any feature that relied on post-login landing on `/events` needs updating. Auth flow tests updated to expect `/feed`.
**References:** [AuthCallbackPage.tsx](src/auth/AuthCallbackPage.tsx), [App.tsx](src/App.tsx)

## 2026-03-12 [product]: Tag pills render between text and action buttons, never below

**Context:** Initial implementation placed tag pills below position buttons (Disagree/Unsure/Agree) on feed point cards. User feedback: tags are metadata about the content, not a response to it — they belong with the text.
**Decision:** Tag pills always render immediately after the content text, before any interactive elements (position buttons, CTAs). Order: text → tags → actions.
**Alternatives rejected:** Tags below actions (original — wrong visual hierarchy). Tags inline in text (Twitter-style — considered, but pills are clickable navigation elements, not inline content).
**Consequences:** Applied to FeedPointCard. StoryCards already had correct order (no position buttons). Establishes pattern for any future card type.
**References:** [feed-point-card.tsx](src/app/components/feed/feed-point-card.tsx)

## 2026-03-12 [technical]: Tag ownership — cards show only their own entity's tags

**Context:** Points and stories each have independent `tags[]` columns. When a point links to a story, should the point card show the story's tags too? Initial prototype leaked story tags onto point cards.
**Decision:** Each card renders only its own entity's `tags[]`. A point card shows `point.tags`, a story card shows `story.tags`. No inheritance or aggregation across linked entities. The tag cloud on the feed page aggregates from all visible content.
**Alternatives rejected:** Merge linked entity tags (confusing — user sees tags they didn't set on this entity). Show all tags but visually distinguish source (overengineered for current use case).
**Consequences:** `StoryCardWithLinks` accepts `tags` as a separate prop because its internal Story type lacks `tags`. The caller must pass `story.tags` explicitly.
**References:** [point-detail-page.tsx](src/app/pages/point-detail-page.tsx), [story-card-with-links.tsx](src/app/components/social/story-card-with-links.tsx)

## 2026-03-12 [process]: Git infrastructure pruning — keep worktrees, remove dead weight

**Context:** Analyzed all 19 git/worktree decisions from Feb 25 - Mar 9. Found: 8/19 solved the same isolation need (converging on worktrees), 5 pre-commit sections were overhead, 3 active failures existed (push bypass left on, pre-commit symlink into worktree, stale `.expected-branch`). Ran /falsify on "radical simplify" (drop worktrees) — failed because branch-only was already tried Mar 3-7 and failed within 10 days.

**Decision:** Keep worktree system (proven structural isolation for AI agents). Prune 5 overhead items: pre-commit sections 1.5 (conditional UI grep heuristic), 1.8 (no-op placeholder), 15 (sweep done/ — maintenance in commit path), 20 (UAT naming convention). Remove redundant `claude-md-gate.sh` PostToolUse hook (PreToolUse gate already blocks). Add auto-expire (10 min) to `push-enable` alias to prevent the "left bypass on" failure. Fix pre-commit symlink to point to main repo, not worktree.

**Alternatives rejected:** (A) Drop worktrees entirely — branch-only experiment failed in 10 days (P487 shipped untested, P488 cross-contaminated P483). (B) Learn git/Cursor instead — user's knowledge gap is only staging; the infrastructure exists for AI agents, not the user. (C) Keep everything as-is — 3 active failures prove the system was silently degrading.

**Consequences:** Pre-commit is faster (4 fewer sections). Push-enable auto-expires, preventing accidental bypass. Pre-commit symlink survives worktree removal. The git infrastructure is now: essentials (pre-push hook, pre-commit checks, worktrees, `.claude/rules/git.md`) + helpful warnings (console.log, TODOs, secrets, privacy). No overhead.

**References:** `scripts/pre-commit-checks.sh`, `.claude/settings.json`, `~/.zshrc` (push-enable alias)

---

## 2026-03-12 [technical]: Reject Clean Architecture migration — no evidence of layer-caused bugs

**Context:** External recommendation to adopt Clean Architecture (entities → use cases → interface adapters → frameworks) for "stability." Ran structured falsification: root-cause analysis of all real bugs (Jan–Mar 2026), independent critique, and simulation of each bug class under proposed architecture.
**Decision:** Do not migrate. The codebase already has a service abstraction layer (interface → real → mock) for actively-changing domains (stories, points, events, calibration, agreements). Legacy `api.ts` (90+ functions, stable, low change rate) stays as-is. Migrate individual functions via strangler fig pattern only when they need modification.
**Evidence:** 1,597 commits analyzed. 598 "fix" commits — ~60% UI polish, ~20% tooling, ~10% docs, ~10% real logic bugs. The 3 real bug classes (position sync across surfaces, missing adapter properties, null safety) were simulated under Clean Architecture — all 3 persist because they're function-body errors and state coordination problems, not layer boundary failures. Zero bugs in 90 days caused by missing architectural layers.
**Alternatives rejected:** (1) Full Clean Architecture migration — 2–4 weeks effort, adds ongoing complexity tax (more files per feature), no measurable bug prevention. (2) Partial migration of api.ts into use cases — same cost/benefit problem for stable code.
**Consequences:** Continue current two-tier pattern. Address actual root causes with targeted fixes when they surface (shared position cache for state sync, explicit return types on mappers for missing-property bugs). Revisit layering only if team grows or infrastructure swap is needed.
**References:** [Falsification report](https://ladischenski.com/temp/clean-architecture-falsification.html), [architecture.md](technical/architecture.md)

## 2026-03-12 [product]: PWA install surfaces are mobile-only — hide all on desktop

**Context:** P493 added three PWA install surfaces (settings card, session-end banner, celebration link). Desktop users don't install web apps to home screens. Two surfaces already had `isDesktop` guards, but the settings card was missing one — and even after adding it, the parent "App" section heading in `settings-page.tsx` remained visible as an orphan.
**Decision:** All PWA install UI returns `null` on desktop via `isDesktop` from `usePwaInstall()`. Parent wrappers that render section headings around PWA components must also be guarded — a child returning `null` doesn't hide its parent's heading/container.
**Alternatives rejected:** (1) CSS `display:none` on desktop — keeps DOM weight. (2) Only guard at the component level — leaves orphaned headings.
**Consequences:** Any future PWA surface must include `isDesktop` guard. Settings page wraps the "App" section in `{!isDesktop && (...)}` for defense in depth.
**References:** [install-card.tsx](../src/app/components/pwa/install-card.tsx), [settings-page.tsx](../src/app/pages/settings-page.tsx)

## 2026-03-12 [process]: Auth-dependent UATs must have E2E coverage — not manual-only

**Context:** P491 had 14 UAT scenarios. `/generate-tests` produced E2E specs that only covered anonymous flows. 4 auth-dependent UATs (home redirect, bottom nav, menu relocation) were left as "manual testing" despite `e2e/helpers/test-user.ts` providing `createTestUser()`, `setTestSession()`, and `deleteTestUser()` since P405. This pattern recurred across features — auth UATs accumulated as untested debt.

**Decision:** Added "Auth E2E Coverage Rule" to `.claude/rules/tests.md`. Auth-dependent UATs must use `setTestSession()` in E2E specs. Only exception: scenarios requiring infrastructure that doesn't exist (e.g., two-party `/live` session fixtures). The rule auto-loads for all test file edits, so both `/generate-tests` subagents and `/dev` see it.

**Alternatives rejected:** (A) Playwright `globalSetup` + `storageState` pattern — unnecessary; the per-test `setTestSession()` helper already exists and is simpler (no shared state file, no auth project dependency). (B) Adding the rule only to `/generate-tests` skill — too narrow; `/dev` also writes tests and would miss it.

**Consequences:** Future features with auth UATs will get E2E coverage automatically. The 3 P491 auth tests (UAT-7, 9, 10) were written in 30 minutes using existing helpers — proving the infra was never the bottleneck, just the instruction to use it.

**References:** `.claude/rules/tests.md`, `e2e/helpers/test-user.ts`, `e2e/p491-hashtag-feed.spec.ts`

---

## 2026-03-11 [process]: Plan mode is complementary to PRD pipeline — no compaction fix needed

**Context:** Investigated whether Claude Code's built-in plan mode should replace the custom PRD pipeline (`/create-prd → /pick-flow → /dev`), and whether PRD spec content could be made to survive context compaction via hook injection.

**Decision:** Keep current PRD pipeline as-is. Plan mode is complementary (useful for exploratory pre-work on unfamiliar code), not a replacement. Accept occasional manual "re-read features/pN.md" as the lean path when compaction hits during medium-tier `/dev` runs. Every proposed compaction fix failed `/falsify` — the problem isn't worth the machinery.

**Alternatives rejected:** (A) CLAUDE.md instruction to auto-reload specs — soft prompt, not executable trigger; compact hook in `.claude/settings.json` already has a reorientation message doing exactly this. (B) Always decompose medium work — `/decompose` threshold (files < 5, concerns < 3, steps < 6) rejects medium work by design. (C) Use plan mode for medium tier — CLAUDE.md forbids spec content in plan artifacts. (D) Active-spec pointer file — worktree collision on shared `.claude/.active-spec`, stale state risk. (E) Branch-name derivation hook — `$CLAUDE_PROJECT_DIR` always points to main repo root (sees `main`, not worktree branch); `grep -oP` broken on macOS (BSD grep).

**Consequences:** No workflow changes. PRD pipeline retains persistence, git tracking, and multi-agent coordination that plan mode lacks. If compaction pain recurs frequently on medium work, revisit worktree-local pointer (least-bad mechanical option). Key technical findings: compact hook runs from `$CLAUDE_PROJECT_DIR` (main root, not worktree); spec sizes up to 678 lines / 50KB make full-spec injection counterproductive; `/decompose` + subagents already solve compaction for complex work.

**References:** `.claude/settings.json` (compact hook), `.claude/commands/slava/build/decompose.md` (threshold gate), `docs/technical/worktree-setup.md`

---

## 2026-03-10 [technical]: SW precache blocks iframe embeds — skipWaiting + clientsClaim required

**Context:** Point embeds in Ghost blog (iframe `src="claritypledge.com/point/:id?embed=true"`) showed "refused to connect" despite correct Vercel CSP headers (`frame-ancestors 'self' https://blog.claritypledge.com`). Root cause: the Vite PWA service worker's `navigateFallback: '/index.html'` serves a precached copy of `/index.html` for all navigation requests — including iframe navigations. The precached response carries the old `X-Frame-Options: DENY` header from before the CSP deploy. Chrome enforces DENY and blocks the embed. Proof: unregistering the SW → embed renders immediately.

**Decision:** Add `skipWaiting: true` and `clientsClaim: true` to the workbox config in `vite.config.ts`. This forces the new SW to activate immediately on next page visit, re-caching `/index.html` from Vercel CDN with correct headers. Combined with the Vercel header changes: catch-all `/(.*)`  sets `X-Frame-Options: DENY`, then `/point/(.*)` and `/story/(.*)` override with `X-Frame-Options: ALLOW-FROM` + CSP `frame-ancestors`. Vercel applies last-match-wins for duplicate header keys — specific rules MUST come after the catch-all.

**Alternatives rejected:** (A) Remove SW navigate fallback entirely — breaks offline capability. (B) Add `?embed=true` to `navigateFallbackDenylist` — denylist tests pathname only, not query string; wouldn't match. (C) Use `/embed/point/:id` path prefix to bypass SW — adds route complexity for a one-time cache issue.

**Consequences:** All future Vercel header changes affecting `/index.html` will take effect only after the SW re-caches. With `skipWaiting: true`, this happens on next page visit. Without it, users must close all tabs first. The `skipWaiting` trade-off (mid-session SW swap) is acceptable for an SPA with no critical offline state.

**References:** `vercel.json` (headers section), `vite.config.ts` (workbox config)

---

## 2026-03-10 [technical]: Ghost HTML cards render iframes via Lexical `type: "html"` nodes

**Context:** Needed to embed interactive point widgets from claritypledge.com inside Ghost blog posts. Ghost uses Lexical editor format. The Ghost Admin API accepts Lexical JSON with `type: "html"` nodes that render raw HTML in the published post.

**Decision:** Use Ghost Lexical HTML cards for point embeds. Format: `{"type":"html","html":"<iframe src=\"...\">","version":1}`. This renders as `<!--kg-card-begin: html-->..<!--kg-card-end: html-->` in the published HTML. Embed URLs use full UUIDs (not short prefixes — the app requires full UUID for the `/point/:id` route).

**Alternatives rejected:** (A) Ghost bookmark cards — can't embed interactive content. (B) Ghost embed/oembed cards — claritypledge.com doesn't implement oembed. (C) Ghost code injection — per-post injection not supported, only global.

**Consequences:** Article a8 will use 7 HTML card iframes. Each needs the full point UUID. The embed currently shows the full page (header, nav, back button) — a future enhancement should strip layout when `?embed=true` is set.

**References:** `content/articles/a8_seven-points-understanding.md` (embed codes), Ghost draft ID `69b0017d2d7b0e00017efe69`

---

## 2026-03-10 [product]: 7-point framework replaces 8-point — executed on prod

**Context:** Previous session (2026-03-09) planned an "8-point framework" refresh. During spec finalization, the framework was refined to 7 points + 7 stories. Old Points 3 and 4 merged into new Point 2. Result: 5 existing stories updated, 2 new stories inserted, 5 existing points rewritten, 2 new points inserted, 4 orphan points deleted.

**Decision:** Execute as single idempotent SQL migration using `INSERT ... ON CONFLICT DO UPDATE` — same script runs on both test (empty) and prod (has existing data). Triggers disabled via `SET session_replication_role = replica` with manual `story_versions` inserts. Backup taken before execution.

**Alternatives rejected:** (A) Separate test/prod scripts — doubles maintenance, prod script wouldn't be the one actually tested. (B) Wipe-and-reinsert on prod — unnecessarily destructive, loses created_at timestamps and version history. (C) Application-level migration via API — slower, RLS complications.

**Consequences:** Prod now has clean 7/7/7/7 (stories/points/links/positions). The `ON CONFLICT DO UPDATE` pattern is proven for future content refreshes.

**References:** `scripts/archive/migrations/20260310-points-stories-refresh.sql`, `.private/backup-prod-20260310.sql`

---

## 2026-03-10 [technical]: Content migration guardrails added to database rules

**Context:** During the 7-point migration, several errors occurred: forgot to insert positions for all 7 points (only did 2 new ones), used `visibility` column without verifying it existed in schema, tried wrong pooler region, couldn't verify on test because synthetic profile had no auth.users entry. Root cause analysis showed these are information-gathering failures and missing pre-flight checks.

**Decision:** Added Content Migration Checklist to `.claude/rules/database.md` (auto-loads when editing `supabase/`). Covers: auth.users pre-flight check, connection string from config (not manual), child row enumeration (story_versions, story_points, point_positions), idempotent ON CONFLICT pattern, live schema verification before writing INSERTs. Deferred building a mechanical solution (DB function) until next migration proves the advisory checklist insufficient.

**Alternatives rejected:** (A) Full JS/TS migration script — overengineered for quarterly frequency, maintenance cost exceeds error cost. (B) `/content-migrate` skill — checklist-as-skill is still advisory, adds invocation overhead. (C) Documentation-only playbook — rots faster than rules files, agent already has too many docs.

**Consequences:** Next content migration will auto-load the checklist. If same errors recur, escalate to mechanical solution (DB function `create_story_with_children(jsonb)`).

**References:** `.claude/rules/database.md`

---

## 2026-03-10 [product]: Points are editable by author pre-discourse — immutability applies after others stake positions

**Context:** `definitions.md` stated "Points are immutable shared objects." This session directly rewrote 5 existing point statements via SQL. No other users had staked positions (0 external positions, 0 verifications). The immutability rule was designed to protect discourse integrity.

**Decision:** Clarify: Points become immutable once external users have staked positions. Before that, the author can freely edit.

**Alternatives rejected:** (A) Treat all points as immutable from creation — forces "delete and recreate" even for typo fixes with no external impact. (B) Allow edits always with a "changed" flag — undermines position integrity.

**Consequences:** `definitions.md` updated. Future point edits by the author are safe as long as no external positions exist.

**References:** `docs/definitions.md` "Stories vs Points" section

---

## 2026-03-10 [process]: Git-native kanban validated — no migration to cloud tools

**Context:** Questioned whether the custom kanban (`tools/kanban/`, ~3,800 LOC) is worth maintaining vs. switching to Notion MCP, Linear MCP, or an off-the-shelf tool (Backlog.md, Vibe Kanban, TaskMaster AI). Deep research (28 sources) and full capability audit of the kanban codebase.

**Decision:** Keep the git-native kanban as-is. No feature spec for improvements. The tool works, has no blocking problems, and the maintenance cost is lower than the token/latency overhead of cloud MCP alternatives. Improvement opportunities (agent summary endpoint, MCP server wrapper, board filtering, file watcher) are documented in `docs/technical/kanban.md` for when real friction surfaces — not proactively built.

**Alternatives rejected:** (A) Switch to Notion MCP — 500-1000 token overhead per query, 180 req/min rate limit, network dependency, vendor lock-in. Makes sense only when non-technical collaborators need project visibility. (B) Extract as open-source tool — kanban is more feature-complete than competitors (Focus/Goals/Content views, delivery stages, worktree-aware) but packaging/community work directly competes with ClarityPledge product time. (C) Freeze UI, go headless — removes the visual board which is actually used for drag-and-drop prioritization.

**Consequences:** Kanban doc (`docs/technical/kanban.md`) now includes rationale, landscape comparison, and improvement roadmap. Future sessions can reference this instead of re-analyzing. Cloud tools re-evaluated only when a co-founder/advisor needs project visibility. Industry context: Manus, OpenClaw, and Claude Code all independently converged on the same markdown-in-git pattern — the approach is validated beyond this project.

**References:** [docs/technical/kanban.md](technical/kanban.md), research report saved to `~/Documents/AI_Agent_Task_Management_Research_20260310/`

---

## 2026-03-10 [product]: 7-point framework replaces 8-point — executed on prod

**Context:** Previous session (2026-03-09) planned an "8-point framework" refresh. During spec finalization, the framework was refined to 7 points + 7 stories. Old Points 3 and 4 merged into new Point 2. One planned new point (old "Point 4: cognitive understanding precedes genuine agreement") was absorbed into the merged Point 2. Result: 5 existing stories updated, 2 new stories inserted, 5 existing points rewritten, 2 new points inserted, 4 orphan points deleted.

**Decision:** Execute as single idempotent SQL migration using `INSERT ... ON CONFLICT DO UPDATE` — same script runs on both test (empty) and prod (has existing data). Triggers disabled via `SET session_replication_role = replica` with manual `story_versions` inserts. Backup taken before execution.

**Alternatives rejected:** (A) Separate test/prod scripts — doubles maintenance, prod script wouldn't be the one actually tested. (B) Wipe-and-reinsert on prod — unnecessarily destructive, loses created_at timestamps and version history for unchanged content. (C) Application-level migration via API — slower, RLS complications, harder to verify atomicity.

**Consequences:** Prod now has clean 7/7/7/7 (stories/points/links/positions). The `ON CONFLICT DO UPDATE` pattern is proven for future content refreshes. Previous decisions.md entry (2026-03-09) references "8-point framework" — that was the plan; this is the execution at 7 points.

**References:** `scripts/archive/migrations/20260310-points-stories-refresh.sql`, `pp/docs/business/points-stories-update-spec.md`, `.private/backup-prod-20260310.sql`

---

## 2026-03-10 [technical]: Idempotent data migration pattern — INSERT ON CONFLICT for cross-environment content updates

**Context:** Needed to run the same migration on test (empty tables) and prod (existing data). Test DB has different user UUIDs and no matching stories/points. Writing separate scripts per environment means the prod script isn't actually tested.

**Decision:** Use `INSERT ... ON CONFLICT (id) DO UPDATE SET` for all upserts. Same SQL, both environments. For stories: conflict on PK updates content/tags and increments `current_version`. For points: conflict on PK updates statement/tags. For story_points/positions: `ON CONFLICT DO NOTHING` (links are idempotent). Triggers disabled with `session_replication_role = replica` — requires manual `story_versions` inserts using `COALESCE(MAX(version_number), 0) + 1` for version numbering. Re-running the script is safe (idempotent) but creates additional story_versions rows on each run.

**Alternatives rejected:** (A) `UPDATE WHERE id = ...` for existing + `INSERT` for new — not testable on empty DB. (B) Truncate + reinsert — loses version history, breaks any future FK references.

**Consequences:** Pattern is reusable for any future content refresh. The `session_replication_role` approach bypasses RLS and triggers in one setting — cleaner than per-table policy changes. Caveat: re-runs create duplicate story_versions (harmless but noisy).

**References:** `scripts/archive/migrations/20260310-points-stories-refresh.sql`

---

## 2026-03-10 [product]: Points are editable by author pre-discourse — immutability applies after others stake positions

**Context:** `definitions.md` states "Points are immutable shared objects. Once a Point exists and others have staked positions on it, it cannot be edited." This session directly rewrote 5 existing point statements via SQL. No other users had staked positions on any of these points (0 external positions, 0 verifications). The immutability rule was designed to protect discourse integrity — other people's positions would become invalid if the point they agreed with changes underneath them.

**Decision:** Clarify the immutability rule: Points become immutable once external users have staked positions. Before that (single-author, no external positions), the author can freely edit. This matches how early-stage content works — the author iterates until the first external engagement locks it.

**Alternatives rejected:** (A) Treat all points as immutable from creation — forces "delete and recreate" even for typo fixes with no external impact. (B) Allow edits always with a "changed" flag — undermines position integrity.

**Consequences:** Update `definitions.md` to clarify the immutability boundary. Future point edits by the author are safe as long as no external positions exist. Once a single external position is staked, the point locks.

**References:** `docs/definitions.md` "Stories vs Points" section

---

## 2026-03-09 [technical]: DB backup/restore — local pg_dump capability and tested restore pipeline

**Context:** Needed to wipe and replace prod stories/points data (8-point framework refresh). No local pg_dump/psql existed, and the daily GCS backup (`.github/workflows/db-backup.yml`) had never been restore-tested. Needed confidence that data could be recovered before any destructive operation.

**Decision:** (1) Install `libpq` via Homebrew for local `pg_dump`/`psql` (`/opt/homebrew/opt/libpq/bin/`, keg-only). (2) Use session pooler (port 5432) for pg_dump — transaction pooler (6543) doesn't work. Region-specific hostnames: test=`aws-1-ap-northeast-1`, prod=`aws-1-ap-southeast-1`. (3) Restore requires `SET session_replication_role = replica` to disable triggers — without this, triggers like `create_initial_story_version` fire during INSERT and fail on FK ordering. (4) Before any destructive DB operation: pg_dump the affected tables to `.private/`, plus keep the self-contained spec with full text of old data for agent-readable comparison.

**Alternatives rejected:** Testing via GCS download (gsutil needs interactive re-auth — blocked in non-interactive sessions). SELECT-based backup only (works for small data but doesn't prove the real pipeline). Skipping restore test ("it's only 15 rows" — true now but establishes bad habit).

**Consequences:** Restore pipeline is proven end-to-end on test DB. Future destructive operations have a 2-step safety: (1) pg_dump snapshot, (2) daily GCS backup as independent fallback. The trigger-disable pattern is required for any table with INSERT triggers.

**References:** `.private/backup-prod-20260309.sql`, `.private/docs/points-stories-refresh.md`, MEMORY.md "DB Backup & Restore"

---

## 2026-03-09 [product]: Points/stories refresh — wipe and re-enter 8-point framework

**Context:** Prod had 5 untitled stories and 9 points (4 orphans, 3 near-duplicates) — all by Slava, 0 other users, 0 verifications. The 8-point framework (developed through falsification session with Sergej) represents a significant upgrade: cleaner formulations, intellectual lineage, two new points (stories/points distinction, common knowledge reflexivity). Old data is messy iteration artifacts, not deliberate content.

**Decision:** Wipe all stories, points, story_points, point_positions on prod and re-enter the 8-point framework from the spec (`.private/docs/points-stories-refresh.md`). Each point gets one story containing: personal narrative + "Standing on" (intellectual lineage) + "Where ClarityPledge goes beyond" (contribution). Stories get proper titles. Context lives inside story content (approach A — long stories), not in separate tables or comments.

**Alternatives rejected:** (A) Edit existing rows in-place — messy IDs, orphan cleanup, version history would show discontinuity. (B) Multiple stories per point for context separation — adds complexity for no current user benefit, schema supports it if needed later. (C) New "context" field on points — schema change for a problem long story content already solves. (D) Keep old data alongside new — noise with no value.

**Consequences:** Prod starts clean with authoritative 8-point content. Same content serves both intellectual/challenger audience and co-founder pairs — context (lineage) is inline, not audience-segmented. Point editing feature not needed yet (single author, direct SQL). Spec preserves full old data text for comparison.

**References:** `.private/docs/points-stories-refresh.md`, `.private/backup-prod-20260309.sql`

---

## 2026-03-09 [technical]: Position count display — three-surface bug class from optimistic-update mismatches

**Context:** Position counts were broken across 3 surfaces: (1) PointCardWithLinks zeroed intensity positions (`strongly_agree: 0`) instead of spreading `baseCounts`, discarding DB-fetched granular counts. (2) Profile QuotedPointCard always added +1 for user's position on top of DB counts (which already include the user), causing double-counting. (3) StoryCardDetail and profile QuotedPointCard passed `compact` to PositionButtons, hiding counts entirely. Third recurrence of position-count bugs (see P155 in done-features INDEX).

**Decision:** (1) `PointCardWithLinks`: replace hardcoded zeros with `{ ...baseCounts }` spread. (2) `profile-page-v2` QuotedPointCard: track `initialPosition` from server — only adjust counts optimistically when position *changes* from server-known value. (3) Remove `compact` from PositionButtons in profile QuotedPointCard and StoryCardDetail QuotedPoint.

**Alternatives rejected:** Re-fetching counts on every position change (unnecessary network call — optimistic update is correct pattern when done right). Adding a `positionCountsIncludeUser` flag (adds indirection for something that should be a convention).

**Consequences:** Convention: DB counts always include the user's own position — optimistic adjustment subtracts old group + adds new group only on *change*. `compact` should not be used on PositionButtons when counts are the primary information (acceptable only in truly space-constrained contexts like inline mentions). Pattern to watch: any component that copies a subset of `SevenPointCounts` fields instead of spreading the full object will zero the omitted intensity positions.

**References:** `src/app/components/social/point-card-with-links.tsx`, `src/app/pages/profile-page-v2.tsx`, `src/app/components/social/StoryCardDetail.tsx`, P155 (prior position count bug)

---

## 2026-03-09 [process]: /dev executes pre-deploy checklist; /screenshot-debug traces backend + checks ACTION_NEEDED

**Context:** P489 had three prod-readiness failures discovered sequentially (edge function not deployed, secret missing, migration not applied) despite a Pre-deploy Checklist existing in the spec. Root cause: `/dev` never read or executed the checklist; `/ship` only asked "have you done this?" after the fact. Separately, `/screenshot-debug` anchored on frontend-only trace for a backend STORAGE_ERROR, and re-attempted known-broken Claude in Chrome extension.

**Decision:** (1) `/dev` step 9.7: execute Pre-deploy Checklist items before UAT gate — mechanical, catches at implementation time. (2) `/screenshot-debug` Step 3 trace expanded: "Props → state → service → edge functions → storage → DB" with instruction to check server responses directly. (3) `/screenshot-debug` fallback chain: check MEMORY.md ACTION_NEEDED items before attempting browser tools — data-driven, self-corrects when tools are fixed.

**Alternatives rejected:** Adding an `Environments:` field to decisions.md template — overhead for every decision to fix a deployment problem. Adding `incomplete-deployment` category to KDD subagent — too narrow; the real fix is executing the checklist. Session-level state tracking for broken tools — machinery for something a MEMORY.md check handles.

**Consequences:** `/dev` now provisions infrastructure during implementation, not after. Screenshot debugging traces through the full stack. Browser tool fallback is data-driven from MEMORY.md.

**References:** `.claude/commands/slava/build/dev.md` (step 9.7), `.claude/commands/slava/build/screenshot-debug.md` (Step 3, fallback chain)

---

## 2026-03-09 [process]: Worktree merge guard — block /ship on dirty working tree

**Context:** P458 `/review-all` applied fixes to worktree files but the merge to main happened before they were committed. The review fixes became orphaned — discovered only after worktree cleanup when `git diff` showed 3 modified files, 2 of which were already on main from other commits. Copying whole files from the diverged worktree to main reverted unrelated changes.

**Decision:** (1) `/ship` step 2 now runs `git status --short` and blocks merge if uncommitted changes exist — prompts commit/discard/abort. (2) `/kdd` step 1 adds an already-captured check: scan recent commits with `git show` before proposing doc updates, preventing duplicate work after context compaction.

**Alternatives rejected:** Relying on discipline (existing MEMORY.md rule about post-compaction git status was already ignored this session). Adding guidance without mechanical checks (same class of fix that failed).

**Consequences:** `/ship` will catch orphaned review fixes before they're lost. `/kdd` won't waste cycles re-committing already-captured knowledge. Both are mechanical — no future discipline required.

**References:** `.claude/commands/slava/build/ship.md` (step 2), `.claude/commands/slava/maintain/kdd/SKILL.md` (step 1)

---

## 2026-03-09 [technical]: Story-detail CTA suppression — re-inject excluded current story for viewerStoryCount

**Context:** `getStoriesForPoints(pointIds, storyId)` deliberately excludes the current story from `linkedStoriesForPoints` to avoid self-reference in the linked-stories expansion. But `QuotedPoint` reuses that same map to compute `viewerStoryCount` for CTA suppression ("Add your story →" should hide when viewer already has a story for that point). When the viewer's only story for a point IS the current story being viewed, the count was 0 and the CTA incorrectly appeared. This is the same class of bug as the other-profile viewerStoryCount fix (2026-03-08 entry below) — a query scoped for one purpose being reused for CTA logic where the scope doesn't match.

**Decision:** When `viewerIsAuthor`, re-inject `data` (the current story) into `linkedStoriesForPoints` for each linked point before setting state. This keeps the exclusion intact for the linked-stories UI while providing accurate counts for CTA suppression.

**Alternatives rejected:** (1) Remove the exclusion from the query — would show the current story in its own linked-stories list (confusing UX). (2) Separate query for viewerStoryCount — unnecessary network call when the data is already available locally.

**Consequences:** Pattern to watch: any query that excludes the current entity for display purposes but is reused for business logic (CTA visibility, counts, badges) can produce this class of bug. The fix mutates the Map before `setState` — acceptable since it's a fresh Map from the async call, not shared state.

**References:** `src/app/pages/story-detail-page.tsx` lines 767-774

## 2026-03-09 [technical]: AI banner generation — fire-and-forget with Gemini + Unsplash fallback + 5MB bucket

**Context:** Events used Unsplash stock photos for banners. P489 replaced this with AI-generated banners via Gemini API (edge function). Initial implementation blocked `createEvent()` for 5-10s waiting for banner generation. Storage bucket was set to 2MB — Gemini generates ~2MB PNGs that exceeded this.

**Decision:** (1) Banner generation runs as fire-and-forget IIFE in `createEvent()` — user navigates immediately, banner appears on next page load. (2) Fallback chain: Gemini AI → Unsplash → gradient. (3) Storage bucket `event-banners` set to 5MB (not 2MB) — Gemini PNG output averages 2-2.5MB. (4) Edge function deployed to both test and prod Supabase with `GEMINI_API_KEY` secret. (5) Rate limiting: 5/5min, 20/day per user via `ai_rate_limits` table.

**Alternatives rejected:** Awaiting banner in `createEvent()` — blocks navigation 5-10s. Client-side image generation — no good browser APIs for this. Requesting JPEG from Gemini — API doesn't support format selection in `responseModalities: ['IMAGE']`.

**Consequences:** New events show gradient initially, AI banner on refresh. Edge function pattern reusable for future AI image tasks. Bucket size must account for model output — don't assume 2MB is enough for AI-generated images.

**References:** `supabase/functions/generate-event-banner/index.ts`, `src/app/data/events-service-real.ts`, `src/app/prototypes/events/banner-utils.ts`

---

## 2026-03-09 [technical]: Auth-gate params must flow through BOTH signInWithEmail AND signInWithGoogle

**Context:** P458 implementation initially only forwarded `pointId`, `position`, `pointTitle` through the magic link callback URL. Google OAuth used the same `signInWithGoogle` function which only passed `source`, `redirect`, and `action` — the auth-gate-specific params were silently dropped during the OAuth round-trip. User discovered the bug during UAT (Google sign-in didn't auto-save position).

**Decision:** Added `extraParams: Record<string, string>` option to both `signInWithEmail` and `signInWithGoogle`. The signup page and login page collect P458 params from their own URL and pass them as `extraParams`. This is a generic extension point — any future auth-gate action can add params without modifying the function signatures. Also: `intent.redirect` in the `set-position` handler must be validated against `ALLOWED_REDIRECT_PREFIXES` — the initial implementation navigated directly from `parseAuthGateIntent` output, bypassing the allowlist on the success path.

**Alternatives rejected:** Forwarding the entire `location.search` — over-broad, leaks unrelated params. Adding named params (`pointId`, `position`) to function signatures — requires signature changes for every new action.

**Consequences:** `extraParams` is the standard way to forward action-specific context through auth. Both OAuth and magic link paths must include it. Any new auth-gate action (e.g., `join-session`) follows the same pattern: add params to `extraParams` in the page, handle in `AuthCallbackPage`.

**References:** `src/app/data/api.ts` (signInWithEmail, signInWithGoogle), `src/app/pages/signup-page.tsx`, `src/app/components/pledge/login-form.tsx`

---

## 2026-03-09 [process]: Kanban Goals page reads from docs/goals.md — single source for execution priorities

**Context:** Kanban Goals page previously read from the active milestone's `## Pilot Sequence` section and `~/.claude_weekly_last_run`. This created two problems: (1) pilot sequence is milestone-level, not execution-level — it doesn't reflect the agreed priority order (bugs → article → promote → events → infra), and (2) weekly commitment is a different concern. An initial attempt hardcoded data into `goals-data.ts`, violating dynamic discovery.

**Decision:** Created `docs/goals.md` as a simple prioritized checklist + dos/don'ts guardrails. Kanban server parses it via `GET /api/goals-strategic`. GoalsPage.tsx stripped to just Next Steps — no tabs, no duplicated strategic data.

**Alternatives rejected:**
- Hardcoded `goals-data.ts` — violates dynamic discovery; data diverges from docs
- Rich tabbed dashboard duplicating funnel/hypotheses/metrics from source docs
- Keep pilot sequence + weekly on Goals page — different concerns, cluttered view

**Consequences:** `docs/goals.md` is the single place to update execution priorities. `/kdd` updates it after sessions. Kanban Goals page auto-reflects on refresh.

**References:** [docs/goals.md](goals.md), [tools/kanban/server/api.ts](../tools/kanban/server/api.ts)

## 2026-03-09 [product]: 5-week roadmap adopted — article + 1-on-1 in parallel, not sequential

**Context:** A 5-week execution roadmap was proposed (Week 1: bugs/polish, Week 2: article publish + promote, Week 3-4: events + workshops, Week 5: retainer conversion). Strategic docs previously assumed sequential flow: validate H-PairsReturn via 1-on-1 sessions first, then scale to workshops. Meanwhile, 30+ direct outreach sessions over 9 months produced zero conversions — article-as-qualifier removes the anti-humiliation barrier by framing as intellectual engagement, not vulnerability pitch.

**Decision:** Adopt the 5-week energy/timeboxing structure with modified sequencing: run article publication AND facilitated 1-on-1 sessions in parallel, not sequentially. Article qualifies leads (readers who register + set positions self-select as serious). 1-on-1 sessions validate H-PairsReturn directly. Both feed the funnel independently.

**Alternatives rejected:**
- Article-first, then 1-on-1 (original roadmap) — delays H-PairsReturn validation unnecessarily. First session already scheduled March 10.
- 1-on-1 first, article later (original doc sequencing) — ignores the 30+ failed cold-outreach signal. Article pre-warm is a validated channel insight.

**Consequences:** P458 (anon position auth gate) promoted to week — needed for article "set positions" CTA. Kanban resequenced: bugs → article → promote → events → infra → transcription. Both acquisition channels tracked separately to avoid signal contamination.

**References:** [C1 milestone](milestones/c1-stories-live-events.md), [hypotheses.md](hypotheses.md) H-PairsReturn, [lean-canvas.md](lean-canvas.md)

## 2026-03-09 [product]: Don't send article before facilitated sessions — keep hypothesis signals separate

**Context:** First co-founder pair session scheduled March 10. Temptation to send the article beforehand so they could "set positions" before the session.

**Decision:** Don't send the article before facilitated sessions. H-PairsReturn tests whether pairs recognize false agreements as costly in a facilitated setting. Pre-exposing them to the article's framing would contaminate the signal — they'd arrive primed rather than naive. Article-as-qualifier is a separate experiment (H-WorkshopFormat territory).

**Alternatives rejected:**
- Send article as "homework" before session — contaminates H-PairsReturn signal. The "holy shit" moment requires naive discovery, not primed expectation.

**Consequences:** Article publication proceeds independently of session scheduling. Sessions use their own prep (real decisions the pair is facing), not article content.

**References:** [C1 milestone](milestones/c1-stories-live-events.md), [hypotheses.md](hypotheses.md) H-PairsReturn

## 2026-03-09 [process]: Kanban priority resequence aligned to 5-week roadmap

**Context:** Feature priorities were scattered across workstreams without clear sequencing. The 5-week roadmap crystallized execution order.

**Decision:** Resequenced kanban: (1) bugs/polish first, (2) article infrastructure (P458 anon auth gate), (3) article promotion, (4) events/workshops, (5) infra improvements, (6) transcription feature + 1-to-many verification. P489 (AI banners) deprioritized to backlog (rank 100). P458 promoted to week (rank 3). P419 (filing chat) unblocked (P425 done).

**Alternatives rejected:**
- Keep priorities as-is — scattered priorities lead to context-switching without clear progress toward C1 validation.

**Consequences:** Clear week-by-week execution focus. Features not aligned to 5-week roadmap parked in backlog.

**References:** [features/p458](../features/p458_anon_position_auth_gate.md), [features/p489](../features/p489_ai_generated_event_banners.md), [features/p419](../features/p419_filing_chat_v1.md)

## 2026-03-09 [process]: Event poster generation pipeline — `/gen-poster` skill

**Context:** Needed promotional posters for Clarity Lab event (March 12). Manual design is slow; AI image generation (Gemini Nano Banana Pro) can produce hero images, but quality requires specific API params and per-aspect-ratio generation.

**Decision:** Established a repeatable 7-step pipeline captured in `/slava:content:gen-poster`: (1) fetch event data, (2) shortlink + QR, (3) generate 3 hero images at 4K via Nano Banana Pro (one per aspect ratio: 3:4, 16:9, 1:1), (4) build 5 HTML templates using 3 layout patterns (portrait, landscape-split, square), (5) screenshot at 2x DPR via Playwright node script, (6) self-review loop against 8-point checklist, (7) zip + upload to ladischenski.com/temp/{slug}/. Also updated `/gen-image` with `imageConfig` params (`imageSize: "4K"`, `aspectRatio`).

**Alternatives rejected:**
- Single hero image cropped to all formats — quality loss on landscape crops from portrait source
- 1x DPR screenshots — produces sub-1MB files that look pixelated on retina screens
- Imagen 4 as primary — Nano Banana Pro produces higher quality natively within `generateContent` endpoint

**Consequences:** Event promotion flow updated in `docs/events/process.md` (step 4: gen-poster before promotion). `push-enable`/`push-disable` hook extended to cover `vercel --prod` deploys. ladischenski.com gained a catch-all route for `/temp/` subfolders.

**References:** [gen-poster.md](.claude/commands/slava/content/gen-poster.md), [gen-image.md](.claude/commands/slava/content/gen-image.md), [events/process.md](events/process.md)

## 2026-03-09 [product]: 5-week roadmap adopted — article + 1-on-1 in parallel, not sequential

**Context:** A 5-week execution roadmap was proposed (Week 1: bugs/polish, Week 2: article publish + promote, Week 3-4: events + workshops, Week 5: retainer conversion). Strategic docs previously assumed sequential flow: validate H-PairsReturn via 1-on-1 sessions first, then scale to workshops. Meanwhile, 30+ direct outreach sessions over 9 months produced zero conversions — article-as-qualifier removes the anti-humiliation barrier by framing as intellectual engagement, not vulnerability pitch.

**Decision:** Adopt the 5-week energy/timeboxing structure with modified sequencing: run article publication AND facilitated 1-on-1 sessions in parallel, not sequentially. Article qualifies leads (readers who register + set positions self-select as serious). 1-on-1 sessions validate H-PairsReturn directly. Both feed the funnel independently.

**Alternatives rejected:**
- Article-first, then 1-on-1 (original roadmap) — delays H-PairsReturn validation unnecessarily. First session already scheduled March 10.
- 1-on-1 first, article later (original doc sequencing) — ignores the 30+ failed cold-outreach signal. Article pre-warm is a validated channel insight.

**Consequences:** P458 (anon position auth gate) promoted to week — needed for article "set positions" CTA. Kanban resequenced: bugs → article → promote → events → infra → transcription. Both acquisition channels tracked separately to avoid signal contamination.

**References:** [C1 milestone](milestones/c1-stories-live-events.md), [hypotheses.md](hypotheses.md) H-PairsReturn, [lean-canvas.md](lean-canvas.md)

## 2026-03-09 [product]: Don't send article before facilitated sessions — keep hypothesis signals separate

**Context:** First co-founder pair session scheduled March 10. Temptation to send the article beforehand so they could "set positions" before the session.

**Decision:** Don't send the article before facilitated sessions. H-PairsReturn tests whether pairs recognize false agreements as costly in a facilitated setting. Pre-exposing them to the article's framing would contaminate the signal — they'd arrive primed rather than naive. Article-as-qualifier is a separate experiment (H-WorkshopFormat territory).

**Alternatives rejected:**
- Send article as "homework" before session — contaminates H-PairsReturn signal. The "holy shit" moment requires naive discovery, not primed expectation.

**Consequences:** Article publication proceeds independently of session scheduling. Sessions use their own prep (real decisions the pair is facing), not article content.

**References:** [C1 milestone](milestones/c1-stories-live-events.md), [hypotheses.md](hypotheses.md) H-PairsReturn

## 2026-03-09 [process]: Kanban priority resequence aligned to 5-week roadmap

**Context:** Feature priorities were scattered across workstreams without clear sequencing. The 5-week roadmap crystallized execution order.

**Decision:** Resequenced kanban: (1) bugs/polish first, (2) article infrastructure (P458 anon auth gate), (3) article promotion, (4) events/workshops, (5) infra improvements, (6) transcription feature + 1-to-many verification. P489 (AI banners) deprioritized to backlog (rank 100). P458 promoted to week (rank 3). P419 (filing chat) unblocked (P425 done).

**Alternatives rejected:**
- Keep priorities as-is — scattered priorities lead to context-switching without clear progress toward C1 validation.

**Consequences:** Clear week-by-week execution focus. Features not aligned to 5-week roadmap parked in backlog.

**References:** [features/p458](../features/p458_anon_position_auth_gate.md), [features/p489](../features/p489_ai_generated_event_banners.md), [features/p419](../features/p419_filing_chat_v1.md)

## 2026-03-07 [technical]: Invite auto-auth via server-side magic link for existing users (P483+P488)

**Context:** P483 streamlined the invite flow for existing users (read-only name, skip OTP). P488 extended it: if the invited partner already has an account, generate a Supabase magic link server-side so they arrive on the accept page already authenticated — one-click signing instead of email→OTP→sign.

**Decision:** Edge function `send-agreement-emails` detects existing users via `profiles` table lookup. For existing users: calls `auth.admin.generateLink({ type: 'magiclink', email, options: { redirectTo: acceptURL } })` to get a Supabase `/auth/v1/verify` URL, embeds it as the email CTA. For new users: falls back to direct accept URL (unchanged P483 OTP flow). Accept page cleans up `#error=` hash fragments (from expired magic links) via `history.replaceState` on mount, and strips `?token=` from URL after successful authentication. `<meta name="referrer" content="same-origin">` prevents token leakage via Referer header.

**Alternatives rejected:**
- Client-side magic link generation (via `supabase.auth.signInWithOtp`) — requires the accept page to detect existing users and trigger auth, adding a round-trip and complexity. Server-side generation is invisible to the user.
- Custom token system instead of Supabase magic links — reinvents auth; Supabase handles expiry, rotation, and session creation.
- Keeping OTP flow for all users regardless of account status — unnecessary friction for existing users who already have verified emails.

**Consequences:** Existing users get one-click signing from invite email (magic link → authenticated → "I Accept & Co-Sign"). New users unchanged. Magic links expire after 1 hour; expired links redirect with `#error=access_denied` — accept page handles gracefully by falling back to unauthenticated state. Edge function requires `service_role` key (already deployed). P483 superseded by P488 (`type: change-request`).

**References:** [P483](../features/p483_existing_user_invite_streamline.md), [P488](../features/p488_invite_auto_auth_via_token.md), [send-agreement-emails](../supabase/functions/send-agreement-emails/index.ts), [accept-agreement-page](../src/app/pages/accept-agreement-page.tsx)

## 2026-03-07 [process]: Worktrees restored as primary isolation — branch-only experiment failed

**Context:** After worktree slot naming was established (2026-03-02), a branch-only workflow crept in for P483–P488. In 10 days: P487 shipped directly on main (no branch), P488 committed onto P483's branch (cross-contamination), P484/P485 branches orphaned (never merged, no specs). The branch-assert hook (2026-03-06) was stale within a day (`.expected-branch` set to `main` while on `feature/p483`). Root cause: branches removed 3 capabilities worktrees provided — parallel testing (fixed ports w1=5100, w2=5200), visual tracking (kanban w1), and session isolation (separate directories). Without these, the path of least resistance became "ship without testing."

**Decision:** Worktrees are the default for all `/dev` and `/fix` work. Branches are the mechanism inside worktrees, not a standalone workflow. `/dev` step 0 creates a worktree; branch-only is the exception for single-file trivial fixes.

**Alternatives rejected:**
- Branch-only with added tooling (kanban branch field, port conventions, stricter hooks) — reinvents what worktrees already provide; each guard is another thing that can go stale.
- Hybrid (branches for small, worktrees for complex) — in practice, everything feels small in the moment; P487 "felt small" and shipped on main untested.

**Consequences:** Update `/dev` and `/fix` skills to create worktrees by default. Update worktree-setup.md (remove "legacy" language), git-workflow.md (worktree = default in decision table), CLAUDE.md (promote worktree from "suggest" to "default"). Branch-assert hook becomes unnecessary (worktree isolation is structural, not discipline-based). Orphaned branches (p484, p485) to be cleaned up.

**References:** [worktree-setup.md](docs/technical/worktree-setup.md), [git-workflow.md](docs/technical/git-workflow.md), branch-assert decision (2026-03-06)

## 2026-03-07 [product]: Unify story CTA copy to "Add your story" across all surfaces (P487)

**Context:** P486 replaced CTA destinations (chat→create) and introduced "Add your story →" copy on 4 surfaces, but left `getPositionCTACopy()` returning position-specific text ("Why do you agree? →", "Why do you disagree? →", "What makes you unsure? →") on 4 other surfaces. Users saw inconsistent CTA copy depending on which surface they encountered.

**Decision:** Unify `getPositionCTACopy()` to return `ctaText: 'Add your story →'` and `ariaLabel: 'Add your story for this point'` for all three position groups. Position-specific symbols (✓/✗/~) and labels (Agree/Disagree/Unsure) remain distinct — only the action copy is unified.

**Alternatives rejected:**
- Keep position-specific questions ("Why do you agree?") — creates inconsistency with P486 surfaces that already use "Add your story". Users see two different CTAs for the same action.
- Remove `getPositionCTACopy()` entirely — the function still provides value for position indicator prefixes (symbol + label).

**Consequences:** All 8 CTA surfaces now show identical action copy. The position indicator prefix (e.g., "✓ Agree") still distinguishes context. Change-request pattern (`type: change-request`, `changes: p486`) used for traceability.

**References:** [features/done/22_mar_26/p487_unify_story_cta_copy.md](../features/done/22_mar_26/p487_unify_story_cta_copy.md)

## 2026-03-07 [product]: Replace /chat AI-guided flow with simple /create form (P486)

**Context:** The /chat route used a Gemini-powered StoryGuideChat for AI-assisted story creation. It was broken (streaming issues, state persistence bugs — P446), added friction for C1 pairs who just need to file stories quickly, and the AI guidance added no validated value.

**Decision:** Replace /chat with a direct `/create` form page. Point context flows via `?pointId=` query param → parallel fetch of point + position → ChatContextHeader banner → story linked on save. /chat and /clarity-chat redirect to /create (preserving query params). StoryGuideChat components left in codebase but unreachable (lazy import removed).

**Alternatives rejected:**
- Fix StoryGuideChat (P446 bugs) — high cost, unvalidated value. AI guidance is a hypothesis, not a proven need.
- Remove StoryGuideChat components entirely — unnecessary churn, tree-shaking makes them zero-cost.
- Position ownership server-side check before linkPointToStory — deferred; RLS is sufficient for C1 trust level.

**Technical notes:**
- 7-value granular positions (strongly_agree, somewhat_agree, etc.) mapped to 3-value scale (agree/disagree/unsure) for ChatContextHeader display
- Auth redirect preserves return URL via P76 pattern (`?redirect=` + `ALLOWED_REDIRECT_PREFIXES`)
- `linkPointToStory` guarded by `hasPosition` boolean (not position value) — no position = no link attempt

**Consequences:** Story creation is now a single-page form. AI-guided flow can be restored later if hypothesis is validated. 8 entry points rewired from /chat to /create.

**References:** [features/done/22_mar_26/p486_replace_chat_with_simple_create.md](../features/done/22_mar_26/p486_replace_chat_with_simple_create.md)

## 2026-03-07 [process]: Lost edits root cause — branch drift during multi-branch sessions

**Context:** Recurring problem: agent edits files, they "disappear." Happened 4+ times across sessions. This session: edits to `App.tsx` and `TreePage.tsx` re-applied 3 times before realizing the branch had drifted from P485 to P483. Past attempts to fix: index collision check in `/dev` (2026-02-25), worktree automation rejected (2026-02-26), KDD branch guard (2026-03-05). All discipline-based → all failed under cognitive load.

**Root cause (5-why):** Multiple sessions/terminals share `.git/HEAD`. No per-edit branch assertion exists. Branch drifts between checkpoints (skill start, commit time). Failed pre-commit hooks don't display the branch name. Uncommitted edits are silently overwritten by `git checkout`.

**Decision:** Implement **PreToolUse branch assertion hook** — lightweight bash hook (~20 lines) that fires before every `Write`/`Edit` tool call. Checks `git branch --show-current` against `.claude/.expected-branch` (set by `/dev` or agent at branch creation). Blocks and warns on mismatch. Also add branch name display to pre-commit hook failure output.

**Alternatives rejected:**
- Worktree-per-session automation — previously rejected (2026-02-26) due to `.env.local` showstopper + transparency. Could revisit as prompted (not auto) version.
- "Commit more frequently" (discipline) — proven to fail 4 times. Not a mechanical fix.

**Consequences:** Agents cannot silently edit files on the wrong branch. May occasionally false-positive when intentional branch switches happen without updating `.expected-branch` — acceptable trade-off vs losing work.

**References:** [git-workflow.md](docs/technical/git-workflow.md), [worktree-setup.md](docs/technical/worktree-setup.md)

## 2026-03-06 [product]: Profile metadata line — always "N Clarity Partners", no viewer-specific copy

**Context:** `AgreementsMetadataLine` had a "visitor-party" branch that changed the label to "You have N agreement(s) with this person" when the logged-in user was party to an agreement with the profile owner. All other viewers saw "N Clarity Partners →".

**Decision:** Remove the visitor-party branch. Always display "N Clarity Partners →" regardless of viewer relationship. KISS — the copy switch added no user value and broke visual consistency across profiles.

**Alternatives rejected:** (1) Keep personalized copy — adds complexity for marginal benefit, confuses the metaphor (agreements vs partners). (2) Show both counts — over-engineered for current scale.

**Consequences:** One fewer code path in `agreements-metadata-line.tsx`. The `filterAgreementsForViewer` function still controls visibility — this change only affects the label text, not what's shown/hidden.

**References:** [agreements-metadata-line.tsx](../src/app/components/agreements/agreements-metadata-line.tsx)

## 2026-03-06 [product]: Pending invitation rows are non-clickable

**Context:** Partners page (`AgreementRow`) wrapped every row in a `<Link>` to `/agreements/:id`, including pending invitations. Clicking a pending row navigated to an agreement detail page with no signed content — confusing UX that implied a signed agreement existed.

**Decision:** Pending rows render in a plain `<div>` instead of `<Link>`. Hover/active background effects removed from pending rows. Active and terminated rows remain clickable. Pattern: don't link to entities that have no meaningful content to display yet.

**Alternatives rejected:** (1) Show a "pending" state on the agreement detail page — adds complexity for no user value. (2) Disable the link visually but keep it — half-measures confuse more than they help.

**Consequences:** Resend/Revoke buttons on pending rows still work (they use `e.stopPropagation()` internally). If pending agreements later gain a detail view, re-add the `<Link>` wrapper.

**References:** [agreement-row.tsx](../src/app/components/agreements/agreement-row.tsx)

## 2026-03-06 [technical]: Null-safe avatar color — fix invitation signup + GravatarAvatar

**Context:** Users who signed up via agreement invitation (accept-agreement-page) had invisible nav avatars. Root cause: the invitation OTP signup passed `data: { name }` without `avatar_color`, unlike the normal signup flow in `api.ts` which includes `avatar_color: getRandomColor()`. This stored `avatar_color = NULL` in the profile. GravatarAvatar's default parameter `avatarColor = "#0044CC"` only activates for `undefined`, not `null` — so `backgroundColor: null` rendered an invisible circle. 15+ components pass `avatarColor` from DB without null guards.

**Decision:** Two-layer fix: (1) Add `avatar_color` to all OTP signup paths (accept-agreement-page + agreement-email-confirmation-page). (2) Make GravatarAvatar null-safe with `avatarColor || "#0044CC"` in the style prop — handles existing NULL profiles and protects all 15+ callers at once.

**Alternatives rejected:** (1) Fix only the signup paths — leaves existing users with NULL avatar_color broken. (2) Add `?? "#0044CC"` to every caller — 15+ files, fragile, violates DRY.

**Consequences:** JS default params (`= value`) don't handle `null`, only `undefined`. When mapping DB columns that can be NULL to component props with defaults, use `||` or `??` in the style/render logic, not just the default parameter. This is a general pattern for any nullable DB field flowing to a React component default.

**References:** `src/components/ui/gravatar-avatar.tsx`, `src/app/pages/accept-agreement-page.tsx`, `src/app/pages/agreement-email-confirmation-page.tsx`, `src/app/data/api.ts:434`

## 2026-03-06 [technical]: All modals use Dialog (Radix), not Drawer (Vaul) — single modal primitive

**Context:** P481 introduced `ConfirmDialog` using Vaul's `Drawer` (bottom-sheet), claiming it "matched the app-wide destructive confirmation pattern." Screenshot showed the revoke dialog pinned to the bottom of the viewport while every other dialog (RemovePositionDialog, CelebrationDialog, NameDialog, skip dialogs in live-mode) used Radix `Dialog` (centered). Architecture audit confirmed: Drawer was only used by this one component; all 6+ other modals use Dialog.

**Decision:** Switch `ConfirmDialog` from Drawer to Dialog. Single modal primitive going forward: Radix Dialog for all modals/confirmations. Drawer primitive remains available for genuine bottom-sheet mobile UX (e.g., action sheets) but is not for confirmation dialogs. No broader refactoring needed — prototype custom modals are isolated experiments, not worth consolidating until they graduate.

**Alternatives rejected:** (1) Keep Drawer for ConfirmDialog and convert other dialogs to match — wrong direction, Drawer is a mobile bottom-sheet pattern, not a centered confirmation pattern. (2) Broader refactoring to retire all custom modals in prototypes — premature; prototypes are disposable.

**Consequences:** When creating new confirmation/modal components, use `Dialog` from `@/components/ui/dialog`. Reserve `Drawer` for mobile-native bottom-sheet interactions only (action menus, bottom navigation drawers).

**References:** `src/app/components/shared/confirm-dialog.tsx`, `src/components/ui/dialog.tsx`

---

## 2026-03-06 [product]: Don't modal what's already on the page — navigate instead (P478)

**Context:** After partner signed an agreement, a `CelebrationDialog` modal showed `AgreementCertificate variant="celebration"` — visually identical to the pending certificate visible behind the modal. User feedback: "Why popup when same thing is behind it?" Closing the modal also exposed a stale-state bug (P479) — the page showed the unsigned state because `handleAccept()` didn't update the main state variable.

**Decision:** Remove the celebration modal entirely. On successful acceptance: show a success toast ("Agreement Sealed — your Clarity Partner Agreement with [name] is now active") and navigate to `/agreements/:id` where the `ActiveView` already renders the gold-seal certificate, /live link, and terminate button. Two bugs fixed by removal: modal redundancy and stale state.

**Alternatives rejected:** (1) Slim modal with just congratulations text (still duplicates the detail page). (2) Fix stale state by updating main state on modal close (treats symptom, not cause — the modal itself is the problem).

**Consequences:** Pattern for future flows: if a success state has its own page/view, navigate there with a toast rather than showing a modal overlay. Keep `CelebrationDialog` component file — may be useful for other flows (e.g., creator notification when partner signs).

**References:** `features/done/22_mar_26/p478_celebration-dialog-redesign.md`, `src/app/pages/accept-agreement-page.tsx`

---

## 2026-03-06 [technical]: CertificatePageShell — shared width wrapper for certificate pages (P482)

**Context:** Agreement detail page (`/agreements/:id`) rendered at `max-w-xl` (576px) while create and accept pages used `max-w-3xl` (768px). Each page had its own inline width/padding classes, leading to visual inconsistency and redundancy across 4 certificate-rendering pages.

**Decision:** Extract `CertificatePageShell` component (`src/app/components/layout/certificate-page-shell.tsx`) providing `max-w-3xl mx-auto px-4` with optional `parchment` prop for accept page's warm background (`min-h-screen bg-[#F5F3EF]`). Applied to: agreement-page, create-agreement-page, accept-agreement-page. Intentionally NOT applied to: pledge-page (different outer/inner width structure), declined page (no certificate), email confirm (no certificate).

**Alternatives rejected:** (1) CSS utility class only — doesn't enforce structure or support parchment variant. (2) Making all pages identical width including non-certificate pages — over-homogenization, each page type has legitimate reasons for different widths.

---

## 2026-03-06 [technical]: Dynamic OG tags via Vercel serverless function — SSR-lite for link previews

**Context:** Sharing ClarityPledge URLs (events, stories, points, profiles) in WhatsApp, Telegram, Facebook, and Twitter showed the generic platform description ("Join professionals worldwide...") instead of content-specific metadata. Root cause: the app is a Vite SPA — `react-helmet-async` sets OG tags client-side, but social crawlers don't execute JavaScript. They only read static HTML from `index.html`. Migrating to Next.js (SSR) was considered previously but rejected as too large a rewrite for this benefit alone.

**Decision:** Vercel serverless function (`api/og.ts`) + conditional rewrites in `vercel.json`. Bot user-agents (WhatsApp, Telegram, Facebook, Twitter, LinkedIn, Slack, Discord) are detected via `has` conditions on the `user-agent` header in rewrite rules. Matching requests are routed to the function, which fetches content from Supabase REST API and returns minimal HTML with correct OG meta tags. Non-bot users are unaffected — they get the SPA as before. Covers: `/events/:slug`, `/story/:id`, `/point/:id`, `/p/:slug`.

**Alternatives rejected:** (1) Next.js migration — massive rewrite for just OG tags. (2) Vercel Edge Middleware (`middleware.ts`) — Next.js-specific, not available for Vite projects. (3) Pre-rendering/SSG for specific routes — requires build-time knowledge of all content IDs, doesn't work for dynamic content.

**Consequences:** Link previews now show content-specific titles, descriptions, and images. The function uses the same `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` env vars already set in Vercel. Responses are cached at the edge (`s-maxage=3600`) to avoid hitting Supabase on every bot crawl. The `react-helmet-async` SEO component remains useful for Google (which does execute JS) and for in-app `<title>` updates.

**References:** `api/og.ts`, `vercel.json` rewrites section

## 2026-03-06 [process]: CLAUDE.md exchange gate + drift scan — mechanical growth control

**Context:** P441 audit reduced CLAUDE.md from 576→352 lines (-39%). Root cause of bloat: each rule individually passes the 80% universality test, but aggregate growth dilutes all rules. No mechanism existed to enforce a budget or detect sections that decay below the 80% threshold over time.

**Decision:** Two additions to `/claude-md` skill (v1.3.0): (1) **Exchange gate** — Step 0 counts lines and reports vs 350-line target. If over budget AND proposal is an ADD, requires a matching REMOVE/CONDENSE before approval. REMOVE/CONDENSE proposals always pass on budget grounds. (2) **Drift scan** — Step 6 reads `.claude/rules/*.md` first (to avoid false positives on correctly-delegated sections), then flags any CLAUDE.md section that now fails the >80% universality test. Background observation only — doesn't block the ADD.

**Alternatives rejected:** Hard line limit with no exchange (blocks legitimate additions). Periodic manual audit (non-mechanical — relies on discipline). Auto-archival of old rules (too aggressive — removes context without human judgment).

**Consequences:** CLAUDE.md growth is now mechanically gated. The 350-line target is enforced per-change, not just per-audit. Drift scan catches sections that should migrate to `.claude/rules/` as the project evolves. The old check 6 (budget at 500 lines) is superseded by Step 0 (budget at 350 lines with exchange requirement).

**References:** `.claude/commands/slava/maintain/claude-md/SKILL.md` v1.3.0, `features/done/22_mar_26/p441_claude_md_audit.md`

## 2026-03-05 [process]: KDD hard stop + skill branch guard — prevent wrong-branch global commits

**Context:** Two commits landed on feature branches instead of main in the same session: a KDD docs update (landed on `feature/p476`) and a skill file fix (landed on `feature/p458`). Root cause: multiple Claude sessions share a single working directory and its `.git/HEAD` — any `git checkout <branch>` changes the active branch for all concurrent sessions. The committing session didn't know the branch had drifted.

**Decision:** Two mechanical guards: (1) `/kdd` step 0 upgraded from "warning, not a blocker" to a hard stop — emits recovery instructions and terminates the invocation if not on `main`. (2) `.claude/rules/skills.md` gained a "Branch Guard for Skill File Commits" section — auto-loads when editing skill files, tells the agent to check the branch before committing. Both use the wip-commit recovery pattern (`git add -A && git commit -m "wip:"` → checkout main → fix + commit → return + `git reset HEAD~1`). `git stash` is explicitly banned in both — stashes are invisible and can be permanently lost.

**Alternatives rejected:** Warning only (proven ignorable — the bug that motivated this fix). Stash-based recovery (already banned in `.claude/rules/git.md` for agents). Pre-commit hook on all commits (too broad — would block legitimate feature commits from skill-file edits during /dev).

**Consequences:** /kdd from a feature branch now fails loudly and gives exact recovery steps. Skill edits made during feature sessions must be committed separately on main. The stash ban in git.md is now reinforced at the skill and rules layer.

**References:** `.claude/commands/slava/maintain/kdd/SKILL.md` step 0, `.claude/rules/skills.md` "Branch Guard" section, `.claude/rules/git.md` "Why stash is banned"

## 2026-03-05 [process]: Worktree signal propagation — architect flags blast radius, dev detects it

**Context:** /dev only asked about worktrees on dirty index collision. High-blast-radius tasks (CLAUDE.md, .claude/, package.json, build config) could start without isolation even with a clean tree.

**Decision:** Three-layer signal path: (1) /architect writes `**Worktree recommended:** [reason]` in the Implementation Approach subsection when the spec touches CLAUDE.md, anything under .claude/, package.json, build config, or involves 10+ files to create/modify combined. (2) /dev step 0.1 scans the spec for the word "worktree" before the collision check — presents option proactively even with clean tree. (3) /spec-review is explicitly out of this loop (wrong layer — not a review concern).

**Alternatives rejected:** Asking on every /dev run (too much friction for small changes). Putting signal in /spec-review (review layer, not execution layer).

**Consequences:** Blast-radius decisions are now made at architecture time and surfaced at execution time — without requiring user discipline to remember to ask.

**References:** `.claude/commands/slava/build/architect.md`, `.claude/commands/slava/build/dev.md`

## 2026-03-05 [technical]: Content pages use .md?raw + ReactMarkdown with custom components

**Context:** ToS page had all legal text inline in JSX, making /tos-review diffs noisy and requiring JSX knowledge to safely edit legal text.
**Decision:** Extract content to `src/app/content/*.md`, import with `?raw`, render via ReactMarkdown with custom components that preserve exact Tailwind CSS classes (text-muted-foreground, text-foreground for bold, etc.).
**Alternatives rejected:** Tailwind Typography prose-only (loses muted-foreground/foreground color contrast on body text and bold); structured content objects (more code, no cleaner diffs than markdown).
**Consequences:** Future content-heavy pages follow this pattern. /tos-review now edits `tos.md` directly — no JSX knowledge needed. `full-article-page.tsx` was prior art for `?raw` import; this extends the pattern to legal/static content pages.
**References:** `src/app/content/tos.md`, `src/app/pages/terms-of-service-page.tsx` (P474)


## 2026-03-05 [technical]: Auth redirect roundtrip — token must be embedded in redirect URL, not separate param

**Context:** The accept-agreement page linked to `/login?returnTo=...&token=...`. The login page only reads `redirect` (not `returnTo`). `signInWithEmail` embeds only the `redirect` param inside `emailRedirectTo`. After login → auth/callback → redirect, the `token` param was silently dropped. The user landed on the accept page without the agreement token — showing "invalid invitation".

**Decision:** When linking to `/login` from a page that requires a token or context param, embed everything inside the `redirect` value: `/login?redirect=%2Fagreements%2F{id}%2Faccept%3Ftoken%3D{token}`. Any param not inside `redirect` is lost after the auth/callback round-trip. `ALLOWED_REDIRECT_PREFIXES` in `AuthCallbackPage.tsx` includes `/agreements` — the full accept URL passes validation.

**Alternatives rejected:** Separate `token` param on the login URL — silently dropped by auth/callback. `returnTo` alias — login page doesn't read it (reads `redirect` only).

**Consequences:** Any future feature linking to `/login` with context that must survive the OTP round-trip must embed that context inside the `redirect` param. Review other login links if they rely on separate params.

**References:** `src/app/pages/accept-agreement-page.tsx` line 320, `src/auth/AuthCallbackPage.tsx` ALLOWED_REDIRECT_PREFIXES

---

## 2026-03-05 [product]: Decline reason capture — deferred; co-founders talk

**Context:** After shipping decline functionality on the accept page, the question arose: should the decliner be prompted for a reason (to send context to the inviter)?

**Decision:** No, for now. At co-founder scale: (1) decline is rare — invitations either get accepted or expire, (2) if someone declines, they almost certainly already have or will have a direct conversation. Capturing a reason adds friction at a sensitive moment with near-zero payoff. If 3+ declines happen in practice without the inviter having context, revisit with quick-select chips (1-tap options like "Let's discuss first", "Need more time", "Not for us") — lowest friction, highest signal.

**Alternatives rejected:** Optional free text (adds textarea to confirmation dialog — cognitive friction), required reason (blocks an already-reluctant action). Quick-select chips are the preferred option if/when built.

**Consequences:** `DeclinedAgreementPage` gets copy cleanup (P477) but no reason field. Creator gets email notification "X declined" with no additional context.

---

## 2026-03-05 [process]: /verify skill — pre-commitment, post-click wait, console diff vs baseline

**Context:** During P472 UAT, /verify passed all 7 scenarios but missed a broken button (onClick bug). The agent took a screenshot and described the UI without confirming the CTA actually triggered. Three root causes: (1) no stated expected outcome before acting, (2) no wait for toast/dialog after click, (3) console errors checked in absolute (any = fail) mode — pre-existing load errors would mask new ones.

**Decision:** Three additions to /verify Step 4 and Step 5d:
- **Pre-commitment**: Before clicking CTA, state "I expect to see [X]." Forces explicit prediction before action.
- **Post-click wait**: `wait_for(selector="[role='dialog'], [data-sonner-toast]", timeout=2000)` between click and screenshot — ensures UI has responded before assessment.
- **Console diff**: Record `BASELINE_ERROR_COUNT` at Step 4. In Step 5d, compare to baseline — only errors above baseline count. Pre-existing load errors do not fail a scenario.

**Alternatives rejected:** "Primary CTA" category (undefined boundary — too subjective). Label format in Step 1b (wrong layer — didn't cause the miss).

**Consequences:** /verify is now state-asserting, not post-hoc rationalizing. The wait eliminates timing races. Baseline diffing prevents false positives from pre-existing console noise.

**References:** `.claude/commands/slava/build/verify/SKILL.md` Steps 4 and 5d

---

## 2026-03-05 [process]: /ship push step removed — push is always explicit user action

**Context:** /ship previously included a "Push to origin" step that deployed to Vercel. But a global hook (`~/.claude/hooks/block-prod-deploy.sh`) already blocks `git push` unconditionally — requiring explicit user confirmation. Having both a "Push" step in /ship and a blocking hook created a misleading process (the step would hit the hook and stop anyway).

**Decision:** Removed steps 5 (Push) and 6 (Confirm deployment URL) from /ship. Renumbered remaining steps (close spec → 5, fix-kanban → 6, clean up → 7, ask → 8). Added to "After shipping" section: push runs separately, blocked by global hook. /ship is now merge-only.

**Alternatives rejected:** Remove the hook and let /ship push automatically — removes the human-in-the-loop safety gate. Keep both but clarify they work together — confusing; two contradictory "push" instructions.

**Consequences:** /ship is now scope-correct: merge + close spec + cleanup. Push to prod is always a separate explicit user action. Step references in 1a updated accordingly.

**References:** `.claude/commands/slava/build/ship.md`

---

## 2026-03-05 [product]: Revoked/cancelled pending invitations — hide entirely, not in terminated section

**Context:** When a creator revokes a pending invitation, it sets status=terminated. Question: should it appear in a "terminated" or "cancelled" section on the partners page?

**Decision:** No. Intentional revoke = clean removal from UI. Row disappears, toast confirms. No terminated section for cancelled invitations.

**Alternatives rejected:** Show in terminated section — adds noise for something the user did on purpose. No value in surfacing it again.

**Consequences:** Terminated section (if ever added) is for *agreements that were active and then ended*, not for invitations that never started.

---

## 2026-03-05 [technical]: onClick with optional-param handler — MouseEvent passed silently as arg

**Context:** `onClick={handleAccept}` where `handleAccept(nameOverride?: string)` — React passes the MouseEvent as `nameOverride`. Since `nameOverride !== undefined` is true for an event, `nameToUse` becomes the MouseEvent, and `.trim()` throws TypeError. Silent at compile time (TypeScript allows it), crashes at runtime.

**Decision:** Always wrap handlers with optional params in arrow functions: `onClick={() => handleAccept()}`. Never assign a handler with optional params directly to an event prop.

**Alternatives rejected:** Typing the param as `string | undefined` doesn't help — the issue is that MouseEvent satisfies `object` which is assignable without strict checking.

**Consequences:** /verify must test the primary CTA flow (button click → result), not just visual layout. Layout-only verification missed this.

---

## 2026-03-04 [process]: /falsify on /kdd meta-reflection = standard skill quality gate

**Context:** After creating /tos-review, /kdd surfaced 5 skill quality proposals. Running /falsify on them identified 3 as misdirected (wrong layer), not just wrong proposals — and produced better fixes for each. All 6 proposals survived falsification but were improved.

**Decision:** After creating or significantly modifying a skill, run `/kdd` → `/falsify` on the meta-reflection output before shipping. This is the standard quality gate. Not every /falsify session needs creative phase (Phase 4) — for process proposals, synthesis + better-fix identification is often sufficient.

**Alternatives rejected:** Apply /kdd meta-reflection proposals directly — misdirected fixes (wrong layer) wouldn't be caught; e.g., P4 would fix kdd in isolation instead of the universal skills.md rule.

**Consequences:** New skill creation flow: `/create-skill` → test it once → `/kdd` → `/falsify` on proposals → apply. The creative phase (30 proposals) is optional when the critique already identifies a clearly better layer for the fix.

**References:** `.claude/commands/slava/maintain/kdd/SKILL.md` step 7, `.claude/rules/skills.md`, `.claude/commands/slava/maintain/tos-review/SKILL.md`

---

## 2026-03-04 [process]: Shell grep before agent file reading — structural discovery > instructional

**Context:** /falsify review of `/tos-review` Stage 1 found that instructing an agent to "read edge function files" produces coverage gaps — the agent chooses which files to read and can miss services based on interpretation.

**Decision:** Skills with a "discover what external services/patterns exist" step should start with a shell grep command, not a file-reading instruction. The grep runs before any agent prompt is evaluated, guaranteeing coverage independent of agent interpretation. Applied to tos-review Stage 1: `grep -rn "fetch\|MAILGUN\|GEMINI\|..." supabase/functions/`.

**Alternatives rejected:** Instruction-only ("read all files in supabase/functions/") — relies on agent discipline; agent may read selectively. Hardcoded service list — goes stale as providers change; grep catches any `fetch()` call.

**Consequences:** Any skill that needs to inventory external dependencies should open with a shell grep step (not a read instruction). This is a general pattern for audit-style skills. See also: `/falsify` Phase 1 recommendation "structural enforcement > instructional enforcement."

**References:** `.claude/commands/slava/maintain/tos-review/SKILL.md` Stage 1

---

## 2026-03-04 [technical]: Anonymous auth gate — context preservation via signInWithEmail callback URL params

**Context:** P458 needed to preserve user intent (position, pointId, pointTitle) through the full magic link auth round-trip: button click → `/signup` → email → `/auth/callback` → auto-save → redirect to point.

**Decision:** Encode all context params into the `/auth/callback?...` URL via `signInWithEmail` options. `source` stays a positional param; `action`, `redirect`, `pointId`, `position`, `pointTitle` go in the options object and are encoded into the callback URL. `AuthCallbackPage` reads them from `urlParams` after auth completes and dispatches the side-effect. Pattern mirrors existing `action=rsvp` handler (lines 446–480 of AuthCallbackPage.tsx). sessionStorage was rejected — breaks when magic link opens in a different tab/browser, which is the common email client behavior. New auth gate utility functions live in `src/lib/auth-gate-utils.ts`: `buildAuthGateUrl`, `parseAuthGateIntent`, `isValidPosition`, `isValidPointId`.

**Alternatives rejected:** sessionStorage — tab-local, breaks on email client → new tab flow. Redirect-back-to-page with `?pendingPosition=agree` — two round-trips, race condition with auth session propagation.

**Consequences:** Any future feature preserving intent through auth should extend `signInWithEmail` options and add a handler to `AuthCallbackPage`. New post-auth destinations need to be added to `ALLOWED_REDIRECT_PREFIXES`. `position=unsure` (internal enum value) must NOT be used as a URL param — use `neutral` instead (`isValidPosition` enforces this).

**References:** `src/app/data/api.ts` (signInWithEmail), `src/auth/AuthCallbackPage.tsx` (action handlers), `src/lib/auth-gate-utils.ts` (utility functions), `features/p458_anon_position_auth_gate.md`

---

## 2026-03-04 [process]: ToS review = specialist drafter + adversarial reviewer + human gate; not /falsify

**Context:** P436 (one-off ToS check) was rejected in favor of a reusable `/tos-review` skill. Question arose whether /falsify was the right tool for legal review.

**Decision:** Legal/ToS review uses a dedicated pipeline: (1) tech audit + gap analysis by the main agent, (2) legal drafter agent proposes minimal changes, (3) adversarial reviewer agent checks GDPR compliance + legal holes, (4) human approves line-by-line, (5) apply. This is intentionally separate from /falsify, which tests product/tech hypotheses before investment — a different problem. The pipeline is encoded in `/slava:maintain:tos-review`.

**Alternatives rejected:** /falsify for legal review — wrong framing; /falsify asks "is this idea fundamentally flawed?" not "does this text close a GDPR gap?". One-off spec (P436) — not repeatable; ToS will drift again after every batch of features.

**Consequences:** After any batch of features tagging `ai`, `data`, or `legal`, run `/tos-review` manually. Two-agent review (drafter + adversarial GDPR reviewer) is the canonical pattern for any legal text update. P474 (ToS markdown migration) would make future diffs cleaner.

**References:** `.claude/commands/slava/maintain/tos-review/SKILL.md`, `features/archive/p436_tos_ai_processing_review.md`, `features/p474_tos_markdown_migration.md`

---

## 2026-03-04 [technical]: /chat conversations are not stored server-side (confirmed in code)

**Context:** ToS review raised question of whether ClarityPledge retains /chat session content. Needed to disclose retention accurately.

**Decision:** The `story-guide-chat` edge function does not persist message content. It records only `user_id + timestamp` in `ai_rate_limits` for rate limiting. The code comment explicitly states: "Log only safe metadata — never log message content." ToS now correctly discloses: "ClarityPledge does not retain your /chat conversations server-side."

**Alternatives rejected:** N/A — this is a factual finding, not a choice.

**Consequences:** If logging or debugging of /chat content is ever added, the ToS must be updated immediately (GDPR Art. 13 disclosure). Run `/tos-review` before deploying any such change.

**References:** `supabase/functions/story-guide-chat/index.ts`, `src/app/pages/terms-of-service-page.tsx`

---

## 2026-03-03 [process]: conversations-to-cp clarifying questions now classify as factual vs direction

**Context:** /kdd session revealed that when conversations-to-cp step 3 asked 3 plain-text clarifying questions, the user invoked /simplify manually to get structured options — the questions didn't have enough format to answer inline. Two round-trips covered overlapping ground.

**Decision:** Classify clarifying questions before outputting: factual (one right answer once context is known) → ask plainly; direction (trade-off between interpretations) → format as /simplify block inline with options, recommendation, and "Reply: A or B". Also: kdd step 6.2 suppresses the general "reply" prompt when /simplify blocks are present (conflicting instructions); kdd step 7 scopes decisions.md cross-reference to first 100 lines only.

**Alternatives rejected:** Leaving plain-text format — requires user to manually invoke /simplify every time a direction question arises. Acceptable overhead once; becomes friction pattern on recurring runs.

**Consequences:** conversations-to-cp step 3 now routes trade-off questions directly to /simplify format. No round-trip penalty for direction questions. applies also to any skill with a clarify step.

**References:** `.claude/commands/slava/maintain/claude-conversations-to-cp.md` step 3, `.claude/commands/slava/maintain/kdd/SKILL.md` steps 6.2–6.3, 7

---

## 2026-03-03 [product]: Content-led inbound is primary outbound channel; direct cold outreach dropped

**Context:** Slava ran 2 co-founder coaching sessions this week. Sessions were well-received but people couldn't replicate the protocol without him present. Separately, Slava expressed strong demotivation toward cold outreach ("feel like shit" sending messages to people he hasn't talked to in years). First AI business meetup is ~1 week away — treated as confidence-building, not a client acquisition event.

**Decision:** Primary outbound is content-led inbound (essays, workshop recordings, build-in-public posts) and running Calibration Labs in relevant communities (founder groups, AI meetups). Direct cold outreach to individuals is dropped as a channel. Inbound from cold outreach is fine; proactive cold messaging is not. Content starts after the first Lab generates real data (~Month 2).

**Alternatives rejected:** Direct outreach to co-founder pairs — Slava doesn't want to do it, and "preventive calibration" is hard to sell to people who don't feel the risk. This is a motivation and market-fit signal, not just a preference.

**Consequences:** Acquisition timeline shifts slightly — content-led takes longer to warm than cold outreach. The AI business meetup is treated as a confidence and calibration rep-building event, not a sales event. lean-canvas.md Channels updated to reflect this.

**References:** `docs/lean-canvas.md` Channels section (Track 2)

---

## 2026-03-03 [product]: AI calibration as demo vehicle (not a market); pivot to AI market considered and rejected

**Context:** Multiple conversations explored repositioning ladischenski.com and ClarityPledge around "AI calibration" — helping people verify they understood what AI told them. The falsify skill was run on this proposal.

**Decision:** AI calibration is a useful 5-minute demo opener in AI-adjacent venues (lowers emotional load vs. co-founder scenario, instant demo-ability). It is NOT the primary market or positioning. The product is co-founder/high-stakes dyad calibration. Positioning ladischenski.com fully around AI listening was considered and set aside — oversaturated category, no moat, would confuse what the product is for. H-AICalib-EntryTeaser filed as an active hypothesis to test the "demo teaser" use specifically.

**Alternatives rejected:** Full pivot to "AI coaching / listening-to-AI market" — no differentiation, crowded, and walking away from the calibration protocol's real moat (verified understanding in high-stakes relationships). Rebranding ladischenski.com to AI framing as primary — also rejected; site stays co-founder focused, AI venue is an additional acquisition channel not a repositioning.

**Consequences:** ladischenski.com copy stays co-founder focused. AI business meetup expands the Lab venue set without changing product positioning. Calibration Labs cast wide (AI practitioners + founders welcome) but the partner agreement and co-founder framing remain the goal. hypotheses.md updated with H-AICalib-EntryTeaser + explicit rejection note.

**References:** `docs/hypotheses.md` H-AICalib-EntryTeaser, `docs/milestones/c2-workshops.md` Channel 1

---

## 2026-03-03 [process]: Globalizing a skill means move (delete original), not copy

**Context:** `/slava:build:simplify` and `/slava:think:falsify` were moved from cp's `.claude/commands/slava/` to `~/.claude/commands/slava/` so they'd be available in all projects (e.g., pp). First pass created copies in both locations — caught immediately via duplicate skill entries in the skills list.

**Decision:** When promoting a skill from project-local to global: (1) copy content to `~/.claude/commands/slava/<namespace>/<skill>`, (2) verify diff before deleting, (3) delete the original from the project (`git rm`), (4) update any CLAUDE.md references. Use `/slava:util:promote-skill` to do this mechanically. Global skills are available in all projects including the originating one — no need to keep a local copy.

**Alternatives rejected:** Keeping the project copy "for safety" — creates two sources of truth that silently diverge. The duplication signal: if a skill appears twice in the skills list, one copy must be deleted.

**Consequences:** Skills that are project-agnostic (decision frameworks, thinking tools) should live globally. Skills with cp-specific context (e.g., `/kdd`, `/dev`, `/ascii-flows`) stay local. The `/slava:util:promote-skill` skill enforces the full procedure mechanically.

**References:** `~/.claude/commands/slava/util/promote-skill.md`

---

## 2026-03-03 [technical]: pagehide + async fetch = silent departure loss; fix is keepalive + JWT

**Context:** P126 — /live departure detection was unreliable. The `pagehide` handler fired correctly but the Supabase JS client calls were killed by the browser before completing (browser tears down page context on tab close / navigation).

**Decision:** Two-part fix required:
1. Use `fetch({ keepalive: true })` instead of Supabase client methods in `pagehide` handlers — `keepalive` tells the browser to complete the request even after page teardown. `navigator.sendBeacon` is not an alternative because it cannot send custom headers (`apikey`, `Authorization`).
2. Pass the user's JWT (`jwtRef.current`) not the anon key in the `Authorization` header. Direct REST calls bypass the Supabase JS client's automatic auth injection. Tables with RLS silently block anon-key writes with zero rows affected — no error thrown.

**Alternatives rejected:** `navigator.sendBeacon` — cannot set custom headers. Supabase SECURITY DEFINER RPC for all paths — works but requires a migration per path. JWT from local storage — fragile; use `supabase.auth.onAuthStateChange` to keep a ref current.

**Consequences:** Any cleanup that must run on tab close / navigation away needs this pattern. Creator path uses SECURITY DEFINER RPC (bypasses RLS regardless of auth token). Joiner path uses direct REST PATCH — needs valid JWT.

**References:** `src/app/pages/clarity-live-page.tsx` (jwtRef + pagehide handler), P126 spec

---

## 2026-03-03 [technical]: sessionStorage persistence — whitelist stable phases, null key for undefined IDs

**Context:** P446 — StoryGuideChat state was lost on navigation. Simple sessionStorage persistence introduced a subtle bug: restoring `phase: 'streaming'` or `phase: 'saving'` yields a frozen UI (no active fetch, disabled input, no recovery path).

**Decision:** Use a `PERSISTABLE_PHASES` whitelist (`Set<ChatPhase>`) — only persist phases where the UI is valid without an active async operation. Transient phases (`streaming`, `saving`) are excluded from the set; the save effect returns early if `!PERSISTABLE_PHASES.has(phase)`. Additionally: `storageKey()` returns `null` when `pointId` is undefined — all storage functions guard on null key — preventing multiple point-less chat sessions from sharing one storage slot.

**Alternatives rejected:** Map transient phases back to predecessor phase before saving — fragile (requires knowing the predecessor). Save everything, clear on mount if phase is transient — loses the chat history.

**Consequences:** Pattern applies to any stateful multi-phase UI that needs to survive navigation: define a whitelist of "safe to restore" phases up front. Lazy `useState` initializer + single `useRef` parse (avoiding N JSON.parse calls) is the right restore pattern.

**References:** `src/app/components/story-guide/StoryGuideChat.tsx` (PERSISTABLE_PHASES, storageKey, save effect), P446 spec

---

## 2026-03-03 [product]: Story count in point card footer shows only visible stories, not total

**Context:** Visitor viewing a profile sees "0 stories by [owner]" when owner has private stories. Owner sees "1 story" on the same card. Annotation in screenshot asked "why 0?" — confirmed this is intentional, not a bug.

**Decision:** The story count in the point card footer reflects only stories *visible to the viewer*, not the total story count. Private stories (default since P424) are not counted for visitors. This is correct — the count is "stories you could actually read", not "stories that exist."

**Alternatives rejected:** Show total count regardless of visibility — rejected because showing "3 stories" when none are accessible is misleading and creates a dead CTA.

**Consequences:** Visitors will often see "0 stories" on new profiles where stories haven't been made public. This is acceptable: it accurately reflects what's accessible. The "Add your story" CTA appears when the visitor has a position, providing a path forward regardless of owner story count.

**References:** P470 E2E Flow 1 test explicitly asserts this: `visitor sees "0 stories by owner" when story is private (RLS correctly restricts)`

---

## 2026-03-03 [technical]: supabaseAdmin singleton mutation breaks subsequent service_role inserts

**Context:** P470 E2E tests failed with "new row violates row-level security policy for table 'stories'" when `createTestStory` was called with `visibility: 'private'`, even though `supabaseAdmin` uses the service_role key and bypass policies exist. Root cause: `createTestPosition` called `supabaseAdmin.auth.signInWithPassword()` BEFORE `createTestStory` in `beforeAll`, leaving `supabaseAdmin`'s in-memory session set to the user's JWT. All subsequent service_role calls ran as the user instead.

**Decision:** Never call `signInWithPassword` (or any auth mutation) on the `supabaseAdmin` singleton. When a helper needs to act as a specific user, create a short-lived `tempSignInClient` from the anon key, obtain the session token, then construct a separate `userClient` with that token. `supabaseAdmin` remains untouched throughout. Also: `generateTestSlug` must include a random suffix alongside `Date.now()` to prevent `profiles_slug_unique` violations when parallel Playwright workers run `beforeAll` at the same millisecond.

**Alternatives rejected:** Calling `supabaseAdmin.auth.signOut()` after sign-in — unreliable, may leave client in anonymous mode rather than restoring service_role.

**Consequences:** All E2E helpers that sign in as a user (test-user.ts, test-point.ts) use the `tempSignInClient` pattern. `supabaseAdmin` is never used for auth sign-in, only for admin API calls (`admin.createUser`, `admin.deleteUser`, `admin.getUserById`) and service_role DB queries.

**References:** [e2e-testing-guide.md](docs/technical/e2e-testing-guide.md) | `e2e/helpers/test-user.ts` | `e2e/helpers/test-point.ts`

---

## 2026-03-03 [process]: /falsify skill — 5-phase proposal testing with root-cause-first discipline

**Context:** Meta-reflection from /kdd produced 3 process proposals. Running critique + falsification agents against them revealed all 3 failed — better fixes existed that the proposals missed. Prompted design of a reusable falsification skill.

**Decision:** Created `/slava:think:falsify`. Key design choices:
- **Root-cause agent (5-why) runs BEFORE critique/falsification** — falsifying a proposal without knowing the root cause tests symptom-prevention, not problem-prevention (gives false positives)
- **Critique (principle-level, no file reading) + Falsification (evidence-level, reads code) run in parallel** — critique asks "is this overkill / wrong layer?" while falsification asks "does it actually prevent the root cause?"
- **Scoring criteria agent runs BEFORE creative brainstorm** — prevents post-hoc bias (defining "good" after seeing options)
- **30 proposals from 2-3 creative agents in parallel** — the first 10 are obvious; orthogonal solutions surface at 20-30
- **Unified creative pool** — when 2+ proposals survive, all creative agents draw from the same unified pool (not top-5-per-proposal)
- **4 Verdict buckets**: Apply / Decide / Skip / Flag tension — the Overkill+SURVIVES triage path produces "Flag tension" (critique says skip, evidence says it holds — user decides)

**Alternatives rejected:** Single agent doing critique+falsification — no separation of concerns; post-hoc scoring criteria — biased toward the first options seen; per-proposal creative pools — misses cross-pollination between root causes.

**Consequences:** Run `/falsify` after any /kdd meta-reflection before acting on proposals. Also valid for UX inputs (after `/ascii-flows` to make design concrete) and code architecture decisions.

**References:** [.claude/commands/slava/think/falsify.md](.claude/commands/slava/think/falsify.md)

---

## 2026-03-03 [process]: Conversation analysis skills — two-skill privacy split + MapReduce design

**Context:** Needed a way to periodically analyze Claude conversation logs to surface strategic signals (lean-canvas, hypotheses, milestones, process friction) and personal/psychological patterns. Single skill risked personal content leaking into public cp repo.

**Decision:** Two separate skills with no shared paths. `/claude-conversations-to-cp` (in cp, public-safe) reads only cp sessions → writes only to cp strategy docs. `/claude-conversations-to-pp` (in `~/.claude/commands/`, private) reads all sessions → writes only to `~/Projects/private/personal/docs/psychology.md`. Hard-coded paths in each skill, no flags that could route wrong.

**Design choices:**
- Both skills read user AND assistant messages — insights come from both sides
- `--source` arg allows substituting Google Drive, local path, or other inputs (no Notion — not configured)
- MapReduce pattern: >15 files → spawn parallel Explore agents per chunk → synthesize; ≤15 → direct read
- 4-phase flow: Surface → Clarify (batch questions) → Plan (terminal only) → Confirm+Execute
- `psychology.md` is a new private file — not mixed into decisions.md or slava-coaching.md

**Alternatives rejected:** Single skill with `--personal` flag — too easy to accidentally route personal content through cp skill in a public session. Notion source — no MCP configured.

**Consequences:** `/claude-conversations-to-pp` triggers `/kdd-private` for decisions with more structure needed. Run weekly or after intense sprints. `psychology.md` created on first run.

**References:** `.claude/commands/slava/maintain/claude-conversations-to-cp.md`, `~/.claude/commands/claude-conversations-to-pp.md`

---

## 2026-03-03 [process]: Agent SDK — not worth learning yet; revisit trigger defined

**Context:** Research session analyzing whether to invest in the Anthropic Claude Agent SDK (`claude-agent-sdk`). Ran three parallel agents: SDK research, usage history analysis (15 recent sessions), and devil's advocate critique.

**Decision:** Do not learn the Agent SDK now. The bottleneck is not "can't run agents without being present" — it's that the standard implementation orchestration ritual is typed manually every session instead of being encoded in a skill. That's a 30-minute skill fix, not a 20-40 hour SDK investment.

**What the Agent SDK actually is:** Claude Code's engine extracted as a callable Python/TS library. Removes the human-at-terminal requirement. Alpha (v0.1.44 as of Mar 2026, active development). Core use: webhook-triggered, scheduled, or background agent execution. Does NOT improve interactive Claude Code workflows.

**Alternatives rejected:** Learning it now "to be prepared" — opportunity cost is a shipped feature. n8n (no-code automation) covers 80% of the use cases without the maintenance overhead.

**Revisit trigger:** When ClarityPledge has a recurring operational task consuming 3+ hrs/week that is well-defined enough to specify as a prompt. Likely candidates: support ticket triage at volume, weekly cohort summaries, nightly codebase health reports.

**Consequences:** No SDK work on the roadmap. Near-term action: build `/dev-ritual` skill encoding the 4-step implementation pattern. Fix `/dev` to auto-trigger `/verify`.

---

## 2026-03-03 [process]: Implementation orchestration ritual — automation debt identified

**Context:** Usage history analysis across 15 recent sessions found that the 4-step implementation ritual is typed fresh every session 10+ times: "implement in subagents → review in agents → improve if needed → /kdd + /ss". It is never encoded in a skill. This is the highest-frequency mechanical step in the workflow.

**Decision:** This is named automation debt. The orchestration pattern is mechanical and identical every session — it does not require judgment. The actual judgment (what to build, design KISS check, architecture) happens before and after this step. A `/dev-ritual` skill should encode it. Not built yet — naming it here so it doesn't stay invisible.

**Alternatives rejected:** Leaving it as-is — repeating the same 8-12 message orchestration sequence for every feature is pure overhead.

**Consequences:** `/dev-ritual` skill is the next process investment after current sprint. Also: `/dev` should auto-trigger `/verify` on completion — history shows `/verify` is regularly forgotten and has to be chased manually ("did you /verify?").

---

## 2026-03-03 [product]: P466 — Certificate-as-form UX model for agreement creation

**Context:** P466 redesigned `create-agreement-page.tsx` (previously a plain form). The goal was to make the creation feel meaningful — like drafting a real document, not filling a form.

**Decision:** The certificate IS the form. Partner name is an inline editable input styled to blend into the certificate body (Playfair Display, blurred border hidden). Email and visibility controls appear below the certificate, outside the document frame. The act of filling in the partner's name happens literally within the agreement text ("We, [Creator] and [Partner input], agree to:").

**Alternatives rejected:** Separate form + preview layout — previews always feel disconnected; any two-panel approach splits user attention. Standard form-above-certificate — certificate becomes decorative, form has lower emotional weight.

**Consequences:** The certificate component gains a `creation` variant. Inline inputs inside certificates must use `border-transparent` at rest (`focus-visible:border-[color]`) so they read as document text when unfocused. `partner_display_name` stored on agreement row for the pending state; replaced by partner profile name post-acceptance.

**References:** `src/app/components/agreements/agreement-certificate.tsx`, `src/app/pages/create-agreement-page.tsx`

---

## 2026-03-02 [product]: Journey collapse threshold — minimum 3 rounds to collapse

**Context:** P469 initially set `hasOlderRounds = explainBackRatings.length > 1`, which fires with 2 explain-back rounds (3 total rows: round 0 + 1 + 2). With 2 rounds, collapse hides exactly 1 row — no meaningful space savings, adds UX friction. User correctly flagged this as a no-op collapse.

**Decision:** Collapse fires only when `explainBackRatings.length > 2` (3+ explain-back rounds = 2+ hidden rows). With 1–2 explain-back rounds all rows render directly.

**Alternatives rejected:** `> 1` threshold — produces "Show 1 earlier round" button that hides one row. Net result: more taps, no space recovery.

**Consequences:** Journey card always shows all rows up to 3 explain-back rounds. Collapse first appears at 4 rows total. `olderRounds` must always compute as `explainBackRatings.slice(0, -1)` — do NOT gate it on `hasOlderRounds`, or intermediate rounds are dropped when threshold isn't met.

**References:** `src/app/components/partners/live-mode-view.tsx` (`hasOlderRounds` constant)

---

## 2026-03-02 [process]: features/ folder convention — root vs drafts vs done

**Context:** fix-kanban session surfaced that `backlog`-status files accumulate in `features/` root alongside active sprint items (`today`, `week`, `in-progress`), and that `fix-frontmatter.py` was reporting false "no valid frontmatter" errors on UAT checklist files in `/uat/` subdirs.

**Decision:** Two rules:
1. **Folder = spec maturity, not status.** `features/` root = fully-specced, sprint-queue items (any status). `features/drafts/` = parked specs not on near-term radar. Moving a spec to drafts signals "not doing this soon", not "not fully written." Backlog files stay in root if they're likely to be picked up within a sprint or two; move to drafts if they're genuinely off the roadmap.
2. **fix-frontmatter.py skips `/uat/` paths.** UAT checklists (`features/uat/p*.md`, `features/done/*/uat/p*.md`) are generated files with no frontmatter by design. The script now excludes them (matches the existing `fix_duplicates` logic).

**Alternatives rejected:** Moving all `backlog` files to `drafts/` automatically — conflates scheduling (status) with spec completeness (folder); promotes a spec would require moving it back.

**Consequences:** fix-kanban output is clean with no false warnings. Folder location is a reliable signal of near-term intent.

**References:** `scripts/fix-frontmatter.py` · `features/drafts/`

---

## 2026-03-02 [process]: Worktree strategy simplified — slots, not feature names

**Context:** Two parallel worktree systems coexisted: old `claritypledge-N` sibling dirs (referenced by `start`/`stop` aliases and `kanban.sh`) and new `.claude/worktrees/<featurename>` (created by Claude). The directories didn't exist so `start w1` silently failed. Feature-named worktrees had no fixed port, so every dev server required manual port hunting. Spec files created from worktrees got trapped on feature branches, causing kanban status drift.

**Decision:** Three rules, all enforced at point of action:
1. **Slot naming** — worktrees always `w1`/`w2`, never feature names. Branch carries the feature: `git worktree add .claude/worktrees/w1 -b feature/pN-description`. Fixed ports: w0=5001, w1=5100, w2=5200.
2. **Spec creation in w0 only** — enforced by worktree guard in `/create-prd`, `/quick-feature`, `/change-request`, `/create-bug`. If Claude runs these from a worktree, it stops and tells you to switch to main first. Exception: `/dev` may update `delivery_stage` in its own spec (merges to main at `/ship`).
3. **Kanban always from w0** — `kanban` reads `features/` from wherever it's launched; running from a worktree gives stale status for all other features.

**Alternatives rejected:** Feature-named worktrees with a port registry — adds indirection, no benefit. CLAUDE.md-only rules — too diluted, doesn't survive compaction; skill-level guards are more reliable.

**Consequences:** `start w1` and `kanban w1` now reliably work. No port hunting. No spec files stranded on feature branches. Kanban is always authoritative from w0.

**References:** [worktree-setup.md](technical/worktree-setup.md) · skills: `build/create-prd.md`, `build/quick-feature.md`, `build/change-request.md`, `build/create-bug.md`, `build/pick-flow/SKILL.md`

---

## 2026-03-02 [product]: ladischenski.com reframed as Calibration Lab facilitation site

**Context:** Site was positioned as a consulting business — €250/hr coaching, €1,500 de-risking package, €3,350 workshop. Slava doesn't believe in the per-session coaching market; it requires selling prevention to people who don't self-identify as at risk.

**Decision:** One CTA: "Join a free Calibration Lab." Services simplified to Free Calibration Lab (acquisition) + Ongoing Retainer (for pairs already using /live). Per-session coaching pricing removed. Site's job is getting co-founder pairs into a room, not selling them packages upfront.

**Alternatives rejected:** Keep consulting pricing, add Calibration Lab as a tier — muddies the message, implies Lab is one of many paid options.

**Consequences:** ladischenski.com is now a workshop facilitation front-end, not a coaching practice. Revenue comes from retainers after product usage is demonstrated, not upfront.

**References:** [ladischenski-com/app/page.tsx](../../ladischenski-com/app/page.tsx) · [lean-canvas.md](lean-canvas.md) Channels section

---

## 2026-03-02 [product]: Partner Agreement is the retention mechanism, not a product ceremony

**Context:** Agreement feature was being built with ceremony framing (certificate frame, HelloSign). The strategic purpose was unclear — was it a nice-to-have flourish, or load-bearing for the product?

**Decision:** Agreement is the retention mechanism. Once a co-founder pair creates an agreement, /live becomes the operationalized practice they committed to — not a tool they tried once. Agreements drive recurring /live usage → positions accumulate → stories get filed → briefing protocol has material to work with. Workshop output = agreement, not just experience.

**Alternatives rejected:** Skipping agreements, going straight to briefing protocol — no retention mechanism means /live remains a one-off; stories don't accumulate; briefing protocol has nothing to send.

**Consequences:** Finishing the agreements feature is P1 before any briefing protocol work. The loop is: Agreement → recurring /live → stories → briefing → new Person B. Each link in the chain is required.

**References:** [c2-workshops.md](milestones/c2-workshops.md) · [hypotheses.md](hypotheses.md) H-AgreementRetention

---

## 2026-03-02 [product]: Briefing protocol promoted to primary cold start; V1 needs only story content

**Context:** Briefing protocol (Stage 0b in theory-of-change) was positioned as one of two parallel cold start paths alongside a coaching cascade via coaches. But no coaches exist. The coaching cascade was a theory, not a mechanism.

**Decision:** Stage 0b (briefing protocol) is the PRIMARY cold start. V1 doesn't need /live session learning — AI generates mirror claims from story content directly. /live session history sharpens claims over time (V2), but the protocol is testable the moment P419 (good story filing) and P458 (anon access) ship. Coaching cascade reframed: workshops → agreements → /live, not coaches → clients → teams.

**Alternatives rejected:** Building the coach partnership channel first — no evidence coaches exist or want to partner; adds dependency on a channel that hasn't been recruited.

**Consequences:** The P471 briefing flow spec is blocked only on P419 + P458. The briefing protocol is the viral growth loop: Person A sends Person B a link → Person B experiences the gap → Person B becomes Person A.

**References:** [theory-of-change.md](theory-of-change.md) Stage 0b · [hypotheses.md](hypotheses.md) H-BriefingProtocol-ColdStart · [p471 spec](../features/p471_briefing_flow_v1.md)

---

## 2026-03-02 [product]: Business model is software product, not coaching practice

**Context:** Strategy had a dual-track: coaching (months 1-6) as revenue bridge, recognition (months 5-12) for thought leadership. The coaching track was accumulating infrastructure (HelloSign, certificate frames, per-session pricing) while the actual software product loop was being deferred. Slava flagged loss of motivation when thinking about selling €1,500 coaching sessions — a signal the model was wrong.

**Decision:** ClarityPledge is a software product. Workshops (Calibration Labs) are free acquisition channels — they get pairs into a room to experience the gap and create a partner agreement. Coaching retainers are valid for pairs who have already demonstrated /live usage (agreement created + 2-3 returns) — not for pairs who just attended a session. The product loop is: Agreement → recurring /live → stories → briefing protocol → new users. Software subscriptions are the long-term model.

**Alternatives rejected:** Coaching-first with software as the long-term bet — Slava doesn't believe in the per-session coaching market; can't sell what you don't believe. Skipping workshops entirely — workshops are the cheapest acquisition channel and generate agreements that drive product adoption.

**Consequences:** All milestones reframed: C2 success metric is agreement creation + /live return rate (not "book paid session"). Retainers (C3) require demonstrated product usage as precondition. Coaching pricing on ladischenski.com removed. Feature priority: finish agreements → P419 → P458 → P471 briefing flow.

**References:** [lean-canvas.md](lean-canvas.md) · [c2-workshops.md](milestones/c2-workshops.md) · [c3-paid-workshops.md](milestones/c3-paid-workshops.md) · [hypotheses.md](hypotheses.md) H-AgreementRetention

---

## 2026-03-02 [process]: Worktree branch deadlock — use `git checkout --detach` to free a branch locked by the main worktree

**Context:** After merging feature/p463 into main (from inside the p465 worktree), the main repo was still checked out on `feature/p463`. `git branch -d feature/p463` failed because the branch was "used by worktree" (the main repo itself). `git checkout main` also failed because `main` was already locked by the p465 worktree. Classic deadlock: branch A locked by main repo, branch main locked by worktree — no path to switch.

**Decision:** `git checkout --detach` on the main repo detaches HEAD from the branch without switching to any tracked branch. This frees the branch for deletion without conflicting with the worktree's lock on `main`. Then `git branch -d` succeeds.

**Alternatives rejected:** Removing the p465 worktree first — would kill the active Claude session running inside it. Checking out a third branch (feature/p469) — works but leaves main repo in unexpected state.

**Consequences:** When a worktree holds `main` and the main repo holds a feature branch after a merge, the cleanup sequence is: `git checkout --detach && git branch -d feature/pN`. No worktree removal needed.

---

## 2026-03-02 [product]: Point card attribution convention — always show "by [name]" when profileOwner is known

**Context:** P465 redesigned the point card footer (unified row, no actor confusion). Post-ship QA revealed that "by [name]" attribution was missing on own profile and at 0 story count — inconsistent with the Stories tab pattern ("x points by [name]"). P469 was filed to correct this.

**Decision:** When `profileOwner` is known (profile-page context), attribution always shows — including at 0 count ("0 stories by Slava" on own, "0 stories by Alice" on other). Zero-count attribution is not hidden. This mirrors the Stories tab convention and prevents the misleading read that "0 stories" belongs to an unknown actor. Attribution is omitted only in context-free views (point detail page, detail-view mode) where no profile owner exists.

**Alternatives rejected:** Show name only when count > 0 — creates asymmetry between zero and non-zero states, and implies "no name = no actor" which is confusing. Hide name on own profile — the Stories tab shows "x points by [your name]" on own profile, and consistency requires the same.

**Consequences:** `PointCardWithLinks` footer logic must always include `by ${profileOwner.name}` when `profileOwner` is defined, regardless of count. The two Cases (own profile, other profile) differ only in whether the viewer CTA appears, not in whether the name appears. See P469 for the full case map.

**References:** [features/p470_point_card_attribution_consistency.md](../features/p470_point_card_attribution_consistency.md)

---

## 2026-03-02 [product]: /live layout — solve space problems by shrinking elements, not reordering components

**Context:** P455 moved story above CTA (story → CTA → journey) to keep CTA visible on 375px mobile. The reorder only helped before hasRatingData; once ratings exist, journey reinserted at top anyway. P468 added per-phase layout rules to fix the inconsistency. Both specs missed that swapping component positions between phases is itself a UX problem — users can't find stable landmarks.

**Decision:** Revert the P455 reorder entirely. Solve screen space directly: shrink ActionArea icon (80px → 48px, −64px), reduce STORY_THRESHOLD (180 → 100 chars, ~−20px), collapse old journey rounds (show latest + "Show N earlier"). Component order stable across all phases: journey (when present) → story → CTA. P468 archived (never shipped, superseded by P469).

**Alternatives rejected:** Per-phase ordering table (P468 approach) — correct in principle but complex; adds rules on top of a broken foundation. Reorder-only (P455 approach) — only helped before first rating existed.

**Consequences:** Any future /live space problem should be solved by element sizing/collapsing before considering reorder. Component positions in /live are now stable — a user always knows where to look.

**References:** [P469 spec](features/p469_live_layout_revert_p455_kiss_fixes.md)

---

## 2026-03-02 [technical]: CSS line-clamp fails silently when character-slice already truncates to the same height

**Context:** P455 added `line-clamp-2` to LiveStoryCardExpanded to make story text compact. It had no visible effect — the "compact" and "full" views looked identical.

**Decision:** Root cause: `story.content.slice(0, STORY_THRESHOLD)` at STORY_THRESHOLD=180 already produces ~2 lines of text. Applying `line-clamp-2` to already-2-line text does nothing. Two truncation systems (JS slice + CSS clamp) on the same element create a silent conflict where the CSS always wins but never fires. Fix: single system only — character slice at STORY_THRESHOLD=100. No CSS clamp.

**Alternatives rejected:** Keep line-clamp-2 and remove character slice — CSS clamp is fragile (font-size, container-width dependent); character slice is predictable.

**Consequences:** When truncating text in a component: use ONE mechanism. If using CSS clamp, don't also slice. If slicing, don't also clamp. Check for existing truncation before adding a new layer.

**References:** `src/app/components/partners/live-story-card-expanded.tsx` — STORY_THRESHOLD constant

---

## 2026-03-02 [technical]: ThreadMessage accepts optional children for embedded interactive content

**Context:** P467 inline rating phase requires a 0–10 button row inside an AI message bubble. Two options: (A) add `children?: React.ReactNode` to `ThreadMessage`; (B) create a new `RatingThreadMessage` variant.

**Decision:** Add `children?: React.ReactNode` to `ThreadMessage`. `children` renders below `content` inside the bubble div; suppressed during `isStreaming`. Keeps single-bubble mental model — one component for all thread messages.

**Alternatives rejected:** New `RatingThreadMessage` variant — duplicates bubble styling, creates two diverging bubble implementations.

**Consequences:** `ThreadMessage` is the single bubble component for all thread content including interactive embeds. Any new interactive thread element (future: image, poll) follows the same pattern.

**References:** [P467 spec](features/p467_chat_context_header_inline_rating.md) · Component Analysis §6

---

## 2026-03-02 [technical]: StoryGuideChat rating phase is thread-native, not a Drawer

**Context:** P425 specified rating prompt inline in thread. Implementation drifted to a bottom Drawer, duplicating the latest draft above rating controls. P467 corrects this.

**Decision:** Remove Drawer from StoryGuideChat entirely. Rating prompt renders as an AI message bubble with embedded 0–10 button row. Both click (immediate send) and type-in-input-bar paths supported. After 2nd iteration, "Save as-is →" escape hatch appears inline below buttons.

**Alternatives rejected:** Keeping Drawer with layout fixes — the Drawer breaks the "single continuous thread" mental model regardless of layout. Two display modes for the same draft (thread + drawer) is inherently confusing.

**Consequences:** Any future rating/feedback UX in chat must be thread-native. No modals, no drawers mid-conversation.

**References:** [P467 spec](features/p467_chat_context_header_inline_rating.md) · Root Cause §4

---

## 2026-03-02 [product]: Context components in focused flows must be scoped to the task, not imported from profile surfaces

**Context:** StoryGuideChat used `PointCardWithLinks` (a profile-page component) as its context card. Because `profileOwner.position` is truthy, the quote pattern fires — showing the user's own name in 3rd person, interactive position buttons, a share button, and story CTA rows. None of these are relevant to the writing task.

**Decision:** Create `ChatContextHeader` — a purpose-built slim component (~48px) showing only: point text (truncated, expandable) + 1st-person position chip ("You agree") + link to point detail. No avatar, no position buttons, no share, no CTAs.

**Alternatives rejected:** Passing flags (`hideActions`, `liveSessionMode`) to `PointCardWithLinks` — too many suppression flags, component was designed for a different actor model (viewing others' positions, not your own in a writing context).

**Consequences:** Profile-page components stay on profile pages. Focused-flow pages get purpose-built context headers scoped to the task. Reuse is wrong when the component's design assumptions don't match the consumer's context.

**References:** [P467 spec](features/p467_chat_context_header_inline_rating.md) · Root Cause §4

---

## 2026-03-02 [process]: spec-review mandatory gate in CLAUDE.md + decompose pre-flight

**Context:** P465 spec had 3 BLOCK issues (component name mismatch, missing state initialization, test gap) that existed at /decompose time — they only got caught because the session started with a spec-review fix pass. The spec had passed prior /spec-review with `NEEDS FIXES` unaddressed. Two gaps: (1) CLAUDE.md footnote used `*` marker on spec-review, making it read as optional like /decompose; (2) /decompose pre-flight only gated on `## Technical Analysis` presence, not on a clean spec-review verdict.

**Decision:** Two fixes — (1) CLAUDE.md Sequential Flow footnote: removed `*` from `/spec-review`, now reads "mandatory — always run after /generate-tests, before /decompose or /dev. A spec with BLOCK findings must not proceed." (2) decompose.md Pre-Flight Check: added second required gate — spec must have `## Spec Review` section with `READY` verdict before task manifest is generated. Explicit error message: "NEEDS FIXES → Run /spec-review and fix all BLOCK findings first."

**Alternatives rejected:** Proposed #1 (stub missing symbol rule in Commit Discipline) and #2 (infra changes must be on main) and #4 (close infra protocol with step 5) — all FAILED adversarial review. #1 too prescriptive (stub is wrong fix when real implementation is needed). #2 too broad (infra changes scoped to a feature branch are sometimes legitimate). #4 BUBBLES UP section created a new open loop.

**Consequences:** /decompose now has two hard stops: no Technical Analysis = run /architect first; no READY spec-review = run /spec-review first. BLOCKs that reach decompose time have no path forward except fixing the spec.

**References:** [CLAUDE.md](../CLAUDE.md) · [decompose.md](.claude/commands/slava/build/decompose.md)

---

## 2026-03-01 [process]: Two-agent plan/critique workflow for spec-review + decompose

**Context:** Running `/spec-review` and `/decompose` on P465 — a complex feature with DB migration, 3+ component surfaces, and 7 architectural decisions. Question: should one agent just do both, or is a review loop valuable at the spec level?

**Decision:** Split into Plan agent (produces findings + decompose breakdown) → Critique agent (verifies claims against actual files, corrects wrong severity ratings, reorders tasks, finds missing tasks) → main session implements the improved output. Critique agent caught 5 concrete errors: severity downgrade on F-1, wrong task ordering (helper fix before migration), Tasks 5+6 should merge, missing interface-update sub-step, missing `delivery_stage` update task.

**Alternatives rejected:** Single agent doing spec-review + decompose in one pass — produces an unchecked plan that may contain wrong assumptions. Running spec-review and decompose as sequential skills without critique — doesn't catch inter-step errors like task ordering or wrong severity.

**Consequences:** Two-agent review loop is now the preferred pattern for spec-review + decompose on features with 5+ files or DB migrations. Adds ~5 minutes; catches ordering and assumption errors before implementation. For small features (`flow: fix` or `flow: quick-feature`), not worth the overhead.

**References:** P465 spec [Spec Review section](features/p465_point_card_footer_redesign.md)

## 2026-03-01 [process]: Subagent autonomy boundary — NO-COMMIT in spawn prompts, not only in git.md

**Context:** Subagents spawned by `/kdd` steps 6 and 7 (meta-reflection + skill-quality) were given instructions to "apply fixes directly if any." They interpreted this as license to commit — sweeping in unrelated working-tree files (features/uat/p463.md, profile-connections-page.tsx) under wrong commit messages, and committing without being asked. The root cause: git.md bans `git commit from inside a subagent`, but subagents don't auto-load `.claude/rules/git.md` — the rule was invisible to them. The "apply fixes" wording created an implicit commit mandate.

**Decision:** Embed an explicit NO-COMMIT instruction directly in the subagent task prompts in kdd/SKILL.md steps 6.1 and 7: "Do NOT edit files, stage, or commit anything — return text only." / "Do NOT edit files, stage, or commit anything." This makes the constraint visible at the spawn point regardless of which rules files load. Applicable pattern: any skill that spawns a subagent to "propose" or "apply" changes must explicitly constrain commit behavior in the prompt, not rely on git.md auto-loading.

**Alternatives rejected:** Adding a global "no-commit" preamble to all subagent prompts via a rules file — subagents don't load rules files, so this doesn't reach them. Relying on the git.md banned-commands table alone — same problem.

**Consequences:** Future subagents spawned by /kdd steps 6+7 return text only. Any new skill that spawns a "fix-applying" subagent should include the same NO-COMMIT line. The pattern generalizes: constraints that must reach subagents must be in the spawn prompt, not in auto-loaded rules.

**References:** [.claude/commands/slava/maintain/kdd/SKILL.md](.claude/commands/slava/maintain/kdd/SKILL.md) · [.claude/rules/git.md](.claude/rules/git.md)

---

## 2026-03-01 [product]: Story edit from point card routes to /story/:storyId, not /chat

**Context:** P465 spec (point card footer redesign) added an edit pencil icon for a viewer's existing story on a point card. Initial spec drafts routed the edit action through `/chat` (AI-assisted editing via StoryGuideChat), with load-time detection of an existing story to enter "edit mode". This was caught during /spec-review: the `/chat` edit-mode logic was unspecified, and Decision 3 contradicted UX Flow 2 and the component analysis table in 4 places.

**Decision:** Edit pencil navigates to `/story/:storyId` — the existing story editor on `story-detail-page.tsx`. The `/chat` load-time edit detection is explicitly out of scope for P465.

**Alternatives rejected:** Routing through `/chat` with `isEditMode` prop and `existingStory` preload — would require StoryGuideChatPage to detect existing story on mount, initialize directly at `polish` phase, and suppress brain-dump triggers. Valid capability but adds scope not justified by the footer redesign goal.

**Consequences:** Story editing from point card context is consolidated on `story-detail-page`, consistent with all other edit-story entry points. `/chat` remains a new-story-only flow until a dedicated "AI-assisted story editing" feature scopes it properly. `StoryGuideChat.tsx` and `story-guide-chat-page.tsx` are out of scope for P465.

**References:** [features/p465_point_card_footer_redesign.md](features/p465_point_card_footer_redesign.md)

---

## 2026-03-01 [process]: pick-flow — delivery_stage precedence + flow: value constraint

**Context:** Two bugs in `/pick-flow` SKILL.md discovered:
(1) Agents were writing the full command chain (e.g., `/quick-feature → /dev`) into spec `flow:` frontmatter instead of the tier identifier (`dev`, `fix`, etc.) — because the output template format `→` chain looked like the expected value.
(2) The scoring table had no rows for `delivery_stage: 1-prd` or `2-ux-done`, causing agents to recommend the full pipeline from scratch on mid-pipeline specs. Only `3-arch-review`+ stages were represented via `test_files:` proxy.

**Decision:** Three targeted edits to SKILL.md: (1) Hard rule added: "write exactly one of: fix, dev, inline, quick-feature — never the command chain string." (2) Hard rule 144 updated to give `delivery_stage:` precedence over `test_files:` fallback. (3) Two explicit scoring table rows added: `delivery_stage: 3-arch-review` → resume from `/generate-tests`; `delivery_stage: 2-ux-done` → resume from `/architect`; `delivery_stage: 1-prd` → resume from `/ux` or `/architect`.

**Alternatives rejected:** Adding a new "Step 0.5" section with a 4-row mapping table — adversarial review (BUBBLES UP) + two parallel critique agents converged: root causes were narrow enough for targeted inline fixes, not a new section.

**Consequences:** Agents reading pick-flow now write correct `flow:` values and won't restart a mid-pipeline spec from scratch. `delivery_stage:` is the primary routing signal when present.

**References:** [.claude/commands/slava/build/pick-flow/SKILL.md](.claude/commands/slava/build/pick-flow/SKILL.md)

---

## 2026-03-01 [process]: pre-commit lint auto-fix clears non-TS staged files in separate processes

**Context:** When running `git add non-ts-file` in one process and `git commit` in a separate background process, the pre-commit script's lint auto-fix (`xargs git add $STAGED_TS`) re-stages only the TS files it fixed. If CLAUDE.md or .md skill files are staged before the pre-commit runs, the `xargs git add` on TS-only files leaves the non-TS files in a transient state — they vanish from the commit. Resulted in two empty commits (`f290fadc`, `da685ffa`) with correct commit messages but no file changes.

**Decision:** Always stage non-TS files and commit in a single atomic `git add ... && git commit` command. Never split into `git add` (one process) → `git commit` (separate background process) when non-TS files are involved. The pre-commit script's re-stage loop only runs on TS/JS files and will not preserve .md files staged in a parent process.

**Alternatives rejected:** Modifying pre-commit to preserve all staged files — touches shared infra, higher risk.

**Consequences:** Atomic `git add ... && git commit` in one shell command is the reliable pattern for mixed-type commits (md + ts). Split processes for staging + committing is unsafe when pre-commit modifies the index.

---


**Context:** P467 needed a rating phase rendered as an AI message bubble with embedded 0-10 buttons. Two options: create a new `RatingThreadMessage` variant (duplicate the bubble layout) or extend `ThreadMessage` with a `children?: React.ReactNode` prop. The spec initially left this ambiguous.

**Decision:** `ThreadMessage` accepts `children?: React.ReactNode`. Children render below `content`, suppressed during `isStreaming`. Keeps single-bubble mental model — one component handles all thread messages regardless of embedded content. `RatingButtons` from `partners/shared.tsx` is reused and extended with a `fullWidth` prop to remove `max-w-sm` cap when embedded in a chat bubble.

**Alternatives rejected:** New `RatingThreadMessage` component — duplicates bubble layout and adds component proliferation for what is structurally the same element. Rendering rating buttons outside the bubble — breaks the visual thread metaphor.

**Consequences:** Any future interactive content in chat threads (thumbs, reaction picker, inline forms) follows the same pattern: extend `ThreadMessage` with `children`, suppress during streaming. `RatingButtons` `fullWidth` prop is now part of the shared API — test that default (constrained) still works for partner form usage.

**References:** [features/p467_chat_context_header_inline_rating.md](../features/p467_chat_context_header_inline_rating.md)

---

## 2026-03-02 [technical]: StoryGuideChat rating phase is thread-native (AI bubble), not a Drawer

**Context:** P425 specified inline rating. The shipped implementation used a Drawer — implementation drift from the spec. P467 was filed as a change-request to restore the original intent. During /ux, two options were considered: keep Drawer (lower implementation cost) or restore inline (correct product behavior).

**Decision:** Drawer removed entirely. Rating phase renders as an AI message bubble with embedded `RatingButtons` (0-10 row). Both click and keyboard/type-input paths supported. The bubble appears in the thread after the AI's final message — continuous scroll, no modal layer.

**Alternatives rejected:** Drawer retained — misrepresents the product as having a modal interrupt in what should be a continuous conversation. Drawer as fallback for mobile — adds conditional complexity with no validated need.

**Consequences:** Any future rating or scoring UI in StoryGuideChat must be thread-native first. The Drawer import is removed from the chat page. If a Drawer is needed for a genuinely separate concern (settings, share), it must not be reused for inline-intent flows.

**References:** [features/p467_chat_context_header_inline_rating.md](../features/p467_chat_context_header_inline_rating.md)

---

## 2026-03-02 [product]: ChatContextHeader design principle — context components in focused flows must be scoped to the task, not imported from profile surfaces

**Context:** P425 used `PointCardWithLinks` as the context header in `/chat`. That component is a profile-surface component: it renders quote pattern, share button, position buttons, and story CTAs — all profile-page concerns. In the chat context, only three things matter: the point text, the user's 1st-person position chip, and a link to `/point/:id`. The quote pattern was firing because `profileOwner.position` was truthy — wrong component in wrong context.

**Decision:** `ChatContextHeader` is a new, scoped component. It does not extend or wrap `PointCardWithLinks`. It renders: point text, 1st-person position chip ("You agree" / "You disagree" / "You're unsure"), and a link to the point detail page. Profile-surface concerns (share, story CTA, position buttons) are absent by design, not hidden via flags. `PositionBadge` (3rd-person) is replaced with a 1st-person chip local to the header.

**Alternatives rejected:** `PointCardWithLinks` with feature flags to suppress profile UI — `hideActions`, `hideShare`, `hideStory` proliferation. Shared context component with mode prop — same problem, different spelling.

**Consequences:** Any feature that displays a point in a focused flow (chat, guided exercise, onboarding step) should build a purpose-scoped header, not adapt the profile card. The rule: if the user is doing a task, show only what serves that task. Profile UI belongs on profile pages.

**References:** [features/p467_chat_context_header_inline_rating.md](../features/p467_chat_context_header_inline_rating.md)

---

## 2026-03-02 [process]: UAT gate without /verify leaves visual bugs undetected

**Context:** P465 dev run completed, set `delivery_stage: uat` correctly, all 885 unit tests green. But `/verify` was never run. Screenshots taken during manual UAT revealed 7 bugs: duplicate P451 button, Back button non-clickable, share icon too small, story shown twice on own profile, wrong attribution context, nonsensical nested layout, stray edit hint. These are layout/rendering bugs that tests cannot catch — they only surface visually.

**Decision:** After `/dev` sets the UAT gate, `/verify` must run before handing off to human UAT. "Tests pass" is necessary but not sufficient for UI-heavy features. The UAT file (e.g., `features/uat/p465.md`) is the checklist, but `/verify` is the minimum automated visual pass that precedes it.

**Alternatives rejected:** Relying on unit tests alone — they validate data pipelines and constraints, not layout. Trusting "ready for UAT" commit message — that message was set by `/dev`, which doesn't run a browser.

**Consequences:** Add `/verify` as a required step between `/dev` completing and declaring "ready for human UAT." Optional-post-work becomes mandatory-pre-UAT for any feature that touches UI layout. The 5-why: session ended after dev finished; no external signal that `/verify` was still pending.

**References:** [features/p465_point_card_footer_redesign.md](../features/p465_point_card_footer_redesign.md)

---

## 2026-03-02 [technical]: point-detail-page.tsx has a separate CTA path from point-card-with-links.tsx

**Context:** P456 and P465 redesigned the story CTA in `point-card-with-links.tsx` (component-level). But `point-detail-page.tsx` renders the point detail view directly (not via the component) and had its own legacy P451 "Tell your story →" button at the page level. When P465 dev ran, the component was updated but the page-level button was not removed — P456/P465 work didn't cover this path.

**Decision:** Removed the P451 button from `point-detail-page.tsx` in UAT fix commit (cc65f783). The page-level CTA in `point-detail-page.tsx` lines 367-378 was dead code since the P465 CTA is inside the card footer.

**Alternatives rejected:** None — the page already had the correct P465 CTA inside the card; the P451 button was pure duplication.

**Consequences:** Any future CTA/footer redesign must audit BOTH the component path (`point-card-with-links.tsx`) AND the page path (`point-detail-page.tsx`). They render the same entity differently. Add this as a search step: `grep -r "Tell your story\|add story" src/app/pages/`.

**References:** [features/p465_point_card_footer_redesign.md](../features/p465_point_card_footer_redesign.md)

---

## 2026-03-02 [technical]: story_versions INSERT RLS — use `current_user = 'postgres'` for trigger-context branch

**Context:** `story_versions` has RLS enabled. The SECURITY DEFINER trigger `create_initial_story_version` runs as the `postgres` role (not `auth.uid()`). With no INSERT policy, the trigger was blocked (error 42501). Initial fix used `auth.uid() IS NULL` to allow the trigger-context branch, but this also matched anonymous API callers (anon role — no JWT sub claim), creating an unauthenticated-insert loophole.

**Decision:** Scope the trigger-context branch to `current_user = 'postgres'`. In Supabase, SECURITY DEFINER triggers run as the `postgres` role; anonymous API callers run as the `anon` role. Only postgres can satisfy this check, closing the loophole. Pattern: `current_user = 'postgres' OR EXISTS (SELECT 1 FROM stories WHERE stories.id = story_id AND stories.author_id = auth.uid())`.

**Alternatives rejected:** `auth.uid() IS NULL` — too broad, matches anon callers. `SECURITY DEFINER` on the RLS function — doesn't apply to policy conditions. BYPASSRLS for postgres — correct but requires superuser grant not available on Supabase free tier.

**Consequences:** Any future INSERT policies on tables written to by SECURITY DEFINER triggers must use `current_user = 'postgres'` (not `auth.uid() IS NULL`) for the trigger-context branch.

**References:** [supabase/migrations/20260302130000_story_versions_insert_policy_v2.sql](../supabase/migrations/20260302130000_story_versions_insert_policy_v2.sql)

---

## 2026-03-01 [process]: UAT branch stranding — pre-deletion diff gate + /kdd branch-awareness warning

**Context:** `docs/ux-patterns.md` (266 lines of navigation architecture) was written during UAT for p422-p425, landed on the UAT branch, and was lost when that branch was deleted without checking for unreleased commits. 5-Why root cause: branch deletion had no "diff vs main" gate. The /kdd skill had no branch-awareness check, so KDD entries written on UAT branches were stranded silently.

**Decision:** Two-layer safeguard. (1) `docs/technical/git-workflow.md` — added "Before Deleting Branches" section with single-branch and bulk-sweep loops that print commits not in main. (2) `/kdd` skill — added Step 0: reads current branch, warns if not `main` or `feature/*`, gives exact stash-checkout-write sequence to redirect KDD to a safe branch. Non-blocking — user decides. Recovered lost file from `git log --all` commit `2c4b74f2`.

**Alternatives rejected:** Hard block on branch deletion — too aggressive, can't be enforced by the skill alone. Moving all KDD to main always — breaks feature-branch dev flow.

**Consequences:** Any future branch deletion should include the diff loop. /kdd warns proactively if the branch looks throwaway. Stranded docs should now surface before deletion, not after.

**References:** [docs/technical/git-workflow.md](technical/git-workflow.md) · [.claude/commands/slava/maintain/kdd/SKILL.md](../.claude/commands/slava/maintain/kdd/SKILL.md)

---

## 2026-03-01 [product]: Brand separation — ClarityPledge (platform) vs ladischenski.com (coaching)

**Context:** ClarityPledge and the co-founder coaching practice on ladischenski.com were treated as one brand. As the coaching practice grew into a distinct offering (€500 sessions, retainer, workshop), conflating the two created positioning confusion — "ClarityPledge" sounds like a B2B SaaS product, not a coaching relationship.

**Decision:** Formal brand separation. ClarityPledge = platform brand (like Stripe — invisible infrastructure, known to practitioner). ladischenski.com = Slava's personal coaching brand (like Patrick Collison — person-led, trust-based). Each brand has a distinct audience entry point: ladischenski.com intake call → coaching engagement → tool-assisted sessions using ClarityPledge. Documented in `lean-canvas.md` Unfair Advantage section.

**Alternatives rejected:** Single brand — dilutes personal trust signal. Rename ClarityPledge to a personal brand — loses the "bigger than one person" positioning for future scale.

**Consequences:** Marketing, copy, and positioning for coaching work should reference ladischenski.com, not ClarityPledge. ClarityPledge copy should read as a platform/tool, not as "Slava's thing." UVP doc notes external label: "Co-founder De-Risking" (jargon-free framing for coaching offer).

**References:** [docs/lean-canvas.md](lean-canvas.md) · [ladischenski.com](https://ladischenski.com)

---

## 2026-03-01 [product]: False Agreement — named as the central problem ClarityPledge solves

**Context:** The product focused on "calibrated communication" as the value prop. Conversations surfaced that the real enemy — the specific failure mode users fear — had no name. It was described circularly as "thinking you're aligned when you're not."

**Decision:** Name the problem: **False Agreement** — state where two parties believe they have aligned but the alignment was never verified. Mechanically produced by: ambiguous language (both map different meanings to the same words), social pressure (both avoid revealing divergence), and attention gaps (both assume the other is tracking). Distinct from disagreement: harder to detect, more dangerous because it masquerades as success. Documented in `docs/definitions.md`. Cross-referenced in `lean-canvas.md` Problem section and `docs/theory-of-change.md`.

**Alternatives rejected:** "Misalignment" — already used loosely everywhere, no precision. "Communication failure" — too broad, doesn't capture the false-positive nature of the state.

**Consequences:** All product copy, UX writing, and future specs can now reference "False Agreement" as a shared term. Replaces the circular description. Hypothesis H-MetaEpistemic-Prerequisite (P421 Mini Pledge) is now framed as a prerequisite for exiting False Agreement — documented in `docs/hypotheses.md`.

**References:** [docs/definitions.md](definitions.md) · [docs/lean-canvas.md](lean-canvas.md) · [docs/hypotheses.md](hypotheses.md)

---

## 2026-03-01 [technical]: P465 — viewer story count via secondary batch query on other-profile surfaces

**Context:** On other-profile surfaces, `filteredStories` in `point-card-with-links.tsx` is pre-filtered to the profile owner's stories upstream. `viewerStoryCount` was therefore always 0 on other profiles — viewer's own linked stories were never surfaced.

**Decision:** Secondary batch query at profile-page load time, scoped to `currentUserId` and the page's `pointIds`. Uses `story_points WHERE author_id = currentUserId AND point_id IN (...)` — follows existing P134/P151 batch-loading pattern. Produces `viewerStoryCountMap: Map<pointId, number>` without touching the main owner-story pipeline.

**Alternatives rejected:** Per-card fetch — N+1 problem. Fetching entire viewer story library then filtering — unbounded as library grows.

**Consequences:** Other-profile surfaces can now show "2 stories by Alice · 1 by you" and suppress the CTA when viewer already has a story. No new service method for main pipeline — secondary query is optional and only fires when `currentUserId !== profile.id`.

**References:** [features/p465_point_card_footer_redesign.md](../features/p465_point_card_footer_redesign.md)

---

## 2026-03-01 [technical]: P465 — 1 story per user per point via author_id denormalization + UNIQUE constraint

**Context:** `story_points` had `PRIMARY KEY (story_id, point_id)` but no unique constraint on `(author_id, point_id)`. Cross-table uniqueness (via `stories.author_id`) is not natively enforceable in PostgreSQL. Multiple stories from the same user per point were technically possible.

**Decision:** Denormalize `author_id` into `story_points` and add `UNIQUE(author_id, point_id)`. Migration backfills from `stories.author_id`, detects and auto-resolves violations (keep oldest), then adds NOT NULL + UNIQUE constraint + index. `linkPointToStory` updated to include `author_id` in INSERT.

**Alternatives rejected:** Application-level check only — not safe, race condition possible. Separate junction table — adds complexity for no gain.

**Consequences:** DB enforces 1 story per user per point. Existing 23505 error handling in `linkPointToStory` (returns `true` idempotently) continues to work. New index on `story_points(author_id)` enables the secondary viewer query efficiently.

**References:** [features/p465_point_card_footer_redesign.md](../features/p465_point_card_footer_redesign.md)

---

## 2026-03-01 [process]: /change-request skill — standalone filing path for shipped design corrections

**Context:** No process existed for "shipped feature, design was wrong." Bugs went to `/fix`. New capability went to `/create-prd`. Design corrections (wrong ordering, actor confusion, duplication) had no path — they were filed ad-hoc or misclassified as bugs.

**Decision:** Created `/change-request` as a standalone skill (v2.0.0). Distinguishing features vs `/create-prd`: mandatory predecessor spec analysis via subagent (identifies which AC/JTBD/requirements are superseded, not just "what changed"), `type: change-request` in frontmatter, `changes: pN` + `superseded_by: pN` cross-linking, "Predecessor Sections Superseded" table in spec. Added `type: change-request` as first-class kanban type (purple chip, `[CR]` prefix). Critical fix: `VALID_TYPE` in `scanner-rules.ts` must include the new type or server strips it on scan.

**Alternatives rejected:** Reuse `/create-prd` — loses predecessor traceability. Tag-only distinguisher (`source: sim` pattern) — fails when multiple filing paths exist; invisible on a crowded board.

**Consequences:** Three-way filing decision is now unambiguous: broken code → `/fix`, new capability → `/create-prd`, shipped design wrong → `/change-request`. Future redesigns have a traceable chain via `changes:` + `superseded_by:` frontmatter fields.

**References:** [.claude/commands/slava/build/change-request.md](.claude/commands/slava/build/change-request.md) · [.claude/rules/features.md](.claude/rules/features.md)

---

## 2026-03-01 [process]: /claude-md gate is now mechanical via .claude/rules/rules.md

**Context:** The CLAUDE.md rule "Before editing CLAUDE.md or .claude/rules/*.md: Run /claude-md first" was pure discipline — no mechanical enforcement. 5-why root cause: the guard system had guards for leaf paths (sifter, skills, features, src) but not for the meta-infrastructure itself. Cobbler's-shoes failure. Discovered when /kdd reflection surfaced that .claude/rules/ files were edited in this session without running /claude-md.

**Decision:** Created `.claude/rules/rules.md` with `paths: CLAUDE.md + .claude/rules/**/*.md`. Any agent editing these files now receives the hard-stop instruction automatically. Also fixed `skills.md` which claimed to auto-load for `.claude/commands/slava/**/*.md` but had no `paths:` frontmatter block — it was broken and never firing.

**Alternatives rejected:** Adding a pre-commit hook — fires too late (after the write, not before). Relying on CLAUDE.md text alone — shown to fail under context pressure and post-compaction continuation.

**Consequences:** /claude-md gate is now mechanical for its intended scope. The same pattern can be applied to any other discipline-only rule that keeps getting skipped — convert it to a path-triggered rule file. skills.md now actually fires when editing skill files (was silently broken).

**References:** [.claude/rules/rules.md](.claude/rules/rules.md) · [.claude/rules/skills.md](.claude/rules/skills.md)

---

## 2026-03-01 [process]: Three mechanical guards against project root pollution

**Context:** Root analysis found 3 distinct accumulation patterns: (1) 15 empty dirs from a botched `restic` command run inside the project dir on Feb 26 — shell interpreted args as dir names; (2) 90 tracked files across dead tool dirs (.agents, .aider, .bmad, .cursor, .opencode) from tool migrations that had no teardown step; (3) one-time migration scripts sitting in `scripts/` root with no archive prompt. 5 whys traced all three to the same root: tool adoption has a workflow, tool retirement has none; shell commands have no guard against wrong-directory execution; script archival convention exists but has no trigger.

**Decision:** Three mechanical fixes: (1) CLAUDE.md "Retiring a Tool" section — explicit 3-step checklist (`git rm --cached --ignore-unmatch`, `rm -rf`, `.gitignore` entry) with instruction to do all 3 in the same session; (2) `pre-commit-checks.sh` check #18 — warns when scripts named with one-time patterns (migrate*, reclassify*, backfill*, etc.) are staged in `scripts/` root rather than `scripts/archive/`; (3) `restic()` guard in `~/.zshrc` — warns before running restic from inside a git repo (TTY-gated to avoid hanging in non-interactive contexts).

**Alternatives rejected:** Documentation-only (relies on discipline, doesn't catch it mechanically). Shell alias for restic (functions shadow the command cleanly; alias doesn't support TTY check). Pre-commit block instead of warning for script names (too aggressive — legitimate scripts like `migrate.sh` share naming patterns).

**Consequences:** Tool migrations now have a teardown checklist. One-time scripts get a nudge at commit time. Shell commands from inside the project dir prompt before proceeding. Note: restic guard in `~/.zshrc` is user-local (not repo) — agents won't have it; the CLAUDE.md checklist is the agent-side equivalent.

**References:** [CLAUDE.md — Retiring a Tool](../CLAUDE.md) · [pre-commit-checks.sh](../scripts/pre-commit-checks.sh) · `~/.zshrc`

---

## 2026-03-01 [process]: Sifter privacy hardening — three additional mechanical guards added

**Context:** After moving session files to `.private/` and updating sifter skill paths, three gaps remained: (1) sifter-story.md had no explicit stop preventing a future agent from accidentally writing to `content/sifter/sessions/`; (2) the privacy skill didn't scan `content/sifter/` (only `content/articles/`); (3) no auto-loaded rules file existed for `content/sifter/**` paths — so any edit in that area would receive no privacy context.

**Decision:** Added three mechanical guards: (1) Explicit "Path Verification" section at the top of `sifter-story.md` with correct vs wrong paths side-by-side and a hard-stop instruction; (2) `content/sifter/` added to privacy SKILL.md scan scope with note that any `.md` file found there is a misplaced session file; (3) New `.claude/rules/sifter.md` auto-loaded for `content/sifter/**/*.md` — explains the boundary, provides recovery steps, and defines what legitimate public content looks like in that path.

**Alternatives rejected:** Removing `content/sifter/` entirely — would break any future structural/config files. Relying on the gitignore alone — gitignore prevents leaking, but doesn't prevent the write in the first place; the guard must be earlier.

**Consequences:** Three-layer defense for sifter session privacy: gitignore (leak prevention) + path guard in skill (write prevention) + auto-loaded rules (context injection). Future sessions touching `content/sifter/` will receive the rules file automatically. Privacy skill will flag any stray session file if it appears in `content/sifter/`.

**References:** [sifter-story.md](.claude/commands/slava/content/sifter-story.md) · [privacy/SKILL.md](.claude/commands/slava/maintain/privacy/SKILL.md) · [.claude/rules/sifter.md](.claude/rules/sifter.md)

---

## 2026-03-01 [process]: Sifter session files and content article drafts are privacy risk zones — structural fix applied

**Context:** Sifter session files (`content/sifter/sessions/`) were in the public git repo. They contained an "Interaction Log" section tracking agent working steps — including real names and verbatim private messages used as source material. Root cause (5 Whys): the session file template conflated private process metadata (NVC extraction, source references, real names) with publishable output (story, points). The privacy skill didn't scan `content/` paths, so it missed this. Similarly, `content/articles/` draft files had no rule preventing process notes (outreach emails, approval tracking) from landing in the public file.

**Decision:** Three structural fixes: (1) All sifter session files moved to `.private/sifter/sessions/` (gitignored). Sifter skills updated to use this path. (2) `content/sifter/sessions/` added to `.gitignore`. (3) Privacy skill scan scope expanded to include `content/articles/`. Auto-loaded rule added to `.claude/rules/content.md`: process notes (contact info, outreach tracking, approvals) must go to `.private/articles/{a-number}_notes.md`, never inline in article files. History scrub deferred — see `.private/docs/business/git-history-scrub-todo.md`.

**Alternatives rejected:** Moving sifter skills to global `~/.claude/` — skills are just instructions with no PII, gain nothing privacy-wise, lose version control. Moving article drafts to `.private/` — breaks kanban which reads `content/articles/`. Two-file pattern for every article — over-engineered for the frequency of the problem.

**Consequences:** Sifter sessions are now machine-local (not synced across devices via git). This is acceptable — sessions are scratch pads; once the story is approved and in Supabase, the session file is no longer needed. Workflow unchanged: same skill commands, same kanban, same article paths. Privacy skill now catches the category of issue that caused the original leak. No changes to insight-post, LinkedIn creation, or any build skills.

**References:** [.private/docs/business/git-history-scrub-todo.md](.private/docs/business/git-history-scrub-todo.md) · [.claude/rules/content.md](.claude/rules/content.md) · [maintain/privacy/SKILL.md](.claude/commands/slava/maintain/privacy/SKILL.md)

---

## 2026-03-01 [process]: /verify is the natural trigger for /ship — not a separate optional step

**Context:** After a feature is implemented and UAT-gated, the sequence is: run `/verify` (live browser UAT) → if passes → run `/ship`. But `/ship` and `/verify` are disconnected — `/ship` doesn't prompt for `/verify`, `/verify` doesn't call `/ship`, and `/ss` doesn't surface "verify passed" as a feature state. The result: `/verify` gets skipped or forgotten, `/ship` gets run blind.

**Decision:** `/ship` step 10 should actively prompt: "Run /verify first? (visual QA of the live site)" — making it a first-class decision point, not a passive note. `/ss` should surface delivery_stage as "uat — verified" vs "uat — unverified" once /verify is run on a feature. The three-step rhythm is: `/dev` (UAT gate) → `/verify` (live QA) → `/ship` (close spec).

**Alternatives rejected:** Keeping /verify as a passive suggestion — easily skipped, no process anchor. Auto-running /verify inside /ship — too opinionated; backend-only changes don't need it.

**Consequences:** /ship step 10 needs rewording to prompt for /verify. /ss needs a "verified" state tracked somewhere (process-learnings.md or .private/ note per feature). This makes the three-step delivery rhythm explicit.

**References:** [build/ship.md](.claude/commands/slava/build/ship.md) · [build/verify.md](.claude/commands/slava/build/verify.md)

---

## 2026-03-01 [product]: Session-start shared goal reaffirmation (mini pledge) as Pinker common knowledge mechanism

**Context:** Two real clarity sessions surfaced the same failure mode: partners entered a session with divergent implicit goals (one seeking emotional validation, one seeking cognitive precision). No mechanism exists to align them before the session begins.

**Decision:** Added to P421 (Pre-Session Safety Check) as a concrete operationalization of the "commitment ritual" open question: a lightweight step where both participants explicitly commit that their shared goal for the session is *cognitive understanding* (not agreement, not emotional resolution). The act of committing together creates Pinker's common knowledge — both know it, and both know the other knows it. This is what creates psychological safety, not private intent alone.

**Alternatives rejected:** Making it part of the agreement flow (one-time only) — misses the safety function that repeats each session. Skipping it and trusting implicit alignment — this is exactly the failure mode observed.

**Consequences:** P421 now has a concrete mechanism for the commitment ritual. The mini pledge should link to the sister story point (three meanings of "understand") so "cognitive understanding" carries a shared definition. Design still open: same UI step as safety check, or separate micro-step.

**References:** [p421_presession_safety_check.md](features/drafts/p421_presession_safety_check.md)

---

## 2026-03-01 [product]: ITT/RITT framework formalized as 8 shareable claims in philosophy.md

**Context:** The meta-epistemology had been described abstractly (postulates, hypotheses). A set of 8 sequenced claims — from "problems require knowledge" through "trust based on RITT performance" — now exists in a form that can be shared as profile stories/points.

**Decision:** Filed the 8 claims in `docs/philosophy.md` under "Formalized Claims (ITT/RITT Framework)" and created P464 to track turning them into profile story/point pairs. The claims are numbered and build on each other (#1 → #8); profile ordering should follow the logical chain.

**Alternatives rejected:** Keeping them as abstract postulates only — not shareable in clarity sessions. Filing each as a separate spec — unnecessary overhead for content work.

**Consequences:** P464 is now the single tracking item for all 9 content pieces (8 ITT/RITT claims + "understanding precedes control" entry point). philosophy.md is the source; P464 tracks filing them as profile content.

**References:** [docs/philosophy.md](docs/philosophy.md) · [p464_understanding_precedes_control_story.md](features/drafts/p464_understanding_precedes_control_story.md)

---

## 2026-03-01 [process]: Docs commits have no independent path to main — structurally coupled to branch fate

**Context:** Branch cleanup audit discovered `p422-p425-uat` had 5 stranded commits (including `docs/ux-patterns.md` 266 lines, 4 `decisions.md` KDD entries, `/ship` skill guard, `/ss` stash check) not on main — 3 days after features shipped. Root cause (5 Whys): docs/KDD commits made on the UAT branch while feature development continued on a separate branch. When the feature shipped via a different branch, the UAT branch was abandoned without cherry-picking.

**Decision:** Three structural fixes applied: (1) `/dev` UAT gate message now explicitly names spec closure as /ship's job and warns about manual-merge consequences; (2) `/ship` skill gets a divergence-check step 1a with a `spec-only` escape hatch for already-merged branches; (3) `/day-start` gets a stranded-spec check (2b) that cross-references open specs against existing branches. /day-start also corrects the "ready to /ship?" suggestion to distinguish branch-exists vs branch-already-merged.

**Alternatives rejected:** "Be more careful" — not mechanical. `Persist: main` commit trailer — overhead per commit, no tooling yet. Rescue-branch read-only convention — hard to enforce in agent sessions.

**Consequences:** /day-start now surfaces stranded specs at session start. /ship bypasses now trigger an explicit divergence dialog. `/dev` makes the spec-closure responsibility of /ship visible at UAT handoff. The class of failure (docs stranded on abandoned branch) now has three detection points instead of zero.

**References:** [docs/process-learnings.md](docs/process-learnings.md)

---

## 2026-02-28 [process]: OpenClaw over custom bot — search named tools before building

**Context:** Built a custom Gemini Telegram bot across 2 sessions (VM provisioning, bot.py, sqlite-vec memory, GitHub PAT, email) before discovering the user intended to use OpenClaw — a 68k-star open-source agent framework that does all of this out of the box. VM paused.

**Decision:** Switch to OpenClaw when resuming agent work. Custom bot abandoned.

**Alternatives rejected:** Continuing custom bot — it reimplements ~10% of OpenClaw at maintenance cost.

**Consequences:** Any named tool/product mentioned by the user must be searched before assuming. "Confirm end-state" rule added to CLAUDE.md. VM stays paused until OpenClaw setup.

**References:** [CLAUDE.md — Infrastructure Work](CLAUDE.md)

---

## 2026-02-28 [process]: CLAUDE.md structural cleanup — Git Safety refactored to rules file

**Context:** Audit found Git Safety section duplicated between CLAUDE.md (inline rules) and `.claude/rules/git.md` (auto-loaded rules file). Drift had already started — `git push --force` to main/master existed only in rules file.

**Decision:** Collapse CLAUDE.md Git Safety to a 1-line reference. Rules file is the single source. Also: Worktree Branch Naming stub removed (merged into Worktree Protection section), Commit Discipline cross-referenced from Git & Commits.

**Alternatives rejected:** Keeping both in sync manually — drift is inevitable.

**Consequences:** One place to update git rules. CLAUDE.md ~30 lines shorter.

**References:** [.claude/rules/git.md](.claude/rules/git.md)

---

## 2026-02-28 [process]: claude-md skill simplified — two explicit prompt modes

**Context:** claude-md skill was 197 lines with duplicated content, template pseudo-syntax (`{IF_ARGUMENT}`), and inline examples that added noise without value.

**Decision:** Cut to 45 lines. Two explicit agent prompt blocks: one for "validate a change" (with argument), one for "audit" (no argument). No conditional syntax.

**Alternatives rejected:** Keeping long form for "educational" value — the agent doesn't need hand-holding.

**Consequences:** Faster invocation, cleaner output, easier to maintain.

---

## 2026-02-28 [process]: Mira email infrastructure — claritypledge.com over Proton for programmatic access

**Context:** Mira (bot persona) has mira.elv@proton.me for identity. Proton requires Bridge (desktop app) for IMAP — not practical for agent access. Created mira@claritypledge.com on All-Inkl (same server as ops@).

**Decision:** mira@claritypledge.com for operational email (registrations, receiving service emails). read-ops-email.mjs script works for both. mira.elv@proton.me kept for identity only.

**Alternatives rejected:** Proton Bridge — overkill, requires running desktop app.

**Consequences:** Email read/write works with existing IMAP infrastructure.

---

**Format:**
```markdown
## YYYY-MM-DD: Decision Title

---

## 2026-02-28 [process]: tmux cannot preserve Claude Code conversations across restarts

**Context:** 5 hours spent setting up tmux (resurrect, continuum, fzf picker) believing it would preserve Claude Code sessions across Mac restarts. Root cause of the original problem was macOS `AutomaticallyInstallMacOSUpdates = 1` restarting the machine without warning. The tmux solution correctly handles Ghostty closing (process stays alive) but cannot survive a machine restart — Claude's conversation state lives in RAM only.
**Decision:** Disable macOS auto-restarts (`sudo defaults write /Library/Preferences/com.apple.SoftwareUpdate AutomaticallyInstallMacOSUpdates -int 0`). Accept that Claude conversations are always lost on restart. Use `/resume` within the same project dir for continuity. tmux remains useful for background processes and surviving accidental Ghostty close — not for Claude conversation persistence.
**Alternatives rejected:** tmux-resurrect/continuum layering — restores shell only, not the claude process or its conversation state.
**Consequences:** Machine no longer auto-restarts. Claude conversations lost on any restart are expected and not worth engineering around. tmux kept for legitimate uses (background processes, window organization).
**References:** [tmux-setup.md](~/Projects/private/personal/docs/tmux-setup.md) · MEMORY.md

---

## 2026-02-28 [process]: Three structural safeguards against unverified capability claims

**Context:** Root cause analysis of the tmux incident revealed three compounding failure patterns: (1) Claude made a confident capability claim it couldn't verify, (2) a known fix sat unactioned in MEMORY.md, (3) complexity layered on an unverified foundation. Addressed by adding three structural controls.
**Decision:** (1) "Falsify Before You Rely" principle in CLAUDE.md — any capability claim about a tool or system Claude hasn't personally verified must be flagged, with explicit distinction between testable and untestable claims. (2) `ACTION_NEEDED:` tag convention in MEMORY.md — unresolved problems get tagged; `/day-start` scans for them at session start. (3) "Two-layer infrastructure signal" in "Before Choosing Infrastructure Tools" section — adding Tool B on top of unverified Tool A must trigger a stop and verification of Tool A first.
**Alternatives rejected:** Process-based solutions (pre-mortem, cooling period, complexity budget) — require discipline at the moment of excitement, don't fire automatically.
**Consequences:** Claude must flag unverified claims before user commits time. Known open problems surface each morning. Two-layer infra patterns trigger explicit verification check. None of these prevent a determined wrong path, but all three add friction at the right moment.
**References:** [CLAUDE.md](CLAUDE.md) · [day-start.md](.claude/commands/slava/day-start.md) · [MEMORY.md](~/.claude/projects/.../memory/MEMORY.md)

---

## 2026-02-28 [process]: fix-frontmatter.py phantom accumulation — git-aware rename

**Context:** Feature spec files were silently disappearing or accumulating phantom copies across sessions. Root cause: `fix-frontmatter.py` used `Path.rename()` (filesystem-only) when resolving duplicate P-numbers. This caused a tracked→untracked divergence each session (old path shows as `D`, new path as `??`). Over time the phantom would get renamed to yet another number (`p422→p457→p463`), occasionally contaminating unrelated commits via index collision.
**Decision:** Two-path logic in `fix_duplicates()`: (1) If the duplicate is **untracked** (phantom), delete it with `unlink()` — never rename it to a new number. (2) If the duplicate is **tracked**, use `git mv` so the rename is tracked in the index. Added `FileNotFoundError` guard for concurrent hook invocations, and `f is not None` guard in single-file mode `rename_map`. Also added a post-`git mv` verification guard in `/ship` skill to catch failed moves before commit.
**Alternatives rejected:** Continuing with `Path.rename()` + relying on pre-commit re-stage (insufficient — the divergence persists across session boundaries until manually cleaned up).
**Consequences:** Phantom files are now self-healing on next hook invocation. Tracked renames are git-aware and won't leave orphan `D` entries. Index collision risk from spec management tools is reduced.
**References:** [fix-frontmatter.py](scripts/fix-frontmatter.py) · [ship.md](.claude/commands/slava/build/ship.md)

---

## 2026-02-28 [process]: Pre-commit §16 gate — warn when .claude/ changes staged on non-main branch

**Context:** Skills and process changes committed on feature branches are silently invisible in other worktrees until `/ship` merges to main. Developer might not realize a new skill isn't available elsewhere.
**Decision:** `pre-commit-checks.sh` §16 detects `.claude/` files staged on any non-main branch and prints a visible warning. In an interactive terminal (where `/dev/tty` is accessible), it prompts for explicit confirmation before allowing the commit to proceed. In agent/CI context (no TTY), it increments `WARNINGS` but doesn't block.
**Alternatives rejected:** Blocking all .claude/ commits on non-main (too restrictive — feature branches need skill prototyping); doing nothing (silent stranding was the recurring pattern).
**Consequences:** Developer is always made aware when process/skill changes will be branch-local until ship. Agent sessions in non-TTY contexts see a warning count but aren't blocked.
**References:** [scripts/pre-commit-checks.sh](scripts/pre-commit-checks.sh) §16

---

## 2026-02-28 [process]: /kdd meta-reflection — never auto-apply, always present to user

**Context:** /kdd step 6 previously attempted to auto-apply "trivial" fixes identified during meta-reflection. The assumption was that trivial = safe to apply without asking. But friction items extracted from a session can have uncertain scope, downstream effects on other skills, or require user context the agent lacks — even when they look simple.
**Decision:** /kdd step 6 NEVER auto-applies anything. The agent extracts problems (via subagent), triages each one (trivial / requires-decision / no-obvious-fix), and presents ALL items to the user in a single numbered message. User decides what to act on. The agent proposes; the user approves.
**Alternatives rejected:** Auto-applying "trivially obvious" fixes (agent can't reliably assess what's truly trivial; the cost of a wrong auto-apply is higher than asking); skipping presentation entirely (defeats the purpose of the meta-reflection step).
**Consequences:** /kdd meta-reflection produces a triage list, not a list of changes. The friction extraction subagent feeds into a human review loop, not an auto-fix loop.
**References:** [.claude/commands/slava/maintain/kdd/SKILL.md](.claude/commands/slava/maintain/kdd/SKILL.md) step 6

---

## 2026-02-28 [technical]: Kanban server test isolation — guard listen() + export app

**Context:** `tools/kanban/server/api.ts` called `app.listen()` at module load. Any test file importing `api.ts` would trigger the server binding, causing port 9051 conflicts with a running kanban server and test failures. Additionally, tests that needed `app` to make supertest requests couldn't import it because it wasn't exported.
**Decision:** (1) Wrap `app.listen()` in `if (process.env.NODE_ENV !== 'test')` guard. (2) Add `export { app }` so tests can import the express instance directly. (3) Scope pre-commit kanban vitest to scanner tests only (`lib/__tests__` + `server/__tests__/scanner-smoke`) — integration tests (`api.test.ts`, `goals.test.ts`) depend on file I/O and real milestone content that doesn't exist in pre-commit context.
**Alternatives rejected:** Running full kanban test suite in pre-commit (integration tests fail on missing files, creating false blockers); not exporting `app` (forces tests to spin up a real server).
**Consequences:** Any future kanban server test can import `app` directly for supertest integration. Integration tests that need real file content should run in CI, not pre-commit.
**References:** [tools/kanban/server/api.ts](tools/kanban/server/api.ts) · [scripts/pre-commit-checks.sh](scripts/pre-commit-checks.sh) §kanban

---

## 2026-02-28 [technical]: Revert-then-merge: files deleted by a revert are invisible in conflict list

**Context:** P422 and P425 were reverted from `main` (commit `c08bc1f2`) to unblock a deploy. When later merging the feature branch back, git's conflict detection only shows files that exist on both sides. Files that were deleted by the revert (16 files: components, services, helpers, edge function) simply don't appear — they're silently absent from the working tree. The build fails with "cannot find module" errors.
**Decision:** When merging a feature branch after a prior revert of that branch's content: after resolving the standard conflict list, explicitly restore all files that were deleted by the revert commit. Use `git show <feature-branch>:path/to/file > path/to/file` for each, or `git diff <revert-commit>^..<revert-commit> --name-only --diff-filter=D` to enumerate them.
**Alternatives rejected:** Trusting the conflict list to be exhaustive (silently misses deleted files); cherry-picking individual commits (complex, can leave partial state).
**Consequences:** After any `git merge --no-commit` of a branch that was previously reverted, run `git diff <revert-commit>^..<revert-commit> --name-only --diff-filter=D` and manually restore each file before committing. This is a one-time cost per revert, and the correct signal is "build fails on module-not-found after merge resolves clean."
**References:** [docs/technical/git-workflow.md](docs/technical/git-workflow.md)

---

## 2026-02-28 [process]: Commit important content artifacts immediately after writing

**Context:** In P438 session, a blog draft was written via Write tool (confirmed success) but wasn't on disk at session end — required recreating from transcript. Root cause unclear (likely context compaction or interrupted session).
**Decision:** After writing any important artifact (blog draft, feature spec, key doc), immediately run `git status` to confirm it's tracked, then commit before continuing with edits or review. Don't rely on the Write tool confirmation alone — verify the file exists in git.
**Alternatives rejected:** End-of-session checklist (requires discipline each time); no change (next session just loses work again).
**Consequences:** Slightly more commits, but all are named and purposeful. Blog drafts appear as their own commit, which is fine.
**References:** P438 session; content/blog/ai-agent-orchestration-three-setups.md had to be recreated.

---

## 2026-02-28 [process]: Blog articles require personal story first, research second

**Context:** P438 article was initially drafted as a technical comparison of three AI orchestration setups (Jed's principle, Slava's setup, Jordan's pipeline). After review, Slava clarified the real story was his personal journey through the four AI dev barriers, with Jordan and Jed as supporting characters — not co-equal subjects.
**Decision:** For "build in public" articles, start from the personal journey arc, then layer in external references. The story structure is: problem I had → what changed → what I learned → how others fit in. External repos/people are evidence, not the frame.
**Alternatives rejected:** Technical comparison format (reads as survey, not story; loses the "why should I care" thread); starting with external references (obscures authorship, makes article feel like research report).
**Consequences:** Before writing any future article: identify the personal arc first ("what problem did I have, what changed, what can I claim to have learned"). External examples slot in after the arc is clear.
**References:** [content/blog/ai-agent-orchestration-three-setups.md](content/blog/ai-agent-orchestration-three-setups.md), [features/p438_article_ai_agent_orchestration.md](features/p438_article_ai_agent_orchestration.md)

---

## 2026-02-28 [process]: /kdd step 6 meta-reflection redesigned — subagent extraction + mechanical-first brainstorm

**Context:** `/kdd` step 6 relied on Claude's direct memory to "scan for friction" — lossy in long sessions, and A/B options were shallow (no critique of whether solutions prevent problems mechanically vs. by discipline).
**Decision:** Step 6 now: (1) spawns a `general-purpose` subagent whose sole job is extracting problems from the full conversation (capped at 10, deduped, excludes routine noise); (2) triages each problem into trivial-fix / decision / track-it; (3) for decisions generates `/simplify` blocks with 2–3 options each annotated `mechanical: yes/no`, with recommendation naming the mechanism and main risk.
**Alternatives rejected:** Per-problem brainstorm subagents (overhead not worth it; inline brainstorm after extraction is sufficient); keeping A/B format (2 options forces binary framing; 3rd option surfaces non-obvious paths when genuine).
**Consequences:** Every `/kdd` run after a non-trivial session will spawn one subagent for problem extraction. Sessions with no problems found exit immediately ("Clean session."). Recommendations now call out whether the fix is mechanical.
**References:** [.claude/commands/slava/maintain/kdd/SKILL.md](.claude/commands/slava/maintain/kdd/SKILL.md) step 6

---

## 2026-02-28 [process]: Two-layer privacy model for claude-conversations synthesis

**Context:** Session that synthesized strategy from claude.ai conversations inadvertently staged content with named individuals (collaborator names, email addresses, LinkedIn profile URLs). Pre-commit hook caught email patterns mechanically but missed nuanced content (names, contact info in prose).
**Decision:** Two-layer privacy model: (1) mechanical — pre-commit §16 pattern-greps for known personal identifiers (emails, `slavochek`, named individuals in "experiment fails because [Name]" patterns); (2) judgment — `/maintain:privacy` skill run manually before committing when source material included claude-conversations. KDD step 5.25 added as explicit gate: "if source was claude-conversations, run `/maintain:privacy` before committing."
**Alternatives rejected:** Relying solely on mechanical checks (misses prose context); blocking all claude-conversation synthesis (too restrictive — conversations are primary strategy input).
**Consequences:** Every `/kdd` run after a session that touched `~/Projects/private/claude-conversations/` must pass through the privacy skill. Pre-commit §16 acts as backstop for known patterns.
**References:** [scripts/pre-commit-checks.sh](scripts/pre-commit-checks.sh) §16, [.claude/commands/slava/maintain/kdd/SKILL.md](.claude/commands/slava/maintain/kdd/SKILL.md) step 5.25

---

## 2026-02-28 [process]: docs/business/collaborators/ moved to .private — already leaked to git history

**Context:** `docs/business/collaborators/` (compensation model, profit-participation draft, transparency rationale) was committed to `origin/main` before this session. Files contain business negotiation strategy and compensation terms that could affect collaborator relationships if widely seen.
**Decision:** Removed from public git index via `git rm -r --cached docs/business/collaborators/`. Moved to `.private/docs/business/collaborators/`. Going forward, all collaborator agreements, compensation discussions, and partnership terms live in `.private/` by default. Full history scrub (git filter-repo + force-push) deferred — decision left to user given complexity and low marginal risk (no credentials, no personal identifiers, strategic content only).
**Alternatives rejected:** Leaving in place (ongoing exposure); immediate force-push history scrub (complex, requires coordination with any clones, disrupts ongoing branches).
**Consequences:** `docs/business/` directory effectively deprecated as public location for sensitive business content. Any new collaborator-related docs → `.private/docs/business/` by default.
**References:** `.private/docs/business/collaborators/`

---

## 2026-02-27 [technical]: Vitest unit tests fail silently when VITE_SUPABASE_* env vars missing

**Context:** `src/lib/supabase.ts` throws at module load (`Missing Supabase environment variables`) when `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` are absent. Any test file that imports a module that transitively imports supabase.ts will fail with a module-load error — even if the test doesn't call Supabase at all. No `.env.test.local` fix works for Vitest (it uses `vite.config.ts`, not Playwright's dotenv loading).
**Decision:** Add dummy stub values to `vite.config.ts` `test.env` block:
```ts
test: { env: { VITE_SUPABASE_URL: 'http://localhost:54321', VITE_SUPABASE_ANON_KEY: 'test-anon-key' } }
```
These are never used in a real Supabase call in unit tests — they only satisfy the module-load guard.
**Alternatives rejected:** Per-file mocking of supabase.ts (too brittle, requires every new test file to remember); changing supabase.ts to not throw (breaks prod safety guard).
**Consequences:** Adding new test files that import supabase-touching modules will Just Work. No per-file boilerplate needed.
**References:** [vite.config.ts](vite.config.ts)

---

## 2026-02-27 [process]: Content articles live in `content/articles/`, separate from `features/`

**Context:** Articles and blog posts were being tracked as feature specs in `features/p*_article_*.md`. This mixed content pipeline management with feature delivery — wrong kanban columns, wrong status values, wrong lifecycle.
**Decision:** New namespace: `content/articles/a{N}_{slug}.md`. Own status pipeline: `idea → draft → editing → ready → published → promoted`. Auto-number via `scripts/next-a-number.sh`. Kanban gets a `Content` tab with its own DndContext and `ArticleStatus` type. Rules file `.claude/rules/content.md` auto-loads when editing `content/articles/`. `features/` remains for product feature specs only.
**Alternatives rejected:** Subdirectory inside features/ (same wrong column semantics, no separate kanban view); separate Ghost CMS notes (not tracked in git, no kanban integration).
**Consequences:** Future articles go in `content/articles/` not `features/`. Use `./scripts/next-a-number.sh` for numbering. Content kanban tab at `/content` in the kanban tool. Content skills (`/slava:content:*`) write to this directory.
**References:** [content/articles/](content/articles/) · [.claude/rules/content.md](.claude/rules/content.md) · [tools/kanban/src/components/ContentPage.tsx](tools/kanban/src/components/ContentPage.tsx)


**Context:** Why this came up
**Decision:** What we chose

---

## 2026-02-27 [process]: tmux copy-mode trap + auto-session naming

**Context:** `set -g mouse on` causes tmux to silently enter copy mode on any trackpad scroll-up. Once in copy mode, `ESC` does nothing — only `q` exits. Detach/reattach doesn't help (copy mode is pane-level). New sessions were being named with garbage strings (`lkj2`, `asjh23`) because the right name wasn't obvious at creation time.
**Decision:** (1) Added `bind -T root WheelUpPane ... copy-mode -e` so copy mode auto-exits when you scroll back to bottom; (2) Added `after-new-session` hook to auto-name sessions after the creation directory; (3) Added `Ctrl+b R` bind to rename session to current directory on demand.
**Alternatives rejected:** Disabling mouse entirely — too useful for pane resizing; vi-mode key bindings — adds complexity, changes other bindings.
**Consequences:** New sessions auto-named from directory. `q` is the canonical copy-mode exit key. `Ctrl+b R` renames when work focus becomes clear mid-session. Recovery from a stuck pane: `tmux send-keys -t SESSION q Enter` from any other pane.
**References:** `~/.tmux.conf`

---

## 2026-02-27 [process]: UAT branch divergence trap — cherry-pick fixes don't auto-land

**Context:** `p422-p425-uat` was created for UAT. A bug fix (`a9737690` — auto-resize textarea) was subsequently developed on a feature sub-branch and merged into dev branches (`p449`, `p451`, etc.) but never cherry-picked to UAT. The UAT branch silently diverged. The fix was visible in dev but absent in UAT, causing a regression that only surfaced when testing on the UAT branch.
**Decision:** Before UAT begins, run a gap analysis: `git log --oneline p{N}-uat..{dev-branch}` for all branches in scope. Any `fix:` or `feat:` commit touching features under test that isn't on the UAT branch must be cherry-picked before UAT runs. The analysis subagent pattern (git log comparison + file relevance filter) reliably surfaces missing commits in ~60 seconds. When a `fix(pN):` commit lands on any branch, check if pN is currently in UAT — if so, cherry-pick immediately rather than waiting for `/ship`.
**Alternatives rejected:** Trusting the UAT branch to be "complete" without verification — the exact failure mode that occurred; rebasing UAT onto dev — risky, rewrites history, can introduce unrelated changes.
**Consequences:** Gap analysis is a mandatory step before every UAT session. Two-step rule going forward: (1) when a fix lands, check if the feature is in UAT; (2) before UAT runs, compare UAT branch to dev branches for all in-scope P-numbers.
**References:** `CLAUDE.md` (Before Starting Work section), `docs/technical/git-workflow.md`

---

## 2026-02-27 [technical]: storyCTAOverride prop — suppress/replace "Tell your story →" in context-aware surfaces

**Context:** `PointCardWithLinks` renders a "Tell your story →" CTA when `showStoryCTA` is true. In /chat the user is already on the story-writing surface — clicking the CTA would navigate them to /chat, creating a circular loop.
**Decision:** Add `storyCTAOverride?: React.ReactNode` prop with three-state semantics: `undefined` = default button (all existing callsites unchanged); `null` = suppress CTA entirely; `ReactNode` = custom replacement. /chat passes a muted status chip `"✓ Position saved — write your experience below ↓"` when a position is set, `null` when not.
**Alternatives rejected:** `hideCTA: boolean` — loses ability to show contextual replacement; `liveSessionMode` flag reuse — wrong semantic (that flag is for /live, not /chat); separate chat-specific card — third diverging render path.
**Consequences:** Any future context embedding `PointCardWithLinks` but needing a different CTA can use this escape hatch without touching core logic. `undefined` default ensures all existing callsites are unaffected.
**References:** [point-card-with-links.tsx](src/app/components/social/point-card-with-links.tsx) · [StoryGuideChat.tsx](src/app/components/story-guide/StoryGuideChat.tsx)

---

## 2026-02-27 [technical]: Full position interaction stack required when embedding PointCardWithLinks interactively

**Context:** `PointCardWithLinks` only renders position buttons when `currentUserId` is passed. StoryGuideChat was using the component without it — buttons were invisible. Missing also: `useRemovePositionGuard` (toggle-off skipped linked-stories warning) and `selectedPosition` sync (badge froze after changes).
**Decision:** Wire the full stack in any interactive embedding: (1) `localPosition` state initialized from prop + `useEffect` sync for prop changes; (2) `useRemovePositionGuard` with context-appropriate post-remove action (in /chat: `navigate(-1)`, since chatting about a removed position makes no sense); (3) `handlePositionSelect` checks `pointsService.setPosition` boolean return, toasts on failure; (4) pass `currentUserId`, `selectedPosition`, `onPositionSelect`, and render `<RemovePositionDialog {...dialogProps} />`.
**Alternatives rejected:** `localPosition ?? serverPosition` effectivePosition pattern (used in QuotedPoint) — not needed in /chat since the page doesn't re-render with fresh server position data after mount.
**Consequences:** Pattern is now explicit: 4 props + dialog = interactive position card. Missing any one of them = silent partial functionality. Documented here so future surfaces don't repeat the /chat mistake.
**References:** [StoryGuideChat.tsx](src/app/components/story-guide/StoryGuideChat.tsx) · [remove-position-dialog.tsx](src/app/components/shared/remove-position-dialog.tsx)

---

## 2026-02-27 [technical]: Render-slot pattern for injecting author actions into shared card components

**Context:** `StoryCardDetail` is used in both feed (list) and detail views. Detail view needed author actions (visibility toggle, edit, delete) inside the card. Adding props per-action would bloat the shared component with page-specific concerns.
**Decision:** Pass `visibilitySlot` and `footerActionsSlot` as `React.ReactNode` props. The card renders them at the right positions; the page controls what goes in each slot. Author vs non-author logic stays in the page, not the card.
**Alternatives rejected:** Adding `isAuthor` + individual action props to `StoryCardDetail` — couples the card to page-level auth state; conditional rendering inside the card — same problem.
**Consequences:** Card stays dumb. Pages compose author-specific UI as slots. Pattern extends cleanly to other page-specific card customizations.
**References:** [StoryCardDetail.tsx](src/app/components/social/StoryCardDetail.tsx) · [story-detail-page.tsx](src/app/pages/story-detail-page.tsx)

---

## 2026-02-26 [technical]: Reuse PointCardWithLinks as context display in /chat — no bespoke card

**Context:** /chat had a custom `ContextChip` (blue pill) showing point text + position label at the top of the AI story guide. It duplicated what `PointCardWithLinks` already renders on the profile Points tab — author name, position badge, linked stories, share/open actions.
**Decision:** Delete `ContextChip`, render `PointCardWithLinks` directly with `profileOwner` for the position badge. Page adapts the `PointWithUserPosition` fetch result (already in flight) to the prototype `Point` shape and passes `contextPoint` + `contextProfileOwner` as props to `StoryGuideChat`.
**Alternatives rejected:** `hideActions`/`disableNavigation` flags — strips share, open, linked stories with no benefit; bespoke chat card — third divergent rendering of the same data.
**Consequences:** One card component renders points consistently everywhere. Any future card improvement (badge, story preview, share) automatically applies in chat.
**References:** [StoryGuideChat.tsx](src/app/components/story-guide/StoryGuideChat.tsx) · [story-guide-chat-page.tsx](src/app/pages/story-guide-chat-page.tsx)

---

## 2026-02-26 [process]: /ship is the only reliable spec-closing path

**Context:** P412 was fixed inline (committed directly to main, no feature branch). Code shipped correctly. Someone manually moved the spec to `features/done/` but frontmatter (`status`, `completed_at`) was never updated — leaving it as `in-progress` in `done/`. `/ship` would have handled this automatically (step 7), but it only applies to feature branches.
**Decision:** `/ship` must be used even for inline work, or at minimum, `/status` must surface `→ /ship pN` at session wrap-up when P-number work was done. Updated `/status` Next logic to suggest this. The frontend gap (manual spec closure) is a second-class citizen compared to the branch-based flow — acceptable risk for now.
**Alternatives rejected:** Adding a separate "close spec" skill for inline work (unnecessary complexity); enforcing a feature branch for all work (overhead for single-file fixes).
**Consequences:** `/status` now flags `→ /ship pN` at wrap-up. Prevents stale frontmatter from inline sessions going unnoticed.

---

## 2026-02-26 [process]: CLAUDE.md size cap — P441 audit to fix instruction dilution

**Context:** CLAUDE.md has grown to ~500 lines. Rules are diluting each other — every gap found triggers a new rule, which makes the document larger, which reduces attention each rule gets, which creates more gaps. A session where the Decisive Action rule existed but wasn't applied proved the pattern.
**Decision:** Cap CLAUDE.md at ~300 lines of content. Path-specific directives belong in `.claude/rules/` (auto-load only when relevant). Universal principles stay in CLAUDE.md. P441 filed to do the full audit in a dedicated session with a worktree for safety.
**Alternatives rejected:** Adding more rules to CLAUDE.md to fix compliance (self-defeating); making CLAUDE.md shorter by removing content without a routing strategy (loses coverage).
**Consequences:** Before adding anything to CLAUDE.md, ask: "Is this universal?" If path-specific → `.claude/rules/`. If already documented elsewhere → link. Running `/claude-md` gate enforces this per-change.

---

## 2026-02-26 [process]: Agent pipeline output — apply when clear, never surface as false choice

**Context:** Critique agent and claude-md gate agent both converged on the same answer with no trade-offs. The output was surfaced to the user as a "decision" requiring approval, wasting their reading time on something that wasn't genuinely theirs to decide.
**Decision:** When spawned agents agree and recommendation is unambiguous → apply and report. Only surface to user when: genuine trade-offs exist that depend on user preference, action is irreversible/risky, or agents disagree. This is the Decisive Action principle applied to agent pipelines, not just user interactions.
**Alternatives rejected:** Always surface agent output for approval (theater, shifts burden without value); never surface (misses genuine ambiguity).
**Consequences:** Agents in pipelines are peers, not advisors. Their clear output is a decision already made. Surfacing it as a question is a false choice. Saved to MEMORY.md so it persists across sessions.

---

## 2026-02-26 [process]: Structural instructions beat ambient — fix the skill, not CLAUDE.md

**Context:** CLAUDE.md's Decisive Action rule was violated in the same session it was reinforced. Root cause: the `/claude-md` skill had "suggest only" in its prompt — read fresh at invocation — which overrode the ambient CLAUDE.md rule competing with 499 other lines.
**Decision:** Fix compliance problems at the structural level (skill design, `.claude/rules/` path matching, hooks) not by adding more ambient rules to CLAUDE.md. Structural instructions are read fresh and in full; ambient ones are diluted. `/claude-md` skill changed from "suggest only" to "apply when clear, surface when judgment required."
**Alternatives rejected:** Adding a CLAUDE.md rule saying "apply agent output when clear" — same document, same dilution problem.
**Consequences:** Before adding a CLAUDE.md rule to fix a compliance gap, ask: "Can this be enforced structurally instead?" Skill design > rules file > CLAUDE.md.
**References:** [claude-md/SKILL.md](.claude/commands/slava/maintain/claude-md/SKILL.md)

---

## 2026-02-26 [process]: Terminal session persistence — tmux + resurrect + continuum

**Context:** After Mac restarts (including unexpected crash described below), all Ghostty terminal sessions (tabs, working directories, running processes) were lost. Previous tmux attempt failed because no persistence plugins were configured. Ghostty's `window-save-state = always` restores layout/directories but not running processes.
**Decision:** tmux + tmux-resurrect + tmux-continuum. Auto-saves every 1 min to `~/.tmux/resurrect/`. Auto-restores on `tmux` server start. `t` shell function wraps startup: boots server, polls until continuum restores sessions (up to 10s), then attaches. `t name` creates/attaches named sessions. fzf session picker for switching. `c` = `claudec`, `e` = `exit`.
**Alternatives rejected:** Zellij (built-in resurrection broken on macOS Homebrew, GitHub #4412/#4413); iTerm2 (can't restore processes after reboot); Warp (loses working directories on reboot, multiple open GitHub issues); Ghostty alone (restores layout, not processes).
**Consequences:** Workflow: open Ghostty → type `t` → all sessions restored. Sessions protected from crash within 1-min window. Security: `~/.tmux/resurrect/` is chmod 700; pane-capture disabled; ssh excluded from resurrect processes (dead connections). Config: `~/.tmux.conf`, `t()` + `c` + `e` aliases in `~/.zshrc`.

---

## 2026-02-26 [process]: Mac crash prevention — quit Beeper on lid close via launchd

**Context:** Mac restarted unexpectedly during Clamshell Sleep (~15:40→16:18). Root cause: Beeper Desktop writing 2,147 MB in 10 min during a background update, triggering a Security Coprocessor crash (`scrash_in crash` in boot faults — Apple Silicon-specific, leaves almost no trace). Contributing factor: MagSafe plugged in seconds before lid close is a known macOS 15.x instability trigger. tmux was previously tried for session continuity after restarts — did not work.
**Decision:** Two launchd agents installed: (1) `com.slava.quit-beeper-on-lid-close` — checks lid state via `ioreg` every 30s, quits Beeper if closed; (2) `com.slava.panic-checker` — runs at login, notifies if new `ResetCounter-*.diag` files exist since last login. Scripts in `~/.local/bin/`.
**Alternatives rejected:** Manually quitting Beeper before sleep (relies on memory); disabling Beeper auto-updates (doesn't prevent I/O storms from other operations).
**Consequences:** Beeper won't be running when lid is closed — open it manually when needed. Unexpected restarts will surface as a login notification. Diagnostic approach for future crashes: check `ResetCounter-*.diag` in `/Library/Logs/DiagnosticReports/` and `pmset -g log` for the sleep/wake timeline.

---

## 2026-02-26 [product]: /sim — 3-layer persona simulation pipeline as pre-done UX gate

**Context:** P422 and P425 shipped but felt off in ways only visible when actually using them. Static code review (`/review-all`) catches patterns, not experience. Smoke testing (`/verify`) confirms function, not feel. No structured way to discover UX friction before closing a feature.
**Decision:** Three-layer persona simulation system: (1) Experience Reporter — browser agent (Claude in Chrome) navigates as a persona, produces raw first-person stream; (2) Interpreter — classifies issues across personas, identifies root cause; (3) Change Request Generator — consolidated report, selected findings become `type: change-request` P-specs. Pipeline: `/dev → /sim → [change requests] → done`. Personas live in `.claude/personas/` (version-controlled). `/sim` replaces `/verify` as the pre-done gate for UI features.
**Alternatives rejected:** Manual walkthroughs (non-reproducible, skipped under time pressure); adding more static review passes (same blind spot — can't simulate experience); keeping `/verify` as the gate (functional, not experiential).
**Consequences:** New spec type `type: change-request` with required frontmatter (`changes`, `source`, `persona`). `/verify` demoted to pure functional smoke testing. Three initial personas: `solo-founder`, `coach`, `invited-party`. Skills flow updated: `/dev → /sim` is the new standard for UI features.
**References:** [features/p439_sim_persona_simulation_system.md](features/p439_sim_persona_simulation_system.md) · [.claude/personas/](.claude/personas/)

---

## 2026-02-26 [process]: quick-feature template is a floor, not a ceiling

**Context:** Specs created from `/quick-feature` were missing architecture decisions, personas, output formats, and pipeline position that had already been established in conversation — agents were leaving placeholders instead of capturing what was already known.
**Decision:** `/quick-feature` scans conversation for decided context (ASCII mockups, wireframes, file paths, implementation approach, architecture decisions, output formats, personas, pipeline position) and includes it. Agents may add sections beyond the template when conversation context warrants — template is a floor, not a ceiling. Section names should be descriptive (`## Architecture`, `## Personas`, etc.).
**Alternatives rejected:** Rigid template — forces placeholders for context that already exists, requiring re-discussion at `/dev` time.
**Consequences:** Specs created from rich conversations will be richer. Agents should not add boilerplate placeholder sections for things not yet decided; the extension rule applies to things already decided in conversation.
**References:** [.claude/commands/slava/build/quick-feature.md](.claude/commands/slava/build/quick-feature.md)
**Alternatives rejected:** What we didn't choose
**Consequences:** What this means going forward
```

---

## 2026-02-26 [process]: Worktree automation rejected — .env.local showstopper + hook fires too late

**Context:** Two Claude sessions sharing a `.git/index` caused staging collisions (P437/P440 incident). Proposed fix: PreToolUse hook that auto-forks into a worktree when a branch is detected. Ran adversarial review before implementing.
**Decision:** Rejected automation. Implement instead: (1) commit-at-coherent-state rule in CLAUDE.md, (2) collision check in `/fix` (mirrors `/dev`'s existing check), (3) infrastructure tier in `/pick-flow`. Keep ask behavior — agent surfaces collision, user decides.
**Alternatives rejected:** PreToolUse hook — three fatal flaws: (a) `.env.local` is not present in worktrees (breaks `source .env.local` in any credential script — a hard showstopper); (b) hook fires after `git checkout -b` so the branch already exists in the original worktree when the fork happens; (c) auto-forking without asking violates the Transparency Principle. Auto-merge-on-close also rejected: no clean "session ended" event to hook into.
**Consequences:** Agents detect collision and ask — they don't act unilaterally. `.env.local` must be symlinked after creating any new worktree (`ln -sf /path/to/main/.env.local .env.local` — see worktree-setup.md). The main defence is committing frequently, not worktree isolation.

---

## 2026-02-26 [process]: Commit at coherent state — shared git index is collision fuel

**Context:** Two Claude sessions open in the same worktree can silently sweep one session's uncommitted changes into the other's commit. The P440/P437 incident caused 11 spec files to end up in the wrong commit because changes accumulated between sessions.
**Decision:** Commit whenever work reaches a coherent, passing state — docs, specs, config changes, not just feature completions. Don't let uncommitted changes accumulate across sessions.
**Alternatives rejected:** Relying on session awareness — agents don't reliably know what other sessions have staged.
**Consequences:** CLAUDE.md now states this explicitly. Parallel sessions must use separate worktrees. `/kdd` and `/status` wrap steps check `git status --short` and flag uncommitted changes.
**References:** [CLAUDE.md](../CLAUDE.md) · [worktree-setup.md](docs/technical/worktree-setup.md)

---

## 2026-02-26 [process]: process-learnings.md — open items only, resolved items graduate to decisions.md

**Context:** process-learnings.md had accumulated three "Status: done" entries that were also captured in decisions.md — a graveyard of resolved items. /weekly only surfaces `Status: proposed` entries, so done items were invisible noise. The graduation step (remove from process-learnings → add to decisions.md) was never documented, causing items to pile up in place.
**Decision:** process-learnings.md holds open/proposed friction only. When an item is resolved: (1) delete it from process-learnings.md, (2) add a `[process]` entry to decisions.md. The file header now makes this explicit. Also: decisions.md is append-only and cannot hold proposals — these must stay separate.
**Alternatives rejected:** Single file with status field — decisions.md is append-only by design; adding "proposed" entries would fill it with noise that never gets cleaned up.
**Consequences:** /kdd step 6 must include the graduation instruction. /weekly correctly surfaces open items. decisions.md stays clean. process-learnings.md stays short (empty = healthy).
**References:** [process-learnings.md](docs/process-learnings.md)

---

## 2026-02-26 [process]: P440 — QA status as dev-completion signal + delivery_stage cleanup

**Context:** After `/dev` finished, features stayed in `in-progress` — visually indistinguishable from active coding work. The `delivery_stage: uat` badge was confusing (UAT ≠ "needs your review"), and 4 of 8 delivery_stage values were never set by any skill (dead weight). No ordering cues existed to know which review stage came first.
**Decision:** (1) New `status: qa` column (amber, between `in-progress` and `done`) — `/dev` and `/fix` land features here; `/ship` accepts `qa` as input and closes to `done`. The column IS the signal: "code complete, needs review before prod." (2) `delivery_stage` reduced to 4 numbered values matching the planning pipeline skills: `1-prd-review`, `2-ux-review`, `3-arch-review`, `4-tests-ready`. Ghost values removed. (3) Running the next skill (e.g., `/ux`) is implicit approval of the previous stage — no manual frontmatter edits required.
**Alternatives rejected:** Keeping `delivery_stage: uat` — confusing to non-QA teammates; adding a badge to `in-progress` cards — too subtle, no column-level visibility.
**Consequences:** `qa` is NOT a terminal status — it must NOT be added to the PATCH handler's "move back to active" exception list. `done`/`all-done`/`rejected` remain the only terminals. Any skill that previously set `delivery_stage: uat` or `status: done` directly now sets `status: qa` instead.
**References:** [features/p440](features/p440_qa_status_and_delivery_stage_cleanup.md) · [types.ts](tools/kanban/src/lib/types.ts) · [scanner-rules.ts](tools/kanban/lib/scanner-rules.ts)

---

## 2026-02-26 [technical]: kanban security testing — use raw strings for path traversal attack vectors

**Context:** During kanban test coverage work, a security test for path traversal used `path.join(mainWt.path, 'features', '..', '.env.local')`. Node's `path.join()` normalizes `..` segments eagerly at call time, producing an already-resolved path. The test passed the server's `resolve()` check trivially — it was never actually testing the traversal fix.
**Decision:** Security tests that simulate path traversal attacks must use **raw string concatenation**, not `path.join()`. Example: `mainWt.path + '/features/../.env.local'` — this preserves the `..` segment so the server's `path.resolve()` is the only thing that normalizes it, correctly testing the guard.
**Alternatives rejected:** Using `path.join()` — silently defeats the test's purpose; using `path.resolve()` in the test — also pre-normalizes, same problem.
**Consequences:** Rule for all security tests involving path manipulation: if the test simulates an attack, construct the attack string as a raw string literal. The server's defense mechanism must be the first thing that normalizes it — not the test setup.
**References:** [tools/kanban/server/__tests__/security.test.ts](tools/kanban/server/__tests__/security.test.ts)

---

## 2026-02-26 [technical]: kanban PATCH — all-done must be excluded from "move back to active" condition

**Context:** Setting `status: all-done` via the kanban UI on a file already in `features/done/{sprint}/` triggered the PATCH handler's "move back to active" branch (`status !== 'done' && status !== 'rejected' && isInSubfolder`). Result: 11 spec files silently moved from `features/done/` subdirectories to `features/` root, showing as deleted in git and untracked at features/.
**Decision:** Add `all-done` to the exception list alongside `done` and `rejected`. The condition is now: `status !== 'done' && status !== 'all-done' && status !== 'rejected' && isInSubfolder`. Files with any "terminal" status must never be moved back to active by the PATCH handler.
**Alternatives rejected:** Moving to flat `features/done/` on `all-done` (loses sprint subdirectory organization).
**Consequences:** Any new terminal status added to the kanban (beyond `done`/`all-done`/`rejected`) must also be added to this exception list — treat it as a registry. Spec file restores were handled by moving untracked files back to their sprint subfolders manually.
**References:** [tools/kanban/server/api.ts](tools/kanban/server/api.ts) — PATCH `/api/features/:id` handler

---

## 2026-02-26 [technical]: Calibration bar — don't gate null-aware components with `&&`

**Context:** `InlineCalibration` accepts `calibration: UserCalibration | null` and renders an empty bar + "Complete 5 sessions" tooltip when null — intentional design from P269. A later commit added `{calibration && <InlineCalibration>}` with comment "hidden until 5 sessions" which *overrode* that design, hiding the bar entirely for users with < 5 sessions. Discovered when calibration bar was missing on all profiles.
**Decision:** Remove the `&&` guard — render `<InlineCalibration calibration={calibration} />` always and let the component own its empty state.
**Alternatives rejected:** Keeping the guard + separate placeholder — unnecessary complexity when the component already handles null.
**Consequences:** Pattern: if a component has intentional null/empty-state rendering built in, pass null directly and never gate with `{nullable && <Component>}`. The guard silently overrides the component's design contract.
**References:** [profile-page-v2.tsx](src/app/pages/profile-page-v2.tsx)

---

## 2026-02-26 [process]: Deploy queue pattern for infra-aware feature releases

**Context:** P422 and P425 both introduced edge functions and `VITE_*` env vars that must be provisioned on prod before `/ship` pushes. Config was staged manually (Supabase secrets + Vercel env). `/ship` only does git merge+push — it's blind to these infra requirements. Risk: future features silently missing prod dependencies.
**Decision:** Option A — `/dev` appends an "Infra requirements" block to `DEPLOY_QUEUE.md` when closing a feature that has a Pre-deploy Checklist. `/ship` reads the queue, shows pending items, gets confirmation, runs each command, then clears the file. `DEPLOY_QUEUE.md` is gitignored.
**Alternatives rejected:** Option B (GitHub Actions automation for edge fn deploys) — requires a staging environment to safely validate; premature until staging exists.
**Consequences:** Deploy process becomes explicitly aware of infra dependencies. First `/ship` after this decision will need P422+P425 queue items seeded manually. Implementation still pending (update `/dev` + `/ship` skills).
**References:** [ship.md](.claude/commands/slava/build/ship.md) · [features.md](.claude/rules/features.md) — Pre-deploy Checklist format

---

## 2026-02-26 [process]: day-start skill hardening — signup identity + subagent anti-pattern

**Context:** `/day-start` was spawning a background subagent to count signups, which took 20 tool uses / 75s and still got the wrong answer (count only, wrong column name). Health check also had GCP VM check that silently failed every run due to keychain auth not being available in agent sessions.
**Decision:** (1) Signup query uses `curl` with `PROD_SUPABASE_SERVICE_ROLE_KEY` inline — no subagent. Key retrieved via `supabase projects api-keys --project-ref <ref>` (CLI uses macOS keychain). Column is `name`+`email`, not `username`/`full_name`. (2) GCP VM check removed — VMs are set-and-forget, not a daily concern. DB backup check kept with silent skip on gcloud auth failure. (3) `source .env.local` → `source "$(git rev-parse --show-toplevel)/.env.local"` to handle non-root cwd in agent sessions.
**Alternatives rejected:** Background subagent — inherently slow, burns context, and will try 20 workarounds before failing cleanly.
**Consequences:** day-start signup check is ~1s, returns names, works regardless of cwd. Pattern: for any "check prod data at session start" use direct curl+service key, never subagent.
**References:** [day-start.md](.claude/commands/slava/day-start.md)

---

## 2026-02-25 [process]: Feature branch workflow + prod deploy gate

**Context:** P422 and P425 were committed to `main` while `status: in-progress`. Vercel auto-deploys on every push to `main` — so these unapproved features silently landed in production.
**Decision:** P-number features stay on `feature/pN-short-description` branches until explicitly approved. `/dev` creates the branch at Phase 0; `/ship` merges to main and pushes (controlled deploy). A pre-push git hook blocks all pushes to `main` requiring TTY confirmation — this physically prevents agent pushes (agents have no TTY). `/dev` step 10 (feature closure) includes an explicit "Prod deploy — always ask first" gate; never deploy autonomously.
**Alternatives rejected:** CLAUDE.md rule alone — rules get forgotten; a simple warning without a TTY block — agents can satisfy a warning check, they can't satisfy a TTY prompt.
**Consequences:** Every push to main is now a conscious human decision. Agents must call `/ship` and wait; they cannot push unilaterally. Small infra/doc work committed directly to main is still fine — branch discipline is for P-number features only.
**References:** [git-workflow.md](docs/technical/git-workflow.md) · [ship.md](.claude/commands/slava/build/ship.md) · [dev.md](.claude/commands/slava/build/dev.md)

---

## 2026-02-25 [process]: Parallel review agent as quality gate for skill/prompt changes

**Context:** After implementing the activity log system across 3 skill files, ran a parallel review agent before first use. It found 7 real bugs including a critical placeholder substitution bug (would write literal "ACTIVE/BLOCKED/NEXT" to the log) and an awk date filter failure on the 7-day fallback — both silent failures that would have produced garbage data indefinitely.
**Decision:** After any non-trivial skill implementation (new bash commands, multi-file change, structured output derivation), spawn a parallel review agent with: (1) files changed, (2) explicit questions about shell quoting, edge cases, and synthesis instructions. A fresh agent with no implementation context catches what the author normalizes.
**Alternatives rejected:** Self-review only — author normalizes their own assumptions; waiting for first real run — silent failures in skills can persist for weeks unnoticed.
**Consequences:** Skill changes now have a lightweight quality gate. Pattern is cheap (~60s background agent) and caught bugs no test suite would find. Apply especially when skills contain bash or instruct AI to derive structured output.
**References:** [status.md](.claude/commands/slava/maintain/status.md) · [day-end.md](.claude/commands/slava/day-end.md)

---

## 2026-02-25 [process]: Post-compaction resume — re-confirm external actions before continuing

**Context:** After context compaction, the summary lists "pending tasks" from the prior session. Agent resumed and auto-executed outreach (LinkedIn message) that the user had not re-approved in the new session — treating the summary's pending list as a pre-approved queue.
**Decision:** After compaction resume, report only what was immediately interrupted (the single task that failed mid-execution), then stop and ask what's next. The pending task list is context, not a to-do queue. External actions (messages, emails, pushes) require explicit re-approval every session.
**Alternatives rejected:** Add a CLAUDE.md rule — fails universal test (only relevant at session start after compaction, not on every task). Memory note instead.
**Consequences:** Agents must not treat the compaction summary's pending list as a pre-approved work queue. External actions (messages, emails, pushes) require explicit re-approval at every session start after compaction. Stored in MEMORY.md under User Preferences.
**References:** MEMORY.md (post-compaction resume section)

---

## 2026-02-25 [process]: Activity log system — /status appends timeline, /day-end and /weekly consume it

**Context:** Git logs only capture completed work. No record existed of what was in-flight during the day — what was active, blocked, or shifted attention. `/day-end` and `/weekly` had no visibility into intra-session patterns.
**Decision:** `/status` appends a structured one-liner to `.private/logs/activity.log` after every run: `TIMESTAMP | check | active: P-numbers | blocked: one-phrase | next: next-step`. `/day-end` reads today's entries (detects attention shifts = P-number changes between consecutive entries; persistent blockers = same keyword in 2+ non-adjacent entries). `/weekly` reads the full period and derives WIP age and recurring blockers.
**Format:** Structured one-liner, `|`-delimited, no `|` in prose fields. Rejected: full prose dump (noisy, repetitive).
**Alternatives rejected:** Phased rollout (wire consumers later) — consumers are skill prompt files, not code; full implementation costs the same as partial.
**Consequences:** Every `/status` run is recorded from this point. Log at `.private/logs/activity.log` (gitignored). First use verified working 2026-02-25.
**References:** [status.md](.claude/commands/slava/maintain/status.md) · [day-end.md](.claude/commands/slava/day-end.md) · [weekly/SKILL.md](.claude/commands/slava/maintain/weekly/SKILL.md)

---

## 2026-02-25 [technical]: ghost-prod downgraded to e2-micro with swap buffer

**Context:** ghost-prod was running e2-small (2GB RAM) at ~$0.0168/hr for a low-traffic blog with minimal Ghost workload. e2-micro (1GB RAM) is sufficient but risky without a RAM safety net.
**Decision:** Add 2GB swap to pd-standard disk before downsizing, then resize VM. Post-downgrade: 303MB RAM used of 958MB available, 268K swap used. Ghost running healthy.
**Alternatives rejected:** Stay on e2-small — saves $0.75/week but unnecessary given $25K credits; downgrade without swap — risky if Ghost has a memory spike during initial load.
**Consequences:** ghost-prod cost drops from ~$2.92/week to ~$2.17/week (VM + disk). If Ghost ever becomes sluggish under load, swap is the first signal — upgrade back to e2-small. Swap survives reboots.
**References:** [ghost-blog.md](docs/technical/ghost-blog.md)

---

## 2026-02-25 [process]: macOS LaunchAgent PATH trap — Homebrew tools not in minimal PATH

**Context:** Dropbox backup LaunchAgent was failing silently since its creation. Root cause: macOS LaunchAgents run with a minimal PATH (`/usr/bin:/bin:/usr/sbin:/sbin`) that excludes `/opt/homebrew/bin`. GPG (installed via Homebrew) was unreachable, and the error was swallowed by `2>/dev/null` guards in the script.
**Decision:** Always add `EnvironmentVariables/PATH` to any LaunchAgent plist that uses Homebrew tools: `/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin`. Also verified the backup destination directory must exist before first run — LaunchAgents don't create it.
**Alternatives rejected:** Symlinking Homebrew tools to `/usr/local/bin` — fragile and pollutes system paths; using full absolute paths in scripts — works but brittle across machines.
**Consequences:** Any future LaunchAgent using Homebrew (brew, gpg, restic, gcloud, etc.) must include this PATH block. New LaunchAgents should be tested manually before relying on the scheduled run. The backup now runs correctly at 9am daily.
**References:** [backup-recovery.md](../private/personal/docs/backup-recovery.md) · `~/Library/LaunchAgents/com.claritypledge.backup.plist`

---

## 2026-02-25 [process]: GCS storage class — always verify before assuming

**Context:** During a cost analysis, `claritypledge-backups/mac` (211GB Restic backup) was assumed to be Standard storage class ($0.020/GB/mo). The actual class was Coldline ($0.004/GB/mo) — already optimized. The optimization suggestion was wrong by 5x.
**Decision:** Before suggesting storage class changes, always verify with `gcloud storage buckets describe gs://BUCKET --format="value(default_storage_class)"`. Never assume Standard class on an existing bucket.
**Alternatives rejected:** Trusting cost estimates from bucket listing alone — sizes are visible but storage class is not.
**Consequences:** gcp-spend skill now annotates known bucket storage classes explicitly. Future cost audits must run bucket describe before calculating storage costs.
**References:** [gcp-spend.md](.claude/commands/slava/maintain/gcp-spend.md)

---

## 2026-02-25 [process]: /weekly reads activity log to surface WIP age and recurring blockers

**Context:** /weekly had no visibility into intra-week patterns — it could see commits and metrics but not whether a feature was stuck for 3 days or the same blocker kept appearing.
**Decision:** Step 3 reads `.private/logs/activity.log` (populated by `/status` checks) and derives: total status checks this period, P-numbers active across 2+ calendar days (WIP age signal), keywords recurring in `blocked:` field 3+ times (chronic blocker signal). Surfaced in evidence picture as ACTIVITY LOG row.
**Alternatives rejected:** Git-only analysis — commits don't show in-progress state or blockers, only completed work.
**Consequences:** Chronic blockers that never make it into commits are now visible in the weekly retro. WIP >2 days surfaces before it becomes a week-long invisible drag.
**References:** [weekly/SKILL.md](.claude/commands/slava/maintain/weekly/SKILL.md)

---

## 2026-02-25 [process]: Privacy in public repo — two-layer protection architecture

**Context:** Personal email addresses (owner's private emails) were found in `docs/technical/mcp-servers.md`, a public file. Needed a systematic approach to prevent future exposure in a public AGPL repo.
**Decision:** Two-layer model: (1) mechanical — pre-commit hook section 16 checks staged diffs for known PII patterns (specific email addresses, domains) and warns before commit; (2) judgment — `/weekly` step 2.10 spawns a subagent to read docs changed that week and flag nuanced content the hook misses (private business strategy, personal struggles, named-person opinions). Canonical location for all personal identity info is `.private/docs/accounts.md` (double-gitignored). Public docs reference it as "see `.private/docs/accounts.md`".
**Alternatives rejected:** Pre-commit as a hard block — too aggressive, legitimate files in `.private/` would false-positive; single-layer mechanical-only — misses contextual/nuanced content that requires reading.
**Consequences:** All future doc work touching personal info must use `.private/`. The pre-commit hook warns on known patterns; `/weekly` catches the rest. Neither is a substitute for the other.
**References:** [pre-commit-checks.sh](scripts/pre-commit-checks.sh) · [privacy/SKILL.md](.claude/commands/slava/maintain/privacy/SKILL.md) · [weekly/SKILL.md](.claude/commands/slava/maintain/weekly/SKILL.md) · [accounts.md](.private/docs/accounts.md)

---

## 2026-02-25 [technical]: Inline system prompts in Supabase edge functions

**Context:** P425 edge function originally used `Deno.readTextFile('./prompts/v1.md')` to load the system prompt. Works in local `supabase functions serve` but fails with a silent 500 in deployed functions — Deno cannot resolve relative paths at runtime in the deployed sandbox.
**Decision:** Always inline system prompts as template literals directly in `index.ts`. Keep a source-of-truth `.md` file alongside for readability, but the deployed code must not use `Deno.readTextFile` for anything loaded at request time.
**Alternatives rejected:** Bundling the prompt file as a static asset — no documented Supabase mechanism for this; env var — too unwieldy for multi-paragraph prompts.
**Consequences:** All future edge functions with prompt files must inline them. The `.md` file stays as a comment/reference but is not read at runtime.
**References:** [story-guide-chat/index.ts](../supabase/functions/story-guide-chat/index.ts)

---

## 2026-02-25 [process]: ops@ inbox monitored in /weekly — subagent triages all unread

**Context:** ops@claritypledge.com accumulates service signups, notifications, and occasional real emails. No regular review existed — inbox was checked ad-hoc.
**Decision:** Added step 2.11 to /weekly: background subagent reads all unread emails via `scripts/read-ops-email.mjs --unread`, classifies into ACTION_NEEDED / DECISION / FYI / SPAM, marks all as read, and surfaces only actionable items. FYI and SPAM are suppressed with counts. If anything looks potentially actionable (human sender, non-obvious subject), fetches full bodies first with `--unread --body --mark-read` in a single IMAP connection.
**Alternatives rejected:** Checking ad-hoc — creates blind spots; checking all emails with full bodies — wasteful when 90%+ are receipts/notifications.
**Consequences:** ops@ is now cleared and triaged every week. The `read-ops-email.mjs` script now supports `--unread`, `--body`, `--mark-read` flags. Note: untested against live server — smoke test needed: `node scripts/read-ops-email.mjs --unread`.
**References:** [weekly/SKILL.md](.claude/commands/slava/maintain/weekly/SKILL.md) · [scripts/read-ops-email.mjs](scripts/read-ops-email.mjs)

---

## 2026-02-26 [process]: KDD loop was write-only — skills now read decisions.md before building

**Context:** KDD runs frequently and produces ~114 decisions across [product], [technical], [process] tags. Audit revealed no skill read those docs before building — /architect, /create-prd, /spec-review, and /review-all all started cold without consulting prior decisions. The loop was write-only.
**Decision:** Four skills updated to consume decisions.md filtered by tag: /architect reads [technical] + INDEX.md before proposing patterns; /create-prd reads [product] + INDEX.md in Phase 0; /spec-review adds dimension 8 (prior decisions conflict, BLOCK on contradiction); /review-all code agent reads [technical] before reviewing. Tag docs in /kdd now show which skills consume each tag so writers tag accurately.
**Alternatives rejected:** "Fix two skills first, then see" — no reason to defer when all 4 fixes are independent markdown edits with no risk.
**Consequences:** Prior decisions are now visible to the skills that build next. Contradictions surface as BLOCK in spec-review before implementation starts, not after. Writers who see the consumer column in /kdd tag docs will tag with more intent.
**References:** [architect.md](.claude/commands/slava/build/architect.md) · [create-prd/agent.md](.claude/commands/slava/build/create-prd/agent.md) · [spec-review.md](.claude/commands/slava/build/spec-review.md) · [review-all/SKILL.md](.claude/commands/slava/build/review-all/SKILL.md)

---

## 2026-02-25 [process]: clarity-agent VM desktop — noVNC replaced by Chrome Remote Desktop + XFCE4

**Context:** LinkedIn Helper 2 needs a visible GUI desktop so the operator can solve LinkedIn CAPTCHAs and monitor automation. noVNC was the original approach but proved fragile: 4-component chain (Xvfb → x11vnc → websockify → cloudflared tunnel), persistent black-screen rendering from Electron/EGL, and broken between sessions.
**Decision:** Replace noVNC stack with Chrome Remote Desktop (CRD) + XFCE4. CRD is a Google product, free, accessed at remotedesktop.google.com — no ports, no tunnels, session-persistent. XFCE4 gives a full desktop with taskbar and terminal. Xvfb moved from manual start to systemd (`xvfb.service`). LH and terminal auto-start via `~/.config/autostart/`. PIN stored as `CRD_PIN` in `.env.local`.
**Alternatives rejected:** noVNC — 4 brittle components, black rendering on EGL; VNC over direct port — requires GCP firewall change + SSH tunnel per session.
**Consequences:** On every VM start: CRD, Xvfb, and LH start automatically. Connect via remotedesktop.google.com to see full desktop. ⚠️ LH wrapper (`/usr/lib/linked-helper/resources/out/linked-helper`) survives restarts but NOT LH auto-updates — re-apply after any LH upgrade.
**References:** [cloud-agent.md](docs/technical/cloud-agent.md)

---

## 2026-02-25 [product]: Event transactional email copy — plain language over corporate-speak

**Context:** Reviewing all 5 email templates (confirmation, reminder, feedback, cancellation, uncancel) revealed formal phrases that don't match the product's casual, human tone.
**Decision:** Plain-language standard for all transactional emails. Specific fixes: "You're going to: X" → "You're in: X", "reinstated. Here are the current details" → "is back on — here are the details", "sorry for the inconvenience" → "sorry this didn't work out", "Here's what you need to know" → "Here's what changed".
**Alternatives rejected:** Formal register — sounds trustworthy but feels corporate for a community product.
**Consequences:** When adding new email templates, default to conversational tone. Test: would a friend send this? If it reads like a corporate notification, rewrite it.
**References:** `supabase/functions/send-event-emails/index.ts`

## 2026-02-25 [process]: Agent-driven feature testing with live DB state setup

**Context:** UAT-3.3 for P437 (uncancel email) was skipped because the test event had no RSVPd attendees. Testing the email path required a real RSVP and a future-dated event.
**Decision:** When a feature requires specific DB state to test, set it up autonomously via curl against the test Supabase project (service role key). Pattern: query → insert/update → test in browser → done.
**Alternatives rejected:** Asking user to RSVP manually — unnecessary delegation when service role access is available.
**Consequences:** Any feature test needing seed data (RSVPs, specific event states) can be fully agent-driven. Only stop if auth (CAPTCHA, 2FA) is required.
**References:** Test project ref `gfjctyxqlwexxwsmkakq`, service role key via `supabase projects api-keys`

## 2026-02-25 [process]: Monthly meta-review — /monthly skill for behavioral pattern extraction

**Context:** One-time deep-dive session extracted 6 months of contrarian decisions from JSONL session logs to identify behavioral patterns not yet in CLAUDE.md. Found high signal: 132 genuine contrarian moments, 3 new patterns, 6 systemic issues.
**Decision:** Run `/monthly` monthly (not weekly). It spawns 3 parallel agents: (A) contrarian decisions + abandoned work, (B) agent errors + recurring questions, (C) CLAUDE.md critical review. Findings filtered against existing CLAUDE.md before surfacing — prevents re-finding already-captured patterns.
**Alternatives rejected:** Ad-hoc retrospectives — no methodology, findings go nowhere. Weekly cadence — thin signal, high noise.
**Consequences:** CLAUDE.md has 6 new behavioral improvements from this first run. `/monthly` is the canonical home for collaboration system improvement. Chrome extension can fill+submit external forms (GitHub support) — flag for automation rather than manual work.
**References:** `.claude/commands/slava/maintain/monthly/SKILL.md`, `CLAUDE.md` (6 new rules in 008b24a)

## 2026-02-25 [process]: Parallel feature work requires separate worktrees — index collision rule

**Context:** During a session where cleanup work was staged, a parallel session committed P437 and swept up the staged cleanup files into the wrong commit. Root cause: two sessions sharing one git index in the same worktree.
**Decision:** Any time two features are being developed simultaneously, they must run in separate worktrees. `/dev` pre-flight check now detects uncommitted other-feature work and presents three options: (A) create worktree, (B) commit current work first, (C) proceed with manual discipline.
**Alternatives rejected:** Trusting manual staging discipline — too easy to sweep wrong files, especially when agents commit autonomously.
**Consequences:** `/dev` skill has a step-0 gate. CLAUDE.md has the principle under "Parallel Feature Work — Index Collision Risk". Cost: 30 seconds per `/dev` invocation on a clean tree (zero cost).
**References:** `CLAUDE.md` (Parallel Feature Work section), `.claude/commands/slava/build/dev.md` (step 0), `docs/technical/worktree-setup.md`

## 2026-02-25 [process]: Analytics observability split — /analytics skill + /weekly orchestration

**Context:** /weekly accumulated inline analytics steps (Supabase user health, Mixpanel event audit) that had no clear ownership boundary. As more data sources become relevant (Stripe at C2, Ghost at R1), they'd keep piling into /weekly, making it hard to run analytics standalone.
**Decision:** Extract `/slava:maintain:analytics` as an independent skill. It owns: Mixpanel session check → login if needed → Supabase user health → Mixpanel board metric reads. `/weekly` calls it as a single step. New sources (Stripe, Ghost) are added to `/analytics` only — never inline in `/weekly`.
**Alternatives rejected:** Keep all steps inline in /weekly — works short-term but breaks as sources grow; `/weekly` would become an analytics file.
**Consequences:** Running `/analytics` standalone gives a clean "how is the product doing right now?" answer without running a full retro. `/weekly` stays focused on the retrospective, not data collection.
**References:** `.claude/commands/slava/maintain/analytics.md`

## 2026-02-25 [product]: Story event attribution — C1 measurement gap closed

**Context:** C1 hypothesis ("stories solve /live's cold start problem") requires measuring story creation rate and story→session attribution. Mixpanel had zero story events — we couldn't tell if stories were being created or if /live sessions referenced a story. C1 kill/proceed criteria were unmeasurable.
**Decision:** Add `story_created` (on save), `story_viewed` (on page load, with `viewer_authenticated` + `has_points`), and `story_session_started` (when a story is selected in /live) events. Kept legacy `story_saved` event to preserve any existing Mixpanel charts.
**Alternatives rejected:** Wait until C1 measurement becomes urgent — means flying blind on the core hypothesis; cohort data is lost retroactively.
**Consequences:** C1 can now be measured: story creation rate, story→session conversion, and viewer type (anonymous vs authenticated). Retention board will show real data once deployed to prod.
**References:** `docs/technical/analytics.md`, `docs/milestones/c1-stories-live-events.md`

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
- Self-reports don't work (metacomprehension accuracy is only r=0.178 in reading comprehension — barely better than chance; conversational understanding likely worse — people don't know what they don't know)
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
