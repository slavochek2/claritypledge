/**
 * p1608-verify-phrases.ts: re-verifies the corpus's expected phrases against audio with LOCAL Whisper, which is
 * independent of Gemini. For each clip's transcript (one .txt per speaker, written by `transcribe`):
 *   own    = how many of that speaker's own phrases Whisper heard in their clip (must be all of them to trust the corpus)
 *   bleed  = how many phrases of the OTHER speakers Whisper heard in the same clip (the quiet copy must be audible)
 *
 *   npx tsx scripts/p1608-verify-phrases.ts <corpus.json> <dir with A.txt B.txt C.txt> [--min-own N]
 * Exit 1 when any speaker has fewer own phrases than --min-own (default: all). Also reports which phrases failed.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { phraseIn } from '../e2e/helpers/p1608-matcher';

const [corpusPath, dir, ...rest] = process.argv.slice(2);
if (!corpusPath || !dir) { console.error('usage: p1608-verify-phrases.ts <corpus.json> <dir> [--min-own N]'); process.exit(2); }
const corpus = JSON.parse(readFileSync(corpusPath, 'utf8'));
const minOwn = rest.includes('--min-own') ? Number(rest[rest.indexOf('--min-own') + 1]) : null;
const names = Object.keys(corpus.speakers);
let bad = 0;
for (const clip of names) {
  const text = readFileSync(path.join(dir, `${clip}.txt`), 'utf8');
  for (const who of names) {
    const phrases = [...corpus.speakers[who].round1, ...corpus.speakers[who].round2] as { text: string }[];
    const heard = phrases.filter((p) => phraseIn(p.text, text));
    const missed = phrases.filter((p) => !heard.includes(p)).map((p) => p.text);
    const kind = who === clip ? 'own  ' : 'bleed';
    console.log(`clip ${clip} ${kind} ${who}: ${heard.length}/${phrases.length}${missed.length ? `  missing: ${missed.join(' | ')}` : ''}`);
    if (who === clip && heard.length < (minOwn ?? phrases.length)) bad++;
  }
}
process.exit(bad ? 1 : 0);
