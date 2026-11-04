/**
 * @file org-auto-join.ts
 * @description What the sign-up callback does just before auto-joining a group: P1549 moves this browser's learning
 * parts to the account (a failure never blocks the join), and P1076 reads who invited the person.
 */
import { isValidUUID } from '@/lib/auth-gate-utils';
import { moveLocalPrepPartsToAccount } from '@/app/prototypes/events/prep/prep-local-parts';

export async function prepareOrgAutoJoin(profileId: string, joinQuery: string | undefined): Promise<string | undefined> {
  await moveLocalPrepPartsToAccount(profileId);
  const rawFrom = new URLSearchParams(joinQuery ?? '').get('from');
  return rawFrom && isValidUUID(rawFrom) ? rawFrom : undefined;
}
