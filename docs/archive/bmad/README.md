# BMAD workflow archive (read-only)

BMAD was the AI-assisted development methodology this project used until early 2026, before the
`.claude/commands/slava/` skill set replaced it. Its workflow outputs lived at `docs/bmad/` and were
moved here by P1221 on 2026-09-03. The tool is retired: nothing in the repo runs a BMAD workflow,
and the `.bmad/` and `bmad/` directories it wrote to are gitignored and absent.

**These files are historical record.** Do not extend them, and do not treat them as current design
intent — the live design system is [docs/design-system.md](../../design-system.md), which supersedes
[archive/ux-design-specification.md](archive/ux-design-specification.md). Closed specs under
`features/done/` and `features/archive/` still cite paths in here; that is why the folder is kept
rather than deleted.

## Documents

- [agent-prep-spec-reminder-protocol.md](agent-prep-spec-reminder-protocol.md) — reminder protocol for the retired `/prep-spec` agent
- [clarity-live-rating-flow.md](clarity-live-rating-flow.md) — UX spec for the P23 rating flow
- [prd-p32-ideas-in-live.md](prd-p32-ideas-in-live.md) — PRD draft, ideas in `/live`
- [archive/ux-design-specification.md](archive/ux-design-specification.md) — Clarity Chat design spec, superseded 2026-01-15
- `bmm-workflow-status.yaml` — last BMAD workflow-status snapshot

### Data-privacy-advisor agent definition

- [agents/data-privacy-advisor/agent-identity.md](agents/data-privacy-advisor/agent-identity.md)
- [agents/data-privacy-advisor/agent-persona.md](agents/data-privacy-advisor/agent-persona.md)
- [agents/data-privacy-advisor/agent-purpose.md](agents/data-privacy-advisor/agent-purpose.md)
- [agents/data-privacy-advisor/agent-commands.md](agents/data-privacy-advisor/agent-commands.md)
- [agents/data-privacy-advisor/agent-yaml.md](agents/data-privacy-advisor/agent-yaml.md)
- [agents/data-privacy-advisor/brainstorming-session.md](agents/data-privacy-advisor/brainstorming-session.md)

### Wireframes

`diagrams/` holds 26 Excalidraw wireframes (P23, P27, P32, P41, P60, P63, Sifter MVP v2–v8, story-point
patterns 1–3 and A–B); `diagrams/_archive/` holds the superseded revisions. Open them with Excalidraw.
