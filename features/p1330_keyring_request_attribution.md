---
status: qa
type: task
rank: 108
workstream: infrastructure
created_date: '2026-09-17'
tags: [credentials, keyring, notifications]
disclosure: public
delivery_stage: dev
pipeline_ran: [create-spec, dev]
drafted_by: opus
exec_model: opus
exec_effort: low
driver: friction
---

# P1330: Keyring requests name the session and mark the asking tab

## Problem

When an agent reads a locked credential, the founder saw a notification carrying an 8-hex session
id and 160 chars of shell-wrapper boilerplate, then a macOS dialog saying only "python". Nothing
matched a tab on screen, and the agent's stderr announcement is collapsed into "Ran N shell
commands".

> Founder, 2026-09-17: "when I read this notification I still don't know which session it is ...
> the dialog comes, it just says Python."

## Solution

- `scripts/lib/keychain.py`: notification title = session title (custom title, else generated
  title), subtitle = key, body = reason; a BEL is written to the requesting agent's terminal so
  Ghostty marks that tab 🔔. Caller boilerplate replaced with a readable label. Log gains
  `title` and `agent_tty`.
- `scripts/lib/keyring-requests.py`: SESSION column shows the title.
- `.claude/rules/credentials.md`: agent must state key, tier, action and the coming dialog in its
  own reply before the read.

## Non-Goals

- Renaming the "python" in the macOS dialog (it names the executable; out of reach without a
  signed helper app).
- Binding the title to the process: the session id is caller environment and can be forged; the
  bell rings the real process's tty, so the notification tells the founder to trust the 🔔 tab.

## Done-When

- [x] Notification names the session title, not the hex id — evidence: `_request_context` on this
  session returned `title='Agent permission request clarity'`.
- [x] The asking tab is identified — evidence: `_agent_tty()` resolved `ttys020` (this session).
- [x] Caller shows a readable label — evidence: `caller='Claude Code shell command'`.
- [x] Request log report shows the session — evidence: `keyring.sh requests` SESSION column.
- [x] Rule requires an in-chat announcement — `.claude/rules/credentials.md` "Say why you are asking".
- [x] No regression in keyring selftest — 34 pass, 1 fail pre-existing on main (env file mode).
- [x] Independent review — Codex Sol: 4 findings, 3 fixed, 1 accepted (forgeable title, pre-existing,
  mitigated by the bell). Gemini 3.8 blocked the prompt twice (blockReason=OTHER): not covered.