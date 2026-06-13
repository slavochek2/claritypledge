#!/usr/bin/env bash
# new-deck.sh — scaffold a new slide deck under public/<name>/ with the proven
# /presi setup baked in: self-hosted GSAP + fonts (required under the live CSP,
# which is script-src 'self' / font-src 'self' — no CDN allowed) and a
# /<name> -> /<name>/ redirect so relative asset paths resolve.
#
# Usage:  ./scripts/new-deck.sh presi3
set -euo pipefail

NAME="${1:-}"
if [[ -z "$NAME" ]]; then
  echo "usage: ./scripts/new-deck.sh <name>   (e.g. presi3)"; exit 1
fi
if [[ ! "$NAME" =~ ^[a-z0-9][a-z0-9-]*$ ]]; then
  echo "error: name must be lowercase alphanumeric/hyphen (got '$NAME')"; exit 1
fi

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SRC="$ROOT/public/presi"          # canonical asset source (self-hosted gsap + fonts)
DST="$ROOT/public/$NAME"

if [[ -e "$DST" ]]; then
  echo "error: public/$NAME already exists — refusing to overwrite"; exit 1
fi
if [[ ! -f "$SRC/gsap.min.js" ]]; then
  echo "error: $SRC/gsap.min.js not found — is /presi present to copy assets from?"; exit 1
fi

# 1. assets — copy the self-hosted GSAP + fonts (CSP-safe, no CDN)
mkdir -p "$DST/fonts"
cp "$SRC/gsap.min.js" "$DST/"
cp "$SRC"/fonts/*.woff2 "$DST/fonts/"

# 2. starter index.html — cp design tokens + slide nav engine + motion layer.
#    Quoted heredoc: preserves the JS template literals (backticks / ${}) verbatim.
cat > "$DST/index.html" <<'HTML'
<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Deck</title>
<style>
  /* Self-hosted fonts (CSP: font-src 'self'). */
  @font-face{font-family:'Inter';font-style:normal;font-weight:100 900;font-display:swap;src:url('fonts/inter-latin.woff2') format('woff2')}
</style>
<style>
  :root{
    --bg:#ffffff; --fg:hsl(240 10% 3.9%); --card:#fff;
    --muted-soft:hsl(240 4.8% 97.6%); --muted-fg:hsl(240 3.8% 46.1%);
    --border:hsl(240 5.9% 90%); --blue:#3b82f6; --blue-700:#1d4ed8;
    --blue-tint:rgba(59,130,246,.10); --blue-tint-bd:rgba(59,130,246,.20);
    --sans:'Inter',system-ui,-apple-system,'Segoe UI',Roboto,sans-serif;
  }
  *{box-sizing:border-box;margin:0;padding:0}
  html,body{height:100%}
  body{background:#0a0a0b;font-family:var(--sans);color:var(--fg);overflow:hidden;-webkit-font-smoothing:antialiased}
  .deck{height:100vh;width:100vw;position:relative}
  .slide{position:absolute;inset:0;display:none;flex-direction:column;justify-content:center;align-items:center;
    text-align:center;padding:7vh 8vw;background:var(--bg);overflow:hidden}
  .slide.active{display:flex}
  .slide.soft{background:var(--muted-soft)}
  .slide.dark{background:var(--fg);color:#fafafa}
  .slide.active:not(.fx){animation:fade .45s ease}
  @keyframes fade{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:none}}
  .grid-bg::before{content:"";position:absolute;inset:0;z-index:0;pointer-events:none;opacity:.5;
    background-image:linear-gradient(to right,var(--border) 1px,transparent 1px),linear-gradient(to bottom,var(--border) 1px,transparent 1px);
    background-size:4rem 4rem;-webkit-mask-image:radial-gradient(ellipse at center,#000 35%,transparent 75%);mask-image:radial-gradient(ellipse at center,#000 35%,transparent 75%)}
  .slide > *{position:relative;z-index:1}
  h1{font-weight:800;line-height:1.07;letter-spacing:-.025em;font-size:clamp(2.1rem,6vw,5.2rem)}
  h2{font-weight:800;line-height:1.1;letter-spacing:-.02em;font-size:clamp(1.7rem,4.6vw,3.6rem)}
  .accent{color:var(--blue)} .dark .accent{color:#60a5fa}
  .lead{font-size:clamp(1.05rem,2.2vw,1.6rem);color:var(--muted-fg);margin-top:1.6rem;max-width:38ch;line-height:1.5;font-weight:500}
  .badge{display:inline-flex;align-items:center;gap:.5rem;padding:.45rem 1.1rem;border-radius:999px;background:var(--blue-tint);
    border:1px solid var(--blue-tint-bd);color:var(--blue-700);font-size:clamp(.62rem,1vw,.78rem);font-weight:600;text-transform:uppercase;letter-spacing:.18em;margin-bottom:2rem}
  .kicker{font-weight:700;text-transform:uppercase;letter-spacing:.2em;font-size:clamp(.6rem,1vw,.78rem);color:var(--blue);margin-bottom:1.4rem}
  .bignum{font-weight:900;color:var(--blue);font-size:clamp(5rem,20vw,15rem);line-height:1;letter-spacing:-.03em}
  .cards{display:flex;gap:clamp(.8rem,2vw,1.6rem);margin-top:2.4rem;flex-wrap:wrap;justify-content:center;max-width:74rem}
  .card{flex:1 1 220px;max-width:340px;background:var(--card);border:1px solid var(--border);border-radius:16px;
    padding:clamp(1.4rem,3vw,2.2rem) 1.4rem;box-shadow:0 1px 2px rgba(0,0,0,.04);text-align:left}
  .nav{position:absolute;bottom:2vh;right:2.2vw;font-size:.75rem;color:var(--muted-fg);z-index:20;font-variant-numeric:tabular-nums}
  .dark .nav{color:rgba(255,255,255,.55)}
  .progress{position:fixed;top:0;left:0;height:4px;background:var(--blue);transition:width .35s ease;z-index:30}
  @media (max-width:720px){
    body{overflow:auto} .deck{height:auto}
    .slide{position:relative;inset:auto;display:none;min-height:100dvh;padding:9vh 7vw}
    .slide.active{display:flex} .card{flex:1 1 100%}
  }
</style>
</head>
<body>
<div class="progress" id="progress"></div>
<div class="nav" id="nav"></div>
<div class="deck" id="deck">

  <section class="slide grid-bg">
    <div class="kicker">Kicker</div>
    <h1>Your <span class="accent">title</span> here.</h1>
    <p class="lead">Subtitle / lead line.</p>
  </section>

  <section class="slide soft">
    <div class="bignum" data-suffix="%">100%</div>
    <h2 style="margin-top:1.4rem;max-width:20ch">A stat that <span class="accent">counts up.</span></h2>
  </section>

  <section class="slide">
    <h2 style="max-width:18ch">A row of <span class="accent">cards.</span></h2>
    <div class="cards">
      <div class="card">Card one.</div>
      <div class="card">Card two.</div>
      <div class="card">Card three.</div>
    </div>
  </section>

</div>

<script defer src="gsap.min.js"></script>
<script>
  const slides=[...document.querySelectorAll('.slide')];
  let i=0;
  const nav=document.getElementById('nav'), prog=document.getElementById('progress');
  const FX={ show(){} };
  function show(n){
    i=Math.max(0,Math.min(slides.length-1,n));
    slides.forEach((s,k)=>s.classList.toggle('active',k===i));
    nav.textContent=(i+1)+' / '+slides.length;
    prog.style.width=((i+1)/slides.length*100)+'%';
    window.scrollTo(0,0); FX.show(i);
  }
  function next(){show(i+1)} function prev(){show(i-1)}
  document.addEventListener('keydown',e=>{
    if(['ArrowRight','ArrowDown',' ','PageDown'].includes(e.key)){e.preventDefault();next()}
    else if(['ArrowLeft','ArrowUp','PageUp'].includes(e.key)){e.preventDefault();prev()}
    else if(e.key==='Home'){show(0)} else if(e.key==='End'){show(slides.length-1)}
    else if(e.key==='f'){document.documentElement.requestFullscreen?.()}
  });
  document.getElementById('deck').addEventListener('click',e=>{
    if(e.target.closest('a')) return;
    (e.clientX < window.innerWidth*0.25)?prev():next();
  });
  show(0);

  /* Motion layer — feature-detected, reversible. ?plain or reduced-motion → static deck. */
  (function(){
    const params=new URLSearchParams(location.search);
    if(params.has('plain')) return;
    if(matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const mobile=matchMedia('(max-width:720px)').matches;
    function start(){
      const gsap=window.gsap; if(!gsap) return;
      document.body.classList.add('fx-on');
      function reveal(items,tl,at){
        if(!items.length) return;
        tl.fromTo(items,{opacity:0,y:10},{opacity:1,y:0,duration:.45,ease:'power2.out',stagger:.16,clearProps:'transform,opacity'}, at);
      }
      function countUp(slide,tl){
        const big=slide.querySelector('.bignum'); if(!big) return;
        const raw=big.dataset.target||(big.dataset.target=String(parseFloat((big.textContent||'').replace(/[^0-9.]/g,''))||0));
        const target=+raw, prefix=big.dataset.prefix||'', suffix=big.dataset.suffix||((big.textContent||'').includes('%')?'%':'');
        const dec=big.dataset.decimals?+big.dataset.decimals:0, group=big.dataset.group==='1';
        const fmt=v=>{let n=dec?(+v).toFixed(dec):String(Math.round(v)); if(group)n=(+n).toLocaleString('en-US'); return prefix+n+suffix;};
        big.dataset.final=fmt(target); const o={v:0}; big.textContent=fmt(0);
        tl.to(o,{v:target,duration:1.15,ease:'power2.out',onUpdate(){big.textContent=fmt(o.v);},onComplete(){big.textContent=big.dataset.final;}}, .2);
      }
      function chat(slide,tl){
        const seq=[...slide.querySelectorAll('.wa-body > *')]; if(!seq.length) return;
        gsap.set(seq,{opacity:0,y:12});
        tl.to(seq,{opacity:1,y:0,duration:.42,ease:'power2.out',stagger:.55,clearProps:'transform'}, .25);
      }
      let curTl=null;
      FX.show=function(idx){
        const slide=slides[idx]; slide.classList.add('fx');
        if(curTl) curTl.kill();
        document.querySelectorAll('.bignum[data-final]').forEach(b=>{b.textContent=b.dataset.final;});
        gsap.set(slide.querySelectorAll('*'),{clearProps:'transform,filter'});
        if(mobile) return;
        const tl=curTl=gsap.timeline();
        if(slide.querySelector('.bignum')) countUp(slide,tl);
        else if(slide.querySelector('.wa')) chat(slide,tl);
        else if(slide.querySelector('.cards')) reveal([...slide.querySelectorAll('.card')],tl,.1);
        else reveal([...slide.children],tl,.05);
      };
      FX.show(i);
    }
    if(document.readyState==='complete') start(); else addEventListener('load',start);
  })();
</script>
</body>
</html>
HTML

# 3. redirect — insert /<name> -> /<name>/ right after the "redirects": [ opener,
#    preserving the file's existing formatting (string insert, not a JSON round-trip).
node -e '
  const fs=require("fs"), p="vercel.json", name=process.argv[1], src="/"+name;
  let s=fs.readFileSync(p,"utf8");
  if(s.includes("\"source\": \""+src+"\"")){ console.log("redirect "+src+" already present"); process.exit(0); }
  const block="\n    {\n      \"source\": \""+src+"\",\n      \"destination\": \""+src+"/\",\n      \"permanent\": false\n    },";
  if(!/"redirects":\s*\[/.test(s)){ console.error("could not find redirects array in vercel.json"); process.exit(1); }
  s=s.replace(/("redirects":\s*\[)/, "$1"+block);
  fs.writeFileSync(p,s); console.log("added redirect "+src+" -> "+src+"/");
' "$NAME"

echo
echo "✓ scaffolded public/$NAME/"
echo "  preview:  npm run dev  →  http://localhost:5001/$NAME/"
echo "  edit:     public/$NAME/index.html"
