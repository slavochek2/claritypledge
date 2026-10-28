/**
 * @file MessageRowPlaceholders.tsx
 * @description P1586: the placeholders a message row shows while an author's profile or a quoted
 * message is still loading, split out of MessageRow.tsx.
 */
import type { ChatAuthor } from '@/app/data/chat-ui-helpers';
import { Skeleton } from '@/components/ui/skeleton';
import { PersonMark } from './chat-kit';

export function AuthorNameSkeleton() {
  return <Skeleton as="span" role="status" aria-label="Loading name" className="inline-block h-3.5 w-24 align-middle" />;
}

export function QuoteSkeleton() {
  return <Skeleton className="my-1 h-9 max-w-md rounded-lg bg-muted/50" />;
}

/** The avatar of an author without a profile link: a quiet disc while the profile loads, else the mark. */
export function UnlinkedAuthorMark({ author, authorId, pending }: { author: ChatAuthor | undefined; authorId: string | null; pending: boolean }) {
  if (pending) return <Skeleton as="span" className="block h-9 w-9 rounded-full" />;
  return (
    <PersonMark
      person={author ? { name: author.name, avatarColor: author.avatarColor, avatarUrl: author.avatarUrl } : authorId ? { name: 'Unknown member', unknown: true } : { name: 'Deleted user', deleted: true }}
      size="md"
    />
  );
}
