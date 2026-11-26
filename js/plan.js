// "Plan" tab: what to target at a spot and time, and where/when to go for a species.
import { getHiLo, nearestStation, loadStations } from './tides.js';
import { SPOTS, spotById, nearestSpot } from './spots.js';
import { estimateWaterTemp, latestWaterTemp, typicalTemp, windForecast, windAt } from './conditions.js';
import { TARGETS, makeContext, rankSpecies, findWindows, catchHistory } from './recommend.js';
import * as store from './store.js';

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
const legal = r => r.cr ? '<span class="tag">Catch &amp; release</span>' : r.closed ? '<span class="tag bad">Closed, release only</span>' : '';

// ---------- form setup ----------
const spotSel = $('#plan-spot'), spSel = $('#plan-species');
spotSel.innerHTML = SPOTS.map(s => `<option value="${s.id}">${esc(s.name)}${s.boat ? ' (boat)' : ''}</option>`).join('');
spSel.innerHTML = TARGETS.map(s => `<option value="${s.id}">${esc(s.name)}</option>`).join('');
const now0 = new Date();
$('#plan-date').value = `${now0.getFullYear()}-${pad(now0.getMonth() + 1)}-${pad(now0.getDate())}`;
$('#plan-time').value = `${pad(Math.min(23, now0.getHours() + 1))}:00`;

$('#plan-near').onclick = () => {
  if (!navigator.geolocation) return;
  $('#plan-near').textContent = 'Finding you…';
  navigator.geolocation.getCurrentPosition(p => {
    spotSel.value = nearestSpot(p.coords.latitude, p.coords.longitude).id;
    $('#plan-near').textContent = 'Nearest to me';
  }, () => { $('#plan-near').textContent = 'Location blocked'; }, { timeout: 15000 });
};

// ---------- feature 1: what should I target? ----------
$('#plan-what').onsubmit = async e => {
  e.preventDefault();
  const out = $('#plan-what-out');
  const spot = spotById(spotSel.value);
  const t = new Date(`${$('#plan-date').value}T${$('#plan-time').value || '07:00'}`);
  if (isNaN(t)) return status(out, 'Pick a date and time.');
  status(out, 'Checking tides, water temp and wind…');
  await loadStations();
  const [hilo, wt, wind, hist] = await Promise.all([tidesFor(spot, t, 1), estimateWaterTemp(spot.lat, spot.lng, t), windForecast(), history()]);
  const w = windAt(wind, t);
  const ctx = makeContext(spot, t, { hilo, wind: w, temp: wt.temp });
  const ranked = rankSpecies(ctx, hist);
  const top = ranked.slice(0, 3), rest = ranked.slice(3);
  out.innerHTML = `
    <div class="chips">
      <span class="chip">🌡 ${Math.round(wt.temp)}°F water <span class="muted">(${esc(wt.source)})</span></span>
      ${w ? `<span class="chip">💨 ${w.mph} mph ${esc(w.dir)}</span>` : '<span class="chip muted">Wind: no forecast this far out</span>'}
      ${ctx.flow ? `<span class="chip">${ctx.flow.dir === 'rising' ? '↑' : '↓'} Tide ${ctx.flow.dir}</span>` : '<span class="chip muted">Tide unavailable</span>'}
      <span class="chip">${ctx.moon.icon} ${esc(ctx.moon.name)}</span>
    </div>
    ${top.map((r, i) => `
      <div class="pick">
        <div class="pick-head"><span class="rank">${i + 1}</span><strong>${esc(r.name)}</strong>${legal(r)}<span class="score">${r.score}</span></div>
        ${bar(r.score)}
        <div class="small">${esc(r.why.join(' · '))}</div>
        ${r.tip ? `<div class="small muted">Tip: ${esc(r.tip)}</div>` : ''}
      </div>`).join('')}
    <details><summary class="small">All species</summary>
      <ul class="plain small">${rest.map(r => `<li><span>${esc(r.name)} ${r.closed ? '(closed)' : ''}</span><span>${r.score}</span></li>`).join('')}</ul>
    </details>`;
};

// ---------- feature 2: where and when for a species? ----------
$('#plan-where').onsubmit = async e => {
  e.preventDefault();
  const out = $('#plan-where-out');
  const id = spSel.value, days = 7, start = new Date();
  status(out, 'Scoring every spot for the next 7 days…');
  await loadStations();
  const stations = [...new Set(SPOTS.map(s => nearestStation(s.lat, s.lng).id))];
  const hiloBy = new Map(await Promise.all(stations.map(async sid => [sid, await getHiLo(sid, start, days).catch(() => null)])));
  const [wind, hist, live] = await Promise.all([windForecast(), history(), latestWaterTemp(27.77, -82.63)]);
  const anomaly = live ? live.temp - typicalTemp(start) : 0;
  const inputs = new Map(SPOTS.map(s => [s.id, {
    hilo: hiloBy.get(nearestStation(s.lat, s.lng).id),
    temp: d => typicalTemp(d) + anomaly * Math.exp(-Math.max(0, (d - start) / DAY) / 10),
  }]));
  await new Promise(r => setTimeout(r, 0)); // let the status message paint
  const best = findWindows(id, start, days, inputs, wind, hist);
  const name = TARGETS.find(s => s.id === id).name;
  if (!best.length) return status(out, 'No good windows found.');
  out.innerHTML = `
    <p class="small muted">Water ${live ? `${Math.round(live.temp)}°F now (NOAA)` : 'temp from typical values'}${wind.length ? ', wind from the NWS forecast' : ', no wind forecast loaded'}.</p>
    ${best[0].closed ? `<p class="small warn">${esc(name)} is closed to harvest right now. Catch and release only.</p>` : ''}
    ${best.map((r, i) => `
      <div class="pick">
        <div class="pick-head"><span class="rank">${i + 1}</span><strong>${esc(r.spot.name)}</strong><span class="score">${r.score}</span></div>
        <div class="small"><strong>${fmtDay(r.start)}, ${fmtTime(r.start)}–${fmtTime(r.end)}</strong>${r.wind ? ` · ${r.wind.mph} mph ${esc(r.wind.dir)}` : ''}</div>
        ${bar(r.score)}
        <div class="small">${esc(r.why.join(' · '))}</div>
        ${r.backup ? `<div class="small muted">Backup: ${fmtDay(r.backup.start)}, ${fmtTime(r.backup.start)}–${fmtTime(r.backup.end)} (${r.backup.score})</div>` : ''}
      </div>`).join('')}
    ${best[0].tip ? `<p class="small muted">Tip: ${esc(best[0].tip)}</p>` : ''}`;
};
