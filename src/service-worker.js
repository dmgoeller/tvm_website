
var ARTICLES_TO_CACHE = [
  'articles/boule.html',
  'articles/clubhaus-mieten.html',
  'articles/datenschutz.html',
  'articles/impressum.html',
  'articles/jugend.html',
  'articles/kontakt.html',
  'articles/mannschaften.html',
  'articles/mitglied-werden.html',
  'articles/mitgliedsbeitraege.html',
  'articles/satzung.html',
  'articles/schnuppertennis.html',
  'articles/sponsoren.html',
  'articles/startseite.html',
  'articles/tennis.html',
  'articles/termine.html',
  'articles/training.html',
  'articles/verein.html',
  'articles/vorstand.html'
];

this.addEventListener('install', function(event) {
  event.waitUntil(Promise.all([
    caches.open('app').then(function(cache) {
      cache.addAll(['index.html', 'manifest.json']);
    }),
    caches.open('articles').then(function(cache) {
      cache.addAll(ARTICLES_TO_CACHE);
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
