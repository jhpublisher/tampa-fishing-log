// Pulls the latest Tampa Bay fishing report headlines into data/reports.json.
// Runs in GitHub Actions on a schedule (see .github/workflows/reports.yml), so the app reads one same-origin file
// and never hits these sites from James's phone. Only public feeds (RSS and the WordPress public API) are used,
// and only the headline, date, link and a short teaser are kept. Full stories stay on the publisher's site.
import { writeFileSync, readFileSync } from 'node:fs';

const UA = 'TampaFishingLog/1.0 (personal fishing log; headlines only)';
const MAX_AGE_DAYS = 60;

// type 'wp': WordPress REST API. type 'rss': RSS 2.0 or Atom feed.
// match: only keep items whose title matches (some feeds carry other news).
const SOURCES = [
  { name: 'Coastal Angler · Tampa Bay', area: 'Tampa Bay', type: 'rss',
    url: 'https://coastalanglermag.com/category/tampa-bay/tampa-bay-fishing-reports-forecasts/feed/' },
  { name: 'Tampa Bay Beacons', area: 'Tampa Bay', type: 'rss', url: 'https://www.tampabaybeacons.com/?s=fishin+report&feed=rss2', match: /fish/i },
  { name: "Hubbard's Marina", area: "John's Pass", type: 'wp', url: 'https://www.hubbardsmarina.com', search: 'fishing report', match: /report/i },
  { name: 'Tampa Free Press', area: 'Gulf Coast', type: 'rss', url: 'https://www.tampafp.com/?s=fishing+report&feed=rss2', match: /fishing report/i },
  { name: 'r/floridafishing', area: 'Tampa · St. Pete · Clearwater', type: 'rss',
    url: 'https://www.reddit.com/r/floridafishing/new/.rss?limit=100',
    match: /tampa|st\.? ?pete|petersburg|clearwater|skyway|pinellas|hillsborough|apollo beach|ruskin|dunedin|gandy|fort de ?soto|john'?s pass|madeira|treasure island|safety harbor|oldsmar|bradenton|anna maria|tarpon springs/i },
];

const decode = s => String(s || '')
  .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1').replace(/<[^>]+>/g, ' ')
  .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(+n)).replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
  .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#039;|&apos;/g, "'").replace(/&nbsp;/g, ' ')
  .replace(/\s+/g, ' ').trim();
const teaser = s => { const t = decode(s); return t.length > 160 ? t.slice(0, 157).replace(/\s\S*$/, '') + '…' : t; };
const tag = (xml, name) => (xml.match(new RegExp(`<${name}[^>]*>([\\s\\S]*?)</${name}>`, 'i')) || [])[1] || '';

async function get(url) {
  const r = await fetch(url, { headers: { 'user-agent': UA, accept: 'application/json, application/rss+xml, application/atom+xml, text/xml, */*' }, signal: AbortSignal.timeout(20000) });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.text();
}

async function wp(src) {
  const q = new URLSearchParams({ search: src.search, per_page: 5, orderby: 'date', _fields: 'date_gmt,link,title,excerpt' });
  const j = JSON.parse(await get(`${src.url}/wp-json/wp/v2/posts?${q}`));
  return j.map(p => ({ title: decode(p.title?.rendered), url: p.link, date: new Date(p.date_gmt + 'Z'), summary: teaser(p.excerpt?.rendered) }));
}

async function rss(src) {
  const xml = await get(src.url);
  const items = xml.match(/<item[\s>][\s\S]*?<\/item>/gi) || xml.match(/<entry[\s>][\s\S]*?<\/entry>/gi) || [];
  return items.slice(0, 100).map(it => {
    const atomLink = (it.match(/<link[^>]*href="([^"]+)"/i) || [])[1];
    return {
      title: decode(tag(it, 'title')),
      url: decode(tag(it, 'link')) || atomLink,
      date: new Date(decode(tag(it, 'pubDate') || tag(it, 'updated') || tag(it, 'published'))),
      summary: src.url.includes('reddit.com') ? '' : teaser(tag(it, 'description') || tag(it, 'summary')),
    };
  });
}

const old = (() => { try { return JSON.parse(readFileSync('data/reports.json', 'utf8')); } catch { return { items: [] }; } })();
const cutoff = Date.now() - MAX_AGE_DAYS * 864e5;
const items = [], status = [];
for (const src of SOURCES) {
  try {
    const got = (await (src.type === 'wp' ? wp(src) : rss(src)))
      .filter(x => x.title && x.url && !isNaN(x.date) && +x.date > cutoff && (!src.match || src.match.test(x.title)));
    got.slice(0, src.url.includes('reddit') ? 4 : 6).forEach(x => items.push({ ...x, source: src.name, area: src.area }));
    status.push({ source: src.name, ok: true, count: got.length });
  } catch (e) {
    // keep that source's last good items so one bad fetch doesn't blank the card
    old.items.filter(x => x.source === src.name && +new Date(x.date) > cutoff).forEach(x => items.push(x));
    status.push({ source: src.name, ok: false, error: String(e.message || e) });
  }
}
items.sort((a, b) => new Date(b.date) - new Date(a.date));
const out = { items: items.slice(0, 15), sources: status };
const same = JSON.stringify(out.items) === JSON.stringify(old.items);
if (!same) writeFileSync('data/reports.json', JSON.stringify({ updated: new Date().toISOString(), ...out }, null, 1) + '\n');
console.log(same ? 'No change.' : `Wrote ${out.items.length} items.`);
console.table(status);
