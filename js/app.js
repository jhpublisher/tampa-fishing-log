import { getHiLo, heightAt, flowAt, nearestStation } from './tides.js';
import { moonInfo } from './solunar.js';
import * as home from './home.js';
import { SPECIES, byId, ruleText, checkKeep, isOpen, RULES_AS_OF, daysToClose, closesText } from './species.js';
import { GUIDE, lookAlikes } from './guide.js';
import * as license from './license.js';
import * as store from './store.js';
import { readExif } from './exif.js';
import { pastWaterTemp } from './conditions.js';
import { conditionsAt } from './catchcond.js';
import { voiceWidget } from './voice.js';
import { fishPicker } from './fishpicker.js';
import { initImport, onOpen as importOpened } from './importer.js';
import { syncSpotNotes } from './spotnotes.js';
import * as outbox from './outbox.js';
import { TIPS, SAFETY } from './tips.js';
import * as cards from './collection.js';
import { estLen } from './collection.js';

const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const fmtTime = d => d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
const fmtDay = d => d.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' });
const todayStr = (d = new Date()) => { return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const ls = { get: k => { try { return localStorage.getItem(k); } catch { return null; } }, set: (k, v) => { try { localStorage.setItem(k, v); } catch { } } };

// ---------- navigation ----------
function show(view) {
  $$('.view').forEach(v => v.classList.toggle('active', v.id === `view-${view}`));
  $$('.tabs button').forEach(b => b.classList.toggle('active', b.dataset.view === view));
  document.body.dataset.view = view;
  const spb = document.getElementById('sp-back'); if (spb) spb.hidden = true;
  window.scrollTo(0, 0);
  if (view === 'log' && store.currentUser()) renderTrips();
  if (view === 'cards') cards.open();
  if (view === 'import') { if (!store.currentUser()) return show('log'); importOpened(); }
}
initImport({ done: () => {} });
$$('.tabs button').forEach(b => b.onclick = () => show(b.dataset.view));
// Any element with data-go jumps to that tab (e.g. the license shortcut on My trips).
document.addEventListener('click', e => { const t = e.target.closest('[data-go]'); if (t) show(t.dataset.go); });

// ---------- trips list ----------
const urls = []; // object URLs to free on re-render
async function renderTrips() {
  urls.splice(0).forEach(u => URL.revokeObjectURL(u));
  let trips, pending = await outbox.pendingTrips();
  try { trips = await store.listTrips(); } catch (e) {
    if (!pending.length) { $('#trip-list').innerHTML = `<p class="bad">${esc(e.message)}</p>`; return; }
    trips = [];
  }
  // trips waiting to upload show first, with their photos from this phone
  const ids = new Set(pending.map(t => t.id));
  for (const t of pending) for (const c of t.catches || []) if (c.photo instanceof Blob) { c.photoUrl = URL.createObjectURL(c.photo); urls.push(c.photoUrl); }
  trips = [...pending, ...trips.filter(t => !ids.has(t.id))];
  if (!trips.length) { $('#trip-list').innerHTML = `<div class="empty"><svg viewBox="0 0 120 60" aria-hidden="true"><path d="M10 30c18-22 52-26 78-6l20-14v40l-20-14c-26 20-60 16-78-6z"/><circle cx="34" cy="27" r="3"/></svg><p>No trips logged yet.<br>Tap <strong>New trip</strong> after your next time on the water.</p></div>`; return; }
  $('#trip-list').innerHTML = trips.map(t => {
    const sp = [...new Set((t.catches || []).map(c => c.species === 'other' && c.otherName ? c.otherName : byId(c.species)?.name || 'Other'))];
    const n = (t.catches || []).reduce((a, c) => a + (c.count || 1), 0);
    const photos = (t.catches || []).flatMap(c => [c.photoUrl, ...(c.moreUrls || [])]).filter(Boolean).map(u => `<img src="${esc(u)}" alt="" loading="lazy">`).join('');
    return `<div class="card trip" data-id="${t.id}">
      <div class="row" style="justify-content:space-between"><strong>${esc(t.spot || 'Unnamed spot')}</strong>
        <span class="small muted">${esc(t.date)} ${esc(t.start || '')}</span></div>
      <div class="small">${t._queued ? '<span class="pending">⏳ Waiting for signal to upload · </span>' : ''}${n} fish${sp.length ? ': ' + esc(sp.join(', ')) : ''}${(t.catches || []).some(c => c.first) ? ' · ⭐' : ''}</div>
      ${t.conditions ? `<div class="small muted">${esc(t.conditions)}</div>` : ''}
      ${photos ? `<div class="photos">${photos}</div>` : ''}
    </div>`;
  }).join('');
  $$('.trip').forEach(el => el.onclick = () => openTrip(el.dataset.id));
}

// ---------- trip editor ----------
let map, marker, editing = null, tripVoice = null;
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

// ---------- per-catch conditions ----------
const catchWhen = fs => {
  const t = $('[name=time]', fs).value; if (!form.date.value || !t) return null;
  return new Date(`${form.date.value}T${t}`);
};
const catchWhere = () => editing.lat != null ? [editing.lat, editing.lng] : (() => { const st = home.activeStation(); return [st.lat, st.lng]; })();
const condKey = (when, [lat, lng]) => `${+when}|${lat.toFixed(3)}|${lng.toFixed(3)}`;
function showCond(fs, note = '') {
  const el = $('.cond', fs);
  el.innerHTML = fs._cond ? `<strong>Conditions at catch</strong><ul>${fs._cond.text.split(' · ').map(t => `<li>${esc(t)}</li>`).join('')}</ul>` : note;
}
async function refreshCond(fs) {
  const when = catchWhen(fs); if (!when) return showCond(fs);
  const where = catchWhere(), key = condKey(when, where);
  if (fs._cond?.key === key) return showCond(fs);
  showCond(Object.assign(fs, { _cond: null }), '<span class="muted">Looking up tide, weather and water temp…</span>');
  fs._condKey = key;
  const c = await conditionsAt(where[0], where[1], when).catch(() => null);
  if (fs._condKey !== key) return; // changed again while loading
  fs._cond = c ? { ...c, key } : null;
  showCond(fs, c ? '' : '<span class="muted">Conditions unavailable right now; they will be looked up when you save.</span>');
}

function addCatchRow(c = {}) {
  const frag = $('#catch-template').content.cloneNode(true);
  const fs = $('fieldset', frag);
  const sel = $('[name=species]', fs);
  sel.innerHTML = speciesOptions();
  sel.value = c.species || '';
  for (const k of ['length', 'weight', 'waterDepth', 'fishDepth']) $(`[name=${k}]`, fs).value = c[k] ?? '';
  for (const k of ['bait', 'cast', 'setupText', 'time', 'otherName', 'fishId', 'angler']) $(`[name=${k}]`, fs).value = c[k] || '';
  fs._fish = fishPicker($('.fp-host', fs), { value: c, onPick: v => { sel.value = v.species; $('[name=otherName]', fs).value = v.otherName; $('[name=fishId]', fs).value = v.fishId; sel.dispatchEvent(new Event('change')); } });
  $('[name=count]', fs).value = c.count || 1;
  $('[name=kept]', fs).checked = !!c.kept;
  $('[name=first]', fs).checked = !!c.first;
  // open "More" when it already holds something, so nothing looks lost
  if (c.weight || c.cast || c.waterDepth || c.fishDepth || c.bait || c.setupText || c.setupPath || c.angler || c.voices?.length) $('.more', fs).open = true;
  // photos: [{blob} new, or {path, url} stored]; the first one is the main photo
  fs._pics = [
    ...(c.photoPath || c.photo ? [{ path: c.photoPath, url: c.photoUrl, blob: c.photo instanceof Blob ? c.photo : null }] : []),
    ...(c.morePaths || []).map((p, i) => ({ path: p, url: c.moreUrls?.[i] })),
    ...(c.more || []).map(m => m instanceof Blob ? { blob: m } : { path: m })
      .filter(m => m.blob || !(c.morePaths || []).includes(m.path)),
  ];
  fs._setup = c.setup instanceof Blob ? c.setup : null; fs._setupPath = c.setupPath || null;
  fs._cond = c.cond || null;
  fs._est = c.estLength ? { estLength: c.estLength, estFrom: c.estFrom || 'claude', estNote: c.estNote || '' } : {};
  const showEst = () => {
    const el = $('.est-len', fs), lenIn = $('[name=length]', fs);
    const cur = { species: sel.value, otherName: $('[name=otherName]', fs).value, fishId: $('[name=fishId]', fs).value, estLength: fs._est.estLength };
    const L = !lenIn.value && sel.value ? estLen(cur) : null;
    lenIn.placeholder = L ? `est. ${L}` : '';
    el.innerHTML = L ? `<span class="est-tag">Est.</span> ~${L}" ${fs._est.estLength ? `from the photo${fs._est.estNote ? ` (${esc(fs._est.estNote)})` : ''}` : 'typical size'}, so it still gets a grade. <button type="button" class="linkish est-use">Use ${L}"</button> or type the real length.` : '';
    const use = $('.est-use', fs); if (use) use.onclick = () => { lenIn.value = L; lenIn.dispatchEvent(new Event('input')); };
  };
  fs._voice = voiceWidget($('.catch-voice', fs), c.voices || [], 'Voice note');
  const setupImg = $('.setup-thumb', fs);
  const showPhotos = () => {
    $('.pics', fs).innerHTML = fs._pics.map((p, i) => {
      const src = p.blob ? (p._u ||= URL.createObjectURL(p.blob)) : p.url;
      return src ? `<div class="pic"><img src="${esc(src)}" alt="Catch photo ${i + 1}"><button type="button" data-rm="${i}" aria-label="Remove photo ${i + 1}">✕</button></div>` : '';
    }).join('');
    $$('[data-rm]', fs).forEach(b => b.onclick = () => { fs._pics.splice(+b.dataset.rm, 1); showPhotos(); });
    $('.share-catch', fs).classList.toggle('hidden', !fs._pics.length);
    const s2 = fs._setup ? URL.createObjectURL(fs._setup) : c.setupUrl;
    if (s2) { setupImg.src = s2; setupImg.classList.remove('hidden'); }
  };
  showPhotos();
  $('[name=setup]', fs).onchange = async e => {
    const file = e.target.files[0]; if (!file) return;
    fs._setup = await store.shrinkPhoto(file, 1600); showPhotos();
  };
  showCond(fs);
  $('[name=time]', fs).addEventListener('change', () => refreshCond(fs));

  const update = () => {
    const sp = byId(sel.value);
    $('.rule', fs).textContent = sel.value === 'other' ? 'Not in the guide. Check FWC before you keep it.' : ruleText(sp);
    const res = $('.check-result', fs);
    if ($('[name=kept]', fs).checked && sp) {
      const r = checkKeep(sp, +$('[name=length]', fs).value || null, new Date(form.date.value + 'T12:00'));
      const n = +$('[name=count]', fs).value || 1;
      const out = sp.bag && n > sp.bag ? { level: 'bad', msg: `Bag limit is ${sp.bag} per person per day.` } : r;
      res.textContent = out?.msg || ''; res.className = `check-result small ${out?.level || ''}`;
    } else res.textContent = '';
  };
  sel.addEventListener('change', showEst); $('[name=length]', fs).addEventListener('input', showEst); showEst();
  sel.onchange = update; $('[name=length]', fs).oninput = update; $('[name=kept]', fs).onchange = update; $('[name=count]', fs).oninput = update;
  $('.remove-catch', fs).onclick = () => {
    // easy to hit by accident with wet hands, so ask before throwing away a filled-in catch
    const filled = fs._pics.length || [...fs.querySelectorAll('input, select, textarea')]
      .some(i => i.type === 'checkbox' ? i.checked : i.type !== 'file' && i.name !== 'count' && i.value);
    if (!filled || confirm('Remove this catch?')) fs.remove();
  };
  $('.share-catch', fs).onclick = () => shareCatch(fs);

  $('[name=photo]', fs).onchange = async e => {
    const files = [...e.target.files]; if (!files.length) return;
    const first = !fs._pics.length;
    const ex = first ? await readExif(files[0]) : {};
    for (const f of files) fs._pics.push({ blob: await store.shrinkPhoto(f) });
    e.target.value = '';
    showPhotos();
    if (ex.time) {
      $('[name=time]', fs).value = `${String(ex.time.getHours()).padStart(2, '0')}:${String(ex.time.getMinutes()).padStart(2, '0')}`;
      // Photo taken on another day? Use that day for the trip if this is a new, empty trip.
      const d = todayStr(ex.time);
      if (d !== form.date.value && $('#trip-form-title').textContent === 'New trip') form.date.value = d;
    }
    if (ex.lat != null && editing.lat == null) setPin(ex.lat, ex.lng, 14);
    // iPhones often strip location from photos; use where you are now instead.
    else if (first && editing.lat == null && navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(p => { if (editing.lat == null) setPin(p.coords.latitude, p.coords.longitude, 14); refreshCond(fs); }, () => { }, { enableHighAccuracy: true, timeout: 15000 });
    }
    refreshCond(fs);
  };
  $('#catch-list').appendChild(fs);
  update();
  return fs;
}

// ---------- share a catch as a picture card ----------
async function shareCatch(fs) {
  const p = fs._pics[0]; if (!p) return;
  const btn = $('.share-catch', fs); btn.disabled = true;
  try {
    const blob = p.blob || await fetch(p.url).then(r => r.blob());
    const bmp = await createImageBitmap(blob);
    const W = 1080, PH = 1080, c = document.createElement('canvas'); c.width = W; c.height = PH + 270;
    const g = c.getContext('2d');
    const k = Math.max(W / bmp.width, PH / bmp.height); // cover-crop the photo into a square
    g.drawImage(bmp, (W - bmp.width * k) / 2, (PH - bmp.height * k) / 2, bmp.width * k, bmp.height * k);
    g.fillStyle = '#0d3b4c'; g.fillRect(0, PH, W, 270);
    const sp = $('[name=species]', fs).value;
    const name = sp === 'other' ? ($('[name=otherName]', fs).value.trim() || 'Fish') : (byId(sp)?.name || 'Catch');
    const len = +$('[name=length]', fs).value, n = +$('[name=count]', fs).value || 1;
    const who = $('[name=angler]', fs).value.trim(), first = $('[name=first]', fs).checked;
    g.fillStyle = '#fff8ec'; g.font = '700 64px Georgia, serif';
    g.fillText(`${first ? '⭐ ' : ''}${n > 1 ? n + ' × ' : ''}${name}${len ? ` · ${len}"` : ''}`, 48, PH + 100, W - 96);
    g.font = '500 38px system-ui, sans-serif'; g.fillStyle = '#f3c98b';
    const when = new Date(`${form.date.value}T12:00`).toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' });
    // spot name only, never GPS coordinates
    g.fillText([who, form.spot.value.trim(), when].filter(Boolean).join(' · '), 48, PH + 170, W - 96);
    g.font = '500 30px system-ui, sans-serif'; g.fillStyle = 'rgba(255,248,236,.7)';
    g.fillText("James's Fishing Log · Tampa Bay", 48, PH + 230);
    const out = await new Promise(r => c.toBlob(r, 'image/jpeg', 0.9));
    const file = new File([out], `${name.replace(/\W+/g, '-').toLowerCase()}.jpg`, { type: 'image/jpeg' });
    if (navigator.canShare?.({ files: [file] })) await navigator.share({ files: [file], title: name });
    else { const a = document.createElement('a'); a.href = URL.createObjectURL(file); a.download = file.name; a.click(); }
  } catch (e) { if (e?.name !== 'AbortError') home.toast('Could not make the share picture.'); }
  finally { btn.disabled = false; }
}
$('#add-catch-btn').onclick = () => addCatchRow({ time: new Date().toTimeString().slice(0, 5) });
form.date.onchange = () => $$('.catch [name=species]').forEach(s => s.onchange());

async function openTrip(id) {
  const local = id ? (await outbox.pendingTrips()).find(p => p.id === id) : null;
  const t = local || (id ? await store.getTrip(id) : { id: store.newId(), date: todayStr(), start: new Date().toTimeString().slice(0, 5), catches: [] });
  editing = { ...t };
  $('#trip-form-title').textContent = id ? 'Edit trip' : 'New trip';
  form.date.value = t.date; form.start.value = t.start || ''; form.end.value = t.end || '';
  form.spot.value = t.spot || ''; form.notes.value = t.notes || '';
  $('#trip-conditions').textContent = t.conditions || '';
  $('#catch-list').innerHTML = '';
  (t.catches || []).forEach(addCatchRow);
  tripVoice = voiceWidget($('#trip-voice'), t.voices || [], 'Trip voice note');
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
// Quick catch from Today: adds a catch to today's trip (or starts one at the spot you're looking at).
$('#quick-catch').onclick = async () => {
  if (!store.currentUser()) { show('log'); home.toast('Sign in first to log catches.', 3000); return; }
  const today = todayStr();
  let existing = null;
  try { existing = [...await outbox.pendingTrips(), ...(navigator.onLine ? await store.listTrips() : [])].find(t => t.date === today) || null; } catch { }
  await openTrip(existing?.id || null);
  if (!existing) { const p = home.activePlace?.(); if (p && !form.spot.value) form.spot.value = p.name || ''; }
  const fs = addCatchRow({ time: new Date().toTimeString().slice(0, 5) });
  fs.scrollIntoView({ block: 'start' });
  fs._fish.focus();
};
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
      otherName: $('[name=species]', fs).value === 'other' ? $('[name=otherName]', fs).value.trim() : '',
      fishId: $('[name=species]', fs).value === 'other' ? $('[name=fishId]', fs).value : '',
      count: Math.max(1, Math.round(+$('[name=count]', fs).value || 1)),
      first: $('[name=first]', fs).checked,
      angler: $('[name=angler]', fs).value.trim(),
      length: +$('[name=length]', fs).value || null,
      ...fs._est,
      weight: +$('[name=weight]', fs).value || null,
      bait: $('[name=bait]', fs).value.trim(),
      cast: $('[name=cast]', fs).value.trim(),
      waterDepth: +$('[name=waterDepth]', fs).value || null,
      fishDepth: +$('[name=fishDepth]', fs).value || null,
      setupText: $('[name=setupText]', fs).value.trim(),
      time: $('[name=time]', fs).value,
      kept: $('[name=kept]', fs).checked,
      photo: fs._pics[0]?.blob || null,
      photoPath: fs._pics[0] && !fs._pics[0].blob ? fs._pics[0].path : null,
      more: fs._pics.slice(1).map(p => p.blob || p.path),
      setup: fs._setup || null,
      setupPath: fs._setup ? null : fs._setupPath,
      voices: fs._voice.get(),
      cond: fs._cond || null,
      _fs: fs,
    })),
    voices: tripVoice ? tripVoice.get() : [],
    updated: new Date().toISOString(),
  };
  $$('#catch-list .catch').forEach(fs => fs._voice.stop());
  tripVoice?.stop();
  const btn = $('button[type=submit]', form); btn.disabled = true; btn.textContent = 'Checking conditions…';
  // Weak signal shouldn't hold the save hostage: each lookup gets a few seconds, then we move on.
  const quick = (p, ms = 6000) => Promise.race([p, new Promise(r => setTimeout(() => r(null), ms))]);
  const online = navigator.onLine;
  // Look up conditions for any catch that has a time but no (or out-of-date) conditions.
  await Promise.all(trip.catches.map(async c => {
    const fs = c._fs; delete c._fs;
    const when = catchWhen(fs); if (!when) { c.cond = null; return; }
    const key = condKey(when, catchWhere());
    if (c.cond?.key !== key) { const r = online ? await quick(conditionsAt(...catchWhere(), when).catch(() => null)) : null; c.cond = r ? { ...r, key } : null; }
  }));
  const c = online ? await quick(conditionsFor(trip).catch(() => null)) : null;
  if (c) { trip.conditions = c.text; trip.moonPhase = c.moonPhase; trip.station = c.station; trip.waterTemp = c.waterTemp; }
  btn.textContent = 'Saving…';
  const keepLocal = async () => {
    await outbox.queueTrip(trip);
    home.toast('No signal. Saved on this phone; it uploads when you have service.', 4000);
    show('log');
  };
  try {
    if (!online) await keepLocal();
    else { await store.saveTrip(trip); await outbox.dropTrip(trip.id).catch(() => { }); show('log'); }
  } catch (err) {
    if (outbox.isOffline(err)) { try { await keepLocal(); } catch { $('#save-msg').textContent = err.message; } }
    else $('#save-msg').textContent = err.message;
  }
  finally { btn.disabled = false; btn.textContent = 'Save trip'; }
};

// ---------- species ----------
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const seasonText = sp => sp.open ? 'Open ' + sp.open.map(([m1, d1, m2, d2]) => `${MONTHS[m1 - 1]} ${d1}–${MONTHS[m2 - 1]} ${d2}`).join(' and ') : 'Open all year';
function statusChip(sp) {
  if (sp.cr) return '<span class="status cr">Catch &amp; release only</span>';
  if (sp.unreg) return '<span class="status open">No species limits</span>';
  if (!isOpen(sp)) return '<span class="status closed">Closed now</span>';
  const n = daysToClose(sp);
  return n != null ? `<span class="status cr">${closesText(n)}</span>` : '<span class="status open">Open now</span>';
}
function speciesCard(sp) {
  const g = GUIDE[sp.id] || { id: [], photos: [], marks: [] };
  const fl = sp.fl ? ' fork length' : ' total length';
  const size = sp.cr ? 'None. Release every tarpon.' : sp.min && sp.max ? `${sp.min}–${sp.max}"${fl} (slot: keep only fish in this range)` : sp.min ? `At least ${sp.min}"${fl}` : sp.sizeText || '—';
  const bag = sp.cr ? '0 (release)' : sp.bag ? `${sp.bag} per person per day` : sp.unreg ? '2 fish or 100 lb' : sp.bagText || '—';
  const marks = g.marks || [];
  // First photo keeps its real shape so the numbered pins land on the right spot.
  const slide = (p, i) => `<figure class="sp-slide"><a href="${p.src}" target="_blank" rel="noopener" class="sp-pic" style="aspect-ratio:${p.w} / ${p.h};width:min(100%, ${Math.round(340 * p.w / p.h)}px)">
      <img src="${p.src}" alt="${esc(sp.name)}, photo ${i + 1}" loading="lazy">
      ${i === 0 ? marks.map(([x, y], n) => `<span class="pin" style="left:${x}%;top:${y}%">${n + 1}</span>`).join('') : ''}</a></figure>`;
  const photos = g.photos.length ? `<div class="sp-photos">${g.photos.map(slide).join('')}</div>
    ${g.photos.length > 1 ? `<div class="sp-swipe small">Swipe for ${g.photos.length - 1} more photo${g.photos.length > 2 ? 's' : ''} · tap to enlarge</div>` : '<div class="sp-swipe small">Tap photo to enlarge</div>'}` : '';
  const looks = lookAlikes(sp.id);
  const lookHtml = looks.length ? `<h4>Easy to mix up with</h4>${looks.map(l => {
    const o = byId(l.id), og = GUIDE[l.id];
    return `<a class="look" href="#sp-${l.id}" data-jump="${l.id}" data-from="${sp.id}">
      ${og?.photos[0] ? `<img src="${og.photos[0].src}" alt="" loading="lazy">` : ''}
      <span><strong>${esc(o?.name || l.id)} ›</strong><span class="small">${esc(l.tell)}</span></span></a>`;
  }).join('')}` : '';
  return `<article class="card sp-card" id="sp-${sp.id}" data-q="${esc((sp.name + ' ' + (g.sci || '')).toLowerCase())}">
    ${photos}
    <div class="sp-head"><div><h3 class="sp-name">${esc(sp.name)}</h3>${g.sci ? `<div class="sci">${esc(g.sci)}</div>` : ''}</div>${statusChip(sp)}</div>
    <dl class="sp-rules">
      <div><dt>Size</dt><dd>${size}</dd></div>
      <div><dt>Bag</dt><dd>${bag}</dd></div>
      <div><dt>Season</dt><dd>${sp.cr ? 'Year-round, release only' : seasonText(sp)}</dd></div>
    </dl>
    ${sp.note ? `<p class="small sp-note">${esc(sp.note)}</p>` : ''}
    ${marks.length || g.id.length ? `<h4>How to tell it apart</h4>
      ${marks.length ? `<ol class="sp-marks">${marks.map(m => `<li>${esc(m[2])}</li>`).join('')}</ol>` : ''}
      ${g.id.length ? `<ul class="sp-id">${g.id.map(t => `<li>${esc(t)}</li>`).join('')}</ul>` : ''}` : ''}
    ${lookHtml}
    ${TIPS[sp.id] ? `<h4>How to catch it</h4><p class="small sp-tip">${esc(TIPS[sp.id].bait)}</p>
      <h4>Let it go well</h4><p class="small sp-tip">${esc(TIPS[sp.id].release)}</p>` : ''}
    <div class="sp-foot">
      ${g.fwc ? `<a href="${g.fwc}" target="_blank" rel="noopener">FWC rules ↗</a>` : ''}
      ${g.photos.length ? `<span class="photo-credit">Photo${g.photos.length > 1 ? 's' : ''}: ${g.photos.map(p => `<a href="${p.page}" target="_blank" rel="noopener">${esc(p.by)}</a> (${esc(p.lic)})`).join(', ')}, via iNaturalist</span>` : ''}
    </div>
  </article>`;
}
$('#rules-date').textContent = new Date(RULES_AS_OF + 'T12:00').toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' });
$('#species-guide').innerHTML = `<details class="card safety"><summary><h2>Safety, measuring and release tips</h2></summary>
    <dl>${SAFETY.map(([h, t]) => `<div><dt>${esc(h)}</dt><dd>${esc(t)}</dd></div>`).join('')}</dl></details>`
  + SPECIES.filter(s => s.id !== 'other').map(speciesCard).join('');
$('#species-search').oninput = e => {
  const q = e.target.value.trim().toLowerCase();
  $$('.sp-card').forEach(c => { c.hidden = !!q && !c.dataset.q.includes(q); });
};
// Jump between look-alikes, with a floating button back to the fish you came from.
const jumpTo = id => {
  const card = $('#sp-' + id); if (!card) return;
  $('#species-search').value = ''; $$('.sp-card').forEach(c => { c.hidden = false; });
  card.scrollIntoView({ behavior: 'smooth', block: 'start' });
  card.classList.remove('flash'); void card.offsetWidth; card.classList.add('flash');
};
const flip = { a: null, b: null };
const setBack = () => {
  const bar = $('#sp-back');
  $('.sp-back-go', bar).textContent = `⇄ Flip to ${(byId(flip.a)?.name || '').replace(/ \(.*\)$/, '')}`;
  bar.hidden = false;
};
$('#species-guide').addEventListener('click', e => {
  const a = e.target.closest('[data-jump]'); if (!a) return;
  e.preventDefault();
  flip.a = a.dataset.from; flip.b = a.dataset.jump;
  jumpTo(flip.b); setBack();
});
$('#sp-back .sp-back-go').onclick = () => { [flip.a, flip.b] = [flip.b, flip.a]; jumpTo(flip.b); setBack(); };
cards.init({ goGuide: id => { show('species'); setTimeout(() => jumpTo(id), 50); } });
$('#sp-back .sp-back-x').onclick = () => { $('#sp-back').hidden = true; };



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
    syncSpotNotes();
    uploadWaiting();
  }
  else if ($('#view-trip').classList.contains('active')) show('log');
});

// ---------- bigger text (kept on this phone) ----------
const bigText = () => ls.get('bigText') === '1';
const applyBig = () => { document.documentElement.classList.toggle('big', bigText()); $('#text-size').setAttribute('aria-pressed', String(bigText())); };
$('#text-size').onclick = () => { ls.set('bigText', bigText() ? '0' : '1'); applyBig(); home.toast(bigText() ? 'Bigger text on' : 'Normal text size'); };
applyBig();

// ---------- trips saved without signal ----------
async function uploadWaiting() {
  if (!store.currentUser() || !navigator.onLine) return;
  const n = await outbox.flush(store.saveTrip).catch(() => 0);
  if (n) { home.toast(`Uploaded ${n} trip${n === 1 ? '' : 's'} saved without signal.`, 3000); if ($('#view-log').classList.contains('active')) renderTrips(); }
}
window.addEventListener('online', uploadWaiting);
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') uploadWaiting(); });

// ---------- start ----------
if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('sw.js').catch(() => { });
