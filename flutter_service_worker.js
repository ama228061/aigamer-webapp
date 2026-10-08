// Retire only the former Flutter caches and registration.
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      await Promise.all(
        ["flutter-app-cache", "flutter-temp-cache", "flutter-app-manifest"].map(
          (name) => caches.delete(name),
        ),
      );
      await self.registration.unregister();
      await self.clients.claim();
    })(),
  );
});
