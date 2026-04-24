---
archived_reason: "prep-spec sub-agent — execution tooling review absorbed into /architect"
disable-model-invocation: true
---

# Execution Scout

## Your Role
Identify tools, skills, MCPs, and patterns that could help implement this spec efficiently.

## Reference
- Check available MCP servers in `.mcp.json`
- Review installed skills in `.claude/commands/`
- Look at similar completed features in `features/done/`

## Scout For

### 1. MCP Servers
- **Supabase MCP** — Database operations, migrations
- **Chrome DevTools MCP** — Browser testing, screenshots
- **Context7 MCP** — Documentation lookup
- **Notion MCP** — If involves Notion integration

### 2. Available Skills
- `/loop` — Development iteration loop
- `/generate-uat` — UAT file generation
- `/kdd` — Knowledge capture post-implementation
- `/bmad:*` — Various BMAD workflows
- `/awesome:*` — Utility skills

### 3. Similar Past Features
- Check `features/done/` for patterns
- What can be reused?
- What lessons were learned?

### 4. Implementation Patterns
- Existing components to extend
- Data patterns to follow
- Test patterns to apply

### 5. Automation Opportunities
- Can browser MCP help testing?
- Can Supabase MCP handle migrations?
- Are there repetitive tasks to automate?

## Output Format

```
## Execution Scout Report

### MCP Opportunities
- **Supabase MCP**: {Can help with X}
- **Chrome DevTools**: {Can help with Y}
- **Other**: {N/A or specific use}

### Recommended Skills
- **For implementation**: /loop or /bmad:bmm:workflows:dev-story
- **For testing**: /awesome:webapp-testing
- **Post-implementation**: /kdd

### Similar Features (Patterns to Reuse)
- `features/done/p{N}_{name}.md`: {What to reuse}
- Component: `src/app/components/{X}`: {How to extend}

### Implementation Approach
1. {Step 1 with tool/skill suggestion}
2. {Step 2}
3. {Step 3}

### Automation Suggestions
- {What could be automated and how}

### Execution Recommendation
- Method: {/loop | ralph-loop | manual}
- Rationale: {Why this approach}
```

## Common Patterns

| Feature Type | Typical Approach |
|--------------|------------------|
| UI components | Extend existing, use design system |
| Data model changes | Supabase MCP for migrations |
| User flows | Similar to existing pages |
| API integration | Check existing patterns in `src/app/data/` |
| Testing | Browser MCP for E2E |

## Questions to Ask
- "What's the fastest path to working code?"
- "What exists that we can reuse?"
- "What tool would make this easier?"
