// Service worker do EasyGlowCare (spec do 0D, seção 4). Só guarda a página "Sem conexão":
// nenhum dado de cliente fica no aparelho (LGPD). Mude a versão para trocar o cache.
const CACHE_NAME = "egc-offline-v1";
const OFFLINE_URL = "/offline.html";

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.add(new Request(OFFLINE_URL, { cache: "reload" }))),
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((names) => Promise.all(names.filter((name) => name !== CACHE_NAME).map((name) => caches.delete(name))))
      .then(() => self.clients.claim()),
  );
});

// Só navegações (páginas): tenta a rede e, sem rede, mostra a página "Sem conexão".
// Nenhuma outra requisição é interceptada nem guardada.
self.addEventListener("fetch", (event) => {
  if (event.request.mode !== "navigate") return;
  event.respondWith(
    fetch(event.request).catch(async () => (await caches.match(OFFLINE_URL)) ?? Response.error()),
  );
});
