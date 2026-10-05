/**
 * The invitation a visitor forwards to the person who could host a pilot, when they
 * cannot invite the people in the conversation themselves.
 *
 * It carries no topic. The visitor may have typed a description of their stuck
 * conversation a moment earlier (the pilot form sits one Back away), and forwarding must
 * not leak it: the link is built from the origin and a fixed path only, and the message
 * is a fixed proposal line. The pilot draft is accepted as an argument precisely so the
 * test can hand it a topic and prove none of it comes out.
 */
import { PROPOSALS } from "./copy";

/** Where a forwarded invitation lands: the start of this journey. */
export const INVITE_PATH = "/tree/landing-first";

export interface PilotDraft {
  conversation: string;
  roles: string;
  contact: string;
  size: string;
}

export const EMPTY_PILOT: PilotDraft = { conversation: "", roles: "", contact: "", size: "" };

export interface HostInvite {
  url: string;
  text: string;
}

export function composeHostInvite(origin: string, _draft?: PilotDraft): HostInvite {
  const url = new URL(INVITE_PATH, origin).toString();
  return { url, text: `${PROPOSALS.inviteMessage}\n${url}` };
}

export type InviteOutcome = "shared" | "copied" | "cancelled" | "failed";

/**
 * Hands the invitation to the system share sheet where there is one, else copies it.
 * "shared" and "copied" are completed actions; a cancelled share sheet is not.
 */
export async function sendInvite(text: string, nav: Navigator = navigator): Promise<InviteOutcome> {
  if (typeof nav.share === "function") {
    try {
      await nav.share({ text });
      return "shared";
    } catch (error) {
      return error instanceof DOMException && error.name === "AbortError" ? "cancelled" : "failed";
    }
  }
  try {
    await nav.clipboard.writeText(text);
    return "copied";
  } catch {
    return "failed";
  }
}

export function canShare(nav: Navigator = navigator): boolean {
  return typeof nav.share === "function";
}
