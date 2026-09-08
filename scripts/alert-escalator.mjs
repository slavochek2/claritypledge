#!/usr/bin/env node
/**
 * P1155 — the unattended consumer.
 *
 * Seven workflows detect prod problems and open GitHub issues. Until this script
 * existed, every reader of those issues was human-initiated (/day, /ship, /weekly),
 * so a correct alarm could sit unread for days. This runs on a schedule and needs
 * nobody to type anything.
 *
 * Exit codes (convention from scripts/check-stranded-signups.sh):
 *   0  nothing due            — silent, the normal outcome
 *   1  something due          — email sent (or printed, under --dry-run)
 *   2  the reader could not run — malformed registry, unknown kind, failed gh call,
 *                                 failed send, or ANY unhandled error
 *
 * 2 must never be conflated with 0. A broken reader that exits 0 reads as a healthy
 * system, which is the exact defect this script exists to fix. Node exits 1 by
 * default on an uncaught exception — which collides with "email sent" — so main()
 * is wrapped and forces 2.
 *
 * What it deliberately does NOT do:
 *   - never fixes anything (no prod deploy, no migration, no credentials for either)
 *   - never puts issue BODY or COMMENT text in the email. Issue content is mutable
 *     by more accounts than authored it, so the email carries number/title/age/URL
 *     only and the consuming agent reads the rest with `gh issue view`, where that
 *     content has no privilege.
 */
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

/** The Actions bot as `gh issue list --json author` spells it. NOT the REST spelling
 *  ("github-actions[bot]") — verifying through one API while the code reads the other
 *  yields a filter that matches nothing and fails silently closed. */
export const BOT_LOGIN = 'app/github-actions';
const LABEL_PREFIX = 'p1155-escalated-';
const ISSUE_PAGE_LIMIT = 100; // the gh default is 30, newest-first — which drops the
                              // oldest open issues, precisely where an ageing alarm lives.

export const EXIT_CLEAN = 0;
export const EXIT_DUE = 1;
export const EXIT_BROKEN = 2;

export class ReaderError extends Error {}

export const labelFor = (days) => `${LABEL_PREFIX}${days}d`;

// ---------------------------------------------------------------------------
// Pure evaluation. No I/O, no gh, no clock — `now` is injected so fixtures can
// place an issue at any age without touching the system clock.
// ---------------------------------------------------------------------------

export function ageInDays(createdAtIso, now) {
  const created = Date.parse(createdAtIso);
  if (Number.isNaN(created)) throw new ReaderError(`unparseable createdAt: ${createdAtIso}`);
  return (now - created) / 86_400_000;
}

/**
 * @returns {Array<{checkId,number,title,url,ageDays,threshold,label}>} due escalations
 */
export function evaluateGithubIssueAge(check, issues, now) {
  if (!Array.isArray(check.escalate_at_days) || check.escalate_at_days.length === 0) {
    throw new ReaderError(`check "${check.id}": escalate_at_days must be a non-empty array`);
  }
  if (typeof check.match_title !== 'string' || !check.match_title) {
    throw new ReaderError(`check "${check.id}": match_title must be a non-empty string`);
  }
  const due = [];
  for (const issue of issues) {
    // Exact title, never a token match. And author-bound: an issue this producer did
    // not create is not this producer's alarm, whatever its title says.
    if (issue.title !== check.match_title) continue;
    if (!issue.author || issue.author.is_bot !== true || issue.author.login !== BOT_LOGIN) continue;

    const ageDays = ageInDays(issue.createdAt, now);
    const held = new Set((issue.labels ?? []).map((l) => (typeof l === 'string' ? l : l.name)));

    // Highest threshold crossed that has not already fired. Each threshold fires once;
    // the list as a whole is a cadence, so a long-lived alarm escalates again later
    // instead of being suppressed forever by a single boolean.
    const crossed = [...check.escalate_at_days]
      .filter((d) => Number.isFinite(d))
      .sort((a, b) => a - b)
      .filter((d) => ageDays >= d && !held.has(labelFor(d)));

    if (crossed.length === 0) continue;
    const threshold = crossed[crossed.length - 1];
    due.push({
      checkId: check.id,
      number: issue.number,
      title: issue.title,
      url: issue.url,
      ageDays: Math.floor(ageDays),
      threshold,
      // Every crossed-but-unfired threshold is marked, so a check that was dormant
      // while an issue aged past several thresholds does not then fire once per run.
      labels: crossed.map(labelFor),
    });
  }
  return due;
}

/**
 * @param runsByFile {Record<string, {runs: Array<{createdAt:string}>}>}
 * @returns {Array<{checkId,workflow,ageHours,maxAgeHours,neverRan}>}
 */
export function evaluateWorkflowLastRun(check, runsByFile, now, addedAtByFile = {}) {
  if (!Array.isArray(check.workflows) || check.workflows.length === 0) {
    throw new ReaderError(`check "${check.id}": workflows must be a non-empty array`);
  }
  const due = [];
  for (const entry of check.workflows) {
    if (!entry.file || !Number.isFinite(entry.max_age_hours)) {
      throw new ReaderError(`check "${check.id}": each workflow needs file + max_age_hours`);
    }
    const record = runsByFile[entry.file];
    if (!record) {
      // The fetch layer records every workflow it queried. A missing key means the
      // fetch never happened — a reader bug, not a quiet producer. Never treat as clean.
      throw new ReaderError(`check "${check.id}": no run data fetched for ${entry.file}`);
    }
    const runs = record.runs ?? [];
    if (runs.length === 0) {
      // A workflow added minutes ago has legitimately never run — its first scheduled
      // time has not arrived. Firing on that is a false alarm, and false alarms are how
      // an alert channel gets ignored, which is the defect this spec exists to fix.
      // So "never ran" only counts once the file has existed longer than its own
      // tolerance. Measured, not theorised: stranded-signups.yml tripped this on the
      // first live dry run, 33 minutes before its first cron.
      const addedAt = addedAtByFile[entry.file];
      if (addedAt) {
        const fileAgeHours = (now - Date.parse(addedAt)) / 3_600_000;
        if (Number.isNaN(fileAgeHours)) {
          throw new ReaderError(`unparseable added-at for ${entry.file}: ${addedAt}`);
        }
        if (fileAgeHours <= entry.max_age_hours) continue;   // still inside its grace window
      }
      due.push({ checkId: check.id, workflow: entry.file, neverRan: true,
                 ageHours: null, maxAgeHours: entry.max_age_hours });
      continue;
    }
    const ageHours = (now - Date.parse(runs[0].createdAt)) / 3_600_000;
    if (Number.isNaN(ageHours)) throw new ReaderError(`unparseable run createdAt for ${entry.file}`);
    if (ageHours > entry.max_age_hours) {
      due.push({ checkId: check.id, workflow: entry.file, neverRan: false,
                 ageHours: Math.floor(ageHours), maxAgeHours: entry.max_age_hours });
    }
  }
  return due;
}

export const KINDS = {
  'github-issue-age': evaluateGithubIssueAge,
  'workflow-last-run': evaluateWorkflowLastRun,
};

export function validateRegistry(registry) {
  if (!registry || !Array.isArray(registry.checks)) {
    throw new ReaderError('registry: top-level "checks" array is required');
  }
  const seen = new Set();
  for (const check of registry.checks) {
    if (!check.id) throw new ReaderError('registry: every check needs an id');
    if (seen.has(check.id)) throw new ReaderError(`registry: duplicate check id "${check.id}"`);
    seen.add(check.id);
    // An unknown kind must be LOUD. Skipping it silently would make a typo read as
    // "nothing due" forever — the failure mode this whole script exists to remove.
    if (!Object.hasOwn(KINDS, check.kind)) {
      throw new ReaderError(
        `registry: check "${check.id}" has unknown kind "${check.kind}" ` +
        `(known: ${Object.keys(KINDS).join(', ')})`);
    }
  }
  return registry;
}

// ---------------------------------------------------------------------------
// Message composition — pure, and deliberately content-free.
// ---------------------------------------------------------------------------

export function composeMessage(issueDue, workflowDue) {
  const lines = [];
  if (issueDue.length) {
    lines.push('Open alerts past their escalation threshold:', '');
    for (const d of issueDue) {
      lines.push(`  #${d.number}  ${d.title}`);
      lines.push(`      open ${d.ageDays}d (threshold ${d.threshold}d) · check "${d.checkId}"`);
      if (d.url) lines.push(`      ${d.url}`);
      lines.push('');
    }
  }
  if (workflowDue.length) {
    lines.push('Producers that have stopped running:', '');
    for (const d of workflowDue) {
      lines.push(d.neverRan
        ? `  ${d.workflow} — no runs found at all`
        : `  ${d.workflow} — last run ${d.ageHours}h ago (tolerance ${d.maxAgeHours}h)`);
    }
    lines.push('');
  }
  lines.push(
    'This message carries no issue body by design — issue content is editable by more',
    'accounts than authored it. Read the detail with:  gh issue view <number>',
    '',
    'Escalated by .github/workflows/alert-escalator.yml (P1155).');
  const subject = `[cp-ops] ${issueDue.length} alert(s), ${workflowDue.length} stalled producer(s)`;
  return { subject: sanitizeHeader(subject), body: lines.join('\n') };
}

/** CR/LF in a header field lets a crafted value smuggle extra headers. Titles reach
 *  the subject line, and an issue title is not fully trusted (see A1). Body text is
 *  NOT sanitized here — it goes below the header block, and the send layer dot-stuffs it. */
export function sanitizeHeader(value) {
  return String(value).replace(/[\r\n]+/g, ' ').trim();
}

// ---------------------------------------------------------------------------
// Fetch layer — the only part that touches the network. Kept thin so the pure
// functions above are testable without gh, auth, or a repo.
// ---------------------------------------------------------------------------

function gh(args) {
  try {
    return execFileSync('gh', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  } catch (err) {
    // A failed gh call must never surface as an empty result: "auth expired" and
    // "no open issues" would then be indistinguishable, and the quiet one is wrong.
    throw new ReaderError(`gh ${args.join(' ')} failed: ${err.stderr?.toString().trim() || err.message}`);
  }
}

function ghJson(args) {
  const raw = gh(args);
  try { return JSON.parse(raw); }
  catch { throw new ReaderError(`gh ${args.join(' ')} returned unparseable JSON`); }
}

export function fetchOpenIssues() {
  return ghJson(['issue', 'list', '--state', 'open', '--limit', String(ISSUE_PAGE_LIMIT),
                 '--json', 'number,title,createdAt,labels,author,url']);
}

export function fetchWorkflowRuns(files) {
  const out = {};
  for (const file of files) {
    out[file] = { runs: ghJson(['run', 'list', '--workflow', file, '--limit', '1',
                                '--json', 'createdAt,conclusion,status']) };
  }
  return out;
}

/** When each workflow file first appeared, so a brand-new workflow inside its own
 *  grace window is not reported as a stalled producer. Requires full history —
 *  the workflow checks out with fetch-depth: 0 for this reason. A missing answer
 *  yields no key, and the evaluator then treats the file as old (fail loud, not quiet). */
export function fetchWorkflowAddedAt(files) {
  const out = {};
  for (const file of files) {
    try {
      const iso = execFileSync('git',
        ['log', '--diff-filter=A', '--format=%aI', '-1', '--', `.github/workflows/${file}`],
        { encoding: 'utf8' }).trim();
      if (iso) out[file] = iso;
    } catch { /* no history available: leave unset, evaluator treats it as old */ }
  }
  return out;
}

// ---------------------------------------------------------------------------

function parseArgs(argv) {
  return {
    dryRun: argv.includes('--dry-run'),
    registryPath: (() => {
      const i = argv.indexOf('--registry');
      if (i !== -1 && argv[i + 1]) return argv[i + 1];
      const here = path.dirname(fileURLToPath(import.meta.url));
      return path.join(here, '..', '.github', 'alert-registry.json');
    })(),
  };
}

async function main(argv) {
  const { dryRun, registryPath } = parseArgs(argv);

  let registry;
  try { registry = JSON.parse(readFileSync(registryPath, 'utf8')); }
  catch (err) { throw new ReaderError(`cannot read registry at ${registryPath}: ${err.message}`); }
  validateRegistry(registry);

  const now = Date.now();
  const issueChecks = registry.checks.filter((c) => c.kind === 'github-issue-age');
  const runChecks = registry.checks.filter((c) => c.kind === 'workflow-last-run');

  const issueDue = [];
  if (issueChecks.length) {
    const issues = fetchOpenIssues();
    for (const check of issueChecks) issueDue.push(...evaluateGithubIssueAge(check, issues, now));
  }

  const workflowDue = [];
  for (const check of runChecks) {
    const files = check.workflows.map((w) => w.file);
    const runs = fetchWorkflowRuns(files);
    const addedAt = fetchWorkflowAddedAt(files);
    workflowDue.push(...evaluateWorkflowLastRun(check, runs, now, addedAt));
  }

  if (issueDue.length === 0 && workflowDue.length === 0) {
    if (dryRun) console.log('nothing due');
    return EXIT_CLEAN;
  }

  // ONE message per run, never one per due check. Seven producers can stall together
  // (a single Actions outage does it), and N sends from one job is the duplicate-flood
  // failure this design exists to avoid, arriving by a different route.
  const { subject, body } = composeMessage(issueDue, workflowDue);

  if (dryRun) {
    console.log(`--- DRY RUN (no send, no label) ---\nSubject: ${subject}\n\n${body}`);
    return EXIT_DUE;
  }

  const { sendOpsEmail } = await import('./send-ops-email.mjs');
  await sendOpsEmail({ subject, body });   // throws -> exit 2, loudly

  // Label AFTER a successful send, never before. Label-first loses the email silently
  // on a send failure; send-first can duplicate, which is the tolerable failure. A
  // label failure is still loud (throws) so a persistent permission problem surfaces
  // as a repeated red run rather than a silent daily duplicate.
  for (const d of issueDue) {
    for (const label of d.labels) {
      gh(['label', 'create', label, '--color', 'B60205',
          '--description', 'P1155: escalation threshold reached', '--force']);
      gh(['issue', 'edit', String(d.number), '--add-label', label]);
    }
  }
  return EXIT_DUE;
}

const isEntry = process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);
if (isEntry) {
  main(process.argv.slice(2))
    .then((code) => process.exit(code))
    .catch((err) => {
      // Force 2. Node's default uncaught-exception exit is 1, which this script uses
      // for "email sent" — a crash would otherwise look like a successful escalation.
      console.error(`alert-escalator: ${err.message}`);
      process.exit(EXIT_BROKEN);
    });
}
