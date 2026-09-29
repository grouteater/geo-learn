/* Geo Learn: geography practice. */
(() => {
'use strict';

/* ---------- storage ---------- */
const KEY = 'geolearn.v1';
let S = { seen:{}, xp:0, days:[], daily:{}, visited:{}, terr:true, wander:[] };
try { Object.assign(S, JSON.parse(localStorage.getItem(KEY)) || {}); } catch (e) {}
const save = () => { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) {} };

/* ---------- utils ---------- */
const $ = (s, r = document) => r.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const today = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; };
function mulberry(a){ return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
const hash = s => { let h = 2166136261; for (const ch of s) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619); } return h >>> 0; };
let rnd = Math.random;
const pick = a => a[Math.floor(rnd() * a.length)];
const shuffle = a => { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
const fmt = n => Math.round(n).toLocaleString('en-US');
const same4 = (a, b) => a && b && a.slice(0,4).toLowerCase() === b.slice(0,4).toLowerCase();
function toast(msg){ const t = document.createElement('div'); t.className = 'toast'; t.textContent = msg; document.body.appendChild(t); setTimeout(() => t.remove(), 1800); }

/* ---------- data ---------- */
let C = [], BY = {}, FLAGS = {}, WORLD = [], FEAT = [], TRIV = [], GEOM = {}, MAIN = {};
async function loadData(){
  const j = p => fetch(p).then(r => { if (!r.ok) throw new Error(p); return r.json(); });
  const [countries, flags, topo, feats, triv] = await Promise.all([
    j('data/countries.json'), j('data/flags.json'), j('data/world-50m.json'), j('data/features.json'), j('data/trivia.json')]);
  C = countries; FLAGS = flags; FEAT = feats; TRIV = triv;
  C.forEach(c => BY[c.cca3] = c);
  WORLD = topojson.feature(topo, topo.objects.countries).features;
  const byN = {}; WORLD.forEach(f => { if (f.id) byN[f.id] = f; if (f.properties.name === 'Kosovo') byN.KOS = f; });
  C.forEach(c => { const f = c.cca3 === 'UNK' ? byN.KOS : byN[c.ccn3]; if (f) { GEOM[c.cca3] = f; f.cca3 = c.cca3; } });
  for (const k in GEOM) MAIN[k] = mainland(GEOM[k]);
  buildNames();
}
/* keep the polygons near the largest one so far-flung islands don't wreck shapes and globe framing */
function mainland(f){
  const g = f.geometry; if (!g) return f;
  if (g.type !== 'MultiPolygon') return f;
  const polys = g.coordinates.map(c => ({ type:'Feature', geometry:{ type:'Polygon', coordinates:c } }));
  let big = polys[0], ba = 0;
  polys.forEach(p => { const a = d3.geoArea(p); if (a > ba) { ba = a; big = p; } });
  const cen = d3.geoCentroid(big);
  const keep = polys.filter(p => { const d = d3.geoDistance(d3.geoCentroid(p), cen); return d < 0.12 || (d < 0.45 && d3.geoArea(p) > ba * 0.01); });
  return { type:'Feature', geometry:{ type:'MultiPolygon', coordinates: keep.map(p => p.geometry.coordinates) } };
}
const pool = () => C.filter(c => c.cca3 !== 'ATA' && (S.terr || c.independent));
const center = c => MAIN[c.cca3] ? d3.geoCentroid(MAIN[c.cca3]) : [c.latlng[1], c.latlng[0]];
function angOf(c){ // angular radius (radians) that frames the country nicely
  if (MAIN[c.cca3]) { const b = d3.geoBounds(MAIN[c.cca3]); const cen = center(c);
    const r = Math.max(d3.geoDistance(cen, b[0]), d3.geoDistance(cen, b[1]), d3.geoDistance(cen,[b[0][0],b[1][1]]), d3.geoDistance(cen,[b[1][0],b[0][1]]));
    return Math.min(1.5, Math.max(0.09, r * 2.2)); }
  return 0.12;
}
const flagSvg = cca3 => FLAGS[cca3] || '';
const flagBox = (cca3, cls = 'flagbox') => `<div class="${cls}" role="img" aria-label="flag">${flagSvg(cca3)}</div>`;

/* distractors: prefer same subregion, then region, then anything */
function others(c, n, ok = () => true){
  const base = pool().filter(x => x !== c && ok(x));
  const tiers = [base.filter(x => x.subregion === c.subregion), base.filter(x => x.region === c.region && x.subregion !== c.subregion), base.filter(x => x.region !== c.region)];
  const out = [];
  for (const t of tiers) for (const x of shuffle(t)) { if (out.length >= n) break; if (!out.includes(x)) out.push(x); }
  return out;
}

/* ---------- wikipedia (images + summaries) ---------- */
let WIKI_OK = null; const WCACHE = {};
async function probeWiki(){
  try { const ctl = new AbortController(); setTimeout(() => ctl.abort(), 4000);
    const r = await fetch('https://en.wikipedia.org/api/rest_v1/page/summary/Earth', { signal: ctl.signal }); WIKI_OK = r.ok; }
  catch (e) { WIKI_OK = false; }
}
async function wiki(title){
  if (WIKI_OK === false || !title) return null;
  if (WCACHE[title]) return WCACHE[title];
  const get = async t => { const r = await fetch('https://en.wikipedia.org/api/rest_v1/page/summary/' + encodeURIComponent(t.replace(/ /g,'_'))); if (!r.ok) return null; return r.json(); };
  try {
    let d = await get(title);
    if (d && d.type === 'disambiguation') d = await get(title + ' (country)') || d;
    WCACHE[title] = d; return d;
  } catch (e) { return null; }
}
const wikiTitle = c => ({ GEO:'Georgia (country)', COG:'Republic of the Congo', COD:'Democratic Republic of the Congo', IRL:'Republic of Ireland', MAC:'Macau', PSE:'State of Palestine', UNK:'Kosovo', MMR:'Myanmar', CIV:"Côte d'Ivoire", MKD:'North Macedonia', FSM:'Federated States of Micronesia', GMB:'The Gambia', BHS:'The Bahamas' }[c.cca3] || c.name);
function wikiBlock(el, title, opts = {}){
  if (!el) return;
  if (WIKI_OK === false) { el.innerHTML = `<p><a href="https://en.wikipedia.org/wiki/${encodeURIComponent(title)}" target="_blank" rel="noopener">Read about ${esc(title)} on Wikipedia</a></p>`; return; }
  el.innerHTML = '<p class="muted">Loading…</p>';
  wiki(title).then(d => {
    if (!d) { el.innerHTML = ''; return; }
    const img = (d.originalimage && d.originalimage.width < 2600 ? d.originalimage.source : d.thumbnail && d.thumbnail.source);
    const ex = opts.short ? (d.extract || '').split(/(?<=\.)\s/).slice(0,2).join(' ') : d.extract;
    el.innerHTML = `${img ? `<img src="${esc(img)}" alt="${esc(d.title)}" loading="lazy">` : ''}<p>${linkify(ex)}</p>
      <p><a href="${esc(d.content_urls?.desktop?.page || '')}" target="_blank" rel="noopener">More on Wikipedia</a></p>`;
  });
}

/* ---------- globe ---------- */
const GW = 600, GH = 380;
class Globe {
  constructor(host, { tap } = {}){
    this.host = host; host.classList.add('globe');
    this.proj = d3.geoOrthographic().translate([GW/2, GH/2]).clipAngle(90).rotate([0,-20]).scale(GH/2*.95);
    this.path = d3.geoPath(this.proj);
    const svg = this.svg = d3.select(host).append('svg').attr('viewBox', `0 0 ${GW} ${GH}`).attr('role','img');
    this.sphere = svg.append('path').datum({type:'Sphere'}).attr('class','sphere');
    this.grat = svg.append('path').datum(d3.geoGraticule10()).attr('class','grat');
    this.lands = svg.append('g').selectAll('path').data(WORLD).join('path').attr('class','land');
    this.over = svg.append('g');
    this.cls = {}; this.marks = [];
    if (tap) { host.classList.add('tapme'); svg.on('click', ev => {
      const p = d3.pointer(ev, svg.node()); const ll = this.proj.invert(p);
      const r = this.proj.rotate(); if (!ll || d3.geoDistance(ll, [-r[0], -r[1]]) > Math.PI/2) return;
      tap(ll);
    }); }
    this.draw();
  }
  scaleFor(ang){ const hw = GH/2*.95; return ang >= Math.PI/2 ? hw : hw / Math.sin(ang); }
  draw(){
    this.sphere.attr('d', this.path); this.grat.attr('d', this.path);
    this.lands.attr('d', this.path).attr('class', d => 'land' + (d.cca3 && this.cls[d.cca3] ? ' ' + this.cls[d.cca3] : ''));
    const g = this.over; g.selectAll('*').remove();
    const r = this.proj.rotate();
    for (const m of this.marks) {
      if (d3.geoDistance(m.ll, [-r[0], -r[1]]) > Math.PI/2 - 0.02) continue;
      const [x, y] = this.proj(m.ll);
      if (m.type === 'ring') g.append('circle').attr('class','ring').attr('cx',x).attr('cy',y).attr('r',14);
      else g.append('circle').attr('class', m.type === 'tap' ? 'tap' : 'pin').attr('cx',x).attr('cy',y).attr('r',7);
      if (m.label) g.append('text').attr('class','lbl').attr('x',x+11).attr('y',y+4).attr('text-anchor', x > GW*.7 ? 'end' : 'start').attr('dx', x > GW*.7 ? -22 : 0).text(m.label);
    }
  }
  view({ ll = [0,20], ang = Math.PI/2, cls = {}, marks = [], dur = 750 } = {}){
    this.cls = cls; this.marks = marks;
    const r0 = this.proj.rotate(), s0 = this.proj.scale();
    const r1 = [-ll[0], -Math.max(-70, Math.min(70, ll[1])), 0], s1 = this.scaleFor(ang);
    if (Math.abs(r1[0] - r0[0]) > 180) r1[0] += r1[0] > r0[0] ? -360 : 360;
    if (!dur || matchMedia('(prefers-reduced-motion: reduce)').matches) { this.proj.rotate(r1).scale(s1); this.draw(); return; }
    const ir = d3.interpolate(r0, r1), is = d3.interpolate(s0, s1);
    const outS = Math.min(s0, s1, this.scaleFor(Math.PI/2) * 1.0);
    d3.select(this.host).interrupt().transition().duration(dur).ease(d3.easeCubicInOut).tween('spin', () => t => {
      const dip = Math.sin(Math.PI * t) * 0.5; // pull out a little mid-flight, then dive in
      this.proj.rotate(ir(t)).scale(is(t) * (1 - dip) + outS * dip); this.draw();
    });
  }
}
/* markers for tiny countries that would be invisible */
function countryMarks(c, type = 'ring'){ return (!GEOM[c.cca3] || c.area < 25000) ? [{ ll: center(c), type }] : []; }

function shapeSvg(c){
  const f = MAIN[c.cca3]; if (!f) return '';
  const p = d3.geoAzimuthalEqualArea().rotate(center(c).map(v => -v)).fitExtent([[16,16],[304,224]], f);
  return `<svg viewBox="0 0 320 240" width="100%" role="img" aria-label="country silhouette"><path d="${d3.geoPath(p)(f)}"/></svg>`;
}

/* ---------- facts panel for a country ---------- */
function countryFacts(c){
  const nb = c.borders.map(b => BY[b]?.name).filter(Boolean);
  const rows = [
    ['Capital', c.capital.join(', ') || 'None'], ['Region', c.subregion || c.region],
    ['Area', fmt(c.area) + ' km²'], ['Languages', c.languages.join(', ')], ['Currency', c.currencies.join(', ')],
    ['People', c.demonym], ['Borders', nb.length ? { html: c.borders.filter(b => BY[b]).map(b => clink(BY[b])).join(', ') } : (c.landlocked ? 'Landlocked' : 'None (island or coast only)')],
    ['Domain · Dial', `${c.tld || '–'} · ${c.phone || '–'}`], ['Status', c.independent ? (c.un ? 'Sovereign, UN member' : 'Sovereign, not in the UN') : 'Territory or dependency'],
  ];
  return `<dl class="facts">${rows.filter(r => r[1]).map(r => `<dt>${r[0]}</dt><dd>${r[1].html || esc(r[1])}</dd>`).join('')}</dl>`;
}

/* ---------- country links: any country name in the app opens a profile panel ---------- */
const clink = (c, label) => `<button type="button" class="clink" data-country="${c.cca3}">${esc(label || c.name)}</button>`;
let NAME_RE = null; const NAME_MAP = {};
function buildNames(){
  C.forEach(c => NAME_MAP[c.name] = c.cca3);
  Object.assign(NAME_MAP, { "Côte d'Ivoire":'CIV', 'Democratic Republic of the Congo':'COD', 'Czech Republic':'CZE', 'East Timor':'TLS', 'Burma':'MMR', 'Swaziland':'SWZ', 'Vatican':'VAT', 'UK':'GBR', 'USA':'USA', 'US':'USA', 'Persia':'IRN', 'Siam':'THA', 'Ceylon':'LKA' });
  const names = Object.keys(NAME_MAP).sort((a, b) => b.length - a.length).map(n => n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  NAME_RE = new RegExp(`(?<![\\p{L}])(?<!New |Gulf of |Northern |Lake |Mount |Sea of |South )(${names.join('|')})(?![\\p{L}])(?! River| Delta| Basin| Canal)`, 'gu');
}
function linkify(text){
  text = String(text ?? ''); if (!NAME_RE) return esc(text);
  let out = '', last = 0;
  for (const m of text.matchAll(NAME_RE)) { out += esc(text.slice(last, m.index)) + clink(BY[NAME_MAP[m[0]]], m[0]); last = m.index + m[0].length; }
  return out + esc(text.slice(last));
}
async function wikiIntro(el, title){
  if (!el) return;
  const link = `https://en.wikipedia.org/wiki/${encodeURIComponent(title.replace(/ /g, '_'))}`;
  if (WIKI_OK === false) { el.innerHTML = `<p><a href="${link}" target="_blank" rel="noopener">Read about ${esc(title)} on Wikipedia</a></p>`; return; }
  el.innerHTML = '<p class="muted">Loading…</p>';
  try {
    const u = `https://en.wikipedia.org/w/api.php?action=query&format=json&origin=*&redirects=1&prop=extracts|pageimages&exintro=1&explaintext=1&piprop=thumbnail&pithumbsize=900&titles=${encodeURIComponent(title)}`;
    const d = await (await fetch(u)).json();
    const p = Object.values(d.query?.pages || {})[0];
    if (!p || p.missing !== undefined) throw new Error('missing');
    const paras = (p.extract || '').split(/\n+/).filter(x => x.trim());
    el.innerHTML = `${p.thumbnail ? `<img src="${esc(p.thumbnail.source)}" alt="${esc(p.title)}" loading="lazy">` : ''}
      ${paras.map(x => `<p>${linkify(x)}</p>`).join('')}<p><a href="https://en.wikipedia.org/?curid=${p.pageid}" target="_blank" rel="noopener">Continue reading on Wikipedia</a></p>`;
  } catch (e) { el.innerHTML = `<p><a href="${link}" target="_blank" rel="noopener">Read about ${esc(title)} on Wikipedia</a></p>`; }
}
function countryCard(c, p){
  const feats = FEAT.filter(f => f.where.includes(c.name));
  return `<div class="learn-head">${flagBox(c.cca3)}<div><h3>${esc(c.name)}</h3><div class="muted" style="font-size:13px">${esc(c.official)}</div><div class="coord">${ll2txt(c.latlng[0], c.latlng[1])}</div></div></div>
    <div id="${p}globe"></div>${countryFacts(c)}
    ${feats.length ? `<div><div class="eyebrow">Physical features</div><p class="note">${feats.map(f => esc(f.name)).join(' · ')}</p></div>` : ''}
    <div class="wiki full" id="${p}wiki"></div>`;
}
function mountCountryCard(c, p, root = document){
  const g = new Globe($(`#${p}globe`, root)); g.view({ ll:center(c), ang:Math.max(angOf(c) * 1.4, 0.25), cls:{ [c.cca3]:'hl' }, marks:countryMarks(c), dur:0 });
  wikiIntro($(`#${p}wiki`, root), wikiTitle(c));
}
const sheet = [];
function openCountry(cca3){ if (!BY[cca3]) return; if (sheet[sheet.length - 1] !== cca3) sheet.push(cca3); drawSheet(); }
function closeSheet(){ sheet.length = 0; drawSheet(); }
function drawSheet(){
  let el = $('#sheet');
  if (!sheet.length) { if (el) el.remove(); document.documentElement.classList.remove('sheet-open'); return; }
  if (!el) { el = document.createElement('div'); el.id = 'sheet'; el.className = 'sheet-wrap'; document.body.appendChild(el);
    el.addEventListener('click', e => { if (e.target === el) closeSheet(); }); }
  document.documentElement.classList.add('sheet-open');
  const c = BY[sheet[sheet.length - 1]]; S.visited[c.cca3] = 1; save();
  el.innerHTML = `<div class="sheet" role="dialog" aria-modal="true" aria-label="${esc(c.name)}">
    <div class="sheet-bar">${sheet.length > 1 ? `<button class="iconbtn" data-sheet="back" aria-label="Back to ${esc(BY[sheet[sheet.length - 2]].name)}">←</button>` : ''}<div class="title">${esc(c.name)}</div><button class="iconbtn" data-sheet="close" aria-label="Close">✕</button></div>
    <div class="learn-body" style="padding:0">${countryCard(c, 's')}</div></div>`;
  mountCountryCard(c, 's', el);
  $('.sheet', el).scrollTop = 0; $('[data-sheet="close"]', el).focus({ preventScroll:true });
}
document.addEventListener('click', e => {
  const b = e.target.closest('[data-country]'); if (b) { e.preventDefault(); openCountry(b.dataset.country); return; }
  const s = e.target.closest('[data-sheet]'); if (s) { if (s.dataset.sheet === 'back') { sheet.pop(); drawSheet(); } else closeSheet(); }
});
document.addEventListener('keydown', e => { if (e.key === 'Escape' && sheet.length) { sheet.pop(); drawSheet(); } });
const ll2txt = (lat, lng) => `${Math.abs(lat).toFixed(1)}°${lat >= 0 ? 'N' : 'S'} ${Math.abs(lng).toFixed(1)}°${lng >= 0 ? 'E' : 'W'}`;

/* ---------- question generators ----------
   Each generator lists stable ids and builds a question from an id. The picker always serves
   unseen ids first, so nothing repeats until a whole pool is exhausted. */
const TYPEGROUP = t => /River|Lake|Waterfall|Sea|Bay|Strait|Canal|Fjord|Delta|Wetland|Lakes|trench|Sinkhole|Reef/.test(t) ? 'water'
  : /Mountain|Volcano|Tepui|Glacier|Plateau|Hills/.test(t) ? 'high'
  : /Desert|Dunes|Salt|Canyon|Depression|Valley|Crater|Hydrothermal|Rift/.test(t) ? 'dry' : 'land';
function featOthers(f, n, key = 'name'){
  const byType = shuffle(FEAT.filter(x => x !== f && x.type === f.type));
  const byGroup = shuffle(FEAT.filter(x => x !== f && x.type !== f.type && TYPEGROUP(x.type) === TYPEGROUP(f.type)));
  const out = [];
  for (const x of [...byType, ...byGroup, ...shuffle(FEAT)]) { if (out.length >= n) break; if (x !== f && !out.some(o => o[key] === x[key]) && x[key] !== f[key]) out.push(x); }
  return out;
}
function countryLearn(c, extra = ''){
  return { kind:'country', c, title:c.name, sub:c.official !== c.name ? c.official : '', extra, globe:{ ll:center(c), ang:angOf(c), cls:{[c.cca3]:'hl'}, marks:countryMarks(c) }, wiki:wikiTitle(c) };
}
function mcq(answer, wrongs, render = x => x){ const opts = shuffle([answer, ...wrongs]); return { opts: opts.map(render), ans: opts.indexOf(answer) }; }

const G = {
  flag: { label:'Flag → country', ids: () => pool().map(c => 'flag:' + c.cca3), make(id){
    const c = BY[id.slice(5)]; const m = mcq(c, others(c, 3), x => ({ text:x.name, cca3:x.cca3 }));
    return { eyebrow:'Whose flag is this?', title:'Name the country', media:{ kind:'flag', cca3:c.cca3 }, ...m, learn:countryLearn(c) }; } },
  flagr: { label:'Country → flag', ids: () => pool().map(c => 'flagr:' + c.cca3), make(id){
    const c = BY[id.slice(6)]; const m = mcq(c, others(c, 3), x => ({ flag:x.cca3, cca3:x.cca3, text:x.name }));
    return { eyebrow:'Pick the flag', title:c.name, grid:true, ...m, learn:countryLearn(c) }; } },
  cap: { label:'Capitals', ids: () => pool().filter(c => c.capital.length).map(c => 'cap:' + c.cca3), make(id){
    const c = BY[id.slice(4)]; const m = mcq(c, others(c, 3, x => x.capital.length), x => ({ text:x.capital[0], cca3:x.cca3 }));
    return { eyebrow:'Capital city', title:`What is the capital of ${c.name}?`, media:{ kind:'flag', cca3:c.cca3, small:true }, ...m, learn:countryLearn(c) }; } },
  capr: { label:'Capital → country', ids: () => pool().filter(c => c.capital.length).map(c => 'capr:' + c.cca3), make(id){
    const c = BY[id.slice(5)]; const m = mcq(c, others(c, 3), x => ({ text:x.name, cca3:x.cca3 }));
    return { eyebrow:'Capital city', title:`${c.capital[0]} is the capital of…`, ...m, learn:countryLearn(c) }; } },
  map: { label:'Highlighted country', ids: () => pool().filter(c => GEOM[c.cca3] || c.area < 25000).map(c => 'map:' + c.cca3), make(id){
    const c = BY[id.slice(4)];
    const nb = shuffle(c.borders.map(b => BY[b]).filter(x => x && pool().includes(x))).slice(0, 2);
    const m = mcq(c, [...nb, ...others(c, 3 - nb.length, x => !nb.includes(x))], x => ({ text:x.name, cca3:x.cca3 }));
    return { eyebrow:'Map', title:'Which country is highlighted?', media:{ kind:'globe', view:{ ll:center(c), ang:Math.max(angOf(c), 0.25), cls:{[c.cca3]:'hl'}, marks:countryMarks(c) } }, ...m, learn:countryLearn(c) }; } },
  find: { label:'Locate on map', ids: () => pool().filter(c => GEOM[c.cca3] && c.area > 1500).map(c => 'find:' + c.cca3), make(id){
    const c = BY[id.slice(5)];
    const peers = pool().filter(x => x.subregion === c.subregion && GEOM[x.cca3]);
    const pts = peers.map(center); const avg = [d3.mean(pts, p => p[0]), d3.mean(pts, p => p[1])];
    if (Math.max(...pts.map(p => p[0])) - Math.min(...pts.map(p => p[0])) > 180) avg[0] = center(c)[0];
    const reach = Math.max(...pts.map(p => d3.geoDistance(p, avg)), d3.geoDistance(center(c), avg)) + 0.12;
    return { eyebrow:`Map · ${c.subregion || c.region}`, title:`Find ${c.name}`, tap:true, target:c, media:{ kind:'globe', view:{ ll:avg, ang:Math.min(1.5, Math.max(0.3, reach)) } }, learn:countryLearn(c) }; } },
  shape: { label:'Outlines', ids: () => pool().filter(c => MAIN[c.cca3] && c.area > 900 && c.region !== 'Antarctic').map(c => 'shape:' + c.cca3), make(id){
    const c = BY[id.slice(6)]; const m = mcq(c, others(c, 3, x => MAIN[x.cca3] && x.region !== 'Antarctic'), x => ({ text:x.name, cca3:x.cca3 }));
    return { eyebrow:'Outline', title:'Whose outline is this?', media:{ kind:'shape', cca3:c.cca3 }, ...m, learn:countryLearn(c) }; } },
  nb: { label:'Neighbors', ids: () => pool().filter(c => c.borders.some(b => BY[b])).map(c => 'nb:' + c.cca3), make(id){
    const c = BY[id.slice(3)]; const nbs = c.borders.map(b => BY[b]).filter(Boolean); const a = pick(nbs);
    const m = mcq(a, others(c, 3, x => !c.borders.includes(x.cca3) && x !== a), x => ({ text:x.name, cca3:x.cca3 }));
    return { eyebrow:'Neighbors', title:`Which of these shares a border with ${c.name}?`, media:{ kind:'flag', cca3:c.cca3, small:true }, ...m,
      learn:{ ...countryLearn(c), extra:`${c.name} borders ${nbs.map(x => x.name).join(', ')}.`, globe:{ ll:center(c), ang:Math.max(angOf(c)*1.6, 0.3), cls:Object.fromEntries([[c.cca3,'hl'], ...nbs.map(x => [x.cca3,'right'])]), marks:countryMarks(c) } } }; } },
  sub: { label:'Regions', ids: () => pool().filter(c => c.subregion).map(c => 'sub:' + c.cca3), make(id){
    const c = BY[id.slice(4)]; const subs = [...new Set(C.map(x => x.subregion).filter(Boolean))];
    const near = shuffle(subs.filter(s => s !== c.subregion && C.some(x => x.subregion === s && x.region === c.region)));
    const m = mcq(c.subregion, [...near, ...shuffle(subs.filter(s => s !== c.subregion && !near.includes(s)))].slice(0, 3), x => ({ text:x }));
    return { eyebrow:'Regions', title:`Which region is ${c.name} in?`, media:{ kind:'flag', cca3:c.cca3, small:true }, ...m, learn:countryLearn(c) }; } },
  cur: { label:'Currencies', ids(){ const cnt = {}; C.forEach(c => c.currencies.forEach(x => cnt[x] = (cnt[x] || 0) + 1));
      return pool().filter(c => c.currencies.some(x => cnt[x] === 1)).map(c => 'cur:' + c.cca3); }, make(id){
    const c = BY[id.slice(4)]; const cnt = {}; C.forEach(x => x.currencies.forEach(y => cnt[y] = (cnt[y] || 0) + 1));
    const cur = c.currencies.find(x => cnt[x] === 1);
    const m = mcq(c, others(c, 3), x => ({ text:x.name, cca3:x.cca3 }));
    return { eyebrow:'Money', title:`Where do you pay with the ${cur}?`, ...m, learn:countryLearn(c) }; } },
  lang: { label:'Languages', ids(){ const cnt = {}; C.forEach(c => c.languages.forEach(x => cnt[x] = (cnt[x] || 0) + 1));
      return pool().filter(c => c.languages.some(x => cnt[x] === 1 && !same4(x, c.name))).map(c => 'lang:' + c.cca3); }, make(id){
    const c = BY[id.slice(5)]; const cnt = {}; C.forEach(x => x.languages.forEach(y => cnt[y] = (cnt[y] || 0) + 1));
    const l = c.languages.find(x => cnt[x] === 1 && !same4(x, c.name));
    const m = mcq(c, others(c, 3), x => ({ text:x.name, cca3:x.cca3 }));
    return { eyebrow:'Languages', title:`${l} is an official language of…`, ...m, learn:countryLearn(c) }; } },
  dem: { label:'Demonyms', ids: () => pool().filter(c => c.demonym && !same4(c.demonym, c.name)).map(c => 'dem:' + c.cca3), make(id){
    const c = BY[id.slice(4)]; const m = mcq(c, others(c, 3), x => ({ text:x.name, cca3:x.cca3 }));
    return { eyebrow:'Demonyms', title:`Someone called “${c.demonym}” comes from…`, ...m, learn:countryLearn(c) }; } },
  tld: { label:'Web domains', ids: () => pool().filter(c => c.tld).map(c => 'tld:' + c.cca3), make(id){
    const c = BY[id.slice(4)]; const m = mcq(c, others(c, 3), x => ({ text:x.name, cca3:x.cca3 }));
    return { eyebrow:'Internet', title:`Websites ending in ${c.tld} belong to…`, ...m, learn:countryLearn(c) }; } },
  tel: { label:'Dialing codes', ids(){ const cnt = {}; C.forEach(c => cnt[c.phone] = (cnt[c.phone] || 0) + 1);
      return pool().filter(c => c.phone && cnt[c.phone] === 1).map(c => 'tel:' + c.cca3); }, make(id){
    const c = BY[id.slice(4)]; const m = mcq(c, others(c, 3), x => ({ text:x.name, cca3:x.cca3 }));
    return { eyebrow:'Dialing codes', title:`Calls to ${c.phone} ring in…`, ...m, learn:countryLearn(c) }; } },
  trivia: { label:'Trivia', ids: () => TRIV.map(t => 'triv:' + t.id), make(id){
    const t = TRIV.find(x => x.id === id.slice(5)); const m = mcq(t.a, t.w, x => ({ text:x }));
    return { eyebrow:`Trivia · ${t.cat}`, title:t.q, ...m, learn:{ kind:'note', title:t.a, note:t.note } }; } },
  featphoto: { label:'Photo ID', needsWiki:true, ids: () => FEAT.map(f => 'fp:' + f.id), make(id){
    const f = FEAT.find(x => x.id === id.slice(3)); const m = mcq(f, featOthers(f, 3), x => ({ text:x.name }));
    return { eyebrow:f.type, title:`Identify this ${f.type.toLowerCase()}`, media:{ kind:'photo', wiki:f.wiki }, ...m, learn:featLearn(f) }; } },
  featwhere: { label:'Where is it?', ids: () => FEAT.map(f => 'fw:' + f.id), make(id){
    const f = FEAT.find(x => x.id === id.slice(3)); const m = mcq(f, featOthers(f, 3, 'where'), x => ({ text:x.where }));
    return { eyebrow:f.type, title:`Where would you find ${f.name}?`, ...m, learn:featLearn(f) }; } },
  featpin: { label:'Map pin', ids: () => FEAT.map(f => 'fpin:' + f.id), make(id){
    const f = FEAT.find(x => x.id === id.slice(5)); const m = mcq(f, featOthers(f, 3), x => ({ text:x.name }));
    return { eyebrow:f.type, title:`Which ${f.type.toLowerCase()} is at the pin?`, media:{ kind:'globe', view:{ ll:[f.lng, f.lat], ang:0.45, marks:[{ ll:[f.lng, f.lat], type:'pin' }] } }, ...m, learn:featLearn(f) }; } },
  size: { label:'Area comparison', dyn:true, make(){
    const big = pool().filter(c => c.independent && c.area > 5000);
    let a, b; do { a = pick(big); b = pick(big); } while (a === b || Math.max(a.area, b.area) / Math.min(a.area, b.area) > 6);
    const win = a.area > b.area ? a : b;
    return { id:`size:${a.cca3}:${b.cca3}`, eyebrow:'Area comparison', title:'Which country covers more land?', duel:[a, b], ans: win === a ? 0 : 1,
      opts:[a, b].map(x => ({ text:x.name, cca3:x.cca3 })), learn:{ kind:'duel', a, b,
      title:`${win.name} is ${(Math.max(a.area,b.area)/Math.min(a.area,b.area)).toFixed(1)}× larger`,
      globe:{ ll:d3.geoInterpolate(center(a), center(b))(0.5), ang:Math.min(1.5, Math.max(angOf(a), angOf(b), d3.geoDistance(center(a), center(b)) * 0.75)), cls:{[a.cca3]:'hl',[b.cca3]:'right'}, marks:[] } } }; } },
};
function featLearn(f){ return { kind:'feature', f, title:f.name, globe:{ ll:[f.lng, f.lat], ang:0.5, marks:[{ ll:[f.lng, f.lat], type:'pin', label:f.name }] }, wiki:f.wiki }; }

const MODES = [
  { key:'flags', name:'Flags', blurb:'Identify flags, or pick the flag for a country.', gens:['flag','flagr'], glyph:'flag' },
  { key:'capitals', name:'Capitals', blurb:'Capitals to countries and back.', gens:['cap','capr'], glyph:'cap' },
  { key:'globe', name:'Maps', blurb:'Identify and locate countries, and learn their borders.', gens:['map','find','nb'], glyph:'globe' },
  { key:'shapes', name:'Outlines', blurb:'Identify countries by shape.', gens:['shape'], glyph:'shape' },
  { key:'wonders', name:'Physical Geography', blurb:'Rivers, mountains, lakes, deserts, islands and straits.', gens:['featphoto','featwhere','featpin'], glyph:'peak' },
  { key:'deep', name:'Trivia', blurb:'General facts, currencies, languages, domains and dialing codes.', gens:['trivia','cur','lang','dem','tld','tel','sub'], glyph:'deep' },
  { key:'size', name:'Area Comparison', blurb:'Pick the larger country. Build a streak.', gens:['size'], glyph:'size' },
  { key:'mix', name:'Mixed', blurb:'Questions from every category.', gens:['flag','flagr','cap','capr','map','find','nb','shape','featphoto','featwhere','featpin','trivia','cur','lang','dem','tld','tel','sub'], glyph:'mix', wide:true },
];
const DAILY_PLAN = ['flag','cap','map','featphoto','trivia','shape','nb','featwhere','lang','trivia'];

const idCache = {};
function ids(g){ const k = g + (S.terr ? 1 : 0); return idCache[k] || (idCache[k] = G[g].ids()); }
const active = g => G[g] && !(G[g].needsWiki && WIKI_OK === false);
const subj = id => id.split(':')[1];
let recent = [];
function nextQ(gens){
  gens = gens.filter(active);
  const withNew = gens.filter(g => G[g].dyn || ids(g).some(i => !S.seen[i]));
  const g = pick(withNew.length ? withNew : gens);
  if (G[g].dyn) return G[g].make();
  const all = ids(g); let cands = all.filter(i => !S.seen[i]);
  if (!cands.length) { // everything seen: revisit the ones you missed, oldest first
    cands = all.slice().sort((a, b) => (S.seen[a].c / S.seen[a].n) - (S.seen[b].c / S.seen[b].n) || S.seen[a].t - S.seen[b].t).slice(0, 12);
  }
  let id; for (let k = 0; k < 12; k++) { id = pick(cands); if (!recent.includes(subj(id))) break; }
  recent = [subj(id), ...recent].slice(0, 8);
  const q = G[g].make(id); q.id = id; q.fresh = !S.seen[id]; return q;
}
function record(q, ok){
  const r = S.seen[q.id] || { n:0, c:0, t:0 }; r.n++; if (ok) r.c++; r.t = Date.now(); S.seen[q.id] = r;
  S.xp += ok ? (q.fresh ? 15 : 8) : 2;
  const d = today(); if (S.days[S.days.length - 1] !== d) S.days.push(d);
  const c = q.learn && (q.learn.c || null); if (c) S.visited[c.cca3] = 1;
  save();
}
function streak(){ let n = 0; const set = new Set(S.days); const d = new Date(); if (!set.has(today())) d.setDate(d.getDate() - 1);
  for (;;) { const k = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; if (!set.has(k)) break; n++; d.setDate(d.getDate() - 1); } return n; }
function totals(){ let pool_ = 0; const gens = Object.keys(G).filter(g => !G[g].dyn && active(g)); gens.forEach(g => pool_ += ids(g).length);
  const seen = gens.reduce((a, g) => a + ids(g).filter(i => S.seen[i]).length, 0); return { pool:pool_, seen }; }

/* ---------- views ---------- */
const app = $('#app');
let view = null;
function go(v, arg){ closeSheet(); window.scrollTo(0, 0); rnd = Math.random; view = v; ({ hub, play, daily, atlas, progress })[v](arg); }

const GLYPH = {
  flag:'<svg viewBox="0 0 48 40" width="48"><rect x="4" y="6" width="36" height="24" rx="2" fill="var(--mark)"/><rect x="4" y="14" width="36" height="8" fill="var(--paper)"/><rect x="3" y="4" width="2" height="34" fill="var(--ink)"/></svg>',
  cap:'<svg viewBox="0 0 48 40" width="48"><rect x="8" y="18" width="32" height="16" fill="var(--sea)"/><path d="M6 18 24 6l18 12z" fill="var(--ink)"/><circle cx="24" cy="26" r="3" fill="var(--paper)"/></svg>',
  globe:'<svg viewBox="0 0 48 40" width="48"><circle cx="24" cy="20" r="17" fill="var(--ocean)"/><path d="M12 14c6-2 8 4 14 2s6 6 2 10-10 2-12-2-8-6-4-10z" fill="var(--mark)"/><circle cx="24" cy="20" r="17" fill="none" stroke="var(--ink)" stroke-width="1.5"/></svg>',
  shape:'<svg viewBox="0 0 48 40" width="48"><path d="M10 10l8-4 6 5 9-3 5 8-3 7 4 6-8 5-7-4-7 3-6-6 2-8z" fill="var(--ink)"/></svg>',
  peak:'<svg viewBox="0 0 48 40" width="48"><path d="M2 36 18 10l7 10 5-6 16 22z" fill="var(--sea)"/><path d="M18 10l4 6-4-1-3 3z" fill="var(--paper)"/></svg>',
  deep:'<svg viewBox="0 0 48 40" width="48"><circle cx="20" cy="18" r="11" fill="none" stroke="var(--ink)" stroke-width="3"/><path d="M28 26l10 10" stroke="var(--mark)" stroke-width="5" stroke-linecap="round"/></svg>',
  size:'<svg viewBox="0 0 48 40" width="48"><rect x="4" y="18" width="14" height="16" fill="var(--sea)"/><rect x="22" y="6" width="22" height="28" fill="var(--mark)"/></svg>',
  mix:'<svg viewBox="0 0 48 40" width="48"><rect x="4" y="4" width="18" height="14" rx="2" fill="var(--mark)"/><rect x="26" y="4" width="18" height="14" rx="2" fill="var(--sea)"/><rect x="4" y="22" width="18" height="14" rx="2" fill="var(--ink)"/><rect x="26" y="22" width="18" height="14" rx="2" fill="var(--land)"/></svg>',
};

function hub(){
  const t = totals(); const pct = t.pool ? t.seen / t.pool : 0;
  const dd = S.daily[today()];
  const fresh = m => m.gens.filter(active).reduce((a, g) => a + (G[g].dyn ? 0 : ids(g).filter(i => !S.seen[i]).length), 0);
  app.innerHTML = `
  <header class="hero">
    <div class="eyebrow">${new Date().toLocaleDateString('en-US', { weekday:'long', month:'long', day:'numeric' })}</div>
    <h1>Geo Learn</h1>
    <div class="hero-globe" id="heroGlobe"></div>
    <div class="stats">
      <div class="stat"><b>${fmt(t.seen)}</b><span>questions seen</span></div>
      <div class="stat"><b>${Object.keys(S.visited).length}</b><span>countries studied</span></div>
      <div class="stat"><b>${streak()}</b><span>day streak</span></div>
      <div class="stat"><b>${fmt(S.xp)}</b><span>XP</span></div>
    </div>
    <div class="meter" aria-label="questions seen"><i style="width:${(pct*100).toFixed(1)}%"></i></div>
    <div class="coord">${fmt(t.seen)} of ${fmt(t.pool)} questions seen</div>
  </header>
  <button class="daily" id="dailyBtn">
    <div><div class="eyebrow" style="color:inherit;opacity:.7">Daily challenge</div><h2>${dd ? `Completed: ${dd.score}/10` : '10 questions'}</h2>
    <p>${dd ? 'Next challenge tomorrow.' : 'Mixed categories. Resets at midnight.'}</p></div>
    <span class="go">${dd ? 'Results' : 'Start'}</span></button>
  <div class="section-h"><h2 style="font-size:22px">Practice</h2></div>
  <div class="modes">${MODES.map(m => `<button class="mode${m.wide ? ' wide' : ''}" data-mode="${m.key}"><div class="glyph">${GLYPH[m.glyph]}</div><div><h3>${m.name}</h3><p>${m.blurb}</p>${m.key !== 'size' ? `<div class="left">${fmt(fresh(m))} new</div>` : ''}</div></button>`).join('')}</div>
  <div class="section-h" style="margin-top:22px"><h2 style="font-size:22px">Reference</h2></div>
  <div class="modes">
    <button class="mode" data-go="atlas"><div class="glyph">${GLYPH.globe}</div><h3>Atlas</h3><p>Browse every country and territory, or explore random locations with Wander.</p></button>
    <button class="mode" data-go="progress"><div class="glyph">${GLYPH.size}</div><h3>Progress</h3><p>Coverage map, stats and settings.</p></button>
  </div>`;
  const g = new Globe($('#heroGlobe'));
  const known = {}; Object.keys(S.visited).forEach(k => known[k] = 'right');
  let lng = -((Date.now() / 200) % 360);
  g.view({ ll:[lng, 18], ang:Math.PI/2, cls:known, dur:0 });
  let lastT = 0;
  const spin = t => { if (view !== 'hub' || !document.body.contains(g.host)) return; if (t - lastT > 45) { lng += 0.25; g.proj.rotate([-lng, -18]); g.draw(); lastT = t; } requestAnimationFrame(spin); };
  if (!matchMedia('(prefers-reduced-motion: reduce)').matches) requestAnimationFrame(spin);
  $('#dailyBtn').onclick = () => go('daily');
  app.querySelectorAll('[data-mode]').forEach(b => b.onclick = () => go('play', b.dataset.mode));
  app.querySelectorAll('[data-go]').forEach(b => b.onclick = () => go(b.dataset.go));
}

function bar(title, right = ''){ return `<div class="bar"><button class="iconbtn" id="back" aria-label="Back to games">←</button><div class="title">${esc(title)}</div>${right}</div>`; }

/* renders one question; calls done(ok) after the learner answers */
function renderQ(q, host, done, { nextLabel = 'Next' } = {}){
  host.innerHTML = `<div class="qwrap">
    ${q.media ? `<div class="media ${q.media.kind}" id="media"></div>` : ''}
    <div class="prompt"><div class="eyebrow">${esc(q.eyebrow)} ${q.fresh === false ? '<span class="pill">Review</span>' : ''}</div><h2>${esc(q.title)}</h2></div>
    ${q.duel ? `<div class="duel" id="opts"></div>` : q.tap ? '<p class="muted" id="taphint">Tap the country on the globe.</p>' : `<div class="opts ${q.grid ? 'grid' : ''}" id="opts"></div>`}
    <div id="learnSlot"></div></div>`;
  let mediaGlobe = null;
  const media = $('#media', host);
  if (q.media) {
    const m = q.media;
    if (m.kind === 'flag') media.innerHTML = `<div class="flagbox" style="${m.small ? 'width:120px' : ''}">${flagSvg(m.cca3)}</div>`;
    if (m.kind === 'shape') media.innerHTML = `<div class="shape" style="width:100%;max-width:420px">${shapeSvg(BY[m.cca3])}</div>`;
    if (m.kind === 'globe') { mediaGlobe = new Globe(media, q.tap ? { tap: ll => answerTap(ll) } : {}); mediaGlobe.view({ ...m.view, dur:600 }); }
    if (m.kind === 'photo') { media.innerHTML = '<div class="boot" style="min-height:0;height:100%"><div class="boot-globe"></div></div>';
      wiki(m.wiki).then(d => { const src = d && (d.originalimage && d.originalimage.width < 2600 ? d.originalimage.source : d.thumbnail?.source);
        if (src) media.innerHTML = `<img src="${esc(src)}" alt="Mystery place">`;
        else { media.className = 'media globe'; media.innerHTML = ''; const f = q.learn.f; const gl = new Globe(media); gl.view({ ll:[f.lng, f.lat], ang:0.45, marks:[{ ll:[f.lng, f.lat], type:'pin' }], dur:0 }); } }); }
  }
  let answered = false;
  const opts = $('#opts', host);
  if (opts) {
    q.opts.forEach((o, i) => {
      const b = document.createElement('button'); b.className = 'opt' + (o.flag ? ' flagopt' : ''); b.type = 'button';
      if (q.duel) { const c = BY[o.cca3]; b.innerHTML = `${flagBox(c.cca3)}<strong>${esc(c.name)}</strong><span class="area" data-area>?</span>`; }
      else b.innerHTML = o.flag ? `<span style="width:100%">${flagSvg(o.flag)}</span>` : `<span class="key">${'ABCD'[i]}</span><span>${esc(o.text)}</span>`;
      if (o.flag) b.setAttribute('aria-label', 'Flag option ' + 'ABCD'[i]);
      b.onclick = () => answer(i);
      opts.appendChild(b);
    });
  }
  const keyH = ev => { if (sheet.length) return; if (answered) { if (ev.key === 'Enter' || ev.key === ' ') { const n = $('#nextBtn', host); if (n) { ev.preventDefault(); n.click(); } } return; }
    const i = 'abcd'.indexOf(ev.key.toLowerCase()); const j = '1234'.indexOf(ev.key); const k = i >= 0 ? i : j; if (k >= 0 && q.opts && k < q.opts.length) answer(k); };
  document.addEventListener('keydown', keyH);
  function finish(ok, tapLL, chosen){
    answered = true;
    if (q.id) record(q, ok);
    const L = q.learn;
    const optHTML = o => o.cca3 && BY[o.cca3] && o.text === BY[o.cca3].name ? clink(BY[o.cca3]) : linkify(o.text);
    const verdict = ok ? `<div class="verdict ok">Correct</div>` : `<div class="verdict no"><span>It's ${q.opts ? optHTML(q.opts[q.ans]) : q.target ? clink(q.target) : esc(L.title)}.${chosen != null ? ` You chose ${optHTML(q.opts[chosen])}.` : ''}</span></div>`;
    let body = '';
    if (L.kind === 'country') body = `<div class="learn-head">${flagBox(L.c.cca3)}<div><h3>${clink(L.c, L.title)}</h3>${L.sub ? `<div class="muted" style="font-size:13px">${esc(L.sub)}</div>` : ''}</div></div>
      ${L.extra ? `<p class="note">${linkify(L.extra)}</p>` : ''}<div id="lglobe"></div>${countryFacts(L.c)}<div class="wiki" id="lwiki"></div>`;
    if (L.kind === 'feature') body = `<div><div class="eyebrow">${esc(L.f.type)}</div><h3>${esc(L.title)}</h3><div class="muted" style="font-size:14px">${linkify(L.f.where)}</div><div class="coord">${ll2txt(L.f.lat, L.f.lng)}</div></div>
      <p class="note">${linkify(L.f.fact)}</p><div id="lglobe"></div><div class="wiki" id="lwiki"></div>`;
    if (L.kind === 'note') body = `<h3>${linkify(L.title)}</h3><p class="note">${linkify(L.note)}</p>`;
    if (L.kind === 'duel') body = `<h3>${esc(L.title)}</h3><p class="note">${clink(L.a)}: ${fmt(L.a.area)} km². ${clink(L.b)}: ${fmt(L.b.area)} km².</p><div id="lglobe"></div>`;
    $('#learnSlot', host).innerHTML = `<div class="learn">${verdict}<div class="learn-body">${body}</div></div><div style="height:12px"></div><button class="next" id="nextBtn">${nextLabel}</button>`;
    if (L.globe) {
      if (mediaGlobe && q.media.kind === 'globe') { // reuse the question globe; fly to the answer
        const cls = { ...(L.globe.cls || {}) };
        if (q.tap) { cls[q.target.cca3] = 'right'; }
        mediaGlobe.view({ ...L.globe, cls, marks:[...(L.globe.marks || []), ...(tapLL ? [{ ll:tapLL, type:'tap' }] : [])] });
        $('#lglobe', host)?.remove();
      } else if ($('#lglobe', host)) { const lg = new Globe($('#lglobe', host)); lg.view({ ...L.globe, dur:0 }); }
    }
    if (L.wiki) wikiBlock($('#lwiki', host), L.wiki, { short:true });
    if (q.duel) host.querySelectorAll('[data-area]').forEach((el, i) => el.textContent = fmt(q.duel[i].area) + ' km²');
    $('#nextBtn', host).onclick = () => { document.removeEventListener('keydown', keyH); done(ok); };
    $('#learnSlot', host).scrollIntoView({ behavior:'smooth', block:'start' });
  }
  function answer(i){
    if (answered) return;
    host.querySelectorAll('.opt').forEach((b, k) => { b.disabled = true; if (k === q.ans) b.classList.add('right'); else if (k === i) b.classList.add('wrong'); else b.classList.add('dim'); });
    finish(i === q.ans, null, i === q.ans ? null : i);
  }
  function answerTap(ll){
    if (answered) return;
    const t = q.target; const f = GEOM[t.cca3];
    const hit = WORLD.find(w => d3.geoContains(w, ll));
    const ok = (f && d3.geoContains(f, ll)) || (t.area < 30000 && d3.geoDistance(ll, center(t)) < 0.03);
    if (!ok && hit && hit.cca3) mediaGlobe.cls = { [hit.cca3]:'wrong' };
    const tapped = hit && hit.cca3 ? BY[hit.cca3] : null;
    const hint = $('#taphint', host); if (hint) hint.innerHTML = ok ? 'Correct location.' : tapped ? `You tapped ${clink(tapped)}.` : 'You tapped open water.';
    finish(ok, ll);
  }
}

function play(modeKey){
  const m = MODES.find(x => x.key === modeKey);
  let right = 0, total = 0, best = 0, run = 0;
  const tallyHTML = () => m.key === 'size' ? `<span class="tally">streak <b>${run}</b> · best <b>${Math.max(best, S.bestSize || 0)}</b></span>` : `<span class="tally"><b>${right}</b>/${total}</span>`;
  app.innerHTML = bar(m.name, `<span id="tally">${tallyHTML()}</span>`) + '<div id="stage"></div>';
  $('#back').onclick = () => go('hub');
  const step = () => {
    const q = nextQ(m.gens);
    renderQ(q, $('#stage'), ok => { total++; if (ok) { right++; run++; best = Math.max(best, run); } else run = 0;
      if (m.key === 'size' && best > (S.bestSize || 0)) { S.bestSize = best; save(); }
      $('#tally').innerHTML = tallyHTML(); window.scrollTo(0, 0); step(); });
  };
  step();
}

function daily(){
  const d = today(); const done = S.daily[d];
  if (done) return dailyResult(done);
  rnd = mulberry(hash(d));
  const qs = [];
  for (const g of DAILY_PLAN) { const gg = active(g) ? g : 'featpin'; qs.push(nextQ([gg])); }
  rnd = Math.random;
  const marks = []; let i = 0;
  app.innerHTML = bar('Daily challenge', `<span class="tally" id="tally"><b>1</b>/10</span>`) + '<div id="stage"></div>';
  $('#back').onclick = () => go('hub');
  const step = () => {
    $('#tally').innerHTML = `<b>${i + 1}</b>/10`;
    renderQ(qs[i], $('#stage'), ok => { marks.push(ok ? 1 : 0); i++; window.scrollTo(0, 0);
      if (i < qs.length) step(); else { const res = { score:marks.reduce((a, b) => a + b, 0), marks }; S.daily[d] = res; save(); dailyResult(res); } }, { nextLabel: i === 9 ? 'See result' : 'Next' });
  };
  step();
}
function dailyResult(r){
  const sq = r.marks.map(x => x ? '🟩' : '🟥').join('');
  const text = `Geo Learn ${today()}\n${r.score}/10 ${sq}`;
  app.innerHTML = bar('Daily challenge') + `<div class="result">
    <div class="eyebrow">${today()}</div><div class="big">${r.score}/10</div><div class="squares">${sq}</div>
    <p class="muted">Next challenge available tomorrow.</p>
    <div class="btnrow"><button class="btn" id="copy">Copy result</button><button class="btn primary" id="more">Play mixed</button></div>
    <pre id="shareText" class="coord" style="white-space:pre-wrap">${esc(text)}</pre></div>`;
  $('#back').onclick = () => go('hub');
  $('#more').onclick = () => go('play', 'mix');
  $('#copy').onclick = () => { navigator.clipboard?.writeText(text).then(() => toast('Copied'), () => { const r_ = document.createRange(); r_.selectNodeContents($('#shareText')); getSelection().removeAllRanges(); getSelection().addRange(r_); toast('Selected, copy it from here'); }); };
}

/* ---------- atlas ---------- */
function atlas(tab = 'countries'){
  app.innerHTML = bar('Atlas') + `<div class="tabs" role="tablist">
    <button class="tab" role="tab" data-t="countries" aria-selected="${tab === 'countries'}">Countries</button>
    <button class="tab" role="tab" data-t="wander" aria-selected="${tab === 'wander'}">Wander</button></div><div id="pane"></div>`;
  $('#back').onclick = () => go('hub');
  app.querySelectorAll('.tab').forEach(b => b.onclick = () => atlas(b.dataset.t));
  tab === 'countries' ? atlasCountries() : wander();
}
function atlasCountries(){
  const pane = $('#pane');
  const list = C.slice().sort((a, b) => a.name.localeCompare(b.name));
  pane.innerHTML = `<div class="btnrow" style="justify-content:flex-start;margin-bottom:12px"><button class="btn primary" id="surprise">Random unstudied country</button></div>
    <input class="search" id="q" type="search" placeholder="Search ${list.length} countries and territories" aria-label="Search countries"><div class="flaggrid" id="grid"></div>`;
  const draw = f => { $('#grid').innerHTML = list.filter(c => !f || c.name.toLowerCase().includes(f) || c.capital.join(' ').toLowerCase().includes(f))
    .map(c => `<button class="fcell${S.visited[c.cca3] ? '' : ' unvisited'}" data-c="${c.cca3}">${flagSvg(c.cca3)}<span>${esc(c.name)}</span></button>`).join('');
    $('#grid').querySelectorAll('[data-c]').forEach(b => b.onclick = () => dossier(BY[b.dataset.c])); };
  draw(''); $('#q').oninput = e => draw(e.target.value.trim().toLowerCase());
  $('#surprise').onclick = () => { const u = pool().filter(c => !S.visited[c.cca3]); dossier(pick(u.length ? u : pool())); };
}
function dossier(c){
  S.visited[c.cca3] = 1; save();
  app.innerHTML = bar(c.name) + `<div class="qwrap"><div class="learn"><div class="learn-body">${countryCard(c, 'd')}</div></div>
    <div class="btnrow"><button class="btn primary" id="another">Random unstudied country</button><button class="btn" id="toAtlas">All countries</button></div></div>`;
  mountCountryCard(c, 'd');
  $('#back').onclick = () => atlas('countries'); $('#toAtlas').onclick = () => atlas('countries');
  $('#another').onclick = () => { const u = pool().filter(x => !S.visited[x.cca3]); window.scrollTo(0, 0); dossier(pick(u.length ? u : pool())); };
}
/* Wander: drop onto a random real place and read what Wikipedia knows about its surroundings */
async function wander(){
  const pane = $('#pane');
  pane.innerHTML = `<p class="muted" style="margin-top:0">Picks a random location and shows notable places nearby, from Wikipedia.</p>
    <div id="wglobe"></div><div class="btnrow" style="margin:12px 0"><button class="btn primary" id="drop">Random location</button></div><div class="wander-list" id="wl"></div>`;
  const g = new Globe($('#wglobe')); g.view({ ll:[0, 20], ang:Math.PI/2, dur:0 });
  const btn = $('#drop');
  const drop = async () => {
    if (WIKI_OK === false) { $('#wl').innerHTML = '<p class="muted">Wander needs Wikipedia, which this copy of the page cannot reach. Open the GitHub Pages version to use it.</p>'; return; }
    btn.disabled = true; btn.textContent = 'Loading…'; $('#wl').innerHTML = '';
    let found = null;
    for (let k = 0; k < 8 && !found; k++) {
      const c = pick(pool().filter(x => GEOM[x.cca3]));
      const [lng0, lat0] = center(c); const a = angOf(c) * 0.25 * 180 / Math.PI;
      const lat = Math.max(-60, Math.min(75, lat0 + (Math.random() - .5) * 2 * a)), lng = lng0 + (Math.random() - .5) * 2 * a;
      try {
        const u = `https://en.wikipedia.org/w/api.php?action=query&format=json&origin=*&generator=geosearch&ggscoord=${lat}|${lng}&ggsradius=10000&ggslimit=30&prop=pageimages|extracts|coordinates&exintro=1&explaintext=1&exsentences=2&exlimit=30&piprop=thumbnail&pithumbsize=640`;
        const d = await (await fetch(u)).json();
        const pages = Object.values(d.query?.pages || {}).filter(p => p.thumbnail && p.extract && !/^List of/.test(p.title) && !(S.wander || []).includes(p.pageid));
        if (pages.length) found = { c, lat, lng, pages: shuffle(pages).slice(0, 4) };
      } catch (e) {}
    }
    btn.disabled = false; btn.textContent = 'Another location';
    if (!found) { $('#wl').innerHTML = '<p class="muted">No articles found near that spot. Try another.</p>'; return; }
    S.wander = [...(S.wander || []), ...found.pages.map(p => p.pageid)].slice(-600); S.visited[found.c.cca3] = 1; save();
    g.view({ ll:[found.lng, found.lat], ang:0.5, cls:{ [found.c.cca3]:'hl' }, marks:[{ ll:[found.lng, found.lat], type:'pin', label:found.c.name }] });
    $('#wl').innerHTML = `<div class="eyebrow">${clink(found.c)} · <span class="coord">${ll2txt(found.lat, found.lng)}</span></div>` +
      found.pages.map(p => `<article class="wander-card"><img src="${esc(p.thumbnail.source)}" alt="${esc(p.title)}" loading="lazy"><h3>${esc(p.title)}</h3><p class="note">${linkify(p.extract)}</p>
      <a href="https://en.wikipedia.org/?curid=${p.pageid}" target="_blank" rel="noopener">Read more</a></article>`).join('');
  };
  btn.onclick = drop;
}

/* ---------- progress ---------- */
function progress(){
  const byC = {};
  for (const id in S.seen) { const k = id.split(':')[1]; if (!BY[k]) continue; const r = S.seen[id]; const o = byC[k] || (byC[k] = { n:0, c:0 }); o.n += r.n; o.c += r.c; }
  const t = totals();
  const acc = Object.values(S.seen).reduce((a, r) => [a[0] + r.c, a[1] + r.n], [0, 0]);
  const gens = Object.keys(G).filter(g => !G[g].dyn && active(g));
  app.innerHTML = bar('Progress') + `<div class="qwrap">
    <div class="stats"><div class="stat"><b>${fmt(t.seen)}</b><span>seen of ${fmt(t.pool)}</span></div>
    <div class="stat"><b>${acc[1] ? Math.round(acc[0] / acc[1] * 100) : 0}%</b><span>accuracy</span></div>
    <div class="stat"><b>${streak()}</b><span>day streak</span></div><div class="stat"><b>${S.bestSize || 0}</b><span>best size streak</span></div></div>
    <div class="media" id="pmap"></div>
    <div class="legend"><span><i style="background:var(--land)"></i>Not seen</span><span><i style="background:var(--bad)"></i>Under 40% correct</span><span><i style="background:var(--mark)"></i>40 to 75%</span><span><i style="background:var(--good)"></i>Over 75%</span></div>
    <div><div class="eyebrow" style="margin-bottom:8px">Coverage by category</div>
    ${gens.map(g => { const a = ids(g); const s = a.filter(i => S.seen[i]).length; return `<div style="display:grid;grid-template-columns:130px 1fr 70px;gap:10px;align-items:center;font-size:14px;margin-bottom:6px"><span>${G[g].label}</span><div class="meter"><i style="width:${a.length ? s / a.length * 100 : 0}%"></i></div><span class="coord" style="text-align:right">${s}/${a.length}</span></div>`; }).join('')}</div>
    <label class="toggle"><input type="checkbox" id="terr" ${S.terr ? 'checked' : ''}><span>Include territories and dependencies (Guam, Aruba, Réunion…)</span></label>
    <div class="toggle"><button class="btn" id="reset">Reset all progress</button><span class="muted" id="resetMsg" style="font-size:13px"></span></div></div>`;
  $('#back').onclick = () => go('hub');
  const cls = {}; for (const k in byC) { const r = byC[k].c / byC[k].n; cls[k] = r >= .75 ? 'right' : r >= .4 ? 'hl' : 'wrong'; }
  const host = $('#pmap'); host.classList.add('globe');
  const proj = d3.geoNaturalEarth1().fitExtent([[6,6],[GW-6,GH-6]], { type:'Sphere' }); const p = d3.geoPath(proj);
  const svg = d3.select(host).append('svg').attr('viewBox', `0 0 ${GW} ${GH}`);
  svg.append('path').datum({ type:'Sphere' }).attr('class','sphere').attr('d', p);
  svg.append('path').datum(d3.geoGraticule10()).attr('class','grat').attr('d', p);
  svg.append('g').selectAll('path').data(WORLD).join('path').attr('d', p).attr('class', d => 'land' + (d.cca3 && cls[d.cca3] ? ' ' + cls[d.cca3] : ''));
  $('#terr').onchange = e => { S.terr = e.target.checked; save(); toast(S.terr ? 'Territories included' : 'Sovereign states only'); };
  let armed = false;
  $('#reset').onclick = () => { if (!armed) { armed = true; $('#reset').textContent = 'Tap again to erase everything'; $('#resetMsg').textContent = 'This cannot be undone.'; return; }
    S = { seen:{}, xp:0, days:[], daily:{}, visited:{}, terr:S.terr, wander:[] }; save(); toast('Progress reset'); go('hub'); };
}

/* ---------- boot ---------- */
Promise.all([loadData(), probeWiki()]).then(() => go('hub')).catch(e => {
  app.innerHTML = `<div class="boot"><p>Couldn't load data (${esc(e.message)}). Serve this folder over http, for example with <code>python3 -m http.server</code>.</p></div>`;
});
})();
