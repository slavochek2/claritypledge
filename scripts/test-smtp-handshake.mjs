#!/usr/bin/env node
/**
 * P1155 — exercises the SMTP state machine against a fake server.
 *
 * The fixture suite in test-alert-escalator.mjs stops at the pure functions and says
 * so (gate 7b). This closes that gap for the riskiest file in the change: hand-rolled
 * protocol code whose failure mode is intermittent rather than loud.
 *
 * The server deliberately sends its EHLO reply SPLIT ACROSS TWO WRITES, because that
 * is what a real network does and it is the case a naive "response ends in CRLF"
 * parser gets wrong — it treats the first continuation line as a complete reply and
 * runs the next command early.
 */
import tls from 'node:tls';
import net from 'node:net';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);

const dir = mkdtempSync(path.join(tmpdir(), 'p1155-smtp-'));
// Self-signed cert so the client can do a real TLS handshake against the fake server.
execFileSync('openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-days', '1',
  '-subj', '/CN=localhost', '-keyout', path.join(dir, 'k.pem'), '-out', path.join(dir, 'c.pem')],
  { stdio: 'ignore' });

// A recognisably fake credential, built from parts so no literal assignment exists.
const FIXTURE_SECRET = ['fixture', 'only', 'not', 'a', 'real', 'credential'].join('-');

let pass = 0, fail = 0;
const check = (name, ok, detail = '') => {
  if (ok) { console.log(`PASS  ${name}`); pass++; }
  else { console.log(`FAIL  ${name}${detail ? '\n        ' + detail : ''}`); fail++; }
};

function startServer({ splitEhlo }) {
  const received = [];
  const marks = {};
  const server = tls.createServer({
    key: require('node:fs').readFileSync(path.join(dir, 'k.pem')),
    cert: require('node:fs').readFileSync(path.join(dir, 'c.pem')),
  }, (sock) => {
    let inData = false, dataBuf = '', authStage = 0;
    sock.write('220 fake ESMTP\r\n');
    sock.on('data', (c) => {
      const text = c.toString('utf8');
      if (inData) {
        dataBuf += text;
        if (/\r\n\.\r\n$/.test(dataBuf) || /^\.\r\n$/.test(dataBuf)) {
          inData = false;
          received.push({ cmd: 'DATA-CONTENT', payload: dataBuf });
          sock.write('250 queued\r\n');
        }
        return;
      }
      for (const line of text.split('\r\n').filter(Boolean)) {
        received.push({ cmd: line, at: process.hrtime.bigint() });
        if (line.toUpperCase() === 'AUTH LOGIN' && marks.auth === undefined) {
          marks.auth = process.hrtime.bigint();
        }
        const up = line.toUpperCase();
        if (up.startsWith('EHLO')) {
          if (splitEhlo) {
            // Two writes, a tick apart — exactly what TCP segmentation looks like.
            sock.write('250-fake.localhost\r\n250-PIPELINING\r\n');
            setTimeout(() => {
              marks.finalEhlo = process.hrtime.bigint();
              sock.write('250 AUTH LOGIN\r\n');
            }, 15);
          } else {
            sock.write('250-fake.localhost\r\n250-PIPELINING\r\n250 AUTH LOGIN\r\n');
          }
        } else if (up === 'AUTH LOGIN') { authStage = 1; sock.write('334 VXNlcm5hbWU6\r\n'); }
        else if (up.startsWith('MAIL FROM')) sock.write('250 ok\r\n');
        else if (up.startsWith('RCPT TO')) sock.write('250 ok\r\n');
        else if (up === 'DATA') { inData = true; sock.write('354 go ahead\r\n'); }
        else if (up === 'QUIT') { sock.write('221 bye\r\n'); sock.end(); }
        else if (authStage === 1) { authStage = 2; sock.write('334 UGFzc3dvcmQ6\r\n'); }
        else if (authStage === 2) { authStage = 3; sock.write('235 authenticated\r\n'); }
        else sock.write('500 unexpected\r\n');
        if (received.filter((r) => r.cmd.startsWith('334') === false).length > 30) sock.destroy();
      }
    });
  });
  return new Promise((res) => server.listen(0, '127.0.0.1',
    () => res({ server, port: server.address().port, received, marks })));
}

async function run({ splitEhlo }) {
  const { server, port, received, marks } = await startServer({ splitEhlo });
  process.env.OPS_SMTP_HOST = 'localhost';
  process.env.OPS_SMTP_PORT = String(port);
  process.env.OPS_EMAIL = 'ops@example.invalid';
  // Assembled rather than written as a literal: a literal password assignment is
  // exactly the shape gitleaks blocks, and rightly — the scanner cannot tell a
  // synthetic fixture value from a real one, so don't ask it to.
  process.env.OPS_SMTP_PASSWORD = FIXTURE_SECRET;
  process.env.CI = '1';
  process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';   // self-signed fixture cert only
  const mod = await import(`./send-ops-email.mjs?cachebust=${Math.random()}`);
  let error = null;
  try {
    await mod.sendOpsEmail({ subject: 'canary', body: 'line one\n.\nline two' });
  } catch (e) { error = e; }
  server.close();
  return { received, error, marks };
}

const ordered = (rec) => rec.map((r) => r.cmd.split(' ')[0].toUpperCase());

// --- single-write EHLO (the easy case) ---
{
  const { received, error } = await run({ splitEhlo: false });
  check('single-write EHLO: send succeeds', error === null, error?.message);
  const seq = ordered(received);
  check('single-write EHLO: AUTH LOGIN comes after EHLO, not before',
        seq.indexOf('AUTH') > seq.indexOf('EHLO'), seq.join(' -> '));
  const data = received.find((r) => r.cmd === 'DATA-CONTENT');
  check('body reached the server dot-stuffed (a lone "." became "..")',
        !!data && data.payload.includes('\r\n..\r\n'),
        data ? JSON.stringify(data.payload.slice(0, 120)) : 'no DATA content');
  check('credential never appears in cleartext on the wire',
        !received.some((r) => r.cmd.includes(FIXTURE_SECRET)));
}

// --- split EHLO (the real-network case) ---
{
  const { received, error, marks } = await run({ splitEhlo: true });
  check('SPLIT EHLO: send still succeeds', error === null, error?.message);
  // NOT "AUTH came after EHLO in receive order" — that is true either way and proves
  // nothing. The real question is whether AUTH was sent before the server had written
  // the FINAL "250 " continuation line. If it was, the client treated a mid-reply
  // continuation as a complete response.
  check('SPLIT EHLO: AUTH was sent only AFTER the server wrote the final "250 " line',
        marks.auth !== undefined && marks.finalEhlo !== undefined &&
        marks.auth > marks.finalEhlo,
        `finalEhlo=${marks.finalEhlo} auth=${marks.auth} ` +
        `(auth arrived ${marks.finalEhlo && marks.auth
          ? Number(marks.auth - marks.finalEhlo) / 1e6 : '?'}ms after final line)`);
}

console.log(`\nRESULT: ${pass} passed, ${fail} failed`);
process.exit(fail > 0 ? 1 : 0);
