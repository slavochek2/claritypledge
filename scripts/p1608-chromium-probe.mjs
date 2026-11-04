#!/usr/bin/env node
/**
 * p1608-chromium-probe.mjs: measures how Chromium's fake audio capture behaves, on a blank page, with no app,
 * no server and no Gemini. P1608 builds on these facts; run it again when Playwright's Chromium changes.
 *
 *   node scripts/p1608-chromium-probe.mjs [--skip-real-device] [--clip <speech.wav>]
 *   node scripts/p1608-chromium-probe.mjs --capture-clip <in.wav> <out.wav>   plays the whole clip through the app's constraints and saves what the
 *                                                                          browser captured (for checking the bleed survives; out.wav stays out of the repo)
 *
 * Probes (each prints a JSON line "PROBE <name> {...}"; exit 1 when any fact the test depends on is refuted):
 *   process-wide   two browsers launched with different files each hear their own file; two contexts in ONE
 *                  browser hear the same file
 *   flag-required  --use-file-for-fake-audio-capture WITHOUT --use-fake-device-for-media-stream: is it the file?
 *                  (this one can open the real microphone; --skip-real-device skips it)
 *   noloop         %noloop: the file plays once, then silence; without it the file repeats
 *   second-gum     a second getUserMedia in the same page: does the file restart for it, and is the first stream disturbed
 *   processing     getUserMedia({audio:true}) versus processing switched off, on a pure tone pair (steady tones are what
 *                  noise suppression removes, so the tone result is a worst case) and, with --clip, on real speech
 *
 * Test signals are pure tones generated with ffmpeg into a fresh temp directory, measured with a Goertzel filter.
 */
import { chromium } from '@playwright/test';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import path from 'node:path';

const SR = 48_000;
const skipReal = process.argv.includes('--skip-real-device');
const clipArg = process.argv.includes('--clip') ? process.argv[process.argv.indexOf('--clip') + 1] : null;
// Steady tones are what default noise suppression removes, so the flag and loop probes measure the file with processing off.
const RAW = { audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false } };
const dir = mkdtempSync(path.join(tmpdir(), 'p1608-probe-'));
const refuted = [];

function tone(file, parts) {
  // parts: [[freqHz, seconds, amplitude], ...] concatenated; 16 kHz mono PCM like the real clips
  const inputs = [];
  const labels = [];
  parts.forEach(([f, s, a], i) => {
    inputs.push('-f', 'lavfi', '-i', `sine=frequency=${f}:duration=${s}:sample_rate=16000`);
    labels.push(`[${i}:a]volume=${a}[v${i}]`);
  });
  const chain = `${labels.join(';')};${parts.map((_, i) => `[v${i}]`).join('')}concat=n=${parts.length}:v=0:a=1[o]`;
  const r = spawnSync('ffmpeg', ['-nostdin', '-loglevel', 'error', '-y', ...inputs, '-filter_complex', chain, '-map', '[o]', '-ac', '1', '-c:a', 'pcm_s16le', path.join(dir, file)]);
  if (r.status !== 0) throw new Error(`ffmpeg failed: ${r.stderr}`);
  return path.join(dir, file);
}

/** Amplitude of one frequency in a sample window (Goertzel), as a fraction of full scale. */
function level(samples, from, to, hz) {
  const a = Math.max(0, Math.floor(from * SR)), b = Math.min(samples.length, Math.floor(to * SR));
  const n = b - a;
  if (n < 1000) return 0;
  const k = (2 * Math.PI * hz) / SR, c = 2 * Math.cos(k);
  let s1 = 0, s2 = 0;
  for (let i = a; i < b; i++) { const s = samples[i] + c * s1 - s2; s2 = s1; s1 = s; }
  const p = s1 * s1 + s2 * s2 - c * s1 * s2;
  return (2 * Math.sqrt(Math.max(0, p))) / n;
}
const rms = (x, from, to) => {
  const a = Math.floor(from * SR), b = Math.min(x.length, Math.floor(to * SR));
  let t = 0;
  for (let i = a; i < b; i++) t += x[i] * x[i];
  return Math.sqrt(t / Math.max(1, b - a));
};
const dominant = (x, from, to, freqs) => {
  const lv = freqs.map((f) => level(x, from, to, f));
  const max = Math.max(...lv);
  return max < 0.02 ? 'silence' : String(freqs[lv.indexOf(max)]);
};

if (process.argv.includes('--capture-clip')) {
  const i = process.argv.indexOf('--capture-clip');
  const [inp, outp] = [path.resolve(process.argv[i + 1]), path.resolve(process.argv[i + 2])];
  const srv = createServer((_, res) => { res.setHeader('content-type', 'text/html'); res.end('<!doctype html><title>probe</title>'); });
  await new Promise((r) => srv.listen(0, '127.0.0.1', r));
  const b = await chromium.launch({ channel: 'chromium', headless: true, args: [
    '--use-fake-device-for-media-stream', `--use-file-for-fake-audio-capture=${inp}%noloop`, '--use-fake-ui-for-media-stream'] });
  const p = await b.newPage();
  await p.goto(`http://127.0.0.1:${srv.address().port}/`);
  const secs = Number(process.env.P1608_CAPTURE_SECONDS ?? 245);
  const rec = Float32Array.from(await p.evaluate(recordInPage, { seconds: secs, constraints: { audio: true }, sr: SR }));
  const pcm = Buffer.alloc(rec.length * 2);
  rec.forEach((v, k) => pcm.writeInt16LE(Math.max(-32768, Math.min(32767, Math.round(v * 32767))), k * 2));
  const h = Buffer.alloc(44);
  h.write('RIFF', 0); h.writeUInt32LE(36 + pcm.length, 4); h.write('WAVEfmt ', 8); h.writeUInt32LE(16, 16); h.writeUInt16LE(1, 20); h.writeUInt16LE(1, 22);
  h.writeUInt32LE(SR, 24); h.writeUInt32LE(SR * 2, 28); h.writeUInt16LE(2, 32); h.writeUInt16LE(16, 34); h.write('data', 36); h.writeUInt32LE(pcm.length, 40);
  writeFileSync(outp, Buffer.concat([h, pcm]));
  await b.close(); srv.close();
  console.log(`captured ${(rec.length / SR).toFixed(1)} s to ${outp}`);
  process.exit(0);
}
const server = createServer((_, res) => { res.setHeader('content-type', 'text/html'); res.end('<!doctype html><title>probe</title>'); });
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const URL_ = `http://127.0.0.1:${server.address().port}/`;

const FLAGS = (file, { device = true } = {}) => [
  ...(device ? ['--use-fake-device-for-media-stream'] : []),
  `--use-file-for-fake-audio-capture=${file}`,
  '--use-fake-ui-for-media-stream',
];
const launch = (args) => chromium.launch({ channel: 'chromium', headless: true, args });

/** Runs in the page: open getUserMedia, record for `seconds`, hand the samples back. */
async function recordInPage({ seconds, constraints, sr }) {
  const stream = await navigator.mediaDevices.getUserMedia(constraints);
  const ctx = new AudioContext({ sampleRate: sr });
  await ctx.resume();
  const src = ctx.createMediaStreamSource(stream);
  const proc = ctx.createScriptProcessor(4096, 1, 1);
  const chunks = [];
  proc.onaudioprocess = (e) => chunks.push(new Float32Array(e.inputBuffer.getChannelData(0)));
  src.connect(proc); proc.connect(ctx.destination);
  await new Promise((r) => setTimeout(r, seconds * 1000));
  proc.disconnect(); src.disconnect(); stream.getTracks().forEach((t) => t.stop());
  const total = chunks.reduce((n, c) => n + c.length, 0);
  const out = new Float32Array(total); let o = 0;
  for (const c of chunks) { out.set(c, o); o += c.length; }
  await ctx.close();
  return Array.from(out);
}
const recordStart = (page, seconds, constraints = { audio: true }) => page.evaluate(recordInPage, { seconds, constraints, sr: SR });
const record = async (page, seconds, constraints) => Float32Array.from(await recordStart(page, seconds, constraints));
const report = (name, obj) => console.log(`PROBE ${name} ${JSON.stringify(obj)}`);
const refute = (name, why) => { refuted.push(`${name}: ${why}`); };

try {
  const fA = tone('a440.wav', [[440, 8, 0.5]]);
  const fB = tone('b880.wav', [[880, 8, 0.5]]);

  // 1. the file flag belongs to the process
  {
    const [b1, b2] = await Promise.all([launch(FLAGS(fA)), launch(FLAGS(fB))]);
    const [p1, p2] = await Promise.all([b1.newPage(), b2.newPage()]);
    await Promise.all([p1.goto(URL_), p2.goto(URL_)]);
    const [x1, x2] = await Promise.all([record(p1, 2.5, RAW), record(p2, 2.5, RAW)]);
    const ctxA = await b1.newContext(); const ctxB = await b1.newContext();
    const [q1, q2] = [await ctxA.newPage(), await ctxB.newPage()];
    await Promise.all([q1.goto(URL_), q2.goto(URL_)]);
    const [y1, y2] = await Promise.all([record(q1, 2.5, RAW), record(q2, 2.5, RAW)]);
    const r = {
      two_browsers: [dominant(x1, 0.5, 2.3, [440, 880]), dominant(x2, 0.5, 2.3, [440, 880])],
      two_contexts_one_browser: [dominant(y1, 0.5, 2.3, [440, 880]), dominant(y2, 0.5, 2.3, [440, 880])],
    };
    report('process-wide', r);
    if (r.two_browsers.join() !== '440,880') refute('process-wide', 'two browsers did not each hear their own file');
    if (r.two_contexts_one_browser.join() !== '440,440') refute('process-wide', 'contexts of one browser did not share one file');
    await Promise.all([b1.close(), b2.close()]);
  }

  // 2. is the fake-device flag required for the file to be used
  if (skipReal) {
    report('flag-required', { skipped: true });
  } else {
    console.error('NOTE: the next probe launches Chromium WITHOUT the fake-device flag; it may open the real microphone for 2 seconds (in memory only, never saved) and macOS may show a permission prompt.');
    const b = await launch(FLAGS(fA, { device: false }));
    const p = await b.newPage(); await p.goto(URL_);
    let r;
    try {
      const x = await record(p, 2.5, RAW);
      r = { heard: dominant(x, 0.5, 2.3, [440, 880]) };
    } catch (e) { r = { error: String(e).split('\n')[0] }; }
    report('flag-required', r);
    if (r.heard === '440') report('flag-required-note', { required: false });
    await b.close();
  }

  // 3. %noloop
  {
    const f3 = tone('three.wav', [[440, 3, 0.5]]);
    const out = {};
    for (const [label, flagFile] of [['noloop', `${f3}%noloop`], ['loop', f3]]) {
      const b = await launch(FLAGS(flagFile)); const p = await b.newPage(); await p.goto(URL_);
      const x = await record(p, 6.5, RAW);
      out[label] = { first: dominant(x, 0.5, 2.5, [440]), after_end: dominant(x, 4.0, 6.0, [440]) };
      await b.close();
    }
    report('noloop', out);
    if (out.noloop.first !== '440' || out.noloop.after_end !== 'silence') refute('noloop', 'file did not play once then go silent');
    if (out.loop.after_end !== '440') refute('noloop', 'without %noloop the file did not repeat (control failed)');
  }

  // 4. second getUserMedia, with the app's own constraints ({ audio: true }) and with processing off
  {
    const f4 = tone('seq.wav', [[440, 2, 0.5], [880, 2, 0.5], [220, 2, 0.5]]);
    const all = {};
    for (const [label, constraints] of [['default', { audio: true }], ['off', RAW]]) {
      const b = await launch(FLAGS(`${f4}%noloop`)); const p = await b.newPage(); await p.goto(URL_);
      // stream 1 for 6 s; the second capture opens 3 s in, for 2.5 s
      const firstP = recordStart(p, 6, constraints);
      await new Promise((r) => setTimeout(r, 3000));
      const second = await record(p, 2.5, constraints);
      const first = Float32Array.from(await firstP);
      const f = [220, 440, 880];
      all[label] = {
        stream1_0_2_2_4_4_6_s: [dominant(first, 0.3, 1.9, f), dominant(first, 2.3, 3.9, f), dominant(first, 4.3, 5.9, f)],
        stream2_first_then_second_second: [dominant(second, 0.2, 1.0, f), dominant(second, 1.2, 2.2, f)],
      };
      all[label].second_capture_restarts_the_file = all[label].stream2_first_then_second_second[0] === '440';
      await b.close();
    }
    report('second-gum', all);
  }

  // 5. default audio processing versus off
  {
    const f5 = tone('mix.wav', [[1000, 6, 0.5]]);
    const f6 = tone('quiet.wav', [[300, 6, 0.05]]);
    const mixed = path.join(dir, 'two.wav');
    const m = spawnSync('ffmpeg', ['-nostdin', '-loglevel', 'error', '-y', '-i', f5, '-i', f6, '-filter_complex', 'amix=inputs=2:normalize=0', '-c:a', 'pcm_s16le', mixed]);
    if (m.status !== 0) throw new Error('ffmpeg mix failed');
    const out = {};
    for (const [label, constraints] of [['default', { audio: true }], ['off', { audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false } }]]) {
      const b = await launch(FLAGS(`${mixed}%noloop`)); const p = await b.newPage(); await p.goto(URL_);
      const x = await record(p, 5.5, constraints);
      out[label] = { loud_1000hz: +level(x, 1, 4.5, 1000).toFixed(3), quiet_300hz: +level(x, 1, 4.5, 300).toFixed(4), rms: +rms(x, 1, 4.5).toFixed(3) };
      await b.close();
    }
    out.default_vs_off_loud_ratio = +(out.default.loud_1000hz / Math.max(1e-9, out.off.loud_1000hz)).toFixed(2);
    out.default_vs_off_quiet_ratio = +(out.default.quiet_300hz / Math.max(1e-9, out.off.quiet_300hz)).toFixed(2);
    if (clipArg) {
      const clip = path.resolve(clipArg);
      for (const [label, constraints] of [['default', { audio: true }], ['off', RAW]]) {
        const b = await launch(FLAGS(`${clip}%noloop`)); const p = await b.newPage(); await p.goto(URL_);
        const x = await record(p, 40, constraints);
        out[`speech_${label}`] = { rms_5_35s: +rms(x, 5, 35).toFixed(4), peak: +x.reduce((m, v) => Math.max(m, Math.abs(v)), 0).toFixed(3) };
        await b.close();
      }
      out.speech_default_vs_off_rms_ratio = +(out.speech_default.rms_5_35s / Math.max(1e-9, out.speech_off.rms_5_35s)).toFixed(2);
    }
    report('processing', out);
  }
} finally {
  server.close();
  rmSync(dir, { recursive: true, force: true });
}
if (refuted.length) { console.error(`REFUTED: ${refuted.join(' | ')}`); process.exit(1); }
console.log('probe: no fact the test depends on was refuted');
