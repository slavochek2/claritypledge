import { SectionWait } from '@/components/ui/section-wait';
import { TopicListSkeleton } from './topic-list-skeleton';

/**
 * P1586: the topic list's whole wait: the row skeleton, then (past the section deadline) a readable
 * line with Retry. One component for both places the list lives (topics page, event close page's
 * voting section), so neither can render the skeleton without its deadline. `onRetry` re-runs the read.
 */
export function TopicListWait({ onRetry }: { onRetry: () => void }) {
  return (
    <SectionWait onRetry={onRetry}>
      <TopicListSkeleton />
    </SectionWait>
  );
}
