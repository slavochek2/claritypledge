#!/usr/bin/env node
import crypto from 'crypto';

// Read from the environment, never hardcoded. Populate it from the keychain first:
//   source scripts/keyring.sh && KEYRING_REASON="<why>" keyring_require GHOST_ADMIN_API_KEY
const key = process.env.GHOST_ADMIN_API_KEY;
if (!key || !key.includes(':')) {
  console.error('GHOST_ADMIN_API_KEY is not set (expected {id}:{secret}). Load it with keyring_require GHOST_ADMIN_API_KEY.');
  process.exit(1);
}
const [id, secret] = key.split(':');

function makeToken() {
  const now = Math.floor(Date.now() / 1000);
  const h = Buffer.from(JSON.stringify({ alg: 'HS256', kid: id, typ: 'JWT' })).toString('base64url');
  const p = Buffer.from(JSON.stringify({ iat: now, exp: now + 300, aud: '/admin/' })).toString('base64url');
  const s = crypto.createHmac('sha256', Buffer.from(secret, 'hex')).update(h + '.' + p).digest('base64url');
  return h + '.' + p + '.' + s;
}

const getRes = await fetch('https://blog.claritypledge.com/ghost/api/admin/settings/', {
  headers: { Authorization: 'Ghost ' + makeToken() }
});
const data = await getRes.json();
const head = data.settings.find(s => s.key === 'codeinjection_head');

const newCSS = `\n<style>/* article feature image: cap height on desktop */\n.gh-article-image { max-height: 480px; overflow: hidden; }\n.gh-article-image img { width: 100%; height: 100%; object-fit: cover; object-position: center top; }</style>`;

const putRes = await fetch('https://blog.claritypledge.com/ghost/api/admin/settings/', {
  method: 'PUT',
  headers: { Authorization: 'Ghost ' + makeToken(), 'Content-Type': 'application/json' },
  body: JSON.stringify({ settings: [{ key: 'codeinjection_head', value: head.value + newCSS }] })
});

console.log('PUT status:', putRes.status);
const result = await putRes.json();
if (result.errors) {
  console.log('Error:', result.errors[0].message);
} else {
  console.log('OK');
}
