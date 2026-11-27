// NOAA CO-OPS tide predictions for Tampa Bay stations. Free, no key.
// Docs: https://tidesandcurrents.noaa.gov/api/
export const STATIONS = [
  { id: '8726520', name: 'St. Petersburg', lat: 27.7606, lng: -82.6269 },
  { id: '8726724', name: 'Clearwater Beach', lat: 27.9783, lng: -82.8317 },
  { id: '8726607', name: 'Old Port Tampa', lat: 27.8578, lng: -82.5528 },
  { id: '8726667', name: 'McKay Bay Entrance', lat: 27.9133, lng: -82.4250 },
  { id: '8726384', name: 'Port Manatee', lat: 27.6383, lng: -82.5625 },
  { id: '8726347', name: 'Egmont Key', lat: 27.6000, lng: -82.7600 },
];

// Load every NOAA tide-prediction station around Tampa Bay (Tarpon Springs to Venice).
// Falls back to the six built-in stations above if NOAA can't be reached.
const BOX = { n: 28.35, s: 27.0, w: -83.0, e: -82.25 };
export async function loadStations() {
  let list = null;
  try { list = JSON.parse(localStorage.getItem('stations-v1') || 'null'); } catch { }
  if (!list) {
    try {
      const r = await fetch('https://api.tidesandcurrents.noaa.gov/mdapi/prod/webapi/stations.json?type=tidepredictions');
      const j = await r.json();
      list = (j.stations || [])
        .filter(s => s.lat <= BOX.n && s.lat >= BOX.s && s.lng >= BOX.w && s.lng <= BOX.e)
        .map(s => ({ id: String(s.id), name: s.name, lat: +s.lat, lng: +s.lng }));
      if (list.length) { try { localStorage.setItem('stations-v1', JSON.stringify(list)); } catch { } }
    } catch { list = null; }
  }
  if (list?.length) {
    list.sort((a, b) => b.lat - a.lat); // north to south
    STATIONS.splice(0, STATIONS.length, ...list);
  }
  return STATIONS;
}

const API = 'https://api.tidesandcurrents.noaa.gov/api/prod/datagetter';
const ymd = d => `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;

export function nearestStation(lat, lng) {
  let best = STATIONS[0], bd = Infinity;
  for (const s of STATIONS) {
    const d = (s.lat - lat) ** 2 + ((s.lng - lng) * Math.cos(lat * Math.PI / 180)) ** 2;
    if (d < bd) { bd = d; best = s; }
  }
  return best;
}

const cache = new Map();

// High/low predictions from `start` for `days` days (plus a day of padding on each side).
// Returns [{t: Date, v: feet, type: 'H'|'L'}]
export async function getHiLo(stationId, start, days = 8) {
  const b = new Date(start); b.setDate(b.getDate() - 1);
  const key = `${stationId}|${ymd(b)}|${days}`;
  if (cache.has(key)) return cache.get(key);
  const url = `${API}?product=predictions&application=tampa_fishing_log&station=${stationId}` +
    `&datum=MLLW&units=english&time_zone=lst_ldt&interval=hilo&format=json` +
    `&begin_date=${ymd(b)}&range=${(days + 2) * 24}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`NOAA ${res.status}`);
  const j = await res.json();
  if (!j.predictions) throw new Error(j.error?.message || 'No tide data');
  const out = j.predictions.map(p => ({ t: new Date(p.t.replace(' ', 'T')), v: +p.v, type: p.type }));
  cache.set(key, out);
  return out;
}

// Height at time t using cosine interpolation between highs and lows.
export function heightAt(hilo, t) {
  const x = +t;
  for (let i = 0; i < hilo.length - 1; i++) {
    const a = hilo[i], b = hilo[i + 1];
    if (x >= +a.t && x <= +b.t) {
      const f = (x - a.t) / (b.t - a.t);
      return a.v + (b.v - a.v) * (1 - Math.cos(Math.PI * f)) / 2;
    }
  }
  return null;
}

// How fast the water is moving at t, 0 (slack) .. 1 (peak flow). Also 'rising'/'falling'.
export function flowAt(hilo, t) {
  const x = +t;
  for (let i = 0; i < hilo.length - 1; i++) {
    const a = hilo[i], b = hilo[i + 1];
    if (x >= +a.t && x <= +b.t) {
      const f = (x - a.t) / (b.t - a.t);
      const range = Math.min(1, Math.abs(b.v - a.v) / 2); // ~2 ft is a big swing in Tampa Bay
      return { flow: Math.sin(Math.PI * f) * (0.4 + 0.6 * range), dir: b.v > a.v ? 'rising' : 'falling', phase: f };
    }
  }
  return { flow: 0, dir: '' };
}
