/**
 * The optional columns an event insert writes (P1603 is_hidden, P1336 preparation_enabled / statement_tag, P1529 E1
 * canvas_timing). A key the form left undefined is absent, so the column default applies. Lives here so
 * events-service-real.ts (over the P1566 size limit) does not grow.
 */
import type { CreateEventInput } from './events-service.interface';

export function eventOptionalCreateColumns(data: CreateEventInput): Record<string, unknown> {
  return {
    is_hidden: data.isHidden === true,
    ...(data.canvasTiming !== undefined ? { canvas_timing: data.canvasTiming } : {}),
    ...(data.preparationEnabled !== undefined ? { preparation_enabled: data.preparationEnabled } : {}),
    ...(data.statementTag !== undefined ? { statement_tag: data.statementTag || null } : {}),
  };
}
