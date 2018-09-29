
var PAGES_TO_CACHE = [
  'pages/boule.html',
  'pages/clubhaus-mieten.html',
  'pages/datenschutz.html',
  'pages/impressum.html',
  'pages/jugend.html',
  'pages/kontakt.html',
  'pages/mannschaften.html',
  'pages/mitglied-werden.html',
  'pages/mitgliedsbeitraege.html',
  'pages/satzung.html',
  'pages/schnuppertennis.html',
  'pages/sponsoren.html',
  'pages/startseite.html',
  'pages/tennis.html',
  'pages/termine.html',
  'pages/training.html',
  'pages/verein.html',
  'pages/vorstand.html'
];

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
