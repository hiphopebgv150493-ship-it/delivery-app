// ===== PARTE 1: CACHÉ =====
const CACHE_NAME = 'delivery-app-v3'; // <-- CAMBIADO A v3 PARA FORZAR ACTUALIZACIÓN
const APP_FILES = [
  './',
  './index.html',
  './styles.css',
  './app.js',
  './firebase-config.js',
  './manifest.json',
  './icon-192.png',
  './icon-512.png',
];
const CDN_FILES = [
  'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css',
  'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js',
  'https://fonts.googleapis.com/css2?family=DM+Mono:wght@400;500&family=DM+Sans:wght@400;500;600;700&family=Manrope:wght@400;500;600;700;800&display=swap',
];

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);
    await cache.addAll(APP_FILES);
    await Promise.allSettled(CDN_FILES.map(async url => {
      const response = await fetch(url, { mode: 'no-cors' });
      await cache.put(url, response);
    }));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const cacheNames = await caches.keys();
    await Promise.all(cacheNames
      .filter(cacheName => cacheName.startsWith('delivery-app-') && cacheName !== CACHE_NAME)
      .map(cacheName => caches.delete(cacheName)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  const firebaseRequest = url.hostname.endsWith('.firebaseio.com')
    || url.hostname.endsWith('.firebasedatabase.app')
    || url.hostname === 'identitytoolkit.googleapis.com'
    || url.hostname === 'securetoken.googleapis.com';
  const nominatimRequest = url.hostname === 'nominatim.openstreetmap.org';
  if (firebaseRequest || nominatimRequest) {
    event.respondWith((async () => {
      const cache = await caches.open(CACHE_NAME);
      try {
        const response = await fetch(request);
        if (response.ok) await cache.put(request, response.clone());
        return response;
      } catch (error) {
        const cachedResponse = await cache.match(request);
        if (cachedResponse) return cachedResponse;
        throw error;
      }
    })());
    return;
  }
  if (url.origin === self.location.origin || CDN_FILES.includes(request.url)) {
    event.respondWith((async () => {
      const cache = await caches.open(CACHE_NAME);
      const cachedResponse = await cache.match(request);
      if (cachedResponse) return cachedResponse;
      const response = await fetch(request);
      if (response.ok || response.type === 'opaque') {
        await cache.put(request, response.clone());
      }
      return response;
    })());
  }
});

// ===== PARTE 2: FIREBASE Y NOTIFICACIONES =====
try {
  // Usamos unpkg en lugar de gstatic para evitar NetworkError en importScripts
  importScripts('https://unpkg.com/firebasejs@10.12.5/firebase-app-compat.js');
  importScripts('https://unpkg.com/firebasejs@10.12.5/firebase-messaging-compat.js');
} catch (error) {
  console.error('[SW] Error al cargar los scripts de Firebase desde unpkg:', error);
}

if (typeof firebase !== 'undefined') {
  try {
    firebase.initializeApp({
      apiKey: "AIzaSyDnZyOJ6Sa3UQ5qtzaksh2jyJnOixGuUcI",
      authDomain: "deliveryapp-877d9.firebaseapp.com",
      databaseURL: "https://deliveryapp-877d9-default-rtdb.firebaseio.com",
      projectId: "deliveryapp-877d9",
      storageBucket: "deliveryapp-877d9.firebasestorage.app",
      messagingSenderId: "347492385299",
      appId: "1:347492385299:web:d045c5ecd92feb2524f5e6"
    });

    const messaging = firebase.messaging();

    messaging.onBackgroundMessage((payload) => {
      console.log('[SW] Notificación en segundo plano:', payload);
      const notificationTitle = payload.notification?.title || 'Nueva notificación';
      const notificationOptions = {
        body: payload.notification?.body || '',
        icon: '/icon-192.png'
      };
      self.registration.showNotification(notificationTitle, notificationOptions);
    });
  } catch (error) {
    console.error('[SW] Error al inicializar Firebase:', error);
  }
} else {
  console.error('[SW] Firebase no está definido. Revisa importScripts.');
}