// Service worker: rende l'app installabile e veloce da riaprire.
// Strategia "prima la rete": vedi sempre l'ultima versione pubblicata; la cache serve solo se sei offline.
// I dati (Supabase) non passano mai dalla cache.
const CACHE = 'workoutdb-v3';
const SHELL = [
  './', './index.html', './css/style.css', './manifest.webmanifest',
  './js/app.js', './js/config.js', './js/db.js', './js/icons.js', './js/training.js', './js/utils.js',
  './js/views/auth.js', './js/views/common.js', './js/views/home.js', './js/views/plan.js',
  './js/views/report.js', './js/views/user.js', './js/views/workout.js',
  './icons/icon-192.png', './icons/icon.svg',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).catch(() => {}));
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))));
  self.clients.claim();
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.hostname.endsWith('supabase.co') || url.hostname.endsWith('supabase.in')) return;
  e.respondWith(
    fetch(req)
      .then((res) => {
        if (res.ok && (url.origin === location.origin || /cdn\.jsdelivr\.net|cdnjs\.cloudflare\.com|fonts\.(googleapis|gstatic)\.com/.test(url.hostname))) {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(req, copy));
        }
        return res;
      })
      .catch(() => caches.match(req).then((r) => r || caches.match('./index.html'))),
  );
});
