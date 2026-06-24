// Render a brand card (HTML/CSS) to a webm via headless Chrome.
// Text is injected by element id so the shell never has to escape it.
// Convention: wrap a word in *asterisks* in --title to italicise it (Playfair italic).
//   node record.mjs <html> <outDir> <ms> [--title T] [--subtitle S] [--cta C] [--pw PATH]
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';

function arg(name, def=''){ const i=process.argv.indexOf(name); return i>=0 ? process.argv[i+1] : def; }
const htmlPath = resolve(process.argv[2]);
const outDir   = resolve(process.argv[3]);
const ms       = Number(process.argv[4] || 4300);
const pwPath   = arg('--pw');

const esc = s => s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
// escape, then turn *word* into <em>word</em>
const fmt = s => esc(s).replace(/\*([^*]+)\*/g, '<em>$1</em>');

const pwMod = await import(pwPath ? pathToFileURL(pwPath).href : 'playwright-core');
const chromium = (pwMod.chromium ?? pwMod.default?.chromium);
if (!chromium) { console.error('could not resolve chromium from playwright-core'); process.exit(3); }

const browser = await chromium.launch({ channel:'chrome', headless:true,
  args:['--force-device-scale-factor=1','--hide-scrollbars'] });
const ctx = await browser.newContext({
  viewport:{ width:1920, height:1080 },
  recordVideo:{ dir:outDir, size:{ width:1920, height:1080 } },
});
const p = await ctx.newPage();
await p.goto(pathToFileURL(htmlPath).href);
await p.evaluate(({title,subtitle,cta}) => {
  // only overwrite when a value was provided — leaves hardcoded template defaults intact
  const set=(id,html)=>{ const el=document.getElementById(id); if(el && html) el.innerHTML=html; };
  set('title', title); set('subtitle', subtitle); set('cta', cta);
  // collapse any field that ends up genuinely empty (e.g. unused title) so the flex gap closes
  ['title','subtitle','cta'].forEach(id=>{ const el=document.getElementById(id);
    if(el && !el.textContent.trim()) el.style.display='none'; });
}, { title:fmt(arg('--title')), subtitle:fmt(arg('--subtitle')), cta:fmt(arg('--cta')) });
await p.waitForTimeout(ms);
await ctx.close();
await browser.close();
console.log('recorded');
