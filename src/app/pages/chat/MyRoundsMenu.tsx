/**
 * @file MyRoundsMenu.tsx
 * @description P1592 D4: the "My rounds" part of an event channel's three-dot menu — a small heading and one
 * item per round thread the viewer was seated in, newest round first, each opening that thread (the same route a
 * reply count opens). Nothing is rendered when the viewer has no round thread, so the menu is then exactly the
 * menu of any channel.
 */
import { DropdownMenuGroup, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator } from '@/components/ui/dropdown-menu';
import type { RoundThread } from '@/app/data/chat-round-threads';

const HEADING_ID = 'my-rounds-heading';

export function MyRoundsMenuSection({ threads, onOpen }: { threads?: RoundThread[]; onOpen?: (rootMessageId: string) => void }) {
  if (!threads?.length || !onOpen) return null;
  return (
    <>
      <DropdownMenuGroup aria-labelledby={HEADING_ID} data-testid="my-rounds-group">
        <DropdownMenuLabel id={HEADING_ID} className="px-2 py-1 text-xs font-medium text-muted-foreground" data-testid="my-rounds-heading">
          My rounds
        </DropdownMenuLabel>
        {threads.map((t) => (
          <DropdownMenuItem key={t.rootMessageId} className="min-h-10" data-testid="my-rounds-item" title={t.title} onSelect={() => onOpen(t.rootMessageId)}>
            <span className="min-w-0 truncate">{t.title}</span>
          </DropdownMenuItem>
        ))}
      </DropdownMenuGroup>
      <DropdownMenuSeparator />
    </>
  );
}
