// Service worker: кэширует файлы приложения, чтобы оно работало без интернета.
// При изменении любого файла приложения увеличьте номер версии ниже.
const VERSION = 'gym-tracker-v9';
const FILES = [
  './', './index.html', './styles.css', './manifest.webmanifest',
  './js/app.js', './js/util.js', './js/db.js', './js/store.js', './js/charts.js', './js/theme.js',
  './js/views/home.js', './js/views/workouts.js', './js/views/measures.js', './js/views/progress.js', './js/views/data.js',
  './icons/icon-192.png', './icons/icon-512.png', './icons/icon-maskable-512.png', './icons/apple-touch-icon.png',
  './icons/dumbbell.png',
  './js/account.js', './js/account-db.js', './js/firebase.js',
  './js/vendor/firebase-app.js', './js/vendor/firebase-auth.js', './js/vendor/firebase-firestore.js',
];

self.addEventListener('install', (event) => {
  const files = FILES.map((file) => new Request(file, { cache: 'reload' }));
  event.waitUntil(caches.open(VERSION).then((c) => c.addAll(files)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k.startsWith('gym-tracker-v') && k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()));
});

// Все модули одной версии устанавливаются вместе.
self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;
  event.respondWith(
    caches.open(VERSION).then(async (cache) => {
      const cached = await cache.match(req, { ignoreSearch: true });
      if (cached) return cached;
      const res = await fetch(req).catch(() => null);
      if (res) return res;
      if (req.mode === 'navigate') return (await cache.match('./index.html')) || Response.error();
      return Response.error();
    }));
});
