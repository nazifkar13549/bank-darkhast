// خواندن ساده فایل xlsx (بدون وابستگی) — شیت اول و دوم
const dec = new TextDecoder('utf-8');
async function inflate(u8){
  const ds = new DecompressionStream('deflate-raw');
  const s = new Blob([u8]).stream().pipeThrough(ds);
  return new Uint8Array(await new Response(s).arrayBuffer());
}
async function unzip(buf){
  const u8 = new Uint8Array(buf), dv = new DataView(buf);
  let e = u8.length - 22;
  while (e >= 0 && dv.getUint32(e, true) !== 0x06054b50) e--;
  if (e < 0) throw new Error('فایل xlsx معتبر نیست');
  const n = dv.getUint16(e + 10, true); let p = dv.getUint32(e + 16, true);
  const files = {};
  for (let i = 0; i < n; i++) {
    const method = dv.getUint16(p + 10, true), csize = dv.getUint32(p + 20, true);
    const nl = dv.getUint16(p + 28, true), xl = dv.getUint16(p + 30, true), cl = dv.getUint16(p + 32, true);
    const lho = dv.getUint32(p + 42, true);
    const name = dec.decode(u8.subarray(p + 46, p + 46 + nl));
    files[name] = {method, csize, lho};
    p += 46 + nl + xl + cl;
  }
  return {
    async text(name){
      const f = files[name]; if (!f) return null;
      const lnl = dv.getUint16(f.lho + 26, true), lxl = dv.getUint16(f.lho + 28, true);
      const start = f.lho + 30 + lnl + lxl;
      const raw = u8.subarray(start, start + f.csize);
      return dec.decode(f.method === 0 ? raw : await inflate(raw));
    }
  };
}
const ent = s => s.indexOf('&') < 0 ? s : s.replace(/&(#x[0-9a-f]+|#\d+|lt|gt|amp|quot|apos);/gi, (m, g) => {
  if (g[0] === '#') return String.fromCodePoint(g[1] === 'x' || g[1] === 'X' ? parseInt(g.slice(2), 16) : parseInt(g.slice(1), 10));
  return {lt:'<', gt:'>', amp:'&', quot:'"', apos:"'"}[g.toLowerCase()];
});
function colIdx(s){ let n = 0; for (const c of s) n = n * 26 + c.charCodeAt(0) - 64; return n - 1; }
function normText(v){
  if (typeof v !== 'string') return v;
  v = v.replace(/_x000D_/g, '').replace(/\r/g, '').replace(/ي/g, 'ی').replace(/ك/g, 'ک').replace(/ /g, ' ').trim().replace(/[ \t]*\n[ \t]*/g, '\n');
  return v === '' ? null : v;
}
function parseSheet(xml, sst, ncols){
  const rows = [];
  const re = /<c r="([A-Z]+)(\d+)"([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g; let m;
  while ((m = re.exec(xml))) {
    const ci = colIdx(m[1]); if (ci >= ncols) continue;
    const ri = +m[2] - 1, attrs = m[3], body = m[4]; if (!body) continue;
    const t = (/t="(\w+)"/.exec(attrs) || [])[1];
    let val = null;
    if (t === 'inlineStr') { val = [...body.matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map(x => ent(x[1])).join(''); }
    else { const v = /<v[^>]*>([\s\S]*?)<\/v>/.exec(body); if (!v) continue;
      if (t === 's') val = sst[+v[1]]; else if (t === 'str') val = ent(v[1]); else if (t === 'b') val = v[1] === '1';
      else if (t === 'e') val = null; else val = parseFloat(v[1]); }
    val = normText(val);
    if (val === null || val === undefined) continue;
    if (typeof val === 'number' && Number.isFinite(val) && val === Math.round(val)) val = Math.round(val);
    (rows[ri] || (rows[ri] = new Array(ncols).fill(null)))[ci] = val;
  }
  return rows;
}
async function readWorkbook(buf){
  const z = await unzip(buf);
  const wbx = await z.text('xl/workbook.xml'), rels = await z.text('xl/_rels/workbook.xml.rels');
  const sheets = [...wbx.matchAll(/<sheet\b[^>]*>/g)].map(x => ({
    name: ent((/name="([^"]*)"/.exec(x[0]) || [])[1] || ''), rid: (/r:id="([^"]*)"/.exec(x[0]) || [])[1]}));
  const target = rid => { const r = [...rels.matchAll(/<Relationship\b[^>]*>/g)].find(x => x[0].includes(`Id="${rid}"`));
    let t = /Target="([^"]*)"/.exec(r[0])[1]; return t.startsWith('/') ? t.slice(1) : 'xl/' + t; };
  const ssx = await z.text('xl/sharedStrings.xml'); const sst = [];
  if (ssx) for (const si of ssx.matchAll(/<si>([\s\S]*?)<\/si>/g))
    sst.push([...si[1].replace(/<rPh[\s\S]*?<\/rPh>/g, '').matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map(x => ent(x[1])).join(''));
  if (sheets.length < 2) throw new Error('فایل باید حداقل دو شیت داشته باشد');
  const out = [];
  for (const [i, nc] of [[0, 25], [1, 15]]) {
    const rows = parseSheet(await z.text(target(sheets[i].rid)), sst, nc);
    const hdr = (rows[0] || []).map(h => String(h || '').replace(/\s+/g, ' ').trim());
    out.push({hdr, rows: rows.slice(1).filter(r => r && r[0])});
  }
  return {version: Date.now() / 1000 | 0, h1: out[0].hdr, r1: out[0].rows, h2: out[1].hdr, r2: out[1].rows};
}
if (typeof module !== 'undefined') module.exports = {readWorkbook};
