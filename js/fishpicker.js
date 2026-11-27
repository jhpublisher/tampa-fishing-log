// Type-to-filter fish picker. Guide species (with rules) come first, then the full Florida
// saltwater list (fishlist.js), matched by name and nicknames. Anything else can be typed in.
// Value shape: { species: '<guide id>' | 'other' | '', otherName: '', fishId: '' }
import { SPECIES, byId } from './species.js';
import { FISH, fishById } from './fishlist.js';

const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const short = n => n.replace(/\s*\(.*\)/, '');
const norm = s => s.toLowerCase().replace(/[^a-z0-9' ]+/g, ' ').trim();
// nicknames for the guide fish
const GUIDE_AKA = {
  snook: 'linesider, robalo, common snook', redfish: 'red drum, red, bull red, puppy drum, spottail', trout: 'speck, speckled trout, gator trout, seatrout',
  sheepshead: 'convict fish, sheepie', mangrove: 'gray snapper, mango, mangrove snapper', flounder: 'gulf flounder, flatfish, doormat',
  blackdrum: 'drum', spanish: 'spanish, spanish mackerel', king: 'kingfish, smoker, king', cobia: 'ling, lemonfish, brown shark',
  pompano: 'pompano', tripletail: 'blackfish, buoy fish', redgrouper: 'grouper', gag: 'grouper, gag, black grouper', hogfish: 'hog snapper',
  tarpon: 'silver king, poon', jack: 'jack, crevalle', ladyfish: 'skipjack, poor man\'s tarpon', blacktip: 'shark, blacktip',
};
const ITEMS = [
  ...SPECIES.filter(s => s.id !== 'other').map(s => ({ kind: 'guide', id: s.id, name: short(s.name), full: s.name, aka: (GUIDE_AKA[s.id] || '').split(',').map(x => x.trim()).filter(Boolean), group: 'In the guide' })),
  ...FISH.map(f => ({ kind: 'list', id: f.id, name: f.name, full: f.name, aka: f.aka, group: f.group })),
].map(it => ({ ...it, words: norm([it.full, ...it.aka].join(' ')).split(/\s+/) }));

// score: lower is better; null = no match. Best of name and nicknames: exact, starts with, a word starts with, contains.
function score(it, q) {
  const words = q.split(/\s+/).filter(Boolean);
  // every typed word must start a word in the name or a nickname ("ray" shouldn't hit "gray snapper")
  if (!words.every(w => it.words.some(x => x.startsWith(w)))) return null;
  const rank = t => { t = t.toLowerCase(); return t === q ? 0 : t.startsWith(q) ? 1 : t.split(/[\s(]+/).some(w => w.startsWith(words[0])) ? 2 : 3; };
  // a match on the real name beats the same match on a nickname
  return Math.min(rank(it.full) * 2, ...it.aka.map(a => rank(a) * 2 + 1)) * 10 + (it.kind === 'guide' ? 0 : 5);
}
export function searchFish(text, max = 40) {
  const q = norm(text);
  if (!q) return ITEMS.slice(0, max);
  return ITEMS.map(it => [it, score(it, q)]).filter(([, s]) => s != null).sort((a, b) => a[1] - b[1]).slice(0, max).map(([it]) => it);
}

// Name to show for a saved catch/photo
export const fishName = v => v?.species === 'other' ? (v.otherName || 'Other') : (byId(v?.species)?.name || '');
const label = v => v?.species === 'other' ? (v.otherName || '') : (v?.species ? short(byId(v.species)?.name || '') : '');

// host: an empty element. opts: { value, onPick(value), placeholder }
export function fishPicker(host, { value = {}, onPick = () => { }, placeholder = 'Start typing a fish (red, trout, grouper…)' } = {}) {
  let cur = { species: value.species || '', otherName: value.otherName || '', fishId: value.fishId || '' };
  const lid = 'fp' + Math.random().toString(36).slice(2, 8);
  host.classList.add('fish-picker');
  host.innerHTML = `<input type="text" class="fp-input" role="combobox" aria-autocomplete="list" aria-expanded="false" aria-controls="${lid}" autocomplete="off" autocapitalize="none" spellcheck="false" placeholder="${esc(placeholder)}">
    <button type="button" class="fp-clear" aria-label="Clear fish" hidden>✕</button>
    <ul class="fp-list" id="${lid}" role="listbox" hidden></ul>`;
  const input = host.querySelector('.fp-input'), list = host.querySelector('.fp-list'), clear = host.querySelector('.fp-clear');
  let shown = [], active = -1;
  const sync = () => { input.value = label(cur); clear.hidden = !input.value; };
  const close = () => { list.hidden = true; input.setAttribute('aria-expanded', 'false'); active = -1; };
  const pick = v => { cur = v; sync(); close(); onPick({ ...cur }); };
  const choose = i => {
    const it = shown[i]; if (!it) return;
    if (it.kind === 'guide') pick({ species: it.id, otherName: '', fishId: '' });
    else if (it.kind === 'list') pick({ species: 'other', otherName: it.name, fishId: it.id });
    else pick({ species: 'other', otherName: it.name, fishId: '' });
  };
  const open = () => {
    const text = input.value.trim();
    shown = searchFish(text);
    const lc = text.toLowerCase(), typed = text && !shown.some(it => [it.name, ...it.aka].some(n => n.toLowerCase() === lc));
    if (typed) shown.push({ kind: 'free', name: text });
    let lastGroup = null;
    list.innerHTML = shown.map((it, i) => {
      const head = it.kind !== 'free' && !text && it.group !== lastGroup ? `<li class="fp-group" role="presentation">${esc(it.group)}</li>` : '';
      lastGroup = it.group;
      const sub = it.kind === 'free' ? 'Not in the list: save it as typed' : [it.kind === 'guide' ? 'In the guide' : it.group, it.aka.slice(0, 2).join(', ')].filter(Boolean).join(' · ');
      return `${head}<li role="option" id="${lid}-${i}" data-i="${i}" class="fp-opt${it.kind === 'free' ? ' fp-free' : ''}"><span>${it.kind === 'free' ? `Use “${esc(it.name)}”` : esc(it.name)}</span><small>${esc(sub)}</small></li>`;
    }).join('') + (!text ? '<li class="fp-group" role="presentation">Keep typing to search 200+ Florida saltwater fish</li>' : '');
    list.hidden = false; input.setAttribute('aria-expanded', 'true'); active = -1;
  };
  const move = d => {
    if (list.hidden) open();
    const opts = list.querySelectorAll('.fp-opt'); if (!opts.length) return;
    active = (active + d + opts.length) % opts.length;
    opts.forEach((o, i) => o.classList.toggle('on', i === active));
    opts[active].scrollIntoView({ block: 'nearest' });
    input.setAttribute('aria-activedescendant', opts[active].id);
  };
  input.addEventListener('focus', () => { input.select(); open(); });
  input.addEventListener('input', () => { clear.hidden = !input.value; open(); });
  input.addEventListener('keydown', e => {
    if (e.key === 'ArrowDown') { e.preventDefault(); move(1); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); move(-1); }
    else if (e.key === 'Enter') { if (!list.hidden) { e.preventDefault(); choose(active >= 0 ? active : 0); } }
    else if (e.key === 'Escape') { close(); sync(); }
  });
  // pointerdown so the pick lands before the input blurs
  list.addEventListener('pointerdown', e => { const li = e.target.closest('.fp-opt'); if (li) { e.preventDefault(); choose(+li.dataset.i); } });
  list.addEventListener('click', e => { const li = e.target.closest('.fp-opt'); if (li && !list.hidden) choose(+li.dataset.i); });
  input.addEventListener('blur', () => setTimeout(() => {
    if (list.hidden) return;
    const text = input.value.trim();
    // typed something and walked away: keep it rather than losing it
    if (text && text !== label(cur)) {
      const exact = shown.findIndex(it => it.name.toLowerCase() === text.toLowerCase());
      choose(exact >= 0 ? exact : shown.length - 1);
    } else { if (!text && cur.species) pick({ species: '', otherName: '', fishId: '' }); else { close(); sync(); } }
  }, 150));
  clear.onclick = () => { pick({ species: '', otherName: '', fishId: '' }); input.focus(); };
  sync();
  return { get: () => ({ ...cur }), set: v => { cur = { species: v.species || '', otherName: v.otherName || '', fishId: v.fishId || '' }; sync(); }, focus: () => input.focus() };
}
export { fishById };
