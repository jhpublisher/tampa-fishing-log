// Reads local fishing reports for which fish were caught and where. Plain module with no imports,
// so the GitHub Action (scripts/fetch-reports.mjs) and the app both use it.

// Words anglers use for each species (app ids from species.js).
const FISH = {
  snook: /\bsnook\b/i, redfish: /\b(redfish|reds|red drum|bull reds?|slot reds?)\b/i, trout: /\b(trout|seatrout|gator trout)\b/i,
  sheepshead: /\bsheeps?head\b/i, mangrove: /\b(mangrove|mangroves|mango|gray) snapper\b|\bmangoes\b/i, flounder: /\bflounder\b/i,
  blackdrum: /\bblack drum\b/i, spanish: /\bspanish( mackerel)?\b|\bspanish macks?\b/i, king: /\b(kingfish|king mackerel|kings)\b/i,
  cobia: /\bcobia\b/i, pompano: /\bpompano\b/i, tripletail: /\btripletail\b/i, redgrouper: /\bred grouper\b/i,
  gag: /\bgags?( grouper)?\b/i, hogfish: /\bhogfish\b/i, tarpon: /\btarpon\b/i, jack: /\bjacks?( crevalle)?\b|\bcrevalle\b/i,
  ladyfish: /\bladyfish\b/i, blacktip: /\bblacktips?\b/i,
};

// Place names that show up in Tampa Bay reports, with a rough center point.
export const PLACES = [
  ['Anclote', /\banclote\b/i, 28.18, -82.80], ['Tarpon Springs', /\btarpon springs\b/i, 28.15, -82.77],
  ['Honeymoon Island', /\bhoneymoon\b/i, 28.07, -82.83], ['Hurricane Pass', /\bhurricane pass\b/i, 28.045, -82.825],
  ['Dunedin', /\bdunedin\b/i, 28.04, -82.79], ['Clearwater Pass', /\bclearwater pass\b/i, 27.966, -82.826],
  ['Clearwater Beach', /\bclearwater beach\b|\bpier 60\b/i, 27.977, -82.83], ['Clearwater', /\bclearwater\b(?! (beach|pass))/i, 27.96, -82.80],
  ['Indian Rocks', /\bindian rocks\b/i, 27.885, -82.85], ['Redington', /\bredington\b/i, 27.824, -82.83],
  ["John's Pass", /\bjohn'?s pass\b/i, 27.784, -82.782], ['Madeira Beach', /\bmadeira\b/i, 27.79, -82.79],
  ['Treasure Island', /\btreasure island\b/i, 27.77, -82.775], ['Blind Pass', /\bblind pass\b/i, 27.749, -82.757],
  ['Boca Ciega Bay', /\bboca ciega\b/i, 27.76, -82.73], ['Gulfport', /\bgulfport\b/i, 27.737, -82.705],
  ['Pass-a-Grille', /\bpass[- ]a[- ]grille\b/i, 27.68, -82.737], ['Shell Key', /\bshell key\b/i, 27.67, -82.742],
  ['Fort De Soto', /\b(fort|ft\.?) de ?soto\b|\bdesoto\b/i, 27.63, -82.73], ['Bunces Pass', /\bbunces\b/i, 27.66, -82.725],
  ['Egmont Key', /\begmont\b/i, 27.60, -82.762], ['Skyway', /\bskyway\b/i, 27.60, -82.65],
  ['Anna Maria', /\banna maria\b/i, 27.53, -82.73], ['Longboat Pass', /\blongboat\b/i, 27.448, -82.688],
  ['Bradenton', /\bbradenton\b/i, 27.50, -82.60], ['Manatee River', /\bmanatee river\b/i, 27.51, -82.58],
  ['Terra Ceia', /\bterra ceia\b/i, 27.565, -82.59], ['Bishop Harbor', /\bbishop harbor\b/i, 27.59, -82.567],
  ['Cockroach Bay', /\bcockroach bay\b/i, 27.685, -82.51], ['Little Manatee River', /\blittle manatee\b/i, 27.70, -82.47],
  ['Ruskin', /\bruskin\b/i, 27.72, -82.44], ['Apollo Beach', /\bapollo beach\b|\bbig bend\b|\bmira bay\b/i, 27.78, -82.415],
  ['Alafia River', /\balafia\b/i, 27.855, -82.405], ['Hillsborough Bay', /\bhillsborough bay\b|\bdavis island/i, 27.88, -82.46],
  ['Ballast Point', /\bballast point\b/i, 27.89, -82.48], ['Bayshore', /\bbayshore\b/i, 27.92, -82.483],
  ['Hillsborough River', /\bhillsborough river\b/i, 27.955, -82.46], ['Gandy Bridge', /\bgandy\b/i, 27.893, -82.556],
  ['Howard Frankland', /\bhoward frankland\b/i, 27.929, -82.57], ['Courtney Campbell', /\bcourtney campbell\b/i, 27.966, -82.648],
  ['Old Tampa Bay', /\bold tampa bay\b/i, 27.95, -82.63], ['Safety Harbor', /\bsafety harbor\b/i, 27.99, -82.687],
  ['Oldsmar', /\boldsmar\b/i, 28.03, -82.66], ['Weedon Island', /\bweedon\b/i, 27.847, -82.607],
  ['St. Pete', /\b(st\.?|saint) (pete|petersburg)\b/i, 27.77, -82.63], ['Coffee Pot Bayou', /\bcoffee ?pot\b/i, 27.79, -82.63],
  ['Fort De Soto', /\bmullet key\b/i, 27.648, -82.715], ['New Port Richey', /\bnew port richey\b|\bport richey\b/i, 28.25, -82.73],
];

const sentences = t => String(t || '').split(/(?<=[.!?])\s+|\n+/).filter(Boolean);

// -> { fish: [species ids anywhere in the text], at: [{species, place, lat, lng}] }
// A fish counts as "at" a place when both are named in the same or the next sentence.
export function parseReport(text) {
  const ss = sentences(text);
  const fishIn = s => Object.keys(FISH).filter(id => FISH[id].test(s));
  const placesIn = s => PLACES.filter(p => p[1].test(s));
  const fish = new Set(), at = new Map();
  ss.forEach((s, i) => {
    const f = fishIn(s);
    f.forEach(x => fish.add(x));
    if (!f.length) return;
    const near = [s, ss[i - 1] || '', ss[i + 1] || ''].join(' ');
    let pl = placesIn(s);
    if (!pl.length) pl = placesIn(near);
    for (const id of f) for (const [name, , lat, lng] of pl) at.set(id + '|' + name, { species: id, place: name, lat, lng });
  });
  return { fish: [...fish], at: [...at.values()] };
}

// One list of evidence from the reports feed: [{species, place, lat, lng, date, source, url}].
// place is null when a report named the fish but not where.
export function reportMentions(items) {
  const out = [];
  for (const r of items || []) {
    const m = r.mentions || parseReport(`${r.title}. ${r.summary || ''}`);
    const date = new Date(r.date), base = { date, source: r.source, url: r.url };
    const placed = new Set(m.at.map(a => a.species));
    m.at.forEach(a => out.push({ ...a, ...base }));
    m.fish.filter(id => !placed.has(id)).forEach(id => out.push({ species: id, place: null, lat: null, lng: null, ...base }));
  }
  return out;
}
