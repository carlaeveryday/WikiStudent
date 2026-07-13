// 1. Importamos las librerías de Firebase dentro del Service Worker
importScripts('https://www.gstatic.com/firebasejs/9.0.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/9.0.0/firebase-messaging-compat.js');

// 2. Configuración de Firebase (mismas claves que en notificaciones.js)
const firebaseConfig = {
  apiKey: "AIzaSyBDbb7xMv85sI9r_RhdF9hHXwsQzvllODM",
  authDomain: "wikistudent-e3e91.firebaseapp.com",
  projectId: "wikistudent-e3e91",
  storageBucket: "wikistudent-e3e91.firebasestorage.app",
  messagingSenderId: "427282717226",
  appId: "1:427282717226:web:3e264d4d92f56a1cfbc153",
  measurementId: "G-7B5KQ0JWK3"
};

// 3. Inicializamos Firebase en el Service Worker
firebase.initializeApp(firebaseConfig);
const messaging = firebase.messaging();

// 4. Mostramos la notificación cuando el usuario NO está en la web (background/cerrada)
//    NOTA: Solo debe haber UN onBackgroundMessage. El duplicado que había antes causaba
//    que el primer handler se cancelaba y las notificaciones nunca se mostraban.
messaging.onBackgroundMessage((payload) => {
  console.log('[SW] Notificación en segundo plano recibida:', payload);

  const titulo = payload.notification.title;
  const opciones = {
    body: payload.notification.body,
    icon: '/wiki/favicon.png',   // logo de WikiStudent, cuadrado, fondo sólido (no transparente, se ve mal en Android)
    badge: '/wiki/badge-72.png',  // versión monocromo/silueta del logo, sin color — Android lo tinta él solo
    vibrate: [150, 80, 150],       // aviso corto y claro, no exagerado
    requireInteraction: true,      // ESTO es lo importante para ti: si no, en muchos navegadores desaparece a los 5s y el usuario ni la ve
    actions: [
      { action: 'ver', title: '📋 Ver tarea' },
      { action: 'posponer', title: '⏰ +10 min' }
    ]
  };

  self.registration.showNotification(titulo, opciones);
});