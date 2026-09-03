# Agent Reminder Protocol: /prep-spec

**Purpose:** Ensure agents remind users about `/prep-spec` when working with unprepped specs.

**Applies to:** Architect, UX Designer, PM, Quick Flow Solo Dev, Solo Dev

---

## How It Works

When an agent is about to review or implement a spec, it should:

1. **Check spec frontmatter** for `prepped_date` field
2. **If `prepped_date` is null or missing** → show reminder
3. **Let user decide** → proceed with single review OR run /prep-spec

---

## Frontmatter to Check

```yaml
---
status: today              # Kanban column (don't use for readiness)
prepped_date: '2026-01-19' # ← Check this field (null = not prepped)
reviews:
  ux: passed
  architect: passed
  alignment: skipped
---
```

**Readiness signal:**
- `prepped_date` is set → Already reviewed by /prep-spec
- `prepped_date` is null/missing → Not prepped, show reminder

---

## Reminder Triggers by Agent

| Agent | Trigger Phrases | When to Check |
|-------|-----------------|---------------|
| **Architect** | "review spec", "check blindspots", "technical review", "architecture review" | Before starting review |
| **UX Designer** | "review spec", "check UX", "user flow review", "accessibility check" | Before starting review |
| **PM** | "validate spec", "ready to build?", "implementation ready?", "approve spec" | Before validation |
| **Quick Flow Solo Dev** | Starting `*quick-dev` menu item | Before executing workflow |
| **Solo Dev** | "implement this", "build this", "start development" | Before implementation |

---

## Reminder Template

When `prepped_date` is null or missing:

```
📋 **Spec Status Check**

This spec hasn't been prepped yet (`prepped_date` is not set).

`/prep-spec` does:
- UX Designer review (flows, edge cases, accessibility)
- Architect review (blindspots, code reuse, dependencies)
- Decision surfacing (/simplify)
- Execution recommendation (/loop vs ralph-loop)
- UAT generation (if ralph-loop)

**Options:**
1. Run `/prep-spec {spec_path}` first (recommended)
2. Proceed with just my {agent_type} review

Which would you like?
```

---

## When NOT to Remind

- `prepped_date` is set → Already done, proceed
- `status: in-progress` → Implementation started, too late for prep
- `status: done` → Complete, no action needed
- User explicitly says "skip prep" or "just review" → Honor the request
- Spec is a minor update (< 50 lines changed) → Use judgment

---

## Implementation Notes for Agent Files

Add this check to the agent's activation or menu handler:

```xml
<pre-action-check trigger="review|implement|validate">
  1. Read spec file at {spec_path}
  2. Parse frontmatter for 'prepped_date' field
  3. If prepped_date is null/missing AND status NOT IN ['in-progress', 'done']:
     - Show reminder template
     - Wait for user choice
  4. If prepped_date is set OR user says "proceed":
     - Continue with agent action
</pre-action-check>
```

---

## Related

- P99: /prep-spec skill (`features/p99_prep_spec_skill.md`, no longer in the tree)
- P100: /generate-ralph-loop skill (`features/p100_ralph_loop_skill.md`, no longer in the tree)
- P101: /generate-uat skill (`features/p101_generate_uat_skill.md`, no longer in the tree)
