// СЛУЖЕБНЫЙ СКРИПТ. Он нужен ровно для двух вещей: чтобы прибор ставился на
// устройство как приложение и чтобы он играл без сети — на сцене её может не
// быть вовсе.
//
// Кладём в запас весь прибор целиком: он маленький и состоит из десятка
// файлов. Стратегия — СНАЧАЛА СЕТЬ, потом запас: так свежая версия приезжает
// сама, а без сети играет последняя рабочая. Обратный порядок держал бы
// человека на старой сборке до ручной чистки.
const ЗАПАС = 'otzvuk-1.0';
const ФАЙЛЫ = [
  './', './index.html', './instrument.html', './instrument.js',
  './chaos.worklet.js', './ekran.js', './govor.js', './zamer.js',
  './manifest.json', './znachok-192.png', './znachok-512.png',
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(ЗАПАС).then(з => з.addAll(ФАЙЛЫ)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  // Старые запасы убираем сразу:две версии в памяти телефона ни к чему.
  e.waitUntil(caches.keys()
    .then(имена => Promise.all(имена.filter(и => и !== ЗАПАС).map(и => caches.delete(и))))
    .then(() => self.clients.claim()));
});

self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  e.respondWith(
    fetch(e.request)
      .then(ответ => {
        // В запас кладём только своё и только удачное.
        if (ответ.ok && new URL(e.request.url).origin === location.origin)
          { const копия = ответ.clone(); caches.open(ЗАПАС).then(з => з.put(e.request, копия)); }
        return ответ;
      })
      .catch(() => caches.match(e.request).then(о => о || caches.match('./instrument.html')))
  );
});
