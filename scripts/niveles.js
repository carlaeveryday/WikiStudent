'use strict';

/**
 * SISTEMA DE NIVELES — WikiStudent
 * ─────────────────────────────────────────────────────────────
 * Cada punto que el usuario gana estudiando con el Pomodoro (o con
 * cualquier otra acción que sume a "puntos hoy") se acumula en un
 * total histórico. Ese total determina el nivel y el título del
 * usuario, que se muestran en el anillo del header y en la pestaña
 * "Perfil" de ajustes.
 *
 * ⚠️ IMPORTANTE — sobre la persistencia:
 * De momento este total se guarda en localStorage (por usuario,
 * usando el username del atributo data-username del <body>) porque
 * no había ningún campo de "puntos totales" en la base de datos.
 * Esto significa que el nivel NO viaja entre dispositivos todavía.
 * En cuanto tengas una columna tipo `xp_total` / `points_total` en
 * la tabla de usuarios de Supabase, sustituye `cargarEstado` /
 * `guardarEstado` de aquí abajo por un fetch a tu API, y llama a
 * `window.WikiNiveles.setTotalPoints(valorDeLaBD)` al cargar la
 * página. El resto (cálculo de nivel, anillo, chip, grid de
 * títulos, aviso de subida de nivel) funciona igual.
 */

(function () {

    // ── 1. Configuración de niveles y títulos ────────────────────
    // "minPoints" = puntos totales necesarios para ALCANZAR ese nivel.
    // Puedes tocar estos números libremente, es la parte "me lo invento".
    const LEVELS = [
        { level: 1,  minPoints: 0,    title: 'Novato',            icon: 'egg' },
        { level: 2,  minPoints: 50,   title: 'Aprendiz',          icon: 'school' },
        { level: 3,  minPoints: 150,  title: 'Estudiante Aplicado', icon: 'auto_stories' },
        { level: 4,  minPoints: 300,  title: 'Erudito',           icon: 'local_library' },
        { level: 5,  minPoints: 500,  title: 'Sabio',             icon: 'psychology' },
        { level: 6,  minPoints: 750,  title: 'Maestro',           icon: 'workspace_premium' },
        { level: 7,  minPoints: 1100, title: 'Gran Maestro',      icon: 'military_tech' },
        { level: 8,  minPoints: 1500, title: 'Leyenda',           icon: 'emoji_events' },
        { level: 9,  minPoints: 2000, title: 'Mente Brillante',   icon: 'bolt' },
        { level: 10, minPoints: 3000, title: 'Élite WikiStudent', icon: 'diamond' },
    ];

    const RING_CIRCUMFERENCE = 2 * Math.PI * 28; // r=28 en el viewBox del SVG

    // ── 2. Identidad + almacenamiento ─────────────────────────────
    function getUsername() {
        return document.body?.dataset?.username || 'invitado';
    }

    function storageKey() {
        return 'wikistudent_niveles_' + getUsername();
    }

    function cargarEstado() {
        try {
            const raw = localStorage.getItem(storageKey());
            if (raw) return JSON.parse(raw);
        } catch (e) { /* localStorage no disponible o dato corrupto: seguimos con default */ }
        return { totalPoints: 0, lastToday: 0, lastSeenDate: null };
    }

    function guardarEstado(estado) {
        try {
            localStorage.setItem(storageKey(), JSON.stringify(estado));
        } catch (e) { /* modo privado / cuota llena: no rompemos la app por esto */ }
    }

    let estado = cargarEstado();

    // ── 3. Cálculo de nivel a partir del total de puntos ──────────
    function getLevelInfo(totalPoints) {
        let actual = LEVELS[0];
        let siguiente = null;
        for (let i = 0; i < LEVELS.length; i++) {
            if (totalPoints >= LEVELS[i].minPoints) {
                actual = LEVELS[i];
                siguiente = LEVELS[i + 1] || null;
            }
        }
        const puntosDentroDelNivel = totalPoints - actual.minPoints;
        const puntosParaSubir = siguiente ? siguiente.minPoints - actual.minPoints : null;
        const progreso = siguiente ? Math.min(1, puntosDentroDelNivel / puntosParaSubir) : 1;
        const puntosQueFaltan = siguiente ? siguiente.minPoints - totalPoints : 0;
        return { actual, siguiente, progreso, puntosQueFaltan, totalPoints };
    }

    // ── 4. Sumar puntos y detectar subida de nivel ─────────────────
    function addPoints(delta) {
        if (!delta || delta <= 0) return;
        const nivelAntes = getLevelInfo(estado.totalPoints).actual.level;
        estado.totalPoints += delta;
        guardarEstado(estado);
        const nivelDespues = getLevelInfo(estado.totalPoints).actual.level;
        render();
        if (nivelDespues > nivelAntes) {
            mostrarSubidaDeNivel(getLevelInfo(estado.totalPoints).actual);
        }
    }

    // Para cuando conectes esto a una BD y quieras fijar el total real
    // (en vez de ir sumando deltas locales).
    function setTotalPoints(valor) {
        if (typeof valor !== 'number' || Number.isNaN(valor)) return;
        estado.totalPoints = Math.max(0, valor);
        guardarEstado(estado);
        render();
    }

    function getState() {
        return { ...estado, ...getLevelInfo(estado.totalPoints) };
    }

    // ── 5. Enganche a los "puntos de hoy" que ya existen en el dashboard ──
    // ranking-db.js llama a window.actualizarStatsDashboard(data) cada vez
    // que refresca los stats (data.todayPoints trae los puntos de hoy).
    // Reusamos ese mismo gancho para ir acumulando el total histórico.
    function engancharPuntosDeHoy() {
        const original = window.actualizarStatsDashboard;
        window.actualizarStatsDashboard = function (data) {
            if (original) original(data);
            if (data && typeof data.todayPoints === 'number') {
                procesarPuntosDeHoy(data.todayPoints);
            }
        };
    }

    function procesarPuntosDeHoy(todayPoints) {
        const hoy = new Date().toDateString();
        if (estado.lastSeenDate !== hoy) {
            // Primer vistazo de hoy (o primera carga de la página):
            // no restamos nada, simplemente movemos la base a 0 para
            // que la siguiente comparación sume la diferencia real.
            estado.lastSeenDate = hoy;
            estado.lastToday = 0;
        }
        if (todayPoints > estado.lastToday) {
            const delta = todayPoints - estado.lastToday;
            estado.lastToday = todayPoints;
            addPoints(delta);
        } else if (todayPoints < estado.lastToday) {
            // Puntos de hoy bajaron (p.ej. se corrigió algo): resincroniza
            // sin restar del histórico.
            estado.lastToday = todayPoints;
            guardarEstado(estado);
        }
    }

    // Lectura de respaldo al cargar la página, por si ranking-db.js ya
    // pintó los puntos de hoy en el DOM antes de que este script arrancara.
    function leerPuntosDeHoyDelDOM() {
        const el = document.getElementById('points');
        if (!el) return;
        const val = parseInt(el.textContent, 10);
        if (!Number.isNaN(val)) procesarPuntosDeHoy(val);
    }

    // ── 6. Pintado del anillo + chip en el header ──────────────────
    function pintarAnillo(barEl, progreso) {
        if (!barEl) return;
        barEl.style.strokeDasharray = RING_CIRCUMFERENCE;
        barEl.style.strokeDashoffset = RING_CIRCUMFERENCE * (1 - progreso);
    }

    function render() {
        const info = getLevelInfo(estado.totalPoints);
        const { actual, siguiente, progreso, puntosQueFaltan } = info;

        // Anillo + número de nivel en el header
        pintarAnillo(document.getElementById('level-ring-bar'), progreso);
        const numEl = document.getElementById('header-level-num');
        if (numEl) numEl.textContent = actual.level;

        // Chip de título bajo "Bienvenido/a"
        const chipText = document.getElementById('header-title-chip-text');
        if (chipText) chipText.textContent = actual.title;
        const chipIcon = document.querySelector('#header-title-chip .material-symbols-outlined');
        if (chipIcon) chipIcon.textContent = actual.icon;

        // Tooltip del anillo
        const tooltipTitle = document.getElementById('header-level-tooltip-title');
        const tooltipProgress = document.getElementById('header-level-tooltip-progress');
        if (tooltipTitle) tooltipTitle.textContent = actual.title;
        if (tooltipProgress) {
            tooltipProgress.textContent = siguiente
                ? `${estado.totalPoints - actual.minPoints} / ${siguiente.minPoints - actual.minPoints} pts`
                : `${estado.totalPoints} pts · nivel máximo`;
        }
        const ringEl = document.getElementById('header-level-ring');
        if (ringEl) {
            ringEl.setAttribute(
                'aria-label',
                `Nivel ${actual.level} · ${actual.title}` + (siguiente ? ` · faltan ${puntosQueFaltan} pts para ${siguiente.title}` : ' · nivel máximo')
            );
        }

        // Resumen en la pestaña Perfil
        pintarAnillo(document.getElementById('cfg-level-ring-bar'), progreso);
        const cfgNum = document.getElementById('cfg-level-num');
        if (cfgNum) cfgNum.textContent = actual.level;
        const cfgTitle = document.getElementById('cfg-level-title');
        if (cfgTitle) cfgTitle.textContent = actual.title;
        const cfgPts = document.getElementById('cfg-level-pts');
        if (cfgPts) {
            cfgPts.textContent = siguiente
                ? `${estado.totalPoints - actual.minPoints} / ${siguiente.minPoints - actual.minPoints} pts para "${siguiente.title}"`
                : `${estado.totalPoints} pts · ¡nivel máximo alcanzado!`;
        }
        const cfgBarFill = document.getElementById('cfg-level-bar-fill');
        if (cfgBarFill) cfgBarFill.style.width = (progreso * 100) + '%';

        pintarGridDeTitulos(actual.level);
    }

    function pintarGridDeTitulos(nivelActual) {
        const grid = document.getElementById('cfg-titles-grid');
        if (!grid) return;
        grid.innerHTML = LEVELS.map((lv) => {
            const conseguido = lv.level <= nivelActual;
            const esActual = lv.level === nivelActual;
            const clases = ['lvl-title-card'];
            if (conseguido) clases.push('lvl-title-card--unlocked');
            if (esActual) clases.push('lvl-title-card--current');
            return `
                <div class="${clases.join(' ')}">
                    <span class="material-symbols-outlined">${conseguido ? lv.icon : 'lock'}</span>
                    <div class="lvl-title-card__name">${lv.title}</div>
                    <div class="lvl-title-card__req">Nivel ${lv.level} · ${lv.minPoints} pts</div>
                </div>
            `;
        }).join('');
    }

    // ── 7. Aviso flotante de "has subido de nivel" ──────────────────
    function crearToastSiNoExiste() {
        if (document.getElementById('lvl-up-toast')) return document.getElementById('lvl-up-toast');
        const toast = document.createElement('div');
        toast.id = 'lvl-up-toast';
        toast.innerHTML = `
            <div class="lvl-up-toast__icon"><span class="material-symbols-outlined">military_tech</span></div>
            <div>
                <div class="lvl-up-toast__label">¡Subiste de nivel!</div>
                <div class="lvl-up-toast__title" id="lvl-up-toast-title"></div>
            </div>
        `;
        document.body.appendChild(toast);
        return toast;
    }

    let toastTimeout = null;
    function mostrarSubidaDeNivel(nivel) {
        const toast = crearToastSiNoExiste();
        const icon = toast.querySelector('.lvl-up-toast__icon .material-symbols-outlined');
        const title = document.getElementById('lvl-up-toast-title');
        if (icon) icon.textContent = nivel.icon;
        if (title) title.textContent = `Nivel ${nivel.level} · ${nivel.title}`;

        toast.classList.add('lvl-up-toast--show');
        clearTimeout(toastTimeout);
        toastTimeout = setTimeout(() => toast.classList.remove('lvl-up-toast--show'), 5000);
    }

    // ── 8. Arranque ────────────────────────────────────────────────
    document.addEventListener('DOMContentLoaded', () => {
        render(); // pinta con lo que ya haya en localStorage, sin esperar
        engancharPuntosDeHoy();
        // Pequeño margen para que ranking-db.js haya pintado #points primero.
        setTimeout(leerPuntosDeHoyDelDOM, 900);
    });

    // ── 9. API pública ────────────────────────────────────────────
    window.WikiNiveles = { addPoints, setTotalPoints, getState, LEVELS, render };

})();
