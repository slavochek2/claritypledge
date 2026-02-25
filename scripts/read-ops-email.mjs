#!/usr/bin/env node
/**
 * Read emails from ops@claritypledge.com via IMAP
 * Usage:
 *   node scripts/read-ops-email.mjs             # List last 5 emails
 *   node scripts/read-ops-email.mjs --latest    # Show full body of latest email
 *   node scripts/read-ops-email.mjs --unread    # List all unread emails (headers)
 *   node scripts/read-ops-email.mjs --unread --body      # Unread with full bodies
 *   node scripts/read-ops-email.mjs --unread --mark-read       # Unread + mark as read
 *   node scripts/read-ops-email.mjs --unread --body --mark-read # Unread bodies + mark as read
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
const showUnread = args.includes('--unread');
const withBody = args.includes('--body');
const markRead = args.includes('--mark-read');

async function main() {
  const socket = tls.connect({ host: HOST, port: PORT });
  let buf = '', seq = 0;
  const output = [];
  let unreadIds = [];

  await new Promise((resolve, reject) => {
    socket.setTimeout(15000);

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
            } else if (showUnread) {
              lastTag = send('SEARCH UNSEEN');
              state = 'search';
            } else if (showLatest) {
              lastTag = send(`FETCH ${count} (BODY[HEADER.FIELDS (FROM SUBJECT DATE)] BODY[TEXT])`);
              state = 'fetch';
            } else {
              const from = Math.max(1, count - 4);
              lastTag = send(`FETCH ${from}:${count} (BODY[HEADER.FIELDS (FROM SUBJECT DATE)])`);
              state = 'fetch';
            }
          }

        } else if (state === 'search') {
          // * SEARCH 1 3 5 7  (or * SEARCH with no ids = none unread)
          if (line.startsWith('* SEARCH')) {
            const ids = line.replace('* SEARCH', '').trim().split(/\s+/).filter(Boolean);
            unreadIds = ids;
          }
          if (line.startsWith(lastTag + ' OK')) {
            if (unreadIds.length === 0) {
              console.log('📭 No unread emails');
              lastTag = send('LOGOUT');
              state = 'logout';
            } else {
              const idSet = unreadIds.join(',');
              const fields = withBody
                ? '(BODY[HEADER.FIELDS (FROM SUBJECT DATE)] BODY[TEXT])'
                : '(BODY[HEADER.FIELDS (FROM SUBJECT DATE)])';
              lastTag = send(`FETCH ${idSet} ${fields}`);
              state = 'fetch';
            }
          }

        } else if (state === 'fetch') {
          if (line.startsWith('* ')) fetchData += line + '\n';
          else if (line.includes(') ') || line === ')') fetchData += line + '\n';
          if (line.startsWith(lastTag + ' OK')) {
            output.push({ fetch: fetchData });
            if (markRead && unreadIds.length > 0) {
              lastTag = send(`STORE ${unreadIds.join(',')} +FLAGS (\\Seen)`);
              state = 'store';
            } else {
              lastTag = send('LOGOUT');
              state = 'logout';
            }
          }

        } else if (state === 'store') {
          if (line.startsWith(lastTag + ' OK')) {
            lastTag = send('LOGOUT');
            state = 'logout';
          }

        } else if (state === 'logout' && line.includes('BYE')) {
          socket.destroy();
          resolve();
        }

        // Error handling
        if (line.startsWith(lastTag + ' NO') || line.startsWith(lastTag + ' BAD')) {
          socket.destroy();
          reject(new Error(line));
        }
      }
    });

    socket.on('timeout', () => { socket.destroy(); reject(new Error('Timeout')); });
    socket.on('error', reject);
  });

  // Display
  const fetchResult = output.find(o => o.fetch)?.fetch || '';
  if (fetchResult) {
    const label = showUnread
      ? `📬 ops@claritypledge.com — ${unreadIds.length} unread`
      : '📬 ops@claritypledge.com';
    console.log(label + '\n');
    console.log(fetchResult);
    if (markRead && unreadIds.length > 0) {
      console.log(`\n✅ Marked ${unreadIds.length} email(s) as read`);
    }
  }
}

main().catch(console.error);
