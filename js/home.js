// Today (home) tab: a "fish now?" verdict for the chosen spot, conditions at a glance,
// starred spots with their tides, what's biting, today's tide curve and the week ahead.
import { STATIONS, loadStations, getHiLo, heightAt, flowAt, nearestStation } from './tides.js';
import { moonInfo, solunarDay, forecast, scoreAt } from './solunar.js';
import { SPOTS, nearestSpot, km } from './spots.js';
import { latestWaterTemp, windForecast, windAt } from './conditions.js';
import { makeContext, rankSpecies } from './recommend.js';
import { recentSightings, redTideSamples, redTideAt } from './sightings.js';
import { GUIDE } from './guide.js';
import * as store from './store.js';

const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const ls = { get: k => { try { return localStorage.getItem(k); } catch { return null; } }, set: (k, v) => { try { localStorage.setItem(k, v); } catch { } } };
const H = 3600e3;
const DAYTIME = { from: 5, to: 20 }; // suggest windows James can actually fish: 5am to 10pm
const fmtTime = d => d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }).replace(':00', '').replace(/\s?([AP])M/i, (_, x) => x.toLowerCase() === 'a' ? 'am' : 'pm');
const isToday = d => d.toDateString() === new Date().toDateString();
const when = d => isToday(d) ? fmtTime(d) : `${d.toLocaleDateString([], { weekday: 'short' })} ${fmtTime(d)}`;
const inMin = d => { const m = Math.round((d - Date.now()) / 60e3); return m < 60 ? `in ${m} min` : `in ${Math.floor(m / 60)}h ${String(m % 60).padStart(2, '0')}m`; };
const shortName = n => n.replace(/\s*\(.*\)/, '');

// ---------- places: a named fishing spot or a NOAA tide station ----------
// key is 'spot:<id>' or 'sta:<NOAA id>'.
export function place(key) {
  const [kind, id] = String(key).split(':');
  if (kind === 'spot') {
    const s = SPOTS.find(x => x.id === id); if (!s) return null;
    return { key, name: s.name, short: s.name.split(/ [&(/]/)[0], lat: s.lat, lng: s.lng, tags: s.tags, boat: s.boat, station: nearestStation(s.lat, s.lng) };
  }
  const st = STATIONS.find(x => x.id === id); if (!st) return null;
  const near = nearestSpot(st.lat, st.lng);
  return { key, name: st.name, short: st.name.split(',')[0], lat: st.lat, lng: st.lng, tags: km(st.lat, st.lng, near.lat, near.lng) < 8 ? near.tags : ['bay', 'flats'], station: st };
}

// Favorites: saved on this phone, and on James's account when signed in.
const readList = k => { try { return JSON.parse(ls.get(k) || '[]'); } catch { return []; } };
let favs = readList('favPlaces');
if (!favs.length && readList('favStations').length) favs = readList('favStations').map(id => 'sta:' + id); // older star feature
let active = ls.get('place') || favs[0] || (ls.get('station') ? 'sta:' + ls.get('station') : 'spot:fort-desoto');
const SUGGESTED = ['spot:fort-desoto', 'spot:skyway-piers', 'spot:gandy', 'spot:johns-pass'];

const saveFavs = () => { ls.set('favPlaces', JSON.stringify(favs)); store.setFavPlaces(favs).catch(() => { }); };
export function toggleFav(key) {
  favs = favs.includes(key) ? favs.filter(k => k !== key) : [...favs, key];
  saveFavs(); renderSpots(); renderSheet();
  toast(favs.includes(key) ? `★ ${place(key)?.short || 'Spot'} added to My spots` : 'Removed from My spots');
}
// Called on sign-in: merge account favorites with this phone's.
export function syncFavs() {
  const remote = store.getFavPlaces();
  const merged = [...new Set([...remote, ...favs])];
  const changed = merged.length !== remote.length || merged.length !== favs.length;
  favs = merged; if (changed) saveFavs();
  renderSpots();
}
export const activePlace = () => place(active) || place('spot:fort-desoto');
export const activeStation = () => activePlace().station;

function choose(key) {
  active = key; ls.set('place', key);
  $('#spot-sheet').open && $('#spot-sheet').close();
  render();
}

// ---------- data ----------
const onPreview = !/github\.io$|localhost|127\.0\.0\.1|githack\.com$/.test(location.hostname);
function sampleHiLo(now) {
  const out = []; let t = new Date(now); t.setHours(0, 0, 0, 0); t = new Date(+t - 22 * H + 2.3 * H);
  for (let i = 0; i < 40; i++) { const hi = i % 2 === 0; out.push({ t, v: hi ? 2.1 - (i % 4 ? 0.6 : 0) : 0.3 + (i % 4 === 1 ? 0.5 : 0), type: hi ? 'H' : 'L' }); t = new Date(+t + 6.2 * H); }
  return out;
}
const tides = new Map(); // station id -> Promise<hilo|null>
function tidesFor(st) {
  if (!tides.has(st.id)) tides.set(st.id, getHiLo(st.id, new Date(), 8).catch(() => onPreview ? sampleHiLo(new Date()) : null));
  return tides.get(st.id);
}
const extras = {}; // wind, water, red tide, sightings: shared by every spot
function loadExtras() {
  const set = k => v => { extras[k] = v; render(); };
  windForecast().then(set('wind'));
  redTideSamples().then(set('redtide'));
  recentSightings(30).then(set('sightings'));
  latestWaterTemp(27.77, -82.63).then(set('water'));
}

// ---------- verdict ----------
function nextChange(hilo, now) { return hilo?.find(p => p.t > now) || null; }
function windows(now, p, hilo) {
  return forecast(now, 2, p.lat, p.lng, hilo, DAYTIME).flatMap(d => d.best.map(w => ({ start: w.start, end: new Date(+w.start + 2 * H), s: Math.round(w.s) })));
}
function verdict(p, hilo, now) {
  const day = solunarDay(now, p.lat, p.lng);
  const score = scoreAt(now, day, moonInfo(now), hilo);
  const wins = windows(now, p, hilo).filter(w => w.end > now);
  const cur = wins.find(w => w.start <= now);
  const next = wins.find(w => w.start > now);
  const w = extras.wind ? windAt(extras.wind, now) : null;
  const rt = extras.redtide ? redTideAt(extras.redtide, p.lat, p.lng) : null;
  let head, tone, sub;
  if (rt?.level >= 3) { head = 'Red tide nearby'; tone = 'bad'; sub = `FWC found ${rt.label} levels at ${rt.place}. Try another spot.`; }
  else if (w?.mph >= 22) { head = 'Too windy'; tone = 'bad'; sub = `${w.mph} mph ${w.dir}. Tuck into a sheltered canal or wait it out.`; }
  else if (cur || score >= 70) { head = 'Fish now'; tone = 'good'; sub = cur ? `Prime window until ${fmtTime(cur.end)}` : 'Conditions line up right now'; }
  else if (score >= 50) { head = 'Worth a cast'; tone = 'ok'; sub = next ? `Better at ${when(next.start)}` : 'Fair bite right now'; }
  else { head = 'Slow right now'; tone = 'slow'; sub = next ? `Next bite window ${when(next.start)}` : 'Check back later'; }
  return { score, head, tone, sub, next, cur, day, wind: w, rt };
}

// ---------- render ----------
let renderQ = null;
export function render() { if (!renderQ) renderQ = requestAnimationFrame(() => { renderQ = null; draw(); }); }

async function draw() {
  const p = activePlace(), now = new Date();
  $('#here-name').textContent = p.short;
  $('#here-date').textContent = now.toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' });
  const hr = now.getHours();
  $('#hello').textContent = hr < 5 ? 'Late night, James' : hr < 12 ? 'Good morning, James' : hr < 17 ? 'Good afternoon, James' : 'Good evening, James';
  const hilo = await tidesFor(p.station);
  if (activePlace().key !== p.key) return; // changed while loading
  const v = verdict(p, hilo, now);
  renderHero(v);
  renderTiles(p, hilo, v, now);
  renderSpots();
  renderBiting(p, hilo, v, now);
  renderTide(p, hilo, v, now);
  renderWeek(p, hilo, now);
}

function renderHero(v) {
  const el = $('#now');
  el.dataset.tone = v.tone;
  el.innerHTML = `
    <div class="dial" style="--v:${v.score}" role="img" aria-label="Bite score ${v.score} out of 100"><b>${v.score}</b><small>bite</small></div>
    <div class="now-text">
      <div class="now-head">${esc(v.head)}</div>
      <div class="now-sub">${esc(v.sub)}</div>
    </div>`;
}

function tile(icon, label, value, sub = '', cls = '') {
  return `<div class="tile ${cls}"><div class="tile-label"><span aria-hidden="true">${icon}</span>${label}</div><div class="tile-value">${value}</div><div class="tile-sub">${sub}</div></div>`;
}
function renderTiles(p, hilo, v, now) {
  const moon = moonInfo(now);
  const nx = nextChange(hilo, now), flow = hilo ? flowAt(hilo, now) : null, h = hilo ? heightAt(hilo, now) : null;
  const sunNext = now < v.day.sunrise ? ['Sunrise', v.day.sunrise] : now < v.day.sunset ? ['Sunset', v.day.sunset] : ['Sunrise', solunarDay(new Date(+now + 24 * H), p.lat, p.lng).sunrise];
  const w = v.wind, rt = v.rt, wt = extras.water;
  $('#tiles').innerHTML = [
    tile(flow?.dir === 'rising' ? '⬆' : '⬇', 'Tide', h != null ? `${flow.dir === 'rising' ? 'Rising' : 'Falling'}` : '—',
      nx ? `${nx.type === 'H' ? 'High' : 'Low'} ${fmtTime(nx.t)} · ${inMin(nx.t)}` : 'No tide data'),
    tile('💨', 'Wind', w ? `${w.mph} <small>mph ${esc(w.dir)}</small>` : extras.wind ? '—' : '…', w ? esc(w.sky) : extras.wind ? 'No forecast' : 'Loading', w?.mph >= 18 ? 'warn' : ''),
    tile('🌡', 'Water', wt ? `${Math.round(wt.temp)}°` : '…', wt ? 'NOAA, Tampa Bay' : extras.water === null ? 'Unavailable' : 'Loading'),
    tile(moon.icon, 'Moon', `${Math.round(moon.fraction * 100)}%`, moon.name),
    tile(sunNext[0] === 'Sunset' ? '🌇' : '🌅', sunNext[0], fmtTime(sunNext[1]), inMin(sunNext[1])),
    rt ? tile(rt.level >= 2 ? '⚠️' : '✅', 'Red tide', rt.level ? esc(rt.label[0].toUpperCase() + rt.label.slice(1)) : 'None', `FWC ${rt.date.toLocaleDateString([], { month: 'short', day: 'numeric' })}`, rt.level >= 2 ? 'warn' : 'good')
      : tile('✅', 'Red tide', extras.redtide ? 'None' : '…', extras.redtide ? 'No sample nearby' : extras.redtide === null ? 'Unavailable' : 'Loading'),
  ].join('');
}

// Starred spots, each with its bite score and next tide.
async function renderSpots() {
  const el = $('#my-spots'); if (!el) return;
  const keys = favs.length ? favs : SUGGESTED;
  $('#spots-hint').hidden = !!favs.length;
  const now = new Date();
  const cards = await Promise.all(keys.map(async key => {
    const p = place(key); if (!p) return '';
    const hilo = await tidesFor(p.station);
    const score = scoreAt(now, solunarDay(now, p.lat, p.lng), moonInfo(now), hilo);
    const nx = nextChange(hilo, now), flow = hilo ? flowAt(hilo, now) : null;
    const rt = extras.redtide ? redTideAt(extras.redtide, p.lat, p.lng) : null;
    const on = favs.includes(key);
    const ctx = makeContext(p, now, { hilo, wind: extras.wind ? windAt(extras.wind, now) : null, temp: extras.water?.temp ?? typicalWater(now), sightings: extras.sightings, redtide: extras.redtide });
    const fish = rankSpecies(ctx, []).find(r => !r.cr && !r.closed);
    return `<div class="spot ${key === active ? 'active' : ''}" data-key="${esc(key)}">
      <button type="button" class="spot-main" data-key="${esc(key)}" aria-label="Show ${esc(p.name)}">
        <span class="spot-name">${esc(p.short)}</span>
        <span class="spot-score" style="--v:${score}">${score}</span>
        <span class="spot-tide">${flow ? (flow.dir === 'rising' ? '⬆ Rising' : '⬇ Falling') : 'No tide data'}</span>
        <span class="spot-next">${nx ? `${nx.type === 'H' ? 'High' : 'Low'} ${fmtTime(nx.t)}` : ''}</span>
        ${fish ? `<span class="spot-fish">🎣 ${esc(shortName(fish.name))}</span>` : ''}
        ${rt?.level >= 2 ? '<span class="spot-flag">Red tide</span>' : ''}
      </button>
      <button type="button" class="star ${on ? 'on' : ''}" data-star="${esc(key)}" aria-pressed="${on}" aria-label="${on ? 'Remove from' : 'Add to'} My spots">${on ? '★' : '☆'}</button>
    </div>`;
  }));
  el.innerHTML = cards.join('') + `<button type="button" class="spot spot-add" id="spot-add-2"><span>＋</span>Add a spot</button>`;
  $$('.spot-main', el).forEach(b => b.onclick = () => choose(b.dataset.key));
  $$('[data-star]', el).forEach(b => b.onclick = e => { e.stopPropagation(); toggleFav(b.dataset.star); });
  $('#spot-add-2').onclick = openSheet;
}

function renderBiting(p, hilo, v, now) {
  const el = $('#biting');
  const ctx = makeContext(p, now, { hilo, wind: v.wind, temp: extras.water?.temp ?? typicalWater(now), day: v.day, sightings: extras.sightings, redtide: extras.redtide });
  const top = rankSpecies(ctx, []).filter(r => !r.cr || r.score > 40).slice(0, 3);
  el.innerHTML = top.map(r => {
    const img = GUIDE[r.id]?.photos?.[0]?.src;
    return `<button type="button" class="fish" data-name="${esc(shortName(r.name))}">
      ${img ? `<img src="${esc(img)}" alt="" loading="lazy">` : '<span class="fish-ph">🐟</span>'}
      <span class="fish-body"><span class="fish-name">${esc(shortName(r.name))}${r.closed ? ' <span class="tag bad">Release</span>' : r.cr ? ' <span class="tag">C&amp;R</span>' : ''}</span>
      <span class="fish-why">${esc(r.why.slice(0, 2).join(' · ') || 'Good fit for this spot')}</span></span>
      <span class="fish-score">${r.score}</span>
    </button>`;
  }).join('');
  $$('.fish', el).forEach(b => b.onclick = () => {
    $('.tabs button[data-view=species]')?.click();
    const s = $('#species-search');
    if (s) { s.value = b.dataset.name.split(' ')[0]; s.dispatchEvent(new Event('input')); }
  });
}
const CLIMO = [61, 63, 68, 74, 80, 85, 87, 87, 85, 79, 70, 64];
const typicalWater = d => CLIMO[d.getMonth()];

function renderTide(p, hilo, v, now) {
  const el = $('#tide-chart');
  $('#tide-where').textContent = `NOAA ${p.station.name}`;
  if (!hilo) { el.innerHTML = `<p class="bad small">Couldn't load NOAA tides. Check your connection.</p>`; $('#tide-list').innerHTML = ''; return; }
  const d0 = new Date(now); d0.setHours(0, 0, 0, 0);
  const W = 600, Hh = 200, top = 26, bot = 42;
  const pts = [];
  for (let m = 0; m <= 1440; m += 10) pts.push([m, heightAt(hilo, new Date(+d0 + m * 60e3))]);
  const vals = pts.map(q => q[1]).filter(x => x != null);
  const lo = Math.min(...vals) - 0.3, hi = Math.max(...vals) + 0.3;
  const x = m => 8 + (W - 16) * m / 1440, y = val => top + (Hh - top - bot) * (1 - (val - lo) / (hi - lo));
  const mins = t => (t - d0) / 60e3;
  const path = pts.filter(q => q[1] != null).map((q, i) => `${i ? 'L' : 'M'}${x(q[0]).toFixed(1)},${y(q[1]).toFixed(1)}`).join('');
  const night = `<rect x="${x(0)}" y="0" width="${x(mins(v.day.sunrise)) - x(0)}" height="${Hh - bot}" class="t-night"/><rect x="${x(mins(v.day.sunset))}" y="0" width="${x(1440) - x(mins(v.day.sunset))}" height="${Hh - bot}" class="t-night"/>`;
  const bands = v.day.periods.map(s => `<rect x="${x(Math.max(0, mins(s.start)))}" y="0" width="${Math.max(0, x(Math.min(1440, mins(s.end))) - x(Math.max(0, mins(s.start))))}" height="${Hh - bot}" class="t-sol ${s.kind}"/>`).join('');
  const marks = hilo.filter(q => q.t >= d0 && mins(q.t) <= 1440).map(q => {
    const cx = x(mins(q.t)), cy = y(q.v), up = q.type === 'H';
    return `<circle cx="${cx}" cy="${cy}" r="4.5" class="t-dot"/><text x="${Math.min(W - 40, Math.max(40, cx))}" y="${up ? cy - 10 : cy + 22}" text-anchor="middle" class="t-lbl">${fmtTime(q.t)}</text>`;
  }).join('');
  const nm = mins(now), nh = heightAt(hilo, now);
  const ticks = [0, 6, 12, 18, 24].map(h => `<text x="${x(h * 60)}" y="${Hh - 8}" text-anchor="${h === 0 ? 'start' : h === 24 ? 'end' : 'middle'}" class="t-tick">${h === 0 || h === 24 ? '12a' : h === 12 ? 'noon' : h > 12 ? (h - 12) + 'p' : h + 'a'}</text>`).join('');
  el.innerHTML = `<svg viewBox="0 0 ${W} ${Hh}" role="img" aria-label="Today's tide curve with feeding times">
    ${night}${bands}
    <path d="${path} L${x(1440)},${Hh - bot} L${x(0)},${Hh - bot}Z" class="t-fill"/>
    <path d="${path}" class="t-line"/>
    ${marks}
    ${nh != null ? `<line x1="${x(nm)}" x2="${x(nm)}" y1="4" y2="${Hh - bot}" class="t-now"/><circle cx="${x(nm)}" cy="${y(nh)}" r="7" class="t-me"/>` : ''}
    ${ticks}</svg>
    <div class="legend small"><span><i class="lg-sol"></i>Feeding time (solunar)</span><span><i class="lg-night"></i>Dark</span><span><i class="lg-now"></i>Now</span></div>`;
  $('#tide-list').innerHTML = hilo.filter(q => q.t >= d0 && mins(q.t) < 1440)
    .map(q => `<li class="${q.t < now ? 'past' : ''}"><span>${q.type === 'H' ? 'High' : 'Low'}</span><span>${fmtTime(q.t)}</span><span>${q.v.toFixed(1)} ft</span></li>`).join('')
    + v.day.periods.map(s => `<li class="${s.end < now ? 'past' : ''}"><span>${s.kind === 'major' ? 'Major feed' : 'Minor feed'}</span><span>${fmtTime(s.start)}–${fmtTime(s.end)}</span><span class="muted">${esc(s.label)}</span></li>`).join('');
}

function renderWeek(p, hilo, now) {
  const fc = forecast(now, 7, p.lat, p.lng, hilo, DAYTIME);
  const best = fc.reduce((a, b) => b.score > a.score ? b : a);
  $('#week').innerHTML = `<div class="week-bars">${fc.map((f, i) => `
    <div class="wk ${f === best ? 'best' : ''}">
      <span class="wk-score">${f.score}</span>
      <span class="wk-bar"><span style="height:${Math.max(8, f.score)}%"></span></span>
      <span class="wk-day">${i === 0 ? 'Today' : f.date.toLocaleDateString([], { weekday: 'short' })}</span>
      <span class="wk-moon">${f.moon.icon}</span>
    </div>`).join('')}</div>
    <p class="small"><strong>Best day: ${best === fc[0] ? 'today' : best.date.toLocaleDateString([], { weekday: 'long' })}</strong>, ${best.best.map(w => `${fmtTime(w.start)}–${fmtTime(new Date(+w.start + 2 * H))}`).join(' and ')}.</p>`;
}

// ---------- spot picker sheet ----------
function renderSheet() {
  const sheet = $('#spot-sheet'); if (!sheet?.open) return;
  const q = $('#sheet-q').value.trim().toLowerCase();
  const row = key => {
    const p = place(key); if (!p || (q && !p.name.toLowerCase().includes(q))) return '';
    const on = favs.includes(key);
    return `<li class="${key === active ? 'active' : ''}"><button type="button" class="pick-row" data-key="${esc(key)}">${esc(p.name)}${p.boat ? ' <span class="muted small">(boat)</span>' : ''}</button>
      <button type="button" class="star ${on ? 'on' : ''}" data-star="${esc(key)}" aria-pressed="${on}" aria-label="${on ? 'Remove from' : 'Add to'} My spots">${on ? '★' : '☆'}</button></li>`;
  };
  const group = (title, keys) => { const h = keys.map(row).join(''); return h ? `<h3>${title}</h3><ul class="pick-list">${h}</ul>` : ''; };
  $('#sheet-list').innerHTML = (favs.length ? group('My spots', favs) : '')
    + group('Fishing spots', SPOTS.map(s => 'spot:' + s.id).filter(k => !favs.includes(k)))
    + group('NOAA tide stations', STATIONS.map(s => 'sta:' + s.id).filter(k => !favs.includes(k)))
    || '<p class="muted">No matches.</p>';
  $$('.pick-row', sheet).forEach(b => b.onclick = () => choose(b.dataset.key));
  $$('[data-star]', sheet).forEach(b => b.onclick = () => toggleFav(b.dataset.star));
}
function openSheet() {
  const s = $('#spot-sheet');
  $('#sheet-q').value = '';
  if (!s.open) s.showModal();
  renderSheet();
}

let toastT;
function toast(msg) {
  const t = $('#toast'); t.textContent = msg; t.classList.add('show');
  clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove('show'), 1800);
}

// ---------- wire up ----------
$('#here-btn').onclick = openSheet;
$('#spot-add').onclick = openSheet;
$('#sheet-close').onclick = () => $('#spot-sheet').close();
$('#spot-sheet').addEventListener('click', e => { if (e.target.id === 'spot-sheet') e.target.close(); }); // tap outside
$('#sheet-q').oninput = renderSheet;
$('#sheet-near').onclick = () => {
  const b = $('#sheet-near');
  if (!navigator.geolocation) { b.textContent = 'Location not available'; return; }
  b.textContent = 'Finding you…';
  navigator.geolocation.getCurrentPosition(pos => {
    b.textContent = '📍 Nearest to me';
    choose('spot:' + nearestSpot(pos.coords.latitude, pos.coords.longitude).id);
  }, () => { b.textContent = 'Location is off (Settings › Safari › Location)'; }, { enableHighAccuracy: false, timeout: 15000 });
};

render();
loadStations().then(() => { if (!place(active)) active = 'spot:fort-desoto'; render(); });
loadExtras();
setInterval(render, 5 * 60e3); // keep "now" fresh if the app stays open
document.addEventListener('visibilitychange', () => { if (!document.hidden) render(); });
