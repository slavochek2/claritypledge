/**
 * P1336 — the confirmation prep block states, the social-proof line, the status badge, the
 * host summary and the event-service email rule for preparation settings.
 */
import { describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { render, screen } from '@testing-library/react';
import { PrepBlock, PrepStatus, socialProofLine } from '@/app/prototypes/events/prep/PrepPieces';
import { hostSummary, prepStateLabel } from '@/app/prototypes/events/prep/PrepHostList';
import { defaultPreparation, validateStatementTag } from '@/app/prototypes/events/prep/PrepSettingsFields';
import { RESEARCH_QA, clipUrl } from '@/app/prototypes/events/prep/prep-content';
import type { HostPrepRow } from '@/app/data/event-prep-service';

const noProof = { line: null, people: [] };
const renderBlock = (done: number, total: number, complete = false, reminded = false) =>
  render(
    <PrepBlock
      progress={{ done, total, complete }}
      minutes={12}
      reminded={reminded}
      proof={noProof}
      onPrepare={vi.fn()}
      onRemind={vi.fn()}
    />,
  );

describe('PrepBlock states', () => {
  it('0 done: the why, the question with N minutes, Prepare now + Remind me by email', () => {
    renderBlock(0, 6);
    expect(screen.getByTestId('prep-why')).toHaveTextContent('Our events are different');
    expect(screen.getByTestId('prep-question')).toHaveTextContent('Do you have 12 minutes to prepare for the event?');
    expect(screen.getByRole('button', { name: 'Prepare now' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Remind me by email' })).toBeInTheDocument();
    expect(screen.queryByText(/0 of 6/)).toBeNull();
  });

  it('reminded: the confirmation replaces the button', () => {
    renderBlock(0, 6, false, true);
    expect(screen.getByTestId('reminder-confirmation')).toHaveTextContent("✓ We'll email you a reminder");
  });

  it('1-5 done: "{k} of 6 steps done" + Continue your preparation, the why still shown', () => {
    renderBlock(3, 6);
    expect(screen.getByTestId('prep-progress')).toHaveTextContent('3 of 6 steps done');
    expect(screen.getByRole('button', { name: 'Continue your preparation' })).toBeInTheDocument();
    expect(screen.getByTestId('prep-why')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Remind me by email' })).toBeNull();
  });

  it('done: nothing (the box carries Prepared ✓)', () => {
    const { container } = renderBlock(6, 6, true);
    expect(container).toBeEmptyDOMElement();
  });
});

describe('PrepStatus', () => {
  it('Prepared ✓ when complete, "{k} of {M} steps" in progress, nothing before the first step', () => {
    const { rerender } = render(<PrepStatus progress={{ done: 6, total: 6, complete: true }} started />);
    expect(screen.getByTestId('prep-status')).toHaveTextContent('Prepared ✓');
    rerender(<PrepStatus progress={{ done: 2, total: 6, complete: false }} started />);
    expect(screen.getByTestId('prep-status')).toHaveTextContent('2 of 6 steps');
    rerender(<PrepStatus progress={{ done: 0, total: 6, complete: false }} started />);
    expect(screen.queryByTestId('prep-status')).toBeNull();
  });
});

describe('socialProofLine', () => {
  it('earlier events and this event are two scopes, named as such (founder, UAT 2026-10-01)', () => {
    expect(socialProofLine('opted in at', 12, 1, 'Clarity Nights')).toBe('12 people opted in at previous Clarity Nights, and 1 for this event');
    expect(socialProofLine('opted in at', 11, 0, 'Clarity Nights')).toBe('11 people opted in at previous Clarity Nights');
    expect(socialProofLine('prepared for', 0, 3, 'Clarity Nights')).toBe('3 people prepared for this event');
    expect(socialProofLine('prepared for', 0, 1, 'Clarity Nights')).toBe('1 person prepared for this event');
    expect(socialProofLine('opted in at', 0, 2, 'Clarity Nights')).toBe('2 people opted in for this event');
    expect(socialProofLine('prepared for', 4, 2, 'our events')).toBe('4 people prepared for our previous events, and 2 for this event');
    expect(socialProofLine('prepared for', 0, 0, 'Clarity Nights')).toBeNull();
  });
});

const row = (over: Partial<HostPrepRow>): HostPrepRow => ({
  profileId: 'user-id-1', name: 'Test', slug: 'test', hasPledged: false, prepChoice: null, stepsDone: [],
  startedAt: null, completedAt: null, optedIn: null, principleRating: null, researchState: null, micSetup: null,
  positionsDone: 0, positionsTotal: 0, ...over,
});

describe('host view', () => {
  it('prep state labels', () => {
    expect(prepStateLabel(row({ completedAt: 'x' }))).toBe('Prepared');
    expect(prepStateLabel(row({ startedAt: 'x', stepsDone: ['welcome', 'story'] }))).toBe('In progress, step 3');
    expect(prepStateLabel(row({ prepChoice: 'remind' }))).toBe('Chose remind');
    expect(prepStateLabel(row({}))).toBe('Not started');
  });

  it('summary counts confirmed volunteers and USB-C mics only', () => {
    const rows = [
      row({ researchState: 'confirmed', micSetup: 'usbc' }),
      row({ researchState: 'confirmed', micSetup: 'own' }),
      row({ researchState: 'declined', micSetup: 'none' }),
      row({ researchState: 'eligible' }),
    ];
    expect(hostSummary(rows)).toBe('2 volunteers · 1 USB-C mic needed');
  });
});

describe('per-event setup', () => {
  it('series default: Clarity Night on, hikes off', () => {
    expect(defaultPreparation('Clarity Night #3: Something')).toBe(true);
    expect(defaultPreparation('Sunday hike to Doi Suthep')).toBe(false);
  });

  it('statement tag shape matches the DB CHECK', () => {
    expect(validateStatementTag('')).toBeNull();
    expect(validateStatementTag('#ikigai1')).toBeNull();
    expect(validateStatementTag('Has Space')).not.toBeNull();
  });
});

describe('research copy + clips', () => {
  it('the access answer names the research programme and excludes organisers/hosts', () => {
    const first = String(RESEARCH_QA[0]!.a);
    expect(first).toMatch(/Clarity Pledge, as a research programme, reads the conversation transcripts/);
    expect(first).toMatch(/Event organisers and hosts don't read them/);
  });

  it('clips load from the public media bucket under versioned names', () => {
    expect(clipUrl('welcome', 'video')).toBe(
      'https://storage.googleapis.com/claritypledge-story-images/event-prep/why-clarity-night-v1.mp4',
    );
    expect(clipUrl('story', 'poster')).toBe(
      'https://storage.googleapis.com/claritypledge-story-images/event-prep/cognitive-understanding-v1-poster.jpg',
    );
  });

  // The live site's security header decides where media may load from; the dev server sends none,
  // so a disallowed host passes every local test and fails only in production (found 2026-10-01:
  // the clips pointed at Supabase Storage, which media-src does not allow).
  it("every clip and poster is allowed by the production CSP (vercel.json media-src / img-src)", () => {
    const vercel = JSON.parse(readFileSync(resolve(process.cwd(), 'vercel.json'), 'utf8')) as {
      headers: { headers: { key: string; value: string }[] }[];
    };
    const csp = vercel.headers.flatMap((h) => h.headers).find((h) => h.key === 'Content-Security-Policy')!.value;
    const sources = (directive: string) =>
      (csp.split(';').map((d) => d.trim()).find((d) => d.startsWith(`${directive} `)) ?? '').split(/\s+/).slice(1);
    const allowed = (url: string, directive: string) =>
      sources(directive).some((src) => {
        if (src === "'self'") return false;
        const pattern = new RegExp(`^${src.replace(/[.]/g, '\\.').replace('*', '[^/]+')}(/|$)`);
        return pattern.test(url);
      });
    for (const clip of ['welcome', 'story', 'principle', 'research'] as const) {
      expect(allowed(clipUrl(clip, 'video'), 'media-src'), `${clip} video`).toBe(true);
      expect(allowed(clipUrl(clip, 'poster'), 'img-src'), `${clip} poster`).toBe(true);
    }
    // Control: the host the clips used to point at is NOT allowed for media — the check can fail.
    expect(allowed('https://abc.supabase.co/storage/v1/object/public/p1336-clips/x.mp4', 'media-src')).toBe(false);
  });
});
