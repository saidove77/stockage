/* تدبير المخزون والتوزيع — Service Worker
   - الصفحة الرئيسية: الشبكة أولاً (لتصل التحديثات فوراً) مع نسخة احتياطية دون اتصال
   - المكتبات والخطوط الخارجية: تُخزَّن عند أول استعمال لتعمل دون إنترنت
   - طلبات Firebase/Firestore لا تُعترَض أبداً */
const VERSION = 'v5';
const SHELL = 'stock-shell-' + VERSION;
const RUNTIME = 'stock-runtime-' + VERSION;
const PRECACHE = [
  './', './index.html', './manifest.webmanifest',
  './favicon.ico', './icons/favicon-32.png',
  './icons/icon-192.png', './icons/icon-512.png',
  './icons/maskable-192.png', './icons/maskable-512.png',
  './icons/apple-touch-icon.png'
];
const CDN_HOSTS = [
  'cdn.tailwindcss.com', 'cdnjs.cloudflare.com', 'cdn.jsdelivr.net',
  'fonts.googleapis.com', 'fonts.gstatic.com', 'www.gstatic.com'
];
const SKIP_HOSTS = ['firestore.googleapis.com', 'firebaseinstallations.googleapis.com',
  'identitytoolkit.googleapis.com', 'securetoken.googleapis.com', 'firebase.googleapis.com'];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(SHELL).then(c => Promise.all(
      PRECACHE.map(u => c.add(new Request(u, { cache: 'reload' })).catch(() => {}))
    )).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => ![SHELL, RUNTIME].includes(k)).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('message', e => { if (e.data === 'SKIP_WAITING') self.skipWaiting(); });

async function networkFirst(req, cacheName, fallbackKey) {
  const cache = await caches.open(cacheName);
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 6000);
    const res = await fetch(req, { signal: ctrl.signal });
    clearTimeout(t);
    if (res && res.ok) cache.put(fallbackKey || req, res.clone());
    return res;
  } catch (err) {
    const hit = (await cache.match(fallbackKey || req)) || (await caches.match(fallbackKey || req));
    if (hit) return hit;
    throw err;
  }
}

async function staleWhileRevalidate(req) {
  const cache = await caches.open(RUNTIME);
  const hit = await cache.match(req);
  const net = fetch(req).then(res => {
    if (res && (res.ok || res.type === 'opaque')) cache.put(req, res.clone());
    return res;
  }).catch(() => null);
  return hit || (await net) || Response.error();
}

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (SKIP_HOSTS.includes(url.hostname)) return;

  // التنقل بين الصفحات
  if (req.mode === 'navigate') {
    e.respondWith(networkFirst(req, SHELL, './index.html').catch(() => caches.match('./index.html')));
    return;
  }
  // ملفات التطبيق نفسها
  if (url.origin === location.origin) {
    e.respondWith(staleWhileRevalidate(req));
    return;
  }
  // المكتبات والخطوط الخارجية
  if (CDN_HOSTS.includes(url.hostname)) {
    e.respondWith(staleWhileRevalidate(req));
  }
});
