// Service Worker DEDICADO a Firebase Cloud Messaging
// Firebase busca este nombre exacto por defecto.

importScripts('https://www.gstatic.com/firebasejs/10.12.5/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.12.5/firebase-messaging-compat.js');

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
  console.log('[FCM-SW] Push recibido en segundo plano:', payload);
  const title = payload.notification?.title || payload.data?.title || 'Nueva notificación';
  const options = {
    body: payload.notification?.body || payload.data?.body || '',
    icon: '/icon-192.png',
    badge: '/icon-192.png',
    data: payload.data || {},
  };
  return self.registration.showNotification(title, options);
});

self.addEventListener('notificationclick', event => {
  event.notification.close();
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(clients => {
      for (const client of clients) {
        if (client.url.includes(self.location.origin) && 'focus' in client) return client.focus();
      }
      if (self.clients.openWindow) return self.clients.openWindow('/');
    })
  );
});