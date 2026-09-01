/**
 * P1223: the ONE sanitiser for a participant's display name inside a GCS object name.
 *
 * Imported by the browser client (src/app/data/api.ts — builds the file names) AND by the
 * gcs-signed-url edge function (decides whether a requested file name belongs to the
 * caller). The two must agree byte-for-byte or every legitimate upload gets a 403, which is
 * why this is a single module and not two copies. No Deno / DOM APIs here, by design.
 */
export function sanitizeParticipantName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}
