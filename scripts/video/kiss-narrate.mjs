// KISS test — Stage 2 (upgrade): narration via ElevenLabs (free-tier preset voice).
// Replaces the macOS `say` placeholder. Reads ELEVENLABS_API_KEY from .env.local.
// Usage: node scripts/video/kiss-narrate.mjs "<text>" [outFile] [voiceId]
//
// Free tier: preset voices work; cloning YOUR voice needs the paid Starter tier.
// Swap VOICE_ID for your cloned voice id once upgraded.
import { readFileSync, writeFileSync } from 'node:fs';

function loadKey() {
  const env = readFileSync(new URL('../../.env.local', import.meta.url), 'utf8');
  const m = env.match(/^\s*ELEVENLABS_API_KEY\s*=\s*(.+)\s*$/m);
  if (!m) throw new Error('ELEVENLABS_API_KEY not found in .env.local');
  return m[1].trim().replace(/^["']|["']$/g, '');
}

const text = process.argv[2];
const outFile = process.argv[3] || 'tmp/video-kiss/voice.mp3';
// Default preset: "Jessica" (free-tier female). Override via 3rd arg.
// Swap this id for your cloned voice once on the paid tier.
const voiceId = process.argv[4] || 'cgSgspJ2msm6clMCkdW9';

if (!text) {
  console.error('Usage: node scripts/video/kiss-narrate.mjs "<text>" [outFile] [voiceId]');
  process.exit(1);
}

const apiKey = loadKey();
const res = await fetch(
  `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}?output_format=mp3_44100_128`,
  {
    method: 'POST',
    headers: { 'xi-api-key': apiKey, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      text,
      model_id: 'eleven_multilingual_v2',
      voice_settings: { stability: 0.5, similarity_boost: 0.75 },
    }),
  }
);

if (!res.ok) {
  console.error(`[narrate] ElevenLabs error ${res.status}: ${await res.text()}`);
  process.exit(1);
}

const buf = Buffer.from(await res.arrayBuffer());
writeFileSync(outFile, buf);
console.log(`[narrate] wrote ${outFile} (${buf.length} bytes)`);
