---
name: story
description: Use when user wants to capture a working session as a story for newsletter, blog, or founder journey content. Triggered by "write a story about this conversation," "capture this as a story," "turn this into a blog post," or after significant insights emerge.
when_to_use: "When user wants to capture a session as a story. Triggered by write a story about this."
version: 1.0.0
---

# Story

Extract a compelling narrative from a working session and draft it as a shareable story.

## When to Use

- After a productive conversation with significant insights
- User explicitly asks to "capture this as a story"
- User wants newsletter/blog content from their founder journey
- Something surprising was discovered or a problem was solved

## Story Structure

Every good founder story follows this arc:

```
1. THE BLOCK     - Where you were stuck (creates tension)
2. THE QUESTION  - What you asked that changed things
3. THE INSIGHT   - What you discovered (the "aha")
4. THE SHIFT     - How this changes everything
5. THE TAKEAWAY  - What others can learn (optional)
```

## Process

### Step 0: Clarify Content Type

Before writing, ask the user what format they need:

| Type | Length | Use Case |
|------|--------|----------|
| **Quick thought** | 2-4 sentences | Tweet, LinkedIn snippet, internal note |
| **Short post** | 200-300 words | LinkedIn post, quick newsletter item |
| **Medium article** | 500-800 words | Newsletter feature, event discussion material |
| **Long post** | 1000-2000 words | Blog/SEO, deep dive |

If user provided arguments specifying format, use that. Otherwise ask:
> "What format do you need? Quick thought (few sentences), short post (LinkedIn-length), medium article (newsletter), or long post (blog)?"

### Step 1: Identify the Arc

From the conversation, extract:

| Element | Question to Ask |
|---------|-----------------|
| **Block** | What was the user stuck on? What wasn't working? |
| **Question** | What question or action unlocked progress? |
| **Insight** | What did they learn that they didn't know before? |
| **Shift** | How does this change their approach, product, or thinking? |

### Step 2: Find the Hook

The hook is a one-sentence version of the insight that makes readers want more.

Good hooks:
- Counterintuitive: "Everyone believes X. No one measures it."
- Specific: "I found a meta-analysis of 400,000 observations."
- Personal: "I was paralyzed by uncertainty."

### Step 3: Draft the Story

**Frontmatter:**
```markdown
# [Title - Usually the insight or question]

**Draft for:** [Newsletter / blog / founder journey]
**Date:** YYYY-MM-DD
**Status:** Draft
```

**Length:** Based on content type from Step 0 (default to medium if unspecified)

**Voice:** First person, honest, vulnerable but not self-pitying

**Sections:**
- Use `---` horizontal rules between major sections
- Use `>` blockquotes for key insights
- Use tables for data/findings

### Step 4: Add Proof Points

If research or data was involved, include:
- Key numbers with sources
- Simple table of findings
- Links to references (if public)

## Writing Principles

**From copywriting:**
- Clarity over cleverness
- Specific over vague ("r=.39" not "significant correlation")
- Active voice ("I realized" not "It was realized")
- Show the struggle, don't just summarize it

**From content-strategy:**
- Lead with novel insight or counterintuitive take
- Share vulnerable, honest experiences
- Behind-the-scenes transparency builds trust

**Avoid:**
- Jargon readers won't know
- Burying the insight in qualifications
- Generic lessons ("work hard, stay focused")
- Exclamation points

## Output Location

Save to: `content/stories/YYYY-MM-DD-{slug}.md`

## Example

See: `content/stories/` for existing stories

This story captures a session where:
- **Block:** Couldn't figure out how to make money
- **Question:** "Does calibration actually matter?"
- **Insight:** No one measures actual understanding
- **Shift:** Clear market gap, validation of thesis, growth model

## Quick Reference

| Story Element | Find It In... |
|---------------|---------------|
| Block | User's initial frustration or question |
| Question | The turning point in conversation |
| Insight | New information or realization |
| Shift | Changed plans, new understanding |
| Proof | Data, research, numbers mentioned |

## When NOT to Use

- Routine tasks with no insight
- Technical implementation with no learning
- User explicitly doesn't want story content
