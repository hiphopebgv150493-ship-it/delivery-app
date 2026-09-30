// ===== PARTE 2: FIREBASE Y NOTIFICACIONES =====
try {
  importScripts('https://www.gstatic.com/firebasejs/10.12.5/firebase-app-compat.js');
  importScripts('https://www.gstatic.com/firebasejs/10.12.5/firebase-messaging-compat.js');
} catch (error) {
  console.error('[SW] Error al cargar los scripts de Firebase:', error);
}

if (typeof firebase !== 'undefined') {
  try {
    firebase.initializeApp({
      apiKey: "AIzaSyDnZyOJ6Sa3UQ5qtzaksh2jyJnOixGuUcI",
      authDomain: "deliveryapp-877d9.firebaseapp.com",
      databaseURL: "https://deliveryapp-877d9-default-rtdb.firebaseio.com", // Añadido por si acaso
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