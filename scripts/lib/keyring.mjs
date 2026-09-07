/**
 * keyring.mjs — Node access to the P1239 locked credential half.
 *
 * One key per keychain item, one authorization dialog per key. Asking for
 * OPS_EMAIL_PASSWORD prompts for OPS_EMAIL_PASSWORD alone and cannot read any
 * other critical key: the grant is per-key and per-access, never a bundle.
 *
 * Fails closed. If the human declines, or the key was never enrolled, this
 * throws — it never falls back to the plaintext copy in .env.local and never
 * hands back an empty value (P1239 Invariants).
 */
import { spawnSync } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const KEYCHAIN_PY = join(dirname(fileURLToPath(import.meta.url)), 'keychain.py');
const SERVICE_PREFIX = 'cp.keyring.';

/** Read one critical key. Triggers the OS authorization dialog. */
export function keyringGet(key) {
  const res = spawnSync('python3', [KEYCHAIN_PY, 'get', SERVICE_PREFIX + key], {
    encoding: 'utf8',
    // stderr passes through so the operator sees why a read failed; the value
    // itself only ever travels on the stdout pipe, never through argv.
    stdio: ['ignore', 'pipe', 'inherit'],
  });
  if (res.error) {
    throw new Error(`keyring: could not run keychain.py for ${key}: ${res.error.message}`);
  }
  if (res.status !== 0) {
    throw new Error(
      `FATAL: could not read the critical credential ${key}.\n` +
      `  You declined the authorization dialog, or ${key} is not enrolled.\n` +
      `  This will NOT fall back to a plaintext copy.\n` +
      `  Retry and click "Allow" (never "Always Allow" — that disables the gate).\n` +
      `  Enroll: ./scripts/keyring.sh enroll ${key}\n` +
      `  Check:  ./scripts/keyring.sh verify`
    );
  }
  const value = res.stdout;
  if (!value) {
    throw new Error(`FATAL: ${key} decrypted to an empty value — refusing to continue.`);
  }
  return value;
}

/** Read several keys. Each one prompts separately. */
export function keyringRequire(...keys) {
  const out = {};
  for (const key of keys) out[key] = keyringGet(key);
  return out;
}
