const V = 'bank-darkhast-v2';            // با هر تغییر در فایل‌های برنامه این عدد را زیاد کنید
const SHELL = ['./', 'index.html', 'app.js', 'xlsx.js', 'manifest.webmanifest', 'icon-192.png', 'icon-512.png'];
self.addEventListener('install', e => e.waitUntil(caches.open(V).then(c => c.addAll(SHELL))));
self.addEventListener('activate', e => e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== V).map(k => caches.delete(k)))).then(() => clients.claim())));
self.addEventListener('message', e => { if (e.data === 'skip') self.skipWaiting(); });
self.addEventListener('fetch', e => {
  const u = new URL(e.request.url); if (e.request.method !== 'GET' || u.origin !== location.origin) return;
  if (u.pathname.endsWith('data.json')) {            // داده: اول شبکه، بعد حافظه‌ی نهان
    e.respondWith(fetch(e.request).then(r => { caches.open(V).then(c => c.put('data.json', r.clone())); return r; }).catch(() => caches.match('data.json')));
    return;
  }
  e.respondWith(caches.match(e.request, {ignoreSearch: true}).then(r => r || fetch(e.request)));
});
