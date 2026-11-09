/* Service worker — تدبير المخزون والتوزيع
   - يخزّن واجهة التطبيق ليعمل دون اتصال بعد أول زيارة
   - لا يعترض طلبات Firebase/Firestore (البيانات تبقى مباشرة وحديثة) */
const VERSION = 'v1.0.5';
const SHELL = `shell-${VERSION}`;
const RUNTIME = `runtime-${VERSION}`;

const SHELL_FILES = [
  './',
  './index.html',
  './manifest.webmanifest',
  './favicon.ico',
  './icons/favicon-32.png',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-512.png',
  './icons/apple-touch-icon.png'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(SHELL).then(cache =>
      Promise.all(SHELL_FILES.map(url => cache.add(url).catch(() => null)))
    ).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => ![SHELL, RUNTIME].includes(k)).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

const isFirebaseData = url =>
  /(^|\.)firestore\.googleapis\.com$/.test(url.hostname) ||
  /(^|\.)firebaseio\.com$/.test(url.hostname) ||
  /(^|\.)identitytoolkit\.googleapis\.com$/.test(url.hostname) ||
  /(^|\.)securetoken\.googleapis\.com$/.test(url.hostname) ||
  url.pathname.includes('/google.firestore.');

self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (isFirebaseData(url)) return;                 // دع المتصفح يتعامل معها مباشرة

  // صفحات التطبيق: الشبكة أولاً ثم النسخة المخزّنة
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req).then(res => {
        const copy = res.clone();
        caches.open(SHELL).then(c => c.put('./index.html', copy));
        return res;
      }).catch(() => caches.match('./index.html').then(r => r || caches.match('./')))
    );
    return;
  }

  // باقي الملفات (خطوط، مكتبات CDN، صور): من الذاكرة أولاً مع التحديث في الخلفية
  event.respondWith(
    caches.match(req).then(cached => {
      const network = fetch(req).then(res => {
        if (res && (res.ok || res.type === 'opaque')) {
          const copy = res.clone();
          caches.open(RUNTIME).then(c => c.put(req, copy));
        }
        return res;
      }).catch(() => cached);
      return cached || network;
    })
  );
});

self.addEventListener('message', e => {
  if (e.data === 'SKIP_WAITING') self.skipWaiting();
});
