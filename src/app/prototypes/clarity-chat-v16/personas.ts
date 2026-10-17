/**
 * @file personas.ts
 * @description P1509 v16: the contract shared by the seed script (`scripts/p1509-seed-personas.ts`) and the
 * prototype. The mock chat people (mock-data.ts `PEOPLE`) are seeded as real accounts on the Supabase TEST
 * project, one per PersonId, so every screen except the chat itself reads real rows.
 *
 * Safety (spec v16 Invariants):
 * - Only the test project. `isTestProject` gates the seed script and the persona sign-in; prod is never touched.
 * - No real email leaves. The test project's edge functions send through a live Mailgun key and their `APP_URL`
 *   falls back to the prod site (checked 2026-10-17), so persona addresses use the reserved `.invalid` TLD
 *   (RFC 2606: guaranteed undeliverable), and the prototype refuses any invite recipient that is not a persona.
 * - The tag: every row the seed creates belongs to a persona account (an email under PERSONA_DOMAIN), or is an
 *   event a persona hosts. Reset deletes only those rows, then the accounts.
 */
import type { PersonId } from './mock-data';

export const TEST_PROJECT_REF = 'gfjctyxqlwexxwsmkakq';
export const PERSONA_DOMAIN = 'p1509.invalid';
/**
 * No password lives in source. Each seed run sets a fresh random password on every persona and writes it to this
 * git-ignored file (`.local/` is in .gitignore). Only the dev server reads it: the browser asks
 * PERSONA_SESSION_ENDPOINT for a persona and receives a session, never the password
 * (persona-session-plugin.ts, `apply: 'serve'`, so it does not exist in a production build).
 */
export const PERSONA_SECRETS_PATH = '.local/p1509-personas.json';
export const PERSONA_SESSION_ENDPOINT = '/__p1509/persona-session';

export const PERSONA_IDS: PersonId[] = ['bob', 'dana', 'alice', 'carol', 'eli', 'fay', 'sam'];
export const personaEmail = (id: PersonId) => `${id}@${PERSONA_DOMAIN}`;

export function isTestProject(supabaseUrl: string | undefined): boolean {
  if (!supabaseUrl) return false;
  try {
    return new URL(supabaseUrl).hostname === `${TEST_PROJECT_REF}.supabase.co`;
  } catch {
    return false;
  }
}

/** The invite guard: true only for an exact persona address. Anything else is refused before any request is made. */
export function isSeededPersonaEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  const e = email.trim().toLowerCase();
  return PERSONA_IDS.some((id) => e === personaEmail(id));
}
