/* ============================================================
   calendario.js — Calendario interactivo Wiki Student
   Lógica: panel vista / panel edición, nota rápida y emociones
   como widgets independientes, toast de éxito, localStorage.
   ============================================================ */

// ── Constantes ───────────────────────────────────────────────
const LS_KEY  = 'wikiStudent_calendar';
const WEEKDAYS  = ['L', 'M', 'X', 'J', 'V', 'S', 'D'];
const MONTHS_ES = ['Enero','Febrero','Marzo','Abril','Mayo','Junio',
                   'Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
const MOODS = [
    { emoji: '🤩', label: 'Genial'    },
    { emoji: '😊', label: 'Bien'      },
    { emoji: '😐', label: 'Regular'   },
    { emoji: '😔', label: 'Mal'       },
    { emoji: '😤', label: 'Frustrado' },
    { emoji: '😴', label: 'Agotado'   },
];

// ── Estado del calendario ────────────────────────────────────
const calState = {
    month: new Date().getMonth(),
    year:  new Date().getFullYear(),
    selectedDay: null,
};

// ── Persistencia ─────────────────────────────────────────────
function loadData() {
    try { return JSON.parse(localStorage.getItem(LS_KEY)) || {}; }
    catch (_) { return {}; }
}
function saveData(data) {
    localStorage.setItem(LS_KEY, JSON.stringify(data));
}
function getDayData(key) {
    const d = loadData()[key];
    return d || { events: [], note: '', moods: [] };
}
function setDayData(key, obj) {
    const data = loadData();
    data[key] = obj;
    saveData(data);
}
function hasDayData(key) {
    const d = getDayData(key);
    return d.events.length > 0 || d.note.trim() !== '' || d.moods.length > 0;
}
function todayKey() {
    const n = new Date();
    return dateKey(n.getDate(), n.getMonth(), n.getFullYear());
}

// ── Utilidades de fecha ───────────────────────────────────────
function daysInMonth(m, y)      { return new Date(y, m + 1, 0).getDate(); }
function firstWeekday(m, y)     { const j = new Date(y,m,1).getDay(); return j===0?6:j-1; }
function dateKey(d, m, y)       { return `${y}-${String(m+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`; }
function isToday(d, m, y)       { const n=new Date(); return d===n.getDate()&&m===n.getMonth()&&y===n.getFullYear(); }
function _esc(s)                { return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }

// ── Toast global ─────────────────────────────────────────────
function showToast(msg = '¡Guardado correctamente!', isSuccess = true) {
    let toast = document.getElementById('cal-toast');
    if (!toast) {
        toast = document.createElement('div');
        toast.id = 'cal-toast';
        document.body.appendChild(toast);
    }
    toast.className = 'cal-toast' + (isSuccess ? ' success' : ' error');
    toast.innerHTML = `<span class="material-symbols-outlined">${isSuccess ? 'check_circle' : 'error'}</span>${msg}`;
    toast.classList.add('show');
    clearTimeout(toast._timer);
    toast._timer = setTimeout(() => toast.classList.remove('show'), 3000);
}

// ════════════════════════════════════════════════════════════
// CALENDARIO
// ════════════════════════════════════════════════════════════

function generateCalendar(month, year) {
    const container = document.getElementById('calendario');
    if (!container) return;

    const total   = daysInMonth(month, year);
    const offset  = firstWeekday(month, year);
    const prevM   = month===0?11:month-1, prevY = month===0?year-1:year;
    const nextM   = month===11?0:month+1, nextY = month===11?year+1:year;
    const prevLen = daysInMonth(prevM, prevY);

    container.innerHTML = `
        <div class="cal-header">
            <button class="cal-nav-btn" id="cal-prev">&#8249;</button>
            <span class="cal-month-label">${MONTHS_ES[month]} ${year}</span>
            <button class="cal-nav-btn" id="cal-next">&#8250;</button>
        </div>
        <div class="cal-grid" id="cal-grid"></div>
        <div class="cal-legend">
            <div class="cal-legend-item"><div class="cal-legend-dot exam"></div>Examen</div>
            <div class="cal-legend-item"><div class="cal-legend-dot event"></div>Evento</div>
        </div>
    `;

    const grid = container.querySelector('#cal-grid');

    WEEKDAYS.forEach(d => {
        const c = document.createElement('div');
        c.className = 'cal-weekday';
        c.textContent = d;
        grid.appendChild(c);
    });

    for (let i = offset-1; i >= 0; i--)
        grid.appendChild(_makeCell(prevLen-i, prevM, prevY, true));

    for (let d = 1; d <= total; d++)
        grid.appendChild(_makeCell(d, month, year, false));

    const rem = (7 - ((offset + total) % 7)) % 7;
    for (let d = 1; d <= rem; d++)
        grid.appendChild(_makeCell(d, nextM, nextY, true));

    container.querySelector('#cal-prev').addEventListener('click', () => {
        if (calState.month===0){calState.month=11;calState.year--;}else calState.month--;
        generateCalendar(calState.month, calState.year);
    });
    container.querySelector('#cal-next').addEventListener('click', () => {
        if (calState.month===11){calState.month=0;calState.year++;}else calState.month++;
        generateCalendar(calState.month, calState.year);
    });
}

function _makeCell(day, month, year, isOther) {
    const cell   = document.createElement('div');
    const key    = dateKey(day, month, year);
    const dayObj = isOther ? {events:[],note:'',moods:[]} : getDayData(key);
    const classes = ['cal-day'];

    if (isOther) {
        classes.push('other-month');
    } else {
        if (isToday(day,month,year)) classes.push('today');
        const jd = new Date(year,month,day).getDay();
        if (jd===0||jd===6) classes.push('weekend');
        if (calState.selectedDay?.d===day && calState.selectedDay?.m===month && calState.selectedDay?.y===year)
            classes.push('selected');
    }

    cell.className = classes.join(' ');

    // Número del día
    const numEl = document.createElement('div');
    numEl.className = 'cal-day-num';
    numEl.textContent = day;
    cell.appendChild(numEl);

    // Dots — SOLO puntos, sin emojis
    const dotsEl = document.createElement('div');
    dotsEl.className = 'cal-dots';
    if (!isOther && dayObj.events.length > 0) {
        dayObj.events.slice(0,3).forEach(ev => {
            const dot = document.createElement('div');
            dot.className = `cal-dot ${ev.type}`;
            dotsEl.appendChild(dot);
        });
    }
    cell.appendChild(dotsEl);

    if (!isOther) {
        cell.style.cursor = 'pointer';
        cell.addEventListener('click', () => {
            calState.selectedDay = {d:day, m:month, y:year};
            generateCalendar(calState.month, calState.year);
            openPanel(day, month, year);
        });
    }
    return cell;
}

// ════════════════════════════════════════════════════════════
// PANEL LATERAL (Vista / Edición)
// ════════════════════════════════════════════════════════════

function _getOrCreatePanel() {
    let overlay = document.getElementById('cal-panel-overlay');
    if (!overlay) {
        overlay = document.createElement('div');
        overlay.id = 'cal-panel-overlay';
        // Cerrar al hacer clic en el fondo
        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) closePanel();
        });
        document.body.appendChild(overlay);
    }
    let panel = document.getElementById('cal-side-panel');
    if (!panel) {
        panel = document.createElement('div');
        panel.id = 'cal-side-panel';
        overlay.appendChild(panel);
    }
    return panel;
}

function openPanel(day, month, year) {
    const key    = dateKey(day, month, year);
    const hasData = hasDayData(key);
    const panel  = _getOrCreatePanel();
    document.getElementById('cal-panel-overlay').classList.add('visible');
    panel.classList.add('visible');

    if (hasData) {
        renderViewMode(panel, day, month, year, key);
    } else {
        renderEditMode(panel, day, month, year, key);
    }
}

// ── MODO VISTA ────────────────────────────────────────────────
function renderViewMode(panel, day, month, year, key) {
    const dayObj = getDayData(key);
    const dateLabel = `${day} de ${MONTHS_ES[month]} de ${year}`;
    const todayFlag = isToday(day, month, year);

    const eventsHTML = dayObj.events.length > 0
        ? dayObj.events.map(ev => `
            <div class="cpv-event-chip ${ev.type}">
                <span class="cpv-chip-dot ${ev.type}"></span>
                <span>${_esc(ev.label)}</span>
                <span class="cpv-chip-badge">${ev.type === 'exam' ? 'Examen' : 'Evento'}</span>
            </div>`).join('')
        : `<p class="cpv-empty">Sin eventos este día</p>`;

    const noteHTML = dayObj.note.trim()
        ? `<p class="cpv-note-text">${_esc(dayObj.note).replace(/\n/g,'<br>')}</p>`
        : `<p class="cpv-empty">Sin nota</p>`;

    const moodsHTML = dayObj.moods && dayObj.moods.length > 0
        ? `<div class="cpv-moods-row">
            ${dayObj.moods.map(m => {
                const found = MOODS.find(x => x.emoji === m);
                return `<span class="cpv-mood-chip" title="${found ? found.label : ''}">${m}</span>`;
            }).join('')}
           </div>`
        : `<p class="cpv-empty">Sin estado de ánimo</p>`;

    panel.innerHTML = `
        <div class="cp-header">
            <div class="cp-header-left">
                <span class="cp-date-label">${dateLabel}</span>
                ${todayFlag ? '<span class="cp-today-badge">HOY</span>' : ''}
            </div>
            <div class="cp-header-actions">
                <button class="cp-edit-btn" id="cp-edit-btn">
                    <span class="material-symbols-outlined">edit</span>
                    Editar
                </button>
                <button class="cp-close-btn" id="cp-close-btn">
                    <span class="material-symbols-outlined">close</span>
                </button>
            </div>
        </div>

        <div class="cp-section">
            <p class="cp-section-title">
                <span class="material-symbols-outlined cp-s-icon">event</span>
                Eventos
            </p>
            <div class="cpv-events-list">${eventsHTML}</div>
        </div>

        <div class="cp-section">
            <p class="cp-section-title">
                <span class="material-symbols-outlined cp-s-icon">edit_note</span>
                Nota rápida
            </p>
            ${noteHTML}
        </div>

        <div class="cp-section">
            <p class="cp-section-title">
                <span class="material-symbols-outlined cp-s-icon">mood</span>
                Estado de ánimo
            </p>
            ${moodsHTML}
        </div>
    `;

    panel.querySelector('#cp-close-btn').addEventListener('click', closePanel);
    panel.querySelector('#cp-edit-btn').addEventListener('click', () => {
        renderEditMode(panel, day, month, year, key);
    });
}

// ── MODO EDICIÓN ──────────────────────────────────────────────
function renderEditMode(panel, day, month, year, key) {
    const dayObj    = getDayData(key);
    const dateLabel = `${day} de ${MONTHS_ES[month]} de ${year}`;

    panel.innerHTML = `
        <div class="cp-header">
            <div class="cp-header-left">
                <span class="cp-date-label">${dateLabel}</span>
            </div>
            <button class="cp-close-btn" id="cp-close-btn">
                <span class="material-symbols-outlined">close</span>
            </button>
        </div>

        <!-- EVENTOS -->
        <div class="cp-section">
            <p class="cp-section-title">
                <span class="material-symbols-outlined cp-s-icon">event</span>
                Eventos del día
            </p>
            <div class="cpe-events-list" id="cpe-events-list">
                ${_renderEditEvents(dayObj.events)}
            </div>
            <div class="cpe-add-row">
                <select class="cpe-type-select" id="cpe-type">
                    <option value="exam">📝 Examen</option>
                    <option value="event">📅 Evento</option>
                </select>
                <input class="cpe-input" id="cpe-input" type="text"
                       placeholder="Nombre del evento..." maxlength="60"/>
                <button class="cpe-add-btn" id="cpe-add-btn">
                    <span class="material-symbols-outlined">add</span>
                </button>
            </div>
            <div class="cpe-reminder-row" id="cpe-reminder-row">
                <span class="material-symbols-outlined cpe-reminder-icon">notifications</span>
                <label class="cpe-reminder-label" for="cpe-reminder-time">Recordatorio</label>
                <input class="cpe-reminder-input" id="cpe-reminder-time" type="time"
                       placeholder="--:--" title="Hora a la que recibirás la notificación"/>
                <span class="cpe-reminder-hint">Activa notificaciones en Ajustes para recibirlo</span>
            </div>
            <p class="cpe-reminder-warning" id="cpe-reminder-warning">
                <span class="material-symbols-outlined">error</span>
                Primero debes indicar la hora del recordatorio.
            </p>
        </div>

        <!-- GUARDAR -->
        <button class="cp-save-btn" id="cp-save-btn">
            <span class="material-symbols-outlined">save</span>
            Guardar
        </button>
    `;

    panel.querySelector('#cp-close-btn').addEventListener('click', closePanel);

    // Añadir evento
    const addEvent = () => {
        const type  = panel.querySelector('#cpe-type').value;
        const input = panel.querySelector('#cpe-input');
        const label = input.value.trim();
        if (!label) { input.focus(); return; }
        const reminderTime = panel.querySelector('#cpe-reminder-time')?.value || '';
        if (!reminderTime) { _showReminderWarning(panel); return; }
        _hideReminderWarning(panel);
        const cur = getDayData(key);
        if (cur.events.length >= 6) return;
        cur.events.push({type, label, reminder: reminderTime});
        // Schedule browser notification if permission granted and time set
        if (reminderTime && 'Notification' in window && Notification.permission === 'granted') {
            _scheduleEventNotification(label, reminderTime, key);
        }
        setDayData(key, cur);
        panel.querySelector('#cpe-events-list').innerHTML = _renderEditEvents(cur.events);
        _attachEditDelListeners(panel, key, day, month, year);
        input.value = '';
        const reminderInput = panel.querySelector('#cpe-reminder-time');
        if (reminderInput) reminderInput.value = '';
        input.focus();
        generateCalendar(calState.month, calState.year);
    };

    panel.querySelector('#cpe-add-btn').addEventListener('click', addEvent);
    panel.querySelector('#cpe-input').addEventListener('keydown', e => { if(e.key==='Enter') addEvent(); });
    panel.querySelector('#cpe-reminder-time').addEventListener('input', () => _hideReminderWarning(panel));
    _attachEditDelListeners(panel, key, day, month, year);

    // Guardar (solo eventos en modo edición del panel)
    panel.querySelector('#cp-save-btn').addEventListener('click', () => {
        // Si el usuario dejó algo escrito en el campo de evento pero no
        // puso la hora del recordatorio, avisamos antes de guardar.
        const pendingLabel = panel.querySelector('#cpe-input').value.trim();
        const reminderTime = panel.querySelector('#cpe-reminder-time')?.value || '';
        if (pendingLabel && !reminderTime) { _showReminderWarning(panel); return; }
        // los eventos ya se guardan en tiempo real al añadirlos
        generateCalendar(calState.month, calState.year);
        renderViewMode(panel, day, month, year, key);
        showToast('¡Guardado correctamente!');
    });
}

// ── Aviso de recordatorio obligatorio ─────────────────────────
function _showReminderWarning(panel) {
    const warning = panel.querySelector('#cpe-reminder-warning');
    const row     = panel.querySelector('#cpe-reminder-row');
    const input   = panel.querySelector('#cpe-reminder-time');
    if (warning) warning.classList.add('visible');
    if (row) row.classList.add('cpe-reminder-row-error');
    if (input) input.focus();
}
function _hideReminderWarning(panel) {
    const warning = panel.querySelector('#cpe-reminder-warning');
    const row     = panel.querySelector('#cpe-reminder-row');
    if (warning) warning.classList.remove('visible');
    if (row) row.classList.remove('cpe-reminder-row-error');
}

function _renderEditEvents(events) {
    if (!events || events.length === 0)
        return '<p class="cpv-empty" id="cpe-no-events">Sin eventos</p>';
    return events.map((ev, i) => `
        <div class="cpe-event-row ${ev.type}">
            <span class="cpv-chip-dot ${ev.type}"></span>
            <span class="cpe-event-label">${_esc(ev.label)}</span>
            <span class="cpe-event-type-tag">${ev.type==='exam'?'Examen':'Evento'}</span>
            <button class="cpe-del-btn" data-idx="${i}">
                <span class="material-symbols-outlined">delete</span>
            </button>
        </div>`).join('');
}

function _attachEditDelListeners(panel, key, day, month, year) {
    panel.querySelectorAll('.cpe-del-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const idx = parseInt(btn.dataset.idx);
            const cur = getDayData(key);
            cur.events.splice(idx, 1);
            setDayData(key, cur);
            panel.querySelector('#cpe-events-list').innerHTML = _renderEditEvents(cur.events);
            _attachEditDelListeners(panel, key, day, month, year);
            generateCalendar(calState.month, calState.year);
        });
    });
}

function closePanel() {
    const overlay = document.getElementById('cal-panel-overlay');
    if (overlay) overlay.classList.remove('visible');
    const panel = document.getElementById('cal-side-panel');
    if (panel) panel.classList.remove('visible');
    calState.selectedDay = null;
    generateCalendar(calState.month, calState.year);
}

// ════════════════════════════════════════════════════════════
// WIDGETS INDEPENDIENTES: NOTA RÁPIDA + EMOCIONES
// Se renderizan en los contenedores #nota y #estado del HTML
// ════════════════════════════════════════════════════════════

function initNotaWidget() {
    const el = document.getElementById('nota');
    if (!el) return;

    // Cargar dato guardado de hoy
    const key    = todayKey();
    const dayObj = getDayData(key);

    el.innerHTML = `
        <div id="nota-top">
            <span id="nota-title">📝 Nota rápida</span>
            <span id="nota-date-badge">${_todayLabel()}</span>
        </div>
        <textarea id="nota-user" placeholder="Escribe algo sobre tu día de hoy..."
                  maxlength="300">${_esc(dayObj.note)}</textarea>
        <button class="widget-save-btn" id="nota-save-btn">
            <span class="material-symbols-outlined">save</span>
            Guardar en el día de hoy
        </button>
    `;

    el.querySelector('#nota-save-btn').addEventListener('click', () => {
        const text = el.querySelector('#nota-user').value.trim();
        const cur  = getDayData(key);
        cur.note   = text;
        setDayData(key, cur);
        generateCalendar(calState.month, calState.year);
        showToast('¡Nota guardada en el día de hoy!');
        // Si el panel está abierto en hoy, refresca
        _refreshPanelIfToday(key);
    });
}

function initEstadoWidget() {
    const el = document.getElementById('estado');
    if (!el) return;

    const key      = todayKey();
    const dayObj   = getDayData(key);
    const selected = dayObj.moods || [];

    el.innerHTML = `
        <div id="estado-top">
            <span id="estado-title">¿Qué tal ha ido el día?</span>
            <span id="estado-date-badge">${_todayLabel()}</span>
        </div>
        <p class="info-emojis">Selecciona hasta 3 emociones</p>
        <div class="mood-list" id="mood-list">
            ${MOODS.map(m => `
                <button class="mood-emoji ${selected.includes(m.emoji)?'mood-active':''}"
                        data-emoji="${m.emoji}" title="${m.label}">
                    ${m.emoji}
                </button>`).join('')}
        </div>
        <button class="widget-save-btn" id="estado-save-btn">
            <span class="material-symbols-outlined">save</span>
            Guardar en el día de hoy
        </button>
    `;

    el.querySelectorAll('.mood-emoji').forEach(btn => {
        btn.addEventListener('click', () => {
            const emoji = btn.dataset.emoji;
            const active = [...el.querySelectorAll('.mood-emoji.mood-active')];
            if (btn.classList.contains('mood-active')) {
                btn.classList.remove('mood-active');
            } else {
                if (active.length >= 3) return; // max 3
                btn.classList.add('mood-active');
            }
        });
    });

    el.querySelector('#estado-save-btn').addEventListener('click', () => {
        const moods = [...el.querySelectorAll('.mood-emoji.mood-active')].map(b => b.dataset.emoji);
        const cur   = getDayData(key);
        cur.moods   = moods;
        setDayData(key, cur);
        generateCalendar(calState.month, calState.year);
        showToast('¡Estado de ánimo guardado en el día de hoy!');
        _refreshPanelIfToday(key);
    });
}

function _todayLabel() {
    const n = new Date();
    return `${n.getDate()} ${MONTHS_ES[n.getMonth()]}`;
}

function _refreshPanelIfToday(key) {
    const panel = document.getElementById('cal-side-panel');
    if (!panel || !panel.classList.contains('visible')) return;
    const sd = calState.selectedDay;
    if (!sd) return;
    const selKey = dateKey(sd.d, sd.m, sd.y);
    if (selKey === key) {
        renderViewMode(panel, sd.d, sd.m, sd.y, key);
    }
}

// ── Init ─────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
    generateCalendar(calState.month, calState.year);
    initNotaWidget();
    initEstadoWidget();
});
// ── Notificaciones de recordatorio ───────────────────────────
function _scheduleEventNotification(label, timeStr, dateKey) {
    // dateKey formato: "YYYY-MM-DD", timeStr: "HH:MM"
    const [year, month, day] = dateKey.split('-').map(Number);
    const [hours, minutes]   = timeStr.split(':').map(Number);
    const notifTime = new Date(year, month - 1, day, hours, minutes, 0);
    const now = Date.now();
    const delay = notifTime.getTime() - now;
    if (delay <= 0) return; // hora pasada
    setTimeout(() => {
        new Notification('⏰ WikiStudent — Recordatorio', {
            body: label,
            icon: '/wiki/favicon.png',
        });
    }, delay);
}