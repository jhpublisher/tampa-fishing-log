// Moon phase, solunar periods and a simple "best time" score.
// Uses SunCalc (loaded globally from CDN).
import { flowAt } from './tides.js';

const SC = () => window.SunCalc;
const H = 3600e3;

export function moonInfo(date) {
  const ill = SC().getMoonIllumination(date);
  const p = ill.phase; // 0 new, .25 first qtr, .5 full, .75 last qtr
  const names = ['New moon', 'Waxing crescent', 'First quarter', 'Waxing gibbous',
    'Full moon', 'Waning gibbous', 'Last quarter', 'Waning crescent'];
  const icons = ['🌑', '🌒', '🌓', '🌔', '🌕', '🌖', '🌗', '🌘'];
  const i = Math.round(p * 8) % 8;
  return { phase: p, fraction: ill.fraction, name: names[i], icon: icons[i] };
}

// Solunar periods for the calendar day containing `date`.
// Majors (~2 h): moon overhead and underfoot. Minors (~1 h): moonrise and moonset.
export function solunarDay(date, lat, lng) {
  const d0 = new Date(date); d0.setHours(0, 0, 0, 0);
  // sample moon altitude every 5 min to find highest and lowest points
  let hi = { t: null, a: -Infinity }, lo = { t: null, a: Infinity };
  for (let m = 0; m <= 24 * 60; m += 5) {
    const t = new Date(+d0 + m * 60e3);
    const a = SC().getMoonPosition(t, lat, lng).altitude;
    if (a > hi.a) hi = { t, a };
    if (a < lo.a) lo = { t, a };
  }
  const mt = SC().getMoonTimes(d0, lat, lng);
  const majors = [hi.t, lo.t].filter(Boolean).map(t => ({ kind: 'major', label: +t === +hi.t ? 'Moon overhead' : 'Moon underfoot', start: new Date(+t - H), end: new Date(+t + H), center: t }));
  const minors = [['Moonrise', mt.rise], ['Moonset', mt.set]].filter(([, t]) => t)
    .map(([label, t]) => ({ kind: 'minor', label, start: new Date(+t - H / 2), end: new Date(+t + H / 2), center: t }));
  const sun = SC().getTimes(new Date(+d0 + 12 * H), lat, lng);
  return { periods: [...majors, ...minors].sort((a, b) => a.center - b.center), sunrise: sun.sunrise, sunset: sun.sunset };
}

// Score one moment 0..100.
export function scoreAt(t, day, moon, hilo) {
  let s = 0;
  for (const p of day.periods) {
    const dist = Math.abs(t - p.center) / H;
    if (p.kind === 'major') s = Math.max(s, dist <= 1 ? 35 : dist <= 1.5 ? 20 : 0);
    else s = Math.max(s, dist <= 0.5 ? 20 : dist <= 1 ? 10 : 0);
  }
  if (hilo) s += 35 * flowAt(hilo, t).flow;
  const ld = Math.min(Math.abs(t - day.sunrise), Math.abs(t - day.sunset)) / H;
  s += ld <= 1 ? 15 : ld <= 2 ? 7 : 0;
  s += 15 * Math.abs(moon.fraction - 0.5) * 2; // new & full moons score higher
  return Math.min(100, Math.round(s));
}

// 7-day forecast: each day gets an overall score and its two best 2-hour windows.
// from/to: only consider windows starting between these hours (default: all day).
export function forecast(start, days, lat, lng, hilo, { from = 0, to = 24 } = {}) {
  const out = [];
  for (let i = 0; i < days; i++) {
    const d = new Date(start); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() + i);
    const day = solunarDay(d, lat, lng);
    const moon = moonInfo(new Date(+d + 12 * H));
    const hours = [];
    for (let h = from; h < Math.min(24, to + 2); h += 0.5) {
      const t = new Date(+d + h * H);
      hours.push({ t, s: scoreAt(t, day, moon, hilo) });
    }
    // 2-hour rolling windows
    const win = hours.slice(0, -3).map((x, k) => ({ start: x.t, s: (hours[k].s + hours[k + 1].s + hours[k + 2].s + hours[k + 3].s) / 4 }));
    win.sort((a, b) => b.s - a.s);
    const best = [];
    for (const w of win) {
      if (best.length === 2) break;
      if (best.every(b => Math.abs(b.start - w.start) >= 3 * H)) best.push(w);
    }
    const score = Math.round(best.reduce((a, b) => a + b.s, 0) / (best.length || 1));
    out.push({ date: d, score, best: best.sort((a, b) => a.start - b.start), moon, day });
  }
  return out;
}
