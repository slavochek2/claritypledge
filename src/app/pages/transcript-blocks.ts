/**
 * @file transcript-blocks.ts
 * @description P1604: how a session's clean text is headed in session history. Round sessions read as blocks in time order, each
 * under "Round N · Table M"; the stretches outside the rounds carry the place's own title (the same titles the chat threads use:
 * "Before round 1", "The conversation", "After the last round"). A plain session (no event) has no headings at all.
 */
import type { TranscriptSection } from '@/app/data/room-clean-transcript';

/** [FOUNDER DECISION: copy, proposed] the same words the threads in the chat carry. */
const PLACE_TITLE: Record<string, string> = {
  before: 'Before round 1',
  conversation: 'The conversation',
  end: 'After the last round',
};

/** The heading of one job, or null when it needs none (a plain session's one job). */
export function sectionHeading(section: TranscriptSection | undefined): string | null {
  if (!section) return null;
  if (section.kind === 'round') return `Round ${section.roundNo} · Table ${section.tableNo}`;
  return section.place ? PLACE_TITLE[section.place] ?? null : null;
}

/** The heading to put above this segment: only where the job changes from the segment before it. */
export function headingBefore(
  jobId: string | undefined,
  previousJobId: string | undefined,
  sections: ReadonlyMap<string, TranscriptSection>,
): string | null {
  if (!jobId || jobId === previousJobId) return null;
  return sectionHeading(sections.get(jobId));
}
