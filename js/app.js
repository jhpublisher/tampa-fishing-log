import { getHiLo, heightAt, flowAt, nearestStation } from './tides.js';
import { moonInfo } from './solunar.js';
import * as home from './home.js';
import { SPECIES, byId, ruleText, checkKeep, isOpen, RULES_AS_OF } from './species.js';
import { GUIDE } from './guide.js';
import * as license from './license.js';
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
  document.body.dataset.view = view;
  window.scrollTo(0, 0);
  if (view === 'log' && store.currentUser()) renderTrips();
}
$$('.tabs button').forEach(b => b.onclick = () => show(b.dataset.view));

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
  const st = trip.lat != null ? nearestStation(trip.lat, trip.lng) : home.activeStation();
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
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const seasonText = sp => sp.open ? 'Open ' + sp.open.map(([m1, d1, m2, d2]) => `${MONTHS[m1 - 1]} ${d1}–${MONTHS[m2 - 1]} ${d2}`).join(' and ') : 'Open all year';
function statusChip(sp) {
  if (sp.cr) return '<span class="status cr">Catch &amp; release only</span>';
  if (sp.unreg) return '<span class="status open">No species limits</span>';
  return isOpen(sp) ? '<span class="status open">Open now</span>' : '<span class="status closed">Closed now</span>';
}
function speciesCard(sp) {
  const g = GUIDE[sp.id] || { id: [], photos: [] };
  const fl = sp.fl ? ' fork length' : ' total length';
  const size = sp.cr ? 'None. Release every tarpon.' : sp.min && sp.max ? `${sp.min}–${sp.max}"${fl} (slot)` : sp.min ? `At least ${sp.min}"${fl}` : '—';
  const bag = sp.cr ? '0 (release)' : sp.bag ? `${sp.bag} per person per day` : sp.unreg ? '2 fish or 100 lb' : '—';
  const photos = g.photos.length ? `<div class="sp-photos${g.photos.length > 1 ? ' two' : ''}">${g.photos.map(p => `<img src="${p.src}" alt="${esc(sp.name)}" loading="lazy">`).join('')}</div>` : '';
  return `<article class="card sp-card" data-q="${esc((sp.name + ' ' + (g.sci || '')).toLowerCase())}">
    ${photos}
    <div class="sp-head"><div><h3 class="sp-name">${esc(sp.name)}</h3>${g.sci ? `<div class="sci">${esc(g.sci)}</div>` : ''}</div>${statusChip(sp)}</div>
    <dl class="sp-rules">
      <div><dt>Size</dt><dd>${size}</dd></div>
      <div><dt>Bag</dt><dd>${bag}</dd></div>
      <div><dt>Season</dt><dd>${sp.cr ? 'Year-round, release only' : seasonText(sp)}</dd></div>
    </dl>
    ${sp.note ? `<p class="small sp-note">${esc(sp.note)}</p>` : ''}
    ${g.id.length ? `<h4>How to tell it apart</h4><ul class="sp-id">${g.id.map(t => `<li>${esc(t)}</li>`).join('')}</ul>` : ''}
    <div class="sp-foot">
      ${g.fwc ? `<a href="${g.fwc}" target="_blank" rel="noopener">FWC rules ↗</a>` : ''}
      ${g.photos.length ? `<span class="photo-credit">Photo${g.photos.length > 1 ? 's' : ''}: ${g.photos.map(p => `<a href="${p.page}" target="_blank" rel="noopener">${esc(p.by)}</a> (${esc(p.lic)})`).join(', ')}</span>` : ''}
    </div>
  </article>`;
}
$('#rules-date').textContent = new Date(RULES_AS_OF + 'T12:00').toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' });
$('#species-guide').innerHTML = SPECIES.filter(s => s.id !== 'other').map(speciesCard).join('');
$('#species-search').oninput = e => {
  const q = e.target.value.trim().toLowerCase();
  $$('.sp-card').forEach(c => { c.hidden = !!q && !c.dataset.q.includes(q); });
};


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
  license.onAuth(u);
  $('#auth-form').classList.toggle('hidden', !!u);
  $('#trips-area').classList.toggle('hidden', !u);
  $('#who').textContent = u?.email || '';
  if (u) {
    authMsg(''); if ($('#view-log').classList.contains('active')) renderTrips();
    home.syncFavs(); // merge starred spots from the account with this phone's
  }
  else if ($('#view-trip').classList.contains('active')) show('log');
});

// ---------- start ----------
if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('sw.js').catch(() => { });
