#!/usr/bin/env node
/**
 * P1155 — send one alert message to the ops mailbox, via Mailgun's HTTP API.
 *
 * This replaced a hand-rolled raw-SMTP client. That client produced two real defects
 * in a single session — it read a mid-reply continuation line as a complete response
 * (intermittent, network-dependent), and it could never reach its own QUIT branch —
 * and it carried SMTP's whole content surface: dot-stuffing, 998-octet line limits,
 * CRLF normalization, charset declaration. None of that exists here: the API takes
 * structured fields over HTTPS.
 *
 * The repo already speaks Mailgun in five edge functions
 * (supabase/functions/_shared/email-helpers.ts), so this is reuse, not a new dependency.
 *
 * CREDENTIAL. In CI this reads MAILGUN_SENDING_KEY — a dedicated, domain-scoped,
 * independently revocable Mailgun sending key. It deliberately does NOT read
 * MAILGUN_API_KEY, which is the account key and is enrolled in P1239's locked half
 * (keychain, human dialog on every read). Locked credentials do not go into CI: CI has
 * no human to answer the dialog, so exporting one removes the control rather than
 * widening it. Locally, where a human IS present, the keyring path is used so a real
 * send can be exercised.
 */

export class SendError extends Error {}

const MAILGUN_BASE = process.env.MAILGUN_BASE
  || (process.env.MAILGUN_REGION === 'eu' ? 'https://api.eu.mailgun.net/v3' : 'https://api.mailgun.net/v3');

/** No CR or LF in a header-like field. Mailgun would reject or normalize it, but an
 *  issue title is not fully trusted and this keeps the refusal ours and explicit. */
export function assertHeaderSafe(name, value) {
  if (/[\r\n]/.test(value)) throw new SendError(`header ${name} contains CR/LF: refusing to send`);
  return value;
}

export async function credentials() {
  const domain = process.env.MAILGUN_DOMAIN;
  if (!domain) throw new SendError('MAILGUN_DOMAIN is not set');

  if (process.env.MAILGUN_SENDING_KEY) {
    return { domain, key: process.env.MAILGUN_SENDING_KEY };
  }
  if (process.env.CI) {
    throw new SendError(
      'MAILGUN_SENDING_KEY is not set. CI must use a dedicated domain-scoped sending key; ' +
      'MAILGUN_API_KEY is the account key and is in the locked half (P1239) — it must not ' +
      'be placed in CI secrets.');
  }
  const { keyringGet } = await import('./lib/keyring.mjs');
  return { domain, key: keyringGet('MAILGUN_API_KEY') };
}

/**
 * @returns {Promise<string>} the Mailgun message id, or SENT_NO_ID when the API
 *   accepted the message without returning one.
 */
export const SENT_NO_ID = 'sent-no-id';

export async function sendOpsEmail({ subject, body, to = process.env.OPS_EMAIL }) {
  if (!to) throw new SendError('no recipient: set OPS_EMAIL');
  const { domain, key } = await credentials();
  assertHeaderSafe('subject', subject);
  assertHeaderSafe('to', to);

  const form = new FormData();
  form.append('from', `Clarity Pledge Ops <ops-alerts@${domain}>`);
  form.append('to', to);
  form.append('subject', subject);
  form.append('text', body);
  form.append('o:tag', 'p1155-alert-escalator');

  let res;
  try {
    res = await fetch(`${MAILGUN_BASE}/${domain}/messages`, {
      method: 'POST',
      // Never logged. Constructed inline and passed straight to fetch, mirroring the
      // edge functions. GitHub masks only the verbatim secret, so a base64 re-encoding
      // would NOT be masked if it were ever printed.
      headers: { Authorization: `Basic ${Buffer.from(`api:${key}`).toString('base64')}` },
      body: form,
    });
  } catch (err) {
    // Network-level failure. Report host and cause, never the credential.
    throw new SendError(`Mailgun request to ${MAILGUN_BASE} failed: ${err.cause?.code || err.message}`);
  }

  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    // Name the BASE and the DOMAIN, not just the status. Mailgun is region-split, and
    // a 401 from the wrong region is indistinguishable from a bad credential unless the
    // message says which endpoint refused. That ambiguity cost a long debugging detour:
    // the US endpoint reports "domain not found" for an EU domain that is live, so the
    // symptom points at the domain rather than at the region.
    throw new SendError(
      `Mailgun ${res.status} from ${MAILGUN_BASE}/${domain} ` +
      `(region=${process.env.MAILGUN_REGION || 'unset->us'}): ${detail.slice(0, 200)}`);
  }

  // P1256, learned the hard way in this repo: a 2xx WITHOUT an id is a SENT email.
  // Reporting it as not-sent gets the message retried, i.e. duplicated.
  const json = await res.json().catch(() => ({}));
  return json.id ?? SENT_NO_ID;
}
