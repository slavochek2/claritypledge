/**
 * @file HikeQuestionsFields.tsx
 * @description P1675 UAT round 1 R6: per-event setup on Edit event for a hike: which optional questions the form asks before
 * the seat. The "when" question is always asked and has no checkbox. Shown on Edit event for hikes only (a host cannot set
 * series_slug on create, so a Create-form event is never a hike); same visual pattern as PrepSettingsFields. Words: hike-copy.ts (founder text).
 */
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { HIKE_ASKS_HELP_LABEL, HIKE_ASKS_TRANSPORT_LABEL, HIKE_QUESTIONS_HEADING } from '../components/hike-copy';

export function HikeQuestionsFields({
  asksTransport,
  onAsksTransportChange,
  asksHelp,
  onAsksHelpChange,
}: {
  asksTransport: boolean;
  onAsksTransportChange: (on: boolean) => void;
  asksHelp: boolean;
  onAsksHelpChange: (on: boolean) => void;
}) {
  return (
    <fieldset className="m-0 min-w-0 space-y-3 border-0 p-0" data-testid="hike-questions-settings">
      <legend className="p-0 text-sm font-medium">{HIKE_QUESTIONS_HEADING}</legend>
      <div className="flex items-center gap-3">
        <Checkbox
          id="hikeAsksTransport"
          checked={asksTransport}
          onCheckedChange={(v) => onAsksTransportChange(v === true)}
          data-testid="hike-asks-transport"
        />
        <Label htmlFor="hikeAsksTransport" className="min-h-10 flex-1 cursor-pointer items-center flex">{HIKE_ASKS_TRANSPORT_LABEL}</Label>
      </div>
      <div className="flex items-center gap-3">
        <Checkbox
          id="hikeAsksHelp"
          checked={asksHelp}
          onCheckedChange={(v) => onAsksHelpChange(v === true)}
          data-testid="hike-asks-help"
        />
        <Label htmlFor="hikeAsksHelp" className="min-h-10 flex-1 cursor-pointer items-center flex">{HIKE_ASKS_HELP_LABEL}</Label>
      </div>
    </fieldset>
  );
}
