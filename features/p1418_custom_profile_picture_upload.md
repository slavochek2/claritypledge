---
status: qa
type: story
rank: 26
workstream: profile
created_date: '2026-10-05'
tags: [profile, avatar, settings, storage]
disclosure: public
delivery_stage: ship
pipeline_plan: [create-spec, challenge-prd, generate-tests, dev, verify]
pipeline_ran: [create-spec, challenge-prd, dev, verify, ship]
pipeline_skipped: ["generate-tests -- tests written inline during dev (unit, storage RLS integration, browser e2e)", "ux -- design settled: one Photo row in Settings with Upload / Remove", "architect -- adversarial /challenge-prd covers the one structural question (storage + RLS)"]
flow: dev
drafted_by: opus
exec_model: sonnet
exec_effort: medium
driver: heuristic
---

# P1418: Users can upload their own profile picture

## Problem

> Founder, verbatim (2026-10-05): "Let's enable our users to update their picture. We need to make sure that it works for both Gmail and normal users so they can upload custom photo. Let's kiss it. I think in settings it should be straightforward. Saving probably somewhere in our Google Cloud bucket or whatever."

**Situation:** `profiles.avatar_url` is set only by sign-in. Google users get their Google picture (`src/auth/AuthCallbackPage.tsx:340-357`, provider `google`); email/password users get initials on a colour (`generated`). There is no way to choose a photo.
**Complication:** Even if a photo were written, the callback sets `avatarUrl = googleAvatarUrl` on **every** Google sign-in ("auto-update on re-login", P63), so a custom photo would be silently replaced at the next login.
**Question:** Let any signed-in user set or remove their own photo from Settings, and have it stick and show wherever their avatar shows.

## Appetite

Blast radius: one flow (profile avatar), but rendered on ~30 surfaces that all read `profiles.avatar_url`. Reversibility: migration (new bucket + CHECK value) + code; plain revert, uploaded files orphaned harmlessly. Decision density: low; storage choice recorded below.

## Solution

1. **Storage:** a public Supabase Storage bucket `avatars`. Limit 2 MB, `image/jpeg|png|webp`. Path `<auth.uid()>/<timestamp>.webp`. RLS lets an authenticated user INSERT/DELETE only under their own `<uid>/` folder; public read. First browser-written bucket: existing buckets are service_role-write only, so the owner-scoped INSERT/SELECT/DELETE policies (`(storage.foldername(name))[1] = auth.uid()::text`) are new. `img-src` allows `https://*.supabase.co` (vercel.json), so prod CSP loads it.
2. **Client-side resize:** before upload, centre-crop to a square and re-encode to WebP at 512 px using a canvas. That keeps files small and removes EXIF/GPS metadata as a side effect.
3. **Profile write:** `avatar_url` = public URL, `avatar_provider = 'upload'` (new CHECK value + TS union).
4. **Sticky across Google login:** in `AuthCallbackPage`, when the existing `avatarProvider === 'upload'`, keep it. Google sync applies only to non-upload avatars.
5. **Remove:** clears the upload. Google users go back to their Google picture on the next sign-in. Until then, and for email users, initials show (`avatar_url = null`, provider `generated`). Order: write the profile first, then delete the user's old objects (delete errors ignored, leaving harmless orphans). After a write, call `refreshProfile()` so the header updates without a reload.
6. **Settings UI:** a "Photo" row at the top of Settings with the current avatar, **Upload photo** (or **Change** when a photo is set) and **Remove** (shown only for uploads). A hidden file input with `accept="image/*"`, and an inline error line.

## UI Contract (copy, short and clear)

- Section label: `Photo`
- Buttons: `Upload photo` / `Change` / `Remove`
- Busy: `Uploading…`
- Errors: `Use a JPG, PNG or WebP image.` · `Upload failed. Try again.`
- Remove confirmation: none (one click, reversible by re-uploading).

## Risks / Non-Goals

| Risk | Label | Note |
|---|---|---|
| Google re-login overwrites the custom photo | MITIGATE | Sol. 4 + a unit test on the callback branch |
| A user writes into another user's folder | MITIGATE | Storage RLS on `(storage.foldername(name))[1] = auth.uid()::text`; test both own and foreign paths |
| P1385 rule "never a Supabase bucket" for public media | ACCEPT | That rule covers curated media and `media-src`. User-uploaded *images* already live in Supabase buckets. Signing GCS uploads needs the gcs-signed-url Cloud Function path, which adds a network hop and a secret for no user gain. The p1385 scan bans `getPublicUrl(`: one helper file gets an allowlist entry with this reason. |
| Snapshots that copied `avatar_url` earlier (letters) keep the old photo | ACCEPT | Historical snapshots show the photo of that time |
| HEIC from iPhones can't be decoded by canvas on some browsers | ACCEPT | Safari decodes it. Elsewhere, the type error copy shows. |

**Non-Goals:** Do NOT build a cropper UI. Do NOT change how any avatar component renders. Do NOT touch agent avatars (P1135). Do NOT add moderation.

## Invariants

- A user can only write or delete objects under their own `<uid>/` prefix.
- Signing in with Google never replaces an `avatar_provider = 'upload'` photo.

## Acceptance Criteria

- [x] Email/password user: Settings → Upload photo → photo shows in Settings, header and own profile page after reload
- [x] Google user: upload a photo, sign out, sign in with Google → uploaded photo still shown — verified by unit test on the sign-in rule (`resolve-avatar-fields.test.ts`, mutation-checked); real Google OAuth cannot run in e2e. `[post-deploy]` founder re-checks with a real Google account.
- [x] Remove → initials (email user) / no uploaded photo (Google user); old file deleted from bucket
- [x] Non-image or failed upload shows the one-line error; nothing else changes
- [x] Storage RLS: upload to another user's folder is refused (test)
- [x] Settings photo row looks right at 375, 320 and desktop

## Resolved Decisions

| # | Source | Finding | Resolution | Rationale |
|---|--------|---------|-----------|-----------|
| 1 | /challenge-prd | [WARN] No user-upload bucket precedent | New owner-scoped storage policies | All existing buckets are service_role-only (verified by grep) |
| 2 | /challenge-prd | [WARN] p1385 test will fail | Allowlist one helper file | User images, img-src allows *.supabase.co |
| 3 | /challenge-prd | [WARN] remove() needs SELECT | Owner SELECT policy added | Supabase storage delete requires it |
| 4 | /challenge-prd | Remove ordering | Profile first, then delete, ignore delete errors | No dangling image URL |
| 5 | /challenge-prd | Where the write lives | Extend `updateProfile` with avatar fields | KISS. ACCEPT: a user can point their own avatar_url at any URL; CSP limits the hosts that load |
| 6 | /challenge-prd | Header staleness | `refreshProfile()` after a write | One line, no reload |
| 7 | Codex review | [P1] cleanup swept the folder; two tabs could delete the live photo | Delete only the replaced photo's path | Regression tests in `src/lib/avatar-upload.test.ts` |
| 8 | Codex review | [P2] photo change re-populated Settings, losing unsaved edits | Populate form once per user | Regression test in `settings-page.test.tsx`, mutation-checked |

## Related

- P63 (Google avatar sync), P1385 (public media rule), P880 (profile write guard), P1135 (agent avatars bucket)
