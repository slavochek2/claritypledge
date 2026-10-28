import { EXCHANGE_COPY } from "./hospitals-exchange";

/** Who is in the chat. The hospital cast is the default; /change-managers passes TEAM_CAST. */
export type ExchangeCast = { other: string; otherRole: string; meLabel: string; intro: string; close: string; viewEvent: string; surface: string; avatars: { other: string; me: string } };
export const HOSPITAL_CAST: ExchangeCast = {
  other: "Dr. Mai",
  otherRole: "Ward doctor",
  meLabel: "Nurse",
  intro: `The nurse sends Dr. Mai a voice message explaining something.`,
  close: EXCHANGE_COPY.close,
  viewEvent: "hospitals_exchange_viewed",
  surface: "hospitals-exchange",
  // Illustrated, not photographs: generic colleagues, nobody real.
  avatars: { other: "/hospitals/colleague-a.jpg", me: "/hospitals/colleague-b.jpg" },
};
export const TEAM_CAST: ExchangeCast = {
  other: "Sam",
  otherRole: "Teammate",
  meLabel: "You",
  intro: "You send Sam a voice message explaining something.",
  close: "To close it, Sam explains back what they understood and you correct. Or move on if the stakes are low.",
  viewEvent: "change_managers_exchange_viewed",
  surface: "change-managers-exchange",
  avatars: { other: "/change-managers/teammate-a.jpg", me: "/change-managers/teammate-b.jpg" },
};
