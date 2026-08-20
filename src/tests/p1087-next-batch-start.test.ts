/**
 * @file p1087-next-batch-start.test.ts
 *
 * P1087 Done-When: "The countdown shows a future batch start on any day of any month —
 * verified by running with a system date one and two months ahead, not by reading the code."
 *
 * getNextBatchStartISO must never resolve to a past instant, regardless of how far the
 * system clock has drifted past FIRST_BATCH_START_ISO — the prior hardcoded
 * COHORT_ENROLLMENT_CLOSES_ISO rendered a permanent "expired" state once its one fixed
 * deadline passed. This is what that bug looked like, pinned as a regression test.
 */

import { describe, it, expect, afterEach, vi } from 'vitest';
import { getNextBatchStartISO, FIRST_BATCH_START_ISO, BATCH_CADENCE_DAYS } from '@/app/content/webinar';

const ANCHOR_MS = new Date(FIRST_BATCH_START_ISO).getTime();
const CADENCE_MS = BATCH_CADENCE_DAYS * 24 * 60 * 60 * 1000;

describe('getNextBatchStartISO', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('before the anchor: resolves to the anchor itself', () => {
    const beforeAnchor = new Date(ANCHOR_MS - 10 * 24 * 60 * 60 * 1000); // 10 days before
    expect(getNextBatchStartISO(beforeAnchor)).toBe(FIRST_BATCH_START_ISO);
  });

  it('exactly at the anchor: resolves to the anchor itself', () => {
    expect(getNextBatchStartISO(new Date(ANCHOR_MS))).toBe(FIRST_BATCH_START_ISO);
  });

  it('one day after the anchor: rolls to the next 45-day cycle, not the passed anchor', () => {
    const dayAfter = new Date(ANCHOR_MS + 24 * 60 * 60 * 1000);
    const result = new Date(getNextBatchStartISO(dayAfter));
    expect(result.getTime()).toBe(ANCHOR_MS + CADENCE_MS);
    expect(result.getTime()).toBeGreaterThan(dayAfter.getTime());
  });

  it('exactly on a cadence boundary: resolves to that same instant (still "next", not past)', () => {
    const onBoundary = new Date(ANCHOR_MS + CADENCE_MS);
    expect(getNextBatchStartISO(onBoundary)).toBe(onBoundary.toISOString());
  });

  it('one month ahead of the anchor: still resolves to a future date (system-date simulation)', () => {
    vi.useFakeTimers();
    const oneMonthAhead = new Date(ANCHOR_MS);
    oneMonthAhead.setMonth(oneMonthAhead.getMonth() + 1);
    vi.setSystemTime(oneMonthAhead);

    const result = new Date(getNextBatchStartISO(new Date()));
    expect(result.getTime()).toBeGreaterThanOrEqual(Date.now());
  });

  it('two months ahead of the anchor: still resolves to a future date (system-date simulation)', () => {
    vi.useFakeTimers();
    const twoMonthsAhead = new Date(ANCHOR_MS);
    twoMonthsAhead.setMonth(twoMonthsAhead.getMonth() + 2);
    vi.setSystemTime(twoMonthsAhead);

    const result = new Date(getNextBatchStartISO(new Date()));
    expect(result.getTime()).toBeGreaterThanOrEqual(Date.now());
  });

  it('years past the anchor: still resolves to a future date, never expired', () => {
    const farFuture = new Date(ANCHOR_MS + 3 * 365 * 24 * 60 * 60 * 1000); // ~3 years later
    const result = new Date(getNextBatchStartISO(farFuture));
    expect(result.getTime()).toBeGreaterThanOrEqual(farFuture.getTime());
  });

  it('the resolved date always lands exactly on an anchor + N*cadence boundary', () => {
    const someDate = new Date(ANCHOR_MS + 100 * 24 * 60 * 60 * 1000); // 100 days after anchor
    const result = new Date(getNextBatchStartISO(someDate));
    const offsetFromAnchor = result.getTime() - ANCHOR_MS;
    expect(offsetFromAnchor % CADENCE_MS).toBe(0);
  });
});
