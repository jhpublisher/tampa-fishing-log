// Card collection: every Florida saltwater fish in the app as a card. Fish James has logged
// show his own photo and stats; the rest are dark "?" cards. Tap a card to flip it open.
// Everything is worked out from the trips already saved, so there is nothing extra to enter.
import { SPECIES, byId } from './species.js';
import { FISH, fishById } from './fishlist.js';
import { GUIDE } from './guide.js';
import * as store from './store.js';
import * as outbox from './outbox.js';

const $ = (s, el = document) => el.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const fmtDate = d => d ? new Date(d + 'T12:00').toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' }) : '';
const TIERS = ['Common', 'Uncommon', 'Rare', 'Trophy'];

// How hard each fish is to come by around Tampa Bay (a judgment call, not data).
const GUIDE_TIER = {
  trout: 0, sheepshead: 0, mangrove: 0, jack: 0, ladyfish: 0, spanish: 0,
  redfish: 1, blackdrum: 1, flounder: 1, pompano: 1,
  snook: 2, cobia: 2, king: 2, tripletail: 2, hogfish: 2, redgrouper: 2, gag: 2, blacktip: 2,
  tarpon: 3,
};
const GROUP_TIER = {
  'Bait': 0, 'Drums & croakers': 0, 'Other inshore': 0, 'Porgies & grunts': 1, 'Jacks & pompano': 1,
  'Snappers': 1, 'Flatfish': 1, 'Mackerels & tunas': 1, 'Snook & tarpon': 2, 'Groupers & sea basses': 2,
  'Triggerfish & filefish': 2, 'Reef & deep water': 2, 'Eels': 2, 'Rays': 2, 'Sharks': 2, 'Billfish & offshore': 3,
};
const TIER_OVERRIDE = { 'goliath-grouper': 3, 'permit': 3, 'bonefish': 3, 'greater-amberjack': 2, 'manta': 3 };

// Grading: [typical keeper, trophy] length in inches. Rough Tampa Bay numbers, a judgment call.
const SIZE = {
  snook: [26, 40], redfish: [24, 40], trout: [17, 26], sheepshead: [14, 22], mangrove: [12, 20], flounder: [15, 24],
  blackdrum: [18, 40], spanish: [17, 26], king: [32, 50], cobia: [38, 55], pompano: [13, 18], tripletail: [18, 28],
  redgrouper: [22, 32], gag: [26, 40], hogfish: [16, 26], tarpon: [50, 80], jack: [20, 36], ladyfish: [16, 26], blacktip: [48, 72],
  'goliath-grouper': [50, 90], permit: [20, 36], 'greater-amberjack': [34, 50], bonefish: [18, 28], 'red-snapper': [20, 32],
};
const GROUP_SIZE = {
  'Bait': [6, 12], 'Drums & croakers': [12, 20], 'Other inshore': [14, 26], 'Porgies & grunts': [12, 20], 'Jacks & pompano': [18, 36],
  'Snappers': [14, 26], 'Flatfish': [14, 24], 'Mackerels & tunas': [24, 45], 'Snook & tarpon': [20, 30], 'Groupers & sea basses': [22, 40],
  'Triggerfish & filefish': [14, 22], 'Reef & deep water': [16, 30], 'Eels': [24, 48], 'Rays': [24, 60], 'Sharks': [40, 84], 'Billfish & offshore': [50, 90],
};
const GRADE_NAME = ['', 'Bait', 'Tiny', 'Small', 'Fair', 'Decent', 'Keeper', 'Solid', 'Bruiser', 'Monster', 'Legend'];
// Up to typical length climbs 1 to 5, then typical to trophy climbs 5 to 10.
export function grade(len, size) {
  if (!len || !size) return null;
  const [t, x] = size;
  const g = len <= t ? 1 + 4 * Math.max(0, (len - 0.4 * t) / (0.6 * t)) : 5 + 5 * (len - t) / (x - t);
  return Math.max(1, Math.min(10, Math.round(g)));
}
const sizeOf = c => SIZE[c.key] || GROUP_SIZE[c.group] || [16, 30];
const gradeOf = (c, s) => grade(s?.len, sizeOf(c));
const slab = (g, small) => g ? `<span class="cc-grade${small ? ' sm' : ''} g${g}"><b>${g}</b>${small ? '' : `<small>${GRADE_NAME[g]}</small>`}</span>` : '';

// Fish shapes for the "?" cards: [body height, forked tail]
const SHAPE = {
  snook: [24], redfish: [28], trout: [24], sheepshead: [36], mangrove: [30], flounder: [34], blackdrum: [36],
  spanish: [19, 1], king: [18, 1], cobia: [22], pompano: [36, 1], tripletail: [34], redgrouper: [32],
  gag: [30], hogfish: [34], tarpon: [28, 1], jack: [31, 1], ladyfish: [16, 1], blacktip: [20, 1],
};
const GROUP_SHAPE = { 'Mackerels & tunas': [22, 1], 'Billfish & offshore': [22, 1], 'Jacks & pompano': [30, 1], 'Sharks': [20, 1], 'Eels': [10], 'Bait': [18, 1], 'Flatfish': [34] };

// Dark fish outline with a "?" on it, drawn fresh so it works for every fish.
function silhouette(shape = [26]) {
  const [h, fork] = shape, cx = 100, cy = 62, rx = 58, hx = cx + rx, tx = cx - rx + 18;
  const body = `M${cx - rx + 4},${cy} C${cx - rx + 14},${cy - h - 2} ${hx - 22},${cy - h - 4} ${hx},${cy - 4} C${hx + 4},${cy + 2} ${hx - 4},${cy + h * 0.9} ${cx},${cy + h} C${cx - 30},${cy + h} ${cx - rx + 8},${cy + 10} ${cx - rx + 4},${cy}Z`;
  const tail = fork ? `M${tx},${cy - 7} L${tx - 42},${cy - h - 8} Q${tx - 28},${cy} ${tx - 42},${cy + h + 8} L${tx},${cy + 7}Z`
    : `M${tx},${cy - 7} L${tx - 40},${cy - h - 2} Q${tx - 46},${cy} ${tx - 40},${cy + h + 2} L${tx},${cy + 7}Z`;
  return `<svg viewBox="-6 0 206 124" class="cc-sil" aria-hidden="true"><g fill="#0e2128" stroke="#2c4a54" stroke-width="3" stroke-linejoin="round">
    <path d="${tail}"/><path d="M${cx - 28},${cy - h + 4} Q${cx - 6},${cy - h - 24} ${cx + 22},${cy - h + 2}Z"/><path d="${body}"/></g>
    <text x="${cx + 6}" y="${cy + 13}" text-anchor="middle" class="cc-q">?</text></svg>`;
}

// The full list of cards, in a stable order: the guide fish first, then the rest by group.
const ALL = [
  ...SPECIES.filter(s => s.id !== 'other').map(s => ({
    key: s.id, name: s.name.replace(/ \(.*\)$/, ''), group: 'Tampa Bay favorites', guide: s.id,
    tier: GUIDE_TIER[s.id] ?? 1, shape: SHAPE[s.id], ref: GUIDE[s.id]?.photos?.[0]?.src,
  })),
  ...FISH.map(f => ({
    key: f.id, name: f.name, group: f.group, tier: TIER_OVERRIDE[f.id] ?? GROUP_TIER[f.group] ?? 1,
    shape: GROUP_SHAPE[f.group],
  })),
];
ALL.forEach((c, i) => { c.no = i + 1; });

// Which card a logged catch belongs to.
function cardKey(c) {
  if (c.species && c.species !== 'other') return c.species;
  if (c.fishId) return c.fishId;
  const n = (c.otherName || '').trim().toLowerCase(); if (!n) return null;
  const f = FISH.find(x => x.name.toLowerCase() === n || x.aka.some(a => a.toLowerCase() === n));
  return f ? f.id : 'name:' + n;
}

function tally(trips) {
  const st = new Map();
  for (const t of trips) for (const c of t.catches || []) {
    const k = cardKey(c); if (!k) continue;
    let s = st.get(k);
    if (!s) st.set(k, s = { count: 0, len: 0, wt: 0, first: null, firstSpot: '', photo: null, photoLen: -1, name: c.otherName, trips: new Set(), dates: [] });
    s.count += c.count || 1; s.trips.add(t.id);
    if (c.length > s.len) s.len = c.length;
    if (c.weight > s.wt) s.wt = c.weight;
    const d = t.date || '';
    if (d && (!s.first || d < s.first)) { s.first = d; s.firstSpot = t.spot || ''; }
    s.dates.push({ d, time: c.time || t.start || '', spot: t.spot || '' });
    // card photo: the biggest fish that has a photo, else the latest photo
    if (c.photoUrl && ((c.length || 0) > s.photoLen || !s.photo)) { s.photo = c.photoUrl; s.photoLen = c.length || 0; }
  }
  return st;
}

// ---------- badges ----------
const SLAM = ['snook', 'redfish', 'trout'];
function badges(stats, trips) {
  const caught = [...stats.keys()];
  const n = caught.length;
  const has = k => stats.has(k);
  const groupOf = k => ALL.find(c => c.key === k)?.group;
  const sameDaySlam = trips.some(t => SLAM.every(k => (t.catches || []).some(c => c.species === k)));
  const night = trips.some(t => (t.catches || []).some(c => { const tm = c.time || t.start || ''; const h = +tm.slice(0, 2); return tm && (h >= 21 || h < 4); }));
  const total = [...stats.values()].reduce((a, s) => a + s.count, 0);
  const big = [...stats.values()].some(s => s.len >= 30);
  const reef = caught.filter(k => ['Groupers & sea basses', 'Snappers', 'Reef & deep water', 'Porgies & grunts', 'Triggerfish & filefish'].includes(groupOf(k)) || ['redgrouper', 'gag', 'hogfish', 'mangrove'].includes(k)).length;
  const sharks = caught.some(k => groupOf(k) === 'Sharks' || k === 'blacktip');
  const trophy = caught.some(k => ALL.find(c => c.key === k)?.tier === 3);
  return [
    { i: '🎣', name: 'First Card', how: 'Log your first fish', got: n >= 1 },
    { i: '🎯', name: 'Inshore Slam', how: 'Snook, redfish and trout on one trip', got: sameDaySlam },
    { i: '🔟', name: 'First 10', how: 'Collect 10 different fish', got: n >= 10 },
    { i: '🌙', name: 'Night Owl', how: 'Catch a fish after 9 PM', got: night },
    { i: '📏', name: 'Big One', how: 'Any fish 30 inches or longer', got: big },
    { i: '🦈', name: 'Shark Week', how: 'Catch any shark', got: sharks },
    { i: '⚓', name: 'Reef Raider', how: '5 different reef fish', got: reef >= 5 },
    { i: '💯', name: 'Century', how: '100 fish logged', got: total >= 100 },
    { i: '👑', name: 'Silver King', how: 'Land a tarpon', got: has('tarpon') },
    { i: '🏆', name: 'Trophy Hunter', how: 'Collect any Trophy card', got: trophy },
    { i: '🃏', name: 'Half Deck', how: 'Collect 25 different fish', got: n >= 25 },
    { i: '🌊', name: 'Bay Master', how: 'Collect every Tampa Bay favorite', got: ALL.filter(c => c.guide).every(c => has(c.key)) },
  ].sort((a, b) => b.got - a.got);
}

// ---------- render ----------
let state = { cards: [], stats: new Map(), filter: 'all', tier: null, loaded: false };

function cardImg(c, s) {
  if (s?.photo) return `<img src="${esc(s.photo)}" alt="" loading="lazy">`;
  if (s && c.ref) return `<img src="${esc(c.ref)}" alt="" loading="lazy">`;
  if (s) return `<div class="cc-noimg">${silhouette(c.shape).replace('class="cc-sil"', 'class="cc-sil lit"')}</div>`;
  return silhouette(c.shape);
}

function tile(c) {
  const s = state.stats.get(c.key);
  return `<button type="button" class="cc-card t${c.tier}${s ? '' : ' x'}" data-key="${esc(c.key)}" aria-label="${s ? esc(c.name) : 'Not caught yet'}">
    <span class="cc-in"><span class="cc-im">${cardImg(c, s)}${slab(gradeOf(c, s), 1)}</span><span class="cc-nm">${s ? esc(c.name) : '? ? ?'}</span></span></button>`;
}

function render() {
  const host = $('#cc-body'); if (!host) return;
  const { stats } = state;
  const cards = state.cards;
  const caught = cards.filter(c => stats.has(c.key));
  $('#cc-count').innerHTML = `<b>${caught.length}</b> / ${cards.length} cards`;
  // newest card: the fish whose first catch is the most recent
  const newest = caught.filter(c => stats.get(c.key).first).sort((a, b) => stats.get(b.key).first.localeCompare(stats.get(a.key).first))[0];
  let html = '';
  if (newest) {
    const s = stats.get(newest.key);
    html += `<button type="button" class="cc-feat t${newest.tier}" data-key="${esc(newest.key)}">
      <span class="cc-feat-in"><span class="cc-feat-im">${cardImg(newest, s)}${slab(gradeOf(newest, s), 1)}</span>
      <span class="cc-feat-row"><span><span class="cc-kicker">Newest card</span><strong>${esc(newest.name)}</strong>
        <span class="cc-sub">First caught ${esc(fmtDate(s.first))}${s.firstSpot ? ' · ' + esc(s.firstSpot) : ''}</span></span>
        <span class="cc-rar t${newest.tier}">${TIERS[newest.tier]}</span></span>
      <span class="cc-stats"><span>${s.count}<small>Caught</small></span><span>${s.len ? s.len + ' in' : '—'}<small>Best</small></span><span>${s.wt ? s.wt + ' lb' : '—'}<small>Heaviest</small></span></span></span></button>`;
  } else if (state.loaded) {
    html += `<div class="cc-empty">Log a catch on <b>My trips</b> and its card shows up here. Tap any “?” card to see what it is.</div>`;
  }
  const bs = badges(stats, state.trips || []);
  html += `<div class="cc-sec"><span>Badges · ${bs.filter(b => b.got).length} of ${bs.length}</span></div>
    <div class="cc-badges">${bs.map((b, i) => `<button type="button" class="cc-badge${b.got ? '' : ' off'}" data-badge="${i}"><i>${b.i}</i>${esc(b.name)}</button>`).join('')}</div>`;
  const per = TIERS.map((t, i) => `<button type="button" data-tier="${i}" class="cc-rar t${i}${state.tier === i ? ' on' : ''}${state.tier != null && state.tier !== i ? ' dim' : ''}">${t} ${cards.filter(c => c.tier === i && stats.has(c.key)).length}/${cards.filter(c => c.tier === i).length}</button>`).join('');
  html += `<div class="cc-legend">${per}</div>${state.tier != null ? `<p class="cc-note">Showing ${TIERS[state.tier]} only, best grade first. Tap it again to show all.</p>` : ''}
    <div class="cc-chips" role="group" aria-label="Show">${[['all', 'All'], ['caught', `Caught ${caught.length}`], ['not', 'Not yet']].map(([k, l]) => `<button type="button" data-filter="${k}" class="${state.filter === k ? 'on' : ''}">${l}</button>`).join('')}</div>`;
  const show = cards.filter(c => (state.filter === 'all' || (state.filter === 'caught') === stats.has(c.key)) && (state.tier == null || c.tier === state.tier));
  if (state.tier != null) show.sort((a, b) => (gradeOf(b, stats.get(b.key)) || 0) - (gradeOf(a, stats.get(a.key)) || 0) || stats.has(b.key) - stats.has(a.key));
  const groups = [...new Set(show.map(c => c.group))];
  const groupHtml = groups.map(g => {
    const inG = cards.filter(c => c.group === g);
    return `<div class="cc-sec"><span>${esc(g)}</span><span>${inG.filter(c => stats.has(c.key)).length} / ${inG.length}</span></div>
      <div class="cc-grid">${show.filter(c => c.group === g).map(tile).join('')}</div>`;
  });
  html += (state.tier != null ? `<div class="cc-grid">${show.map(tile).join('')}</div>` : groupHtml.join('')) || '<p class="muted small">Nothing here yet.</p>';
  host.innerHTML = html;
  host._badges = bs;
}

// ---------- the big flipped card ----------
// How much a card sparkles: 0 (uncaught) to about 1 (trophy, grade 10).
const shine = (c, s) => s ? Math.min(1, (c.tier / 3) * .55 + ((gradeOf(c, s) || 3) / 10) * .45) : 0;
const SPARK_COLORS = ['#f6d29a', '#4fbfb6', '#f0936a', '#fff', '#c9a6ff', '#9fe8ff'];
function sparkle(el, n = 18, power = .3) {
  const box = el.getBoundingClientRect();
  for (let i = 0; i < n; i++) {
    const p = document.createElement('span'); p.className = 'cc-spark'; p.textContent = ['✦', '✧', '★', '•', '✶'][i % 5];
    const a = Math.random() * Math.PI * 2, d = 80 + Math.random() * (120 + power * 160);
    p.style.left = box.left + box.width / 2 + 'px'; p.style.top = box.top + box.height / 2 + 'px';
    p.style.setProperty('--dx', Math.cos(a) * d + 'px'); p.style.setProperty('--dy', Math.sin(a) * d + 'px');
    p.style.fontSize = 10 + Math.random() * (12 + power * 18) + 'px';
    p.style.color = SPARK_COLORS[i % (power > .6 ? 6 : 4)];
    p.style.animationDuration = 700 + Math.random() * 600 + 'ms';
    document.body.appendChild(p); setTimeout(() => p.remove(), 1400);
  }
}
// Glitter that keeps twinkling over the open card; more for rarer, higher-graded fish.
let glitterTimer = null;
function glitter(power) {
  clearInterval(glitterTimer);
  const host = $('#cc-sheet .cc-glitter'); host.innerHTML = '';
  if (!power) return;
  const every = Math.round(260 - power * 220); // ~40ms at the top, ~200ms for a low common
  glitterTimer = setInterval(() => {
    if (!$('#cc-sheet').open) { clearInterval(glitterTimer); return; }
    const g = document.createElement('i');
    g.style.left = Math.random() * 100 + '%'; g.style.top = Math.random() * 100 + '%';
    const z = 4 + Math.random() * (5 + power * 9); g.style.width = g.style.height = z + 'px';
    g.style.background = SPARK_COLORS[Math.floor(Math.random() * (power > .6 ? 6 : 4))];
    host.appendChild(g); setTimeout(() => g.remove(), 1100);
  }, every);
}

// ---------- spin: the card's angle, driven by finger drags with momentum ----------
const spin = { a: 0, v: 0, raf: 0, drag: null, power: 0 };
function setAngle(a) {
  spin.a = a; const el = $('#cc-sheet .cc-big'); if (el) el.style.setProperty('--spin', a + 'deg');
}
function stopSpin() { cancelAnimationFrame(spin.raf); spin.raf = 0; }
// ease to an angle
function tweenTo(target, ms = 700, done) {
  stopSpin(); const from = spin.a, t0 = performance.now();
  const step = now => {
    const k = Math.min(1, (now - t0) / ms), e = 1 - Math.pow(1 - k, 3);
    setAngle(from + (target - from) * e);
    if (k < 1) spin.raf = requestAnimationFrame(step); else { spin.raf = 0; done?.(); }
  };
  spin.raf = requestAnimationFrame(step);
}
// let it coast after a flick, then settle on the nearest face
function coast() {
  stopSpin(); let last = performance.now(), crossed = Math.floor(spin.a / 180);
  const step = now => {
    const dt = Math.min(40, now - last); last = now;
    setAngle(spin.a + spin.v * dt); spin.v *= Math.pow(.993, dt);
    const f = Math.floor(spin.a / 180);
    if (f !== crossed) { crossed = f; if (spin.power) burst(.4); } // a little burst each time a face goes by
    if (Math.abs(spin.v) > .06) spin.raf = requestAnimationFrame(step);
    else tweenTo(Math.round(spin.a / 180) * 180, 450);
  };
  spin.raf = requestAnimationFrame(step);
}
function burst(scale = 1) {
  const card = $('#cc-sheet .cc-big'); if (!card || !spin.power) return;
  sparkle(card, Math.round((8 + spin.power * 46) * scale), spin.power);
}

function openCard(key, from) {
  const c = state.cards.find(x => x.key === key); if (!c) return;
  const s = state.stats.get(key);
  const dlg = $('#cc-sheet');
  const g = gradeOf(c, s), [ty, tr] = sizeOf(c), rule = c.guide ? byId(c.guide) : null;
  const slot = rule?.min && rule?.max ? `Legal slot ${rule.min}–${rule.max}". ` : rule?.min ? `Legal min ${rule.min}". ` : '';
  const label = s ? `<div class="cc-label"><div><span class="cc-label-k">Bay Grade · #${String(c.no).padStart(3, '0')}</span><strong>${esc(c.name)}</strong>
      <span class="cc-label-s">${s.len ? `Best ${s.len}" · ` : ''}typical ${ty}", trophy ${tr}"+</span></div>${g ? slab(g) : '<span class="cc-grade none"><b>–</b><small>Add length</small></span>'}</div>` : '';
  const back = s ? `${label}
    <div class="cc-big-im">${cardImg(c, s)}${!s.photo ? '<span class="cc-tag">Guide photo · add yours on My trips</span>' : ''}</div>
    <div class="cc-big-row"><div><span class="cc-kicker">#${String(c.no).padStart(3, '0')} · ${esc(c.group)}</span><h2>${esc(c.name)}</h2></div><span class="cc-rar t${c.tier}">${TIERS[c.tier]}</span></div>
    <div class="cc-stats"><span>${s.count}<small>Caught</small></span><span>${s.len ? s.len + ' in' : '—'}<small>Best</small></span><span>${s.wt ? s.wt + ' lb' : '—'}<small>Heaviest</small></span></div>
    ${g ? `<p class="cc-first cc-why">${esc(slot)}Grade ${g} of 10 for a ${s.len}" fish: ${g >= 9 ? 'a true wall-hanger.' : g >= 7 ? 'well above a typical keeper.' : g >= 5 ? 'about a typical keeper.' : 'on the small side. Bigger ones are out there.'}</p>` : ''}
    <p class="cc-first">⭐ First caught ${esc(fmtDate(s.first))}${s.firstSpot ? ' at ' + esc(s.firstSpot) : ''} · ${s.trips.size} trip${s.trips.size > 1 ? 's' : ''}</p>`
    : `
    <div class="cc-big-im dark">${silhouette(c.shape)}</div>
    <div class="cc-big-row"><div><span class="cc-kicker">#${String(c.no).padStart(3, '0')} · ${esc(c.group)}</span><h2>${esc(c.name)}</h2></div><span class="cc-rar t${c.tier}">${TIERS[c.tier]}</span></div>
    <p class="cc-first">Not caught yet. Log one on <b>My trips</b> to unlock this card.</p>`;
  dlg.querySelector('.cc-big').className = `cc-big t${c.tier}${s ? '' : ' x'}`;
  dlg.querySelector('.cc-face.back').innerHTML = back + `<div class="cc-acts">${c.guide ? `<button type="button" data-guide="${esc(c.guide)}">Species guide</button>` : ''}<button type="button" class="cc-close">Close</button></div>`;
  dlg.querySelector('.cc-face.front').innerHTML = `<span class="cc-im">${s ? cardImg(c, s) : silhouette(c.shape)}</span><span class="cc-nm">${s ? esc(c.name) : '? ? ?'}</span>`;
  const card = dlg.querySelector('.cc-flip'), big = dlg.querySelector('.cc-big');
  card.classList.remove('shake');
  stopSpin(); setAngle(0); spin.v = 0; spin.power = shine(c, s);
  dlg.showModal();
  glitter(spin.power);
  // grow from the tapped card, then spin around and land on the back
  if (from) {
    const fa = from.getBoundingClientRect(), fb = big.getBoundingClientRect();
    big.animate([{ transform: `translate(${fa.left + fa.width / 2 - (fb.left + fb.width / 2)}px, ${fa.top + fa.height / 2 - (fb.top + fb.height / 2)}px) scale(${fa.width / fb.width})` }, { transform: 'none' }],
      { duration: 320, easing: 'cubic-bezier(.2,.8,.3,1.1)' });
  }
  setTimeout(() => {
    navigator.vibrate?.(s ? [12, 40, 12] : 30);
    if (!s) { card.classList.add('shake'); setTimeout(() => { card.classList.remove('shake'); tweenTo(180, 700); }, 420); return; }
    // better cards spin more: 1.5 turns, up to 2.5 for the best
    const turns = spin.power > .7 ? 900 : spin.power > .4 ? 720 : 540;
    tweenTo(turns, 900 + turns / 2, () => { setAngle(180); burst(1); });
    setTimeout(() => burst(.5), 250);
  }, 330);
}

// holo tilt: rare and trophy cards follow your finger
function tilt(e) {
  if (spin.drag) return;
  const big = $('#cc-sheet .cc-big'); if (!big || !big.matches('.t2, .t3') || big.matches('.x')) return;
  const r = big.getBoundingClientRect();
  const x = ((e.clientX - r.left) / r.width) - .5, y = ((e.clientY - r.top) / r.height) - .5;
  big.style.setProperty('--rx', (-y * 14) + 'deg'); big.style.setProperty('--ry', (x * 14) + 'deg');
  big.style.setProperty('--hx', (x + .5) * 100 + '%'); big.style.setProperty('--hy', (y + .5) * 100 + '%');
}

export async function open() {
  const host = $('#cc-body'); if (!host) return;
  if (!state.cards.length) state.cards = ALL;
  if (!store.currentUser()) {
    state.stats = new Map(); state.trips = []; state.loaded = true; render();
    host.insertAdjacentHTML('afterbegin', '<div class="cc-empty">Sign in on <b>My trips</b> to fill your collection with your catches.</div>');
    return;
  }
  if (!state.loaded) host.innerHTML = '<p class="muted small">Shuffling your cards…</p>';
  let trips = [];
  try { trips = await store.listTrips(); } catch { /* offline: use what's queued */ }
  try {
    const pend = await outbox.pendingTrips(); const ids = new Set(pend.map(t => t.id));
    for (const t of pend) for (const c of t.catches || []) if (c.photo instanceof Blob) c.photoUrl = URL.createObjectURL(c.photo);
    trips = [...pend, ...trips.filter(t => !ids.has(t.id))];
  } catch { }
  state.trips = trips;
  state.stats = tally(trips);
  // catches named something not in the list still get a card
  const extra = [...state.stats.keys()].filter(k => !ALL.some(c => c.key === k)).map((k, i) => ({
    key: k, name: state.stats.get(k).name || fishById(k)?.name || k.replace(/^name:/, ''), group: 'My other fish', tier: 1, no: ALL.length + i + 1,
  }));
  state.cards = [...ALL, ...extra];
  state.loaded = true;
  render();
}

export function init({ goGuide }) {
  const host = $('#cc-body'); if (!host) return;
  host.addEventListener('click', e => {
    const f = e.target.closest('[data-filter]'); if (f) { state.filter = f.dataset.filter; render(); return; }
    const t = e.target.closest('[data-tier]'); if (t) { const i = +t.dataset.tier; state.tier = state.tier === i ? null : i; render(); return; }
    const b = e.target.closest('[data-badge]');
    if (b) { const x = host._badges[+b.dataset.badge]; toastBadge(b, x); return; }
    const c = e.target.closest('[data-key]'); if (c) openCard(c.dataset.key, c);
  });
  const dlg = $('#cc-sheet');
  dlg.addEventListener('click', e => {
    if (e.target === dlg || e.target.closest('.cc-close')) { dlg.close(); return; }
    const g = e.target.closest('[data-guide]'); if (g) { dlg.close(); goGuide(g.dataset.guide); return; }
  });
  // drag sideways to spin the card all the way around; a tap flips it
  const big = dlg.querySelector('.cc-big');
  big.addEventListener('pointerdown', e => {
    if (e.target.closest('button')) return;
    stopSpin(); spin.drag = { x: e.clientX, a: spin.a, t: performance.now(), lx: e.clientX, moved: false };
    spin.v = 0; big.setPointerCapture(e.pointerId);
  });
  big.addEventListener('pointermove', e => {
    const d = spin.drag; if (!d) return;
    const now = performance.now(), dx = e.clientX - d.x;
    if (Math.abs(dx) > 6) d.moved = true;
    const nv = (e.clientX - d.lx) * .7 / Math.max(1, now - d.t);
    spin.v = spin.v * .6 + nv * .4; d.t = now; d.lx = e.clientX;
    setAngle(d.a + dx * .7);
  });
  const up = () => {
    const d = spin.drag; if (!d) return; spin.drag = null;
    if (!d.moved) { tweenTo(Math.round(spin.a / 180) * 180 + 180, 600, () => burst(.6)); return; }
    if (Math.abs(spin.v) > .3) burst(.5);
    coast();
  };
  big.addEventListener('pointerup', up); big.addEventListener('pointercancel', up);
  dlg.addEventListener('close', () => { stopSpin(); clearInterval(glitterTimer); });
  dlg.addEventListener('pointermove', tilt);
}

function toastBadge(el, b) {
  document.querySelectorAll('.cc-tip').forEach(t => t.remove());
  const t = document.createElement('div'); t.className = 'cc-tip';
  t.innerHTML = `<b>${b.i} ${esc(b.name)}</b><br>${b.got ? 'Earned! ' : ''}${esc(b.how)}`;
  el.closest('.cc-badges').after(t);
  if (b.got) sparkle(el, 10);
  setTimeout(() => t.remove(), 3500);
}
