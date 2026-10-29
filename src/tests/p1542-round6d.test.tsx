// @vitest-environment jsdom
/**
 * P1542 round 6d: the "finished" write survives a move to the group terms (Codex), lighter labels are legible (Opus F3),
 * opt-in pretty wrapping on hike certificates (Opus F8), and the source contracts of the remaining fixes.
 */
import { readFileSync } from 'fs';
import { join } from 'path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, renderHook, screen } from '@testing-library/react';

const { finish } = vi.hoisted(() => ({ finish: vi.fn() }));
vi.mock('@/app/data/event-close-service', () => ({ finishEventClose: (...a: unknown[]) => finish(...a) }));

import { useFinishCloseOnce, FINISH_RETRY_BASE_MS } from '@/app/prototypes/events/close/use-finish-close';
import { RoomSteps } from '@/app/prototypes/events/rounds/RoomSteps';
import { CertificateOathBody } from '@/app/components/agreements/certificate-frame';

const read = (p: string) => readFileSync(join(__dirname, '../..', p), 'utf8');
const flush = async () => { for (let i = 0; i < 5; i++) await Promise.resolve(); };

describe('(2) the "finished" write is not lost when the person moves on to the group terms', () => {
  beforeEach(() => { vi.useFakeTimers(); finish.mockReset(); });
  afterEach(() => vi.useRealTimers());

  it('a failed first write is retried even after the thank-you was left for the terms', async () => {
    finish.mockResolvedValueOnce(false).mockResolvedValueOnce(true);
    const { rerender } = renderHook(({ at }) => useFinishCloseOnce(at, 'e1', false), { initialProps: { at: true } });
    await flush();
    expect(finish).toHaveBeenCalledTimes(1);
    rerender({ at: false }); // thank-you → group terms (Join, learned non-member)
    await vi.advanceTimersByTimeAsync(FINISH_RETRY_BASE_MS);
    await flush();
    expect(finish).toHaveBeenCalledTimes(2); // the retry still ran
    rerender({ at: true }); // back on the thank-you: already done, no new write
    await flush();
    expect(finish).toHaveBeenCalledTimes(2);
  });

  it('"done" only after the server confirmed: a page already finished never writes; unmount cancels the chain', async () => {
    renderHook(() => useFinishCloseOnce(true, 'e1', true));
    await flush();
    expect(finish).not.toHaveBeenCalled();
    finish.mockResolvedValue(false);
    const { unmount } = renderHook(() => useFinishCloseOnce(true, 'e2', false));
    await flush();
    expect(finish).toHaveBeenCalledTimes(1);
    unmount();
    await vi.advanceTimersByTimeAsync(FINISH_RETRY_BASE_MS * 10);
    expect(finish).toHaveBeenCalledTimes(1);
  });
});

describe('(4) step labels ahead are legible (no 50% muted text)', () => {
  it('a hike bar and the five-step bar both use the full muted colour for steps ahead', () => {
    const { unmount } = render(<RoomSteps current="principle" viewing="principle" onSelect={() => {}} hidden={['ready', 'table', 'compare']} labels={{ principle: 'Opt in', close: 'Give feedback' }} />);
    const ahead = screen.getByTestId('room-step-close').querySelector('span')!;
    expect(ahead.className).toMatch(/(^|\s)text-muted-foreground(\s|$)/);
    expect(ahead.className).not.toMatch(/text-muted-foreground\/50/);
    unmount();
    render(<RoomSteps current="ready" viewing="ready" onSelect={() => {}} />);
    expect(screen.getByTestId('room-step-compare').querySelector('span')!.className).not.toMatch(/text-muted-foreground\/50/);
  });
});

describe('(6 → 7d) certificate body paragraphs: text-wrap pretty, never hyphenated, opt-in', () => {
  const sections = [{ heading: 'Your right', text: 'When we speak, please feel free to ask.', boldPhrases: [] }];
  it('[text-wrap:pretty] when asked and no hyphens-auto (key phrases never split); nothing by default', () => {
    const { container, unmount } = render(<CertificateOathBody sections={sections} prettyWrap />);
    expect(container.querySelector('p')!.className).toMatch(/\[text-wrap:pretty\]/);
    expect(container.querySelector('p')!.className).not.toMatch(/hyphens-auto/);
    unmount();
    const plain = render(<CertificateOathBody sections={sections} />);
    expect(plain.container.querySelector('p')!.className).not.toMatch(/text-wrap|hyphens/);
  });
});

describe('round 6d source contracts', () => {
  const room = read('src/app/prototypes/events/prep/PrepRoom.tsx');
  const close = read('src/app/prototypes/events/close/EventClosePage.tsx');
  const meet = read('src/app/prototypes/events/components/EventRoomMeet.tsx');
  const seed = read('scripts/archive/migrations/20261022-p1542-seed-local-hikes.mjs');
  it('(1) the registration "Learn more" carries no fromEvent marker (the page below is the thank-you)', () => {
    const block = room.slice(room.indexOf('export function LearnInvitation'));
    expect(block).toMatch(/onClick=\{\(\) => navigate\(`\/events\/\$\{event\.slug\}\/prepare`\)\}/);
    expect(block).not.toMatch(/state: \{ fromEvent/);
  });
  it('(5) the terms bar and the room\'s Opt in bar share the same pinned-footer treatment (round 7)', () => {
    expect(close).toMatch(/<StepActions ref=\{barRef\} className=\{cn\(PINNED_FADE_CLASS, atEnd && PINNED_FADE_OFF_CLASS, PINNED_FLAT_DESKTOP_CLASS\)\}>/);
    expect(meet).toMatch(/shellBack \? cn\(PINNED_FADE_CLASS, atEnd && PINNED_FADE_OFF_CLASS, PINNED_FLAT_DESKTOP_CLASS\) : BAR_FADE_CLASS/);
  });
  it('(6 → 7d) the three hike certificates ask for pretty-wrapped body text', () => {
    expect(meet).toMatch(/<CertificateOathBody sections=\{sectionsForLevel\(PRINCIPLE_LEVEL\)\} prettyWrap=\{shellBack\} \/>/);
    expect(close).toMatch(/<CertificateOathBody sections=\{\[coa\.yourRight, coa\.myPromise, coa\.exception\]\} prettyWrap=\{named\} \/>/);
    expect(read('src/app/components/agreements/meeting-principle-view.tsx')).toMatch(/<CertificateOathBody sections=\{sectionsForLevel\(level\)\} prettyWrap=\{balancedCertificate\} \/>/);
  });
  it('(7) the room\'s finished line uses the success green check', () => {
    // Founder UAT round: the room's feedback step moved to RoomCloseView.tsx (EventRoomMeet.tsx may not grow).
    expect(read('src/app/prototypes/events/components/RoomCloseView.tsx')).toMatch(/<Check className="h-5 w-5 shrink-0 text-green-600" aria-hidden="true" data-testid="room-close-check" \/>/);
  });
  it('(3) the seed script runs only on the active TEST server, resolved from the file it reads (P1591)', () => {
    // The resolver accepts only the exact hosted or self-hosted TEST URL; any other answer refuses before a write.
    expect(seed).toMatch(/active_test_target/);
    expect(seed).toMatch(/CP_ACTIVE_TEST_FILE: ENV_FILE/);
    expect(seed).toMatch(/if \(!\['hosted', 'selfhosted'\]\.includes\(activeTest\) \|\| !origin_\.startsWith\('https:\/\/'\) \|\| url\.includes\(PROD_REF\)/);
  });
  it('(9) --new-hiker resets only its own account (per-event rows only for the seed events) and links via /auth/verify', () => {
    const part = seed.slice(seed.indexOf('if (newHiker) {'));
    const deletes = part.match(/\.delete\(\)[^;]*/g) ?? [];
    expect(deletes.length).toBeGreaterThanOrEqual(8);
    for (const d of deletes) expect(d).toMatch(/\.eq\('(user_id|profile_id|author_profile_id)', hiker\.id\)/);
    for (const t of ['event_preparations', 'event_feedback', 'personal_ask_answers', 'event_room_members', 'series_reviews']) {
      expect(part).toMatch(new RegExp(`from\\('${t}'\\)\\.delete\\(\\)[^;]*\\.in\\('(event_id|source_event_id)', seedIds\\)`));
    }
    expect(part).toMatch(/\/auth\/verify\?token_hash=/);
    expect(part).not.toMatch(/properties\??\.action_link/); // the implicit-flow link the PKCE app refuses
  });
});
