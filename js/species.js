// Tampa Bay region recreational rules, compiled 2026-11-26.
// Seatrout: FWC release (effective 2026-04-01). Others: secondary sources checked against FWC Oct 2026.
// ALWAYS confirm at myfwc.com. Update this file when FWC changes rules.
// open: list of [startMonth, startDay, endMonth, endDay] ranges (inclusive); null = open all year.
// min/max in inches (total length unless note says fork length). bag per person per day.

export const RULES_AS_OF = '2026-11-26';

export const SPECIES = [
  { id: 'snook', name: 'Snook', min: 28, max: 33, bag: 1,
    open: [[3, 1, 4, 30], [9, 1, 11, 30]],
    note: 'Snook permit required to keep. Catch & release OK when closed.' },
  { id: 'redfish', name: 'Redfish (red drum)', min: 18, max: 27, bag: 1, open: null,
    note: '2 per boat max.' },
  { id: 'trout', name: 'Spotted seatrout', min: 15, max: 19, bag: 3, open: null,
    note: 'One fish over 19" allowed per boat (or per person from shore).' },
  { id: 'sheepshead', name: 'Sheepshead', min: 12, bag: 8, open: null },
  { id: 'mangrove', name: 'Mangrove (gray) snapper', min: 10, bag: 5, open: null,
    note: 'State waters. 12" min in federal waters.' },
  { id: 'flounder', name: 'Flounder', min: 14, bag: 5,
    open: [[12, 1, 10, 14]], note: 'Closed Oct 15 to Nov 30 every year.' },
  { id: 'spanish', name: 'Spanish mackerel', min: 12, bag: 15, open: null, note: 'Fork length.' },
  { id: 'king', name: 'King mackerel', min: 24, bag: 3, open: null, note: 'Fork length.' },
  { id: 'cobia', name: 'Cobia', min: 36, bag: 1, open: null, note: 'Fork length. 2 per boat max.' },
  { id: 'pompano', name: 'Pompano', min: 11, bag: 6, open: null, note: 'Fork length. Confirm at FWC.' },
  { id: 'redgrouper', name: 'Red grouper', min: 20, bag: 2, open: null, note: 'Counts toward 4-grouper aggregate.' },
  { id: 'gag', name: 'Gag grouper', min: 24, bag: 2, open: [[9, 1, 9, 30]],
    note: '2026 season was Sep 1-30. 2027 dates not set yet.' },
  { id: 'hogfish', name: 'Hogfish', min: 14, bag: 5, open: null, note: 'Fork length.' },
  { id: 'tarpon', name: 'Tarpon', bag: 0, open: null, cr: true,
    note: 'Catch & release only. Keep fish over 40" in the water.' },
  { id: 'jack', name: 'Jack crevalle', open: null, note: 'Check FWC for current limits.' },
  { id: 'ladyfish', name: 'Ladyfish', open: null },
  { id: 'blacktip', name: 'Blacktip shark', open: null, note: 'Shore-based shark permit may apply. Check FWC.' },
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

export function ruleText(sp) {
  if (!sp) return '';
  const parts = [];
  if (sp.cr) parts.push('Catch & release only');
  else {
    if (sp.min && sp.max) parts.push(`Slot ${sp.min}-${sp.max}"`);
    else if (sp.min) parts.push(`Min ${sp.min}"`);
    if (sp.bag) parts.push(`Bag ${sp.bag}`);
  }
  if (sp.open) parts.push(isOpen(sp) ? 'Open now' : 'CLOSED now');
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
    if (sp.max && lengthIn > sp.max) return { level: 'warn', msg: `Over ${sp.max}" slot.${sp.id === 'trout' ? ' One over-slot trout allowed per boat.' : ''}` };
  }
  return { level: 'ok', msg: 'Looks legal. Double-check FWC.' };
}
