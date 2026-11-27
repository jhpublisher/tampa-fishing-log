// "Plan" tab: what to target at a spot and time, and where/when to go for a species.
import { getHiLo, nearestStation, loadStations } from './tides.js';
import { SPOTS, spotById, nearestSpot, CATS, catOf, accessOf } from './spots.js';
import { spotCombo, saveLoc, refPoint } from './placesearch.js';
import { addSpotAt, place, activePlace, dropProbe } from './home.js';
import { estimateWaterTemp, latestWaterTemp, typicalTemp, windForecast, windAt, windCells, windCellAt, spotWind, windLimit, setWindLimit } from './conditions.js';
import { TARGETS, makeContext, rankSpecies, findWindows, catchHistory } from './recommend.js';
import * as store from './store.js';
import { recentSightings, redTideSamples, redTideAt, REPORT_LINKS, latestHubbards } from './sightings.js';
import { byId, closesText, daysToClose } from './species.js';
import { TIPS } from './tips.js';

const $ = (s, el = document) => el.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const fmtTime = d => d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
const fmtDay = d => d.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' });
const pad = n => String(n).padStart(2, '0');
const H = 3600e3, DAY = 24 * H;

async function history() {
  if (!store.currentUser()) return [];
  try { return catchHistory(await store.listTrips()); } catch { return []; }
}
const tidesFor = (spot, start, days) => getHiLo(nearestStation(spot.lat, spot.lng).id, start, days).catch(() => null);
const status = (el, msg) => { el.innerHTML = `<p class="muted small">${esc(msg)}</p>`; };
const bar = v => `<div class="bar"><span style="width:${v}%"></span></div>`;
const legal = r => r.cr ? '<span class="tag">Catch &amp; release</span>' : r.closed ? '<span class="tag bad">Closed, release only</span>' : r.closing ? `<span class="tag warn">${closesText(r.closing, r.at)}</span>` : '';
const coldNote = t => t < 60 ? `<p class="small warn">Water is ${Math.round(t)}°F. Fish are cold-stressed: fish slow, release gently, and leave fish crowded in warm-water outflows alone. FWC can close fisheries after a cold kill.</p>` : '';

// wind limit picker (shared with Today, kept on this phone)
const windSel = $('#plan-wind');
const fillWind = () => { windSel.innerHTML = [10, 12, 15, 18, 20, 22, 25, 30].map(v => `<option value="${v}" ${v === windLimit() ? 'selected' : ''}>${v} mph</option>`).join(''); };
fillWind();
windSel.onchange = () => setWindLimit(+windSel.value);
document.addEventListener('wind-limit', fillWind);

// ---------- form setup ----------
const spotSel = $('#plan-spot'), spSel = $('#plan-species');
let pinSpot = null; // a dropped pin being scored (value '__pin')
const fillSpots = () => {
  const keep = spotSel.value;
  // grouped by kind of spot, A to Z inside each group
  spotSel.innerHTML = '<option value=""></option>' + Object.entries(CATS).map(([c, title]) => {
    const list = SPOTS.filter(s => catOf(s) === c).sort((a, b) => a.name.localeCompare(b.name));
    return list.length ? `<optgroup label="${esc(title)}">${list.map(s => `<option value="${s.id}">${esc(s.name)}${s.boat && c !== 'ramp' && c !== 'offshore' ? ' (boat)' : ''}</option>`).join('')}</optgroup>` : '';
  }).join('');
  if (pinSpot) spotSel.insertAdjacentHTML('beforeend', `<option value="__pin">${esc(pinSpot.name)}</option>`);
  if (SPOTS.some(s => s.id === keep) || (keep === '__pin' && pinSpot)) spotSel.value = keep;
};
fillSpots();
document.addEventListener('spots-changed', fillSpots);
// One box: pick a spot, or type to search. A tide station or map place opens the map to save it as your spot.
spotSel.value = '';
const combo = spotCombo($('#plan-combo'), {
  ref: () => refPoint(activePlace()),
  onPick: r => {
    if (r.kind === 'spot') { spotSel.value = r.key.slice(5); return; }
    spotSel.value = ''; combo.clear();
    const p = r.kind === 'osm' ? r : place(r.key);
    if (p) addSpotAt(p.lat, p.lng, r.name);
  },
});
$('#plan-q').addEventListener('input', () => { spotSel.value = ''; }); // typed but not picked yet
document.addEventListener('spot-added', e => {
  if (!document.getElementById('view-plan').classList.contains('active')) return;
  fillSpots(); spotSel.value = e.detail; combo.set(spotById(e.detail)?.name);
});
spSel.innerHTML = TARGETS.map(s => `<option value="${s.id}">${esc(s.name)}</option>`).join('');
const now0 = new Date();
$('#plan-date').value = `${now0.getFullYear()}-${pad(now0.getMonth() + 1)}-${pad(now0.getDate())}`;
$('#plan-time').value = `${pad(Math.min(23, now0.getHours() + 1))}:00`;

// Drop a pin: pick a spot near it, or score the pin itself.
$('#plan-pin').onclick = () => dropProbe({
  near: spotById(spotSel.value) || null,
  onSpot: id => { spotSel.value = id; combo.set(spotById(id)?.name); },
  onTarget: spot => {
    pinSpot = spot;
    fillSpots(); spotSel.value = '__pin'; combo.set(spot.name);
    $('#plan-what').requestSubmit();
  },
});

$('#plan-near').onclick = () => {
  if (!navigator.geolocation) return;
  $('#plan-near').textContent = 'Finding you…';
  navigator.geolocation.getCurrentPosition(p => {
    saveLoc(p.coords.latitude, p.coords.longitude);
    spotSel.value = nearestSpot(p.coords.latitude, p.coords.longitude).id;
    combo.set(spotById(spotSel.value)?.name);
    $('#plan-near').textContent = 'Nearest to me';
  }, () => { $('#plan-near').textContent = 'Location blocked'; }, { timeout: 15000 });
};

// ---------- feature 1: what should I target? ----------
$('#plan-what').onsubmit = async e => {
  e.preventDefault();
  const out = $('#plan-what-out');
  const spot = spotSel.value === '__pin' ? pinSpot : spotById(spotSel.value);
  if (!spot) { status(out, 'Pick a spot first: tap the Spot box or type a place.'); $('#plan-q').focus(); return; }
  const t = new Date(`${$('#plan-date').value}T${$('#plan-time').value || '07:00'}`);
  if (isNaN(t)) return status(out, 'Pick a date and time.');
  status(out, 'Checking tides, water temp and wind…');
  await loadStations();
  const [hilo, wt, bayWind, here, hist, sightings, redtide] = await Promise.all([tidesFor(spot, t, 1), estimateWaterTemp(spot.lat, spot.lng, t), windForecast(), spotWind(spot.lat, spot.lng), history(), recentSightings(30), redTideSamples()]);
  const wind = here?.length ? here : bayWind;
  const w = windAt(wind, t);
  const ctx = makeContext(spot, t, { hilo, wind: w, temp: wt.temp, sightings, redtide });
  const ranked = rankSpecies(ctx, hist);
  const top = ranked.slice(0, 3), rest = ranked.slice(3);
  out.innerHTML = `
    <div class="chips">
      <span class="chip">🌡 ${Math.round(wt.temp)}°F water <span class="muted">(${esc(wt.source)})</span></span>
      ${w ? `<span class="chip ${w.mph > windLimit() ? 'warn' : ''}">💨 ${w.mph}${w.gust ? `–${w.gust}` : ''} mph ${esc(w.dir)}</span>` : `<span class="chip muted">Wind: ${wind.length ? 'no forecast this far out' : 'forecast unavailable'}</span>`}
      ${ctx.flow ? `<span class="chip">${ctx.flow.dir === 'rising' ? '↑' : '↓'} Tide ${ctx.flow.dir}</span>` : '<span class="chip muted">Tide unavailable</span>'}
      <span class="chip">${ctx.moon.icon} ${esc(ctx.moon.name)}</span>
      ${redChip(ctx.redtide)}
    </div>
    ${coldNote(wt.temp)}
    ${top.map((r, i) => `
      <div class="pick">
        <div class="pick-head"><span class="rank">${i + 1}</span><strong>${esc(r.name)}</strong>${legal(r)}<span class="score">${r.score}</span></div>
        ${bar(r.score)}
        <div class="small">${esc(r.why.join(' · '))}</div>
        ${r.tip ? `<div class="small muted">Tip: ${esc(r.tip)}</div>` : ''}
        ${TIPS[r.id] ? `<details class="small"><summary>Bait and rig</summary>${esc(TIPS[r.id].bait)}</details>` : ''}
      </div>`).join('')}
    <details><summary class="small">All species</summary>
      <ul class="plain small">${rest.map(r => `<li><span>${esc(r.name)} ${r.closed ? '(closed)' : r.closing ? `(${closesText(r.closing, r.at).replace('Closes', 'closes')})` : ''}</span><span>${r.score}</span></li>`).join('')}</ul>
    </details>`;
};

// ---------- feature 2: where and when for a species? ----------
$('#plan-where').onsubmit = async e => {
  e.preventDefault();
  const out = $('#plan-where-out');
  const id = spSel.value, days = 7, start = new Date();
  status(out, 'Scoring every spot for the next 7 days…');
  await loadStations();
  const acc = $('#plan-access').value;
  const pool = SPOTS.filter(s => !s.osm && (!acc || accessOf(s).includes(acc)));
  const stations = [...new Set(pool.map(s => nearestStation(s.lat, s.lng).id))];
  const hiloBy = new Map(await Promise.all(stations.map(async sid => [sid, await getHiLo(sid, start, days).catch(() => null)])));
  const [wind, cells, hist, live, sightings, redtide] = await Promise.all([windForecast(), windCells(pool.map(s => [s.lat, s.lng])), history(), latestWaterTemp(27.77, -82.63), recentSightings(30), redTideSamples()]);
  const anomaly = live ? live.temp - typicalTemp(start) : 0;
  const inputs = new Map(pool.map(s => [s.id, {
    hilo: hiloBy.get(nearestStation(s.lat, s.lng).id),
    wind: windCellAt(cells, s.lat, s.lng),
    temp: d => typicalTemp(d) + anomaly * Math.exp(-Math.max(0, (d - start) / DAY) / 10),
  }]));
  await new Promise(r => setTimeout(r, 0)); // let the status message paint
  const [from, to] = $('#plan-when').value.split('-').map(Number);
  const best = findWindows(id, start, days, inputs, wind, hist, { sightings, redtide }, 5, { from, to });
  const perSpot = [...cells.values()].some(Boolean);
  const name = TARGETS.find(s => s.id === id).name;
  if (!best.length) return status(out, 'No good windows found.');
  out.innerHTML = `
    <p class="small muted">Water ${live ? `${Math.round(live.temp)}°F now (NOAA)` : 'temp from typical values'}${perSpot ? ', wind and gusts for each spot (Open-Meteo)' : wind.length ? ', wind from the NWS forecast' : ', no wind forecast loaded'}, your wind limit ${windLimit()} mph${sightings ? (n => `, ${n} recent iNaturalist sighting${n === 1 ? '' : 's'}`)(sightings.filter(x => x.species === id).length) : ''}${redtide ? ', red tide from FWC' : ''}.</p>
    ${best.some(r => r.closed || r.backup?.closed) ? `<p class="small warn">${esc(name)} is closed to harvest on ${best[0].closed ? 'these dates' : 'some of these dates'}. Catch and release only.</p>` : ''}
    ${(n => n != null ? `<p class="small warn">${esc(name)} season ${closesText(n).replace('Closes', 'closes')}. Windows on or after that day are catch and release only.</p>` : '')(daysToClose(byId(id), new Date()))}
    ${live ? coldNote(live.temp) : ''}
    ${best.map((r, i) => `
      <div class="pick">
        <div class="pick-head"><span class="rank">${i + 1}</span><strong>${esc(r.spot.name)}</strong>${r.closed ? '<span class="status closed">Closed</span>' : ''}<span class="score">${r.score}</span></div>
        <div class="small"><strong>${fmtDay(r.start)}, ${fmtTime(r.start)}–${fmtTime(r.end)}</strong>${r.wind ? ` · <span class="${r.windy ? 'warn' : ''}">${r.wind.mph}${r.wind.gust ? `–${r.wind.gust}` : ''} mph ${esc(r.wind.dir)}</span>` : ''}</div>
        ${bar(r.score)}
        <div class="small">${esc(r.why.join(' · '))}</div>
        ${r.backup ? `<div class="small muted">Backup: ${fmtDay(r.backup.start)}, ${fmtTime(r.backup.start)}–${fmtTime(r.backup.end)} (${r.backup.score})${r.backup.closed ? ' · closed that day' : ''}</div>` : ''}
      </div>`).join('')}
    ${best[0].tip ? `<p class="small muted">Tip: ${esc(best[0].tip)}</p>` : ''}
    ${TIPS[id] ? `<p class="small muted">Bait and rig: ${esc(TIPS[id].bait)}</p>` : ''}`;
};

// ---------- red tide chip ----------
function redChip(rt) {
  if (!rt) return '<span class="chip muted">Red tide: no recent sample nearby</span>';
  const when = rt.date.toLocaleDateString([], { month: 'short', day: 'numeric' });
  if (rt.level === 0) return `<span class="chip">✅ No red tide <span class="muted">(FWC, ${when})</span></span>`;
  return `<span class="chip ${rt.level >= 2 ? 'warn' : ''}">⚠️ Red tide ${esc(rt.label)} <span class="muted">(${esc(rt.place)}, ${when})</span></span>`;
}

// ---------- recent catches and sightings ----------
const sSel = $('#recent-species'), dSel = $('#recent-days');
sSel.innerHTML = '<option value="">All game fish</option>' + TARGETS.map(s => `<option value="${s.id}">${esc(s.name)}</option>`).join('');
let rmap = null, rlayer = null;

async function showRecent() {
  const out = $('#recent-out'), days = +dSel.value, sp = sSel.value;
  status(out, 'Loading recent sightings and red tide…');
  const [list, red] = await Promise.all([recentSightings(days), redTideSamples()]);
  if (!list) return status(out, 'Couldn’t reach iNaturalist. Try again with signal.');
  const rows = list.filter(x => !sp || x.species === sp);
  $('#recent-map').hidden = false;
  if (!rmap) {
    rmap = L.map('recent-map').setView([27.8, -82.65], 9);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '© OpenStreetMap · iNaturalist · FWC' }).addTo(rmap);
    rlayer = L.layerGroup().addTo(rmap);
  }
  rmap.invalidateSize();
  rlayer.clearLayers();
  for (const r of red || []) {
    const c = ['#3a9d5d', '#c9b13a', '#e08a2c', '#d0452f', '#9b1c1c'][r.level];
    L.circleMarker([r.lat, r.lng], { radius: 5, color: c, fillColor: c, fillOpacity: .5, weight: 1 })
      .bindPopup(`<strong>Red tide: ${esc(r.label)}</strong><br>${esc(r.place)}<br>FWC sample ${r.date.toLocaleDateString()}`).addTo(rlayer);
  }
  for (const x of rows) {
    L.circleMarker([x.lat, x.lng], { radius: 8, color: '#0b5d7a', fillColor: '#f2994a', fillOpacity: .9, weight: 2 })
      .bindPopup(`${x.photo ? `<img src="${esc(x.photo)}" alt="" width="75" height="75" style="float:left;margin-right:8px;border-radius:6px">` : ''}<strong>${esc(byId(x.species).name)}</strong><br>${fmtDay(x.date)}<br>${esc(x.place)}${x.obscured ? '<br><em>Location blurred by the poster</em>' : ''}<br><a href="${esc(x.url)}" target="_blank" rel="noopener">View on iNaturalist</a>`)
      .addTo(rlayer);
  }
  const counts = {};
  rows.forEach(x => { counts[x.species] = (counts[x.species] || 0) + 1; });
  const top = Object.entries(counts).sort((a, b) => b[1] - a[1]);
  const bad = (red || []).filter(r => r.level >= 2);
  out.innerHTML = `
    <p class="small"><strong>${rows.length}</strong> sighting${rows.length === 1 ? '' : 's'} in the last ${days} days${sp ? '' : ': ' + esc(top.slice(0, 5).map(([k, n]) => `${byId(k).name} ${n}`).join(', '))}.</p>
    <p class="small ${bad.length ? 'warn' : 'muted'}">${red ? (bad.length ? `Red tide at ${bad.length} sample site${bad.length > 1 ? 's' : ''}: ${esc([...new Set(bad.map(b => b.place))].slice(0, 3).join(', '))}.` : `No red tide in ${red.length} FWC samples this week.`) : 'Red tide data unavailable.'}</p>
    <ul class="plain small">${rows.slice(0, 12).map(x => `<li><span>${esc(byId(x.species).name)} · ${esc(x.place.split(',')[0] || 'Tampa Bay')}</span><span>${x.date.toLocaleDateString([], { month: 'short', day: 'numeric' })}</span></li>`).join('')}</ul>
    <p class="muted small">Public sightings from iNaturalist anglers and divers. Fewer than the big catch apps, but real and recent. Tap a pin for the photo.</p>`;
}
$('#recent').onsubmit = e => { e.preventDefault(); showRecent(); };

// ---------- local fishing reports ----------
(async () => {
  const el = $('#reports-list');
  el.innerHTML = REPORT_LINKS.map(r => `<li><a href="${esc(r.url)}" target="_blank" rel="noopener"><strong>${esc(r.name)}</strong></a><span class="muted">${esc(r.note)}</span></li>`).join('');
  const h = await latestHubbards();
  if (!h) return;
  const age = Math.floor((Date.now() - h.date) / DAY);
  const stale = age > 14; // an old report goes to the bottom and says how old it is
  el.insertAdjacentHTML(stale ? 'beforeend' : 'afterbegin', `<li><a href="${esc(h.url)}" target="_blank" rel="noopener"><strong>${esc(h.title)}</strong></a><span class="muted">John’s Pass party boats · ${fmtDay(h.date)}${stale ? ` · ${age >= 60 ? `${Math.round(age / 30)} months` : `${Math.round(age / 7)} weeks`} old` : ''}</span></li>`);
})();
