// Caches the app shell so it opens without signal. Tide data still needs a connection.
const C = 'fishlog-v2';
const SHELL = ['./', 'index.html', 'css/style.css', 'js/app.js', 'js/tides.js', 'js/solunar.js', 'js/species.js', 'js/store.js', 'js/exif.js', 'js/config.js', 'vendor/supabase/supabase.js', 'icon.svg', 'manifest.webmanifest', 'vendor/leaflet/leaflet.js', 'vendor/leaflet/leaflet.css', 'vendor/suncalc/suncalc.js'];
self.addEventListener('install', e => e.waitUntil(caches.open(C).then(c => c.addAll(SHELL)).then(() => self.skipWaiting())));
self.addEventListener('activate', e => e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== C).map(k => caches.delete(k)))).then(() => self.clients.claim())));
self.addEventListener('fetch', e => {
  const u = new URL(e.request.url);
  if (e.request.method !== 'GET' || u.hostname.includes('tidesandcurrents') || u.hostname.includes('tile.openstreetmap') || u.hostname.includes('supabase')) return;
  e.respondWith(fetch(e.request).then(r => { const copy = r.clone(); caches.open(C).then(c => c.put(e.request, copy)); return r; }).catch(() => caches.match(e.request)));
});
