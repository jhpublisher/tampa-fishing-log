// Minimal JPEG EXIF reader: returns {time: Date|null, lat, lng} when present.
// Note: some phones strip location from photos picked in a browser.
export async function readExif(file) {
  try {
    const buf = await file.slice(0, 256 * 1024).arrayBuffer();
    const v = new DataView(buf);
    if (v.getUint16(0) !== 0xFFD8) return {};
    let o = 2;
    while (o < v.byteLength - 4) {
      const marker = v.getUint16(o), len = v.getUint16(o + 2);
      if (marker === 0xFFE1 && v.getUint32(o + 4) === 0x45786966) return parseTiff(v, o + 10);
      o += 2 + len;
    }
  } catch { /* not a readable JPEG */ }
  return {};
}

function parseTiff(v, t) {
  const le = v.getUint16(t) === 0x4949;
  const u16 = p => v.getUint16(p, le), u32 = p => v.getUint32(p, le);
  const ifd = off => {
    const tags = {}; const n = u16(t + off);
    for (let i = 0; i < n; i++) {
      const e = t + off + 2 + i * 12;
      tags[u16(e)] = { type: u16(e + 2), count: u32(e + 4), at: e + 8 };
    }
    return tags;
  };
  const ascii = tag => {
    const p = tag.count > 4 ? t + u32(tag.at) : tag.at;
    let s = ''; for (let i = 0; i < tag.count - 1; i++) s += String.fromCharCode(v.getUint8(p + i));
    return s;
  };
  const rationals = tag => {
    const p = t + u32(tag.at); const r = [];
    for (let i = 0; i < tag.count; i++) r.push(u32(p + i * 8) / u32(p + i * 8 + 4));
    return r;
  };
  const out = { time: null, lat: null, lng: null };
  const ifd0 = ifd(u32(t + 4));
  if (ifd0[0x8769]) {
    const ex = ifd(u32(ifd0[0x8769].at));
    const dt = ex[0x9003] || ex[0x9004];
    if (dt) {
      const m = ascii(dt).match(/(\d+):(\d+):(\d+) (\d+):(\d+):(\d+)/);
      if (m) out.time = new Date(+m[1], m[2] - 1, +m[3], +m[4], +m[5], +m[6]);
    }
  }
  if (ifd0[0x8825]) {
    const g = ifd(u32(ifd0[0x8825].at));
    if (g[2] && g[4]) {
      const dms = a => a[0] + a[1] / 60 + a[2] / 3600;
      out.lat = dms(rationals(g[2])) * (g[1] && ascii(g[1]) === 'S' ? -1 : 1);
      out.lng = dms(rationals(g[4])) * (g[3] && ascii(g[3]) === 'W' ? -1 : 1);
    }
  }
  return out;
}
