import { STATIONS, loadStations, getHiLo, heightAt, flowAt, nearestStation } from './tides.js';
import { moonInfo, solunarDay, forecast } from './solunar.js';
import { SPECIES, byId, ruleText, checkKeep } from './species.js';
import * as store from './store.js';
import { readExif } from './exif.js';
import { pastWaterTemp } from './conditions.js';

const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const fmtTime = d => d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
const fmtDay = d => d.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' });
const todayStr = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const ls = { get: k => { try { return localStorage.getItem(k); } catch { return null; } }, set: (k, v) => { try { localStorage.setItem(k, v); } catch { } } };

// ---------- navigation ----------
function show(view) {
  $$('.view').forEach(v => v.classList.toggle('active', v.id === `view-${view}`));
  $$('.tabs button').forEach(b => b.classList.toggle('active', b.dataset.view === view));
  window.scrollTo(0, 0);
  if (view === 'log' && store.currentUser()) renderTrips();
}
$$('.tabs button').forEach(b => b.onclick = () => show(b.dataset.view));

// ---------- station ----------
const stationSel = $('#station');
// Favorites: saved on this phone, and on James's account when signed in.
let favs = (() => { try { return JSON.parse(ls.get('favStations') || '[]'); } catch { return []; } })();
const saveFavs = () => { ls.set('favStations', JSON.stringify(favs)); store.setFavStations(favs).catch(() => { }); };
const opt = s => `<option value="${s.id}">${esc(s.name)}</option>`;
const fillStations = () => {
  const want = stationSel.value || ls.get('station') || '8726520';
  const fav = favs.map(id => STATIONS.find(s => s.id === id)).filter(Boolean);
  const rest = STATIONS.filter(s => !favs.includes(s.id));
  stationSel.innerHTML = fav.length
    ? `<optgroup label="★ Favorites">${fav.map(opt).join('')}</optgroup><optgroup label="All stations">${rest.map(opt).join('')}</optgroup>`
    : STATIONS.map(opt).join('');
  stationSel.value = STATIONS.some(s => s.id === want) ? want : STATIONS[0].id;
  updateFavBtn();
};
const favBtn = $('#fav-btn');
function updateFavBtn() {
  const on = favs.includes(stationSel.value);
  favBtn.textContent = on ? '★' : '☆';
  favBtn.setAttribute('aria-pressed', String(on));
  favBtn.setAttribute('aria-label', on ? 'Remove this station from favorites' : 'Add this station to favorites');
}
favBtn.onclick = () => {
  const id = stationSel.value;
  favs = favs.includes(id) ? favs.filter(x => x !== id) : [...favs, id];
  saveFavs(); fillStations();
};
fillStations();
loadStations().then(fillStations);
stationSel.onchange = () => { ls.set('station', stationSel.value); updateFavBtn(); renderToday(); };
const station = () => STATIONS.find(s => s.id === stationSel.value) || STATIONS[0];

// ---------- today ----------
async function renderToday() {
  const st = station(), now = new Date();
  const moon = moonInfo(now);
  const day = solunarDay(now, st.lat, st.lng);
  let hilo = null, tideErr = '';
  let sample = false;
  try { hilo = await getHiLo(st.id, now, 8); } catch (e) {
    tideErr = e.message;
    // Preview pages can't reach NOAA, so show clearly labeled sample tides there.
    if (!/github\.io$|localhost|127\.0\.0\.1/.test(location.hostname)) { hilo = sampleHiLo(now); sample = true; }
  }

  const fc = forecast(now, 7, st.lat, st.lng, hilo);
  const t0 = fc[0];
  const flow = hilo ? flowAt(hilo, now) : null;
  const verdict = t0.score >= 80 ? 'Get out there' : t0.score >= 65 ? 'Good day' : t0.score >= 50 ? 'Fair' : 'Slow day';
  $('#today-summary').innerHTML = `
    <div class="today-head">
      <div class="gauge" style="--v:${t0.score}"><span>${t0.score}</span></div>
      <div class="today-main">
        <div class="eyebrow">Today at ${esc(st.name)}</div>
        <div class="verdict">${verdict}</div>
        <div class="small">Best: <strong>${t0.best.map(w => `${fmtTime(w.start)}–${fmtTime(new Date(+w.start + 2 * 3600e3))}`).join('</strong> and <strong>')}</strong></div>
      </div>
    </div>
    <div class="chips">
      <span class="chip">${moon.icon} ${moon.name} · ${Math.round(moon.fraction * 100)}%</span>
      ${flow ? `<span class="chip">${flow.dir === 'rising' ? '↑' : '↓'} ${heightAt(hilo, now).toFixed(1)} ft, ${flow.dir}</span>` : ''}
    </div>`;

  // tide chart + list
  if (hilo) {
    $('#tide-chart').innerHTML = (sample ? '<p class="warn small">Preview: live NOAA tides are blocked here, so these are SAMPLE tides, not real.</p>' : '') + tideSvg(hilo, now);
    const d0 = new Date(now); d0.setHours(0, 0, 0, 0); const d1 = new Date(+d0 + 24 * 3600e3);
    $('#tide-list').innerHTML = hilo.filter(p => p.t >= d0 && p.t < d1)
      .map(p => `<li><span>${p.type === 'H' ? 'High' : 'Low'}</span><span>${fmtTime(p.t)}</span><span>${p.v.toFixed(1)} ft</span></li>`).join('');
  } else {
    $('#tide-chart').innerHTML = `<p class="bad small">Couldn't load NOAA tides (${esc(tideErr)}). Check your connection.</p>`;
    $('#tide-list').innerHTML = '';
  }

  $('#solunar').innerHTML = `
    <ul class="plain">
      <li><span>Sunrise / sunset</span><span>${fmtTime(day.sunrise)} / ${fmtTime(day.sunset)}</span></li>
      ${day.periods.map(p => `<li><span>${p.kind === 'major' ? 'Major' : 'Minor'} · ${p.label}</span><span>${fmtTime(p.start)}–${fmtTime(p.end)}</span></li>`).join('')}
    </ul>`;

  $('#forecast').innerHTML = fc.map(f => `
    <div class="day">
      <div class="small">${fmtDay(f.date)} ${f.moon.icon}</div>
      <div class="bar"><span style="width:${f.score}%"></span></div>
      <div class="small" style="text-align:right">${f.score}</div>
      <div class="windows">${f.best.map(w => `${fmtTime(w.start)}–${fmtTime(new Date(+w.start + 2 * 3600e3))}`).join(' · ')}</div>
    </div>`).join('');
}

function sampleHiLo(now) {
  const out = []; let t = new Date(now); t.setHours(0, 0, 0, 0); t = new Date(+t - 22 * 3600e3);
  for (let i = 0; i < 40; i++) { const hi = i % 2 === 0; out.push({ t, v: hi ? 2.1 : 0.3, type: hi ? 'H' : 'L' }); t = new Date(+t + 6.2 * 3600e3); }
  return out;
}

function tideSvg(hilo, now) {
  const d0 = new Date(now); d0.setHours(0, 0, 0, 0);
  const W = 600, Hh = 150, pad = 18;
  const pts = [];
  for (let m = 0; m <= 1440; m += 10) pts.push([m, heightAt(hilo, new Date(+d0 + m * 60e3))]);
  const vals = pts.map(p => p[1]).filter(v => v != null);
  const lo = Math.min(...vals) - 0.2, hi = Math.max(...vals) + 0.2;
  const x = m => pad + (W - 2 * pad) * m / 1440, y = v => Hh - pad - (Hh - 2 * pad) * (v - lo) / (hi - lo);
  const path = pts.filter(p => p[1] != null).map((p, i) => `${i ? 'L' : 'M'}${x(p[0]).toFixed(1)},${y(p[1]).toFixed(1)}`).join('');
  const nm = (now - d0) / 60e3;
  const ticks = [0, 6, 12, 18, 24].map(h => `<text x="${x(h * 60)}" y="${Hh - 1}" font-size="17" text-anchor="middle" fill="currentColor" opacity=".6">${h === 0 || h === 24 ? '12a' : h === 12 ? '12p' : h > 12 ? (h - 12) + 'p' : h + 'a'}</text>`).join('');
  return `<svg viewBox="0 0 ${W} ${Hh}" role="img" aria-label="Today's tide curve">
    <path d="${path} L${x(1440)},${Hh - pad} L${x(0)},${Hh - pad}Z" fill="var(--flats)" opacity=".18"/>
    <path d="${path}" fill="none" stroke="var(--flats)" stroke-width="2.5"/>
    <line x1="${x(nm)}" x2="${x(nm)}" y1="${pad / 2}" y2="${Hh - pad}" stroke="var(--coral)" stroke-width="2" stroke-dasharray="4 3"/>
    ${ticks}</svg>`;
}

// ---------- trips list ----------
const urls = []; // object URLs to free on re-render
async function renderTrips() {
  urls.splice(0).forEach(u => URL.revokeObjectURL(u));
  let trips;
  try { trips = await store.listTrips(); } catch (e) { $('#trip-list').innerHTML = `<p class="bad">${esc(e.message)}</p>`; return; }
  if (!trips.length) { $('#trip-list').innerHTML = `<div class="empty"><svg viewBox="0 0 120 60" aria-hidden="true"><path d="M10 30c18-22 52-26 78-6l20-14v40l-20-14c-26 20-60 16-78-6z"/><circle cx="34" cy="27" r="3"/></svg><p>No trips logged yet.<br>Tap <strong>New trip</strong> after your next time on the water.</p></div>`; return; }
  $('#trip-list').innerHTML = trips.map(t => {
    const sp = [...new Set((t.catches || []).map(c => byId(c.species)?.name || 'Other'))];
    const photos = (t.catches || []).filter(c => c.photoUrl).map(c => `<img src="${esc(c.photoUrl)}" alt="" loading="lazy">`).join('');
    return `<div class="card trip" data-id="${t.id}">
      <div class="row" style="justify-content:space-between"><strong>${esc(t.spot || 'Unnamed spot')}</strong>
        <span class="small muted">${esc(t.date)} ${esc(t.start || '')}</span></div>
      <div class="small">${(t.catches || []).length} catch${(t.catches || []).length === 1 ? '' : 'es'}${sp.length ? ': ' + esc(sp.join(', ')) : ''}</div>
      ${t.conditions ? `<div class="small muted">${esc(t.conditions)}</div>` : ''}
      ${photos ? `<div class="photos">${photos}</div>` : ''}
    </div>`;
  }).join('');
  $$('.trip').forEach(el => el.onclick = () => openTrip(el.dataset.id));
}

// ---------- trip editor ----------
let map, marker, editing = null;
const form = $('#trip-form');

function setPin(lat, lng, zoom) {
  editing.lat = lat; editing.lng = lng;
  if (marker) marker.setLatLng([lat, lng]); else marker = L.marker([lat, lng]).addTo(map);
  if (zoom) map.setView([lat, lng], zoom);
  $('#coords-label').textContent = `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
}

function initMap() {
  if (map) return;
  map = L.map('trip-map').setView([27.77, -82.63], 10);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '© OpenStreetMap' }).addTo(map);
  map.on('click', e => setPin(e.latlng.lat, e.latlng.lng));
}

$('#gps-btn').onclick = () => {
  if (!navigator.geolocation) return alertBox('Location is not available on this device.');
  $('#coords-label').textContent = 'Finding you…';
  navigator.geolocation.getCurrentPosition(
    p => setPin(p.coords.latitude, p.coords.longitude, 14),
    () => { $('#coords-label').textContent = 'Location is off. On iPhone: Settings › Privacy & Security › Location Services › Safari Websites › While Using. Or tap the map.'; },
    { enableHighAccuracy: true, timeout: 15000 });
};
const alertBox = msg => { $('#coords-label').textContent = msg; };

function speciesOptions() {
  return '<option value="">Choose…</option>' + SPECIES.map(s => `<option value="${s.id}">${esc(s.name)}</option>`).join('');
}

function addCatchRow(c = {}) {
  const frag = $('#catch-template').content.cloneNode(true);
  const fs = $('fieldset', frag);
  const sel = $('[name=species]', fs);
  sel.innerHTML = speciesOptions();
  sel.value = c.species || '';
  $('[name=length]', fs).value = c.length ?? '';
  $('[name=weight]', fs).value = c.weight ?? '';
  $('[name=bait]', fs).value = c.bait || '';
  $('[name=time]', fs).value = c.time || '';
  $('[name=kept]', fs).checked = !!c.kept;
  fs._photo = null; // new photo (Blob) not yet uploaded
  fs._photoPath = c.photoPath || null;
  const img = $('.thumb', fs);
  const showPhoto = () => {
    const src = fs._photo ? URL.createObjectURL(fs._photo) : c.photoUrl;
    if (src) { img.src = src; img.classList.remove('hidden'); }
  };
  showPhoto();

  const update = () => {
    const sp = byId(sel.value);
    $('.rule', fs).textContent = ruleText(sp);
    const res = $('.check-result', fs);
    if ($('[name=kept]', fs).checked && sp) {
      const r = checkKeep(sp, +$('[name=length]', fs).value || null, new Date(form.date.value + 'T12:00'));
      res.textContent = r?.msg || ''; res.className = `check-result small ${r?.level || ''}`;
    } else res.textContent = '';
  };
  sel.onchange = update; $('[name=length]', fs).oninput = update; $('[name=kept]', fs).onchange = update;
  $('.remove-catch', fs).onclick = () => fs.remove();

  $('[name=photo]', fs).onchange = async e => {
    const file = e.target.files[0]; if (!file) return;
    const ex = await readExif(file);
    fs._photo = await store.shrinkPhoto(file);
    showPhoto();
    if (ex.time) {
      $('[name=time]', fs).value = `${String(ex.time.getHours()).padStart(2, '0')}:${String(ex.time.getMinutes()).padStart(2, '0')}`;
    }
    if (ex.lat != null && editing.lat == null) setPin(ex.lat, ex.lng, 14);
    // iPhones often strip location from photos; use where you are now instead.
    else if (editing.lat == null && navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(p => { if (editing.lat == null) setPin(p.coords.latitude, p.coords.longitude, 14); }, () => { }, { enableHighAccuracy: true, timeout: 15000 });
    }
  };
  $('#catch-list').appendChild(fs);
  update();
}
$('#add-catch-btn').onclick = () => addCatchRow({ time: new Date().toTimeString().slice(0, 5) });
form.date.onchange = () => $$('.catch [name=species]').forEach(s => s.onchange());

async function openTrip(id) {
  const t = id ? await store.getTrip(id) : { id: store.newId(), date: todayStr(), start: new Date().toTimeString().slice(0, 5), catches: [] };
  editing = { ...t };
  $('#trip-form-title').textContent = id ? 'Edit trip' : 'New trip';
  form.date.value = t.date; form.start.value = t.start || ''; form.end.value = t.end || '';
  form.spot.value = t.spot || ''; form.notes.value = t.notes || '';
  $('#trip-conditions').textContent = t.conditions || '';
  $('#catch-list').innerHTML = '';
  (t.catches || []).forEach(addCatchRow);
  $('#delete-trip-btn').classList.toggle('hidden', !id);
  $('#save-msg').textContent = '';
  show('trip');
  initMap();
  setTimeout(() => {
    map.invalidateSize();
    if (marker) { marker.remove(); marker = null; }
    if (t.lat != null) setPin(t.lat, t.lng, 14);
    else { map.setView([27.77, -82.63], 10); $('#coords-label').textContent = 'Tap the map to drop a pin'; }
  }, 50);
}
$('#new-trip-btn').onclick = () => openTrip(null);
$('#cancel-trip-btn').onclick = () => show('log');
// Two taps to delete (no pop-up dialogs, which some browsers block).
$('#delete-trip-btn').onclick = async e => {
  const b = e.currentTarget;
  if (b.dataset.armed !== '1') { b.dataset.armed = '1'; b.textContent = 'Tap again to delete'; setTimeout(() => { b.dataset.armed = ''; b.textContent = 'Delete'; }, 4000); return; }
  b.dataset.armed = ''; b.textContent = 'Delete';
  try { await store.deleteTrip(editing.id); show('log'); } catch (err) { $('#save-msg').textContent = err.message; }
};

// Snapshot tide + moon at the trip start so later stats can use them.
async function conditionsFor(trip) {
  const when = new Date(`${trip.date}T${trip.start || '12:00'}`);
  const st = trip.lat != null ? nearestStation(trip.lat, trip.lng) : station();
  const moon = moonInfo(when);
  let tide = '';
  try {
    const hilo = await getHiLo(st.id, when, 1);
    const h = heightAt(hilo, when), f = flowAt(hilo, when);
    if (h != null) tide = `Tide ${h.toFixed(1)} ft ${f.dir} (${st.name})`;
  } catch { /* offline: skip tide */ }
  const wt = when <= new Date() ? await pastWaterTemp(trip.lat ?? st.lat, trip.lng ?? st.lng, when) : null;
  const water = wt != null ? `Water ${Math.round(wt)}°F` : '';
  return { text: [moon.icon + ' ' + moon.name, tide, water].filter(Boolean).join(' · '), moonPhase: moon.phase, station: st.id, waterTemp: wt };
}

form.onsubmit = async e => {
  e.preventDefault();
  const trip = {
    ...editing,
    date: form.date.value, start: form.start.value, end: form.end.value,
    spot: form.spot.value.trim(), notes: form.notes.value.trim(),
    catches: $$('#catch-list .catch').map(fs => ({
      species: $('[name=species]', fs).value,
      length: +$('[name=length]', fs).value || null,
      weight: +$('[name=weight]', fs).value || null,
      bait: $('[name=bait]', fs).value.trim(),
      time: $('[name=time]', fs).value,
      kept: $('[name=kept]', fs).checked,
      photo: fs._photo || null,
      photoPath: fs._photo ? null : fs._photoPath,
    })),
    updated: new Date().toISOString(),
  };
  const c = await conditionsFor(trip);
  trip.conditions = c.text; trip.moonPhase = c.moonPhase; trip.station = c.station; trip.waterTemp = c.waterTemp;
  const btn = $('button[type=submit]', form); btn.disabled = true; btn.textContent = 'Saving…';
  try { await store.saveTrip(trip); show('log'); }
  catch (err) { $('#save-msg').textContent = err.message; }
  finally { btn.disabled = false; btn.textContent = 'Save trip'; }
};

// ---------- species ----------
$('#species-table').innerHTML = `<table><thead><tr><th>Species</th><th>Rules</th></tr></thead><tbody>
  ${SPECIES.filter(s => s.id !== 'other').map(s => `<tr><td>${esc(s.name)}</td><td>${esc(ruleText(s))}</td></tr>`).join('')}
</tbody></table>`;

// ---------- sign in ----------
const authMsg = (m, cls = '') => { $('#auth-msg').textContent = m; $('#auth-msg').className = `small ${cls}`; };
$('#auth-form').onsubmit = async e => {
  e.preventDefault(); authMsg('Signing in…');
  const { error } = await store.signIn($('#auth-email').value.trim(), $('#auth-password').value);
  authMsg(error ? error.message : '', error ? 'bad' : '');
};
$('#signup-btn').onclick = async () => {
  const email = $('#auth-email').value.trim(), pw = $('#auth-password').value;
  if (!email || pw.length < 6) return authMsg('Enter an email and a password of at least 6 characters.', 'bad');
  authMsg('Creating account…');
  const { data, error } = await store.signUp(email, pw);
  if (error) return authMsg(error.message, 'bad');
  if (!data.session) authMsg('Check your email for a confirmation link, then sign in here.', 'ok');
};
$('#signout-btn').onclick = () => store.signOut();
store.watchAuth(u => {
  $('#auth-form').classList.toggle('hidden', !!u);
  $('#trips-area').classList.toggle('hidden', !u);
  $('#who').textContent = u?.email || '';
  if (u) {
    authMsg(''); if ($('#view-log').classList.contains('active')) renderTrips();
    // Merge favorites from the account with any saved on this phone.
    const remote = store.getFavStations();
    const merged = [...new Set([...remote, ...favs])];
    if (merged.length !== remote.length || merged.length !== favs.length) { favs = merged; saveFavs(); }
    else favs = merged;
    fillStations();
  }
  else if ($('#view-trip').classList.contains('active')) show('log');
});

// ---------- start ----------
renderToday();
if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('sw.js').catch(() => { });
