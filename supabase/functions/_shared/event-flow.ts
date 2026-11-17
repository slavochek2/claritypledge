/**
 * @file event-flow.ts
 * @description P1675: the flow an event runs, resolved one way for every email module. A leaf with no imports so both
 * series-email-block.ts and mastermind-prep-email.ts can use it without an import cycle between them.
 */
export interface FlowColumns {
  flow?: string | null;
  series_slug?: string | null;
}

/** The flow's own column wins; an event without it takes its series' flow for the two known series, else a Clarity Night. */
export function eventFlow(event: FlowColumns): string {
  return event.flow ?? (['social-hike', 'sales-mastermind'].includes(event.series_slug ?? '') ? (event.series_slug as string) : 'clarity-night');
}

export const isHike = (event: FlowColumns): boolean => eventFlow(event) === 'social-hike';
