// Bulk import of old fish photos: read each photo's date, time and GPS, group them into
// trips (same day, same place), let James tag species fast, look up the conditions at each
// photo's time, and save the trips. A tags file from Claude (fish-tags.json) can pre-fill
// species; anything Claude wasn't sure of is flagged for him to confirm.
import { readExif } from './exif.js';
import { SPECIES, byId } from './species.js';
import { SPOTS, km, nearestSpot } from './spots.js';
import { conditionsAt } from './catchcond.js';
import * as store from './store.js';

const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const ymd = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const hm = d => `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
const nice = d => d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
const short = n => n.replace(/\s*\(.*\)/, '');
const QUICK = ['redfish', 'trout', 'snook', 'sheepshead', 'mangrove', 'flounder', 'blackdrum', 'jack'];
const SAME_PLACE_KM = 3;

let photos = [];   // {id, file, url, time, timeFromFile, lat, lng, species, conf, claude, skip, dup}
let groups = [];   // {id, date, items: [photo], lat, lng, spotId, hasGps}
let tags = null;   // from Claude's fish-tags.json
let existing = new Set(); // 'YYYY-MM-DD HH:MM' of catches already logged

export function initImport({ done }) {
  const root = $('#import-area'); if (!root) return;
  $('#imp-photos').onchange = async e => { await addFiles([...e.target.files]); e.target.value = ''; };
  $('#imp-tags').onchange = async e => {
    const f = e.target.files[0]; e.target.value = ''; if (!f) return;
    try { tags = JSON.parse(await f.text()); applyTags(); render(); msg(`Loaded Claude's tags for ${(tags.photos || []).length} photos.`); }
    catch { msg("That file isn't a tags file from Claude."); }
  };
  $('#imp-clear').onclick = () => { photos.forEach(p => URL.revokeObjectURL(p.url)); photos = []; groups = []; tags = null; render(); msg(''); };
  $('#imp-save').onclick = () => save(done);
  render();
}

// Called when the import screen opens: remember what's already logged so repeats are skipped.
export async function onOpen() {
  try {
    const trips = await store.listTrips();
    existing = new Set(trips.flatMap(t => (t.catches || []).filter(c => c.time).map(c => `${t.date} ${c.time}`)));
  } catch { existing = new Set(); }
}

const msg = t => { $('#imp-msg').textContent = t; };

async function addFiles(files) {
  msg(`Reading ${files.length} photo${files.length === 1 ? '' : 's'}…`);
  for (const file of files) {
    if (!/^image\//.test(file.type) && !/\.(jpe?g|heic|heif|png)$/i.test(file.name)) continue;
    const ex = await readExif(file);
    const time = ex.time || new Date(file.lastModified || Date.now());
    photos.push({ id: store.newId(), file, url: URL.createObjectURL(file), time, timeFromFile: !ex.time, lat: ex.lat ?? null, lng: ex.lng ?? null, species: '', conf: '', claude: null, skip: false });
  }
  for (const p of photos) { p.dup = existing.has(`${ymd(p.time)} ${hm(p.time)}`); if (p.dup && p.skip === false && !p.touched) p.skip = true; }
  regroup(); applyTags(); render();
  const noGps = photos.filter(p => p.lat == null).length;
  msg(noGps ? '' : `Read ${photos.length} photos.`);
}

// Same day, and (when both have GPS) within a few km of the last photo in the group.
function regroup() {
  const old = new Map(groups.map(g => [g.items[0]?.id, g]));
  photos.sort((a, b) => a.time - b.time);
  groups = [];
  for (const p of photos) {
    const day = ymd(p.time);
    let g = groups.findLast(x => x.date === day && (p.lat == null || x.lat == null || km(p.lat, p.lng, x.lat, x.lng) < SAME_PLACE_KM));
    if (!g) { g = { id: store.newId(), date: day, items: [], lat: null, lng: null, spotId: '' }; groups.push(g); }
    g.items.push(p);
    const gps = g.items.filter(x => x.lat != null);
    if (gps.length) { g.lat = gps.reduce((a, x) => a + x.lat, 0) / gps.length; g.lng = gps.reduce((a, x) => a + x.lng, 0) / gps.length; }
  }
  for (const g of groups) {
    g.hasGps = g.lat != null;
    const prev = old.get(g.items[0]?.id); if (prev?.spotId) g.spotId = prev.spotId;
    if (!g.spotId && g.hasGps) { const s = nearestSpot(g.lat, g.lng); if (km(g.lat, g.lng, s.lat, s.lng) < 1) g.spotId = s.id; }
  }
}

// Claude's tags are matched by the photo's own timestamp (iPhone renames files when you pick them).
function applyTags() {
  if (!tags?.photos) return;
  for (const p of photos) {
    const t = tags.photos.find(x => Math.abs(new Date(x.taken) - p.time) <= 2000);
    if (!t) continue;
    p.claude = t;
    if (!p.touched) {
      p.species = t.species === 'not_fish' ? '' : t.species || '';
      p.skip = t.species === 'not_fish' || p.skip;
      p.conf = t.confidence === 'high' ? 'sure' : 'check';
    }
  }
}

const needsWork = () => photos.filter(p => !p.skip && (!p.species || p.conf === 'check'));
const groupWhere = g => g.spotId ? SPOTS.find(s => s.id === g.spotId) : g.hasGps ? { name: 'Photo location', lat: g.lat, lng: g.lng } : null;

function render() {
  const list = $('#imp-list'); if (!list) return;
  const noGps = groups.filter(g => !g.hasGps);
  $('#imp-gps-tip').hidden = !noGps.length;
  $('#imp-clear').hidden = !photos.length;
  const spotOpts = sel => `<option value="">${'Choose the spot…'}</option>` +
    [...SPOTS].filter(s => !s.osm || s.cat !== 'ramp').sort((a, b) => a.name.localeCompare(b.name))
      .map(s => `<option value="${esc(s.id)}"${s.id === sel ? ' selected' : ''}>${esc(s.name)}</option>`).join('');
  list.innerHTML = groups.map(g => {
    const live = g.items.filter(p => !p.skip);
    const first = g.items[0].time, last = g.items[g.items.length - 1].time;
    const w = groupWhere(g);
    return `<section class="card imp-trip" data-g="${g.id}">
      <div class="imp-head"><strong>${new Date(g.date + 'T12:00').toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })}</strong>
        <span class="small muted">${nice(first)}${+last !== +first ? '–' + nice(last) : ''} · ${live.length} fish</span></div>
      <label class="small">${g.hasGps ? `📍 ${w?.name && g.spotId ? esc(w.name) : `Photo location ${g.lat.toFixed(4)}, ${g.lng.toFixed(4)}`}` : '<span class="bad">⚠️ No location in these photos.</span> Where was this?'}
        <select class="imp-spot">${g.hasGps ? `<option value="">Use the photo location</option>` + spotOpts(g.spotId).replace('<option value="">Choose the spot…</option>', '') : spotOpts(g.spotId)}</select></label>
      <div class="imp-grid">${g.items.map(p => photoCard(p)).join('')}</div>
    </section>`;
  }).join('');
  // events
  $$('.imp-trip', list).forEach(sec => {
    const g = groups.find(x => x.id === sec.dataset.g);
    $('.imp-spot', sec).onchange = e => { g.spotId = e.target.value; render(); };
  });
  $$('.imp-photo', list).forEach(card => {
    const p = photos.find(x => x.id === card.dataset.p);
    const set = sp => { p.species = sp; p.conf = ''; p.touched = true; p.skip = false; render(); };
    $$('[data-sp]', card).forEach(b => b.onclick = () => set(b.dataset.sp));
    $('.imp-more', card).onchange = e => e.target.value && set(e.target.value);
    const ok = $('.imp-ok', card); if (ok) ok.onclick = () => { p.conf = ''; p.touched = true; render(); };
    $('.imp-skip', card).onclick = () => { p.skip = !p.skip; p.touched = true; render(); };
  });
  const todo = needsWork().length, n = photos.filter(p => !p.skip).length, missing = groups.filter(g => g.items.some(p => !p.skip) && !groupWhere(g)).length;
  const btn = $('#imp-save');
  btn.hidden = !photos.length;
  btn.disabled = !n || todo > 0 || missing > 0;
  btn.textContent = `Save ${groups.filter(g => g.items.some(p => !p.skip)).length} trip(s), ${n} fish`;
  $('#imp-status').textContent = !photos.length ? '' : [todo && `${todo} photo${todo === 1 ? ' needs' : 's need'} a species or your OK`, missing && `${missing} trip${missing === 1 ? ' needs' : 's need'} a spot`].filter(Boolean).join(' · ') || 'Ready to save.';
}

function photoCard(p) {
  const sp = byId(p.species);
  const c = p.claude;
  const badge = p.skip ? '<span class="imp-badge skip">Skipped</span>'
    : p.conf === 'check' ? `<span class="imp-badge check">Claude thinks: ${esc(sp ? short(sp.name) : 'not sure')}${c?.note ? ` — ${esc(c.note)}` : ''}</span><button type="button" class="imp-ok small">✓ That's right</button>`
    : p.conf === 'sure' ? `<span class="imp-badge sure">Claude: ${esc(short(sp?.name || ''))}</span>`
    : sp ? `<span class="imp-badge sure">${esc(short(sp.name))}</span>` : '<span class="imp-badge todo">Which fish?</span>';
  return `<div class="imp-photo${p.skip ? ' skipped' : ''}${p.conf === 'check' ? ' check' : ''}" data-p="${p.id}">
    <img src="${p.url}" alt="" loading="lazy">
    <div class="imp-meta small">${nice(p.time)}${p.timeFromFile ? ' <span class="muted">(file time)</span>' : ''}${p.lat == null ? ' · <span class="muted">no GPS</span>' : ''}${p.dup ? ' · <span class="muted">already logged?</span>' : ''}</div>
    ${badge}
    <div class="imp-quick">${QUICK.map(id => `<button type="button" class="chip-btn${p.species === id ? ' on' : ''}" data-sp="${id}">${esc(short(byId(id).name).replace('Spotted seatrout', 'Trout').replace('Mangrove (gray) snapper', 'Mangrove'))}</button>`).join('')}</div>
    <div class="row"><select class="imp-more"><option value="">Other fish…</option>${SPECIES.filter(s => !QUICK.includes(s.id)).map(s => `<option value="${s.id}"${p.species === s.id ? ' selected' : ''}>${esc(s.name)}</option>`).join('')}</select>
      <button type="button" class="imp-skip">${p.skip ? 'Include' : 'Skip'}</button></div>
  </div>`;
}

async function save(done) {
  const btn = $('#imp-save'); btn.disabled = true;
  const todo = groups.filter(g => g.items.some(p => !p.skip));
  let saved = 0;
  try {
    for (const [i, g] of todo.entries()) {
      const items = g.items.filter(p => !p.skip);
      const w = groupWhere(g);
      const lat = g.spotId ? w.lat : g.lat, lng = g.spotId ? w.lng : g.lng;
      msg(`Trip ${i + 1} of ${todo.length}: shrinking photos and looking up tide and weather…`);
      const catches = [];
      for (const p of items) {
        const [photo, cond] = await Promise.all([store.shrinkPhoto(p.file), conditionsAt(lat, lng, p.time).catch(() => null)]);
        catches.push({ species: p.species, length: null, weight: null, bait: '', time: hm(p.time), kept: false, photo, cond: cond ? { ...cond, key: `${+p.time}|${lat.toFixed(3)}|${lng.toFixed(3)}` } : null, voices: [], imported: true });
      }
      const c0 = catches.find(c => c.cond)?.cond;
      const trip = {
        id: store.newId(), date: g.date, start: hm(items[0].time), end: hm(items[items.length - 1].time),
        spot: g.spotId ? w.name : g.hasGps ? `Photo spot near ${short(nearestSpot(lat, lng).name)}` : '', lat, lng,
        notes: 'Imported from photos.', catches, voices: [], imported: true, updated: new Date().toISOString(),
        conditions: c0 ? c0.text : '', moonPhase: c0?.moon?.phase ?? null, station: c0?.tide?.stationId ?? null, waterTemp: c0?.waterF ?? null,
      };
      msg(`Trip ${i + 1} of ${todo.length}: saving…`);
      await store.saveTrip(trip);
      saved++;
      for (const p of items) { p.skip = true; p.done = true; existing.add(`${g.date} ${hm(p.time)}`); }
    }
    photos.forEach(p => URL.revokeObjectURL(p.url)); photos = []; groups = []; tags = null;
    render(); msg(`Saved ${saved} trip${saved === 1 ? '' : 's'}.`);
    done?.();
  } catch (e) {
    photos = photos.filter(p => !p.done); regroup(); render();
    msg(`Saved ${saved} trip${saved === 1 ? '' : 's'}, then hit a problem: ${e.message}. Tap Save to try the rest again.`);
  } finally { btn.disabled = false; }
}
