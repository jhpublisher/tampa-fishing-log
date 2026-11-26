// Find a place by name: James's own spots, the listed spots, NOAA tide stations, and any
// named place around Tampa Bay from OpenStreetMap (Nominatim, free, no key; max 1 search a second).
import { SPOTS } from './spots.js';
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
