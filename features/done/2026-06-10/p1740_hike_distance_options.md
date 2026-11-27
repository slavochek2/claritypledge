---
status: all-done
type: story
severity: low
workstream: events
created_date: '2026-11-27'
drafted_by: opus
exec_model: opus
exec_effort: high
tags: [events, hike, stats]
disclosure: public
pipeline_ran: [inline, dev]
flow: inline
completed_at: 2026-11-27
---

# P1740: Hike stats show a short/long distance pair ("9 or 14 km")

## Problem

> **Founder framing, verbatim (2026-11-27):** "can this be done better? e.g. 9/14? or something like that?" … "maybe 9 or 14 km , 3.5 or 5 h ?"

A hike that splits into a short and a long group (Mon Jing, 2026-12-06: 9 km or 14 km) can only show one distance in the stats strip, because `hike_details.distance_km` is a single number. The page said "14 km", which overstates the hike for anyone planning the short option. Walking time already accepts free text ("3.5 or 5 h").

## Solution

Optional `hike_details.distance_options_km`: exactly `[short, long]`, both positive, short < long, and still distinct after display rounding. When valid, the strip renders "9 or 14 km" with real spaces, "or" small like the unit, no wrap inside the value; a walking time written "3.5 or 5 h" gets the same treatment; otherwise it falls back to `distance_km` exactly as before. No schema change (`hike_details` is jsonb).

## Done-When

- [x] `distance_options_km: [9, 14]` renders "9 or 14 km" — `src/tests/p1740-hike-distance-options.test.tsx`
- [x] Missing or malformed options (empty, single, three, string, negative, zero, duplicate, reversed, equal after rounding) fall back to `distance_km` — same test
- [x] Existing hike layout tests still pass (`p1403-social-hike-layout.test.tsx`, 20/20 together)

## Non-Goals

Changing `distance_km` semantics, OG/share text, or the event form (the field is hand-set like `banner_mobile_url`).
