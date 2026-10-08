// P1399 — a SYNTHETIC /day run (schema v2). Invented data only, modelled on the approved
// mockup's sample run: no real report content enters the repo, its tests or its screenshots
// (spec Invariants; P1317 precedent). Used by the unit tests, the e2e suite and the QA shots.

import type { DayStatement, DayReport, DayIssue, DayCheck } from '../../../src/lib/day'

export const SECRET = 'FIXTURE-SECRET-DAY-91c2'

const agent = (why: string, rec = true) => ({ id: 'agent', label: 'Give to the agent', agent: true, recommended: rec, why })
const park = { id: 'park', label: 'Park: stop asking until I bring it back' }

export const CHECKS: DayCheck[] = [
  { id: 'site', label: 'Site pages', status: 'ok', detail: '8 of 8 pages load', group: 'Servers & blog' },
  { id: 'blog', label: 'Blog', status: 'ok', detail: 'latest post live', group: 'Servers & blog' },
  { id: 'servers', label: 'Servers', status: 'ok', detail: 'both up', group: 'Servers & blog' },
  { id: 'bk-a', label: 'Backup · repo A', status: 'ok', detail: 'copied last night', group: 'Backups & mirror' },
  { id: 'bk-b', label: 'Backup · repo B', status: 'ok', detail: 'copied last night', group: 'Backups & mirror' },
  { id: 'bk-c', label: 'Backup · repo C', status: 'problem', detail: 'last copy 3 days old', group: 'Backups & mirror', severity: 'high' },
  { id: 'transcribe', label: 'Transcription queue', status: 'ok', detail: 'empty', group: 'Transcription & video' },
  { id: 'video', label: 'Video uploads', status: 'skipped', detail: 'not scheduled today', group: 'Transcription & video' },
  { id: 'keylive', label: 'Prod key liveness', status: 'problem', detail: '2 of 7 keys not answering', group: 'Keys', severity: 'high' },
  { id: 'keyspend', label: 'Key spend feed', status: 'unproven', detail: 'no result', group: 'Keys' },
  { id: 'tripwire', label: 'Spend tripwire', status: 'ok', detail: 'under threshold', group: 'Cost-leak tripwire' },
  { id: 'sender', label: 'Outreach sender', status: 'problem', detail: 'paused since Fri', group: 'Outreach machine' },
  { id: 'crmsync', label: 'CRM sync', status: 'problem', detail: '12 records failed', group: 'CRM' },
  { id: 'evmail', label: 'Event emails', status: 'ok', detail: 'reminders sent', group: 'Email & sessions' },
  { id: 'dbpriv', label: 'Database privileges', status: 'unproven', detail: 'no result', group: 'Email & sessions' },
  { id: 'rules', label: 'Database access rules', status: 'problem', detail: '2 rules live, not on main', group: 'Email & sessions', severity: 'high' },
  { id: 'calpub', label: 'Calendar publish', status: 'ok', detail: '71 new events', group: 'Events calendar' },
  { id: 'chats', label: 'Chat groups', status: 'problem', detail: 'messages didn’t load', group: 'Events calendar', connection: 'beeper' },
  { id: 'tests', label: 'Tests', status: 'problem', detail: '3 of 412 failing', group: 'Code' },
  { id: 'credits', label: 'Cloud credits', status: 'problem', detail: 'balance is an estimate', group: 'Money' },
  { id: 'budgets', label: 'Cloud budgets', status: 'ok', detail: '€19 of €400', group: 'Money' },
]

export const ISSUES: DayIssue[] = [
  {
    fp: 'rules:live-not-on-main', topic: 'Security', check: 'rules', important: true, deadline: '2026-10-06',
    title: 'Database rules are live before review', first_seen: '2026-10-03',
    point_a: '2 rules are live but not on main.', obstacle: 'Not reviewed; Tuesday’s event needs them.', point_b: 'Live rules match reviewed code.',
    options: [agent('Agent can compare and merge before Tuesday.'), { id: 'rollback', label: 'Roll back now' }, park],
    recommendation_confidence: 85, risk: 'A rollback could drop the rules Tuesday’s event needs.', evidence: 'verified', evidence_text: '2 policies on live, 0 in migrations', source: 'Database access rules check',
  },
  {
    fp: 'sentry:room-ended', topic: 'Events', deadline: '2026-10-06', title: 'Some guests may be turned away on Tuesday',
    point_a: 'Three guests saw an error yesterday that said their room had ended.', obstacle: 'Nobody knows yet why the room closes early.', point_b: 'Everyone who comes on Tuesday gets in.',
    options: [agent('It’s the page guests use Tuesday.'), park], recommendation_confidence: 75, risk: 'The fix may hide the error without curing it.', evidence: 'unverified', source: 'Sentry',
    // the plain-language pass rewrote this card; the technical wording is one step away
    technical: { title: '“Room has ended” error on the event page', point_a: 'Seen 3 times yesterday.', obstacle: 'Cause unknown.', point_b: 'Guests join cleanly on Tuesday.' },
  },
  {
    fp: 'replies:event-post', topic: 'Events', deadline: '2026-10-05', first_seen: '2026-10-02', title: 'Replies waiting on your event post',
    point_a: '2 questions about Tuesday.', obstacle: 'Only you can reply.', point_b: 'Both answered before Tuesday.',
    options: [{ id: 'reply', label: 'I’ll reply today', recommended: true, why: 'Asked 2 days ago.' }, { id: 'draft', label: 'Agent drafts, you send', agent: true }, park],
    evidence: 'verified', // no fit rated: the page says "Fit not rated", never a made-up number
  },
  {
    fp: 'spec:letters-waiting', topic: 'Product', important: true, first_seen: '2026-08-28', title: `Ship community letters? ${SECRET}`,
    point_a: 'Built and tested.', obstacle: 'Needs your OK.', point_b: 'Live, or set aside.',
    options: [{ id: 'ship', label: 'Ship today', recommended: true, why: 'Nothing blocks it.' }, { id: 'after', label: 'Ship after Tuesday' }, park],
    recommendation_confidence: 70, evidence: 'verified', source: 'Branches and specs',
  },
  {
    fp: 'credits:baseline', topic: 'Money', check: 'credits', important: true, first_seen: '2026-08-28', title: 'Cloud credit balance is a guess',
    point_a: 'Estimated from spend.', obstacle: 'Only you can open billing.', point_b: 'Real number, read once.',
    options: [{ id: 'read', label: 'I’ll read it today', recommended: true, why: 'Two minutes.' }, park],
    recommendation_confidence: 95, evidence: 'verified',
  },
  {
    fp: 'question:rehearsal', topic: 'Question', important: true, title: 'Do a practice run before the first pilot?',
    point_a: 'No practice run is planned.', obstacle: 'If a bug ruins the pilot, the test counts for nothing.', point_b: 'The first pilot runs without surprises.',
    options: [{ id: 'rehearse', label: 'One 45-min run with 4 people', recommended: true, why: 'Cheap way to catch session bugs.' }, { id: 'none', label: 'Let the first pilot be the rehearsal' }, park],
    recommendation_confidence: 70, risk: 'Four people’s time for a problem that may not exist.', source: 'Sub-day question',
    technical: { title: 'Rehearse online before the first pilot?', point_a: 'No rehearsal planned.', obstacle: 'A pilot lost to a bug voids the test.', point_b: 'First pilot runs cleanly.' },
  },
]

export function synthReport(over: Partial<DayReport> = {}): DayReport {
  return {
    schema: 2,
    pass_id: '2026-10-04T05-37-45Z',
    started_at: '2026-10-04T05:37:45Z',
    finished_at: '2026-10-04T06:10:00Z',
    state: 'complete',
    model: 'Sonnet',
    unpushed_commits: 12,
    connections: [
      { id: 'sentry', label: 'Sentry', state: 'not-connected', why: 'login expired', fix_step: 'Sign in to Sentry again (run /mcp, then authenticate sentry).', fix_url: 'https://sentry.io/auth/login/' },
      { id: 'beeper', label: 'Beeper', state: 'failed', why: 'chats didn’t download', fix_step: 'Open Beeper Desktop and wait for it to sync.' },
      { id: 'gmail', label: 'Gmail', state: 'ok' },
    ],
    checks: CHECKS.map((c) => ({ ...c })),
    issues: ISSUES.map((i) => ({ ...i, options: i.options.map((o) => ({ ...o })) })),
    monitoring: {
      quotas: [
        {
          id: 'claude', label: 'Claude', collected: true, remaining_pct: 60, resets_at: '2026-10-08T00:00:00Z', verdict: 'Runs out Tue', needs_attention: true,
          window_5h: { remaining_pct: 35, resets_at: '2026-10-04T14:20:00Z' },
          week: [
            { x: 'Thu', remaining: 100 }, { x: 'Fri', remaining: 92 }, { x: 'Sat', remaining: 81 }, { x: 'Sun', remaining: 60, projected: 60 },
            { x: 'Mon', projected: 30 }, { x: 'Tue', projected: 0 }, { x: 'Wed' }, { x: 'Thu' },
          ],
          month: [{ x: '8 Sep', left_at_reset: 12 }, { x: '15 Sep', left_at_reset: 0 }, { x: '22 Sep', left_at_reset: 22 }, { x: '29 Sep', left_at_reset: 8 }],
          month_verdict: 'Ran out 1 of 4 weeks',
          tip: 'Most use is long review loops; run reviews on Sonnet.',
        },
        {
          id: 'codex', label: 'Codex', collected: true, remaining_pct: 72, resets_at: '2026-10-08T12:00:00Z', verdict: 'On pace',
          week: [
            { x: 'Thu', remaining: 100 }, { x: 'Fri', remaining: 94 }, { x: 'Sat', remaining: 85 }, { x: 'Sun', remaining: 72, projected: 72 },
            { x: 'Mon', projected: 58 }, { x: 'Tue', projected: 44 }, { x: 'Wed', projected: 30 }, { x: 'Thu', projected: 18 },
          ],
        },
      ],
      cloud: {
        collected: true, budget_eur: 400, spent_week_eur: 19, spent_month_eur: 70, projected_month_eur: 95,
        credits: { amount_eur: 585, caveat: 'unverified (baseline 37 days old)' },
        week: [{ x: 'Mon', spent: 2, budget_pace: 0 }, { x: 'Tue', spent: 5 }, { x: 'Wed', spent: 8 }, { x: 'Thu', spent: 11 }, { x: 'Fri', spent: 14 }, { x: 'Sat', spent: 17 }, { x: 'Sun', spent: 19, budget_pace: 93 }],
        month: [{ x: '1', spent: 0, budget_pace: 0 }, { x: '8', spent: 24 }, { x: '15', spent: 48 }, { x: '22', spent: 70, projected: 70 }, { x: '29', projected: 95, budget_pace: 400 }],
        keys: [
          { id: 'key-gemini', label: 'Gemini', collected: true, spent_eur: 16, budget_eur: 60 },
          { id: 'key-emails', label: 'Event emails', collected: true, spent_eur: 12, budget_eur: 40 },
          { id: 'key-transcribe', label: 'Transcription', collected: true, spent_eur: 34, budget_eur: 80 },
          { id: 'key-translate', label: 'Translation', collected: true, spent_eur: 5, budget_eur: 40 },
          { id: 'key-summaries', label: 'Summaries', collected: true, spent_eur: 19, budget_eur: 60 },
          { id: 'key-search', label: 'Search', collected: false, budget_eur: 20, why: 'no billing data: unused, or not in the billing export' },
          { id: 'key-bot', label: 'Bot replies', collected: true, spent_eur: 28, budget_eur: 32 },
        ],
      },
    },
    stats: {
      readings: [
        { id: 'unconfirmed', label: 'Sign-ups not confirmed', collected: true, value: 3 },
        { id: 'mentions', label: 'Mentions', collected: true, value: 1, note: 'chat-digest' },
        { id: 'help_requests', label: 'Help requests', collected: true, value: 5, note: 'chat-digest' },
      ],
      // the cp board's Pipeline columns, counted now; zeros are real until outreach starts
      funnel: {
        collected: true, period: 'now',
        steps: [{ label: 'Contacted', value: 4 }, { label: 'In conversation', value: 2 }, { label: 'Qualified', value: 0 }, { label: 'Committed', value: 0 }, { label: 'Active', value: 0 }],
      },
      series: [
        {
          id: 'events', label: 'Events per week', collected: true, target: 1,
          points: [{ x: '7 Sep', value: 1 }, { x: '14 Sep', value: 0 }, { x: '21 Sep', value: 1 }, { x: '28 Sep', value: 1 }, { x: '5 Oct', value: 0 }],
        },
      ],
    },
    people: [
      { id: 'p-a', name: 'Person A', joined_at: '2026-10-03T19:12:00Z', source: 'Event: Clarity Night #2', confirmed: true, did: 'Rated 4 points and wrote 1 story.', stopped_at: 'Did not start a live session.', linkedin_url: 'https://www.linkedin.com/in/example-a', background: 'Runs a small design studio.' },
      { id: 'p-b', name: 'Person B', joined_at: '2026-10-04T02:40:00Z', source: 'Direct', confirmed: false, did: 'Signed up, nothing else yet.', stopped_at: 'Never confirmed the email.' },
      { id: 'p-c', name: 'Person C', source: 'Letter', returning: true, did: 'Came back and answered a letter.' },
    ],
    notes: [
      { id: 'shipped', title: 'Shipped since the last run', body: 'Event page: room-ended message reworded.\nBoard: Day page phase A.' },
      { id: 'chat-digest', title: 'Chat digest', body: 'Mentions: 1. Person D asked in the Tuesday group if there is a seat left. Suggested reply: “Yes, two seats; link below.”\nHelp requests: 5. Person E asked how to join from a phone (suggested reply: the join guide). Person F could not hear the host (suggested reply: check the audio settings; offer a 5-minute call).' },
      { id: 'next', title: 'What is next', body: '1. Review the two live database rules.\n2. Send the pilot invite draft.' },
      { id: 'week-measures', title: 'Weekly review: measurements', body: 'Reach-outs: 6 (target 10)\nChampion talks: 2', review: 'weekly' },
    ],
    reflection: {
      model: 'Opus',
      statements: [
        { id: 'c1', text: 'Building features this week was a way to avoid reach-outs.' },
        {
          id: 'c2',
          text: 'Weekly events are a hobby until one produces a champion talk.',
          // P1445: "Agent on Slava" — invented text (public repo), checked by the checker
          agent: {
            name: 'Slava',
            position: -1,
            story: 'Fact: the last two events produced "no champion talk yet". Connection: the format is unproven, not a hobby. Speculation: one more month decides it.',
            sources: [{ ref: 'issue card: Weekly measurements', quote: 'no champion talk yet' }],
            checker: 'pass',
          },
        } as DayStatement,
        { id: 'c3', text: 'If no pilot is agreed by 31 Oct, the pitch is wrong, not the timing.' },
        { id: 'c4', text: 'The morning report should take five minutes, or it is the new busywork.' },
      ],
    },
    ...over,
  }
}

function withQuotas(r: DayReport, claude: number, codex: number): DayReport {
  const pct: Record<string, number> = { claude, codex }
  for (const q of r.monitoring?.quotas ?? []) if (q.id in pct) q.remaining_pct = pct[q.id]
  return r
}

/** An earlier, smaller run for the day switcher. */
export function synthEarlier(): DayReport {
  const r = synthReport({ pass_id: '2026-10-03T05-05-00Z', started_at: '2026-10-03T05:05:00Z', finished_at: '2026-10-03T05:40:00Z', unpushed_commits: 9 })
  r.issues = r.issues.slice(0, 3)
  return withQuotas(r, 81, 85)
}

/** The run before that, still inside the subscriptions' week, so the history has three points. */
export function synthEarlier2(): DayReport {
  const r = synthReport({ pass_id: '2026-10-02T05-10-00Z', started_at: '2026-10-02T05:10:00Z', finished_at: '2026-10-02T05:45:00Z', unpushed_commits: 7 })
  r.issues = r.issues.slice(0, 2)
  return withQuotas(r, 92, 94)
}

/** A weekly-review run: adds review issues and a review statement. */
export function synthWeekly(): DayReport {
  const r = synthReport({ reviews: ['weekly'] })
  r.issues.push(
    {
      fp: 'weekly:reach-target', topic: 'Weekly review', review: 'weekly', important: true, title: 'Reach-outs below the weekly target',
      point_a: '6 reach-outs, 2 talks last week.', obstacle: 'Most time went to event prep.', point_b: '10 reach-outs a week.',
      options: [{ id: 'keep', label: 'Keep target 10, block Mon morning', recommended: true, why: 'Talks drive the pilot test.' }, { id: 'lower', label: 'Lower target to 6' }, park],
      recommendation_confidence: 65,
    },
  )
  r.reflection?.statements.push({ id: 'w1', text: 'Prepping each event from scratch is a choice, not a necessity.', review: 'weekly' })
  return r
}

/** A run that included the monthly review: its proposals are issues, plus a review statement. */
export function synthMonthly(): DayReport {
  const r = synthReport({ reviews: ['monthly'] })
  r.issues.push({
    fp: 'monthly:archive-stale-specs', topic: 'Board', review: 'monthly', title: 'Archive specs untouched for 60 days?',
    point_a: '9 specs have not moved in 60 days.', obstacle: 'They crowd the Week column.', point_b: 'The board shows live work only.',
    options: [{ id: 'archive', label: 'Archive all 9', recommended: true, why: 'None has a linked branch.' }, { id: 'review', label: 'Show me the list first' }, { id: 'park', label: 'Park: stop asking until I bring it back' }],
    recommendation_confidence: 70,
  })
  r.reflection?.statements.push({ id: 'm1', text: 'A month without a pilot means the plan is the problem, not the effort.', review: 'monthly' })
  return r
}
