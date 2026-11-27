// Water temperature (NOAA) and wind forecast (National Weather Service). Both free, no key.
import { km } from './spots.js';

const H = 3600e3, DAY = 24 * H;

// NOAA stations around Tampa Bay that report water temperature.
const WT_STATIONS = [
  { id: '8726724', lat: 27.978, lng: -82.832 }, // Clearwater Beach
  { id: '8726667', lat: 27.913, lng: -82.425 }, // McKay Bay Entrance
  { id: '8726607', lat: 27.858, lng: -82.553 }, // Old Port Tampa
  { id: '8726520', lat: 27.761, lng: -82.627 }, // St. Petersburg
  { id: '8726384', lat: 27.638, lng: -82.563 }, // Port Manatee
];

// Typical Tampa Bay water temp (°F) by month, mid-month.
const CLIMO = [61, 63, 68, 74, 80, 85, 87, 87, 85, 79, 70, 64];
export function typicalTemp(date) {
  const m = date.getMonth(), f = (date.getDate() - 15) / 30;
  const other = CLIMO[(m + (f >= 0 ? 1 : 11)) % 12];
  return CLIMO[m] + (other - CLIMO[m]) * Math.abs(f);
}

const API = 'https://api.tidesandcurrents.noaa.gov/api/prod/datagetter';
const ymd = d => `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
const latest = new Map();

function byDistance(lat, lng) {
  return [...WT_STATIONS].sort((a, b) => km(lat, lng, a.lat, a.lng) - km(lat, lng, b.lat, b.lng));
}

// Latest reading near a point. Tries the nearest stations in order. Returns {temp, t, station} or null.
export async function latestWaterTemp(lat, lng) {
  for (const s of byDistance(lat, lng).slice(0, 3)) {
    if (latest.has(s.id)) { const v = await latest.get(s.id); if (v) return v; continue; }
    const p = fetch(`${API}?product=water_temperature&application=tampa_fishing_log&date=latest&station=${s.id}&units=english&time_zone=lst_ldt&format=json`)
      .then(r => r.json()).then(j => {
        const d = j.data?.[0]; const v = d ? +d.v : NaN;
        return Number.isFinite(v) ? { temp: v, t: new Date(d.t.replace(' ', 'T')), station: s.id } : null;
      }).catch(() => null);
    latest.set(s.id, p);
    const v = await p; if (v) return v;
  }
  return null;
}

// Average water temp on a past day near a point (for logging trips). null if unavailable.
export async function pastWaterTemp(lat, lng, date) {
  const s = byDistance(lat, lng)[0];
  try {
    const r = await fetch(`${API}?product=water_temperature&application=tampa_fishing_log&begin_date=${ymd(date)}&end_date=${ymd(date)}&station=${s.id}&units=english&time_zone=lst_ldt&format=json`);
    const vals = ((await r.json()).data || []).map(d => +d.v).filter(Number.isFinite);
    return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null;
  } catch { return null; }
}

// Best guess of water temp at `date`. Uses the live reading, fading toward the typical
// temp for that date the further out you look. Returns {temp, source}.
export async function estimateWaterTemp(lat, lng, date) {
  const now = new Date();
  const live = await latestWaterTemp(lat, lng);
  if (!live) return { temp: typicalTemp(date), source: 'typical for the date' };
  const days = Math.max(0, (date - now) / DAY);
  const age = (now - live.t) / 3600e3;
  if (days < 1 && date > now - DAY) return { temp: live.temp, source: age > 3 ? `NOAA reading, ${Math.round(age)} h old` : 'live NOAA reading' };
  const anomaly = live.temp - typicalTemp(now);
  return { temp: typicalTemp(date) + anomaly * Math.exp(-days / 10), source: days > 14 ? 'typical for the date' : 'NOAA reading, projected' };
}

// ---------- wind (NWS hourly forecast, about 7 days out) ----------
let windCache = null;
const DIRS = { N: 0, NNE: 22, NE: 45, ENE: 67, E: 90, ESE: 112, SE: 135, SSE: 157, S: 180, SSW: 202, SW: 225, WSW: 247, W: 270, WNW: 292, NW: 315, NNW: 337 };

// Returns [{start, end, mph, dir, sky}] for the bay, or [] if the forecast can't be loaded.
export function windForecast() {
  if (windCache) return windCache;
  windCache = (async () => {
    try {
      const pt = await (await fetch('https://api.weather.gov/points/27.77,-82.63', { headers: { Accept: 'application/geo+json' } })).json();
      const fc = await (await fetch(pt.properties.forecastHourly, { headers: { Accept: 'application/geo+json' } })).json();
      return fc.properties.periods.map(p => ({
        start: new Date(p.startTime), end: new Date(p.endTime),
        mph: Math.max(...String(p.windSpeed).match(/\d+/g).map(Number)),
        dir: p.windDirection, deg: DIRS[p.windDirection] ?? null, sky: p.shortForecast,
      }));
    } catch { windCache = null; return []; }
  })();
  return windCache;
}

// ---------- wind at each spot (Open-Meteo hourly, 7 days, with gusts) ----------
// Cached per ~11 km grid cell. Each value is [{start, end, mph, gust, deg, dir}] or null if it couldn't load.
const cellWind = new Map();
const cellKey = (lat, lng) => `${(Math.round(lat * 10) / 10).toFixed(1)},${(Math.round(lng * 10) / 10).toFixed(1)}`;
const compass = d => Object.keys(DIRS)[Math.round((((d % 360) + 360) % 360) / 22.5) % 16];
function parseCell(j) {
  const h = j?.hourly; if (!h?.time) return null;
  return h.time.map((t, i) => ({
    start: new Date(t * 1000), end: new Date((t + 3600) * 1000),
    mph: Math.round(h.wind_speed_10m[i]), gust: Math.round(h.wind_gusts_10m[i]),
    deg: h.wind_direction_10m[i], dir: compass(h.wind_direction_10m[i]),
  }));
}
// points: [[lat, lng], ...] -> Map(cellKey -> hourly wind or null). One request per 50 new cells.
export async function windCells(points) {
  const keys = [...new Set(points.map(([a, b]) => cellKey(a, b)))];
  const fresh = keys.filter(k => !cellWind.has(k));
  for (let i = 0; i < fresh.length; i += 50) {
    const chunk = fresh.slice(i, i + 50);
    const q = `latitude=${chunk.map(k => k.split(',')[0]).join(',')}&longitude=${chunk.map(k => k.split(',')[1]).join(',')}`;
    const all = fetch(`https://api.open-meteo.com/v1/forecast?${q}&hourly=wind_speed_10m,wind_direction_10m,wind_gusts_10m&wind_speed_unit=mph&forecast_days=7&timeformat=unixtime`)
      .then(r => r.json()).then(j => (Array.isArray(j) ? j : [j]).map(parseCell))
      .catch(() => { chunk.forEach(k => cellWind.delete(k)); return null; }); // try again next time
    chunk.forEach((k, n) => cellWind.set(k, all.then(a => a?.[n] ?? null)));
  }
  return new Map(await Promise.all(keys.map(async k => [k, await cellWind.get(k)])));
}
export const windCellAt = (cells, lat, lng) => cells?.get(cellKey(lat, lng)) || null;
export async function spotWind(lat, lng) { return windCellAt(await windCells([[lat, lng]]), lat, lng); }

// Your own wind limit in mph (kept on this phone). Above it, spots and days get marked down.
export const WIND_LIMIT_DEFAULT = 20;
export function windLimit() {
  try { const v = +localStorage.getItem('windLimit'); return v >= 5 && v <= 40 ? v : WIND_LIMIT_DEFAULT; } catch { return WIND_LIMIT_DEFAULT; }
}
export function setWindLimit(v) {
  try { localStorage.setItem('windLimit', String(v)); } catch { }
  document.dispatchEvent(new Event('wind-limit'));
}

export function windAt(periods, t) {
  return periods.find(p => t >= p.start && t < p.end) || null;
}
