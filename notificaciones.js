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

// ============================================================
// NOTIFICACIONES INTERNAS
// ------------------------------------------------------------
// Estas son distintas de las notificaciones Push de arriba:
// no dependen del permiso del navegador ni de que el Service
// Worker esté registrado. Son avisos visuales (una tarjeta
// "toast" flotante) + un sonido generado con Web Audio API
// (ver sonidos.js), pensados para eventos que ocurren MIENTRAS
// el usuario tiene la pestaña abierta (fin de Pomodoro,
// recordatorio de agenda, logro desbloqueado, etc.).
//
// Se usan así desde cualquier otro script:
//   window.WSNotify.mostrarInterna("Título", "Cuerpo del mensaje");
// ============================================================
(function () {
  function crearContenedor() {
    let cont = document.getElementById("ws-notif-container");
    if (!cont) {
      cont = document.createElement("div");
      cont.id = "ws-notif-container";
      document.body.appendChild(cont);
    }
    return cont;
  }

  /**
   * Muestra una "Notificación Interna": tarjeta visual dentro de la
   * propia web + sonido (según lo configurado en Ajustes > Sonido).
   * @param {string} titulo
   * @param {string} cuerpo
   * @param {string} icono  nombre de un icono Material Symbols (opcional)
   */
  function mostrarInterna(titulo, cuerpo = "", icono = "notifications") {
    const cont = crearContenedor();

    const card = document.createElement("div");
    card.className = "ws-notif-card";
    card.innerHTML = `
      <span class="material-symbols-outlined ws-notif-card__icon">${icono}</span>
      <div class="ws-notif-card__texto">
        <div class="ws-notif-card__titulo">${titulo}</div>
        ${cuerpo ? `<div class="ws-notif-card__cuerpo">${cuerpo}</div>` : ""}
      </div>
      <button type="button" class="ws-notif-card__cerrar" aria-label="Cerrar">✕</button>
    `;
    cont.appendChild(card);

    // Sonido de la notificación interna, usando la preferencia guardada
    // en Ajustes > Sonido > Notificaciones sonoras.
    window.WSAudio?.playNotifGuardada?.();

    requestAnimationFrame(() => card.classList.add("ws-notif-card--visible"));

    function cerrar() {
      card.classList.remove("ws-notif-card--visible");
      setTimeout(() => card.remove(), 300);
    }
    card.querySelector(".ws-notif-card__cerrar").addEventListener("click", cerrar);
    const auto = setTimeout(cerrar, 6000);
    card.addEventListener("mouseenter", () => clearTimeout(auto));
  }

  window.WSNotify = { mostrarInterna };
})();