import { readFileSync } from 'fs';

function parseEnv(file) {
  return Object.fromEntries(
    readFileSync(file, 'utf8').split('\n')
      .filter(l => l.trim() && !l.startsWith('#') && l.includes('='))
      .map(l => { const i = l.indexOf('='); return [l.slice(0,i).trim(), l.slice(i+1).trim()]; })
  );
}

const env = { ...parseEnv('.env.local'), ...parseEnv('.env.test.local') };

const SUPABASE_URL = env.VITE_SUPABASE_URL;
const SERVICE_KEY = env.SUPABASE_SERVICE_ROLE_KEY;
const ANON_KEY = env.VITE_SUPABASE_ANON_KEY;
const EDGE_URL = env.VITE_STORY_GUIDE_EDGE_FN_URL;

console.log('SUPABASE_URL project:', SUPABASE_URL?.match(/\/\/([^.]+)/)?.[1]);
console.log('EDGE_URL project:', EDGE_URL?.match(/\/\/([^.]+)/)?.[1]);

// Create test user
const email = 'edge-test-' + Date.now() + '@example.com';
const createRes = await fetch(`${SUPABASE_URL}/auth/v1/admin/users`, {
  method: 'POST',
  headers: { 'apikey': SERVICE_KEY, 'Authorization': `Bearer ${SERVICE_KEY}`, 'Content-Type': 'application/json' },
  body: JSON.stringify({ email, password: 'testpass123!', email_confirm: true }),
});
const createData = await createRes.json();
console.log('Create user:', createRes.status, createData.id ? 'ok' : JSON.stringify(createData).slice(0,80));

if (!createData.id) process.exit(1);

// Sign in
const signInRes = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
  method: 'POST',
  headers: { 'apikey': ANON_KEY, 'Content-Type': 'application/json' },
  body: JSON.stringify({ email, password: 'testpass123!' }),
});
const signInData = await signInRes.json();
console.log('Sign in:', signInRes.status, signInData.access_token ? 'got token' : JSON.stringify(signInData).slice(0,80));

if (!signInData.access_token) { process.exit(1); }

// Call edge function
console.log('\nCalling edge function:', EDGE_URL);
const edgeRes = await fetch(EDGE_URL, {
  method: 'POST',
  headers: { 'Authorization': `Bearer ${signInData.access_token}`, 'Content-Type': 'application/json' },
  body: JSON.stringify({ messages: [{ role: 'user', content: 'Hello, respond with just: OK' }] }),
});
console.log('Edge status:', edgeRes.status);

const text = await edgeRes.text();
console.log('Response (first 500 chars):');
console.log(text.slice(0, 500));

// Cleanup
await fetch(`${SUPABASE_URL}/auth/v1/admin/users/${createData.id}`, {
  method: 'DELETE',
  headers: { 'apikey': SERVICE_KEY, 'Authorization': `Bearer ${SERVICE_KEY}` },
});
console.log('\nCleaned up user');
