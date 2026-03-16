---
title: "Mobile scroll bounce causes page refresh in /live"
type: bug
status: backlog
priority: high
created_date: 2026-03-16
p_number: P528
---

# Mobile scroll bounce causes page refresh in /live

## Problem

On mobile devices, scrolling up triggers the browser's pull-to-refresh behavior, which reloads the page and kicks the user out of an active /live session. Session state is lost — the user must rejoin via session code.

Observed during Pair C session (2026-03-14). This is a session-killer for facilitated sessions.

## Fix Hint

Apply `overscroll-behavior: none` on the /live page container to prevent pull-to-refresh from triggering during active sessions.

## Acceptance Criteria

- [ ] Scrolling up on mobile in /live does not trigger page refresh
- [ ] Normal scrolling within the page still works
- [ ] Session state is preserved during scroll interactions
