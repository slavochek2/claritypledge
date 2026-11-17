/**
 * @file hike-copy.ts
 * @description P1675: hike strings shared with the confirmation email (constants only). The edge-function twin is
 * supabase/functions/_shared/hike-copy.ts; src/tests/p1675-hike-copy-parity.test.ts keeps the shared constants identical.
 * Client-only form strings may be added below the shared block.
 */

export const HIKE_WHATSAPP_FREE_SEATS_LINE = "Post your free seats in the hike's WhatsApp group, so people can ride with you.";

export const HIKE_OFFLINE_MAPS_LINE = 'Before the hike, on wifi: install AllTrails and open the route from the event page, and save the area offline in Mapy.com as a backup. Bring a charged phone, and a power bank if you have one.';

export const HIKE_ROLE_LEAD = 'You set the pace at the front and wait at every junction until the sweep catches up. If someone wants to go faster, let them go; just ask them to have the route on their phone.';

export const HIKE_ROLE_SWEEP = "You walk behind the last person, so nobody is left alone at the back. Let someone stay behind alone only if they clearly have water, the map on their phone, and know the way back. If you're not sure, stay with them or walk them back to the group at an easy pace.";

export const HIKE_ROLE_WELCOMER = 'You greet people as they arrive at the meeting point, so nobody stands around lost.';

export const HIKE_ROLE_TRANSPORT_LEAD = "You help people who need a ride get there together. In the hike's WhatsApp group, say you're the transport lead and ask who wants a seat. Agree a price with a driver (ask whether waiting all day or coming back at the end is cheaper), post the pickup point, time and price in the group, and collect the money for both ways before anyone gets in. Slava sends you driver numbers if you need them.";

// ─── Client-only: the registration form (P1675, sections 1 to 3b). Spec text verbatim; lines marked PROPOSED are not in the spec. ───

/** The lead line. N is the hike introduction's computed length, never a literal. */
export const hikeLeadLine = (minutes: string): string =>
  `This hike is for people who take ${minutes} minutes to learn a few shared words first, so we can have better conversations on the trail. When will you do it?`;
export const hikeNowOption = (minutes: string): string => `I have ${minutes} minutes, I'll do it now`;
export const HIKE_LATER_OPTION = "I'll do it later, remind me by email";

export const HIKE_TRANSPORT_QUESTION = 'How are you coming?';
export const HIKE_TRANSPORT_OPTIONS = [
  { value: 'car', label: 'Car' },
  { value: 'motorbike', label: 'Motorbike' },
  { value: 'bike_or_foot', label: 'Bicycle or on foot' },
  { value: 'need_ride', label: 'I need a ride' },
] as const;
/** PROPOSED: the spec names the free-seats answer but not its question. */
export const HIKE_FREE_SEATS_QUESTION = 'How many free seats do you have?';

export const HIKE_HELP_QUESTION = 'How would you like to help?';
export const HIKE_HELP_OPTIONS = [
  { value: 'lead', label: 'Lead' },
  { value: 'sweep', label: 'Sweep' },
  { value: 'welcomer', label: 'Welcomer' },
  { value: 'transport_lead', label: 'Transport lead' },
  { value: 'other', label: 'Other' },
] as const;
export const HIKE_HELP_OTHER_PLACEHOLDER = 'For example: dog food for the trail dogs, sweets to share, a bag to collect rubbish on the way';

export const HIKE_PRIVACY_LINE = 'Only you and the host see these answers.';

/** PROPOSED (the spec asks for a short notice, not its words): shown when the server refused "later" inside 24 hours. */
export const HIKE_NOW_ONLY_NOTICE = 'The hike is less than 24 hours away, so the introduction has to be done now.';
/** PROPOSED: the lines a try with answers missing marks, one per question. */
export const HIKE_MISSING = {
  when: 'Choose when you will do it.',
  transport: 'Choose how you are coming.',
  seats: 'Say how many free seats you have, from 0 to 20.',
  other: 'Say how you would like to help, in a few words.',
} as const;
export const HIKE_CLOSED_UNFINISHED = "You're not registered yet.";

// ─── Client-only: the host's answers line and the room's count line (P1675, sections 3b and 6) ───

/** Founder wording (2026-11-17): the count-only line under the room roster. */
export const hikeNotHereLine = (n: number): string => `and ${n} registered, not here yet`;

/** PROPOSED (founder decision): the host's one-line summary of a registrant's answers. */
export const HIKE_HOST_WHEN = { now: 'Now', later: 'Later' } as const;
/** PROPOSED (founder decision): the host line's short form of "I need a ride". */
export const HIKE_HOST_NEEDS_RIDE = 'Needs a ride';
/** PROPOSED (founder decision): seats in the host line. */
export const hikeHostSeats = (n: number): string => `${n} free seat${n === 1 ? '' : 's'}`;
/** PROPOSED (founder decision): prefix of the Other text in the host line. */
export const HIKE_HOST_OTHER_PREFIX = 'Other: ';
