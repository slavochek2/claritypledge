---
status: qa
type: story
rank: 348
workstream: landing
created_date: '2026-11-25'
tags: [landing, video, use-cases]
disclosure: public
pipeline_ran: [dev]
delivery_stage: dev
drafted_by: opus
exec_model: opus
---

# P1731: The hero's demo action is a button, and three pages get the super-short film

Follow-up to P1704 (closed). Founder decisions, this session.

## Problem

> Founder, verbatim: "it's a bit weird to say OR and then just without this play button ... maybe just say watch demo video better than product demo"

The P1704 hero offered "or ▶ Watch the product demo" as a text link: "or" sat below the link's baseline and the second action read as an afterthought. Separately, the 6:26 full film is the product team's own story; on /hiring, /founder and /coach the visitor wants the gist. The founder watched the v4.8 super-short cut (2:57) and chose it for those three pages ("yes to A - i watched it").

## Solution

1. The hero's second action on film pages is a blue-outlined button, same height as the discovery-call button, with a play icon and the founder's wording **"Watch demo video"**; no "or". Behaviour unchanged (jumps to the film and starts it; `demo_link_clicked` with the page). /hospitals keeps "or Take the Pledge".
2. `DEMO_VIDEO_SHORT` (v4.8 super-short, 2:57, uploaded to `demo/product-demo-v4.8-super-short-v1.mp4` with its poster) on /hiring, /founder and /coach; the full cut stays on /builders and /change-managers; /hospitals still has no film.

## Non-Goals

- Do NOT change the discovery-call button, the closing sections, or /hospitals and /communities.

## Acceptance Criteria

- [x] On /builders, /change-managers, /hiring, /founder and /coach the hero shows a filled "Book a 15-min discovery call" and a blue-outlined "Watch demo video" button, no "or"; on a phone they stack without overflow (Chrome, 375px: no horizontal scroll, button 209×55). /hospitals keeps "or Take the Pledge".
- [x] /hiring, /founder and /coach play the super-short cut (2:57 badge, super-short poster, verified on /hiring in Chrome); /builders and /change-managers keep the 6:26 cut (test `DEMO_BY_PAGE` mapping).
- [x] Both new files return 200: `video/mp4` 30,501,575 bytes; `image/jpeg` 48,121 bytes.
- [x] Related suites pass (186 tests), including new tests for the mapping and the outlined button.

## Pre-deploy Checklist

- [x] Upload the super-short cut and its poster under `demo/` (founder approved: "yes to A"); both URLs return 200.
