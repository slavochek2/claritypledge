#!/usr/bin/env node
/**
 * Read emails from ops@claritypledge.com via IMAP
 * Usage:
 *   node scripts/read-ops-email.mjs           # List last 5 emails
 *   node scripts/read-ops-email.mjs --latest  # Show full body of latest email
 *   node scripts/read-ops-email.mjs --search "verification"  # Search subject
 */

import tls from 'tls';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dir = dirname(fileURLToPath(import.meta.url));
const envPath = join(__dir, '../.env.local');
const env = Object.fromEntries(
  readFileSync(envPath, 'utf8').split('\n')
    .filter(l => l && !l.startsWith('#') && l.includes('='))
    .map(l => { const i = l.indexOf('='); return [l.slice(0,i).trim(), l.slice(i+1).trim()]; })
);

const HOST = 'w00dd4f1.kasserver.com';
const PORT = 993;
const USER = env.OPS_EMAIL;
const PASS = env.OPS_EMAIL_PASSWORD;

const args = process.argv.slice(2);
const showLatest = args.includes('--latest');
const searchTerm = args.find((_, i) => args[i-1] === '--search');

function imap(commands) {
  return new Promise((resolve, reject) => {
    const socket = tls.connect({ host: HOST, port: PORT });
    let buf = '', seq = 0, results = [], currentEmail = null;
    const queue = [...commands];
    let waitingFor = null;

    socket.setTimeout(10000);

    const send = (cmd) => {
      seq++;
      const tag = `T${seq}`;
      waitingFor = tag;
      socket.write(`${tag} ${cmd}\r\n`);
      return tag;
    };

    socket.on('data', d => {
      buf += d.toString();
      const lines = buf.split('\r\n');
      buf = lines.pop();

      for (const line of lines) {
        // Collect fetch results
        if (line.startsWith('* ') && currentEmail !== null) {
          currentEmail += line + '\n';
        }

        if (line.includes('mailserver ready') && queue.length) {
          send(queue.shift());
        } else if (waitingFor && line.startsWith(waitingFor + ' OK')) {
          if (currentEmail) { results.push(currentEmail); currentEmail = null; }
          if (queue.length) {
            const next = queue.shift();
            if (next === 'FETCH_LATEST') {
              // Will be handled after EXISTS
            } else {
              send(next);
            }
          } else {
            send('LOGOUT');
          }
        } else if (line.startsWith('* ') && line.includes('EXISTS')) {
          const count = parseInt(line.match(/\* (\d+) EXISTS/)?.[1] || '0');
          results.push({ type: 'exists', count });
        } else if (line.startsWith('* FETCH') || (currentEmail === null && line.match(/^\* \d+ FETCH/))) {
          currentEmail = line + '\n';
        } else if (waitingFor && line.startsWith(waitingFor + ' NO')) {
          reject(new Error(line));
          socket.destroy();
        } else if (line.includes('BYE')) {
          socket.destroy();
          resolve(results);
        }
      }
    });

    socket.on('timeout', () => { socket.destroy(); reject(new Error('Timeout')); });
    socket.on('error', reject);
  });
}

async function main() {
  const socket = tls.connect({ host: HOST, port: PORT });
  let buf = '', seq = 0;
  const output = [];

  await new Promise((resolve, reject) => {
    socket.setTimeout(10000);

    const send = (cmd) => {
      seq++;
      const tag = `T${seq}`;
      socket.write(`${tag} ${cmd}\r\n`);
      return tag;
    };

    let lastTag = '', state = 'init', fetchData = '';

    socket.on('data', d => {
      buf += d.toString();
      const lines = buf.split('\r\n');
      buf = lines.pop();

      for (const line of lines) {
        if (state === 'init' && line.includes('ready')) {
          lastTag = send(`LOGIN ${USER} "${PASS}"`);
          state = 'login';
        } else if (state === 'login' && line.startsWith(lastTag + ' OK')) {
          lastTag = send('SELECT INBOX');
          state = 'select';
        } else if (state === 'select') {
          const m = line.match(/\* (\d+) EXISTS/);
          if (m) output.push({ exists: parseInt(m[1]) });
          if (line.startsWith(lastTag + ' OK')) {
            const count = output.find(o => o.exists)?.exists || 0;
            if (count === 0) {
              console.log('📭 Inbox is empty');
              lastTag = send('LOGOUT');
              state = 'logout';
            } else if (showLatest) {
              const from = Math.max(1, count);
              lastTag = send(`FETCH ${from} (BODY[HEADER.FIELDS (FROM SUBJECT DATE)] BODY[TEXT])`);
              state = 'fetch';
            } else {
              const from = Math.max(1, count - 4);
              lastTag = send(`FETCH ${from}:${count} (BODY[HEADER.FIELDS (FROM SUBJECT DATE)])`);
              state = 'fetch';
            }
          }
        } else if (state === 'fetch') {
          if (line.startsWith('* ')) fetchData += line + '\n';
          else if (line.includes(') ') || line === ')') fetchData += line + '\n';
          if (line.startsWith(lastTag + ' OK')) {
            output.push({ fetch: fetchData });
            lastTag = send('LOGOUT');
            state = 'logout';
          }
        } else if (state === 'logout' && line.includes('BYE')) {
          socket.destroy();
          resolve();
        }
      }
    });

    socket.on('timeout', () => { socket.destroy(); reject(new Error('Timeout')); });
    socket.on('error', reject);
  });

  // Parse and display
  const fetchResult = output.find(o => o.fetch)?.fetch || '';
  if (fetchResult) {
    console.log('📬 ops@claritypledge.com\n');
    console.log(fetchResult);
  }
}

main().catch(console.error);
