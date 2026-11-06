/**
 * @file contact-code-service.ts
 * @description P1556: personal contact codes and exact-handle lookup. Every rule is on the server
 * (supabase/migrations/20261106100000_p1556_contact_codes.sql); this file only calls it and names the outcomes.
 */
import { supabase } from "@/lib/supabase";
import { normalizeHandleQuery } from "./contact-code-utils";

export {
  contactCodeUrl,
  normalizeHandleQuery,
  CONTACT_CODE_PATH,
} from "./contact-code-utils";

export interface CodeOwner {
  name: string;
  avatarUrl: string | null;
  avatarColor: string | null;
}

export interface HandleMatch {
  id: string;
  name: string;
  slug: string;
  avatarUrl: string | null;
  avatarColor: string | null;
  canMessage: boolean;
}

/** Why opening a code did not start a chat. `unavailable` covers bad, reset and blocked alike, on purpose. */
export type RedeemFailure = "own-code" | "paused" | "too-many" | "unavailable";

export type RedeemResult =
  { ok: true; conversationId: string } | { ok: false; reason: RedeemFailure };

/** The caller's own token, created on first use. */
export async function getMyContactCode(): Promise<string> {
  const { data, error } = await supabase.rpc("get_my_contact_code");
  if (error || typeof data !== "string")
    throw new Error(
      `contact code read failed: ${error?.message ?? "no token"}`,
    );
  return data;
}

/** Replaces the caller's token; every old link stops working. Returns the new token. */
export async function resetMyContactCode(): Promise<string> {
  const { data, error } = await supabase.rpc("reset_my_contact_code");
  if (error || typeof data !== "string")
    throw new Error(
      `contact code reset failed: ${error?.message ?? "no token"}`,
    );
  return data;
}

/** Who a code belongs to (name and photo only), or null when the code does not work. Works signed out. */
export async function lookupContactCode(
  token: string,
): Promise<CodeOwner | null> {
  const { data, error } = await supabase.rpc("lookup_contact_code", {
    p_token: token,
  });
  if (error) throw new Error(`contact code lookup failed: ${error.message}`);
  const row = (
    data as Array<{
      name: string;
      avatar_url: string | null;
      avatar_color: string | null;
    }> | null
  )?.[0];
  return row
    ? {
        name: row.name,
        avatarUrl: row.avatar_url,
        avatarColor: row.avatar_color,
      }
    : null;
}

/** Maps the server's refusal to an outcome. Exported for the test; the text is the function's contract. */
export function redeemFailureFrom(message: string): RedeemFailure | null {
  if (message.includes("contact code: own code")) return "own-code";
  if (message.includes("contact code: paused")) return "paused";
  if (message.includes("too many new conversations today")) return "too-many";
  if (message.includes("contact code: not available")) return "unavailable";
  // Anything else (a timeout, a deadlock, a PostgREST fault) is not a refusal: the caller offers Try again.
  return null;
}

/** Starts or reopens the 1:1 with the code's owner. A network failure throws; a refusal is a result. */
export async function redeemContactCode(token: string): Promise<RedeemResult> {
  const { data, error } = await supabase.rpc("redeem_contact_code", {
    p_token: token,
  });
  if (error) {
    // A documented refusal is a result; anything else (network, timeout, server fault) throws, so the page offers
    // Try again instead of claiming the code no longer works.
    const reason = redeemFailureFrom(error.message);
    if (!reason) throw new Error(`contact code redeem failed: ${error.message}`);
    return { ok: false, reason };
  }
  if (typeof data !== "string") return { ok: false, reason: "unavailable" };
  return { ok: true, conversationId: data };
}

/** Whether the signed-in user may message this person now (an existing 1:1 or a shared connection, no block). */
export async function canMessageProfile(profileId: string): Promise<boolean> {
  const { data, error } = await supabase.rpc("can_message_profile", {
    p_other: profileId,
  });
  if (error) throw new Error(`can-message check failed: ${error.message}`);
  return data === true;
}

/** The one person whose handle is exactly what was typed (case-insensitive), or null. */
export async function findProfileByHandle(
  query: string,
): Promise<HandleMatch | null> {
  const handle = normalizeHandleQuery(query);
  if (!handle) return null;
  const { data, error } = await supabase.rpc("find_profile_by_handle", {
    p_handle: handle,
  });
  if (error) throw new Error(`handle lookup failed: ${error.message}`);
  const row = (
    data as Array<{
      id: string;
      name: string;
      slug: string;
      avatar_url: string | null;
      avatar_color: string | null;
      can_message: boolean;
    }> | null
  )?.[0];
  return row
    ? {
        id: row.id,
        name: row.name,
        slug: row.slug,
        avatarUrl: row.avatar_url,
        avatarColor: row.avatar_color,
        canMessage: row.can_message === true,
      }
    : null;
}
