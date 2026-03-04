---
status: backlog
type: task
rank: 8
tags: [legal, tos, content, maintenance]
created_date: 2026-03-04
---

# P474: Migrate ToS from TSX to Markdown

## Problem Statement

The Terms of Service live as raw JSX in `src/app/pages/terms-of-service-page.tsx`. This makes the `/tos-review` skill's output harder to review and apply — diffs against JSX are noisy, and legal text inside JSX is awkward to edit safely.

Migrating to a markdown content file makes the ToS independently editable, produces clean diffs, and separates legal content from rendering logic.

## What to Do

1. Create `src/app/content/tos.md` — extract all section text from the TSX into clean markdown
2. Update `terms-of-service-page.tsx` to render from the markdown file (using a markdown renderer or by splitting into structured content objects)
3. Keep `COPY.LEGAL_LAST_UPDATED` in `copy.ts` as the single source for the update date
4. Verify the rendered page is visually identical

## Acceptance Criteria

- [ ] `src/app/content/tos.md` contains all ToS text in clean markdown
- [ ] `terms-of-service-page.tsx` renders from the content file (no raw legal text in JSX)
- [ ] `/terms-of-service` page looks identical before and after migration
- [ ] `/tos-review` skill's Stage 7 instructions updated to reference `content/tos.md`

## Why Not Now

Not blocking. Run after the immediate ToS content update (post-P425 review) is done. The skill works fine with the TSX in the meantime — it's just noisier.
