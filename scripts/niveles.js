'use strict';

/**
 * SISTEMA DE NIVELES — WikiStudent
 * ─────────────────────────────────────────────────────────────
 * El total de puntos NO se calcula ni se inventa aquí: ya existe en tu
 * base de datos (columna `points` de `profiles`, la misma que usa el
 * ranking) y tu servidor ya la expone en:
 *   GET  /api/stats           → { ..., totalPoints }
 *   POST /api/stats/session   → { ..., totalPoints }  (al terminar un Pomodoro)
 *
 * Este script solo LEE `totalPoints` de esas dos respuestas y calcula,
 * en el navegador, a qué nivel/título corresponde. No hay ningún
 * endpoint nuevo que montar ni ninguna tabla que crear — si en algún
 * momento viste hablar de `puntos_totales` / `routes/niveles.js` /
 * `supabase_niveles.sql`, ignóralo: era de antes de saber que ya
 * tenías `profiles.points`, ha quedado obsoleto y no hace falta.
 *
 * localStorage solo se usa como caché de lectura, para pintar algo al
 * instante mientras llega la respuesta del servidor.
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

    // ── 2. Identidad + caché de lectura (NO es la fuente de verdad) ──
    function getUsername() {
        return document.body?.dataset?.username || 'invitado';
    }

    function cacheKey() {
        return 'wikistudent_niveles_cache_' + getUsername();
    }

    function cargarCache() {
        try {
            const raw = localStorage.getItem(cacheKey());
            if (raw) return JSON.parse(raw);
        } catch (e) { /* localStorage no disponible o dato corrupto: seguimos con default */ }
        return { totalPoints: 0 };
    }

    function guardarCache(estado) {
        try {
            localStorage.setItem(cacheKey(), JSON.stringify(estado));
        } catch (e) { /* modo privado / cuota llena: no rompemos la app por esto */ }
    }

    let estado = cargarCache();

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

    // ── 4. Fijar el total real y detectar subida de nivel ─────────
    function setTotalPoints(valor) {
        if (typeof valor !== 'number' || Number.isNaN(valor)) return;
        const nivelAntes = getLevelInfo(estado.totalPoints).actual.level;
        estado.totalPoints = Math.max(0, valor);
        guardarCache(estado);
        render();
        const nivelDespues = getLevelInfo(estado.totalPoints).actual.level;
        if (nivelDespues > nivelAntes) {
            mostrarSubidaDeNivel(getLevelInfo(estado.totalPoints).actual);
        }
    }

    function getState() {
        return { ...estado, ...getLevelInfo(estado.totalPoints) };
    }

    // ── 5. Traer el total real del servidor ───────────────────────
    async function sincronizarConServidor() {
        try {
            const res = await fetch('/api/stats', { credentials: 'include' });
            if (!res.ok) throw new Error('GET /api/stats → ' + res.status);
            const data = await res.json();
            if (typeof data.totalPoints === 'number') setTotalPoints(data.totalPoints);
        } catch (e) {
            console.warn('[niveles] No se pudo leer /api/stats, uso la última caché local mientras tanto →', e.message);
        }
    }

    // Además de la carga inicial, nos enganchamos al mismo sitio donde el
    // resto del dashboard ya recibe /api/stats o /api/stats/session (p.ej.
    // justo al terminar un Pomodoro), así el nivel se actualiza al momento
    // sin tener que esperar a recargar la página.
    function engancharActualizacionesDelDashboard() {
        const original = window.actualizarStatsDashboard;
        window.actualizarStatsDashboard = function (data) {
            if (original) original(data);
            if (data && typeof data.totalPoints === 'number') setTotalPoints(data.totalPoints);
        };
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
        render(); // pinta de inmediato con la última caché conocida, sin esperar
        sincronizarConServidor(); // y en cuanto responda /api/stats, repinta con el valor real
        engancharActualizacionesDelDashboard();
    });

    // ── 9. API pública ────────────────────────────────────────────
    window.WikiNiveles = { setTotalPoints, getState, LEVELS, render };

})();