---
paths:
  - "content/articles/**/*.md"
---

# Content Article Rules

Auto-loaded when editing `content/articles/a*.md`.

## Frontmatter (Required on all article files)

```yaml
---
status: idea          # REQUIRED: content pipeline stage (see below)
title: "Article title"  # REQUIRED: display title
rank: 1               # REQUIRED: sort order within column
tags: []              # REQUIRED: can be empty array
created_at: 2026-02-27T00:00:00.000Z
# published_at: "2026-02-27"  # Set when status transitions to 'published'
---
```

## Status Values (Content Pipeline)

`idea` → `draft` → `editing` → `ready` → `published` → `promoted`

- `idea` — captured, not started
- `draft` — actively writing
- `editing` — draft complete, refining
- `ready` — approved, queued to publish
- `published` — live on Ghost/blog (set `published_at` when moving here)
- `promoted` — distributed (social, newsletter, etc.)

**No** `type`, `delivery_stage`, `blocked_by`, `milestone`, `workstream` — not applicable to content.

## Brand Naming

**ClarityPledge** (one word, CamelCase) for the brand/product/company.
**the Clarity Pledge** (two words) only when referring to the concept (the actual pledge act).
Never `Clarity Pledge` as a brand reference, `claritypledge` as a written name, or `Clarity-Pledge`.
URLs and code-identifiers (`claritypledge.com`, npm package names) are exempt.

## A-Number Assignment

ALWAYS run `./scripts/next-a-number.sh` to get the next article number. Never compute manually.

## Filename Convention

`a{N}_{slug}.md` — e.g., `a1_ai_agent_orchestration.md`

## Content Body

The article body lives in the same file as the frontmatter. Use the file for outline, notes, and full draft — it's all one place.

## Privacy Rule — Process Notes Stay Private

`content/articles/` is a **public git repo**. Never put the following inside article files:
- Contact emails or personal contact info for collaborators/sources
- Outreach tracking ("sent email to X on date Y, awaiting reply")
- Approval status notes about named individuals
- Any content you wouldn't want publicly visible on GitHub

If you need to track this, create a companion file at `.private/articles/{a-number}_notes.md`. The kanban only reads the article file — notes stay invisible to it and to git.

Names in the article's own prose are governed separately: [.claude/rules/pii.md](pii.md) — roles, not names, for **private individuals**. Citing published thinkers by name is fine.

## Publishing Workflow

1. Write in `draft` status
2. Move to `editing` when draft is complete
3. Move to `ready` when approved
4. Publish to Ghost manually, then set `status: published` + `published_at: YYYY-MM-DD`
5. Distribute (social/newsletter), then set `status: promoted`

Use `/slava:content:draft-blog` → `/slava:content:ship-blog` → `/slava:content:promote-blog` for full lifecycle.

## Where Enrichment Goes — Status Is the Routing Signal

Once a draft exists, the a-spec is the planning/provenance record — not a content destination. When adding new content to an a-spec, check `status:` first.

| status | New content goes to |
|--------|---------------------|
| `idea`, `draft` | a-spec body (workspace phase) |
| `draft-ready`, `published`, `promoted` | `draft_file:` field in frontmatter (live draft phase). a-spec gets a one-line log only. |

**Bidirectional link.** Whenever an a-spec has a parent draft, frontmatter pointers come in pairs:
- a-spec frontmatter: `draft_file: content/blog/{slug}.md`
- blog draft frontmatter: `source_spec: content/articles/a{N}_{slug}.md`

Created by `/prepare-blog` at draft birth. Repaired by any consumer on first orphan encounter.

**Resolution when `draft_file:` is missing but status ≥ `draft-ready`:**
1. Grep `content/blog/` for matching slug or title.
2. Match found → backfill both pointers (`draft_file:` on a-spec, `source_spec:` on draft), then proceed with the actual enrichment to the **draft**.
3. No match → report the orphan to the user and ask where the live article lives. Do not silently write to the a-spec.

**Log line format** — always append one line to the a-spec on every enrichment event, regardless of whether content went to a-spec or draft:

```markdown
## Enrichment ({YYYY-MM-DD})
Source: {conversation title or skill name}
Applied to: {draft_file path, or "a-spec body" if pre-draft phase}
```

This keeps the a-spec as a frozen historical record after `draft-ready`. New consumer skills that touch a-specs inherit this routing automatically — no per-skill update needed.
