#!/usr/bin/env node
/**
 * P1155 fixture suite — epistemic gates 7 and 7c.
 *
 * 7c is the reason half of these cases exist: a suite containing only inputs the gate
 * SHOULD reject cannot tell a working filter from one that rejects everything, and
 * "rejects everything" is silent — it looks exactly like a healthy, quiet system,
 * which is the defect this whole spec exists to remove. So every reject case here has
 * an accept case beside it.
 *
 * Known boundary (gate 7b): these fixtures feed canned objects to the pure functions.
 * Everything past the fetch layer — real gh pagination, real SMTP, real label writes —
 * is NOT exercised here and is not claimed to be.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  evaluateGithubIssueAge, evaluateWorkflowLastRun, validateRegistry,
  composeMessage, sanitizeHeader, labelFor, BOT_LOGIN, ReaderError,
} from './alert-escalator.mjs';
import { dotStuff, foldLongLines, buildMessage, assertHeaderSafe, SendError } from './send-ops-email.mjs';

const NOW = Date.parse('2026-09-08T12:00:00Z');
const daysAgo = (d) => new Date(NOW - d * 86_400_000).toISOString();
const hoursAgo = (h) => new Date(NOW - h * 3_600_000).toISOString();

let pass = 0, fail = 0;
const t = (name, fn) => {
  try { fn(); console.log(`PASS  ${name}`); pass++; }
  catch (e) { console.log(`FAIL  ${name}\n        ${e.message}`); fail++; }
};

const CHECK = { id: 'deploy-drift', kind: 'github-issue-age',
                match_title: 'Deploy drift detected on prod', escalate_at_days: [2, 7, 30] };
const botIssue = (over) => ({ number: 11, title: CHECK.match_title, createdAt: daysAgo(3),
  labels: [], url: 'https://example.invalid/11',
  author: { login: BOT_LOGIN, is_bot: true }, ...over });

// --- github-issue-age: ACCEPT cases first --------------------------------------
t('ACCEPT: bot issue past threshold fires', () => {
  const due = evaluateGithubIssueAge(CHECK, [botIssue()], NOW);
  assert.equal(due.length, 1);
  assert.equal(due[0].number, 11);
  assert.equal(due[0].threshold, 2);
  assert.deepEqual(due[0].labels, [labelFor(2)]);
});

t('ACCEPT: a decoy listed first does not shadow the real bot issue', () => {
  const decoy = botIssue({ number: 99, author: { login: 'outsider', is_bot: false } });
  const due = evaluateGithubIssueAge(CHECK, [decoy, botIssue()], NOW);
  assert.equal(due.length, 1);
  assert.equal(due[0].number, 11);
});

// --- github-issue-age: REJECT cases --------------------------------------------
t('REJECT: under threshold does not fire (no false alarm)', () => {
  assert.equal(evaluateGithubIssueAge(CHECK, [botIssue({ createdAt: daysAgo(1) })], NOW).length, 0);
});

t('REJECT: already-labelled issue does not refire', () => {
  const issue = botIssue({ labels: [{ name: labelFor(2) }] });
  assert.equal(evaluateGithubIssueAge(CHECK, [issue], NOW).length, 0);
});

t('REJECT: non-bot author with the exact title is ignored', () => {
  const forged = botIssue({ author: { login: 'outsider', is_bot: false } });
  assert.equal(evaluateGithubIssueAge(CHECK, [forged], NOW).length, 0);
});

t('REJECT: REST-shaped author spelling does not match the CLI shape', () => {
  const wrongShape = botIssue({ author: { login: 'github-actions[bot]', is_bot: true } });
  assert.equal(evaluateGithubIssueAge(CHECK, [wrongShape], NOW).length, 0);
});

t('REJECT: is_bot true but a different app does not match', () => {
  const otherApp = botIssue({ author: { login: 'app/dependabot', is_bot: true } });
  assert.equal(evaluateGithubIssueAge(CHECK, [otherApp], NOW).length, 0);
});

t('REJECT: token-overlapping title is ignored (exact match, not search)', () => {
  const near = botIssue({ title: CHECK.match_title + ' — please help' });
  assert.equal(evaluateGithubIssueAge(CHECK, [near], NOW).length, 0);
});

t('REJECT: missing author field is ignored, not treated as bot', () => {
  const noAuthor = botIssue({ author: undefined });
  assert.equal(evaluateGithubIssueAge(CHECK, [noAuthor], NOW).length, 0);
});

// --- A5: cadence, not a permanent one-shot -------------------------------------
t('CADENCE: an issue already escalated at 2d escalates again at 7d', () => {
  const issue = botIssue({ createdAt: daysAgo(8), labels: [{ name: labelFor(2) }] });
  const due = evaluateGithubIssueAge(CHECK, [issue], NOW);
  assert.equal(due.length, 1);
  assert.equal(due[0].threshold, 7);
});

t('CADENCE: all thresholds fired means silence, not a repeat', () => {
  const issue = botIssue({ createdAt: daysAgo(40),
    labels: [2, 7, 30].map((d) => ({ name: labelFor(d) })) });
  assert.equal(evaluateGithubIssueAge(CHECK, [issue], NOW).length, 0);
});

t('CADENCE: an issue aged past several unfired thresholds fires once, marking all', () => {
  const due = evaluateGithubIssueAge(CHECK, [botIssue({ createdAt: daysAgo(40) })], NOW);
  assert.equal(due.length, 1);
  assert.equal(due[0].threshold, 30);
  assert.deepEqual(due[0].labels, [labelFor(2), labelFor(7), labelFor(30)]);
});

// --- workflow-last-run ---------------------------------------------------------
const WCHECK = { id: 'producer-freshness', kind: 'workflow-last-run',
                 workflows: [{ file: 'check-deploy-drift.yml', max_age_hours: 25 }] };

t('ACCEPT: a fresh producer does not fire', () => {
  const runs = { 'check-deploy-drift.yml': { runs: [{ createdAt: hoursAgo(4) }] } };
  assert.equal(evaluateWorkflowLastRun(WCHECK, runs, NOW).length, 0);
});

t('REJECT: a stalled producer fires', () => {
  const runs = { 'check-deploy-drift.yml': { runs: [{ createdAt: hoursAgo(40) }] } };
  const due = evaluateWorkflowLastRun(WCHECK, runs, NOW);
  assert.equal(due.length, 1);
  assert.equal(due[0].ageHours, 40);
});

t('REJECT: a producer with no runs at all fires (never silently clean)', () => {
  const due = evaluateWorkflowLastRun(WCHECK, { 'check-deploy-drift.yml': { runs: [] } }, NOW);
  assert.equal(due.length, 1);
  assert.equal(due[0].neverRan, true);
});

t('NO FALSE ALARM: a workflow added inside its grace window does not fire', () => {
  const runs = { 'check-deploy-drift.yml': { runs: [] } };
  const added = { 'check-deploy-drift.yml': hoursAgo(3) };   // 3h old, tolerance 25h
  assert.equal(evaluateWorkflowLastRun(WCHECK, runs, NOW, added).length, 0);
});

t('ACCEPT: a never-run workflow OLDER than its window does fire', () => {
  const runs = { 'check-deploy-drift.yml': { runs: [] } };
  const added = { 'check-deploy-drift.yml': hoursAgo(200) };
  const due = evaluateWorkflowLastRun(WCHECK, runs, NOW, added);
  assert.equal(due.length, 1);
  assert.equal(due[0].neverRan, true);
});

t('ACCEPT: unknown add-date is treated as old (fails loud, not quiet)', () => {
  const runs = { 'check-deploy-drift.yml': { runs: [] } };
  assert.equal(evaluateWorkflowLastRun(WCHECK, runs, NOW, {}).length, 1);
});

t('LOUD: missing fetch data throws rather than reading as clean', () => {
  assert.throws(() => evaluateWorkflowLastRun(WCHECK, {}, NOW), ReaderError);
});

// --- A6/A7: registry validation must be loud -----------------------------------
t('LOUD: unknown kind throws (never a silent skip)', () => {
  assert.throws(() => validateRegistry({ checks: [{ id: 'x', kind: 'typo-kind' }] }), ReaderError);
});

t('LOUD: duplicate check id throws', () => {
  assert.throws(() => validateRegistry({ checks: [
    { id: 'a', kind: 'github-issue-age' }, { id: 'a', kind: 'github-issue-age' }] }), ReaderError);
});

t('LOUD: missing escalate_at_days throws', () => {
  assert.throws(() => evaluateGithubIssueAge(
    { id: 'x', match_title: 'T' }, [], NOW), ReaderError);
});

t('ACCEPT: the real shipped registry validates', () => {
  const reg = JSON.parse(readFileSync('.github/alert-registry.json', 'utf8'));
  validateRegistry(reg);
  assert.equal(reg.checks.filter((c) => c.kind === 'github-issue-age').length, 8);
});

// --- A1: the message must not carry issue content ------------------------------
t('CONTENT: the composed message carries no issue body', () => {
  const { subject, body } = composeMessage(
    [{ checkId: 'deploy-drift', number: 11, title: 'Deploy drift detected on prod',
       url: 'https://example.invalid/11', ageDays: 3, threshold: 2, labels: [] }], []);
  assert.match(subject, /1 alert/);
  assert.match(body, /#11/);
  assert.match(body, /gh issue view/);
  assert.ok(!/MIGRATION_MISSING|FUNCTION_STALE/.test(body), 'body content leaked into the email');
});

t('CONTENT: a CRLF-bearing title cannot reach the subject line', () => {
  const dirty = sanitizeHeader('Drift\r\nBcc: attacker@example.invalid');
  assert.ok(!/[\r\n]/.test(dirty));
});

// --- SMTP content rules --------------------------------------------------------
t('SMTP: a lone "." body line is dot-stuffed', () => {
  assert.equal(dotStuff('a\n.\nb'), 'a\n..\nb');
});

t('SMTP: a leading-dot line is stuffed, an inner dot is untouched', () => {
  assert.equal(dotStuff('.hidden\nno.dot'), '..hidden\nno.dot');
});

t('SMTP: an over-long line is folded under the octet limit', () => {
  const folded = foldLongLines('x'.repeat(2500)).split('\n');
  assert.ok(folded.length > 1);
  assert.ok(folded.every((l) => Buffer.from(l, 'utf8').length <= 998));
});

t('SMTP: folding does not split a UTF-8 sequence', () => {
  const folded = foldLongLines('é'.repeat(900), 100);
  assert.ok(folded.split('\n').every((l) => !l.includes('�')));
});

t('SMTP: a CRLF header value is refused, not sanitized silently', () => {
  assert.throws(() => assertHeaderSafe('Subject', 'a\r\nBcc: x'), SendError);
});

t('SMTP: built message uses CRLF and declares utf-8', () => {
  const msg = buildMessage({ from: 'ops@example.invalid', to: 'ops@example.invalid',
                             subject: 'hi', body: 'line1\nline2' });
  assert.ok(msg.includes('charset=utf-8'));
  assert.ok(!/[^\r]\n/.test(msg), 'bare LF found in the wire message');
});

console.log(`\nRESULT: ${pass} passed, ${fail} failed`);
process.exit(fail > 0 ? 1 : 0);
