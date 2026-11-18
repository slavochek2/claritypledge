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

// UAT round 1 (founder, R2 and R4): the ride line, the role labels and the heading suffix ("Sweep: what you'll do").
export const HIKE_NEED_RIDE_LINE = "After you register, you'll get the hike's WhatsApp group. Rides are arranged there.";

export const HIKE_ROLE_HEADING_SUFFIX = ": what you'll do";

export const HIKE_ROLE_LABEL_LEAD = 'Lead';

export const HIKE_ROLE_LABEL_SWEEP = 'Sweep';

export const HIKE_ROLE_LABEL_WELCOMER = 'Welcomer';

export const HIKE_ROLE_LABEL_TRANSPORT_LEAD = 'Transport lead';

// UAT round 1 R7, builder's wording (no founder text was given for the link's label): the line above the group chat link.
export const HIKE_GROUP_CHAT_LINE = "Join the hike's WhatsApp group:";

export const HIKE_ROLE_TRANSPORT_LEAD = "You help people who need a ride get there together. In the hike's WhatsApp group, say you're the transport lead and ask who wants a seat. Agree a price with a driver (ask whether waiting all day or coming back at the end is cheaper), post the pickup point, time and price in the group, and collect the money for both ways before anyone gets in. Slava sends you driver numbers if you need them.";

// ─── Client-only: the registration form (P1675, sections 1 to 3b). Spec text verbatim; lines marked PROPOSED are not in the spec. ───

/** UAT round 1 R1 (founder): the lead line carries no minutes; they stay in the "now" option. */
export const HIKE_LEAD_LINE = 'Everyone does a short introduction first. We believe a few shared words and habits make every relationship better, at work and at home, and our community exists to spread them.';
/** Founder (UAT round 3): say plainly it is required; shown in bold. */
export const HIKE_REQUIRED_LINE = "It's required to join.";
export const HIKE_LEAD_QUESTION = 'When will you do it?';
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

/** UAT round 1 R3 (founder): the question, the line under it, and the default option (stored as no help role). */
export const HIKE_HELP_QUESTION = 'How would you like to take part?';
export const HIKE_HELP_LINE = 'This is a social, non-commercial hike: nobody is paid, so a few of us help run it.';
export const HIKE_JUST_ATTEND_OPTION = 'Participant';
export const HIKE_HELP_OPTIONS = [
  { value: 'lead', label: HIKE_ROLE_LABEL_LEAD },
  { value: 'sweep', label: HIKE_ROLE_LABEL_SWEEP },
  { value: 'welcomer', label: HIKE_ROLE_LABEL_WELCOMER },
  { value: 'transport_lead', label: HIKE_ROLE_LABEL_TRANSPORT_LEAD },
  { value: 'other', label: 'Other' },
] as const;
/** R4: the heading above a chosen role's text, e.g. "Sweep: what you'll do". */
export const hikeRoleHeading = (label: string): string => `${label}${HIKE_ROLE_HEADING_SUFFIX}`;

/** R18: the host's one "before the seat" choice on Edit event (hikes only), labels in the order of the preset values. */
export const HIKE_REGISTRATION_HEADING = 'Before the seat';
export const HIKE_REGISTRATION_OPTIONS = [
  { value: 'optional', label: 'Introduction optional: one tap' },
  { value: 'when', label: 'Introduction required: ask when only' },
  { value: 'when_transport', label: "Introduction required: ask when and how they're coming" },
  { value: 'all', label: 'Introduction required: ask all questions' },
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

// ─── Client-only: the plan page and confirmation line of a hike that asks the questions (P1675 R13, R14) ───

/** R13: the plan page's title on a hike that asks the questions. */
export const HIKE_PLAN_TITLE = 'Your short introduction';
/** R13: the line under it, brand-new person ("About 15 minutes.", the number is the recipe's statedMinutes). */
export const hikePlanLineNew = (stated: number): string => `About ${stated} minutes.`;
/** R13: the line under it, anyone else (N is the R10 number). */
export const hikePlanLineReturning = (n: number): string => `About ${n} minutes left: you've done part of it before.`;
/** R14: the confirmation page's line, before the event's start minus 24 hours (the reminder is still to come) and after it. */
export const HIKE_REQUIRED_REMINDER = "Required for this hike. We'll remind you by email.";
export const HIKE_REQUIRED = 'Required for this hike.';
/** R14: the 24-hour reminder's lead time. */
export const HIKE_REMINDER_LEAD_MS = 24 * 3600 * 1000;

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
/** R6: an answer that is not stored, or a question the event does not ask. */
export const HIKE_HOST_DASH = '—';
/** R6/R16: help NULL ("Participant", the first help option) on an event that asks the help question. */
export const HIKE_HOST_PARTICIPANT = 'Participant';
/** UAT round 3 R17: the host's roles count line, "Roles: 1 Lead · 2 Welcomers · 12 Participants". "Other" never pluralizes. */
export const HIKE_ROLES_PREFIX = 'Roles: ';
export const HIKE_ROLES_SEPARATOR = ' · ';
export const HIKE_ROLE_PLURALS = {
  lead: 'Leads',
  sweep: 'Sweeps',
  welcomer: 'Welcomers',
  transport_lead: 'Transport leads',
  other: 'Other',
  participant: 'Participants',
} as const;
