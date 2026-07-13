/**
 * WikiStudent — static/onboarding.js
 *
 * Lógica del paso de onboarding:
 *  1. Valida el input en tiempo real (formato + disponibilidad vía API).
 *  2. Al guardar, llama a PATCH /auth/onboarding para:
 *     - Actualizar username en la BD.
 *     - Marcar perfil_completado = true.
 *  3. Redirige al Dashboard y refleja el nuevo nombre globalmente.
 */

'use strict';

/* ── Elementos del DOM ──────────────────────────────────────── */
const input      = document.getElementById('username-input');
const saveBtn    = document.getElementById('ob-save-btn');
const feedback   = document.getElementById('ob-feedback');
const statusIcon = document.getElementById('ob-status-icon');
const ruleLength = document.getElementById('rule-length');
const ruleChars  = document.getElementById('rule-chars');
const ruleUnique = document.getElementById('rule-unique');

/* ── Estado interno ─────────────────────────────────────────── */
let debounceTimer  = null;   // para el check de disponibilidad
let isAvailable    = false;  // resultado del último check de unicidad
let isFormatValid  = false;  // ¿cumple longitud y caracteres?

/* ── Regex permitida: letras, números, guion, punto ─────────── */
const VALID_CHARS = /^[a-zA-Z0-9_.\-]+$/;

/* ══════════════════════════════════════════════════════════════
   VALIDACIÓN DE FORMATO (síncrona)
   ══════════════════════════════════════════════════════════════ */

/**
 * Comprueba longitud y caracteres.
 * Actualiza las reglas visuales y devuelve true si es válido.
 * @param {string} value
 * @returns {boolean}
 */
function validateFormat(value) {
  const lenOk   = value.length >= 3 && value.length <= 30;
  const charsOk = value.length === 0 || VALID_CHARS.test(value);

  // ── Regla: longitud ────────────────────────────────────────
  setRule(ruleLength, lenOk);

  // ── Regla: caracteres ──────────────────────────────────────
  setRule(ruleChars, charsOk);

  return lenOk && charsOk;
}

/** Aplica la clase visual a una regla según si está cumplida. */
function setRule(el, ok) {
  if (ok) {
    el.classList.add('ob-rule--ok');
    el.querySelector('.material-symbols-rounded').textContent = 'check_circle';
  } else {
    el.classList.remove('ob-rule--ok');
    el.querySelector('.material-symbols-rounded').textContent = 'circle';
  }
}

/* ══════════════════════════════════════════════════════════════
   CHECK DE DISPONIBILIDAD (asíncrono, con debounce)
   ══════════════════════════════════════════════════════════════ */

/**
 * Llama a GET /auth/check-username?username=X
 * Actualiza la UI según la respuesta.
 * @param {string} value
 */
async function checkAvailability(value) {
  setStatus('loading');
  setFeedback('', '');
  setRule(ruleUnique, false);

  try {
    const res  = await fetch(`/auth/check-username?username=${encodeURIComponent(value)}`);
    const data = await res.json();

    if (data.available) {
      isAvailable = true;
      setStatus('valid');
      setRule(ruleUnique, true);
      setFeedback('¡Nombre disponible!', 'success');
      input.classList.remove('ob-input--invalid');
      input.classList.add('ob-input--valid');
    } else {
      isAvailable = false;
      setStatus('invalid');
      setFeedback('Ese nombre ya está en uso. Prueba otro.', 'error');
      input.classList.remove('ob-input--valid');
      input.classList.add('ob-input--invalid');
    }
  } catch (_) {
    // Error de red — no bloqueamos el flujo, solo avisamos
    isAvailable = false;
    setStatus('', '');
    setFeedback('No se pudo verificar la disponibilidad. Inténtalo de nuevo.', 'error');
  }

  updateSaveBtn();
}

/* ── Helpers de UI ──────────────────────────────────────────── */

function setStatus(type, icon) {
  statusIcon.textContent = icon;
  statusIcon.className = type ? `status--${type}` : '';
}

function setFeedback(msg, type) {
  feedback.textContent = msg;
  feedback.className   = 'ob-feedback' + (type ? ` ob-feedback--${type}` : '');
}

function updateSaveBtn() {
  const ok = isFormatValid && isAvailable;
  saveBtn.disabled = !ok;
}

/* ══════════════════════════════════════════════════════════════
   LISTENER DEL INPUT
   ══════════════════════════════════════════════════════════════ */

input.addEventListener('input', () => {
  const value = input.value.trim();

  // 1. Validación de formato (inmediata)
  isFormatValid = validateFormat(value);
  isAvailable   = false;
  updateSaveBtn();

  // 2. Limpiar estado previo
  input.classList.remove('ob-input--valid', 'ob-input--invalid');
  setStatus('', '');
  setFeedback('', '');
  setRule(ruleUnique, false);

  // 3. Si el formato no es válido, no chequeamos unicidad
  if (!isFormatValid) return;

  // 4. Debounce de 500 ms para la llamada al servidor
  clearTimeout(debounceTimer);
  debounceTimer = setTimeout(() => checkAvailability(value), 500);
});

/* ══════════════════════════════════════════════════════════════
   GUARDAR — llamada al servidor
   ══════════════════════════════════════════════════════════════ */

saveBtn.addEventListener('click', async () => {
  const username = input.value.trim();

  if (!isFormatValid || !isAvailable) return;

  // Modo loading
  saveBtn.disabled        = true;
  saveBtn.setAttribute('aria-busy', 'true');

  try {
    const res = await fetch('/auth/onboarding', {
      method:  'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ username }),
    });

    const data = await res.json();

    if (res.ok && data.success) {
      // ── Éxito: pequeña animación antes de redirigir ───────────
      saveBtn.setAttribute('aria-busy', 'false');
      saveBtn.disabled = false;

      // Mostrar confirmación visual en el botón
      saveBtn.innerHTML = `
        <span class="material-symbols-rounded" style="font-variation-settings:'FILL' 1;color:#16d644;">check_circle</span>
        <span style="color:#fff;font-weight:700;">¡Listo! Entrando al Dashboard…</span>
      `;

      // Redirigir tras un breve instante (UX: el usuario ve el checkmark)
      setTimeout(() => {
        window.location.href = '/web';
      }, 800);

    } else {
      // El servidor devolvió un error (p. ej. nombre duplicado por race condition)
      throw new Error(data.error || 'Error desconocido.');
    }

  } catch (err) {
    saveBtn.setAttribute('aria-busy', 'false');
    saveBtn.disabled = false;
    setFeedback(err.message || 'Error al guardar. Inténtalo de nuevo.', 'error');
  }
});

/* ── Trigger con Enter ──────────────────────────────────────── */
input.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !saveBtn.disabled) saveBtn.click();
});
