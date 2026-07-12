// ============================================================
// notificaciones.js — Inicializa Firebase Messaging en el cliente,
// pide permiso al usuario y guarda el token en el servidor.
// Se carga desde app.ejs después de los scripts de Firebase.
// ============================================================

const firebaseConfig = {
  apiKey:            "AIzaSyBDbb7xMv85sI9r_RhdF9hHXwsQzvllODM",
  authDomain:        "wikistudent-e3e91.firebaseapp.com",
  projectId:         "wikistudent-e3e91",
  storageBucket:     "wikistudent-e3e91.firebasestorage.app",
  messagingSenderId: "427282717226",
  appId:             "1:427282717226:web:3e264d4d92f56a1cfbc153",
  measurementId:     "G-7B5KQ0JWK3",
};

// ── Tu clave pública VAPID (la encuentras en Firebase Console →
//    Project Settings → Cloud Messaging → Web Push certificates) ──
// ⚠️  IMPORTANTE: sustituye este valor por el tuyo real
const VAPID_KEY = "TU_CLAVE_VAPID_PUBLICA_AQUI";

// Inicializar Firebase (evitar doble init si ya se hizo en otro script)
if (!firebase.apps.length) {
  firebase.initializeApp(firebaseConfig);
}
const messaging = firebase.messaging();

// ── Manejar mensajes cuando la pestaña SÍ está abierta (foreground) ──
messaging.onMessage((payload) => {
  console.log("[FCM] Mensaje en primer plano:", payload);

  // Mostramos una notificación nativa igualmente
  const { title, body } = payload.notification || {};
  if (Notification.permission === "granted" && title) {
    new Notification(title, {
      body: body || "",
      icon: "/favicon.ico",
    });
  }
});

// ── Función principal: registrar SW, pedir permiso y guardar token ──
async function inicializarNotificaciones() {
  // 1. El navegador debe soportar Service Workers
  if (!("serviceWorker" in navigator)) {
    console.warn("[FCM] Este navegador no soporta Service Workers.");
    return;
  }

  try {
    // 2. Registrar el Service Worker de Firebase Messaging
    //    Debe estar en la raíz del sitio para poder interceptar rutas "/"
    const swRegistration = await navigator.serviceWorker.register(
      "/firebase-messaging-sw.js"
    );
    console.log("[FCM] Service Worker registrado:", swRegistration.scope);

    // 3. Pedir permiso de notificaciones al usuario
    const permiso = await Notification.requestPermission();
    if (permiso !== "granted") {
      console.log("[FCM] El usuario denegó los permisos de notificación.");
      return;
    }
    console.log("[FCM] Permiso concedido ✅");

    // 4. Obtener el token FCM del dispositivo
    const token = await messaging.getToken({
      vapidKey:'BKUntCMK5no4V1UnQViAz9fpTqffdl8vQBm6RUz9kGekzryx6Wh6ghpLZGojYA4BRzZ7jt-6h2nPjPqalDsqCF0',
      serviceWorkerRegistration: swRegistration,
    });

    if (!token) {
      console.warn("[FCM] No se pudo obtener el token.");
      return;
    }
    console.log("[FCM] Token obtenido:", token);

    // 5. Enviar el token al servidor para guardarlo en la BD
    await fetch("/api/user/notification-token", {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ token }),
    });
    console.log("[FCM] Token guardado en el servidor ✅");

  } catch (err) {
    console.error("[FCM] Error al inicializar notificaciones:", err);
  }
}

// ── Arrancar en cuanto el DOM esté listo ──
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", inicializarNotificaciones);
} else {
  inicializarNotificaciones();
}