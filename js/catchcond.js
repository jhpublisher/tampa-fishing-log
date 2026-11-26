// Conditions at the moment a fish was caught, plus the hours leading up to it.
// Tide (NOAA predictions), water temp (NOAA hourly readings), moon (SunCalc) and
// weather (Open-Meteo: free, no key; recent dates from the forecast API, older ones
// from its historical-forecast archive). Everything is best-effort: missing pieces are skipped.
import { getHiLo, heightAt, flowAt, nearestStation } from './tides.js';
import { moonInfo } from './solunar.js';

const H = 3600e3, DAY = 24 * H;
const ymd = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const compass = deg => deg == null ? '' : ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'][Math.round(deg / 45) % 8];
const SKY = c => c == null ? '' : c === 0 ? 'Clear' : c <= 2 ? 'Partly cloudy' : c === 3 ? 'Overcast' : c <= 48 ? 'Fog'
  : c <= 57 ? 'Drizzle' : c <= 67 ? 'Rain' : c <= 77 ? 'Snow' : c <= 82 ? 'Showers' : 'Thunderstorms';
const hm = d => d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
const dur = ms => { const m = Math.round(Math.abs(ms) / 60e3); return m < 60 ? `${m} min` : `${Math.floor(m / 60)}h${m % 60 ? ' ' + (m % 60) + 'm' : ''}`; };

const wxCache = new Map();
async function weather(lat, lng, when) {
  const start = new Date(+when - DAY), end = new Date(+when + H);
  const old = Date.now() - +when > 85 * DAY;
  const host = old ? 'https://historical-forecast-api.open-meteo.com' : 'https://api.open-meteo.com';
  const url = `${host}/v1/forecast?latitude=${lat.toFixed(3)}&longitude=${lng.toFixed(3)}` +
    '&hourly=temperature_2m,pressure_msl,wind_speed_10m,wind_direction_10m,wind_gusts_10m,cloud_cover,precipitation,weather_code' +
    '&temperature_unit=fahrenheit&wind_speed_unit=mph&precipitation_unit=inch&timezone=America%2FNew_York' +
    `&start_date=${ymd(start)}&end_date=${ymd(end)}`;
  if (!wxCache.has(url)) wxCache.set(url, fetch(url).then(r => r.json()).catch(() => null));
  const j = await wxCache.get(url);
  if (!j?.hourly?.time) return null;
  const h = j.hourly, times = h.time.map(t => new Date(t));
  const idx = t => { let best = -1, bd = Infinity; times.forEach((x, i) => { const d = Math.abs(x - t); if (d < bd) { bd = d; best = i; } }); return bd <= H ? best : -1; };
  const i = idx(when); if (i < 0) return null;
  const at = k => h[k]?.[i] ?? null;
  const back = n => (i - n >= 0 ? i - n : null);
  const p3 = back(3) != null ? h.pressure_msl[back(3)] : null;
  const dp = at('pressure_msl') != null && p3 != null ? at('pressure_msl') - p3 : null;
  const range = (k, n) => h[k].slice(Math.max(0, i - n), i + 1).filter(v => v != null);
  const wind6 = range('wind_speed_10m', 6), rain24 = range('precipitation', 24);
  const t6 = back(6) != null ? h.temperature_2m[back(6)] : null;
  return {
    airF: at('temperature_2m'), windMph: at('wind_speed_10m'), windDir: compass(at('wind_direction_10m')),
    gustMph: at('wind_gusts_10m'), cloud: at('cloud_cover'), sky: SKY(at('weather_code')),
    pressure: at('pressure_msl'), pressure3hChange: dp,
    pressureTrend: dp == null ? '' : dp >= 1 ? 'rising' : dp <= -1 ? 'falling' : 'steady',
    windAvg6h: wind6.length ? wind6.reduce((a, b) => a + b, 0) / wind6.length : null,
    windMax6h: wind6.length ? Math.max(...wind6) : null,
    air6hChange: t6 != null && at('temperature_2m') != null ? at('temperature_2m') - t6 : null,
    rain24h: rain24.length ? rain24.reduce((a, b) => a + b, 0) : null,
  };
}

async function waterTempAt(stationId, when) {
  const d = ymd(when).replace(/-/g, '');
  try {
    const j = await fetch(`https://api.tidesandcurrents.noaa.gov/api/prod/datagetter?product=water_temperature&application=tampa_fishing_log&begin_date=${d}&end_date=${d}&station=${stationId}&units=english&time_zone=lst_ldt&interval=h&format=json`).then(r => r.json());
    let best = null, bd = Infinity;
    for (const x of j.data || []) { const t = new Date(x.t.replace(' ', 'T')), v = +x.v; if (Number.isFinite(v) && Math.abs(t - when) < bd) { bd = Math.abs(t - when); best = v; } }
    return bd <= 3 * H ? best : null;
  } catch { return null; }
}
// NOAA stations around the bay that report water temperature.
const WT = [['8726724', 27.978, -82.832], ['8726667', 27.913, -82.425], ['8726607', 27.858, -82.553], ['8726520', 27.761, -82.627], ['8726384', 27.638, -82.563]];
const nearestWT = (lat, lng) => WT.map(([id, a, b]) => ({ id, d: (a - lat) ** 2 + ((b - lng) * Math.cos(lat * Math.PI / 180)) ** 2 })).sort((x, y) => x.d - y.d);

async function tideAt(lat, lng, when) {
  const st = nearestStation(lat, lng);
  try {
    const hilo = await getHiLo(st.id, when, 1);
    const ft = heightAt(hilo, when); if (ft == null) return null;
    const f = flowAt(hilo, when);
    const prev = [...hilo].reverse().find(x => x.t <= when), next = hilo.find(x => x.t > when);
    const word = t => t.type === 'H' ? 'high' : 'low';
    const stage = f.flow < 0.25 ? `slack near ${prev && (!next || when - prev.t < next.t - when) ? word(prev) : next ? word(next) : 'turn'}`
      : f.dir === 'rising' ? 'incoming' : 'outgoing';
    return {
      station: st.name, stationId: st.id, ft: +ft.toFixed(2), dir: f.dir, flow: +f.flow.toFixed(2), stage,
      prev: prev && { type: word(prev), t: prev.t.toISOString(), ft: prev.v },
      next: next && { type: word(next), t: next.t.toISOString(), ft: next.v },
    };
  } catch { return null; }
}

// Returns a plain object (safe to store as JSON) with a short `text` summary.
export async function conditionsAt(lat, lng, when) {
  const [tide, wx, water] = await Promise.all([
    tideAt(lat, lng, when),
    when <= new Date(Date.now() + 6 * DAY) ? weather(lat, lng, when) : null,
    when <= new Date() ? (async () => { for (const s of nearestWT(lat, lng).slice(0, 2)) { const v = await waterTempAt(s.id, when); if (v != null) return v; } return null; })() : null,
  ]);
  const moon = moonInfo(when);
  const parts = [];
  if (tide) {
    const p = tide.prev, n = tide.next;
    parts.push(`Tide ${tide.stage}, ${tide.ft.toFixed(1)} ft` +
      (p ? ` (${dur(when - new Date(p.t))} after ${p.type}` : '') + (n ? `, ${n.type} at ${hm(new Date(n.t))})` : p ? ')' : ''));
  }
  if (wx) {
    const w = [];
    if (wx.airF != null) w.push(`${Math.round(wx.airF)}°F air`);
    if (wx.windMph != null) w.push(`wind ${wx.windDir} ${Math.round(wx.windMph)} mph` + (wx.gustMph != null && wx.gustMph - wx.windMph >= 5 ? ` (gusts ${Math.round(wx.gustMph)})` : ''));
    if (wx.sky) w.push(wx.sky.toLowerCase());
    parts.push(w.join(', '));
    if (wx.pressure != null) parts.push(`Pressure ${Math.round(wx.pressure)} hPa ${wx.pressureTrend}` + (wx.pressure3hChange != null ? ` (${wx.pressure3hChange > 0 ? '+' : ''}${wx.pressure3hChange.toFixed(1)} in 3h)` : ''));
    const before = [];
    if (wx.windAvg6h != null) before.push(`wind avg ${Math.round(wx.windAvg6h)} mph, max ${Math.round(wx.windMax6h)}`);
    if (wx.air6hChange != null && Math.abs(wx.air6hChange) >= 3) before.push(`air ${wx.air6hChange > 0 ? 'warmed' : 'cooled'} ${Math.abs(Math.round(wx.air6hChange))}°`);
    if (before.length) parts.push('Last 6h: ' + before.join(', '));
    if (wx.rain24h != null) parts.push(wx.rain24h >= 0.01 ? `Rain last 24h: ${wx.rain24h.toFixed(2)} in` : 'No rain last 24h');
  }
  if (water != null) parts.push(`Water ${Math.round(water)}°F`);
  parts.push(`${moon.icon} ${moon.name}`);
  return { at: when.toISOString(), lat, lng, tide, weather: wx, waterF: water, moon: { name: moon.name, phase: +moon.phase.toFixed(3), lit: +moon.fraction.toFixed(2) }, text: parts.join(' · ') };
}
