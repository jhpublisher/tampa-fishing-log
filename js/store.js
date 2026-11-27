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

// Starred spots ('spot:<id>' or 'sta:<NOAA id>') live on the user's account (no extra table needed).
export const getFavPlaces = () => user?.user_metadata?.favPlaces || (user?.user_metadata?.favStations || []).map(id => 'sta:' + id);
export async function setFavPlaces(keys) {
  if (!user) return;
  const { data, error } = await sb.auth.updateUser({ data: { favPlaces: keys } });
  if (!error && data?.user) user = data.user;
}

// James's own spots: [{id, name, lat, lng, type}] on the account.
export const getMySpots = () => user?.user_metadata?.mySpots || [];
export async function saveMySpots(list) {
  if (!user) return;
  const { data, error } = await sb.auth.updateUser({ data: { mySpots: list } });
  if (!error && data?.user) user = data.user;
}

// Spot history notes: { [placeKey]: {name, lat, lng, species, months, tide, note, updated} } (see spotnotes.js).
export const getSpotNotes = () => user?.user_metadata?.spotNotes || {};
export async function saveSpotNotes(notes) {
  if (!user) return;
  const { data, error } = await sb.auth.updateUser({ data: { spotNotes: notes } });
  if (error) throw error;
  if (data?.user) user = data.user;
}

const fail = (error, what) => { if (error) throw new Error(`${what}: ${error.message}`); };

// Every stored file a trip points at: catch photo, setup photo, voice notes (catch and trip).
const filePaths = t => [
  ...(t.voices || []).map(v => v.path),
  ...(t.catches || []).flatMap(c => [c.photoPath, ...(c.morePaths || []), c.setupPath, ...(c.voices || []).map(v => v.path)]),
].filter(Boolean);

// Adds short-lived URLs (photoUrl, setupUrl, voice url) for stored files.
async function addPhotoUrls(trips) {
  const paths = trips.flatMap(filePaths);
  if (!paths.length) return trips;
  const { data, error } = await sb.storage.from(PHOTO_BUCKET).createSignedUrls(paths, 3600);
  fail(error, 'Loading photos');
  const map = new Map(data.filter(d => d.signedUrl).map(d => [d.path, d.signedUrl]));
  for (const t of trips) {
    (t.voices || []).forEach(v => { v.url = map.get(v.path) || null; });
    (t.catches || []).forEach(c => {
      if (c.photoPath) c.photoUrl = map.get(c.photoPath) || null;
      if (c.setupPath) c.setupUrl = map.get(c.setupPath) || null;
      c.moreUrls = (c.morePaths || []).map(p => map.get(p) || null);
      (c.voices || []).forEach(v => { v.url = map.get(v.path) || null; });
    });
  }
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

const audioExt = type => /mp4|m4a|aac/.test(type) ? 'm4a' : /webm/.test(type) ? 'webm' : /ogg/.test(type) ? 'ogg' : 'audio';

// Uploads any new photos (Blob in c.photo / c.setup) and voice notes ({blob} in voices),
// then saves the trip row. Files no longer used by the trip are deleted from storage.
export async function saveTrip(trip) {
  const uid = user?.id; if (!uid) throw new Error('Please sign in first.');
  const { data: old } = await sb.from('trips').select('data').eq('id', trip.id).maybeSingle();
  const upload = async (blob, ext, what) => {
    const path = `${uid}/${trip.id}/${newId()}.${ext}`;
    const { error } = await sb.storage.from(PHOTO_BUCKET).upload(path, blob, { contentType: blob.type || (ext === 'jpg' ? 'image/jpeg' : 'audio/mp4') });
    fail(error, what);
    return path;
  };
  const saveVoices = async list => {
    const out = [];
    for (const v of list || []) {
      const { blob, url, local, ...rest } = v;
      if (blob instanceof Blob) rest.path = await upload(blob, audioExt(blob.type), 'Uploading voice note');
      if (rest.path) out.push(rest);
    }
    return out;
  };
  const catches = [];
  for (const c of trip.catches || []) {
    const { photo, photoUrl, setup, setupUrl, more, moreUrls, ...rest } = c;
    if (photo instanceof Blob) rest.photoPath = await upload(photo, 'jpg', 'Uploading photo');
    // extra photos: [Blob | stored path]
    if (more?.length) { rest.morePaths = []; for (const m of more) rest.morePaths.push(m instanceof Blob ? await upload(m, 'jpg', 'Uploading photo') : m); }
    if (setup instanceof Blob) rest.setupPath = await upload(setup, 'jpg', 'Uploading setup photo');
    rest.voices = await saveVoices(c.voices);
    catches.push(rest);
  }
  const data = { ...trip, catches, voices: await saveVoices(trip.voices) };
  const { error } = await sb.from('trips').upsert({ id: trip.id, trip_date: trip.date || null, data, updated_at: new Date().toISOString() });
  fail(error, 'Saving trip');
  const keep = new Set(filePaths(data));
  const gone = filePaths(old?.data || {}).filter(p => !keep.has(p));
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

// Shrink photos before upload (max 2400 px, JPEG): sharp enough to share, small enough for weak signal.
export async function shrinkPhoto(file, max = 2400) {
  const bmp = await createImageBitmap(file);
  const k = Math.min(1, max / Math.max(bmp.width, bmp.height));
  const c = document.createElement('canvas');
  c.width = Math.round(bmp.width * k); c.height = Math.round(bmp.height * k);
  c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height);
  return new Promise(r => c.toBlob(r, 'image/jpeg', 0.85));
}

// Fishing license: details on the user's account, photos in the private bucket
// at <user id>/license/<side>.jpg (covered by the same per-user storage policy).
export const getLicense = () => user?.user_metadata?.license || null;

export async function saveLicense(details, photos = {}) {
  const uid = user?.id; if (!uid) throw new Error('Please sign in first.');
  const lic = { ...(getLicense() || {}), ...details };
  for (const side of ['front', 'back']) {
    const blob = photos[side];
    if (blob instanceof Blob) {
      const path = `${uid}/license/${side}.jpg`;
      const { error } = await sb.storage.from(PHOTO_BUCKET).upload(path, blob, { contentType: 'image/jpeg', upsert: true });
      fail(error, 'Uploading license photo');
      lic[side + 'Path'] = path;
      lic[side + 'Ver'] = Date.now(); // so the new photo shows instead of a cached one
    }
  }
  const { data, error } = await sb.auth.updateUser({ data: { license: lic } });
  fail(error, 'Saving license');
  if (data?.user) user = data.user;
  return lic;
}

export async function licensePhotoUrls(lic) {
  const paths = ['front', 'back'].map(s => lic?.[s + 'Path']).filter(Boolean);
  if (!paths.length) return {};
  const { data, error } = await sb.storage.from(PHOTO_BUCKET).createSignedUrls(paths, 3600);
  fail(error, 'Loading license photos');
  const out = {};
  for (const d of data) if (d.signedUrl) out[d.path.endsWith('front.jpg') ? 'front' : 'back'] = d.signedUrl;
  return out;
}
