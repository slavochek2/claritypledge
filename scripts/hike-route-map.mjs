#!/usr/bin/env node
/**
 * P1403 — bake a static route map (OpenTopoMap terrain + route line + Start/Cafe pins) into
 * one JPEG, so the event page shows a real map without loading tiles in the browser
 * (prod CSP img-src allows only our own media host).
 *
 * Usage: node scripts/hike-route-map.mjs <route.geojson> <out.jpg>
 * Upload the result to gs://claritypledge-story-images/hikes/<slug>/route-map.jpg and set
 * hike_details.route_map_url to its public URL.
 *
 * Tiles: OpenTopoMap (CC-BY-SA), data © OpenStreetMap contributors — the page caption
 * carries the attribution. One render fetches ~20 tiles, within the tile usage policy.
 */
import { readFileSync } from 'node:fs';
import { chromium } from 'playwright';

const [, , inPath, outPath] = process.argv;
if (!inPath || !outPath) {
  console.error('usage: hike-route-map.mjs <route.geojson> <out.jpg>');
  process.exit(2);
}

const W = 960;
const H = 540;
const PAD = 60;
const TILE = 256;

const geo = JSON.parse(readFileSync(inPath, 'utf8'));
const lines = [];
const points = {};
const visit = (g, kind) => {
  if (!g) return;
  if (g.type === 'FeatureCollection') g.features.forEach(f => visit(f));
  else if (g.type === 'Feature') visit(g.geometry, g.properties?.kind);
  else if (g.type === 'LineString') lines.push(g.coordinates);
  else if (g.type === 'MultiLineString') lines.push(...g.coordinates);
  else if (g.type === 'Point' && kind) points[kind] = g.coordinates;
};
visit(geo);
if (lines.length === 0) {
  console.error('no LineString in input');
  process.exit(1);
}
points.start ??= lines[0][0];

const all = [...lines.flat(), ...Object.values(points)];
const project = (lon, lat, z) => {
  const n = 2 ** z * TILE;
  const s = Math.sin((lat * Math.PI) / 180);
  return [((lon + 180) / 360) * n, (0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI)) * n];
};

// Largest zoom whose bbox fits inside the padded frame.
let z = 17;
for (; z > 8; z--) {
  const xs = all.map(p => project(p[0], p[1], z)[0]);
  const ys = all.map(p => project(p[0], p[1], z)[1]);
  if (Math.max(...xs) - Math.min(...xs) <= W - 2 * PAD && Math.max(...ys) - Math.min(...ys) <= H - 2 * PAD) break;
}
const pxs = all.map(p => project(p[0], p[1], z));
const cx = (Math.min(...pxs.map(p => p[0])) + Math.max(...pxs.map(p => p[0]))) / 2;
const cy = (Math.min(...pxs.map(p => p[1])) + Math.max(...pxs.map(p => p[1]))) / 2;
const ox = cx - W / 2;
const oy = cy - H / 2;
const toXY = ([lon, lat]) => {
  const [x, y] = project(lon, lat, z);
  return [x - ox, y - oy];
};

const tiles = [];
for (let tx = Math.floor(ox / TILE); tx <= Math.floor((ox + W) / TILE); tx++) {
  for (let ty = Math.floor(oy / TILE); ty <= Math.floor((oy + H) / TILE); ty++) {
    tiles.push(`<img src="https://a.tile.opentopomap.org/${z}/${tx}/${ty}.png" style="position:absolute;left:${tx * TILE - ox}px;top:${ty * TILE - oy}px;width:${TILE}px;height:${TILE}px">`);
  }
}
const path = lines
  .map(l => 'M' + l.map(p => toXY(p).map(v => v.toFixed(1)).join(' ')).join(' L'))
  .join(' ');
const pin = (kind, label, fill) => {
  if (!points[kind]) return '';
  const [x, y] = toXY(points[kind]);
  return `<circle cx="${x}" cy="${y}" r="9" fill="${fill}" stroke="#fff" stroke-width="3"/>
    <text x="${x + 14}" y="${y + 6}" font-family="system-ui,sans-serif" font-size="20" font-weight="700" fill="#111" paint-order="stroke" stroke="#fff" stroke-width="5">${label}</text>`;
};

const html = `<!doctype html><html><body style="margin:0">
<div style="position:relative;width:${W}px;height:${H}px;overflow:hidden">${tiles.join('')}
<svg width="${W}" height="${H}" style="position:absolute;left:0;top:0">
<path d="${path}" fill="none" stroke="#fff" stroke-width="9" stroke-linejoin="round" stroke-linecap="round"/>
<path d="${path}" fill="none" stroke="#e11d48" stroke-width="5" stroke-linejoin="round" stroke-linecap="round"/>
${pin('meet', 'Cafe', '#2563eb')}${pin('start', 'Start', '#111')}
</svg></div></body></html>`;

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 2, userAgent: 'ClarityPledge-hike-map/1.0 (+https://claritypledge.com)' });
await page.setContent(html, { waitUntil: 'networkidle' });
const broken = await page.evaluate(() => [...document.images].filter(i => !i.naturalWidth).length);
if (broken > 0) {
  console.error(`${broken} tile(s) failed to load`);
  await browser.close();
  process.exit(1);
}
await page.screenshot({ path: outPath, type: 'jpeg', quality: 82 });
await browser.close();
console.log(`wrote ${outPath} (zoom ${z}, ${tiles.length} tiles)`);
