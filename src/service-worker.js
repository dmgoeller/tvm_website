
this.addEventListener('fetch', event => {
  const request = event.request;

  if (request.url == 'manifest.json' || request.url.endsWith('.html')) {
    console.log(`Fetching ${request.url}`);

    event.respondWith(
      (async () => {
        const cache = await caches.open('default');
        try {
          await cache.add(request);
        } catch (error) {
        }
        return await cache.match(request);
      })()
    );
  }
});
