---
status: week
type: bug
rank: 94
severity: medium
workstream: canvas
date_reported: 2026-11-05
created_date: 2026-11-05
drafted_by: opus
exec_model: opus
exec_effort: high
tags: [canvas, composer, upload, p1536]
disclosure: public
delivery_stage: create-bug
pipeline_ran: [create-bug]
---

# P1618: Canvas thread upload uses the paperclip, so the founder could not find upload

## Summary

In a canvas thread the composer's upload button shows the paperclip, which elsewhere in the composer means "Attach a point or story". The founder could not find upload.

## Root Cause

P1536 3c X3 chose the paperclip for canvas upload ("the paperclip means attach"). The same icon then carries two meanings, and the composer hint says nothing about uploading.

## Reproduction Steps

1. Open a canvas draft thread, in the workspace or the mirror chat.
2. Look at the composer: a paperclip, and the hint "Reply in thread".

**Reproduction rate:** 100%

## Expected Behavior

Founder decision (option A): a distinct Upload icon, still named "Upload" as aria-label and hover title; the paperclip stays for points and stories only. On canvas threads, while uploads are available, the hint reads "Reply, or upload a file". Every other composer is unchanged.

## Actual Behavior

Paperclip icon; hint "Reply in thread".

## Affected Files

- `src/app/pages/chat/CanvasUploadButton.tsx` — the icon, in the button and in the waiting status
- `src/app/pages/chat/use-canvas-parts.tsx`, `src/app/pages/chat/ThreadPanel.tsx` — the thread's hint
- `src/app/pages/canvas/workspace-chat.tsx` — the hint before the first Send

## Severity

**Medium** — upload works, but the person it is for could not find it.

## Fix Approach

Swap the icon, add one copy constant, pass the hint only while the Upload spot is a live button. Amends P1536 X3; recorded in the P1536 spec and decisions.md.

## Acceptance Criteria

- [ ] A canvas thread's upload shows the Upload icon, named "Upload" (aria-label and title), with no paperclip; the waiting status has no paperclip either
- [ ] The hint reads "Reply, or upload a file" on a canvas thread while uploads are available, and "Reply in thread" while the Upload spot waits or the draft is closed
- [ ] A non-canvas thread and the main composer are unchanged, and the paperclip there still attaches points and stories
- [ ] The hint stays on one line at 1440, 375 and 320
