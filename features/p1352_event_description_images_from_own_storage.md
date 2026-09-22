---
status: week
type: story
rank: 10
workstream: events
created_date: '2026-09-22'
tags: [events, markdown, images, security]
disclosure: public
delivery_stage: create-spec
pipeline_ran: [create-spec]
drafted_by: opus
exec_model: opus
exec_effort: high
driver: heuristic
---

# P1352: Event descriptions can show images hosted on our own storage

## Problem

**Situation:** Event descriptions render through `renderMarkdownSafe` (`src/lib/markdown.ts`), whose
`safeMd` renderer returns `''` for every image (`image() { return ''; }`). This is deliberate:
descriptions are host-written, and an image pointing at an arbitrary URL lets its owner see who
opened the page. `EventDetail.tsx:785` and the org footer note (`OrgFooterNote.tsx:36`, P1264) both
use this renderer.

**Complication:** Clarity Night #2 (Tue 2026-09-29, "AI and your ikigai") needs a visual explainer
of ikigai for people who don't know the word. Words alone explain it poorly, and the page can't show
a picture at all.

**Question:** Let event descriptions show images, without reopening the tracking risk the strip
exists to close.

> Founder, verbatim (2026-09-22): *"ikigai is more like illustration to explain visually to those
> who don't know"* — and on the banner, separately: *"pictures of people attract everybody more."*

## Appetite

Blast radius: medium — one render path (event descriptions), on a surface every event uses.
Reversibility: git revert. Decision density: low; scope decided in conversation (own storage only,
no animation).

## Invariants

- **Only images hosted on our own storage render.** An image whose URL is not under this project's
  public storage URL is dropped exactly as today. The allowlist is a URL-prefix check on the parsed,
  normalised URL, never a substring match (`https://evil.example/?x=<our-prefix>` must be dropped).
- **Raw HTML stays stripped** everywhere it is stripped today. No `<img>`, no inline `<svg>`.
- **No other surface changes.** The org footer note (P1264) and the legal renderer (P1219) keep
  dropping images; the change is opt-in for event descriptions only, not a change to `safeMd`.

## Solution

Give the event description its own render path that is `safeMd` plus one rule: an image renders
only when its URL is on our storage allowlist, with the markdown alt text as `alt`, lazy-loaded,
constrained to the description width. Everything else about the renderer is unchanged.

A host gets an image into a description by uploading it to our storage and using its public URL in
standard markdown image syntax. For event #2 the upload is done by hand with the service role on test and
prod; a host-facing upload control is out of scope.

## Risks / Non-Goals

| Risk | Label | Note |
|---|---|---|
| Allowlist bypass via a crafted URL (look-alike host, query-string trick, protocol-relative URL) | MITIGATE | Parse with `URL`, compare origin + path prefix; tests with each bypass shape as must-drop inputs |
| Images copied to Luma/Facebook listings don't come along | ACCEPT | Those listings are text; the image is an explainer on our own page |
| A large image slows the event page on mobile | MITIGATE | Width-constrained, lazy-loaded; the event #2 image is exported at a sensible size |

**Non-Goals**
- Do NOT change `safeMd` itself, the org footer note, or the legal renderer.
- Do NOT add an upload UI for hosts.
- Do NOT support animation, GIF-as-animation, or inline SVG (founder: animation is a later idea).
- Do NOT allow images from any domain other than our own storage, including well-known CDNs.

## Acceptance Criteria

- [ ] An event description with an image from our storage shows the image on the event page, at
      description width, with its alt text — verified on **test** at desktop and a confirmed 375 px.
      `[post-deploy]` re-check on the prod event #2 page.
- [ ] The same description with an image from any other domain shows no image and no broken-image
      icon — verified on test.
- [ ] The org footer note still drops every image — verified by its existing test plus one new case.

## Done-When

- [ ] Tests cover: own-storage image renders; foreign domain dropped; look-alike host, query-string
      and protocol-relative bypass attempts dropped; raw `<img>` and `<svg>` still stripped
- [ ] The failing-path check (epistemic gate 7): a foreign-domain image test is seen to fail when the
      allowlist is removed, then pass with it
- [ ] The Clarity Night publishing skill's description rules mention that one explainer image is
      allowed and must be hosted on our storage

## Open Questions

1. `[FOUNDER DECISION: the ikigai explainer itself — the famous four-circle diagram presented as a
   question ("the famous version, is it right?"), or a neutral illustration?]` The four-circle
   version is contested by one of the evening's own sources (Ken Mogi: it "misrepresents what ikigai
   is"), so presenting it as the definition answers one of the room's questions.

## Related

- [p489](done/22_mar_26/p489_ai_generated_event_banners.md) — event banners; the existing storage bucket images already live in
- [p1349](p1349_full_video_summary_page.md) — per-video summary page
- `src/lib/markdown.ts` — `safeMd`, `legalMd` (P1219), and the 2026 decision that created the three isolated instances
