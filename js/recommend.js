// Rule-based recommendations: which species to target at a spot and time, and where/when to fish for a species.
// Each species gets a 0-100 score. 70% of it is a model guess (water temp, season, habitat, tide, light,
// solunar, wind); the rest is real evidence, weighted most to least: your own catches here, local fishing
// reports that name this area, then iNaturalist sightings. Tune PROFILES and EVIDENCE to change the advice.
import { SPECIES, byId, isOpen, daysToClose } from './species.js';
import { windLimit } from './conditions.js';
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
  blackdrum:  { temp: [52, 58, 75, 84], peak: [12, 1, 2, 3], good: [4, 11], habitat: ['bridges', 'docks', 'oysters', 'pier', 'pass'], cold: ['river', 'docks', 'warm'], tide: 'Moving tide around pilings and oyster bars' },
  spanish:    { temp: [66, 70, 84, 88], peak: [3, 4, 5, 9, 10, 11], good: [6, 7, 8], habitat: ['bay', 'bridges', 'pier', 'pass', 'beach'], windMax: 15, tide: 'Clean, moving water' },
  king:       { temp: [68, 72, 82, 86], peak: [4, 5, 10, 11], good: [3, 6, 9], habitat: ['nearshore', 'pass', 'pier'], windMax: 15, boat: true, tide: 'Moving water at passes and the Skyway' },
  cobia:      { temp: [64, 68, 80, 86], peak: [3, 4, 5, 10, 11], good: [6, 9], habitat: ['nearshore', 'flats', 'bridges', 'pier'], windMax: 15, tide: 'Look around markers and rays' },
  pompano:    { temp: [62, 68, 80, 84], peak: [3, 4, 5, 10, 11, 12], good: [2, 9], habitat: ['beach', 'pass', 'flats'], windMax: 15, tide: 'Moving tide in the surf and pass edges' },
  tripletail: { temp: [66, 72, 85, 90], peak: [5, 6, 7, 8, 9, 10], good: [4, 11], habitat: ['nearshore', 'bay', 'pass'], windMax: 15, boat: true, tide: 'Look under crab-trap buoys and channel markers' },
  redgrouper: { temp: [56, 62, 78, 85], peak: [10, 11, 12, 1, 2, 3], good: [4, 5, 9], habitat: ['nearshore'], windMax: 15, boat: true },
  gag:        { temp: [55, 60, 75, 82], peak: [10, 11, 12], good: [1, 9], habitat: ['nearshore', 'bridges'], windMax: 15, boat: true },
  hogfish:    { temp: [62, 66, 80, 86], peak: [5, 6, 7, 8, 9], good: [4, 10], habitat: ['nearshore'], windMax: 15, boat: true },
  tarpon:     { temp: [74, 78, 88, 92], peak: [5, 6, 7], good: [4, 8, 9], habitat: ['pass', 'bridges', 'beach', 'river'], light: 'low', tide: 'Outgoing tide at passes and bridges' },
  jack:       { temp: [62, 70, 85, 92], peak: [4, 5, 9, 10], good: [3, 6, 7, 8, 11], habitat: ['bridges', 'pass', 'docks', 'bay', 'flats', 'warm'], tide: 'Moving water' },
  ladyfish:   { temp: [60, 68, 85, 92], peak: [4, 5, 9, 10], good: [3, 6, 7, 8, 11], habitat: ['flats', 'bridges', 'pass', 'beach', 'pier', 'bay'], light: 'low', tide: 'Moving water, often at night under lights' },
  blacktip:   { temp: [70, 75, 88, 92], peak: [4, 5, 6, 7, 8, 9], good: [3, 10], habitat: ['beach', 'pass', 'flats'], windMax: 18, tide: 'Moving tide along the beaches' },
};

// Where a species really lives around Tampa Bay. If a spot has none of these, the fish is rare there
// no matter how good the season is (pompano in a back-bay canal, kingfish off a seawall).
const NEEDS = {
  pompano: ['beach', 'pass'], blacktip: ['beach', 'pass', 'nearshore'], king: ['nearshore', 'pass', 'pier'],
  redgrouper: ['nearshore'], gag: ['nearshore', 'bridges'], hogfish: ['nearshore'], tripletail: ['nearshore', 'bay', 'pass'],
  spanish: ['bay', 'pass', 'pier', 'bridges', 'beach', 'nearshore'], cobia: ['nearshore', 'bay', 'bridges', 'pier', 'pass'],
};
const WATER = { beach: 'Gulf beaches', pass: 'passes', nearshore: 'Gulf reefs', pier: 'piers', bridges: 'bridges', bay: 'open bay' };
export const TARGETS = SPECIES.filter(s => PROFILES[s.id]);
// The model part is scaled to 70 at most. Evidence adds up to these, so real catches and reports win.
const MODEL_WEIGHT = 0.7;
const EVIDENCE = { mine: 35, reports: 25, sightings: 15 };

const ramp = (x, a, b) => Math.max(0, Math.min(1, (x - a) / (b - a)));
function tempFit([lo, il, ih, hi], t) {
  if (t >= il && t <= ih) return 0.88 + 0.12 * (1 - Math.abs(t - (il + ih) / 2) / ((ih - il) / 2 || 1));
  return t < il ? ramp(t, lo - 3, il) : 1 - ramp(t, ih, hi + 3);
}

// Context for one spot and time. tides: hilo array (or null). wind: {mph, dir} (or null). temp: °F.
// sightings: recent iNaturalist sightings (or null). redtide: FWC samples (or null).
// Wind you'd actually feel at a spot: open water and Gulf-facing spots get it all (more in a west wind),
// mangrove creeks, rivers and docks are partly sheltered.
export function feltWind(spot, w) {
  if (!w) return null;
  const t = spot.tags || [];
  const open = spot.boat || ['pass', 'beach', 'nearshore', 'bay'].some(x => t.includes(x));
  const tucked = !open && ['river', 'mangroves', 'docks'].some(x => t.includes(x));
  let f = open ? 1 : tucked ? 0.6 : 0.85;
  if (spot.lng < -82.72 && w.deg >= 200 && w.deg <= 340) f *= 1.15; // onshore wind on the Gulf side
  return Math.round(w.mph * f);
}

export function makeContext(spot, t, { hilo, wind, temp, day, sightings, redtide, reports }) {
  day = day || solunarDay(t, spot.lat, spot.lng);
  const flow = hilo ? flowAt(hilo, t) : null;
  const toLight = Math.min(Math.abs(t - day.sunrise), Math.abs(t - day.sunset)) / H;
  const night = t < day.sunrise || t > day.sunset;
  const sol = day.periods.find(p => Math.abs(t - p.center) <= (p.kind === 'major' ? 1 : 0.5) * H);
  const rt = redtide ? redTideAt(redtide, spot.lat, spot.lng) : null;
  return { spot, t, temp, wind, flow, toLight, night, sol, moon: moonInfo(t), sightings, redtide: rt, reports };
}

// History: catches from your trips, each {species, lat, lng, date}.
export function catchHistory(trips) {
  return (trips || []).flatMap(tr => (tr.catches || []).map(c => ({
    species: c.species, lat: tr.lat, lng: tr.lng, date: new Date(`${tr.date}T12:00`), temp: tr.waterTemp ?? null,
  }))).filter(c => c.species);
}

export function scoreSpecies(id, ctx, history = []) {
  const p = PROFILES[id], sp = byId(id), why = [];
  const cold = ctx.temp < 64, frigid = ctx.temp < 60;
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
  if (coldHit && frigid && tags.includes('warm')) { s += 8; why.push('cold-stressed fish crowd warm water here, so go easy'); }
  else if (coldHit) { s += 25; why.push('winter hangout'); }
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

  // wind: 5, or a big penalty over the limit (yours, or lower for open-water species)
  let windy = false;
  if (ctx.wind) {
    const felt = feltWind(ctx.spot, ctx.wind), mine = windLimit(), lim = Math.min(p.windMax ?? 22, mine);
    const gusty = ctx.wind.gust ? ` (gusts ${ctx.wind.gust})` : '';
    if (felt <= lim) { s += felt <= lim - 5 ? 5 : 2; if (ctx.wind.mph > lim) why.push(`sheltered from the ${ctx.wind.mph} mph wind`); }
    else {
      windy = true;
      s -= Math.min(30, 10 + (felt - lim) * 2);
      why.push(`${ctx.wind.mph} mph ${ctx.wind.dir}${gusty}${felt > ctx.wind.mph ? ' blows straight in here' : ''}: ${lim === mine ? `over your ${mine} mph limit` : 'too rough for this fish'}`);
    }
  } else s += 3;

  // ---- real evidence, which counts for more than the model above ----
  s *= MODEL_WEIGHT;
  const ev = [], age = d => Math.max(0, Math.round((ctx.t - d) / 864e5)), ago = d => (n => n === 0 ? 'today' : n === 1 ? 'yesterday' : `${n} days ago`)(age(d));
  const fresh = d => { const n = age(d); return n <= 10 ? 1 : n <= 30 ? 0.6 : n <= 60 ? 0.3 : 0.1; };
  const { lat, lng } = ctx.spot;

  // 1. your own catches: the strongest evidence of all
  const mine = history.filter(c => c.species === id);
  const hereC = mine.filter(c => c.lat != null && km(c.lat, c.lng, lat, lng) < 3);
  const season = hereC.filter(c => Math.min(Math.abs(c.date.getMonth() + 1 - m), 12 - Math.abs(c.date.getMonth() + 1 - m)) <= 1).length;
  const bayC = mine.filter(c => Math.min(Math.abs(c.date.getMonth() + 1 - m), 12 - Math.abs(c.date.getMonth() + 1 - m)) <= 1).length;
  if (hereC.length) {
    s += Math.min(EVIDENCE.mine, 14 + hereC.length * 5 + season * 4);
    ev.push(`You've caught ${hereC.length} here${season ? `, ${season} this time of year` : ''}`);
  } else if (bayC) { s += Math.min(5, bayC * 1.5); ev.push(`You catch them this time of year`); }

  let local = false;
  // 2. local fishing reports (captains' reports and news) that name this area
  if (ctx.reports?.length) {
    const rs = ctx.reports.filter(r => r.species === id && ctx.t - r.date < 75 * 864e5 && r.date <= ctx.t);
    const close = rs.filter(r => r.lat != null && km(r.lat, r.lng, lat, lng) <= 10).sort((a, b) => b.date - a.date);
    const wide = rs.filter(r => r.lat == null).sort((a, b) => b.date - a.date);
    if (close.length) {
      local = true;
      const w = close.reduce((a, r) => a + fresh(r.date), 0);
      s += Math.min(EVIDENCE.reports, 8 + 10 * w);
      ev.push(`Reported at ${close[0].place} ${ago(close[0].date)} (${close[0].source.split(' ·')[0]})`);
    } else if (wide.length && hit.length) {
      s += Math.min(6, 3 * wide.reduce((a, r) => a + fresh(r.date), 0));
      ev.push(`In a Tampa Bay report ${ago(wide[0].date)}`);
    }
  }

  // 3. iNaturalist sightings within 5 km
  if (ctx.sightings) {
    const ns = nearby(ctx.sightings, id, lat, lng).sort((a, b) => b.date - a.date);
    if (ns.length) {
      local = true;
      s += Math.min(EVIDENCE.sightings, 4 + 4 * ns.reduce((a, r) => a + fresh(r.date), 0));
      ev.push(`${ns.length} spotted within 3 mi (iNaturalist), latest ${ago(ns[0].date)}`);
    }
  }
  const seen = hereC.length > 0 || local;

  // red tide near this spot (FWC samples): medium or high kills the bite
  if (ctx.redtide?.level >= 3) { s -= 25; why.push(`${ctx.redtide.label} red tide nearby`); }
  else if (ctx.redtide?.level === 2) { s -= 10; why.push('low red tide nearby'); }

  // cold-stress mode: under 60°F, tropical fish are struggling, so don't push them
  if (frigid && ['snook', 'tarpon'].includes(id)) { s -= 15; why.push('cold-stressed: release gently or leave them be'); }

  // rare in this kind of water: cut hard, unless people have actually seen or caught them right here
  const need = NEEDS[id];
  if (need && !need.some(t => tags.includes(t))) {
    if (!seen) { s *= 0.45; why.unshift(`rare here: mostly at ${need.slice(0, 2).map(t => WATER[t]).join(' and ')}`); }
  }
  const score = Math.max(0, Math.min(100, Math.round(s)));
  const closed = !sp.cr && !isOpen(sp, ctx.t);
  return { id, name: sp.name, score, why, evidence: ev, guess: !seen, closed, closing: closed ? null : daysToClose(sp, ctx.t), at: ctx.t, cr: !!sp.cr, windy, coldStress: frigid, tip: p.tide };
}

// Feature 1: best species for a spot and time.
export function rankSpecies(ctx, history) {
  // fish you can keep come first; closed species drop to the bottom whatever their score
  return TARGETS.map(s => scoreSpecies(s.id, ctx, history)).sort((a, b) => a.closed - b.closed || b.score - a.score);
}

// Feature 2: best spot and 2-hour windows for one species over the next `days` days.
// getInputs(spot) -> {hilo, temp(date)}; wind: NWS periods.
// hours: {from, to} = window start hours to consider (default 5am-8pm).
export function findWindows(id, start, days, inputs, wind, history, extra = {}, pick = 5, hours = { from: 5, to: 20 }) {
  const all = [];
  for (const spot of SPOTS) {
    const inp = inputs.get(spot.id);
    if (!inp) continue; // e.g. OpenStreetMap extras
    for (let d = 0; d < days; d++) {
      const d0 = new Date(start); d0.setHours(0, 0, 0, 0); d0.setDate(d0.getDate() + d);
      const day = solunarDay(d0, spot.lat, spot.lng);
      const temp = inp.temp(d0);
      for (let h = hours.from; h <= hours.to; h++) {
        const t = new Date(+d0 + (h + 1) * H); // middle of a 2-hour window starting at h
        if (t < start) continue;
        const w = (inp.wind || wind).find(p => t >= p.start && t < p.end) || null;
        const r = scoreSpecies(id, makeContext(spot, t, { hilo: inp.hilo, wind: w, temp, day, ...extra }), history);
        all.push({ ...r, spot, start: new Date(+d0 + h * H), end: new Date(+d0 + (h + 2) * H), wind: w });
      }
    }
  }
  all.sort((a, b) => a.closed - b.closed || b.score - a.score || a.start - b.start);
  // best window at each spot, plus that spot's best window on a different day as a backup.
  // First pass allows at most 2 picks in the same time slot, so the list offers real choices.
  const out = [];
  const take = maxSame => {
    for (const r of all) {
      if (out.length === pick) break;
      if (out.some(o => o.spot.id === r.spot.id)) continue;
      if (out.filter(o => +o.start === +r.start).length >= maxSame) continue;
      r.backup = all.find(o => o.spot.id === r.spot.id && o.start.toDateString() !== r.start.toDateString()) || null;
      out.push(r);
    }
  };
  take(2); take(Infinity);
  return out.sort((a, b) => a.closed - b.closed || b.score - a.score);
}
