/**
 * @file video-summary-core.mjs
 * @description P1357: pure logic for the video-summary pipeline (draft → check → confirm), kept
 * free of network and database calls so it can be unit-tested. The CLI is scripts/video-summary.mjs.
 *
 * Shape written to public.video_summaries (P1349): tldr, summary prose, exactly 3 key points,
 * moments [{t: seconds, note}]. Writer and checker must be different vendors; the checker reads the
 * transcript the writer read (retained in the store), never a fresh fetch (P1140).
 */

export const KEY_POINTS = 3;
export const KEY_POINT_MAX_WORDS = 16; // prompt asks for ≤ ~12; reject only clear overruns
/** A moment must sit within this many seconds of a caption cue to be checkable at all. */
export const CUE_TOLERANCE_S = 20;

const YOUTUBE_ID = /^[A-Za-z0-9_-]{11}$/;

/** Accepts a bare id or any common YouTube URL shape; returns the 11-char id or null. */
export function parseVideoId(input) {
  const s = String(input ?? '').trim();
  if (YOUTUBE_ID.test(s)) return s;
  let u;
  try {
    u = new URL(s);
  } catch {
    return null;
  }
  const host = u.hostname.replace(/^www\.|^m\./, '');
  let id = null;
  if (host === 'youtu.be') id = u.pathname.slice(1).split('/')[0];
  else if (host === 'youtube.com' || host === 'youtube-nocookie.com') {
    if (u.pathname === '/watch') id = u.searchParams.get('v');
    else {
      const m = u.pathname.match(/^\/(?:shorts|embed|live|v)\/([^/?#]+)/);
      if (m) id = m[1];
    }
  }
  return id && YOUTUBE_ID.test(id) ? id : null;
}

/** WebVTT → [{t: seconds, text}], tags stripped, rolling auto-caption duplicates dropped. */
export function parseVtt(vtt) {
  const segs = [];
  let curT = null;
  let buf = [];
  const flush = () => {
    if (buf.length && curT !== null) segs.push({ t: curT, text: buf.join(' ').trim() });
    buf = [];
  };
  for (const raw of String(vtt).split('\n')) {
    const line = raw.trim();
    if (!line || line === 'WEBVTT' || /^(Kind|Language|NOTE)\b/.test(line)) continue;
    const tm = line.match(/^(\d{2}):(\d{2}):(\d{2})\.\d{3}\s+-->/);
    if (tm) {
      flush();
      curT = +tm[1] * 3600 + +tm[2] * 60 + +tm[3];
      continue;
    }
    if (/^\d+$/.test(line)) continue; // cue number
    const clean = line.replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').trim();
    if (clean) buf.push(clean);
  }
  flush();
  // Auto-captions repeat the previous line at the start of each cue; keep only new text.
  const out = [];
  for (const s of segs) {
    const prev = out[out.length - 1];
    if (prev && prev.text === s.text) continue;
    if (prev && s.text.startsWith(prev.text)) {
      const rest = s.text.slice(prev.text.length).trim();
      if (rest) out.push({ t: s.t, text: rest });
      continue;
    }
    out.push(s);
  }
  return out;
}

export function mmss(t) {
  const h = Math.floor(t / 3600);
  const m = Math.floor((t % 3600) / 60);
  const s = t % 60;
  const pad = (n) => String(n).padStart(2, '0');
  return h ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
}

export function toSeconds(ts) {
  if (typeof ts === 'number') return Number.isInteger(ts) ? ts : NaN;
  const parts = String(ts).trim().split(':');
  if (!parts.length || parts.length > 3 || parts.some((p) => !/^\d+$/.test(p))) return NaN;
  return parts.map(Number).reduce((a, b) => a * 60 + b, 0);
}

export function transcriptText(segs) {
  return segs.map((s) => `[${mmss(s.t)}] ${s.text}`).join('\n');
}

/** Writer prompt. P1349 shape + P1349's copyright rule; read-first's worth_reading dropped. */
export function writerPrompt(meta, segs, revise = null) {
  const prev = revise?.previous
    ? `\nYour previous draft (moment times in mm:ss):\n${JSON.stringify({ ...revise.previous, moments: revise.previous.moments.map((m) => ({ t: mmss(m.t), note: m.note })) }, null, 1)}\n`
    : '';
  const fix = revise?.failures?.length
    ? `${prev}\nAn independent checker rejected that draft for the reasons below. Revise it: keep every part the checker did not name word for word, and change only what is needed to fix each item — remove or correct each unsupported claim, and move or narrow each moment so its note covers only its own span.\n${revise.failures.map((f) => `- ${f}`).join('\n')}\n`
    : '';
  return `You summarise a public YouTube video for readers who will not watch all of it.

Video: "${meta.title}" — channel: ${meta.channel} — length ${mmss(meta.duration)}.

Rules (all mandatory):
- Neutral and whole-video: cover every speaker and every major part, in order. Do not take sides, rate the video, or judge any speaker.
- Our own words, never a transcript. A direct quote only where it supports a point: at most one line, in quotation marks, with its [mm:ss].
- No claims the speakers did not make. Name a person only when the transcript makes clear who is speaking or who is meant; the captions carry no speaker labels, so never guess who said something.
- "tldr": 1–2 sentences.
- "summary": prose paragraphs separated by a blank line, scaled to the video's substance.
- "key_points": exactly ${KEY_POINTS} items, each at most 12 words.
- "moments": 4–10 entries in time order, each marking where a part of the video starts; "t" is the [mm:ss] marker where that part begins; "note" says in one sentence what that part covers, and only what happens before the next moment.

${fix}
Return JSON only: {"tldr": string, "summary": string, "key_points": [string, string, string], "moments": [{"t": "mm:ss", "note": string}]}

Transcript:
${transcriptText(segs)}`;
}

export const WRITER_SCHEMA = {
  type: 'OBJECT',
  properties: {
    tldr: { type: 'STRING' },
    summary: { type: 'STRING' },
    key_points: { type: 'ARRAY', items: { type: 'STRING' } },
    moments: {
      type: 'ARRAY',
      items: { type: 'OBJECT', properties: { t: { type: 'STRING' }, note: { type: 'STRING' } }, required: ['t', 'note'] },
    },
  },
  required: ['tldr', 'summary', 'key_points', 'moments'],
};

const blank = (v) => typeof v !== 'string' || v.trim() === '';

/**
 * Validates the writer's raw JSON against P1349's shape and the video's duration.
 * Returns { ok, errors, draft } — draft has moments in seconds, sorted.
 */
export function validateDraft(raw, durationSeconds) {
  const errors = [];
  if (!raw || typeof raw !== 'object') return { ok: false, errors: ['writer output is not an object'], draft: null };
  if (blank(raw.tldr)) errors.push('tldr is blank');
  if (blank(raw.summary)) errors.push('summary is blank');
  const kps = Array.isArray(raw.key_points) ? raw.key_points : [];
  if (kps.length !== KEY_POINTS) errors.push(`expected exactly ${KEY_POINTS} key points, got ${kps.length}`);
  kps.forEach((k, i) => {
    if (blank(k)) errors.push(`key point ${i + 1} is blank`);
    else if (k.trim().split(/\s+/).length > KEY_POINT_MAX_WORDS) errors.push(`key point ${i + 1} is over ${KEY_POINT_MAX_WORDS} words`);
  });
  const moments = [];
  const ms = Array.isArray(raw.moments) ? raw.moments : [];
  if (!ms.length) errors.push('no moments');
  ms.forEach((m, i) => {
    const t = toSeconds(m?.t);
    if (!Number.isInteger(t)) errors.push(`moment ${i + 1} has an unreadable time "${m?.t}"`);
    else if (t < 0 || t > durationSeconds) errors.push(`moment ${i + 1} at ${m.t} is outside the video (0–${mmss(durationSeconds)})`);
    if (blank(m?.note)) errors.push(`moment ${i + 1} has a blank note`);
    if (Number.isInteger(t) && !blank(m?.note)) moments.push({ t, note: m.note.trim() });
  });
  moments.sort((a, b) => a.t - b.t);
  const draft = {
    tldr: typeof raw.tldr === 'string' ? raw.tldr.trim() : '',
    summary: typeof raw.summary === 'string' ? raw.summary.trim() : '',
    key_points: kps.map((k) => (typeof k === 'string' ? k.trim() : '')),
    moments,
  };
  return { ok: errors.length === 0, errors, draft };
}

/** Deterministic half of the check: every moment is in range and near a caption cue. */
export function mechanicalCheck(draft, segs, durationSeconds) {
  const failures = [];
  for (const m of draft.moments) {
    if (m.t < 0 || m.t > durationSeconds) failures.push(`moment ${mmss(m.t)} is outside the video`);
    else if (!segs.some((s) => Math.abs(s.t - m.t) <= CUE_TOLERANCE_S))
      failures.push(`moment ${mmss(m.t)} has no caption within ${CUE_TOLERANCE_S}s — nothing to check it against`);
  }
  if (draft.key_points.length !== KEY_POINTS) failures.push(`expected ${KEY_POINTS} key points`);
  return failures;
}

/** Items the checker must rule on, with stable ids. */
export function checkItems(draft, durationSeconds) {
  const items = [];
  draft.moments.forEach((m, i) => {
    const next = draft.moments[i + 1]?.t ?? durationSeconds;
    items.push({ id: `moment-${i + 1}`, kind: 'moment', t: mmss(m.t), until: next === undefined ? 'end' : mmss(next), text: m.note });
  });
  draft.key_points.forEach((k, i) => items.push({ id: `key-${i + 1}`, kind: 'key point', text: k }));
  items.push({ id: 'tldr', kind: 'tldr', text: draft.tldr });
  draft.summary
    .split(/\n\s*\n+/)
    .map((p) => p.trim())
    .filter(Boolean)
    .forEach((p, i) => items.push({ id: `para-${i + 1}`, kind: 'summary paragraph', text: p }));
  return items;
}

export function checkerPrompt(meta, segs, draft) {
  const items = checkItems(draft, meta.duration);
  return `You are the independent checker for an AI-written summary of a YouTube video. You did not write it. Your job is to find anything the transcript does not support. Be strict: a summary that misstates a named person is worse than no summary.

Video: "${meta.title}" — channel: ${meta.channel} — length ${mmss(meta.duration)}.

For EACH item below decide "pass" or "fail":
- moment: it marks where a part of the video starts, and the part runs until its "until" time. The part the note describes must begin within about 20 seconds of "t", and everything the note says must happen between "t" and "until". A note that describes something from outside that span is a fail.
- key point, tldr, summary paragraph: every factual claim must be supported by the transcript, and every named person must be someone the transcript names or clearly identifies. Attributing words to a person the transcript cannot place is a fail. Invented facts, numbers, names or conclusions are a fail. Your own wording differences are not a fail.

Return JSON only, no prose around it:
{"items": [{"id": string, "verdict": "pass" | "fail", "reason": string, "evidence": "mm:ss or empty"}]}
Return one entry for every id, and no other ids.

Items:
${JSON.stringify(items, null, 1)}

Transcript:
${transcriptText(segs)}`;
}

/**
 * The LAST balanced `{"items": …}` object in the text. Codex output echoes the prompt (which contains
 * braces and an example schema) before the answer, so the first `{` is never the reply.
 * Returns the parsed object, null when an items object exists but none parses, undefined when absent.
 */
export function lastItemsObject(text) {
  const starts = [...text.matchAll(/\{\s*"items"\s*:/g)].map((m) => m.index).reverse();
  if (!starts.length) return undefined;
  for (const start of starts) {
    let depth = 0;
    let inStr = false;
    let esc = false;
    for (let i = start; i < text.length; i++) {
      const c = text[i];
      if (inStr) {
        if (esc) esc = false;
        else if (c === '\\') esc = true;
        else if (c === '"') inStr = false;
        continue;
      }
      if (c === '"') inStr = true;
      else if (c === '{') depth++;
      else if (c === '}' && --depth === 0) {
        try {
          const obj = JSON.parse(text.slice(start, i + 1));
          if (Array.isArray(obj.items)) return obj;
        } catch {
          /* try an earlier candidate */
        }
        break;
      }
    }
  }
  return null;
}

/**
 * Parses the checker's reply. Anything malformed, missing an id, or with an unknown verdict counts
 * as a failure — the check fails closed.
 */
export function parseCheckerVerdict(text, draft) {
  const expected = checkItems(draft).map((i) => i.id);
  const found = lastItemsObject(String(text ?? ''));
  if (found === undefined && !String(text ?? '').includes('{')) return { pass: false, failures: ['checker returned no JSON'], results: [] };
  if (!found) return { pass: false, failures: ['checker returned malformed JSON'], results: [] };
  const parsed = found;
  const results = Array.isArray(parsed.items) ? parsed.items : [];
  const byId = new Map(results.map((r) => [r?.id, r]));
  const failures = [];
  for (const id of expected) {
    const r = byId.get(id);
    if (!r) failures.push(`${id}: checker gave no verdict`);
    else if (r.verdict === 'fail') failures.push(`${id}: ${r.reason || 'failed'}${r.evidence ? ` (${r.evidence})` : ''}`);
    else if (r.verdict !== 'pass') failures.push(`${id}: unknown verdict "${r.verdict}"`);
  }
  for (const r of results) if (r?.id && !expected.includes(r.id)) failures.push(`${r.id}: unexpected id from checker`);
  return { pass: failures.length === 0, failures, results };
}

/** Which transitions each command may make. Returns an error string, or null when allowed. */
export function transitionError(command, currentStatus, { force = false } = {}) {
  if (command === 'draft') {
    if (currentStatus && currentStatus !== 'draft' && !force)
      return `row is already ${currentStatus}; re-drafting would discard its check — pass --force to reset it to draft`;
    return null;
  }
  if (command === 'check') return currentStatus === 'draft' ? null : `check needs a draft row, found ${currentStatus ?? 'none'}`;
  if (command === 'confirm') return currentStatus === 'checked' ? null : `confirm needs a checked row, found ${currentStatus ?? 'none'}`;
  if (command === 'demote') return currentStatus ? null : 'no row to demote';
  return `unknown command ${command}`;
}

/** Writer and checker must be different vendors ("vendor:model"). */
export function sameVendor(a, b) {
  return String(a).split(':')[0] === String(b).split(':')[0];
}
