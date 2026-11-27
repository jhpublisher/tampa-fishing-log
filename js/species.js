// Tampa Bay region recreational rules, checked against FWC's own regulation pages
// (myfwc.com/fishing/saltwater/recreational/<species>/) on 2026-11-26.
// ALWAYS confirm at myfwc.com. Update this file when FWC changes rules.
// open: list of [startMonth, startDay, endMonth, endDay] ranges (inclusive); null = open all year.
// min/max in inches; fl: true = fork length, otherwise total length. bag per person per day.

export const RULES_AS_OF = '2026-11-26';

export const SPECIES = [
  { id: 'snook', name: 'Snook', min: 28, max: 33, bag: 1,
    open: [[3, 1, 4, 30], [9, 1, 11, 30]],
    note: 'Snook permit + license needed to keep. Closed Dec 1-end of Feb and May 1-Aug 31.' },
  { id: 'redfish', name: 'Redfish (red drum)', min: 18, max: 27, bag: 1, open: null,
    note: '2 per boat max.' },
  { id: 'trout', name: 'Spotted seatrout', min: 15, max: 19, bag: 3, open: null,
    note: 'One fish over 19" allowed per boat (or per person from shore), counted in the bag.' },
  { id: 'sheepshead', name: 'Sheepshead', min: 12, bag: 8, open: null,
    note: '50 per boat per trip in March and April.' },
  { id: 'mangrove', name: 'Mangrove (gray) snapper', min: 10, bag: 5, open: null,
    note: 'State waters. Federal waters: 12" min, 10 bag. Part of 10-snapper aggregate.' },
  { id: 'flounder', name: 'Flounder', min: 14, bag: 5,
    open: [[12, 1, 10, 14]], note: 'Closed Oct 15-Nov 30 every year.' },
  { id: 'blackdrum', name: 'Black drum', min: 14, max: 24, bag: 5, open: null,
    note: 'One fish over 24" allowed, counted in the bag.' },
  { id: 'spanish', name: 'Spanish mackerel', min: 12, fl: true, bag: 15, open: null },
  { id: 'king', name: 'King mackerel', min: 24, fl: true, bag: 3, open: null },
  { id: 'cobia', name: 'Cobia', min: 36, fl: true, bag: 1, open: null, note: '2 per boat max.' },
  { id: 'pompano', name: 'Florida pompano', min: 11, fl: true, bag: 6, open: null },
  { id: 'tripletail', name: 'Tripletail', min: 18, bag: 2, open: null, note: 'Hook and line only.' },
  { id: 'redgrouper', name: 'Red grouper', min: 20, bag: 2, open: null,
    note: 'Within 4-grouper aggregate. Federal waters deeper than 20 fathoms closed Feb 1-Mar 31. State Reef Fish Angler designation needed on a private boat.' },
  { id: 'gag', name: 'Gag grouper', min: 24, bag: 2, open: [[9, 1, 9, 30]],
    note: '2026 Gulf season was Sep 1-30; 2027 dates not set yet. Within 4-grouper aggregate.' },
  { id: 'hogfish', name: 'Hogfish', min: 14, fl: true, bag: 5, open: null },
  { id: 'tarpon', name: 'Tarpon', bag: 0, open: null, cr: true,
    note: 'Catch & release only. Tarpon over 40" must stay in the water.' },
  { id: 'jack', name: 'Jack crevalle', open: null, unreg: true,
    note: 'No species limits. Default: 2 fish or 100 lb per person per day, whichever is more.' },
  { id: 'ladyfish', name: 'Ladyfish', open: null, unreg: true,
    note: 'No species limits. Default: 2 fish or 100 lb per person per day, whichever is more.' },
  { id: 'blacktip', name: 'Blacktip shark', open: null, sizeText: 'No minimum (FWC shark Group 1)', bagText: '1 per person, 2 per boat',
    note: 'From shore you need the free shore-based shark permit. Spinner sharks look alike but need 54" fork length, so be sure before you keep one.' },
  { id: 'other', name: 'Other', open: null },
];

export const byId = id => SPECIES.find(s => s.id === id);

export function isOpen(sp, date = new Date()) {
  if (!sp.open) return true;
  const md = (date.getMonth() + 1) * 100 + date.getDate();
  return sp.open.some(([m1, d1, m2, d2]) => {
    const a = m1 * 100 + d1, b = m2 * 100 + d2;
    return a <= b ? md >= a && md <= b : md >= a || md <= b; // wraps past New Year
  });
}

// Days until the harvest season closes, if it closes within `within` days (else null).
export function daysToClose(sp, date = new Date(), within = 14) {
  if (!sp?.open || !isOpen(sp, date)) return null;
  const d = new Date(date); d.setHours(12, 0, 0, 0);
  for (let i = 1; i <= within; i++) {
    d.setDate(d.getDate() + 1);
    if (!isOpen(sp, d)) return i;
  }
  return null;
}
// "Closes Dec 1": n days after `from` is the first closed day.
export function closesText(n, from = new Date()) {
  if (n == null) return '';
  const d = new Date(from); d.setDate(d.getDate() + n);
  return n === 1 ? 'Closes tomorrow' : `Closes ${d.toLocaleDateString([], { month: 'short', day: 'numeric' })}`;
}

export function ruleText(sp) {
  if (!sp) return '';
  const parts = [];
  if (sp.cr) parts.push('Catch & release only');
  else {
    const fl = sp.fl ? ' fork length' : '';
    if (sp.min && sp.max) parts.push(`Slot ${sp.min}-${sp.max}"${fl}`);
    else if (sp.min) parts.push(`Min ${sp.min}"${fl}`);
    if (sp.bag) parts.push(`Bag ${sp.bag}`);
  }
  if (sp.open) parts.push(isOpen(sp) ? (closesText(daysToClose(sp)) || 'Open now') : 'CLOSED now');
  if (sp.note) parts.push(sp.note);
  return parts.join(' · ');
}

// Returns {level: 'ok'|'warn'|'bad', msg} for a kept fish.
export function checkKeep(sp, lengthIn, date) {
  if (!sp || sp.id === 'other') return null;
  if (sp.cr) return { level: 'bad', msg: 'Tarpon are catch & release only.' };
  if (!isOpen(sp, date)) return { level: 'bad', msg: `${sp.name} is closed on this date.` };
  if (lengthIn) {
    if (sp.min && lengthIn < sp.min) return { level: 'bad', msg: `Under ${sp.min}" minimum.` };
    if (sp.max && lengthIn > sp.max) {
      // Only trout and black drum allow one over-slot fish; keeping any other over-slot fish is illegal.
      if (sp.id === 'trout') return { level: 'warn', msg: `Over ${sp.max}" slot. Only one over-slot trout allowed per boat (per person from shore).` };
      if (sp.id === 'blackdrum') return { level: 'warn', msg: `Over ${sp.max}" slot. Only one over-slot black drum allowed.` };
      return { level: 'bad', msg: `Over ${sp.max}" slot. Must be released.` };
    }
  }
  return { level: 'ok', msg: 'Looks legal. Double-check FWC.' };
}
