// Voice notes: record in the browser (works in iPhone Safari), play back, delete.
// A widget keeps a list of notes: saved ones {path, url, secs, at} and new ones {blob, secs, at}.
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const mmss = s => `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, '0')}`;
const pickType = () => {
  if (!window.MediaRecorder) return null;
  for (const t of ['audio/mp4', 'audio/webm;codecs=opus', 'audio/webm', 'audio/ogg']) if (MediaRecorder.isTypeSupported?.(t)) return t;
  return '';
};
let active = null; // only one recording at a time

export function voiceWidget(el, notes = [], label = 'Voice note') {
  const list = notes.map(n => ({ ...n }));
  el.classList.add('voice');
  const render = () => {
    el.innerHTML = list.map((n, i) => `<div class="vn">
        <audio controls preload="none" src="${esc(n.blob ? (n.local ||= URL.createObjectURL(n.blob)) : n.url || '')}"></audio>
        <span class="small muted">${n.secs ? mmss(n.secs) : ''}${n.blob ? ' · not saved yet' : ''}</span>
        <button type="button" class="vn-del" data-i="${i}" aria-label="Delete voice note">✕</button></div>`).join('') +
      `<button type="button" class="vn-rec">🎙 ${list.length ? 'Add another' : 'Record'} ${label.toLowerCase()}</button><span class="vn-msg small muted"></span>`;
    el.querySelectorAll('.vn-del').forEach(b => b.onclick = () => {
      if (b.dataset.armed !== '1') { b.dataset.armed = '1'; b.textContent = 'Delete?'; setTimeout(() => { b.dataset.armed = ''; b.textContent = '✕'; }, 3000); return; }
      list.splice(+b.dataset.i, 1); render();
    });
    el.querySelector('.vn-rec').onclick = start;
  };
  const msg = t => { const m = el.querySelector('.vn-msg'); if (m) m.textContent = t; };

  async function start() {
    if (active) active();
    const type = pickType();
    if (type === null || !navigator.mediaDevices?.getUserMedia) return msg('Recording is not supported in this browser.');
    let stream;
    try { stream = await navigator.mediaDevices.getUserMedia({ audio: true }); }
    catch { return msg('Microphone is blocked. On iPhone: Settings › Safari › Microphone › Allow (or Ask).'); }
    const rec = new MediaRecorder(stream, type ? { mimeType: type } : undefined);
    const chunks = [], t0 = Date.now();
    rec.ondataavailable = e => e.data.size && chunks.push(e.data);
    rec.onstop = () => {
      stream.getTracks().forEach(t => t.stop());
      clearInterval(tick); active = null;
      const blob = new Blob(chunks, { type: rec.mimeType || type || 'audio/mp4' });
      if (blob.size) list.push({ blob, secs: (Date.now() - t0) / 1000, at: new Date().toISOString() });
      render();
    };
    rec.start(1000);
    const btn = el.querySelector('.vn-rec');
    btn.classList.add('recording'); btn.textContent = '■ Stop recording';
    btn.onclick = () => rec.state !== 'inactive' && rec.stop();
    const tick = setInterval(() => msg(`Recording ${mmss((Date.now() - t0) / 1000)}`), 500);
    msg('Recording 0:00');
    active = () => rec.state !== 'inactive' && rec.stop();
    setTimeout(() => active && rec.state !== 'inactive' && rec.stop(), 5 * 60e3); // 5 min cap
  }
  render();
  return { get: () => list.map(({ local, ...n }) => n), stop: () => active?.() };
}
