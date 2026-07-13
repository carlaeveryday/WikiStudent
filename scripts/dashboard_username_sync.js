// ============================================================
// WikiStudent — dashboard_username_sync.js
// ============================================================
// FIX #1: El username sustituye a "Usuario" en "¡Bienvenido/a, Usuario!"
// FIX #2: El sidebar muestra "WikiStudent" (wiki naranja / student blanco),
//         NO el nombre del usuario.
// FIX #5: La fecha del header se actualiza dinámicamente cada día.
// ============================================================

document.addEventListener('DOMContentLoaded', () => {

  // El nombre viene del servidor al renderizar (EJS → data attribute)
  // Asegúrate de que en app.ejs el <body> tenga: data-username="<%= user.username %>"
  const username = document.body.dataset.username || 'Usuario';

  // ── 1. Header: saludo "¡Bienvenido/a, X!" ─────────────────
  //    .orange-word contiene el nombre del usuario
  const headerGreeting = document.querySelector('.orange-word');
  if (headerGreeting) headerGreeting.textContent = username;

  // ── 2. Sidebar brand: siempre "WikiStudent" ───────────────
  //    FIX #2: NO mostrar el username aquí.
  //    La estructura HTML debe ser:
  //      <span class="sidebar__brand">
  //        <span style="color: var(--naranja-neon); font-weight:800;">Wiki</span>
  //        <span style="color: #fff; font-weight:800;">Student</span>
  //      </span>
  //    Este script simplemente garantiza que si alguien puso el username ahí,
  //    se restaure al texto correcto.
  const brand = document.querySelector('.sidebar__brand');
  if (brand) {
    // Solo reescribir si el contenido no es el esperado
    const firstSpan  = brand.querySelector('span:nth-child(1)');
    const secondSpan = brand.querySelector('span:nth-child(2)');
    if (firstSpan)  firstSpan.textContent  = 'Wiki';
    if (secondSpan) secondSpan.textContent = 'Student';
  }

  // ── 3. Sidebar footer: nombre + avatar ────────────────────
  const sidebarName   = document.querySelector('.sidebar__user-name');
  const sidebarAvatar = document.querySelector('.sidebar__avatar');

  if (sidebarName)   sidebarName.textContent  = username;
  if (sidebarAvatar) sidebarAvatar.textContent = username[0].toUpperCase();

  // ── 4. Cualquier otro elemento con [data-user-name] ───────
  document.querySelectorAll('[data-user-name]').forEach(el => {
    el.textContent = username;
  });

  // ── 5. Fecha dinámica en el header ────────────────────────
  //    FIX #5: Genera la fecha actual en español cada vez que carga la página.
  const dateEl = document.querySelector('.main__header-info');
  if (dateEl) {
    const now = new Date();

    const dias = [
      'Domingo', 'Lunes', 'Martes', 'Miércoles',
      'Jueves', 'Viernes', 'Sábado'
    ];
    const meses = [
      'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
      'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'
    ];

    const diaSemana = dias[now.getDay()];
    const diaMes    = now.getDate();
    const mes       = meses[now.getMonth()];

    // Mantener el texto que hay después de la fecha (ej: "· Examen de ...")
    // El formato original era: "Domingo, 10 de mayo · Examen de Matemáticas en 14 días"
    // Reemplazamos solo la parte de fecha; el resto del texto (si existe) se conserva.
    const textoActual = dateEl.textContent || '';
    const separador   = textoActual.indexOf('·');
    const sufijo      = separador !== -1 ? ' ' + textoActual.slice(separador).trim() : '';

    dateEl.textContent = `${diaSemana}, ${diaMes} de ${mes}${sufijo}`;
  }

});