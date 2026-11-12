/* Service Worker - تدبير المخزون والتوزيع */
const VERSION = 'v3';
const SHELL = 'stock-shell-' + VERSION;
const RUNTIME = 'stock-runtime-' + VERSION;
const SHELL_FILES = ['./', './index.html', './manifest.webmanifest', './icons/icon-192.png', './icons/icon-512.png', './icons/apple-touch-icon.png', './favicon.ico'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(SHELL).then(c => Promise.all(SHELL_FILES.map(u => c.add(u).catch(() => null)))).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => ![SHELL, RUNTIME].includes(k)).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});

self.addEventListener('message', e => { if (e.data === 'SKIP_WAITING') self.skipWaiting(); });

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  // قاعدة البيانات والمصادقة: دائماً من الشبكة (Firestore يدير وضعه دون اتصال بنفسه)
  if (/firestore\.googleapis\.com|firebaseio\.com|identitytoolkit|securetoken/.test(url.hostname)) return;

  // صفحات التطبيق: الشبكة أولاً ثم النسخة المخزنة
  if (req.mode === 'navigate') {
    e.respondWith(fetch(req).then(res => {
      const copy = res.clone(); caches.open(SHELL).then(c => c.put('./index.html', copy)); return res;
    }).catch(() => caches.match('./index.html').then(r => r || caches.match('./'))));
    return;
  }

  // ملفات التطبيق من نفس النطاق: المخزن أولاً مع تحديث في الخلفية
  // المكتبات والخطوط الخارجية: نفس الأسلوب
  e.respondWith(caches.match(req).then(cached => {
    const net = fetch(req).then(res => {
      if (res && (res.ok || res.type === 'opaque')) { const copy = res.clone(); caches.open(url.origin === location.origin ? SHELL : RUNTIME).then(c => c.put(req, copy)); }
      return res;
    }).catch(() => cached);
    return cached || net;
  }));
});
