// Named Tampa Bay spots, tagged by habitat. Coordinates are approximate.
// Habitat tags: flats, mangroves, oysters, docks, bridges, pier, pass, beach, bay (open bay/channel),
// river (rivers, canals, residential creeks: winter refuge), warm (power-plant warm water), nearshore (Gulf hard bottom, boat).
// boat: true when the spot really needs a boat or kayak.
// cat: pier (piers, bridges, seawalls), beach (beaches & passes), flats (flats, parks & rivers),
// ramp (boat ramps & launches, loaded from OpenStreetMap), offshore (boat-only open water).
// Pins are approximate (park or bridge level). Directions use the name too.
export const SPOTS = [
  { id: 'clearwater-pass', cat: 'beach', name: 'Clearwater Pass & Sand Key', lat: 27.966, lng: -82.826, tags: ['pass', 'beach', 'bridges', 'docks'] },
  { id: 'courtney-campbell', cat: 'pier', name: 'Courtney Campbell Causeway', lat: 27.966, lng: -82.648, tags: ['flats', 'mangroves', 'bridges', 'beach'] },
  { id: 'hillsborough-river', cat: 'flats', name: 'Hillsborough River & downtown seawalls', lat: 27.955, lng: -82.460, tags: ['river', 'docks'] },
  { id: 'howard-frankland', cat: 'pier', name: 'Howard Frankland Bridge', lat: 27.929, lng: -82.570, tags: ['bridges', 'bay', 'flats'] },
  { id: 'gandy', cat: 'pier', name: 'Gandy Bridge', lat: 27.893, lng: -82.556, tags: ['bridges', 'flats', 'bay'] },
  { id: 'ballast-point', cat: 'pier', name: 'Ballast Point & Davis Islands', lat: 27.890, lng: -82.481, tags: ['docks', 'pier', 'flats'] },
  { id: 'picnic-island', cat: 'flats', name: 'Picnic Island Park', lat: 27.854, lng: -82.549, tags: ['flats', 'mangroves', 'pier'] },
  { id: 'alafia', cat: 'flats', name: 'Alafia River mouth', lat: 27.855, lng: -82.405, tags: ['river', 'mangroves', 'oysters', 'flats'] },
  { id: 'weedon', cat: 'flats', name: 'Weedon Island Preserve', lat: 27.847, lng: -82.607, tags: ['flats', 'mangroves', 'oysters'] },
  { id: 'apollo-beach', cat: 'flats', name: 'Apollo Beach / Big Bend warm water', lat: 27.792, lng: -82.410, tags: ['warm', 'flats', 'river'] },
  { id: 'johns-pass', cat: 'beach', name: "John's Pass", lat: 27.784, lng: -82.782, tags: ['pass', 'bridges', 'docks', 'beach'] },
  { id: 'cockroach-bay', cat: 'flats', name: 'Cockroach Bay', lat: 27.685, lng: -82.510, tags: ['flats', 'mangroves', 'oysters'], boat: true },
  { id: 'pass-a-grille', cat: 'beach', name: 'Pass-a-Grille & Shell Key', lat: 27.680, lng: -82.737, tags: ['pass', 'beach', 'flats', 'mangroves'] },
  { id: 'fort-desoto', cat: 'pier', name: 'Fort De Soto piers & Bunces Pass', lat: 27.636, lng: -82.737, tags: ['pier', 'pass', 'beach', 'flats'] },
  { id: 'skyway-piers', cat: 'pier', name: 'Skyway fishing piers', lat: 27.605, lng: -82.652, tags: ['pier', 'bridges', 'bay'] },
  { id: 'egmont', cat: 'offshore', name: 'Egmont Key', lat: 27.600, lng: -82.762, tags: ['beach', 'pass', 'nearshore'], boat: true },
  { id: 'anna-maria', cat: 'pier', name: 'Anna Maria piers & flats', lat: 27.530, lng: -82.728, tags: ['pier', 'flats', 'beach'] },
  { id: 'nearshore-reefs', cat: 'offshore', name: 'Nearshore Gulf reefs (off Pinellas)', lat: 27.700, lng: -82.900, tags: ['nearshore'], boat: true },
  // ---- added 2026-11-26: more public piers, bridges, beaches, passes, parks and flats ----
  // Piers & bridges
  { id: 'pier-60', cat: 'pier', name: 'Pier 60, Clearwater Beach', lat: 27.9775, lng: -82.8327, tags: ['pier', 'beach', 'pass'] },
  { id: 'redington-pier', cat: 'pier', name: 'Redington Long Pier', lat: 27.8240, lng: -82.8300, tags: ['pier', 'beach', 'nearshore'] },
  { id: 'skyway-south', cat: 'pier', name: 'Skyway South Fishing Pier', lat: 27.5965, lng: -82.6372, tags: ['pier', 'bridges', 'bay'] },
  { id: 'desoto-gulf-pier', cat: 'pier', name: 'Fort De Soto Gulf Pier', lat: 27.6133, lng: -82.7391, tags: ['pier', 'beach', 'pass'] },
  { id: 'desoto-bay-pier', cat: 'pier', name: 'Fort De Soto Bay Pier', lat: 27.6270, lng: -82.7180, tags: ['pier', 'flats', 'bay'] },
  { id: 'st-pete-pier', cat: 'pier', name: 'St. Pete Pier', lat: 27.7735, lng: -82.6235, tags: ['pier', 'docks', 'bay'] },
  { id: 'gulfport-pier', cat: 'pier', name: 'Gulfport Municipal Pier & Casino', lat: 27.7365, lng: -82.7065, tags: ['pier', 'docks', 'flats'] },
  { id: 'corey-causeway', cat: 'pier', name: 'Corey Causeway bridge', lat: 27.7505, lng: -82.7280, tags: ['bridges', 'flats', 'mangroves'] },
  { id: 'bayway', cat: 'pier', name: 'Pinellas Bayway bridges', lat: 27.7010, lng: -82.7150, tags: ['bridges', 'flats', 'mangroves'] },
  { id: 'belleair-causeway', cat: 'pier', name: 'Belleair Causeway', lat: 27.9355, lng: -82.8090, tags: ['bridges', 'flats', 'docks'] },
  { id: 'clearwater-causeway', cat: 'pier', name: 'Clearwater Memorial Causeway', lat: 27.9665, lng: -82.8120, tags: ['bridges', 'flats', 'docks'] },
  { id: 'dunedin-causeway', cat: 'pier', name: 'Dunedin Causeway', lat: 28.0545, lng: -82.8100, tags: ['bridges', 'flats', 'beach'] },
  { id: 'bayside-bridge', cat: 'pier', name: 'Bayside Bridge', lat: 27.9280, lng: -82.7010, tags: ['bridges', 'bay', 'flats'] },
  { id: 'safety-harbor-pier', cat: 'pier', name: 'Safety Harbor Marina Pier', lat: 27.9900, lng: -82.6870, tags: ['pier', 'flats', 'oysters'] },
  { id: 'davis-islands', cat: 'pier', name: 'Davis Islands seawalls & beach', lat: 27.9050, lng: -82.4500, tags: ['docks', 'flats', 'river'] },
  { id: 'bayshore', cat: 'pier', name: 'Bayshore Boulevard seawall', lat: 27.9200, lng: -82.4830, tags: ['docks', 'flats'] },
  { id: 'anna-maria-city-pier', cat: 'pier', name: 'Anna Maria City Pier', lat: 27.5395, lng: -82.7335, tags: ['pier', 'flats', 'bay'] },
  { id: 'rod-reel-pier', cat: 'pier', name: 'Rod & Reel Pier, Anna Maria', lat: 27.5385, lng: -82.7402, tags: ['pier', 'pass', 'bay'] },
  { id: 'bridge-street-pier', cat: 'pier', name: 'Bridge Street Pier, Bradenton Beach', lat: 27.4675, lng: -82.6975, tags: ['pier', 'flats', 'docks'] },
  { id: 'palma-sola', cat: 'pier', name: 'Palma Sola Causeway & bridge', lat: 27.4959, lng: -82.6522, tags: ['bridges', 'flats', 'beach'] },
  { id: 'green-bridge', cat: 'pier', name: 'Green Bridge fishing pier, Palmetto', lat: 27.5175, lng: -82.5720, tags: ['pier', 'bridges', 'river'] },
  // Beaches & passes
  { id: 'honeymoon-island', cat: 'beach', name: 'Honeymoon Island', lat: 28.0681, lng: -82.8346, tags: ['beach', 'flats', 'pass'] },
  { id: 'hurricane-pass', cat: 'beach', name: 'Hurricane Pass', lat: 28.0450, lng: -82.8250, tags: ['pass', 'flats', 'beach'], boat: true },
  { id: 'fred-howard', cat: 'beach', name: 'Fred Howard Park causeway', lat: 28.1550, lng: -82.8000, tags: ['beach', 'flats', 'oysters'] },
  { id: 'sunset-beach-tarpon', cat: 'beach', name: 'Sunset Beach, Tarpon Springs', lat: 28.1400, lng: -82.7980, tags: ['beach', 'flats'] },
  { id: 'anclote', cat: 'beach', name: 'Anclote River & Anclote Key', lat: 28.1750, lng: -82.8100, tags: ['river', 'flats', 'beach', 'pass'], boat: true },
  { id: 'indian-rocks', cat: 'beach', name: 'Indian Rocks Beach', lat: 27.8850, lng: -82.8500, tags: ['beach'] },
  { id: 'treasure-island', cat: 'beach', name: 'Treasure Island Beach', lat: 27.7700, lng: -82.7755, tags: ['beach'] },
  { id: 'blind-pass', cat: 'beach', name: 'Blind Pass jetty', lat: 27.7490, lng: -82.7570, tags: ['pass', 'beach', 'bridges', 'docks'] },
  { id: 'bunces-pass', cat: 'beach', name: 'Bunces Pass bridge', lat: 27.6600, lng: -82.7250, tags: ['pass', 'bridges', 'flats', 'mangroves'] },
  { id: 'passage-key', cat: 'beach', name: 'Passage Key Inlet', lat: 27.5550, lng: -82.7450, tags: ['pass', 'beach', 'flats'], boat: true },
  { id: 'longboat-pass', cat: 'beach', name: 'Longboat Pass & Coquina Beach', lat: 27.4479, lng: -82.6883, tags: ['pass', 'beach', 'bridges'] },
  { id: 'ben-t-davis', cat: 'beach', name: 'Ben T. Davis Beach', lat: 27.9705, lng: -82.5763, tags: ['beach', 'flats', 'bridges'] },
  // Flats, parks & rivers
  { id: 'philippe-park', cat: 'flats', name: 'Philippe Park, Safety Harbor', lat: 28.0160, lng: -82.6800, tags: ['flats', 'oysters', 'mangroves'] },
  { id: 'upper-tampa-bay-park', cat: 'flats', name: 'Upper Tampa Bay Park', lat: 28.0120, lng: -82.6450, tags: ['flats', 'mangroves', 'oysters'] },
  { id: 're-olds-park', cat: 'flats', name: 'R.E. Olds Park, Oldsmar', lat: 28.0300, lng: -82.6600, tags: ['flats', 'docks', 'oysters'] },
  { id: 'cypress-point', cat: 'flats', name: 'Cypress Point Park', lat: 27.9510, lng: -82.5460, tags: ['flats', 'beach', 'mangroves'] },
  { id: 'rocky-point', cat: 'flats', name: 'Rocky Point', lat: 27.9650, lng: -82.5650, tags: ['flats', 'docks', 'bridges'] },
  { id: 'coffee-pot-bayou', cat: 'flats', name: 'Coffee Pot Bayou', lat: 27.7900, lng: -82.6300, tags: ['flats', 'docks', 'mangroves'] },
  { id: 'north-shore', cat: 'flats', name: 'North Shore Park', lat: 27.7843, lng: -82.6237, tags: ['flats', 'beach', 'docks'] },
  { id: 'lassing-park', cat: 'flats', name: 'Lassing Park', lat: 27.7520, lng: -82.6300, tags: ['flats', 'beach', 'oysters'] },
  { id: 'maximo-park', cat: 'flats', name: 'Maximo Park', lat: 27.7097, lng: -82.6829, tags: ['flats', 'mangroves', 'oysters'] },
  { id: 'clam-bayou', cat: 'flats', name: 'Clam Bayou, Gulfport', lat: 27.7380, lng: -82.6900, tags: ['flats', 'mangroves', 'oysters'] },
  { id: 'boca-ciega', cat: 'flats', name: 'Boca Ciega Bay flats', lat: 27.7800, lng: -82.7450, tags: ['flats', 'mangroves', 'docks'], boat: true },
  { id: 'war-veterans-park', cat: 'flats', name: 'War Veterans Memorial Park', lat: 27.8100, lng: -82.7750, tags: ['flats', 'mangroves', 'docks'] },
  { id: 'shell-key', cat: 'flats', name: 'Shell Key Preserve', lat: 27.6700, lng: -82.7420, tags: ['flats', 'mangroves', 'beach'], boat: true },
  { id: 'simmons-park', cat: 'flats', name: 'E.G. Simmons Park', lat: 27.7420, lng: -82.4700, tags: ['flats', 'mangroves', 'oysters'] },
  { id: 'little-manatee', cat: 'flats', name: 'Little Manatee River mouth', lat: 27.7000, lng: -82.4700, tags: ['river', 'mangroves', 'oysters', 'flats'] },
  { id: 'apollo-preserve', cat: 'flats', name: 'Apollo Beach Nature Preserve', lat: 27.7750, lng: -82.4200, tags: ['flats', 'beach', 'warm'] },
  { id: 'bishop-harbor', cat: 'flats', name: 'Bishop Harbor', lat: 27.5900, lng: -82.5670, tags: ['flats', 'mangroves', 'oysters'], boat: true },
  { id: 'terra-ceia', cat: 'flats', name: 'Terra Ceia Bay', lat: 27.5650, lng: -82.5900, tags: ['flats', 'mangroves', 'oysters'], boat: true },
  { id: 'emerson-point', cat: 'flats', name: 'Emerson Point Preserve', lat: 27.5330, lng: -82.6270, tags: ['flats', 'mangroves', 'oysters'] },
  { id: 'manatee-river', cat: 'flats', name: 'Manatee River, Bradenton Riverwalk', lat: 27.5000, lng: -82.5700, tags: ['river', 'docks', 'bridges'] },
  { id: 'robinson-preserve', cat: 'flats', name: 'Robinson Preserve', lat: 27.5050, lng: -82.6650, tags: ['flats', 'mangroves', 'oysters'] },
];

export const spotById = id => SPOTS.find(s => s.id === id);

// Distance in km.
export function km(aLat, aLng, bLat, bLng) {
  const r = Math.PI / 180, dy = (bLat - aLat) * 111.2, dx = (bLng - aLng) * 111.2 * Math.cos(aLat * r);
  return Math.hypot(dx, dy);
}

export function nearestSpot(lat, lng) {
  let best = SPOTS[0], bd = Infinity;
  for (const s of SPOTS) { const d = km(lat, lng, s.lat, s.lng); if (d < bd) { bd = d; best = s; } }
  return best;
}

// ---------- James's own spots ----------
// Saved on this phone (localStorage 'mySpots') and on his account. They join SPOTS with custom: true,
// so Today, Plan and trip conditions treat them like any other spot.
// type: shore | wade | kayak | boat. Habitat tags come from the nearest listed spot when it's close,
// otherwise from the type.
export const SPOT_TYPES = { shore: 'Shore', wade: 'Wade', kayak: 'Kayak', boat: 'Boat' };
const TYPE_TAGS = { shore: ['docks', 'beach', 'mangroves'], wade: ['flats', 'mangroves', 'oysters'], kayak: ['flats', 'mangroves', 'oysters'], boat: ['bay', 'flats', 'bridges'] };
function tagsFor(lat, lng, type) {
  let best = null, bd = Infinity;
  for (const s of SPOTS) if (!s.custom && !s.osm) { const d = km(lat, lng, s.lat, s.lng); if (d < bd) { bd = d; best = s; } }
  return bd < 6 ? best.tags : TYPE_TAGS[type] || TYPE_TAGS.shore;
}
export function setMySpots(list) {
  for (let i = SPOTS.length - 1; i >= 0; i--) if (SPOTS[i].custom) SPOTS.splice(i, 1);
  for (const m of list || []) {
    if (!m?.id || !Number.isFinite(m.lat) || !Number.isFinite(m.lng)) continue;
    SPOTS.push({ id: m.id, name: m.name || 'My spot', lat: m.lat, lng: m.lng, type: m.type, custom: true, boat: m.type === 'boat', tags: tagsFor(m.lat, m.lng, m.type) });
  }
  try { localStorage.setItem('mySpots', JSON.stringify(mySpots())); } catch { }
  document.dispatchEvent(new Event('spots-changed'));
}
export const mySpots = () => SPOTS.filter(s => s.custom).map(({ id, name, lat, lng, type }) => ({ id, name, lat, lng, type }));
try { setMySpots(JSON.parse(localStorage.getItem('mySpots') || '[]')); } catch { }

export const CATS = { mine: 'My own spots', pier: 'Piers, bridges & seawalls', beach: 'Beaches & passes', flats: 'Flats, parks & rivers', ramp: 'Boat ramps & launches', offshore: 'Offshore (boat)' };
export const catOf = s => s.custom ? 'mine' : s.cat || 'flats';

// ---------- more spots from OpenStreetMap ----------
// Named public fishing piers, boat ramps and fishing spots inside the bay box, fetched in the browser
// from the Overpass API (free, no key) and cached on the phone for two weeks. Each gets the habitat of
// the nearest listed spot. They show in the picker, map and search; Plan's 7-day finder skips them.
const OSM_KEY = 'osmSpots-v1', OSM_AGE = 14 * 864e5;
const OSM_BOX = '27.20,-83.05,28.40,-82.20';
function addOsm(list) {
  for (let i = SPOTS.length - 1; i >= 0; i--) if (SPOTS[i].osm) SPOTS.splice(i, 1);
  const listed = SPOTS.filter(s => !s.custom);
  const near = (lat, lng) => listed.reduce((b, s) => { const d = km(lat, lng, s.lat, s.lng); return d < b.d ? { s, d } : b; }, { s: null, d: Infinity });
  for (const o of list) {
    const n = near(o.lat, o.lng);
    if (n.d < 0.3) continue; // already listed
    const base = n.d < 6 ? n.s.tags : ['flats', 'mangroves'];
    const tags = o.kind === 'pier' ? ['pier', 'docks', ...base.filter(t => t !== 'pier')].slice(0, 4) : base;
    SPOTS.push({ id: 'osm-' + o.id, cat: o.kind === 'pier' ? 'pier' : o.kind === 'ramp' ? 'ramp' : n.s?.cat || 'flats', name: o.name, lat: o.lat, lng: o.lng, tags, osm: true, boat: o.kind === 'ramp' });
  }
  document.dispatchEvent(new Event('spots-changed'));
}
export async function loadOsmSpots() {
  try {
    const c = JSON.parse(localStorage.getItem(OSM_KEY) || 'null');
    if (c?.list) { addOsm(c.list); if (Date.now() - c.t < OSM_AGE) return; }
  } catch { }
  const q = `[out:json][timeout:25];(nwr["man_made"="pier"]["name"](${OSM_BOX});nwr["leisure"="slipway"](${OSM_BOX});nwr["leisure"="fishing"](${OSM_BOX}););out center tags;`;
  try {
    const j = await fetch('https://overpass-api.de/api/interpreter', { method: 'POST', body: 'data=' + encodeURIComponent(q), headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }).then(r => r.json());
    const seen = new Set(), list = [];
    for (const e of j.elements || []) {
      const t = e.tags || {}, lat = e.lat ?? e.center?.lat, lng = e.lon ?? e.center?.lon;
      if (lat == null || /private|no/.test(t.access || '')) continue;
      const kind = t.leisure === 'slipway' ? 'ramp' : t.man_made === 'pier' ? 'pier' : 'fishing';
      let name = t.name || '';
      if (!name && kind === 'ramp') { if (/private|customers/.test(t.access || '')) continue; name = 'Boat ramp'; }
      if (!name) continue;
      if (kind === 'ramp' && !/ramp|launch|landing|park|marina/i.test(name)) name += ' boat ramp';
      const k = name.toLowerCase() + Math.round(lat * 200) + Math.round(lng * 200);
      if (seen.has(k)) continue; seen.add(k);
      list.push({ id: `${e.type[0]}${e.id}`, name, kind, lat: +lat.toFixed(5), lng: +lng.toFixed(5) });
    }
    // unnamed ramps: name them after the nearest listed spot so the list reads well
    for (const o of list) if (o.name === 'Boat ramp') {
      const n = SPOTS.filter(s => !s.osm && !s.custom).reduce((b, s) => { const d = km(o.lat, o.lng, s.lat, s.lng); return d < b.d ? { s, d } : b; }, { s: null, d: Infinity });
      o.name = n.d < 8 ? `Boat ramp near ${n.s.name.split(/ [&(,]/)[0]}` : 'Boat ramp';
    }
    if (list.length) { localStorage.setItem(OSM_KEY, JSON.stringify({ t: Date.now(), list })); addOsm(list); }
  } catch { /* offline or Overpass busy: keep the listed spots */ }
}
