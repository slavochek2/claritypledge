// Render the ClarityPledge thumbnail (HTML/CSS) to a single PNG via headless Chrome.
// Static card — screenshot after a short settle, no animation timing to wait on.
// Text injected by element id so the shell never escapes HTML.
//   node render-thumb.mjs <html> <out.png> [--headline H] [--kicker K] [--vleft L] [--vright R] [--pw PATH]
// Wrap a word in *asterisks* in --headline to italicise + blue it (the clarity-flip accent).
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';

function arg(name, def=''){ const i=process.argv.indexOf(name); return i>=0 ? process.argv[i+1] : def; }
const htmlPath = resolve(process.argv[2]);
const outPng   = resolve(process.argv[3]);
const pwPath   = arg('--pw');
const photoArg = arg('--photo');   // optional: abs path to a background photo staged in WORK dir

const esc = s => s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
const fmt = s => esc(s).replace(/\*([^*]+)\*/g, '<em>$1</em>');

const pwMod = await import(pwPath ? pathToFileURL(pwPath).href : 'playwright-core');
const chromium = (pwMod.chromium ?? pwMod.default?.chromium);
if (!chromium) { console.error('could not resolve chromium from playwright-core'); process.exit(3); }

const browser = await chromium.launch({ channel:'chrome', headless:true,
  args:['--hide-scrollbars'] });
const ctx = await browser.newContext({
  viewport:{ width:1280, height:720 },
  deviceScaleFactor:2,                         // crisp type; screenshot stays 1280x720 logical
});
const p = await ctx.newPage();
await p.goto(pathToFileURL(htmlPath).href);
await p.evaluate(({headline,kicker,vleft,vright,photoFile}) => {
  const set=(id,html)=>{ const el=document.getElementById(id); if(el && html) el.innerHTML=html; };
  set('headline', headline); set('kicker', kicker); set('vleft', vleft); set('vright', vright);
  // no Venn labels → drop the whole motif so the headline can breathe
  if(!vleft && !vright){ const v=document.getElementById('venn'); if(v) v.style.display='none'; }
  ['kicker','headline','vleft','vright'].forEach(id=>{ const el=document.getElementById(id);
    if(el && !el.textContent.trim()) el.style.display='none'; });
  if(photoFile){
    document.body.classList.add('photo-mode');
    const photo = document.getElementById('photo');
    if(photo) photo.style.backgroundImage = `url('${photoFile}')`;
  }
}, { headline:fmt(arg('--headline')), kicker:fmt(arg('--kicker')),
     vleft:fmt(arg('--vleft')), vright:fmt(arg('--vright')),
     photoFile: photoArg ? pathToFileURL(resolve(photoArg)).href : '' });
await p.waitForTimeout(400);                    // let webfonts settle
await p.screenshot({ path: outPng });           // PNG; size = viewport × deviceScaleFactor
await ctx.close();
await browser.close();
console.log('thumb ->', outPng);
