// Storage layer: trips in Supabase (table `trips`), photos in a private
// Supabase Storage bucket. Requires sign-in; see supabase/setup.sql.
import { SUPABASE_URL, SUPABASE_KEY, PHOTO_BUCKET } from './config.js';

export const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

let user = null;
export const currentUser = () => user;

// Calls cb(user|null) now and whenever sign-in state changes.
export async function watchAuth(cb) {
  const { data } = await sb.auth.getSession();
  user = data.session?.user ?? null;
  cb(user);
  sb.auth.onAuthStateChange((_e, session) => {
    const u = session?.user ?? null;
    if (u?.id !== user?.id) { user = u; cb(user); }
  });
}
export const signIn = (email, password) => sb.auth.signInWithPassword({ email, password });
export const signUp = (email, password) => sb.auth.signUp({ email, password, options: { emailRedirectTo: location.origin + location.pathname } });
export const signOut = () => sb.auth.signOut();

// Favorite tide stations live on the user's account (no extra table needed).
export const getFavStations = () => user?.user_metadata?.favStations || [];
export async function setFavStations(ids) {
  if (!user) return;
  const { data, error } = await sb.auth.updateUser({ data: { favStations: ids } });
  if (!error && data?.user) user = data.user;
}

const fail = (error, what) => { if (error) throw new Error(`${what}: ${error.message}`); };

// Adds short-lived photoUrl to each catch that has a stored photo.
async function addPhotoUrls(trips) {
  const paths = trips.flatMap(t => (t.catches || []).map(c => c.photoPath).filter(Boolean));
  if (!paths.length) return trips;
  const { data, error } = await sb.storage.from(PHOTO_BUCKET).createSignedUrls(paths, 3600);
  fail(error, 'Loading photos');
  const map = new Map(data.filter(d => d.signedUrl).map(d => [d.path, d.signedUrl]));
  trips.forEach(t => (t.catches || []).forEach(c => { if (c.photoPath) c.photoUrl = map.get(c.photoPath) || null; }));
  return trips;
}

export async function listTrips() {
  const { data, error } = await sb.from('trips').select('id, data').order('trip_date', { ascending: false });
  fail(error, 'Loading trips');
  const trips = data.map(r => ({ ...r.data, id: r.id }))
    .sort((a, b) => (b.date + (b.start || '')).localeCompare(a.date + (a.start || '')));
  return addPhotoUrls(trips);
}

export async function getTrip(id) {
  const { data, error } = await sb.from('trips').select('id, data').eq('id', id).single();
  fail(error, 'Loading trip');
  return (await addPhotoUrls([{ ...data.data, id: data.id }]))[0];
}

// Uploads any new photos (Blob in c.photo), then saves the trip row.
// Photos removed from the trip are deleted from storage.
export async function saveTrip(trip) {
  const uid = user?.id; if (!uid) throw new Error('Please sign in first.');
  const { data: old } = await sb.from('trips').select('data').eq('id', trip.id).maybeSingle();
  const catches = [];
  for (const c of trip.catches || []) {
    const { photo, photoUrl, ...rest } = c;
    if (photo instanceof Blob) {
      const path = `${uid}/${trip.id}/${newId()}.jpg`;
      const { error } = await sb.storage.from(PHOTO_BUCKET).upload(path, photo, { contentType: 'image/jpeg' });
      fail(error, 'Uploading photo');
      rest.photoPath = path;
    }
    catches.push(rest);
  }
  const data = { ...trip, catches };
  const { error } = await sb.from('trips').upsert({ id: trip.id, trip_date: trip.date || null, data, updated_at: new Date().toISOString() });
  fail(error, 'Saving trip');
  const keep = new Set(catches.map(c => c.photoPath).filter(Boolean));
  const gone = (old?.data?.catches || []).map(c => c.photoPath).filter(p => p && !keep.has(p));
  if (gone.length) await sb.storage.from(PHOTO_BUCKET).remove(gone);
}

export async function deleteTrip(id) {
  const uid = user?.id; if (!uid) throw new Error('Please sign in first.');
  const { data: files } = await sb.storage.from(PHOTO_BUCKET).list(`${uid}/${id}`);
  if (files?.length) await sb.storage.from(PHOTO_BUCKET).remove(files.map(f => `${uid}/${id}/${f.name}`));
  const { error } = await sb.from('trips').delete().eq('id', id);
  fail(error, 'Deleting trip');
}

export const newId = () => crypto.randomUUID?.() ??
  'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => { const r = Math.random() * 16 | 0; return (c === 'x' ? r : (r & 3 | 8)).toString(16); });

// Shrink photos before upload (max 1600 px, JPEG).
export async function shrinkPhoto(file, max = 1600) {
  const bmp = await createImageBitmap(file);
  const k = Math.min(1, max / Math.max(bmp.width, bmp.height));
  const c = document.createElement('canvas');
  c.width = Math.round(bmp.width * k); c.height = Math.round(bmp.height * k);
  c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height);
  return new Promise(r => c.toBlob(r, 'image/jpeg', 0.82));
}
