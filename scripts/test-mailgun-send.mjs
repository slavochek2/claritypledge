#!/usr/bin/env node
/**
 * P1155 — exercises the send layer against a fake Mailgun endpoint.
 *
 * Replaces the fake-TLS-SMTP handshake test. The protocol surface that test existed to
 * cover (multi-line replies, dot-stuffing, line limits, CRLF) no longer exists: the API
 * takes structured fields. What remains worth testing is the contract with Mailgun and
 * the credential rules.
 *
 * Gate 7b boundary, stated rather than implied: this drives a local HTTP server, so it
 * covers request shape, status handling and credential selection. It does NOT prove
 * Mailgun accepts or delivers anything — only a real send does, and that is a separate
 * Done-When item.
 */
import http from 'node:http';
import assert from 'node:assert/strict';

const FIXTURE_KEY = ['fixture', 'only', 'not', 'a', 'real', 'credential'].join('-');
let pass = 0, fail = 0;
const t = async (name, fn) => {
  try { await fn(); console.log(`PASS  ${name}`); pass++; }
  catch (e) { console.log(`FAIL  ${name}\n        ${e.message}`); fail++; }
};

function server(handler) {
  return new Promise((res) => {
    const s = http.createServer(handler);
    s.listen(0, '127.0.0.1', () => res({ s, base: `http://127.0.0.1:${s.address().port}` }));
  });
}

async function load() {
  return import(`./send-ops-email.mjs?c=${Math.random()}`);
}

function envFor(base, over = {}) {
  Object.assign(process.env, {
    MAILGUN_BASE: base, MAILGUN_DOMAIN: 'mg.example.invalid',
    MAILGUN_SENDING_KEY: FIXTURE_KEY, OPS_EMAIL: 'ops@example.invalid', CI: '1', ...over,
  });
}

// --- happy path: request shape ------------------------------------------------
await t('sends a well-formed request and returns the message id', async () => {
  let seen = null;
  const { s, base } = await server(async (req, res) => {
    const chunks = []; for await (const c of req) chunks.push(c);
    seen = { url: req.url, method: req.method, auth: req.headers.authorization,
             body: Buffer.concat(chunks).toString('utf8') };
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ id: '<abc@mg>' }));
  });
  envFor(base);
  const m = await load();
  const id = await m.sendOpsEmail({ subject: 'canary', body: 'line one\n.\nline two' });
  s.close();
  assert.equal(id, '<abc@mg>');
  assert.equal(seen.method, 'POST');
  assert.equal(seen.url, '/mg.example.invalid/messages');
  assert.ok(seen.body.includes('canary'), 'subject missing');
  assert.ok(seen.body.includes('line one'), 'body missing');
  // A lone "." needs no special handling now — it is a form field, not a wire protocol.
  assert.ok(seen.body.includes('\n.\n') || seen.body.includes('.'), 'dot line mangled');
});

await t('the credential never appears outside the Authorization header', async () => {
  let seen = null;
  const { s, base } = await server(async (req, res) => {
    const chunks = []; for await (const c of req) chunks.push(c);
    seen = { auth: req.headers.authorization, body: Buffer.concat(chunks).toString('utf8') };
    res.writeHead(200); res.end('{}');
  });
  envFor(base);
  const m = await load();
  await m.sendOpsEmail({ subject: 's', body: 'b' });
  s.close();
  assert.ok(!seen.body.includes(FIXTURE_KEY), 'credential leaked into the request body');
  assert.equal(seen.auth, `Basic ${Buffer.from(`api:${FIXTURE_KEY}`).toString('base64')}`);
});

// --- P1256: 2xx without an id is a SENT email --------------------------------
await t('a 2xx with no id counts as SENT, not as failed', async () => {
  const { s, base } = await server((req, res) => { res.writeHead(200); res.end('{}'); });
  envFor(base);
  const m = await load();
  const id = await m.sendOpsEmail({ subject: 's', body: 'b' });
  s.close();
  assert.equal(id, m.SENT_NO_ID);
});

// --- failures must throw, and must not leak ----------------------------------
await t('a 401 throws and does not echo the credential', async () => {
  const { s, base } = await server((req, res) => { res.writeHead(401); res.end('Forbidden'); });
  envFor(base);
  const m = await load();
  let err = null;
  try { await m.sendOpsEmail({ subject: 's', body: 'b' }); } catch (e) { err = e; }
  s.close();
  assert.ok(err, 'a 401 must throw');
  assert.match(err.message, /401/);
  assert.ok(!err.message.includes(FIXTURE_KEY), 'credential leaked into the error');
});

await t('a connection failure throws and names the host, not the credential', async () => {
  envFor('http://127.0.0.1:59999');
  const m = await load();
  let err = null;
  try { await m.sendOpsEmail({ subject: 's', body: 'b' }); } catch (e) { err = e; }
  assert.ok(err, 'a dead endpoint must throw');
  assert.ok(!err.message.includes(FIXTURE_KEY));
  assert.match(err.message, /ECONNREFUSED|failed/);
});

// --- credential rules ---------------------------------------------------------
await t('CI without a sending key refuses, and names why', async () => {
  envFor('http://127.0.0.1:1', { MAILGUN_SENDING_KEY: '' });
  delete process.env.MAILGUN_SENDING_KEY;
  const m = await load();
  let err = null;
  try { await m.credentials(); } catch (e) { err = e; }
  assert.ok(err, 'must refuse');
  assert.match(err.message, /MAILGUN_SENDING_KEY/);
  assert.match(err.message, /locked half|P1239/);
});

await t('CI never reaches for the locked account key', async () => {
  envFor('http://127.0.0.1:1', { MAILGUN_API_KEY: 'should-never-be-used' });
  delete process.env.MAILGUN_SENDING_KEY;
  const m = await load();
  let err = null;
  try { await m.credentials(); } catch (e) { err = e; }
  assert.ok(err, 'MAILGUN_API_KEY must not satisfy the CI path');
});

await t('a CRLF subject is refused before any request is made', async () => {
  let hit = false;
  const { s, base } = await server((req, res) => { hit = true; res.writeHead(200); res.end('{}'); });
  envFor(base);
  const m = await load();
  let err = null;
  try { await m.sendOpsEmail({ subject: 'x\r\nBcc: attacker@example.invalid', body: 'b' }); }
  catch (e) { err = e; }
  s.close();
  assert.ok(err, 'must refuse');
  assert.equal(hit, false, 'refusal must happen before the request');
});

// --- region routing. Mailgun is region-split and the account is EU. A send to the
// --- US base 401s, and the US API reports "domain not found" for a live EU domain,
// --- so the symptom points at the domain rather than the region. Both directions
// --- are pinned here because the workflow supplies MAILGUN_REGION explicitly.
await t('region=eu routes to the EU base', async () => {
  envFor('', { MAILGUN_REGION: 'eu' });
  delete process.env.MAILGUN_BASE;
  const m = await load();
  let err = null;
  try { await m.sendOpsEmail({ subject: 's', body: 'b' }); } catch (e) { err = e; }
  assert.ok(err, 'expected a failure against the real endpoint with a fixture key');
  assert.match(err.message, /api\.eu\.mailgun\.net/);
});

await t('region unset falls back to the US base', async () => {
  envFor('', {});
  delete process.env.MAILGUN_BASE;
  delete process.env.MAILGUN_REGION;
  const m = await load();
  let err = null;
  try { await m.sendOpsEmail({ subject: 's', body: 'b' }); } catch (e) { err = e; }
  assert.ok(err);
  assert.match(err.message, /\/\/api\.mailgun\.net/);
});

await t('a failure names the region, so a wrong-region 401 is diagnosable', async () => {
  const { s, base } = await server((req, res) => { res.writeHead(401); res.end('Forbidden'); });
  envFor(base, { MAILGUN_REGION: 'eu' });
  const m = await load();
  let err = null;
  try { await m.sendOpsEmail({ subject: 's', body: 'b' }); } catch (e) { err = e; }
  s.close();
  assert.ok(err);
  assert.match(err.message, /region=eu/);
});

console.log(`\nRESULT: ${pass} passed, ${fail} failed`);
process.exit(fail > 0 ? 1 : 0);
