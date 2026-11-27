// Fishing license card on the License tab, with an expiry reminder above it.
import * as store from './store.js';

const $ = (s, el = document) => el.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const TYPES = ['Annual saltwater', 'Annual freshwater/saltwater combo', '5-year saltwater', 'Lifetime sportsman', 'Gold Sportsman', 'Senior (65+) exemption', 'Other'];
const PERMITS = [['snook', 'Snook permit'], ['reef', 'State Reef Fish Angler'], ['shark', 'Shore-based shark permit']];

const daysLeft = lic => {
  if (!lic?.expires) return null;
  const today = new Date(); today.setHours(0, 0, 0, 0);
  return Math.round((new Date(lic.expires + 'T00:00') - today) / 864e5);
};
const fmtDate = d => d ? new Date(d + 'T12:00').toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' }) : '';

function expiryBadge(lic) {
  const n = daysLeft(lic);
  if (n == null) return lic?.type?.startsWith('Lifetime') ? '<span class="status open">Lifetime</span>' : '';
  if (n < 0) return '<span class="status closed">Expired</span>';
  if (n <= 30) return `<span class="status cr">${n === 0 ? 'Expires today' : `${n} day${n === 1 ? '' : 's'} left`}</span>`;
  return '<span class="status open">Valid</span>';
}

// Reminder shown on the License tab when the license is expired or within 30 days.
export function renderReminder() {
  const el = $('#license-reminder'); if (!el) return;
  const lic = store.getLicense(), n = daysLeft(lic);
  if (n == null || n > 30) { el.hidden = true; return; }
  el.hidden = false;
  el.innerHTML = `<strong>${n < 0 ? 'Your fishing license expired' : n === 0 ? 'Your fishing license expires today' : `Your fishing license expires in ${n} day${n === 1 ? '' : 's'}`}</strong>
    <span>${fmtDate(lic.expires)} · <a href="https://gooutdoorsflorida.com/" target="_blank" rel="noopener">Renew at GoOutdoorsFlorida ↗</a></span>`;
}

async function renderView() {
  const box = $('#license-card');
  const lic = store.getLicense();
  if (!lic) {
    box.innerHTML = `<div class="lic-head"><h2>Fishing license</h2></div>
      <p class="muted small">Keep your license number, expiry date and a photo of it here, so it's on your phone when FWC asks.</p>
      <button type="button" class="primary" id="lic-edit">Add my license</button>`;
  } else {
    const permits = PERMITS.filter(([k]) => lic.permits?.[k]).map(([, n]) => n);
    box.innerHTML = `<div class="lic-head"><h2>Fishing license</h2>${expiryBadge(lic)}</div>
      <dl class="lic-facts">
        ${lic.number ? `<div><dt>Number</dt><dd class="lic-num">${esc(lic.number)}</dd></div>` : ''}
        ${lic.type ? `<div><dt>Type</dt><dd>${esc(lic.type)}</dd></div>` : ''}
        ${lic.expires ? `<div><dt>Expires</dt><dd>${fmtDate(lic.expires)}</dd></div>` : ''}
        ${permits.length ? `<div><dt>Permits</dt><dd>${permits.map(esc).join(', ')}</dd></div>` : ''}
      </dl>
      ${lic.notes ? `<p class="small muted">${esc(lic.notes)}</p>` : ''}
      <div class="lic-photos" id="lic-photos"></div>
      <div class="row end"><button type="button" id="lic-edit">Edit</button></div>`;
    if (lic.frontPath || lic.backPath) {
      try {
        const urls = await store.licensePhotoUrls(lic);
        $('#lic-photos').innerHTML = ['front', 'back'].filter(s => urls[s])
          .map(s => `<a href="${urls[s]}" target="_blank" rel="noopener"><img src="${urls[s]}" alt="License ${s}"><span>${s === 'front' ? 'Front' : 'Back'}</span></a>`).join('');
      } catch (e) { $('#lic-photos').innerHTML = `<p class="small bad">${esc(e.message)}</p>`; }
    }
  }
  $('#lic-edit').onclick = renderForm;
}

function renderForm() {
  const box = $('#license-card');
  const lic = store.getLicense() || {};
  const photos = {};
  box.innerHTML = `<form id="lic-form">
    <div class="lic-head"><h2>Fishing license</h2></div>
    <label>License number <input name="number" value="${esc(lic.number)}" autocomplete="off" inputmode="text"></label>
    <label>Type <select name="type">${['', ...TYPES].map(t => `<option ${t === (lic.type || '') ? 'selected' : ''} value="${esc(t)}">${t || 'Choose…'}</option>`).join('')}</select></label>
    <div class="row">
      <label>Issued <input type="date" name="issued" value="${esc(lic.issued)}"></label>
      <label>Expires <input type="date" name="expires" value="${esc(lic.expires)}"></label>
    </div>
    <fieldset class="lic-permits"><legend>Permits</legend>
      ${PERMITS.map(([k, n]) => `<label class="check"><input type="checkbox" name="p-${k}" ${lic.permits?.[k] ? 'checked' : ''}> ${n}</label>`).join('')}
    </fieldset>
    <div class="row">
      <label>Photo of front <input type="file" name="front" accept="image/*"></label>
      <label>Photo of back <input type="file" name="back" accept="image/*"></label>
    </div>
    <label>Notes <textarea name="notes" rows="2" placeholder="e.g. Customer ID, where the paper copy is">${esc(lic.notes)}</textarea></label>
    <p class="small muted">Only you can see this. It's saved to your account, and the photos are kept in private storage.</p>
    <p class="small bad" id="lic-msg"></p>
    <div class="row end">
      <button type="button" id="lic-cancel">Cancel</button>
      <button type="submit" class="primary">Save license</button>
    </div>
  </form>`;
  const f = $('#lic-form');
  for (const side of ['front', 'back']) {
    f[side].onchange = async e => { const file = e.target.files[0]; if (file) photos[side] = await store.shrinkPhoto(file, 2000); };
  }
  $('#lic-cancel').onclick = renderView;
  f.onsubmit = async e => {
    e.preventDefault();
    const btn = $('button[type=submit]', f); btn.disabled = true; btn.textContent = 'Saving…';
    try {
      await store.saveLicense({
        number: f.number.value.trim(), type: f.type.value, issued: f.issued.value, expires: f.expires.value,
        notes: f.notes.value.trim(),
        permits: Object.fromEntries(PERMITS.map(([k]) => [k, f['p-' + k].checked])),
      }, photos);
      renderReminder();
      renderLink();
      await renderView();
    } catch (err) { $('#lic-msg').textContent = err.message; btn.disabled = false; btn.textContent = 'Save license'; }
  };
}

// Shortcut button on My trips that opens the License tab and shows its status.
function renderLink() {
  const el = $('#license-link'); if (!el) return;
  const lic = store.getLicense(), n = daysLeft(lic);
  const status = !lic ? 'Add your license' : n == null ? (lic.type || 'Saved') : n < 0 ? 'Expired' : n <= 30 ? `${n} day${n === 1 ? '' : 's'} left` : `Valid until ${fmtDate(lic.expires)}`;
  el.innerHTML = `<span class="lic-link-icon" aria-hidden="true">🪪</span><span><strong>Fishing license</strong><small>${esc(status)}</small></span><span aria-hidden="true">›</span>`;
  el.classList.toggle('warn', n != null && n <= 30);
}

export function onAuth(user) {
  const box = $('#license-card'); if (!box) return;
  box.hidden = !user;
  $('#license-signedout').hidden = !!user;
  $('#license-link').hidden = !user;
  if (user) { renderView(); renderLink(); }
  renderReminder();
}
