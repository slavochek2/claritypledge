/**
 * The columns an event edit writes: the camelCase fields the form changed, mapped to their snake_case columns. A key
 * the caller did not pass is absent, so an edit never touches a column it did not mention. Lives here so
 * events-service-real.ts (over the P1566 size limit) does not grow.
 */
import type { UpdateEventInput } from './events-service.interface';

export function eventUpdateColumns(data: UpdateEventInput): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  if (data.title !== undefined) out.title = data.title;
  if (data.description !== undefined) out.description = data.description;
  if (data.datetime !== undefined) out.datetime = data.datetime;
  if (data.durationMinutes !== undefined) out.duration_minutes = data.durationMinutes;
  if (data.timezone !== undefined) out.timezone = data.timezone;
  if (data.location !== undefined) out.location = data.location;
  if (data.maxAttendees !== undefined) out.max_attendees = data.maxAttendees;
  if ('bannerUrl' in data) out.banner_url = data.bannerUrl ?? null;
  if (data.preparationEnabled !== undefined) out.preparation_enabled = data.preparationEnabled; // P1336
  if (data.statementTag !== undefined) out.statement_tag = data.statementTag || null; // P1336
  // P1603: [FOUNDER DECISION: label "Hidden event", helper "Only people with the link can see it. It won't appear in
  // event lists."] The slug is NOT changed when an existing event is switched to hidden: links already sent keep working.
  if (data.isHidden !== undefined) out.is_hidden = data.isHidden;
  return out;
}
