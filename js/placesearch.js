// Find a place by name: James's own spots, the listed spots, NOAA tide stations, and any
// named place around Tampa Bay from OpenStreetMap (Nominatim, free, no key; max 1 search a second).
import { SPOTS, CATS, catOf, km } from './spots.js';
import { STATIONS } from './tides.js';

const BOX = '-83.05,28.40,-82.20,27.20'; // Tarpon Springs to Venice, out to the nearshore Gulf
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

// Local matches, instant. [{kind: 'spot'|'sta', key, name, sub}]
export function localMatches(q, { stations = true } = {}) {
  q = q.trim().toLowerCase(); if (!q) return [];
  const words = q.split(/\s+/);
  const hit = name => words.every(w => name.toLowerCase().includes(w));
  const spots = SPOTS.filter(s => hit(s.name)).sort((a, b) => (b.custom ? 1 : 0) - (a.custom ? 1 : 0))
    .map(s => ({ kind: 'spot', key: 'spot:' + s.id, name: s.name, sub: s.custom ? 'My spot' : s.boat ? 'Listed spot (boat)' : 'Listed spot' }));
  const stas = stations ? STATIONS.filter(s => hit(s.name)).slice(0, 5).map(s => ({ kind: 'sta', key: 'sta:' + s.id, name: s.name, sub: 'NOAA tide station' })) : [];
  return [...spots, ...stas];
}

// OpenStreetMap places inside the Tampa Bay box. [{kind: 'osm', name, sub, lat, lng}]
let last = 0;
const memo = new Map();
export async function osmSearch(q) {
  q = q.trim(); if (q.length < 3) return [];
  if (memo.has(q)) return memo.get(q);
  const wait = 1100 - (Date.now() - last); if (wait > 0) await new Promise(r => setTimeout(r, wait));
  last = Date.now();
  const u = `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=6&bounded=1&viewbox=${BOX}&countrycodes=us&q=${encodeURIComponent(q)}`;
  const p = fetch(u, { headers: { 'Accept-Language': 'en' } }).then(r => r.json()).then(list => list.map(x => {
    const parts = String(x.display_name || '').split(', ');
    return { kind: 'osm', name: x.name || parts[0], sub: parts.slice(1, 3).join(', '), lat: +x.lat, lng: +x.lon };
  })).catch(() => { memo.delete(q); return null; });
  memo.set(q, p);
  return p;
}

// Wire a search input to a results list. onPick(result) gets a local or OSM result.
export function attachSearch(input, list, onPick, opts = {}) {
  let timer = null, seq = 0;
  const draw = (local, osm, loading) => {
    const rows = [...local, ...(osm || [])];
    list.hidden = !input.value.trim();
    list.innerHTML = rows.map((r, i) => `<li><button type="button" data-i="${i}"><strong>${esc(r.name)}</strong><span>${esc(r.sub)}${r.kind === 'osm' ? ' · map place' : ''}</span></button></li>`).join('')
      + (loading ? '<li class="muted small ps-note">Searching places around Tampa Bay…</li>' : '')
      + (!rows.length && !loading ? '<li class="muted small ps-note">No matches. Try a shorter name, or drop a pin on the map.</li>' : '')
      + (osm?.length ? '<li class="muted small ps-note">Places © OpenStreetMap</li>' : '');
    list.querySelectorAll('[data-i]').forEach(b => b.onclick = () => { const r = rows[+b.dataset.i]; list.hidden = true; onPick(r); });
  };
  input.addEventListener('input', () => {
    const q = input.value, mine = ++seq;
    const local = localMatches(q, opts);
    clearTimeout(timer);
    if (q.trim().length < 3) return draw(local, [], false);
    draw(local, [], true);
    timer = setTimeout(async () => {
      const osm = await osmSearch(q);
      if (mine === seq) draw(local, osm || [], false);
    }, 600);
  });
  list.hidden = true;
}

// Where "nearest first" measures from: the last place the phone reported, else a fallback point.
export function refPoint(fallback) {
  try { const l = JSON.parse(localStorage.getItem('lastLoc') || 'null'); if (l && Date.now() - l.t < 6 * 3600e3) return { ...l, me: true }; } catch { }
  return fallback || { lat: 27.77, lng: -82.63 };
}
export const saveLoc = (lat, lng) => { try { localStorage.setItem('lastLoc', JSON.stringify({ lat, lng, t: Date.now() })); } catch { } };
const mi = d => d < 0.8 ? '<0.5 mi' : `${Math.round(d / 1.609 * 10) / 10 < 10 ? (d / 1.609).toFixed(1) : Math.round(d / 1.609)} mi`;

// Every spot, grouped by kind, nearest first: [{title, rows: [{kind:'spot', key, name, sub}]}]
export function groupedSpots(ref) {
  return Object.entries(CATS).map(([c, title]) => ({
    title,
    rows: SPOTS.filter(s => catOf(s) === c)
      .map(s => ({ s, d: km(ref.lat, ref.lng, s.lat, s.lng) })).sort((a, b) => a.d - b.d)
      .map(({ s, d }) => ({ kind: 'spot', key: 'spot:' + s.id, name: s.name, sub: `${mi(d)}${s.boat && c !== 'ramp' && c !== 'offshore' ? ' · boat' : ''}` })),
  })).filter(g => g.rows.length);
}

// One box to pick a spot: blank to start, ▾ shows every spot (grouped, nearest first),
// typing filters spots and stations and adds OpenStreetMap places. onPick(result).
export function spotCombo(root, { onPick, ref }) {
  const input = root.querySelector('input'), arrow = root.querySelector('.combo-arrow'), list = root.querySelector('.ps-list');
  let timer = null, seq = 0, rows = [];
  const rowHtml = (r, i) => `<li><button type="button" data-i="${i}"><strong>${esc(r.name)}</strong><span>${esc(r.sub)}${r.kind === 'osm' ? ' · map place' : ''}</span></button></li>`;
  const bind = () => list.querySelectorAll('[data-i]').forEach(b => b.onclick = () => pick(rows[+b.dataset.i]));
  const open = () => { list.hidden = false; root.classList.add('open'); };
  const close = () => { list.hidden = true; root.classList.remove('open'); };
  function showAll() {
    const groups = groupedSpots(ref()); rows = [];
    const r0 = ref();
    list.innerHTML = (r0.me ? '<li class="muted small ps-note">Nearest to you first</li>' : '') + groups.map(g => `<li class="ps-group">${esc(g.title)}</li>` + g.rows.map(r => { rows.push(r); return rowHtml(r, rows.length - 1); }).join('')).join('');
    bind(); open(); list.scrollTop = 0;
    root.scrollIntoView({ block: 'start', behavior: 'smooth' }); // room for the list above the tab bar
  }
  function showFiltered(local, osm, loading) {
    rows = [...local, ...(osm || [])];
    list.innerHTML = rows.map(rowHtml).join('')
      + (loading ? '<li class="muted small ps-note">Searching places around Tampa Bay…</li>' : '')
      + (!rows.length && !loading ? '<li class="muted small ps-note">No matches. Try a shorter name, or drop a pin on the map.</li>' : '')
      + (osm?.length ? '<li class="muted small ps-note">Places © OpenStreetMap</li>' : '');
    bind(); open();
  }
  function pick(r) { input.value = r.name; close(); input.blur(); onPick(r); }
  input.addEventListener('focus', () => { if (!input.value.trim()) showAll(); });
  input.addEventListener('input', () => {
    const q = input.value, mine = ++seq; clearTimeout(timer);
    if (!q.trim()) return showAll();
    const local = localMatches(q);
    if (q.trim().length < 3) return showFiltered(local, [], false);
    showFiltered(local, [], true);
    timer = setTimeout(async () => { const osm = await osmSearch(q); if (mine === seq) showFiltered(local, osm || [], false); }, 600);
  });
  input.addEventListener('keydown', e => { if (e.key === 'Escape') close(); if (e.key === 'Enter') { e.preventDefault(); if (rows[0] && !list.hidden) pick(rows[0]); } });
  arrow.addEventListener('click', () => { if (!list.hidden) return close(); input.value = ''; showAll(); });
  document.addEventListener('click', e => { if (!root.contains(e.target)) close(); });
  close();
  return { set: name => { input.value = name || ''; }, clear: () => { input.value = ''; } };
}
