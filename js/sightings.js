// Recent public data around Tampa Bay. All free, no key, and allowed for apps like this:
// - iNaturalist: recent fish observations (photos, place, date). Terms: https://www.inaturalist.org/pages/api+recommended+practices
// - FWC: red tide (Karenia brevis) beach and bay samples from the last week.
// - Hubbard's Marina: latest fishing report headline (their public WordPress feed). Headline and link only.
import { km } from './spots.js';

const DAY = 864e5;
const BOX = { swlat: 27.3, swlng: -83.0, nelat: 28.2, nelng: -82.3 }; // Tarpon Springs to Anna Maria, out to the nearshore reefs

// iNaturalist taxon id -> app species id (species.js)
export const INAT_TAXA = {
  49437: 'snook', 128750: 'redfish', 179620: 'trout', 49750: 'sheepshead', 49509: 'mangrove',
  179501: 'flounder', 179471: 'spanish', 154499: 'king', 131491: 'cobia', 179446: 'pompano',
  49637: 'redgrouper', 106308: 'gag', 49432: 'hogfish', 51402: 'tarpon', 47230: 'jack',
  51405: 'ladyfish', 55529: 'blacktip',
};

const cache = new Map();
const ymd = d => d.toISOString().slice(0, 10);

// Sightings from the last `days` days: [{species, lat, lng, date, place, photo, url, user, obscured}]
export function recentSightings(days = 30) {
  if (cache.has(days)) return cache.get(days);
  const p = (async () => {
    const out = [];
    const d1 = ymd(new Date(Date.now() - days * DAY));
    for (let page = 1; page <= 3; page++) {
      const q = new URLSearchParams({ ...BOX, taxon_id: Object.keys(INAT_TAXA).join(','), d1, per_page: 200, page, order_by: 'observed_on', order: 'desc' });
      const j = await fetch(`https://api.inaturalist.org/v1/observations?${q}`).then(r => r.json());
      for (const o of j.results || []) {
        const sp = taxonToSpecies(o.taxon);
        if (!sp || !o.location) continue;
        const [lat, lng] = o.location.split(',').map(Number);
        out.push({
          species: sp, lat, lng, obscured: !!o.obscured,
          date: new Date(`${o.observed_on || o.created_at?.slice(0, 10)}T12:00`),
          place: o.place_guess || '', photo: o.photos?.[0]?.url || '', url: o.uri, user: o.user?.login || '',
        });
      }
      if (page * 200 >= (j.total_results || 0)) break;
    }
    return out;
  })().catch(() => { cache.delete(days); return null; });
  cache.set(days, p);
  return p;
}

function taxonToSpecies(t) {
  if (!t) return null;
  if (INAT_TAXA[t.id]) return INAT_TAXA[t.id];
  for (const id of t.ancestor_ids || []) if (INAT_TAXA[id]) return INAT_TAXA[id]; // subspecies
  return null;
}

// Sightings of a species within `radius` km of a point.
export const nearby = (list, species, lat, lng, radius = 5) =>
  (list || []).filter(s => s.species === species && km(lat, lng, s.lat, s.lng) <= radius);

// ---------- FWC red tide ----------
const HAB = 'https://gis.myfwc.com/mapping/rest/services/Projects_FWC/HAB_forDEP_Dashboard/MapServer/0/query';
const LEVELS = ['not present', 'very low', 'low', 'medium', 'high'];
let habP = null;

// Latest samples: [{lat, lng, place, date, level (0-4), label}]
export function redTideSamples() {
  if (habP) return habP;
  const q = new URLSearchParams({
    where: '1=1', geometry: `${BOX.swlng},${BOX.swlat},${BOX.nelng},${BOX.nelat}`, geometryType: 'esriGeometryEnvelope',
    inSR: 4326, outFields: 'SampleDate_t,LOCATION,Abundance,LATITUDE,LONGITUDE', returnGeometry: false, f: 'json',
  });
  habP = fetch(`${HAB}?${q}`).then(r => r.json()).then(j => (j.features || []).map(({ attributes: a }) => {
    const label = String(a.Abundance || '').toLowerCase();
    const level = Math.max(0, ...LEVELS.map((l, i) => label.startsWith(l) ? i : -1));
    return { lat: a.LATITUDE, lng: a.LONGITUDE, place: a.LOCATION, date: new Date(a.SampleDate_t), level, label: LEVELS[level] };
  })).catch(() => { habP = null; return null; });
  return habP;
}

// Worst red tide level within `radius` km of a spot, or null if no samples near it.
export function redTideAt(samples, lat, lng, radius = 12) {
  let near = (samples || []).filter(s => km(lat, lng, s.lat, s.lng) <= radius);
  if (!near.length) return null;
  // Only weigh samples from the latest week of sampling nearby, so an old bloom doesn't linger.
  const newest = Math.max(...near.map(s => +s.date));
  near = near.filter(s => newest - s.date <= 7 * 864e5);
  return near.reduce((a, b) => (b.level > a.level || (b.level === a.level && b.date > a.date) ? b : a));
}

// ---------- local reports ----------
export const REPORT_LINKS = [
  { name: 'Tampa Bay Times outdoors', note: 'Weekly saltwater fishing report', url: 'https://www.tampabay.com/sports/outdoors/' },
  { name: 'FOX 13 fishing report', note: 'Friday report from local captains', url: 'https://www.fox13news.com/tag/science/wild-nature/fishing-report' },
  { name: 'FishingBooker Tampa Bay', note: 'Charter captains’ trip reports', url: 'https://fishingbooker.com/reports/destination/us/tampa-bay' },
  { name: 'Florida Sportsman', note: 'West Central weekend forecast', url: 'https://www.floridasportsman.com/editorial/forecasts-west-central/402040' },
  { name: 'FWC red tide status', note: 'Official statewide map, updated Wed and Fri', url: 'https://myfwc.com/research/redtide/statewide/' },
];

// Latest Hubbard's Marina (John's Pass) report headline: {title, date, url} or null.
export async function latestHubbards() {
  try {
    const j = await fetch('https://www.hubbardsmarina.com/wp-json/wp/v2/posts?search=fishing%20report&per_page=1&_fields=date,link,title').then(r => r.json());
    const p = j[0]; if (!p) return null;
    const t = document.createElement('textarea'); t.innerHTML = p.title.rendered; // decode entities
    return { title: t.value, date: new Date(p.date), url: p.link };
  } catch { return null; }
}
