// Rule-based recommendations: which species to target at a spot and time, and where/when to fish for a species.
// Each species gets a 0-100 score from water temp, season, habitat, tide, light, solunar and wind,
// plus a bonus from your own catch log. Tune the PROFILES table to change the advice.
import { SPECIES, byId, isOpen } from './species.js';
import { SPOTS, km } from './spots.js';
import { flowAt } from './tides.js';
import { moonInfo, solunarDay } from './solunar.js';
import { nearby, redTideAt } from './sightings.js';

const H = 3600e3;

// temp: [ok low, ideal low, ideal high, ok high] in °F. peak: best months (1-12). good: decent months.
// habitat: tags from spots.js. cold: tags it moves to when water is under 64°F.
// light: 'low' = dawn/dusk/night feeder. windMax: mph above which it gets hard (beaches, open water, boats).
export const PROFILES = {
  snook:      { temp: [64, 72, 85, 92], peak: [4, 5, 6, 7, 8, 9, 10], good: [3, 11], habitat: ['mangroves', 'docks', 'bridges', 'pass', 'beach', 'pier'], cold: ['river', 'warm', 'docks'], light: 'low', tide: 'Outgoing tide around passes and bridges' },
  redfish:    { temp: [56, 65, 80, 88], peak: [8, 9, 10, 11], good: [3, 4, 5, 6, 7, 12], habitat: ['flats', 'mangroves', 'oysters', 'docks'], cold: ['river', 'docks', 'warm'], light: 'low', tide: 'Higher tide pushes them into the mangroves' },
  trout:      { temp: [52, 60, 78, 86], peak: [10, 11, 12, 1, 2, 3, 4], good: [5, 9], habitat: ['flats', 'oysters'], cold: ['river', 'docks', 'warm'], light: 'low', tide: 'Moving water over grass flats' },
  sheepshead: { temp: [50, 55, 70, 78], peak: [12, 1, 2, 3], good: [4, 11], habitat: ['docks', 'bridges', 'pier', 'oysters'], tide: 'Moving water around pilings' },
  mangrove:   { temp: [68, 75, 88, 92], peak: [6, 7, 8, 9, 10], good: [5, 11], habitat: ['docks', 'bridges', 'pier', 'pass', 'nearshore'], light: 'low', tide: 'Moving tide around structure' },
  flounder:   { temp: [52, 58, 75, 82], peak: [10, 11, 12, 3, 4], good: [1, 2, 5, 9], habitat: ['pass', 'docks', 'pier', 'beach', 'flats'], tide: 'Outgoing tide at passes and channel edges' },
  spanish:    { temp: [66, 70, 84, 88], peak: [3, 4, 5, 9, 10, 11], good: [6, 7, 8], habitat: ['bay', 'bridges', 'pier', 'pass', 'beach'], windMax: 15, tide: 'Clean, moving water' },
  king:       { temp: [68, 72, 82, 86], peak: [4, 5, 10, 11], good: [3, 6, 9], habitat: ['nearshore', 'pass', 'pier'], windMax: 15, boat: true, tide: 'Moving water at passes and the Skyway' },
  cobia:      { temp: [64, 68, 80, 86], peak: [3, 4, 5, 10, 11], good: [6, 9], habitat: ['nearshore', 'flats', 'bridges', 'pier'], windMax: 15, tide: 'Look around markers and rays' },
  pompano:    { temp: [62, 68, 80, 84], peak: [3, 4, 5, 10, 11, 12], good: [2, 9], habitat: ['beach', 'pass', 'flats'], windMax: 15, tide: 'Moving tide in the surf and pass edges' },
  redgrouper: { temp: [56, 62, 78, 85], peak: [10, 11, 12, 1, 2, 3], good: [4, 5, 9], habitat: ['nearshore'], windMax: 15, boat: true },
  gag:        { temp: [55, 60, 75, 82], peak: [10, 11, 12], good: [1, 9], habitat: ['nearshore', 'bridges'], windMax: 15, boat: true },
  hogfish:    { temp: [62, 66, 80, 86], peak: [5, 6, 7, 8, 9], good: [4, 10], habitat: ['nearshore'], windMax: 15, boat: true },
  tarpon:     { temp: [74, 78, 88, 92], peak: [5, 6, 7], good: [4, 8, 9], habitat: ['pass', 'bridges', 'beach', 'river'], light: 'low', tide: 'Outgoing tide at passes and bridges' },
  jack:       { temp: [62, 70, 85, 92], peak: [4, 5, 9, 10], good: [3, 6, 7, 8, 11], habitat: ['bridges', 'pass', 'docks', 'bay', 'flats', 'warm'], tide: 'Moving water' },
  ladyfish:   { temp: [60, 68, 85, 92], peak: [4, 5, 9, 10], good: [3, 6, 7, 8, 11], habitat: ['flats', 'bridges', 'pass', 'beach', 'pier', 'bay'], light: 'low', tide: 'Moving water, often at night under lights' },
  blacktip:   { temp: [70, 75, 88, 92], peak: [4, 5, 6, 7, 8, 9], good: [3, 10], habitat: ['beach', 'pass', 'flats'], windMax: 18, tide: 'Moving tide along the beaches' },
};

export const TARGETS = SPECIES.filter(s => PROFILES[s.id]);

const ramp = (x, a, b) => Math.max(0, Math.min(1, (x - a) / (b - a)));
function tempFit([lo, il, ih, hi], t) {
  if (t >= il && t <= ih) return 0.88 + 0.12 * (1 - Math.abs(t - (il + ih) / 2) / ((ih - il) / 2 || 1));
  return t < il ? ramp(t, lo - 3, il) : 1 - ramp(t, ih, hi + 3);
}

// Context for one spot and time. tides: hilo array (or null). wind: {mph, dir} (or null). temp: °F.
// sightings: recent iNaturalist sightings (or null). redtide: FWC samples (or null).
export function makeContext(spot, t, { hilo, wind, temp, day, sightings, redtide }) {
  day = day || solunarDay(t, spot.lat, spot.lng);
  const flow = hilo ? flowAt(hilo, t) : null;
  const toLight = Math.min(Math.abs(t - day.sunrise), Math.abs(t - day.sunset)) / H;
  const night = t < day.sunrise || t > day.sunset;
  const sol = day.periods.find(p => Math.abs(t - p.center) <= (p.kind === 'major' ? 1 : 0.5) * H);
  const rt = redtide ? redTideAt(redtide, spot.lat, spot.lng) : null;
  return { spot, t, temp, wind, flow, toLight, night, sol, moon: moonInfo(t), sightings, redtide: rt };
}

// History: catches from your trips, each {species, lat, lng, date}.
export function catchHistory(trips) {
  return (trips || []).flatMap(tr => (tr.catches || []).map(c => ({
    species: c.species, lat: tr.lat, lng: tr.lng, date: new Date(`${tr.date}T12:00`), temp: tr.waterTemp ?? null,
  }))).filter(c => c.species);
}

export function scoreSpecies(id, ctx, history = []) {
  const p = PROFILES[id], sp = byId(id), why = [];
  const cold = ctx.temp < 64;
  const m = ctx.t.getMonth() + 1;

  // water temp: 30
  const tf = tempFit(p.temp, ctx.temp);
  let s = 30 * tf;
  if (tf >= 0.88) why.push(`${Math.round(ctx.temp)}°F water is ideal`);
  else if (tf < 0.3) why.push(`${Math.round(ctx.temp)}°F water is ${ctx.temp < p.temp[1] ? 'too cold' : 'too warm'}`);

  // season: 20
  if (p.peak.includes(m)) { s += 20; why.push('peak season'); }
  else if (p.good.includes(m)) s += 12;
  else s += 4;

  // habitat: 25
  const tags = ctx.spot.tags;
  const coldHit = cold && p.cold?.some(x => tags.includes(x));
  // habitats are listed best first, so earlier matches count more
  const hit = p.habitat.filter(x => tags.includes(x));
  const fit = hit.length ? 1 - 0.1 * p.habitat.indexOf(hit[0]) + 0.05 * Math.min(2, hit.length - 1) : 0;
  if (coldHit) { s += 25; why.push('winter hangout'); }
  else if (hit.length) { s += (cold && p.cold ? 14 : 25) * Math.min(1, fit); why.push(hit.slice(0, 2).join(' and ')); }
  else if (cold && p.cold) s += 0;
  if (p.boat && !ctx.spot.boat && !tags.includes('pass') && !tags.includes('pier')) s -= 10;

  // tide: 10
  if (ctx.flow) {
    s += 10 * Math.min(1, ctx.flow.flow / 0.7);
    if (ctx.flow.flow > 0.5) why.push(`${ctx.flow.dir} tide moving`);
    else if (ctx.flow.flow < 0.15) why.push('slack tide');
  } else s += 5;

  // light and solunar: 10
  if (p.light === 'low') s += ctx.toLight <= 1.5 || ctx.night ? 7 : 2;
  else s += ctx.toLight <= 1.5 ? 6 : 4;
  if (ctx.toLight <= 1.5) why.push(ctx.night ? 'low light' : 'dawn/dusk bite');
  if (ctx.sol) { s += 3; why.push(`solunar ${ctx.sol.kind}`); }

  // wind: 5
  if (ctx.wind) {
    const lim = p.windMax ?? 22;
    if (ctx.wind.mph <= lim) s += 5;
    else { s -= Math.min(15, (ctx.wind.mph - lim) * 1.5); why.push(`${ctx.wind.mph} mph wind`); }
  } else s += 3;

  // your catch log: up to +15
  const mine = history.filter(c => c.species === id);
  const here = mine.filter(c => c.lat != null && km(c.lat, c.lng, ctx.spot.lat, ctx.spot.lng) < 3).length;
  const season = mine.filter(c => Math.min(Math.abs(c.date.getMonth() + 1 - m), 12 - Math.abs(c.date.getMonth() + 1 - m)) <= 1).length;
  const bonus = Math.min(10, here * 4) + Math.min(5, season * 1.5);
  if (bonus) { s += bonus; why.push(here ? `you've caught ${here} here` : `you catch them this time of year`); }

  // recent public sightings near this spot (iNaturalist): up to +8
  if (ctx.sightings) {
    const n = nearby(ctx.sightings, id, ctx.spot.lat, ctx.spot.lng).length;
    if (n) { s += Math.min(8, 3 + n * 2); why.push(`${n} spotted nearby lately`); }
  }

  // red tide near this spot (FWC samples): medium or high kills the bite
  if (ctx.redtide?.level >= 3) { s -= 25; why.push(`${ctx.redtide.label} red tide nearby`); }
  else if (ctx.redtide?.level === 2) { s -= 10; why.push('low red tide nearby'); }

  const score = Math.max(0, Math.min(100, Math.round(s)));
  const closed = !sp.cr && !isOpen(sp, ctx.t);
  return { id, name: sp.name, score, why, closed, cr: !!sp.cr, tip: p.tide };
}

// Feature 1: best species for a spot and time.
export function rankSpecies(ctx, history) {
  return TARGETS.map(s => scoreSpecies(s.id, ctx, history)).sort((a, b) => b.score - a.score);
}

// Feature 2: best spot and 2-hour windows for one species over the next `days` days.
// getInputs(spot) -> {hilo, temp(date)}; wind: NWS periods.
export function findWindows(id, start, days, inputs, wind, history, extra = {}, pick = 5) {
  const all = [];
  for (const spot of SPOTS) {
    const inp = inputs.get(spot.id);
    if (!inp) continue; // e.g. OpenStreetMap extras
    for (let d = 0; d < days; d++) {
      const d0 = new Date(start); d0.setHours(0, 0, 0, 0); d0.setDate(d0.getDate() + d);
      const day = solunarDay(d0, spot.lat, spot.lng);
      const temp = inp.temp(d0);
      for (let h = 5; h <= 20; h++) {
        const t = new Date(+d0 + (h + 1) * H); // middle of a 2-hour window starting at h
        if (t < start) continue;
        const w = wind.find(p => t >= p.start && t < p.end) || null;
        const r = scoreSpecies(id, makeContext(spot, t, { hilo: inp.hilo, wind: w, temp, day, ...extra }), history);
        all.push({ ...r, spot, start: new Date(+d0 + h * H), end: new Date(+d0 + (h + 2) * H), wind: w });
      }
    }
  }
  all.sort((a, b) => b.score - a.score || a.start - b.start);
  // best window at each spot, plus that spot's best window on a different day as a backup
  const out = [];
  for (const r of all) {
    if (out.length === pick) break;
    if (out.some(o => o.spot.id === r.spot.id)) continue;
    r.backup = all.find(o => o.spot.id === r.spot.id && o.start.toDateString() !== r.start.toDateString()) || null;
    out.push(r);
  }
  return out;
}
