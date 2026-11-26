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

// ---------- جدول شیت دوم ----------
let TF = '', TS = null;                                  // متن فیلتر و ترتیب‌دهی
const TW = new Set([2, 3, 11, 12, 13, 14]), TL = new Set([0, 4, 5]);
function tableView(){
  const H = DB.h2;
  main.innerHTML = `<div class="tbar"><input id="tf" type="search" placeholder="فیلتر در جدول (هر ستون)…" value="${esc(TF)}"><button id="csv">دانلود اکسل</button></div><div class="meta" id="tc"></div><div class="tw"><table><thead><tr>${H.map((t, i) => `<th data-c="${i}">${esc(t)}<span class="ar"></span></th>`).join('')}</tr></thead><tbody></tbody></table></div>`;
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
  $('#csv').onclick = () => {
    const q = v => '"' + String(v ?? '').replace(/"/g, '""') + '"';
    const csv = '\uFEFF' + [H, ...shown].map(r => H.map((_, i) => q(r[i])).join(',')).join('\r\n');
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([csv], {type: 'text/csv;charset=utf-8'}));
    a.download = 'pigiri-vizhe.csv'; document.body.appendChild(a); a.click(); a.remove(); toast('فایل ساخته شد (با اکسل باز می‌شود)');
  };
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
