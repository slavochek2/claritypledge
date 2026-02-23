#!/usr/bin/env node
import crypto from 'crypto';

const key = '699bf9920ee17f00017b1081:72d5806549dfdfa1f6c537a43970149ff6c9b7ae4ba4556aeeb630cd663907c6';
const [id, secret] = key.split(':');
const now = Math.floor(Date.now() / 1000);
const header = Buffer.from(JSON.stringify({ alg: 'HS256', kid: id, typ: 'JWT' })).toString('base64url');
const payload = Buffer.from(JSON.stringify({ iat: now, exp: now + 300, aud: '/admin/' })).toString('base64url');
const sig = crypto.createHmac('sha256', Buffer.from(secret, 'hex')).update(header + '.' + payload).digest('base64url');
const token = header + '.' + payload + '.' + sig;

const html = `<style>
  .gh-article-header { display: none !important; }
  .gh-article { max-width: 100% !important; padding: 0 !important; }
  .wp-wrap {
    font-family: -apple-system, BlinkMacSystemFont, 'Inter', sans-serif;
    min-height: calc(100vh - 64px);
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    text-align: center;
    padding: 64px 24px;
  }
  .wp-badge {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    background: #eff6ff;
    border: 1px solid #bfdbfe;
    color: #1d4ed8;
    font-size: 1rem;
    font-weight: 600;
    padding: 8px 20px;
    border-radius: 100px;
    margin-bottom: 40px;
  }
  .wp-headline {
    font-size: clamp(4rem, 10vw, 7rem);
    font-weight: 700;
    letter-spacing: -0.03em;
    line-height: 1.0;
    color: #09090b;
    margin: 0 0 24px;
    max-width: 900px;
  }
  .wp-headline .accent { color: #3b82f6; }
  .wp-subtext {
    font-size: 1.25rem;
    color: #6b7280;
    margin: 0 0 64px;
    line-height: 1.6;
  }
  .wp-btn-primary {
    display: inline-flex !important;
    align-items: center !important;
    justify-content: center !important;
    background: #3b82f6 !important;
    color: #fff !important;
    font-size: 1.375rem !important;
    font-weight: 600 !important;
    padding: 22px 56px !important;
    border-radius: 8px !important;
    text-decoration: none !important;
    box-shadow: 0 4px 24px rgba(59,130,246,0.3) !important;
    transition: background 0.15s, box-shadow 0.15s;
    margin-bottom: 24px;
    white-space: nowrap;
  }
  .wp-btn-primary:hover {
    background: #2563eb !important;
    color: #fff !important;
    box-shadow: 0 6px 28px rgba(59,130,246,0.4) !important;
  }
  .wp-secondary {
    font-size: 1.125rem;
    color: #6b7280;
    margin: 0 0 12px;
  }
  .wp-secondary a {
    color: #3b82f6 !important;
    text-decoration: underline !important;
    text-underline-offset: 3px;
  }
  .wp-secondary a:hover { color: #2563eb !important; }
  .wp-tertiary {
    font-size: 1rem;
    color: #9ca3af;
    margin: 0;
  }
  .wp-tertiary a {
    color: #9ca3af !important;
    text-decoration: underline !important;
    text-underline-offset: 3px;
  }
  .wp-tertiary a:hover { color: #6b7280 !important; }
</style>

<div class="wp-wrap">
  <div class="wp-badge">
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><circle cx="8" cy="8" r="8" fill="#3b82f6"/><path d="M5 8l2.5 2.5L11 5.5" stroke="#fff" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"/></svg>
    Subscription confirmed
  </div>
  <h2 class="wp-headline">You&#x27;re in.<br><span class="accent">Now, make it real.</span></h2>
  <p class="wp-subtext">Check your inbox &#x2014; a confirmation link is on its way.</p>
  <a href="https://claritypledge.com/#manifesto" class="wp-btn-primary">Read the Clarity Manifesto</a>
  <p class="wp-secondary">or <a href="https://claritypledge.com/live">Try a Clarity Session</a></p>
  <p class="wp-tertiary">or <a href="https://claritypledge.com/sign-pledge">Take the Pledge</a></p>
</div>`;

// Get current updated_at first
const getRes = await fetch('https://blog.claritypledge.com/ghost/api/admin/pages/699c2cce0ee17f00017b10dc/', {
  headers: { Authorization: 'Ghost ' + token, 'Content-Type': 'application/json' }
});
const getData = await getRes.json();
const updatedAt = getData.pages[0].updated_at;
console.log('Current updated_at:', updatedAt);

// Regen token (in case it expired during the GET)
const now2 = Math.floor(Date.now() / 1000);
const h2 = Buffer.from(JSON.stringify({ alg: 'HS256', kid: id, typ: 'JWT' })).toString('base64url');
const p2 = Buffer.from(JSON.stringify({ iat: now2, exp: now2 + 300, aud: '/admin/' })).toString('base64url');
const s2 = crypto.createHmac('sha256', Buffer.from(secret, 'hex')).update(h2 + '.' + p2).digest('base64url');
const token2 = h2 + '.' + p2 + '.' + s2;

// Ghost ignores html field when lexical exists — must update lexical directly
const lexical = JSON.stringify({
  root: {
    children: [{ type: 'html', version: 1, html }],
    direction: null,
    format: '',
    indent: 0,
    type: 'root',
    version: 1
  }
});

const putRes = await fetch('https://blog.claritypledge.com/ghost/api/admin/pages/699c2cce0ee17f00017b10dc/', {
  method: 'PUT',
  headers: { Authorization: 'Ghost ' + token2, 'Content-Type': 'application/json' },
  body: JSON.stringify({
    pages: [{
      id: '699c2cce0ee17f00017b10dc',
      lexical,
      updated_at: updatedAt
    }]
  })
});

console.log('PUT status:', putRes.status);
const putData = await putRes.json();
if (putData.errors) {
  console.log('Errors:', JSON.stringify(putData.errors, null, 2));
} else {
  console.log('Updated at:', putData.pages?.[0]?.updated_at);
  console.log('Success!');
}
