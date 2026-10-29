// Deno test: deno test --config supabase/functions/deno.json -A supabase/functions/chat-voice/
import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { pcmOf, WAVEFORM_BARS, waveformBars } from './clip.ts';

Deno.test('waveformBars: silence is 50 zeros, never NaN', () => {
  assertEquals(waveformBars(new Int16Array(16000)), new Array(50).fill(0));
  assertEquals(waveformBars(new Int16Array(0)), new Array(50).fill(0));
});

Deno.test('waveformBars: a ramp rises monotonically and the loudest bucket is exactly 100', () => {
  const pcm = Int16Array.from({ length: 5000 }, (_, i) => i);
  const bars = waveformBars(pcm);
  assertEquals(bars.length, WAVEFORM_BARS);
  assertEquals(bars[49], 100);
  for (let i = 1; i < 50; i++) if (bars[i] < bars[i - 1]) throw new Error(`not monotonic at ${i}`);
  assertEquals(bars[0] < 5, true);
});

Deno.test('waveformBars: fewer samples than bars still yields 50 values in 0..100', () => {
  const bars = waveformBars(Int16Array.from([0, 1000, -2000, 500, 100]));
  assertEquals(bars.length, 50);
  assertEquals(Math.max(...bars), 100);
  assertEquals(bars.every((b) => Number.isInteger(b) && b >= 0 && b <= 100), true);
});

Deno.test('waveformBars: odd length is covered, negative peaks count, -32768 does not overflow', () => {
  const pcm = new Int16Array(1001);
  pcm[1000] = -32768; // the very last sample, in the last bucket
  pcm[10] = 16384;
  const bars = waveformBars(pcm);
  assertEquals(bars[49], 100);
  assertEquals(bars[0], 50);
});

Deno.test('waveformBars: normalised to the clip maximum (a quiet clip still reaches 100)', () => {
  const quiet = Int16Array.from({ length: 1000 }, (_, i) => (i % 2 ? 30 : -30));
  assertEquals(Math.max(...waveformBars(quiet)), 100);
});

Deno.test('pcmOf: reads little-endian samples after the 44-byte header and ignores a trailing odd byte', () => {
  const b = new Uint8Array(44 + 5);
  new DataView(b.buffer).setInt16(44, -2, true);
  new DataView(b.buffer).setInt16(46, 300, true);
  assertEquals([...pcmOf(b)], [-2, 300]);
});
