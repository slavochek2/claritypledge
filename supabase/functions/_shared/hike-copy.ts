/**
 * @file hike-copy.ts
 * @description P1675: the hike strings that appear in both the app and the confirmation email. Founder-approved
 * wording (spec sections 2 and 3), verbatim. The client twin is src/app/prototypes/events/components/hike-copy.ts;
 * src/tests/p1675-hike-copy-parity.test.ts asserts the shared constants are identical. Constants only, no imports.
 */

export const HIKE_WHATSAPP_FREE_SEATS_LINE = "Post your free seats in the hike's WhatsApp group, so people can ride with you.";

export const HIKE_OFFLINE_MAPS_LINE = 'Before the hike, on wifi: install AllTrails and open the route from the event page, and save the area offline in Mapy.com as a backup. Bring a charged phone, and a power bank if you have one.';

export const HIKE_ROLE_LEAD = 'You set the pace at the front and wait at every junction until the sweep catches up. If someone wants to go faster, let them go; just ask them to have the route on their phone.';

export const HIKE_ROLE_SWEEP = "You walk behind the last person, so nobody is left alone at the back. Let someone stay behind alone only if they clearly have water, the map on their phone, and know the way back. If you're not sure, stay with them or walk them back to the group at an easy pace.";

export const HIKE_ROLE_WELCOMER = 'You greet people as they arrive at the meeting point, so nobody stands around lost.';

export const HIKE_ROLE_TRANSPORT_LEAD = "You help people who need a ride get there together. In the hike's WhatsApp group, say you're the transport lead and ask who wants a seat. Agree a price with a driver (ask whether waiting all day or coming back at the end is cheaper), post the pickup point, time and price in the group, and collect the money for both ways before anyone gets in. Slava sends you driver numbers if you need them.";
