---
description: 'Sync Notion kanban with Git source of truth. Clean up stale items, identify gaps, ask user decisions.'
---

# /notion-groom

An intelligent agent that syncs your Notion kanban with Git, finds blindspots, researches items, and guides you through decisions.

**Announce at start:** "I'm grooming your Notion kanban — syncing with Git, finding gaps, and helping you make decisions."

## Usage

```
/notion-groom [item-name]
```

**Examples:**
- `/notion-groom` — Full groom of everything
- `/notion-groom "AI understanding"` — Focus on a specific item

That's it. No flags to remember. I figure out what needs attention and ask you.

---

## How I Work

### Phase 1: Gather Everything

I read all the sources silently:

| Source | What I Learn |
|--------|--------------|
| Notion `[C] Kanban` | Your items, statuses, priorities, user requests |
| `features/*.md` | Active specs |
| `features/done/*.md` | Completed specs |
| `docs/roadmap.md` | What phases exist, what's current focus |
| `docs/hypotheses.md` | H0-H5 and their validation status |
| `docs/theory-of-change.md` | Key mechanisms that need implementation |

### Phase 2: Find Issues (Prioritized)

I identify everything that needs attention and sort by importance:

**🔴 Critical** (blocking or broken):
- Status mismatches (Notion says "Done" but no done spec)
- Missing dependencies (current work needs something not tracked)
- Stale "Today" items (been there 7+ days)

**🟡 Strategic** (gaps in your plan):
- Roadmap phases with no items
- Hypotheses with no validation path
- User requests sitting unaddressed

**🟢 Cleanup** (nice to fix):
- Vague titles that need clarification
- Orphan items (no Git spec, unclear purpose)
- Git specs not reflected in Notion

### Phase 3: Walk You Through It

I present issues one at a time, starting with most important:

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
[1/12] 🔴 Status Mismatch

"[US] Events on prod" is marked "All Done" in Notion
but I found it in features/done/p61_events_production.md

Should I link them?
  → Yes, link to p61 spec
  → No, they're different things
  → Tell me more about this item
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

### Phase 4: Research When Needed

For vague items, I proactively research before asking:

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
[5/12] 🟢 Needs Clarification

"[US] AI umderstamding" — I researched this:

🔍 What I found:
   • Relates to Phase 3 (Sifter) in roadmap
   • Would validate H1 (AI detects Story vs Point)
   • Prototype exists: src/app/prototypes/sift/
   • Similar to done spec: p58_sifter_mvp.md

💡 I think this means:
   "Improve AI's ability to understand and categorize user input"

Is that right?
  → Yes, that's it — update the title and link it
  → No, let me explain what I meant
  → Skip for now
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

### Phase 5: Surface Blindspots

After sync issues, I show strategic gaps:

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
[10/12] 🟡 Blindspot: Hypothesis Gap

H0b (social FOMO drives participation) has no validation plan.

Your roadmap says to test this at the "First Event" (Phase 4),
but there's no item tracking how you'll measure it.

Should I create one?
  → Yes, create "[US] H0b validation — measure FOMO effect"
  → No, it's covered elsewhere (tell me where)
  → Add to P85 success criteria instead
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

### Phase 6: Summary & Next Steps

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Groom Complete!

✅ Fixed:
   • Linked 3 items to Git specs
   • Updated 2 vague titles
   • Created 1 new spec draft

📋 Deferred (you said "skip"):
   • "[US] merging hackaton" — revisit later

🎯 Suggested next actions:
   1. Flesh out p105_content_strategy.md (just a stub)
   2. Run /notion-publish to update public roadmap
   3. Consider: 2 user requests still unaddressed

Your Notion is now synced with Git!
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

---

## What I Can Do

| Action | When I Propose It | Reversible? |
|--------|-------------------|-------------|
| **Link Notion ↔ Git** | Item matches a spec | Yes — remove link |
| **Update title** | Title is vague/typo'd | Yes — Notion history |
| **Add description** | Item has no context | Yes — Notion history |
| **Create spec draft** | Item is ready for dev | Yes — delete file |
| **Mark rejected** | Item is stale/obsolete | Yes — change status |
| **Create new item** | Blindspot found | Yes — delete item |
| **Set priority** | Based on roadmap alignment | Yes — change it |

**I never delete anything.** All changes are additive or reversible.

---

## What I Ask You

I keep questions simple with clear options:

| Situation | Question Style |
|-----------|----------------|
| Clear match | "Link these? [Yes / No]" |
| Needs clarification | "What did you mean by X? [My guess / Let me explain]" |
| Strategic decision | "This is a gap. Create item? [Yes / No / It's covered elsewhere]" |
| Uncertain | "I'm not sure about this one. [Skip / Tell me more]" |

You can always say "skip" — I'll note it and move on.

---

## Notion Database Reference

**Database ID:** `2ca4e141-6e62-8080-bdef-d8fd0f973686`

| Property | How I Use It |
|----------|--------------|
| Name | Match to specs, improve if vague |
| Status | Detect mismatches, staleness |
| Type | User Story, Bug, Epic, etc. |
| Prio | Suggest based on roadmap |
| Feature Github URL | Link to Git specs |
| Tags | Categorize by area |
| Requested by users | Surface unaddressed requests |
| Created/Edited time | Detect staleness |

---

## Strategic Docs I Correlate With

| Doc | What I Look For |
|-----|-----------------|
| `docs/roadmap.md` | Current phase, upcoming phases, dependencies |
| `docs/hypotheses.md` | H0-H5, which need validation |
| `docs/theory-of-change.md` | Key mechanisms (√N, cascade, etc.) |
| `docs/decisions.md` | Prior decisions on similar topics |
| `docs/lean-canvas.md` | Problem/solution alignment |

---

## Example Session

```
> /notion-groom

Reading Notion kanban... 30 items
Reading Git features... 9 active, 41 done
Reading roadmap, hypotheses, theory-of-change...

Found 12 things to review. Starting with most important:

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
[1/12] 🔴 Stale "Today" Item

"[US] review" has been in "Today" for 9 days.
No description, no spec link.

What is this?
  → It's done — mark complete
  → Still working on it — keep in Today
  → Not relevant anymore — reject
  → Let me explain what this is
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

> It's done

Got it! Marking as Done.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
[2/12] 🟡 Orphan Git Spec

p97_tdd_prototype_migration.md exists in Git
but has no Notion item tracking it.

Should I add it to your kanban?
  → Yes, add to Notion as "In Progress"
  → No, it's tracked differently
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

[...continues until done...]
```

---

## Related Skills

- `/notion-publish` — After grooming, publish to public Notion
- `/prep-spec` — Deep-dive spec creation for promoted items
- `/kdd` — Record decisions after finishing work
