// Configuración web del proyecto Firebase de RutaLista.
export const firebaseConfig = {
  apiKey: 'AIzaSyDnZyOJ6Sa3UQ5qtzaksh2jyJnOixGuUcI',
  authDomain: 'deliveryapp-877d9.firebaseapp.com',
  databaseURL: 'https://deliveryapp-877d9-default-rtdb.firebaseio.com',
  projectId: 'deliveryapp-877d9',
  storageBucket: 'deliveryapp-877d9.firebasestorage.app',
  messagingSenderId: '347492385299',
  appId: '1:347492385299:web:d045c5ecd92feb2524f5e6',
  measurementId: 'G-RSENCZHEHE',
};

export function isFirebaseConfigured() {
  return Boolean(firebaseConfig.apiKey && firebaseConfig.databaseURL && firebaseConfig.projectId && firebaseConfig.appId);
}
