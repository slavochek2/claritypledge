/**
 * @file EventFlowRow.tsx
 * @description P1529 D8, §1: "Event flow: {flow}" at the top of the host screen's controls, until the first counted round
 * starts. Choosing applies at once through host_set_event_flow, with an Undo line and no Apply button. Any refusal is the
 * server's own message, shown in a visible line, never swallowed. Shown on every flow: it is how a host switches into the
 * mastermind. The page follows the new flow through `onChanged`, with no reload.
 */
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { hostSetEventFlow } from '@/app/data/event-mastermind-service';
import { EVENT_FLOWS, type EventFlow } from '../series-recipes';
import { FLOW_NAMES, FLOW_ROW_LABEL, FLOW_UNDO, flowChangedLine, flowRefusedLine } from './mastermind-host-helpers';

type Notice = { kind: 'changed'; to: EventFlow; undoTo: EventFlow | null } | { kind: 'refused'; text: string } | null;

export function EventFlowRow({ eventId, flow, onChanged }: { eventId: string; flow: EventFlow; onChanged: (flow: EventFlow) => void }) {
  const [notice, setNotice] = useState<Notice>(null);
  const [busy, setBusy] = useState(false);

  const apply = async (next: EventFlow, undoTo: EventFlow | null) => {
    if (busy || next === flow) return;
    setBusy(true);
    try {
      await hostSetEventFlow(eventId, next);
      onChanged(next);
      setNotice({ kind: 'changed', to: next, undoTo });
    } catch (e) {
      setNotice({ kind: 'refused', text: flowRefusedLine(e instanceof Error ? e.message : 'try again') });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mb-3 border-b border-border pb-3" data-testid="host-flow-row">
      <label className="flex flex-col items-stretch gap-1 text-sm sm:flex-row sm:items-center sm:gap-2">
        <span className="shrink-0 font-medium">{FLOW_ROW_LABEL}:</span>
        <select
          className="min-h-11 w-full min-w-0 flex-1 rounded-md border border-border bg-background px-2 text-base md:text-sm"
          value={flow}
          disabled={busy}
          onChange={e => void apply(e.target.value as EventFlow, flow)}
          data-testid="host-flow-select"
        >
          {EVENT_FLOWS.map(f => (
            <option key={f} value={f}>{FLOW_NAMES[f]}</option>
          ))}
        </select>
      </label>
      {notice?.kind === 'changed' && (
        <p role="status" className="mt-2 flex flex-wrap items-center gap-x-3 text-sm text-muted-foreground" data-testid="host-flow-notice">
          {flowChangedLine(notice.to)}
          {notice.undoTo && (
            <Button type="button" variant="ghost" size="sm" className="min-h-11 min-w-11 px-3 text-blue-700" onClick={() => void apply(notice.undoTo as EventFlow, null)} data-testid="host-flow-undo">
              {FLOW_UNDO}
            </Button>
          )}
        </p>
      )}
      {notice?.kind === 'refused' && (
        <p role="alert" className="mt-2 text-sm text-red-600" data-testid="host-flow-refused">{notice.text}</p>
      )}
    </div>
  );
}
