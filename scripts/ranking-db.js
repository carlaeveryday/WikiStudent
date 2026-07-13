// ═══════════════════════════════════════════════════════════════
//  WikiStudent — ranking-db.js  v2
//  Lee usuarios reales de la BD vía /api/ranking
//  Carga este archivo ANTES de pomodoro.js
// ═══════════════════════════════════════════════════════════════

// ─────────────────────────────────────────────
//  Estado interno
// ─────────────────────────────────────────────
let rankingDB       = [];
let CURRENT_USER_ID = null;
const prevPositions = {};


// ─────────────────────────────────────────────
//  1. CARGA INICIAL desde el servidor
// ─────────────────────────────────────────────
async function cargarRanking() {
  try {
    const res  = await fetch('/api/ranking');
    const data = await res.json();

    CURRENT_USER_ID = data.currentUserId;

    rankingDB = data.users.map((u, i) => {
      const pos = i + 1;
      prevPositions[u.id] = pos;
      return { ...u, currentPosition: pos, previousPosition: pos };
    });

    renderizarRanking();
  } catch (err) {
    console.error('[Ranking] Error al cargar:', err);
  }
}


// ─────────────────────────────────────────────
//  2. FUNCIÓN PÚBLICA — llamada desde pomodoro.js
// ─────────────────────────────────────────────
async function actualizarPuntosUsuario(puntosGanados) {
  try {
    rankingDB.forEach(u => { prevPositions[u.id] = u.currentPosition; });

    const res  = await fetch('/api/ranking/add-points', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ puntos: puntosGanados }),
    });
    const data = await res.json();

    rankingDB = data.users.map((u, i) => {
      const pos  = i + 1;
      const prev = prevPositions[u.id] ?? pos;
      return { ...u, currentPosition: pos, previousPosition: prev };
    });

    renderizarRanking();

    return rankingDB.find(u => u.id === CURRENT_USER_ID)?.currentPosition ?? null;
  } catch (err) {
    console.error('[Ranking] Error al actualizar puntos:', err);
    return null;
  }
}


// ─────────────────────────────────────────────
//  3. HELPERS
// ─────────────────────────────────────────────
function getInitials(username) {
  return username.split(/[\s._-]/).map(w => w[0] ?? '').join('').slice(0, 2).toUpperCase();
}

function getTendenciaHTML(user) {
  const diff = user.previousPosition - user.currentPosition;
  if (diff > 0) return `<span class="tendencia tendencia--sube">▲ ${diff}</span>`;
  if (diff < 0) return `<span class="tendencia tendencia--baja">▼ ${Math.abs(diff)}</span>`;
  return `<span class="tendencia tendencia--igual">—</span>`;
}

function isCurrent(user) { return user.id === CURRENT_USER_ID; }

function calcBarWidth(user) {
  const leader = rankingDB[0]?.points || 1;
  return Math.round((user.points / leader) * 100);
}


// ─────────────────────────────────────────────
//  4. RENDERIZADO
// ─────────────────────────────────────────────
function renderizarRanking() {
  renderPodio();
  renderLista();
}

/* ── Podio top 3 (2º izq | 1º centro | 3º der) ───────────────── */
function renderPodio() {
  const SLOTS = [
    { pos: 2, wrapperId: 'top-2__wrapper' },
    { pos: 1, wrapperId: 'top-1__wrapper' },
    { pos: 3, wrapperId: 'top-3__wrapper' },
  ];

  SLOTS.forEach(({ pos, wrapperId }) => {
    const wrapper = document.getElementById(wrapperId);
    if (!wrapper) return;

    const user        = rankingDB.find(u => u.currentPosition === pos);
    const currentMark = user && isCurrent(user) ? ' is-current-user' : '';

    wrapper.querySelector('.avatar').textContent = user ? getInitials(user.username) : '—';
    wrapper.querySelector('.avatar').className   = `avatar${currentMark}`;
    wrapper.querySelector('.user').textContent   = user ? user.username : `Posición ${pos}`;
    wrapper.querySelector('.user').className     = `user${currentMark}`;
    wrapper.querySelector('.puntos').textContent = user ? `${user.points} pts` : '0 pts';

    // Flecha: eliminar la anterior y añadir la nueva
    wrapper.querySelector('.tendencia')?.remove();
    if (user) wrapper.insertAdjacentHTML('beforeend', getTendenciaHTML(user));
  });
}

/* ── Lista posiciones 4-6 ─────────────────────────────────────── */
function renderLista() {
  const lista = document.getElementById('ranking-list');
  if (!lista) return;

  const restantes = rankingDB.filter(u => u.currentPosition > 3);

  lista.innerHTML = restantes.map(user => {
    const movedClass  = user.previousPosition !== user.currentPosition ? 'row-move' : '';
    const currentMark = isCurrent(user) ? ' is-current-user' : '';

    return `
      <div class="userCard${currentMark} ${movedClass}" data-user-id="${user.id}">
        <div class="user-rank">
          <div class="user-rank-left">
            <div class="number">${user.currentPosition}</div>
            <div class="avatar-rk${currentMark}">${getInitials(user.username)}</div>
          </div>
          <div>
            <div class="user-rk${currentMark}">${user.username}</div>
            <div class="racha"><span class="dot"></span>Racha de ${user.streak} días</div>
          </div>
        </div>
        <div class="info-rk">
          <div class="barra"><div class="progreso" style="width:${calcBarWidth(user)}%"></div></div>
          <div class="pts-pos">
            <div class="pts-rk">${user.points} pts</div>
            <div class="posicion">${getTendenciaHTML(user)}</div>
          </div>
        </div>
      </div>`;
  }).join('');

  requestAnimationFrame(() => {
    lista.querySelectorAll('.row-move').forEach(el => {
      setTimeout(() => el.classList.remove('row-move'), 600);
    });
  });
}


// ─────────────────────────────────────────────
//  5. INIT
// ─────────────────────────────────────────────
async function cargarStatsIniciales() {
  try {
    const res  = await fetch('/api/stats');
    const data = await res.json();

    const elTime  = document.getElementById('time-studied');
    const elRacha = document.getElementById('racha-days');
    const elPos   = document.getElementById('position-rk');
    const elPts   = document.getElementById('points');

    if (elTime) {
      const h = Math.floor(data.todaySeconds / 3600);
      const m = Math.floor((data.todaySeconds % 3600) / 60);
      elTime.textContent = h > 0 ? `${h}h ${m}m` : (m > 0 ? `${m}m` : '0m');
    }
    if (elRacha) elRacha.textContent = data.streak ?? 0;
    if (elPos)   elPos.textContent   = `#${data.position ?? '—'}`;
    if (elPts)   elPts.textContent   = data.todayPoints ?? 0;

  } catch (err) {
    console.error('[Stats] Error al cargar stats:', err);
  }
}

document.addEventListener('DOMContentLoaded', () => {
  cargarRanking();
  cargarStatsIniciales();
});