# Process Learnings

Accumulated friction findings from `/kdd` meta-reflections. Reviewed in `/weekly`.

Entries are appended by `/kdd` step 6. Status tracks whether the fix was applied.

---

## Log

<!-- New entries appended at top, newest first -->

## 2026-02-23 — pagehide handler gotchas

**Friction:** Initial `pagehide` implementation was missing two critical guards that the code review agent caught: (1) no bfcache check (`e.persisted`), causing cleanup to fire when browser suspends the page for back/forward navigation — then `iAmLeavingRef` stays true permanently after restore; (2) no view guard, so creator closing tab from the waiting room would signal `sessionEnded` on a session that hadn't started yet.
**Root cause:** `pagehide` has two well-known edge cases (bfcache + component-vs-page unload distinction) that aren't obvious without prior use.
**Before:** `pagehide` handler with no guards on `e.persisted` or current view.
**After:** Always add three guards to any `pagehide` cleanup handler: (1) `if (e.persisted) return` — skip bfcache suspends; (2) gate on the view/state where cleanup is actually appropriate; (3) add a `pageshow` handler that resets any "leaving" flags when `e.persisted === true` (bfcache restore).
**Action:** doc update (process-learnings only — too narrow for CLAUDE.md)
**Status:** done

## 2026-02-23 — Google OAuth Option B

**Friction:** Manual browser verification of Google OAuth flow was impossible — `mcp__claude-in-chrome__computer` failed ("Cannot access a chrome-extension:// URL") and `javascript_tool` failed ("Browser extension is not connected"). Had to delete test users via Supabase API so the user could self-test manually.
**Root cause:** The `computer` and `javascript_tool` chrome-in-chrome tools require a deeper extension connection than `read_page`/`form_input`. Third-party OAuth flows (Google, GitHub) can't be verified by automation anyway — Google's bot detection blocks it.
**Before:** No documented guidance on what browser automation can/cannot verify for auth flows.
**After:** When verifying OAuth flows: unit tests cover the callback logic; manual smoke test by the user is the only reliable end-to-end check. Note this explicitly when handing off.
**Action:** doc update (process-learnings only — too narrow for CLAUDE.md)
**Status:** done

## 2026-02-23 — Content pipeline first publish

**Friction:** `/ship-blog` verified email via `GET /emails/` which returns 501. Spent time debugging a non-existent endpoint.
**Root cause:** Skill was written before testing against real Ghost API.
**Before:** `GET /ghost/api/admin/emails/?filter=post_id:{id}` — returns 501 NotImplementedError
**After:** `GET /ghost/api/admin/posts/{id}/?include=email` — check `posts[0].email.status` after ~15s
**Action:** doc update (ship-blog.md updated)
**Status:** done

---

**Friction:** Ghost Mailgun key was silently invalid — newsletter appeared to publish but email was stuck in `submitting` with a generic error. No obvious diagnostic path.
**Root cause:** Mailgun key had expired/been revoked; Ghost settings API returns 501 for `mailgun_api_key` so can't verify programmatically; Ghost error message is generic.
**Before:** No documented diagnostic path for newsletter send failures.
**After:** Diagnose path: (1) Check `posts[0].email.status` after publish. If `pending`+error → (2) Test Mailgun key directly via `GET https://api.eu.mailgun.net/v3/domains` with `Basic api:{key}`. If 401 → key is invalid → rotate at app.mailgun.com → update in Ghost Admin → Settings → Email newsletter → Mailgun → Edit. Ghost settings API cannot update this key (501). Key also stored as `MAILGUN_API_KEY` in `.env.local` for reference.
**Action:** doc update (ghost-blog.md + ship-blog.md updated)
**Status:** done

