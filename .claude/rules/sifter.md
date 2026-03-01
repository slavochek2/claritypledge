---
paths:
  - "content/sifter/**/*.md"
---

# Sifter Rules

Auto-loaded when editing any file under `content/sifter/`.

## Hard Stop — Session Files Must Not Live Here

**`content/sifter/sessions/` is gitignored but still a public-facing path.**

Session files contain private context: brain dumps, real people's names, verbatim private messages.
They must NEVER be written to `content/sifter/sessions/` — they belong in `.private/sifter/sessions/`.

**If you are about to write a session file to `content/sifter/`:**
1. Stop immediately.
2. Use `.private/sifter/sessions/{session-name}.md` instead.
3. Verify `.private/sifter/sessions/` directory exists: `mkdir -p .private/sifter/sessions`

**If you find an existing file in `content/sifter/sessions/`:**
1. Move it: `mv content/sifter/sessions/{name}.md .private/sifter/sessions/{name}.md`
2. Untrack it: `git rm --cached content/sifter/sessions/{name}.md`
3. Verify it's no longer staged: `git status`

## What Lives in `content/sifter/` (public)

Only structural/config files that have no personal content:
- `README.md` or index files describing the sifter system
- Schema definitions or templates (no filled-in user data)

Everything else → `.private/`.
