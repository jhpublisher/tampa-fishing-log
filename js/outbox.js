// Trips saved with no signal wait here (IndexedDB on this phone, photos and voice notes included)
// and upload when the connection comes back.
const DB = 'fishlog', STORE = 'outbox';
let dbP = null;
function db() {
  if (!dbP) dbP = new Promise((res, rej) => {
    const r = indexedDB.open(DB, 1);
    r.onupgradeneeded = () => r.result.createObjectStore(STORE, { keyPath: 'id' });
    r.onsuccess = () => res(r.result); r.onerror = () => { dbP = null; rej(r.error); };
  });
  return dbP;
}
const tx = async (mode, fn) => {
  const d = await db();
  return new Promise((res, rej) => {
    const t = d.transaction(STORE, mode), req = fn(t.objectStore(STORE));
    t.oncomplete = () => res(req?.result); t.onerror = () => rej(t.error);
  });
};
export const queueTrip = trip => tx('readwrite', s => s.put({ ...trip, _queued: new Date().toISOString() }));
export const pendingTrips = () => tx('readonly', s => s.getAll()).catch(() => []);
export const dropTrip = id => tx('readwrite', s => s.delete(id));

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
