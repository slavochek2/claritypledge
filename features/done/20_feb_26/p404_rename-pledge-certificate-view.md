---
status: done
completed_at: "2026-02-20"
type: task
rank: 404
workstream: foundation
created_date: 2026-02-20
tags: []
---

# TASK: Rename profile-visitor-view.tsx to pledge-certificate-view.tsx

## Goal

`profile-visitor-view.tsx` is misleadingly named — it's actually the pledge certificate component used at `/p/:slug/pledge`, not the main profile view. This caused an agent to read the wrong file and give incorrect answers about the profile page. Rename to prevent recurrence.

## Steps

1. Rename `src/app/components/profile/profile-visitor-view.tsx` → `pledge-certificate-view.tsx`
2. Update the one import in `src/app/pages/pledge-page.tsx`
3. Add route comment at top of both `pledge-page.tsx` and `profile-page-v2.tsx`:
   - `// Route: /p/:slug/pledge`
   - `// Route: /p/:slug`

## Done When

- [ ] File renamed, import updated, app builds
- [ ] Both page files have route comments at top
