// Caches the app shell so it opens without signal. Tide data still needs a connection.
const C = 'fishlog-v33';
const SHELL = ['./', 'index.html', 'css/style.css', 'js/app.js', 'js/home.js', 'js/placesearch.js', 'js/tides.js', 'js/solunar.js', 'js/species.js', 'js/store.js', 'js/exif.js', 'js/guide.js', 'js/license.js', 'js/config.js', 'js/plan.js', 'js/recommend.js', 'js/spots.js', 'js/conditions.js', 'js/sightings.js', 'js/reportparse.js', 'js/catchcond.js', 'js/importer.js', 'js/fishlist.js', 'js/fishpicker.js', 'js/spotnotes.js', 'js/voice.js', 'js/outbox.js', 'js/tips.js', 'js/collection.js', 'vendor/supabase/supabase.js', 'icon.svg', 'images/hero.jpg', 'icons/icon-180.png', 'icons/icon-192.png', 'manifest.webmanifest', 'vendor/leaflet/leaflet.js', 'vendor/leaflet/leaflet.css', 'vendor/suncalc/suncalc.js'];
self.addEventListener('install', e => e.waitUntil(caches.open(C).then(c => c.addAll(SHELL.map(u => new Request(u, { cache: 'reload' })))).then(() => self.skipWaiting())));
self.addEventListener('activate', e => e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== C).map(k => caches.delete(k)))).then(() => self.clients.claim())));
self.addEventListener('fetch', e => {
  const u = new URL(e.request.url);
  if (e.request.method !== 'GET' || u.hostname.includes('tidesandcurrents') || u.hostname.includes('tile.openstreetmap') || u.hostname.includes('nominatim') || u.hostname.includes('overpass') || u.hostname.includes('supabase') || u.hostname.includes('weather.gov') || u.hostname.includes('open-meteo') || u.hostname.includes('inaturalist') || u.hostname.includes('myfwc') || u.hostname.includes('hubbardsmarina')) return;
  // no-cache: always check GitHub for newer files, so an update never mixes old and new code.
  e.respondWith(fetch(e.request, u.origin === location.origin ? { cache: 'no-cache' } : {}).then(r => { const copy = r.clone(); caches.open(C).then(c => c.put(e.request, copy)); return r; }).catch(() => caches.match(e.request)));
});
