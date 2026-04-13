---
name: shorten-url
description: "Look up short URLs using claritypledge.com internal shortener"
when_to_use: "When creating or looking up a short URL."
version: 1.0.0
---

## Dispatch

Spawn Agent tool: `model: "haiku"`, `subagent_type: "general-purpose"`.
Prompt: the skill instructions below + any $ARGUMENTS.
The subagent reads `src/app/data/short-links.ts` itself — no pre-reading needed.
Report subagent output verbatim.

# Shorten URL

Look up short URLs using claritypledge.com's internal shortener.

## Usage

```
/slava:shorten-url 3gaps
→ claritypledge.com/s/3gaps

/slava:shorten-url article
→ claritypledge.com/s/article

/slava:shorten-url unknown
→ Code "unknown" not found. Add to src/app/data/short-links.ts
```

## What This Is

This is a **lookup reference** for agents. When called with a code:
1. Check if code exists in `src/app/data/short-links.ts`
2. If yes, return: `claritypledge.com/s/{code}`
3. If no, suggest adding it

## No-argument behavior

When called with no argument, read `src/app/data/short-links.ts` and list all available codes in this format:
```
- `{code}` → claritypledge.com/s/{code}
```
One line per code. No extra explanation.

## Available Codes

| Code | Target | Full URL (25 chars) |
|------|--------|---------------------|
| `3gaps`, `role`, `info`, `vuln` | Three Asymmetries section | claritypledge.com/s/{code} |
| `article` | Full article | claritypledge.com/s/article |

Note: The four asymmetry codes all point to the same anchor because the three asymmetries are bold text within a paragraph, not separate headings.

## Technical Details

**URL format:** `claritypledge.com/s/{code}` (no protocol for display)

**Character counts:**
- `claritypledge.com/s/3gaps` = 25 chars
- `claritypledge.com/s/role` = 24 chars
- With https: `https://claritypledge.com/s/3gaps` = 33 chars

**Behavior:**
- Case-insensitive (`3GAPS` = `3gaps`)
- Trailing slashes ignored (`/s/3gaps/` works)
- Invalid codes redirect to home (`/`)
- Server-side 301 redirects (SEO-friendly via vercel.json)

## Adding New Short Links

Edit `src/app/data/short-links.ts`:

```typescript
export const shortLinks: Record<string, string> = {
  // Existing codes...
  "newcode": "/target/path#optional-hash",
};
```

Then add to `vercel.json` redirects array:

```json
{
  "source": "/s/newcode",
  "destination": "/target/path#optional-hash",
  "permanent": true
}
```

**Guidelines:**
- Codes should be 3-8 chars, lowercase, memorable
- Target URLs must be relative paths (start with `/`)
- Hash fragments work for deep linking

## Troubleshooting

**Short link redirects to home:**
- Code doesn't exist in `short-links.ts`
- Check spelling (case-insensitive but must match)

**Hash fragment doesn't scroll:**
- Target element must have matching `id` attribute
- Check the heading generates the expected anchor ID

## For Other Agents

When creating Points for social media:
- Use `claritypledge.com/s/3gaps` (25 chars) for three asymmetries
- These are permanent — we own the domain
- No third-party dependency (unlike TinyURL/Bitly)
