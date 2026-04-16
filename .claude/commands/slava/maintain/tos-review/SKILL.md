---
name: tos-review
description: Audit the ToS against all tech and features shipped since the last update, propose changes, review them, and apply with human approval.
when_to_use: "After shipping features that may affect Terms of Service compliance."
trigger: manual
version: 1.0.0
---

# /tos-review — ToS Sync Skill

Run this after batches of shipped features, especially when new APIs, data flows, or AI providers are introduced.

---

## When to Run

- After any feature tagged `ai`, `data`, or `legal` ships
- Before major product announcements or user growth pushes
- After switching or adding a third-party provider (AI model, email, payment, etc.)
- When `COPY.LEGAL_LAST_UPDATED` is more than 2 months old

---

## Inputs (read before starting)

1. `src/app/content/copy.ts` → `LEGAL_LAST_UPDATED` — determines review window
2. `src/app/content/tos.md` — current ToS text (markdown source of record)
3. `features/done/INDEX.md` — all shipped features; filter by date > last ToS update
4. `supabase/functions/` — edge functions (third-party API calls, data processing)
5. `.env.local`, `vite.config.ts`, and `src/` — third-party service inventory (VITE_ vars + frontend service calls)

---

## Pipeline

### Stage 1 — Tech Audit (run yourself)

First, grep for third-party service calls in edge functions — structural discovery before reading:

```bash
# Edge functions + frontend source — catches all third-party calls:
grep -rn "fetch\|MAILGUN\|GEMINI\|STRIPE\|OPENAI\|SENTRY\|MIXPANEL" \
  supabase/functions/ src/ \
  | grep -v "node_modules\|\.git\|\.snap\|test\|spec" | sort -u

# VITE_ env vars — third-party service signals baked at build time:
grep -r "VITE_\|import\.meta\.env\." src/ | grep -v "node_modules" | sort -u
```

Then inventory everything since `LEGAL_LAST_UPDATED`:

1. Features shipped (from INDEX.md, filter by date)
2. Third-party services in use: AI providers, email services, payment, analytics, CDN
3. Data collected: what user data hits which external service
4. New user flows: consent points, data visibility, public/private content

Produce a structured list: `[Service] → [What user data it receives] → [Feature that introduced it]`

### Stage 2 — ToS Audit (run yourself)

Read the full ToS. For each section, note:
- What it covers
- What it implicitly excludes
- Any language that's now technically inaccurate

### Stage 3 — Gap Analysis (run yourself)

Cross-reference Stage 1 vs Stage 2. Identify:
- **Missing coverage**: tech/data flows not mentioned in ToS
- **Stale language**: ToS mentions services/flows that no longer exist or changed
- **Consent gaps**: any processing that requires explicit consent but ToS doesn't require it

### Stage 4 — Propose Changes (spawn Agent A — Legal Drafter)

**Before spawning:** Read `src/app/content/tos.md` in full. In the prompt below, replace `[ToS file content]` with the full file text and `[Gap analysis]` with your Stage 3 structured list.

Spawn a general-purpose agent (`model: "sonnet"`) with this prompt:

```
You are a legal drafter specializing in SaaS and GDPR-compliant terms of service for European startups.

Company: TechSalesBox OÜ (Estonia), product: ClarityPledge — calibrated communication practice platform.
Users: co-founder pairs. Target market: Europe. Legal jurisdiction: Estonian law + GDPR.

Current ToS: [ToS file content]

Gap analysis: [Gap analysis]

Task: Propose specific, minimal ToS changes to close the identified gaps. For each change:
1. Section it belongs in (or new section name)
2. The proposed text (complete paragraph, ready to publish)
3. Legal rationale in 1-2 sentences
4. GDPR article or Estonian e-commerce law reference if applicable

Be minimal — don't rewrite sections that don't need it. Only close the gaps.
```

### Stage 5 — Review (spawn Agent B — Devil's Advocate + GDPR)

**Before spawning:** Use the same `[ToS file content]` read in Stage 4. Replace `[Stage 4 output]` with the full output from the Stage 4 agent.

Spawn a second general-purpose agent (`model: "sonnet"`) with this prompt:

```
You are a GDPR compliance advisor and devil's advocate reviewer for SaaS terms of service.
Your job is to find problems in proposed ToS changes — not to approve them.

Company: TechSalesBox OÜ (Estonia), product: ClarityPledge, users: co-founder pairs, jurisdiction: Estonian law + GDPR.

Original ToS: [ToS file content]
Proposed changes: [Stage 4 output]

Review each proposed change for:
1. GDPR compliance (data minimization, lawful basis, consent requirements, Art. 13/14 disclosures)
2. Legal holes — ambiguities, overreaches, missing definitions, unenforceable promises
3. User experience — anything a user could reasonably misinterpret
4. Estonian e-commerce law specifics (Võlaõigusseadus, infoühiskonna teenuse seadus)

**Output format — one entry per proposed change, verdict first:**

```
[APPROVE | BLOCK | MINOR] [Change ref]: [bottom line in plain English, 1 sentence]
  Issue: [specific problem, if any]
  Fix: [concrete fix, if any]
```

APPROVE = ship as-is. BLOCK = do not apply until fixed. MINOR = optional improvement, won't block.
No legalese. Write as if explaining to a non-lawyer founder in 30 seconds.
```

### Stage 6 — Human Approval Gate 🛑

Present to the user for each proposed change:
- Stage 5 verdict (APPROVE / BLOCK / MINOR) and one-sentence summary
- Diff: what ToS says now → what it would say after the change
- Ask: "Approve / Modify / Reject"

**Framing by change size:**
- Single sentence addition → show inline diff only
- New paragraph or section → show full before/after block
- Multiple changes → group by BLOCK first, then APPROVE, then MINOR

Do NOT apply anything without explicit approval per change.

### Stage 7 — Apply Changes

For each approved change:
- Edit `src/app/content/tos.md` (markdown source of record — no legal text lives in TSX)
- Update `COPY.LEGAL_LAST_UPDATED` in `src/app/content/copy.ts` to today's date

### Stage 7b — Version Bump (MANDATORY)

**This step is non-optional.** Without it, users won't be prompted to re-accept updated terms.

1. Bump `CURRENT_TERMS_VERSION` in `src/lib/constants.ts` (e.g., v1.1 → v1.2)
2. Update the test expectation in `src/tests/consent-api.test.ts` to match the new version
3. Verify: `npm test -- consent-api.test.ts` — must pass

### Stage 8 — Visual Review

Use Claude in Chrome to load `http://localhost:5173/terms-of-service` and screenshot the updated sections.

**Pass criteria:** All new paragraphs render without truncation, spacing matches surrounding sections, no raw HTML visible, date in page header matches today.

**Fallback (if Claude in Chrome unavailable):** Use any available browser automation tool — Chrome DevTools MCP, Playwright, or Claude in Chrome. If none is available, note "Visual review skipped — no browser tool available. Run manually before pushing."

Do not mark Stage 8 complete based on code reading alone.

---

## Output

After completion, commit with message:
```
legal: update ToS — [brief summary of changes]

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
```

Note: `/kdd` after this session to capture any process learnings.

---

## Related

- ToS content: `src/app/content/tos.md` (markdown source of record, migrated in P474)
- ToS renderer: `src/app/pages/terms-of-service-page.tsx` (layout + chrome only, no legal text)
- Last updated constant: `src/app/content/copy.ts` → `LEGAL_LAST_UPDATED`
- P436 (rejected): one-off predecessor to this skill
