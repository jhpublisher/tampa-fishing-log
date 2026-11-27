// Trips saved with no signal wait here (IndexedDB on this phone, photos and voice notes included)
// and upload when the connection comes back.
const DB = 'fishlog', STORE = 'outbox';
let dbP = null;
function db() {
  if (!dbP) dbP = new Promise((res, rej) => {
    const r = indexedDB.open(DB, 2);
    r.onupgradeneeded = () => {
      if (!r.result.objectStoreNames.contains(STORE)) r.result.createObjectStore(STORE, { keyPath: 'id' });
      if (!r.result.objectStoreNames.contains('kv')) r.result.createObjectStore('kv');
    };
    r.onsuccess = () => res(r.result); r.onerror = () => { dbP = null; rej(r.error); };
  });
  return dbP;
}
const tx = async (mode, fn, store = STORE) => {
  const d = await db();
  return new Promise((res, rej) => {
    const t = d.transaction(store, mode), req = fn(t.objectStore(store));
    t.oncomplete = () => res(req?.result); t.onerror = () => rej(t.error);
  });
};
export const queueTrip = trip => tx('readwrite', s => s.put({ ...trip, _queued: new Date().toISOString() }));
export const pendingTrips = () => tx('readonly', s => s.getAll()).catch(() => []);
export const dropTrip = id => tx('readwrite', s => s.delete(id));

// Small key-value store on this phone (e.g. license photos for when there's no signal).
export const kvGet = key => tx('readonly', s => s.get(key), 'kv').catch(() => null);
export const kvSet = (key, val) => tx('readwrite', s => s.put(val, key), 'kv').catch(() => { });

// True when an error looks like "no connection" rather than a real problem with the trip.
export const isOffline = err => !navigator.onLine || err instanceof TypeError || /fetch|network|load failed|timed? ?out/i.test(String(err?.message || err));

// Upload everything waiting. save: store.saveTrip. Returns how many went up.
let flushing = null;
export function flush(save) {
  if (flushing) return flushing;
  flushing = (async () => {
    let n = 0;
    for (const t of await pendingTrips()) {
      const { _queued, ...trip } = t;
      try { await save(trip); await dropTrip(trip.id); n++; } catch (e) { if (isOffline(e)) break; }
    }
    return n;
  })().finally(() => { flushing = null; });
  return flushing;
}
