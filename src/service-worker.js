
var PAGES_TO_CACHE = ['pages/startseite.html'];

this.addEventListener('install', function(event) {
  event.waitUntil(Promise.all([
    caches.open('app').then(function(cache) {
      cache.addAll(['index.html', 'manifest.json']);
    }),
    caches.open('pages').then(function(cache) {
      cache.addAll(PAGES_TO_CACHE);
    })
  ]));
});

this.addEventListener('fetch', function(event) {
  event.respondWith(fetch(event.request)
    .catch(function() {
      return caches.match(event.request);
    })
  );
});
