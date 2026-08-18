// ═══════════════════════════════════════════════════════════════
//  WikiStudent — ranking-db.js  v3
//  Lee usuarios reales de la BD vía /api/ranking y se suscribe a
//  /api/ranking/stream (Server-Sent Events) para tiempo real.
//
//  CAMBIOS FRENTE A v2:
//   1. Tiempo real de verdad: antes solo se refrescaba cuando EL PROPIO
//      usuario ganaba puntos (llamada manual a actualizarPuntosUsuario).
//      Ahora hay un EventSource escuchando al servidor, así que si OTRO
//      usuario sube de puntos, tu ranking se actualiza solo, sin recargar.
//   2. Animación FLIP real al reordenarse la lista (antes solo había un
//      fundido + desplazamiento fijo con CSS, no un movimiento real desde
//      la posición antigua a la nueva).
//   3. Configurable por página con `window.RANKING_CONFIG`:
//        { limit: 6, showList: true }   → widget del Dashboard (app.ejs)
//        { limit: 30, showList: true }  → página dedicada (ranking.html)
//      Si no se define, usa el valor por defecto (6) para no romper nada.
//   4. Rellena el sidebar (avatar + nombre) en páginas estáticas como
//      /pages/ranking.html, que no tienen renderizado EJS del lado
//      servidor: usa el propio usuario dentro de la respuesta de
//      /api/ranking (que ya viaja con avatar_url) en vez de pedir un
//      endpoint nuevo.
//
//  Carga este archivo ANTES de pomodoro.js
// ═══════════════════════════════════════════════════════════════

// ─────────────────────────────────────────────
//  0. CONFIGURACIÓN DE PÁGINA
// ─────────────────────────────────────────────
const RANKING_CONFIG = Object.assign(
  { limit: 6, showList: true },
  window.RANKING_CONFIG || {}
);

// ─────────────────────────────────────────────
//  Estado interno
// ─────────────────────────────────────────────
let rankingDB       = [];
let CURRENT_USER_ID = null;
const prevPositions = {};
let rankingStream    = null; // EventSource activo
let pollFallbackTimer = null; // si el navegador no soporta SSE, hacemos polling


// ─────────────────────────────────────────────
//  1. CARGA INICIAL desde el servidor
// ─────────────────────────────────────────────
async function cargarRanking() {
  try {
    const res  = await fetch(`/api/ranking?limit=${RANKING_CONFIG.limit}`);
    const data = await res.json();

    CURRENT_USER_ID = data.currentUserId;

    aplicarNuevoRanking(data.users);
    rellenarSidebarUsuario();
    conectarTiempoReal();
  } catch (err) {
    console.error('[Ranking] Error al cargar:', err);
  }
}

// Aplica una nueva lista de usuarios (venga de fetch inicial, del POST de
// puntos, o de un evento del stream SSE), guardando las posiciones previas
// para poder animar/mostrar la tendencia (▲▼—) correctamente.
function aplicarNuevoRanking(users) {
  rankingDB.forEach(u => { prevPositions[u.id] = u.currentPosition; });

  rankingDB = users.map((u, i) => {
    const pos  = i + 1;
    const prev = prevPositions[u.id] ?? pos;
    return { ...u, currentPosition: pos, previousPosition: prev };
  });

  renderizarRanking();
}


// ─────────────────────────────────────────────
//  2. TIEMPO REAL — Server-Sent Events
// ─────────────────────────────────────────────
function conectarTiempoReal() {
  if (!('EventSource' in window)) {
    // Navegador sin soporte SSE (muy raro hoy en día): fallback a
    // refrescar cada 15s para que al menos no se quede la vista estática.
    if (!pollFallbackTimer) pollFallbackTimer = setInterval(cargarRanking, 15000);
    return;
  }
  if (rankingStream) return; // ya conectado

  rankingStream = new EventSource('/api/ranking/stream');
  marcarEstadoConexion('connecting');

  rankingStream.addEventListener('open', () => marcarEstadoConexion('live'));

  rankingStream.addEventListener('ranking-update', (event) => {
    try {
      const { users } = JSON.parse(event.data);
      // El propio limit de la página puede ser menor que lo que manda el
      // stream (que siempre difunde el máximo), así que recortamos aquí.
      aplicarNuevoRanking(users.slice(0, RANKING_CONFIG.limit));
    } catch (err) {
      console.error('[Ranking][SSE] Payload inválido:', err);
    }
  });

  rankingStream.addEventListener('error', () => {
    marcarEstadoConexion('reconnecting');
    // EventSource reintenta solo (retry: 5000 lo fija el servidor), no hay
    // que hacer nada más aquí salvo reflejarlo en la UI.
  });
}

function marcarEstadoConexion(estado) {
  const dot = document.getElementById('ranking-live-dot');
  if (!dot) return;
  dot.classList.remove('is-live', 'is-connecting', 'is-offline');
  dot.classList.add(
    estado === 'live' ? 'is-live' : estado === 'connecting' ? 'is-connecting' : 'is-offline'
  );
  const label = document.getElementById('ranking-live-label');
  if (label) {
    label.textContent = estado === 'live' ? 'En vivo' : estado === 'connecting' ? 'Conectando…' : 'Reconectando…';
  }
}


// ─────────────────────────────────────────────
//  3. FUNCIÓN PÚBLICA — llamada desde pomodoro.js
// ─────────────────────────────────────────────
async function actualizarPuntosUsuario(puntosGanados) {
  try {
    const res  = await fetch('/api/ranking/add-points', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ puntos: puntosGanados }),
    });
    const data = await res.json();

    // No hace falta aplicar el resultado a mano: el propio servidor
    // difunde el cambio por /api/ranking/stream y lo recibiremos aquí
    // mismo en el listener 'ranking-update' (incluso en esta misma
    // pestaña). Lo dejamos igualmente por si el stream tarda un pelín:
    aplicarNuevoRanking(data.users);

    return rankingDB.find(u => u.id === CURRENT_USER_ID)?.currentPosition ?? null;
  } catch (err) {
    console.error('[Ranking] Error al actualizar puntos:', err);
    return null;
  }
}


// ─────────────────────────────────────────────
//  4. HELPERS
// ─────────────────────────────────────────────
function getInitials(username) {
  return (username || '?').split(/[\s._-]/).map(w => w[0] ?? '').join('').slice(0, 2).toUpperCase();
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

function avatarStyle(user) {
  return user?.avatar_url ? ` style="background-image:url('${user.avatar_url}');background-size:cover;background-position:center;"` : '';
}

// Rellena el sidebar (avatar + nombre) en páginas estáticas que no tienen
// EJS del lado del servidor, como /pages/ranking.html. En app.ejs estos
// nodos ya vienen rellenos por el servidor, así que si no existen los ids
// esperados (o ya tienen contenido puesto por EJS) esto simplemente no
// hace nada.
function rellenarSidebarUsuario() {
  const me = rankingDB.find(isCurrent);
  if (!me) return;

  const avatarEl = document.getElementById('sidebar-avatar');
  if (avatarEl && avatarEl.dataset.autofill === 'true') {
    if (me.avatar_url) {
      avatarEl.style.backgroundImage = `url('${me.avatar_url}')`;
      avatarEl.style.backgroundSize = 'cover';
      avatarEl.style.backgroundPosition = 'center';
      avatarEl.textContent = '';
    } else {
      avatarEl.textContent = getInitials(me.username);
    }
  }

  const nameEl = document.getElementById('sidebar-username');
  if (nameEl && nameEl.dataset.autofill === 'true') nameEl.textContent = me.username;
}


// ─────────────────────────────────────────────
//  5. RENDERIZADO
// ─────────────────────────────────────────────
function renderizarRanking() {
  renderPodio();
  if (RANKING_CONFIG.showList) renderListaConFLIP();
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
    const avatarEl     = wrapper.querySelector('.avatar');

    avatarEl.textContent = user ? getInitials(user.username) : '—';
    avatarEl.className   = `avatar${currentMark}`;
    avatarEl.setAttribute('style', user ? avatarStyle(user) : '');
    wrapper.querySelector('.user').textContent   = user ? user.username : `Posición ${pos}`;
    wrapper.querySelector('.user').className     = `user${currentMark}`;
    wrapper.querySelector('.puntos').textContent = user ? `${user.points} pts` : '0 pts';

    // Flecha: eliminar la anterior y añadir la nueva
    wrapper.querySelector('.tendencia')?.remove();
    if (user) wrapper.insertAdjacentHTML('beforeend', getTendenciaHTML(user));
  });
}

/* ── Lista desde el puesto 4 en adelante, con animación FLIP ──── */
function renderListaConFLIP() {
  const lista = document.getElementById('ranking-list');
  if (!lista) return;

  const restantes = rankingDB.filter(u => u.currentPosition > 3);

  // ---- FIRST: posiciones actuales (antes de tocar el DOM) ----
  const firstRects = {};
  lista.querySelectorAll('.userCard').forEach(card => {
    firstRects[card.dataset.userId] = card.getBoundingClientRect();
  });

  // ---- LAST: repintamos la lista ya en el orden nuevo ----
  lista.innerHTML = restantes.map(user => {
    const currentMark = isCurrent(user) ? ' is-current-user' : '';
    return `
      <div class="userCard${currentMark}" data-user-id="${user.id}">
        <div class="user-rank">
          <div class="user-rank-left">
            <div class="number">${user.currentPosition}</div>
            <div class="avatar-rk${currentMark}"${avatarStyle(user)}>${user.avatar_url ? '' : getInitials(user.username)}</div>
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

  // ---- INVERT + PLAY: por cada tarjeta que ya existía, calculamos la
  // diferencia entre su posición vieja y la nueva, la "tele-transportamos"
  // visualmente al punto de partida con transform, y en el frame
  // siguiente animamos ese transform a 0 → efecto de deslizamiento real.
  requestAnimationFrame(() => {
    lista.querySelectorAll('.userCard').forEach(card => {
      const id   = card.dataset.userId;
      const from = firstRects[id];
      if (!from) {
        // Tarjeta nueva en la lista (antes no estaba visible): solo fundido.
        card.classList.add('row-enter');
        requestAnimationFrame(() => card.classList.add('row-enter-active'));
        setTimeout(() => card.classList.remove('row-enter', 'row-enter-active'), 500);
        return;
      }
      const to = card.getBoundingClientRect();
      const deltaY = from.top - to.top;
      if (Math.abs(deltaY) < 1) return; // no se movió, nada que animar

      card.style.transition = 'none';
      card.style.transform  = `translateY(${deltaY}px)`;
      requestAnimationFrame(() => {
        card.style.transition = 'transform 0.5s cubic-bezier(0.4, 0, 0.2, 1)';
        card.style.transform  = 'translateY(0)';
      });
      card.addEventListener('transitionend', () => {
        card.style.transition = '';
        card.style.transform  = '';
      }, { once: true });
    });
  });
}


// ─────────────────────────────────────────────
//  6. INIT — estadísticas propias (usadas tanto en el widget del
//     Dashboard como en la cabecera de la página dedicada de ranking)
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

// Si el usuario cambia de pestaña y vuelve, o el stream se cortó por
// dormir el portátil, forzamos una reconexión/resincronización.
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && rankingStream?.readyState === EventSource.CLOSED) {
    rankingStream = null;
    cargarRanking();
  }
});