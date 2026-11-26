'use strict';
const $ = s => document.querySelector(s);
const main = $('#main'), q = $('#q');
let DB = null, IDX = [], BY2 = new Map();
const CUR = new Set([15, 16, 20]);               // ستون‌های مبلغ
const GROUPS = [
  ['اطلاعات تقاضا', [1, 2, 3, 8, 9, 10, 11, 14]],
  ['وضعیت', [12, 13]],
  ['تاریخ‌ها', [4, 5, 17, 18, 19]],
  ['اقلام و مبالغ', [6, 7, 15, 16, 20]],
  ['تأمین و تحویل', [21, 22, 23, 24]],
];
const toAscii = s => String(s).replace(/[۰-۹]/g, d => d.charCodeAt(0) - 1776).replace(/[٠-٩]/g, d => d.charCodeAt(0) - 1632);
const normQ = s => toAscii(s).toLowerCase().replace(/ي/g, 'ی').replace(/ك/g, 'ک').replace(/[\s\-]+/g, '').trim();
const esc = s => String(s).replace(/[&<>"]/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;'}[c]));
const fmt = (i, v) => (CUR.has(i) && typeof v === 'number') ? v.toLocaleString('en-US') + (i === 16 ? '' : ' ریال') : String(v);
const empty = v => v === null || v === undefined || v === '' || v === 0;
function toast(m){ const t = $('#toast'); t.textContent = m; t.style.display = 'block'; clearTimeout(toast.t); toast.t = setTimeout(() => t.style.display = 'none', 3500); }

// ---------- ذخیره‌سازی ----------
const idb = () => new Promise((res, rej) => { const r = indexedDB.open('tadarokat', 1); r.onupgradeneeded = () => r.result.createObjectStore('kv'); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
async function kvGet(k){ try { const d = await idb(); return await new Promise(r => { const q = d.transaction('kv').objectStore('kv').get(k); q.onsuccess = () => r(q.result); q.onerror = () => r(null); }); } catch { return null; } }
async function kvSet(k, v){ try { const d = await idb(); return await new Promise((r, j) => { const t = d.transaction('kv', 'readwrite'); t.objectStore('kv').put(v, k); t.oncomplete = r; t.onerror = () => j(t.error); }); } catch (e) { console.warn(e); } }
async function kvDel(k){ try { const d = await idb(); d.transaction('kv', 'readwrite').objectStore('kv').delete(k); } catch {} }

function setData(d, source){
  DB = d; DB.source = source;
  IDX = DB.r1.map(r => normQ(r[0]));
  BY2 = new Map();
  DB.r2.forEach(r => { const k = normQ(r[0]); (BY2.get(k) || BY2.set(k, []).get(k)).push(r); });
  render();
}
async function load(){
  const local = await kvGet('data');
  let bundled = null;
  try { bundled = await (await fetch('data.json', {cache: 'no-cache'})).json(); } catch {}
  const pick = (bundled && (!local || bundled.version > local.version)) ? bundled : (local || bundled);
  if (!pick) { main.innerHTML = '<div class="empty">داده‌ای پیدا نشد. یک بار با اینترنت باز کنید یا فایل اکسل را از ⚙ انتخاب کنید.</div>'; return; }
  if (pick === bundled && bundled) kvSet('data', bundled);
  setData(pick, pick === bundled ? 'داده‌ی برنامه' : 'فایل اکسل واردشده');
}

// ---------- جستجو ----------
function search(raw){
  const n = normQ(raw); if (!n) return {exact: null, list: []};
  let ex = IDX.indexOf(n); if (ex < 0) { const dg = n.replace(/^mt\d*_?/, ''); if (dg.length >= 5) ex = IDX.findIndex(x => x.endsWith(dg) && x.length - dg.length <= 6); }
  const list = [], seen = new Set();
  for (let i = 0; i < IDX.length && list.length < 60; i++) if (IDX[i].includes(n)) { list.push(i); seen.add(i); }
  if (!list.length) {
    const words = toAscii(raw).toLowerCase().replace(/ي/g, 'ی').replace(/ك/g, 'ک').split(/\s+/).filter(Boolean);
    for (let i = 0; i < DB.r1.length && list.length < 60; i++) {
      const r = DB.r1[i], hay = (String(r[1] || '') + ' ' + String(r[2] || '') + ' ' + String(r[3] || '')).toLowerCase();
      if (words.every(w => hay.includes(w))) list.push(i);
    }
    list.byText = true;
  }
  return {exact: ex >= 0 ? ex : null, list};
}
function card(i){
  const r = DB.r1[i], sp = BY2.has(IDX[i]);
  return `<button class="item" data-i="${i}"><div class="id"><span>${esc(r[0])}</span><span>${sp ? '<span class="tag sp">پیگیری ویژه</span> ' : ''}${r[12] ? `<span class="tag">${esc(r[12])}</span>` : ''}</span></div>
  <div class="d">${esc(r[2] || '—')}</div><div class="s">${esc([r[1], r[3]].filter(Boolean).join(' • '))}</div></button>`;
}
function rows(hdr, r, idxs){
  return idxs.filter(i => !empty(r[i]) && r[i] !== 'تعیین نشده').map(i => `<div class="row"><b>${esc(hdr[i])}</b><span${/^[\x00-\x7f\s\d,]+$/.test(String(r[i])) ? ' class="ltr"' : ''}>${esc(fmt(i, r[i]))}</span></div>`).join('');
}
function detail(i, id2){
  const r = DB.r1[i] || null; const key = normQ(DB.r1[i][0]);
  const sp = BY2.get(key) || [];
  let h = `<button class="back" id="bk">→ بازگشت</button><div class="head"><div class="id">${esc(r[0])}</div>${sp.length ? '<span class="tag sp">در فهرست پیگیری ویژه</span>' : ''}</div>`;
  for (const [t, ix] of GROUPS) { const b = rows(DB.h1, r, ix); if (b) h += `<div class="sec"><h2>${t}</h2>${b}</div>`; }
  sp.forEach((s, k) => {
    const b = [13, 14].map(j => s[j] ? `<div class="row"><b>${esc(DB.h2[j])}</b><span>${esc(s[j])}</span></div>` : '').join('') + rows(DB.h2, s, [12, 2, 3].filter(j => j === 12 && s[12] !== r[12]));
    h += `<div class="sec sp"><h2>پیگیری ویژه (شیت دوم)${sp.length > 1 ? ' — ردیف ' + (k + 1) : ''}</h2>${b || '<div class="row"><span>—</span></div>'}</div>`;
  });
  main.innerHTML = h; scrollTo(0, 0);
  $('#bk').onclick = () => { history.back(); };
}
function detail2only(s){ // ردیفی که فقط در شیت دوم است
  let h = `<button class="back" id="bk">→ بازگشت</button><div class="head"><div class="id">${esc(s[0])}</div><span class="tag sp">فقط در شیت دوم (پیگیری ویژه)</span></div>`;
  h += `<div class="sec"><h2>اطلاعات تقاضا</h2>${rows(DB.h2, s, [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12])}</div>`;
  h += `<div class="sec sp"><h2>پیگیری</h2>${rows(DB.h2, s, [13, 14])}</div>`;
  main.innerHTML = h; scrollTo(0, 0); $('#bk').onclick = () => history.back();
}

// ---------- خروجی: xlsx واقعی، عکس JPG، CSV ----------
const xwEnc = new TextEncoder();
const xwCrcT = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
const xwCrc = u => { let c = 0xFFFFFFFF; for (let i = 0; i < u.length; i++) c = xwCrcT[(c ^ u[i]) & 255] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; };
function xwZip(files){                                   // zip بدون فشرده‌سازی (store)
  const parts = [], cd = []; let off = 0;
  const w = (n, f) => { const b = new DataView(new ArrayBuffer(n)); f(b); return new Uint8Array(b.buffer); };
  for (const [name, text] of files) {
    const nm = xwEnc.encode(name), data = xwEnc.encode(text), crc = xwCrc(data);
    const lh = w(30, v => { v.setUint32(0, 0x04034b50, true); v.setUint16(4, 20, true); v.setUint16(6, 0x0800, true); v.setUint16(8, 0, true); v.setUint16(10, 0, true); v.setUint16(12, 0x21, true); v.setUint32(14, crc, true); v.setUint32(18, data.length, true); v.setUint32(22, data.length, true); v.setUint16(26, nm.length, true); v.setUint16(28, 0, true); });
    parts.push(lh, nm, data);
    cd.push(w(46, v => { v.setUint32(0, 0x02014b50, true); v.setUint16(4, 20, true); v.setUint16(6, 20, true); v.setUint16(8, 0x0800, true); v.setUint16(10, 0, true); v.setUint16(12, 0, true); v.setUint16(14, 0x21, true); v.setUint32(16, crc, true); v.setUint32(20, data.length, true); v.setUint32(24, data.length, true); v.setUint16(28, nm.length, true); v.setUint32(42, off, true); }), nm);
    off += 30 + nm.length + data.length;
  }
  const cdSize = cd.reduce((s, x) => s + x.length, 0), n = files.length;
  const end = w(22, v => { v.setUint32(0, 0x06054b50, true); v.setUint16(8, n, true); v.setUint16(10, n, true); v.setUint32(12, cdSize, true); v.setUint32(16, off, true); });
  return new Blob([...parts, ...cd, end], {type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'});
}
const xwEsc = s => String(s).replace(/[&<>"]/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;'}[c])).replace(/[\x00-\x08\x0b\x0c\x0e-\x1f]/g, '');
const xwCol = i => { let s = ''; for (i++; i > 0; i = Math.floor((i - 1) / 26)) s = String.fromCharCode(65 + (i - 1) % 26) + s; return s; };
function makeXlsx(H, rows, widths){
  const X = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n';
  const cell = (v, r, c, st) => { const ref = xwCol(c) + r; if (empty(v)) return `<c r="${ref}" s="${st}"/>`; return typeof v === 'number' ? `<c r="${ref}" s="${st}"><v>${v}</v></c>` : `<c r="${ref}" s="${st}" t="inlineStr"><is><t xml:space="preserve">${xwEsc(v)}</t></is></c>`; };
  const sheet = X + `<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetViews><sheetView rightToLeft="1" workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews><cols>${H.map((_, i) => `<col min="${i + 1}" max="${i + 1}" width="${widths[i]}" customWidth="1"/>`).join('')}</cols><sheetData><row r="1">${H.map((t, c) => cell(t, 1, c, 1)).join('')}</row>${rows.map((r, k) => `<row r="${k + 2}">${H.map((_, c) => cell(r[c], k + 2, c, 2)).join('')}</row>`).join('')}</sheetData><autoFilter ref="A1:${xwCol(H.length - 1)}${rows.length + 1}"/></worksheet>`;
  const styles = X + '<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="2"><font><sz val="11"/><name val="Tahoma"/></font><font><b/><sz val="11"/><color rgb="FFFFFFFF"/><name val="Tahoma"/></font></fonts><fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FF0F4C5C"/></patternFill></fill></fills><borders count="2"><border><left/><right/><top/><bottom/><diagonal/></border><border><left style="thin"><color rgb="FFD0D7DB"/></left><right style="thin"><color rgb="FFD0D7DB"/></right><top style="thin"><color rgb="FFD0D7DB"/></top><bottom style="thin"><color rgb="FFD0D7DB"/></bottom><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="3"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="2" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center" wrapText="1"/></xf><xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyBorder="1" applyAlignment="1"><alignment vertical="top" wrapText="1"/></xf></cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>';
  return xwZip([
    ['[Content_Types].xml', X + '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>'],
    ['_rels/.rels', X + '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>'],
    ['xl/workbook.xml', X + '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="پیگیری ویژه" sheetId="1" r:id="rId1"/></sheets></workbook>'],
    ['xl/_rels/workbook.xml.rels', X + '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>'],
    ['xl/worksheets/sheet1.xml', sheet],
    ['xl/styles.xml', styles],
  ]);
}
function saveBlob(blob, name){ const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 20000); }
function xwWrap(ctx, text, maxW){
  const out = [];
  for (const para of String(text).split('\n')) {
    let line = '';
    for (const word of para.split(/\s+/).filter(Boolean)) {
      const t = line ? line + ' ' + word : word;
      if (ctx.measureText(t).width <= maxW) { line = t; continue; }
      if (line) out.push(line);
      line = word;
      while (ctx.measureText(line).width > maxW && line.length > 1) { let k = line.length - 1; while (k > 1 && ctx.measureText(line.slice(0, k)).width > maxW) k--; out.push(line.slice(0, k)); line = line.slice(k); }
    }
    out.push(line);
  }
  return out;
}
async function makeImages(H, rows, widths, per = 40){
  const S = 1.5, PAD = 8, LH = 20, FONT = '14px Tahoma, "Noto Naskh Arabic", system-ui, sans-serif';
  const W = widths.reduce((s, x) => s + x, 0), blobs = [];
  for (let p = 0; p < rows.length || p === 0; p += per) {
    const chunk = rows.slice(p, p + per), m = document.createElement('canvas').getContext('2d');
    m.font = FONT; m.direction = 'rtl';
    const lay = chunk.map(r => { const ls = H.map((_, i) => empty(r[i]) ? [''] : xwWrap(m, fmtPlain(r[i]), widths[i] - PAD * 2)); return {ls, h: Math.max(...ls.map(l => l.length)) * LH + PAD * 2}; });
    const hdrLines = H.map((t, i) => xwWrap(m, t, widths[i] - PAD * 2)), hh = Math.max(...hdrLines.map(l => l.length)) * LH + PAD * 2;
    const total = 44 + hh + lay.reduce((s, x) => s + x.h, 0);
    const cv = document.createElement('canvas'); cv.width = Math.ceil(W * S); cv.height = Math.ceil(total * S);
    const c = cv.getContext('2d'); c.scale(S, S); c.fillStyle = '#fff'; c.fillRect(0, 0, W, total);
    c.direction = 'rtl'; c.textAlign = 'right'; c.textBaseline = 'middle'; c.font = 'bold 16px Tahoma, system-ui, sans-serif'; c.fillStyle = '#0f4c5c';
    c.fillText(`بانک درخواست — پیگیری ویژه (ردیف ${p + 1} تا ${p + chunk.length})`, W - 10, 22);
    c.font = FONT; let y = 44;
    const xr = []; { let x = W; for (let i = 0; i < H.length; i++) { xr.push(x); x -= widths[i]; } }
    c.fillStyle = '#0f4c5c'; c.fillRect(0, y, W, hh); c.fillStyle = '#fff'; c.font = 'bold 14px Tahoma, system-ui, sans-serif';
    hdrLines.forEach((ls, i) => ls.forEach((t, k) => c.fillText(t, xr[i] - PAD, y + PAD + LH / 2 + k * LH))); y += hh;
    c.font = FONT;
    lay.forEach((row, ri) => {
      if (ri % 2) { c.fillStyle = '#f1f5f7'; c.fillRect(0, y, W, row.h); }
      c.fillStyle = '#16222a'; row.ls.forEach((ls, i) => ls.forEach((t, k) => c.fillText(t, xr[i] - PAD, y + PAD + LH / 2 + k * LH)));
      c.strokeStyle = '#dbe3e7'; c.lineWidth = 1; c.beginPath(); c.moveTo(0, y + row.h); c.lineTo(W, y + row.h); c.stroke(); y += row.h;
    });
    c.beginPath(); for (let i = 0; i <= H.length; i++) { const x = W - widths.slice(0, i).reduce((s, v) => s + v, 0); c.moveTo(x, 44); c.lineTo(x, y); } c.stroke();
    blobs.push(await new Promise(res => cv.toBlob(res, 'image/jpeg', 0.92)));
    if (!rows.length) break;
  }
  return blobs;
}
const fmtPlain = v => String(v);
const XW = [135, 90, 280, 160, 105, 105, 75, 75, 85, 85, 85, 210, 160, 300, 160];     // عرض ستون‌ها (پیکسل)
function exportData(kind, H, rows){
  if (!rows.length) return toast('ردیفی برای خروجی نیست');
  const stamp = new Date().toISOString().slice(0, 10);
  if (kind === 'xlsx') { saveBlob(makeXlsx(H, rows, XW.map(w => Math.round(w / 6.5))), `pigiri-vizhe-${stamp}.xlsx`); toast('فایل اکسل ساخته شد ✔'); }
  else if (kind === 'csv') { const q = v => '"' + String(v ?? '').replace(/"/g, '""') + '"'; saveBlob(new Blob(['\uFEFF' + [H, ...rows].map(r => H.map((_, i) => q(r[i])).join(',')).join('\r\n')], {type: 'text/csv;charset=utf-8'}), `pigiri-vizhe-${stamp}.csv`); toast('فایل CSV ساخته شد ✔'); }
  else { toast('در حال ساخت عکس…'); makeImages(H, rows, XW).then(bs => { bs.forEach((b, i) => setTimeout(() => saveBlob(b, `pigiri-vizhe-${stamp}${bs.length > 1 ? '-' + (i + 1) : ''}.jpg`), i * 700)); toast(bs.length > 1 ? `${bs.length} عکس ساخته شد (هر کدام ۴۰ ردیف)` : 'عکس ساخته شد ✔'); }).catch(e => toast('خطا در ساخت عکس: ' + e.message)); }
}

// ---------- جدول شیت دوم ----------
let TF = '', TS = null;                                  // متن فیلتر و ترتیب‌دهی
const TW = new Set([2, 3, 11, 12, 13, 14]), TL = new Set([0, 4, 5]);
function tableView(){
  const H = DB.h2;
  main.innerHTML = `<div class="tbar"><input id="tf" type="search" placeholder="فیلتر در جدول (هر ستون)…" value="${esc(TF)}"><button id="csv">خروجی</button></div><div class="meta" id="tc"></div><div class="tw"><table><thead><tr>${H.map((t, i) => `<th data-c="${i}">${esc(t)}<span class="ar"></span></th>`).join('')}</tr></thead><tbody></tbody></table></div>`;
  let shown = [];
  const fill = () => {
    const nd = normQ(TF);
    shown = DB.r2.filter(r => !nd || normQ(r.map(v => v ?? '').join(' ')).includes(nd));
    if (TS) shown.sort((x, y) => {
      const a = x[TS.c], b = y[TS.c], na = empty(a), nb = empty(b);
      if (na || nb) return na === nb ? 0 : na ? 1 : -1;
      const c = (typeof a === 'number' && typeof b === 'number') ? a - b : String(a).localeCompare(String(b), 'fa', {numeric: true});
      return TS.d * c;
    });
    $('tbody').innerHTML = shown.map(r => `<tr class="r" data-id="${esc(r[0])}">${H.map((_, i) => `<td class="${TW.has(i) ? 'w' : ''}${TL.has(i) ? ' l' : ''}">${empty(r[i]) ? '' : esc(r[i])}</td>`).join('')}</tr>`).join('');
    $('#tc').textContent = `${shown.length.toLocaleString('en-US')} از ${DB.r2.length.toLocaleString('en-US')} ردیف • برای مرتب‌سازی روی عنوان ستون بزنید • برای جزئیات روی ردیف بزنید`;
    document.querySelectorAll('.tw th .ar').forEach((e, i) => e.textContent = TS && TS.c === i ? (TS.d > 0 ? ' ▲' : ' ▼') : '');
  };
  fill();
  $('#tf').oninput = e => { TF = e.target.value; fill(); };
  document.querySelector('thead').onclick = e => { const t = e.target.closest('th'); if (!t) return; const c = +t.dataset.c; TS = (TS && TS.c === c) ? (TS.d > 0 ? {c, d: -1} : null) : {c, d: 1}; fill(); };
  document.querySelector('tbody').onclick = e => { const tr = e.target.closest('tr'); if (tr) location.hash = '#id=' + encodeURIComponent(tr.dataset.id) + '&v=table'; };
  $('#csv').onclick = () => { $('#xdlg').showModal(); $('#xdlg').dataset.go = ''; };
  $('#xdlg').onclick = e => { const b = e.target.closest('button[data-k]'); if (!b) return; $('#xdlg').close(); exportData(b.dataset.k, H, shown); };
}
function render(){
  const raw = new URLSearchParams(location.hash.slice(1)).get('q') || '';
  const open = new URLSearchParams(location.hash.slice(1)).get('id');
  const view = new URLSearchParams(location.hash.slice(1)).get('v');
  if (!DB) return;
  const isT = view === 'table';
  main.classList.toggle('wide', isT && !open);
  $('#tT').classList.toggle('on', isT); $('#tS').classList.toggle('on', !isT);
  if (open) { const k = normQ(open), i = IDX.indexOf(k); if (i >= 0) return detail(i); const s = BY2.get(k); if (s) return detail2only(s[0]); }
  if (isT) return tableView();
  q.value = raw;
  if (!raw) { main.innerHTML = `<div class="empty">شماره تقاضا را وارد کنید تا اطلاعات کامل آن نمایش داده شود.<br><span class="meta">${DB.r1.length.toLocaleString('en-US')} تقاضا در شیت اول • ${DB.r2.length} ردیف پیگیری ویژه در شیت دوم</span></div>`; return; }
  const {list, exact} = search(raw);
  const s2only = []; const n = normQ(raw);
  for (const [k, v] of BY2) if (k.includes(n) && !IDX.includes(k)) s2only.push(v[0]);
  if (exact !== null && list.length <= 1 && !s2only.length) { location.replace('#id=' + encodeURIComponent(DB.r1[exact][0])); return; }
  main.innerHTML = (list.length || s2only.length) ? `<div class="meta">${list.length >= 60 ? 'بیش از ۶۰' : list.length + s2only.length} نتیجه${list.byText ? ' (جستجو در شرح/واحد/کارشناس)' : ''}</div>` + list.map(card).join('') + s2only.map(s => `<button class="item" data-s="${esc(s[0])}"><div class="id"><span>${esc(s[0])}</span><span class="tag sp">فقط شیت دوم</span></div><div class="d">${esc(s[2] || '—')}</div></button>`).join('')
    : `<div class="empty">موردی با «${esc(raw)}» پیدا نشد.</div>`;
}
main.addEventListener('click', e => { const b = e.target.closest('.item'); if (!b) return; location.hash = '#id=' + encodeURIComponent(b.dataset.s || DB.r1[+b.dataset.i][0]) + '&q=' + encodeURIComponent(q.value); });
$('#f').addEventListener('submit', e => { e.preventDefault(); q.blur(); location.hash = '#q=' + encodeURIComponent(q.value.trim()); });
addEventListener('hashchange', render);
$('#tT').onclick = () => { location.hash = '#v=table'; };
$('#tS').onclick = () => { location.hash = q.value.trim() ? '#q=' + encodeURIComponent(q.value.trim()) : '#'; if (!location.hash || location.hash === '#') render(); };

// ---------- به‌روزرسانی ----------
function info(){ if (!DB) return; $('#info').textContent = `منبع داده: ${DB.source} • ${DB.r1.length.toLocaleString('en-US')} تقاضا • ${DB.r2.length} پیگیری ویژه • نسخه‌ی داده: ${new Date(DB.version * 1000).toLocaleString('fa-IR')}`; }
$('#menu').onclick = () => { info(); $('#dlg').showModal(); };
$('#close').onclick = () => $('#dlg').close();
$('#chk').onclick = async () => {
  try {
    const d = await (await fetch('data.json?_=' + Date.now(), {cache: 'no-store'})).json();
    if (d.version > DB.version) { await kvSet('data', d); setData(d, 'داده‌ی برنامه'); info(); toast('داده‌ها به‌روز شد ✔'); }
    else toast('داده‌های شما آخرین نسخه است');
    reg && reg.update();
  } catch { toast('اتصال اینترنت برقرار نیست'); }
};
$('#file').onchange = async e => {
  const f = e.target.files[0]; if (!f) return; toast('در حال خواندن فایل…');
  try {
    const d = await readWorkbook(await f.arrayBuffer());
    if (!d.r1.length) throw new Error('شیت اول خالی است');
    d.version = Math.floor(Date.now() / 1000); await kvSet('data', d); setData(d, 'فایل اکسل واردشده'); info();
    toast(`انجام شد: ${d.r1.length.toLocaleString('en-US')} تقاضا و ${d.r2.length} پیگیری ویژه`); $('#dlg').close();
  } catch (err) { toast('خطا: ' + err.message); }
  e.target.value = '';
};
$('#reset').onclick = async () => { await kvDel('data'); try { const d = await (await fetch('data.json')).json(); await kvSet('data', d); setData(d, 'داده‌ی برنامه'); info(); toast('به داده‌ی پیش‌فرض برگشت'); } catch { toast('داده‌ی پیش‌فرض در دسترس نیست'); } };

let reg = null;
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('sw.js').then(r => {
    reg = r;
    const show = w => { $('#upd').style.display = 'block'; $('#updbtn').onclick = () => w.postMessage('skip'); };
    if (r.waiting && navigator.serviceWorker.controller) show(r.waiting);
    r.addEventListener('updatefound', () => { const w = r.installing; w.addEventListener('statechange', () => { if (w.state === 'installed' && navigator.serviceWorker.controller) show(w); }); });
    setInterval(() => r.update(), 3600e3);
  }).catch(() => {});
  navigator.serviceWorker.addEventListener('controllerchange', () => location.reload());
}
load();
