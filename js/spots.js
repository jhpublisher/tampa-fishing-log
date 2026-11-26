// Named Tampa Bay spots, tagged by habitat. Coordinates are approximate.
// Habitat tags: flats, mangroves, oysters, docks, bridges, pier, pass, beach, bay (open bay/channel),
// river (rivers, canals, residential creeks: winter refuge), warm (power-plant warm water), nearshore (Gulf hard bottom, boat).
// boat: true when the spot really needs a boat or kayak.
export const SPOTS = [
  { id: 'clearwater-pass', name: 'Clearwater Pass & Sand Key', lat: 27.966, lng: -82.826, tags: ['pass', 'beach', 'bridges', 'docks'] },
  { id: 'courtney-campbell', name: 'Courtney Campbell Causeway', lat: 27.966, lng: -82.648, tags: ['flats', 'mangroves', 'bridges', 'beach'] },
  { id: 'hillsborough-river', name: 'Hillsborough River & downtown seawalls', lat: 27.955, lng: -82.460, tags: ['river', 'docks'] },
  { id: 'howard-frankland', name: 'Howard Frankland Bridge', lat: 27.929, lng: -82.570, tags: ['bridges', 'bay', 'flats'] },
  { id: 'gandy', name: 'Gandy Bridge', lat: 27.893, lng: -82.556, tags: ['bridges', 'flats', 'bay'] },
  { id: 'ballast-point', name: 'Ballast Point & Davis Islands', lat: 27.890, lng: -82.481, tags: ['docks', 'pier', 'flats'] },
  { id: 'picnic-island', name: 'Picnic Island Park', lat: 27.854, lng: -82.549, tags: ['flats', 'mangroves', 'pier'] },
  { id: 'alafia', name: 'Alafia River mouth', lat: 27.855, lng: -82.405, tags: ['river', 'mangroves', 'oysters', 'flats'] },
  { id: 'weedon', name: 'Weedon Island Preserve', lat: 27.847, lng: -82.607, tags: ['flats', 'mangroves', 'oysters'] },
  { id: 'apollo-beach', name: 'Apollo Beach / Big Bend warm water', lat: 27.792, lng: -82.410, tags: ['warm', 'flats', 'river'] },
  { id: 'johns-pass', name: "John's Pass", lat: 27.784, lng: -82.782, tags: ['pass', 'bridges', 'docks', 'beach'] },
  { id: 'cockroach-bay', name: 'Cockroach Bay', lat: 27.685, lng: -82.510, tags: ['flats', 'mangroves', 'oysters'], boat: true },
  { id: 'pass-a-grille', name: 'Pass-a-Grille & Shell Key', lat: 27.680, lng: -82.737, tags: ['pass', 'beach', 'flats', 'mangroves'] },
  { id: 'fort-desoto', name: 'Fort De Soto piers & Bunces Pass', lat: 27.636, lng: -82.737, tags: ['pier', 'pass', 'beach', 'flats'] },
  { id: 'skyway-piers', name: 'Skyway fishing piers', lat: 27.605, lng: -82.652, tags: ['pier', 'bridges', 'bay'] },
  { id: 'egmont', name: 'Egmont Key', lat: 27.600, lng: -82.762, tags: ['beach', 'pass', 'nearshore'], boat: true },
  { id: 'anna-maria', name: 'Anna Maria piers & flats', lat: 27.530, lng: -82.728, tags: ['pier', 'flats', 'beach'] },
  { id: 'nearshore-reefs', name: 'Nearshore Gulf reefs (off Pinellas)', lat: 27.700, lng: -82.900, tags: ['nearshore'], boat: true },
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
  for (const s of SPOTS) if (!s.custom) { const d = km(lat, lng, s.lat, s.lng); if (d < bd) { bd = d; best = s; } }
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
