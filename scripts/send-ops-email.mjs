#!/usr/bin/env node
/**
 * P1155 — minimal SMTP send to the ops mailbox. Zero dependencies, raw TLS,
 * mirroring scripts/read-ops-email.mjs's socket handling.
 *
 * CREDENTIAL — read this before wiring anything up.
 *
 * This does NOT use OPS_EMAIL_PASSWORD. That credential is in P1239's locked half:
 * a macOS keychain item trusting no application, so every read costs a human dialog,
 * because it is a full mailbox password whose loss rotation cannot undo. Copying it
 * into GitHub Actions secrets would delete that control, not merely widen it — CI has
 * no human to answer the dialog, and any workflow in the repo could then read it.
 *
 * So the CI path uses OPS_SMTP_PASSWORD: a SEPARATE, send-only credential that must be
 * provisioned for this purpose. If it is absent, this throws. It does not fall back to
 * the locked credential, and it must never be taught to.
 *
 * Locally (interactive, a human present) the keyring path is used instead, so a
 * developer can exercise a real send without a second credential existing yet.
 *
 * SMTP content rules that IMAP never faced — the precedent script is no guide here:
 *   - dot-stuffing (RFC 5321 §4.5.2): a body line that is just "." ends DATA early.
 *     Issue titles and agent-authored text routinely contain code and diffs.
 *   - line length: 1000 octets including CRLF.
 *   - bare LF must become CRLF.
 *   - non-ASCII needs a declared charset.
 */
import tls from 'node:tls';

// Overridable ONLY so the failure path can be exercised against a dead port without
// hammering the real mail server with failed auths (gate 7 requires watching it fail).
// Defaults are the real values; nothing in CI or prod sets these.
const HOST = process.env.OPS_SMTP_HOST || 'w00dd4f1.kasserver.com';
const PORT = Number(process.env.OPS_SMTP_PORT || 465);   // SMTPS. 587 is filtered locally.
const MAX_LINE_OCTETS = 998;      // 1000 minus CRLF

export class SendError extends Error {}

/** RFC 5321 §4.5.2 — a leading "." on any body line is doubled, so a lone "." cannot
 *  terminate DATA. Without this a fenced code block or diff silently truncates the
 *  message, or worse, what follows is parsed as SMTP commands on the authed session. */
export function dotStuff(body) {
  return body.split('\n').map((line) => (line.startsWith('.') ? '.' + line : line)).join('\n');
}

/** Bare LF -> CRLF. Never double an existing CRLF. */
export function normalizeEol(text) {
  return text.replace(/\r\n/g, '\n').replace(/\n/g, '\r\n');
}

/** Hard-wrap any line over the octet limit rather than emitting an illegal one. */
export function foldLongLines(body, limit = MAX_LINE_OCTETS) {
  const out = [];
  for (const line of body.split('\n')) {
    let rest = Buffer.from(line, 'utf8');
    if (rest.length <= limit) { out.push(line); continue; }
    while (rest.length > limit) {
      let cut = limit;
      // Do not split a UTF-8 sequence: back off to a lead byte.
      while (cut > 0 && (rest[cut] & 0xc0) === 0x80) cut--;
      out.push(rest.subarray(0, cut).toString('utf8'));
      rest = rest.subarray(cut);
    }
    if (rest.length) out.push(rest.toString('utf8'));
  }
  return out.join('\n');
}

/** No CR or LF may reach a header field, or a crafted value smuggles extra headers. */
export function assertHeaderSafe(name, value) {
  if (/[\r\n]/.test(value)) throw new SendError(`header ${name} contains CR/LF: refusing to send`);
  return value;
}

export function buildMessage({ from, to, subject, body, date = new Date() }) {
  assertHeaderSafe('From', from);
  assertHeaderSafe('To', to);
  assertHeaderSafe('Subject', subject);
  const headers = [
    `From: ${from}`,
    `To: ${to}`,
    `Subject: ${subject}`,
    `Date: ${date.toUTCString()}`,
    'MIME-Version: 1.0',
    'Content-Type: text/plain; charset=utf-8',
    'Content-Transfer-Encoding: 8bit',
    'Auto-Submitted: auto-generated',   // so mail rules can spot it as machine-sent
  ].join('\n');
  const safeBody = dotStuff(foldLongLines(body));
  return normalizeEol(`${headers}\n\n${safeBody}`);
}

async function credentials() {
  const user = process.env.OPS_EMAIL;
  if (!user) throw new SendError('OPS_EMAIL is not set');
  // CI: a dedicated send-only credential. Never the locked mailbox password.
  if (process.env.OPS_SMTP_PASSWORD) return { user, pass: process.env.OPS_SMTP_PASSWORD };
  if (process.env.CI) {
    throw new SendError(
      'OPS_SMTP_PASSWORD is not set. CI must use a dedicated send-only credential; ' +
      'OPS_EMAIL_PASSWORD is in the locked half (P1239) and must not be placed in CI secrets.');
  }
  const { keyringGet } = await import('./lib/keyring.mjs');
  return { user, pass: keyringGet('OPS_EMAIL_PASSWORD') };
}

export async function sendOpsEmail({ subject, body, to = process.env.OPS_EMAIL }) {
  const { user, pass } = await credentials();
  const message = buildMessage({ from: user, to: to || user, subject, body });

  return new Promise((resolve, reject) => {
    // servername must be a hostname; node rejects an IP literal outright.
    const isIp = /^\d{1,3}(\.\d{1,3}){3}$/.test(HOST) || HOST.includes(':');
    const socket = tls.connect({ host: HOST, port: PORT, ...(isIp ? {} : { servername: HOST }) });
    let buf = '';
    const steps = [
      { expect: 220, send: `EHLO claritypledge.com` },
      { expect: 250, send: 'AUTH LOGIN' },
      { expect: 334, send: Buffer.from(user).toString('base64'), secret: false },
      // The credential line is written straight to the socket and never logged,
      // mirroring read-ops-email.mjs. GitHub masks only the verbatim secret, so a
      // base64 re-encoding would NOT be masked if it were ever printed.
      { expect: 334, send: Buffer.from(pass).toString('base64'), secret: true },
      { expect: 235, send: `MAIL FROM:<${user}>` },
      { expect: 250, send: `RCPT TO:<${to || user}>` },
      { expect: 250, send: 'DATA' },
      { expect: 354, send: `${message}\r\n.`, secret: false },
      { expect: 250, send: null },   // final 250: message queued; QUIT is sent below
    ];
    let i = 0;
    const fail = (msg) => { socket.destroy(); reject(new SendError(msg)); };

    socket.setTimeout(20_000, () => fail('SMTP timeout'));
    // ECONNREFUSED and friends carry `code` with an empty `message`; printing only
    // the message yields "SMTP socket error: " and tells a 3am reader nothing.
    socket.on('error', (e) =>
      fail(`SMTP socket error connecting to ${HOST}:${PORT}: ${e.code || e.message || e}`));
    socket.on('data', (chunk) => {
      // Past the last step the exchange is settled; the server's 221 reply to QUIT
      // still arrives and must not be dispatched against steps[i] (which is undefined).
      if (i >= steps.length) return;
      buf += chunk.toString('utf8');
      if (!/\r\n$/.test(buf)) return;
      const lines = buf.trim().split('\r\n');
      const last = lines[lines.length - 1];
      // RFC 5321 §4.2: a multi-line reply marks continuation with "250-" and the FINAL
      // line with "250 " (space). EHLO's reply is always multi-line. Treating any
      // CRLF-terminated buffer as complete means a reply split across TCP segments —
      // routine on a real network — is read as finished at its first continuation line,
      // and the next command goes out early. That failure is intermittent and
      // environment-dependent: it passes against a fast local server every time.
      // Proven by scripts/test-smtp-handshake.mjs's split-EHLO case, which failed here
      // before this check existed.
      if (!/^\d{3} /.test(last)) return;   // continuation — wait for the final line
      buf = '';
      const code = parseInt(last.slice(0, 3), 10);
      const step = steps[i];
      if (code !== step.expect) {
        // Never echo the step payload — for the AUTH steps it is the credential.
        return fail(`SMTP step ${i} expected ${step.expect}, got ${code}: ${last}`);
      }
      i++;
      if (i >= steps.length) {
        // Final 250 seen: the message is queued. Say QUIT properly rather than
        // dropping the connection — the previous code could never reach its own
        // QUIT branch, so it always half-closed instead.
        socket.write('QUIT\r\n');
        socket.end();
        return resolve(true);
      }
      socket.write(`${steps[i - 1].send}\r\n`);
    });
    socket.on('close', () => { if (i < steps.length) fail(`SMTP closed after step ${i}`); });
  });
}
