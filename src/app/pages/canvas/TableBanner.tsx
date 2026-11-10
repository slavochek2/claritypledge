/**
 * @file TableBanner.tsx
 * @description P1529: the head of a canvas page opened from the event room: the blue "Back to your table" row on top and, directly under it, the
 * room's running transcription bar, ONE block (the layout makes the block sticky). The block claims the bar, so the shell's own slot draws nothing
 * and the bar is on screen once. Wording is a draft: [FOUNDER DECISION: copy, proposed].
 */
import { RoomHeadCapture } from '@/app/prototypes/events/components/RoomChrome';
import { BackBanner } from './PreparationBanner';

export function TableBanner({ to, eventId }: { to: string; eventId: string | null }) {
  return (
    <>
      <BackBanner to={to} ariaLabel="Back to your table" testId="table-banner" line="Back to your table" />
      <RoomHeadCapture eventId={eventId ?? undefined} />
    </>
  );
}
