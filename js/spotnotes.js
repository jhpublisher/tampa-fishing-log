// Spot history: what James knows from fishing a spot before (fish he's caught there,
// the months it's good, the tide that works), saved on his account (user_metadata.spotNotes)
// and cached on the phone. Scoring reads it through spotHistory() / spotHistoryAt().
import { SPECIES, byId } from './species.js';
import { km } from './spots.js';
import * as store from './store.js';

const $ = (s, el = document) => el.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
export const TIDES = { any: 'Any tide', incoming: 'Incoming', outgoing: 'Outgoing', high: 'Around high', low: 'Around low', moving: 'Moving water (either way)' };
const LS = 'spotNotes';

let notes = (() => { try { return JSON.parse(localStorage.getItem(LS) || '{}'); } catch { return {}; } })();
const cache = () => { try { localStorage.setItem(LS, JSON.stringify(notes)); } catch { } };

// Call after sign-in: the account copy wins, phone-only notes are kept and uploaded.
export function syncSpotNotes() {
  const acct = store.getSpotNotes();
  const merged = { ...notes, ...acct };
  const phoneOnly = Object.keys(notes).some(k => !acct[k]);
  notes = merged; cache();
  if (phoneOnly) store.saveSpotNotes(notes).catch(() => { });
  document.dispatchEvent(new Event('spot-notes'));
}

// ---------- for scoring ----------
// spotHistory(): every note, as
//   { key: 'spot:<id>' | 'sta:<id>', name, lat, lng,
//     species: ['redfish', ...]   (species ids from species.js),
//     months: [10, 11, 12]        (1-12; empty = any time of year),
//     tide: 'any'|'incoming'|'outgoing'|'high'|'low'|'moving',
//     note: 'free text', updated: ISO date }
export const spotHistory = () => Object.entries(notes).map(([key, n]) => ({ key, ...n }));
// spotHistoryAt(lat, lng, radiusKm = 1.5): notes for spots within radiusKm of a point, nearest first.
export const spotHistoryAt = (lat, lng, r = 1.5) => spotHistory()
  .filter(n => Number.isFinite(n.lat) && km(lat, lng, n.lat, n.lng) <= r)
  .sort((a, b) => km(lat, lng, a.lat, a.lng) - km(lat, lng, b.lat, b.lng));
export const noteFor = key => notes[key] || null;

async function save(key, n) {
  if (n) notes[key] = n; else delete notes[key];
  cache();
  document.dispatchEvent(new Event('spot-notes'));
  if (store.currentUser()) await store.saveSpotNotes(notes);
}

// ---------- UI: "My history here" on the spot card ----------
// place: {key, name, short, lat, lng}
export function renderSpotNotes(el, place, force = false) {
  if (!el || !place) return;
  // Today redraws often; don't wipe the form while James is filling it in.
  if (!force && el.dataset.key === place.key && el.dataset.editing === '1') return;
  el.dataset.key = place.key; el.dataset.editing = '';
  const n = notes[place.key];
  const summary = n ? `<ul class="plain small sn-sum">
      ${n.species?.length ? `<li>🐟 ${n.species.map(id => esc(byId(id)?.name.replace(/\s*\(.*\)/, '') || id)).join(', ')}</li>` : ''}
      <li>📅 ${n.months?.length ? n.months.map(m => MONTHS[m - 1]).join(', ') : 'Any time of year'}</li>
      <li>🌊 ${esc(TIDES[n.tide] || TIDES.any)}</li>
      ${n.note ? `<li>📝 ${esc(n.note)}</li>` : ''}</ul>` : '<p class="small muted">Caught fish here before? Note what, when and on what tide. Your best-times picks will count it.</p>';
  const html = `<h3>My history here</h3>${summary}
    <button type="button" class="sn-edit">${n ? 'Edit my history' : '+ Add my history'}</button>`;
  if (el._html === html && !force) return; // nothing changed: leave the DOM alone
  el.innerHTML = html; el._html = html;
  $('.sn-edit', el).onclick = () => editForm(el, place);
}

function editForm(el, place) {
  el.dataset.editing = '1'; el._html = null;
  const n = notes[place.key] || { species: [], months: [], tide: 'any', note: '' };
  const fish = SPECIES.filter(s => s.id !== 'other');
  el.innerHTML = `<h3>My history at ${esc(place.short || place.name)}</h3>
    <div class="sn-label">Fish I've caught here</div>
    <div class="chips sn-chips">${fish.map(s => `<button type="button" class="chip-btn${n.species.includes(s.id) ? ' on' : ''}" data-sp="${s.id}">${esc(s.name.replace(/\s*\(.*\)/, ''))}</button>`).join('')}</div>
    <div class="sn-label">Good months <span class="muted small">(leave blank for any)</span></div>
    <div class="chips sn-chips">${MONTHS.map((m, i) => `<button type="button" class="chip-btn${n.months.includes(i + 1) ? ' on' : ''}" data-m="${i + 1}">${m}</button>`).join('')}</div>
    <label>Best tide <select class="sn-tide">${Object.entries(TIDES).map(([k, v]) => `<option value="${k}"${n.tide === k ? ' selected' : ''}>${v}</option>`).join('')}</select></label>
    <label>Notes <textarea class="sn-note" rows="3" placeholder="e.g. Reds push up on the oyster bar on the last of the incoming. Trout on the grass edge at first light.">${esc(n.note)}</textarea></label>
    <p class="small sn-msg"></p>
    <div class="row end">${notes[place.key] ? '<button type="button" class="sn-del danger">Delete</button>' : ''}<button type="button" class="sn-cancel">Cancel</button><button type="button" class="primary sn-save">Save</button></div>`;
  el.querySelectorAll('.chip-btn').forEach(b => b.onclick = () => b.classList.toggle('on'));
  $('.sn-cancel', el).onclick = () => renderSpotNotes(el, place, true);
  const del = $('.sn-del', el);
  if (del) del.onclick = async () => {
    if (del.dataset.armed !== '1') { del.dataset.armed = '1'; del.textContent = 'Tap again to delete'; return; }
    await save(place.key, null).catch(() => { }); renderSpotNotes(el, place, true);
  };
  $('.sn-save', el).onclick = async () => {
    const out = {
      name: place.name, lat: place.lat, lng: place.lng,
      species: [...el.querySelectorAll('[data-sp].on')].map(b => b.dataset.sp),
      months: [...el.querySelectorAll('[data-m].on')].map(b => +b.dataset.m),
      tide: $('.sn-tide', el).value, note: $('.sn-note', el).value.trim(), updated: new Date().toISOString(),
    };
    const msg = $('.sn-msg', el);
    try { await save(place.key, out); renderSpotNotes(el, place, true); }
    catch (e) { msg.textContent = `Saved on this phone; couldn't reach your account (${e.message}).`; }
    if (!store.currentUser()) { renderSpotNotes(el, place, true); el.insertAdjacentHTML('beforeend', '<p class="small muted">Saved on this phone. Sign in on My trips to keep it on your account too.</p>'); }
  };
}
