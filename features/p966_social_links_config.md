---
id: P966
title: Centralize social links + add YouTube
type: task
status: qa
rank: 1
tags: []
delivery_stage: ship
pipeline_ran: [dev, ship]
created: 2026-06-26
---

# P966 — Centralize social links + add YouTube

## Problem
Social URLs are hardcoded in multiple places (footer GitHub link, `seo.tsx` Organization `sameAs`). Adding YouTube and future socials (X, Instagram) multiplies the drift surface.

## Appetite
Small — one config refactor in two files plus a new config module.

## Solution
- New `src/app/components/layout/social-links.ts` as single source of truth.
- Footer Social row reads from it; add YouTube (`https://www.youtube.com/@ClarityPledge`).
- `seo.tsx` Organization `sameAs` derives from the same config (entity-linking for SEO).
- NOT in header nav — primary nav stays for on-site actions; social is footer + schema only.

## Risks / Non-Goals
- Blog runs on a separate Ghost property; this change does not touch it. Its footer + schema get the same treatment manually in Ghost when the founder chooses.
- GitHub link keeps its "Open Source (AGPL-3.0)" label; only the URL is centralized.

## Done-When
- [x] `social-links.ts` is the only place social/profile URLs are defined for footer + `sameAs`.
- [x] YouTube appears in the footer and in Organization schema `sameAs`.
- [x] Build + typecheck pass.
