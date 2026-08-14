/* ============================================================
   sonidos.js — Motor de audio 100% generado con Web Audio API.
   No requiere descargar ni alojar ningún archivo .mp3/.wav.

   Se usa desde:
     - settings.js      → botones "Probar sonido" en Ajustes > Sonido
     - pomodoro.js       → alarma al terminar la sesión
     - notificaciones.js → "ping" de las Notificaciones Internas

   Expone un único objeto global: window.WSAudio
   ============================================================ */

(function () {
  'use strict';

  // Un solo AudioContext reutilizado (los navegadores limitan cuántos
  // se pueden crear). Se crea "perezosamente" en el primer sonido,
  // porque Chrome/Safari no permiten crear un AudioContext antes de
  // que el usuario interactúe con la página (gesto de click/tap).
  let ctx = null;
  function getCtx() {
    if (!ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      ctx = new AC();
    }
    // Si el navegador lo suspendió (pestaña en 2º plano, política de
    // autoplay, etc.) lo reanudamos.
    if (ctx.state === 'suspended') ctx.resume();
    return ctx;
  }

  /**
   * Reproduce un tono simple (oscilador + envolvente ADSR básica).
   * @param {AudioContext} audioCtx
   * @param {number} freq       Frecuencia en Hz
   * @param {number} start      Instante de inicio (segundos, relativo a audioCtx.currentTime)
   * @param {number} dur        Duración en segundos
   * @param {number} vol        Volumen 0–1
   * @param {OscillatorType} tipo  'sine' | 'triangle' | 'square' | 'sawtooth'
   */
  function tono(audioCtx, freq, start, dur, vol, tipo = 'sine') {
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = tipo;
    osc.frequency.setValueAtTime(freq, audioCtx.currentTime + start);

    // Envolvente: ataque rápido, caída suave (evita "clics" al inicio/fin)
    const t0 = audioCtx.currentTime + start;
    gain.gain.setValueAtTime(0, t0);
    gain.gain.linearRampToValueAtTime(vol, t0 + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);

    osc.connect(gain).connect(audioCtx.destination);
    osc.start(t0);
    osc.stop(t0 + dur + 0.05);
  }

  /**
   * Ruido blanco corto (útil para "olas" o texturas de fondo).
   */
  function ruido(audioCtx, start, dur, vol) {
    const bufferSize = Math.floor(audioCtx.sampleRate * dur);
    const buffer = audioCtx.createBuffer(1, bufferSize, audioCtx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      // Ruido blanco con caída exponencial para que suene como "shhh" y no como estática pura
      data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / bufferSize, 2);
    }
    const src = audioCtx.createBufferSource();
    src.buffer = buffer;
    const gain = audioCtx.createGain();
    gain.gain.setValueAtTime(vol, audioCtx.currentTime + start);
    src.connect(gain).connect(audioCtx.destination);
    src.start(audioCtx.currentTime + start);
  }

  /* ── Recetas de cada sonido disponible en los <select> de Ajustes ── */

  const RECETAS_ALARMA = {
    campana: (c, v) => {
      tono(c, 880, 0, 1.1, v, 'sine');
      tono(c, 1320, 0.02, 1.0, v * 0.5, 'sine');
    },
    chime: (c, v) => {
      [523.25, 659.25, 783.99].forEach((f, i) => tono(c, f, i * 0.12, 0.6, v, 'triangle'));
    },
    pitido: (c, v) => {
      tono(c, 1000, 0, 0.15, v, 'square');
      tono(c, 1000, 0.22, 0.15, v, 'square');
    },
    nivel: (c, v) => {
      [392, 523.25, 659.25, 783.99].forEach((f, i) => tono(c, f, i * 0.09, 0.35, v, 'square'));
    },
    ola: (c, v) => {
      ruido(c, 0, 1.4, v * 0.6);
      tono(c, 220, 0, 1.2, v * 0.3, 'sine');
    },
    espacio: (c, v) => {
      const osc = c.createOscillator();
      const gain = c.createGain();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(120, c.currentTime);
      osc.frequency.exponentialRampToValueAtTime(900, c.currentTime + 1.1);
      gain.gain.setValueAtTime(0, c.currentTime);
      gain.gain.linearRampToValueAtTime(v, c.currentTime + 0.1);
      gain.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + 1.2);
      osc.connect(gain).connect(c.destination);
      osc.start();
      osc.stop(c.currentTime + 1.25);
    },
  };

  const RECETAS_NOTIF = {
    none: () => {},
    msg: (c, v) => {
      tono(c, 700, 0, 0.09, v, 'sine');
      tono(c, 900, 0.09, 0.12, v, 'sine');
    },
    soft: (c, v) => {
      tono(c, 660, 0, 0.4, v * 0.8, 'sine');
    },
    alert: (c, v) => {
      tono(c, 950, 0, 0.12, v, 'square');
      tono(c, 950, 0.16, 0.12, v, 'square');
      tono(c, 950, 0.32, 0.12, v, 'square');
    },
  };

  /**
   * Reproduce el sonido de alarma del Pomodoro.
   * @param {string} nombre  clave de RECETAS_ALARMA (campana, chime, pitido, nivel, ola, espacio)
   * @param {number} volumenPct 0–100
   */
  function playAlarma(nombre, volumenPct = 70) {
    const receta = RECETAS_ALARMA[nombre] || RECETAS_ALARMA.chime;
    try {
      const c = getCtx();
      receta(c, Math.max(0, Math.min(1, volumenPct / 100)));
    } catch (err) {
      console.warn('[WSAudio] No se pudo reproducir la alarma:', err);
    }
  }

  /**
   * Reproduce el sonido de una Notificación Interna.
   * @param {string} nombre  clave de RECETAS_NOTIF (none, msg, soft, alert)
   * @param {number} volumenPct 0–100
   */
  function playNotif(nombre, volumenPct = 40) {
    if (!nombre || nombre === 'none') return;
    const receta = RECETAS_NOTIF[nombre] || RECETAS_NOTIF.msg;
    try {
      const c = getCtx();
      receta(c, Math.max(0, Math.min(1, volumenPct / 100)));
    } catch (err) {
      console.warn('[WSAudio] No se pudo reproducir la notificación:', err);
    }
  }

  /* ── Preferencias guardadas por el usuario (Ajustes > Sonido) ── */
  function getPrefs() {
    return {
      pomodoroSound: localStorage.getItem('ws_pomodoro_sound') || 'chime',
      pomodoroVol:   Number(localStorage.getItem('ws_pomodoro_vol') ?? 70),
      notifSound:    localStorage.getItem('ws_notif_sound') || 'none',
      notifVol:      Number(localStorage.getItem('ws_notif_vol') ?? 40),
      alarmRepeat:   localStorage.getItem('ws_alarm_repeat') !== 'false', // true por defecto
    };
  }

  /** Reproduce la alarma del pomodoro usando las preferencias guardadas.
   *  Si "repetir alarma" está activo, suena 3 veces (cada 900ms) hasta que
   *  el usuario confirme el modal de fin de sesión (ver pomodoro.js). */
  function playAlarmaGuardada() {
    const { pomodoroSound, pomodoroVol } = getPrefs();
    playAlarma(pomodoroSound, pomodoroVol);
  }

  function playNotifGuardada() {
    const { notifSound, notifVol } = getPrefs();
    playNotif(notifSound, notifVol);
  }

  window.WSAudio = {
    getCtx,
    playAlarma,
    playNotif,
    getPrefs,
    playAlarmaGuardada,
    playNotifGuardada,
  };
})();
