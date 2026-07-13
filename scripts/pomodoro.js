// ─────────────────────────────────────────────
//  POMODORO — WikiStudent
//  v3: H:MM:SS + Long Press + puntos fluidos
// ─────────────────────────────────────────────

// ── Referencias al DOM ──────────────────────
const playBtn      = document.querySelector('.pomodoro-btn.play');
const resetBtn     = document.querySelector('.pomodoro-btn.reset');
const presetBtns   = document.querySelectorAll('#presets-container .btn');
const timerText    = document.querySelector('.timer-number-svg');
const timerLabel   = document.querySelector('.timer-label-svg');
const minMoreBtn   = document.getElementById('min-more');
const minLessBtn   = document.getElementById('min-less');
const progressBars = document.querySelectorAll('.progress-ring__bar');

let puntosTextEl = null;

// ── Estado ───────────────────────────────────
const PRESETS = { '20 MIN': 1200, '30 MIN': 1800, '1 HORA': 3600 };
const DEFAULT_PRESET = 1500;

let totalTime  = DEFAULT_PRESET;
let timeLeft   = DEFAULT_PRESET;
let intervalId = null;
let isRunning  = false;
let puntosAcum = 0;

const CIRCUM_GLOBAL   = 2 * Math.PI * 155;
const CIRCUM_SEGUNDOS = 2 * Math.PI * 135;

// ─────────────────────────────────────────────
//  PUNTOS
// ─────────────────────────────────────────────
function calcularPuntos(segundos) {
    const m = segundos / 60;
    return Math.round(m * 0.8 + (Math.pow(m, 2) / 150));
}

function initPuntosText() {
    const svg = document.querySelector('#time-wrapper svg');
    if (!svg || svg.querySelector('#puntos-estimados')) return;
    const el = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    el.setAttribute('id', 'puntos-estimados');
    el.setAttribute('x', '185');
    el.setAttribute('y', '262');
    el.setAttribute('text-anchor', 'middle');
    el.setAttribute('class', 'timer-puntos-svg');
    svg.appendChild(el);
    puntosTextEl = el;
}

function actualizarPuntos() {
    if (!puntosTextEl) puntosTextEl = document.getElementById('puntos-estimados');
    if (!puntosTextEl) return;
    puntosTextEl.textContent = `+${calcularPuntos(totalTime)} PTS`;
}

// ─────────────────────────────────────────────
//  FORMATO DE TIEMPO  MM:SS / H:MM:SS
// ─────────────────────────────────────────────
function formatTime(s) {
    if (s < 3600) {
        // Formato MM:SS
        const m = Math.floor(s / 60).toString().padStart(2, '0');
        const sec = (s % 60).toString().padStart(2, '0');
        return `${m}:${sec}`;
    } else {
        // Formato H:MM:SS
        const h = Math.floor(s / 3600);
        const m = Math.floor((s % 3600) / 60).toString().padStart(2, '0');
        const sec = (s % 60).toString().padStart(2, '0');
        return `${h}:${m}:${sec}`;
    }
}

// Ajusta el font-size del número según si es H:MM:SS o MM:SS
function updateTimerFontSize(s) {
    timerText.style.fontSize = s >= 3600 ? '55px' : '65px';
}

function updateDisplay() {
    timerText.textContent = formatTime(timeLeft);
    updateTimerFontSize(timeLeft);
}

// ─────────────────────────────────────────────
//  BOTONES PLAY / PAUSE
// ─────────────────────────────────────────────
const SVG_PLAY = `<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
  <polygon points="20,10 20,90 90,50" />
</svg>`;

const SVG_PAUSE = `<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
  <rect x="18" y="12" width="22" height="76" rx="6" />
  <rect x="60" y="12" width="22" height="76" rx="6" />
</svg>`;

function setPlayIcon()  { playBtn.innerHTML = SVG_PLAY;  playBtn.classList.remove('is-playing'); }
function setPauseIcon() { playBtn.innerHTML = SVG_PAUSE; playBtn.classList.add('is-playing'); }

// ─────────────────────────────────────────────
//  PROGRESO SVG
// ─────────────────────────────────────────────
function getLabel(s) { return s >= 3600 ? 'MARATÓN' : 'ENFOQUE'; }

function updateProgressRing() {
    const ratio = timeLeft / totalTime;
    progressBars.forEach((bar, i) => {
        const circum = i === 0 ? CIRCUM_GLOBAL : CIRCUM_SEGUNDOS;
        const offset = i === 0
            ? circum * (1 - ratio)
            : circum * (1 - (timeLeft % 60) / 60);
        bar.style.strokeDasharray  = `${circum}`;
        bar.style.strokeDashoffset = `${offset}`;
    });
}

// Actualiza todo el display de una vez (usado en long press)
function refreshAll() {
    updateDisplay();
    updateProgressRing();
    actualizarPuntos();
}

// ─────────────────────────────────────────────
//  LÓGICA DEL TIMER
// ─────────────────────────────────────────────
function startTimer() {
    if (isRunning) return;
    isRunning = true;
    setPauseIcon();
    intervalId = setInterval(() => {
        if (timeLeft <= 0) {
            clearInterval(intervalId);
            intervalId = null;
            isRunning  = false;
            setPlayIcon();
            timerLabel.textContent = '¡COMPLETADO!';
            onSesionCompletada();
            return;
        }
        timeLeft--;
        updateDisplay();
        updateProgressRing();
    }, 1000);
}

function pauseTimer() {
    clearInterval(intervalId);
    intervalId = null;
    isRunning  = false;
    setPlayIcon();
}

function resetTimer() {
    pauseTimer();
    timeLeft = totalTime;
    timerLabel.textContent = getLabel(totalTime);
    refreshAll();
}

function setTiempo(nuevoTotal) {
    totalTime = nuevoTotal;
    timeLeft  = nuevoTotal;
    pauseTimer();
    timerLabel.textContent = getLabel(nuevoTotal);
    refreshAll();
}

// ─────────────────────────────────────────────
//  LONG PRESS — +1 / -1 min con aceleración
// ─────────────────────────────────────────────
let lpInterval   = null;  // intervalo de repetición
let lpTimeout1   = null;  // timeout para inicio de repetición (500ms)
let lpTimeout2   = null;  // timeout para aceleración (2000ms)
let lpStartTime  = 0;

function stepMinuto(delta) {
    const newTotal = totalTime + delta * 60;
    if (newTotal < 60) return;        // mínimo 1 minuto
    totalTime += delta * 60;
    timeLeft  += delta * 60;
    if (timeLeft < 0) timeLeft = 0;
    refreshAll();
}

function startLongPress(delta) {
    // Acción inmediata al primer click
    stepMinuto(delta);

    // Después de 500ms: empieza repetición cada 200ms
    lpTimeout1 = setTimeout(() => {
        lpInterval = setInterval(() => stepMinuto(delta), 200);

        // Después de 2s totales: acelera a 50ms
        lpTimeout2 = setTimeout(() => {
            clearInterval(lpInterval);
            lpInterval = setInterval(() => stepMinuto(delta), 50);
        }, 1500);
    }, 500);
}

function stopLongPress() {
    clearTimeout(lpTimeout1);
    clearTimeout(lpTimeout2);
    clearInterval(lpInterval);
    lpTimeout1 = lpTimeout2 = lpInterval = null;
}

function bindLongPress(btn, delta) {
    // Mouse
    btn.addEventListener('mousedown',  () => startLongPress(delta));
    btn.addEventListener('mouseup',    stopLongPress);
    btn.addEventListener('mouseleave', stopLongPress);

    // Touch (móvil)
    btn.addEventListener('touchstart', (e) => { e.preventDefault(); startLongPress(delta); }, { passive: false });
    btn.addEventListener('touchend',   stopLongPress);
    btn.addEventListener('touchcancel',stopLongPress);
}

// ─────────────────────────────────────────────
//  FINALIZACIÓN + MODAL CYBERPUNK
// ─────────────────────────────────────────────
function onSesionCompletada() {
    const pts = calcularPuntos(totalTime);
    puntosAcum += pts;

    // 1. Actualiza ranking en BD y re-renderiza el podio
    actualizarPuntosUsuario(pts).then(nuevaPosicion => {
        mostrarModal(pts, puntosAcum, nuevaPosicion);
    });

    // 2. Registra la sesión en el servidor (racha, tiempo, puntos diarios)
    guardarSesion(totalTime, pts);
}

async function guardarSesion(duration, points) {
    try {
        const res  = await fetch('/api/stats/session', {
            method:  'POST',
            headers: { 'Content-Type': 'application/json' },
            body:    JSON.stringify({ duration, points }),
        });
        const data = await res.json();

        // Actualizar las stats del dashboard en tiempo real
        actualizarStatsDashboard(data);
    } catch (err) {
        console.error('[Stats] Error al guardar sesión:', err);
    }
}

function actualizarStatsDashboard(data) {
    // Tiempo estudiado hoy
    const elTime = document.getElementById('time-studied');
    if (elTime && data.todaySeconds !== undefined) {
        const h = Math.floor(data.todaySeconds / 3600);
        const m = Math.floor((data.todaySeconds % 3600) / 60);
        elTime.textContent = h > 0 ? `${h}h ${m}m` : `${m}m`;
    }

    // Días de racha
    const elRacha = document.getElementById('racha-days');
    if (elRacha && data.streak !== undefined) {
        elRacha.textContent = data.streak;
    }

    // Posición en el ranking
    const elPos = document.getElementById('position-rk');
    if (elPos && data.position !== undefined) {
        elPos.textContent = `#${data.position}`;
    }

    // Puntos ganados hoy
    const elPts = document.getElementById('points');
    if (elPts && data.todayPoints !== undefined) {
        elPts.textContent = data.todayPoints;
    }
}

function mostrarModal(ptsGanados, ptsTotal, posicion) {
    document.getElementById('pomodoro-modal')?.remove();
    const modal = document.createElement('div');
    modal.id = 'pomodoro-modal';
    modal.innerHTML = `
        <div class="pm-overlay"></div>
        <div class="pm-box" role="dialog" aria-modal="true">
            <button class="pm-close" aria-label="Cerrar">✕</button>
            <div class="pm-scan-line"></div>
            <p class="pm-titulo">¡SESIÓN<br>COMPLETADA!</p>
            <div class="pm-stats">
                <div class="pm-stat">
                    <span class="pm-stat__valor">+${ptsGanados}</span>
                    <span class="pm-stat__label">pts ganados</span>
                </div>
                <div class="pm-divider"></div>
                <div class="pm-stat">
                    <span class="pm-stat__valor">${ptsTotal}</span>
                    <span class="pm-stat__label">pts totales</span>
                </div>
                <div class="pm-divider"></div>
                <div class="pm-stat">
                    <span class="pm-stat__valor">#${posicion ?? '—'}</span>
                    <span class="pm-stat__label">ranking</span>
                </div>
            </div>
            <p class="pm-mensaje">¡Continúa así! Cada minuto suma.</p>
            <button class="pm-ranking-btn">VER RANKING</button>
        </div>`;
    document.body.appendChild(modal);
    requestAnimationFrame(() => { requestAnimationFrame(() => modal.classList.add('pm-visible')); });
    modal.querySelector('.pm-close').addEventListener('click', cerrarModal);
    modal.querySelector('.pm-overlay').addEventListener('click', cerrarModal);
    modal.querySelector('.pm-ranking-btn').addEventListener('click', () => {
        window.location.href = '/pages/ranking.html';
    });
}

function cerrarModal() {
    const modal = document.getElementById('pomodoro-modal');
    if (!modal) return;
    modal.classList.remove('pm-visible');
    modal.addEventListener('transitionend', () => modal.remove(), { once: true });
}

// ─────────────────────────────────────────────
//  EVENTOS
// ─────────────────────────────────────────────
playBtn.addEventListener('click', () => { isRunning ? pauseTimer() : startTimer(); });
resetBtn.addEventListener('click', resetTimer);

// Long press en +1 y -1 min
if (minMoreBtn) bindLongPress(minMoreBtn, +1);
if (minLessBtn) bindLongPress(minLessBtn, -1);

presetBtns.forEach(btn => {
    btn.addEventListener('click', () => {
        presetBtns.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        setTiempo(PRESETS[btn.textContent.trim()] ?? DEFAULT_PRESET);
    });
});

// ── Init ─────────────────────────────────────
initPuntosText();
setPlayIcon();
refreshAll();
timerLabel.textContent = getLabel(totalTime);