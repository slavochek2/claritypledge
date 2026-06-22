#!/usr/bin/env npx tsx
/**
 * Patches the description on all upcoming "I've Lost Co-Founders" webinar events in prod.
 * Run after editing DESCRIPTION in seed-webinars.ts to keep existing events in sync.
 *
 * Usage:
 *   npx tsx scripts/update-webinar-descriptions.ts            # dry run — shows affected slugs
 *   npx tsx scripts/update-webinar-descriptions.ts --confirm  # updates prod
 *
 * Reads PROD_SUPABASE_SERVICE_ROLE_KEY from .env.local.
 */

import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { createClient } from '@supabase/supabase-js';
import { WEBINAR_SERIES, LEGACY_TITLE_PREFIX } from '@/app/data/webinar-series';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, '..');

const envFile = resolve(repoRoot, '.env.local');
const env: Record<string, string> = {};
for (const line of readFileSync(envFile, 'utf8').split('\n')) {
  const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
  if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, '');
}

const SERVICE_ROLE_KEY = env['PROD_SUPABASE_SERVICE_ROLE_KEY'];
if (!SERVICE_ROLE_KEY) {
  console.error('ERROR: PROD_SUPABASE_SERVICE_ROLE_KEY not found in .env.local');
  process.exit(1);
}

const supabase = createClient('https://besjtuodziykmjidubzw.supabase.co', SERVICE_ROLE_KEY);

const DESCRIPTION = `About **65% of startups that fail, fail on co-founder conflict** [1]. But across 14 co-founders, I learned the hard way: most of those conflicts were never real disagreements. They were misunderstandings nobody checked, a silent assumption about equity, a "we agreed on this" that you didn't.

In this **free 60-minute live session** I'll show you the one habit that surfaces those gaps before they cost you months.

**Reserve two seats, yours and your co-founder's.**

---

**Why almost nobody checks.** You genuinely believe you were clear. Your co-founder genuinely believes they understood. You're both wrong, because nobody verified. Even people who communicate for a living miss it: 8 in 10 leaders think they're clear, half their people don't agree [2][3]. There's a specific social reflex that makes checking feel awkward, exactly when the stakes are highest, so we skip it. In the session I'll name that reflex, show the two cognitive biases that make the gap nearly certain, and give you the one move that flips it, in under a minute, without making it weird.

**What you'll learn**
- **My story.** How I raised €398k *without product-market fit*, and why verifying understanding was the factor that closed the round, the sale, and the product. It's the same skill behind the best operators and the strongest partnerships.
- **What multiple co-founder splits taught me.** I lost the early ones to misunderstandings I didn't yet know how to catch: a co-founder who silently assumed we'd revisit the equity split (9 months lost), a technical co-founder who disagreed that 5 prospect rejections were enough to know the product was failing (7 months lost). I'll show how each gap hid as "conflict," and the question that would have surfaced it in week one.
- **Partnerships that lasted.** Two co-founders, 3.5 and 3 years respectively — here's the mechanism that held them. The 3.5-year one disagreed with me constantly, carried real risk, and it held because every time he pushed back, I made sure we actually understood each other before deciding. Disagreement stopped being friction the moment it was verified.
- **The fix.** How to rule out misunderstanding before you treat something as a real disagreement, when values and interests actually clash.

**Why both of you.** This works best as a pair. You'll watch the exact move that surfaces a hidden gap, live, and leave able to run it with your co-founder yourselves using the free tool, in the session or after. Solo attendees get the theory; pairs get the mirror. Strong founders do this on purpose, it's not a sign anything's broken. Register, then forward your co-founder the confirmation.

**What to expect.** Every session is live, so no two run exactly the same. What's constant: you'll leave with the one habit that surfaces the gaps before they cost you, and at the end I'll share the Co-Founder Program with a founding discount for everyone who attends.

> "Real substance, not surface-level coaching. He opened up new perspectives around communication I hadn't fully seen before." — [Jan Barbarič](https://www.linkedin.com/in/janbarbari), Founder

**Agenda (60 min, live):** Presentation 20 · Live demo 10 · Q&A 30 (bring your own stories)

**Your host.** I'm Slava. I raised €398k without product-market fit, built B2B SaaS for six years, and closed it down. I studied why partnerships break, published a 60-page research paper on trust-building, and built ClarityPledge so founders can verify understanding before it costs them. I've lost co-founders. I help you keep yours.

**Free platform, optional program.** The ClarityPledge app is **free and open source** — that's the tool you'll practice with, and it's yours to keep. At the end of the session I'll spend a few minutes on the **paid Co-Founder Program** for pairs who want structure, facilitation, and a signed Clarity Partner Agreement, with a **founding discount for everyone who attends**. The session and the free tool stand on their own, whether or not the program is for you.

**Reserve two seats, yours and your co-founder's. Free.**

*Sources: [1] Wasserman, HBS (via Entrepreneur.com) · [2] Axios HQ · [3] Radical Candor, The Trust Gap · [4] Newton 1990, Stanford · [5] Camerer, Loewenstein & Weber 1989 · [6] Schegloff, Jefferson & Sacks 1977*`;

const isConfirm = process.argv.includes('--confirm');

// Fetch all upcoming events in the series
const now = new Date().toISOString();
const { data: events, error } = await supabase
  .from('events')
  .select('id, slug, datetime')
  .eq('host_id', WEBINAR_SERIES.HOST_ID)
  .eq('status', 'upcoming')
  // Match new + legacy prefix during the 2026-06-22 rename transition.
  .or(`title.ilike.${WEBINAR_SERIES.TITLE_PREFIX}%,title.ilike.${LEGACY_TITLE_PREFIX}%`)
  .gte('datetime', now)
  .order('datetime', { ascending: true });

if (error || !events) {
  console.error('ERROR fetching events:', error?.message ?? 'unknown');
  process.exit(1);
}

console.log(`\nFound ${events.length} upcoming series event(s) to update:\n`);
events.forEach(e => console.log(`  ${e.datetime.split('T')[0]}  ${e.slug}`));

if (!isConfirm) {
  console.log('\n[DRY RUN] Pass --confirm to update prod.\n');
  process.exit(0);
}

console.log('\nUpdating PROD...\n');
let success = 0;
let failed = 0;

for (const event of events) {
  const { error: updateError } = await supabase
    .from('events')
    .update({ description: DESCRIPTION })
    .eq('id', event.id);

  if (updateError) {
    console.error(`  FAIL ${event.slug}: ${updateError.message}`);
    failed++;
  } else {
    console.log(`  OK   ${event.slug}`);
    success++;
  }
}

console.log(`\nDone: ${success} updated, ${failed} failed.`);
if (failed > 0) process.exit(1);
