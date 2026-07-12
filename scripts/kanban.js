/* ============================================================
   kanban.js — Agenda + Kanban  (con persistencia en API)
   ============================================================ */

// ── Colores por asignatura ──────────────────────────────────
const SUBJECT_COLORS = {
    'matemáticas': { cls: 'subject-mates',    hex: '#ff6b2b' },
    'mates':       { cls: 'subject-mates',    hex: '#ff6b2b' },
    'física':      { cls: 'subject-fisica',   hex: '#4e8ef7' },
    'historia':    { cls: 'subject-historia', hex: '#a879f5' },
    'inglés':      { cls: 'subject-ingles',   hex: '#5fca7d' },
    'otro':        { cls: 'subject-otro',     hex: '#00d2ff' },
};

function subjectStyle(name) {
    const key = (name || '').toLowerCase();
    for (const [k, v] of Object.entries(SUBJECT_COLORS)) {
        if (key.includes(k)) return v;
    }
    return SUBJECT_COLORS['otro'];
}

// ── Utilidades de fecha ─────────────────────────────────────
function formatDateShort(dateStr) {
    if (!dateStr) return '';
    const d = new Date(dateStr);
    const dd = d.getDate();
    const mm = d.toLocaleString('es', { month: 'short' }).replace('.', '');
    return `${dd} ${mm}`;
}

function daysLeft(dateStr) {
    if (!dateStr) return null;
    const hoy = new Date();
    hoy.setHours(0, 0, 0, 0);
    const limite = new Date(dateStr);
    return Math.round((limite - hoy) / 86400000);
}

// ── Badge de urgencia ───────────────────────────────────────
function urgenciaBadge(nivel) {
    const map = {
        urgente: { cls: 'badge-urgente', label: 'Urgente' },
        media:   { cls: 'badge-media',   label: 'Medio' },
        baja:    { cls: 'badge-baja',    label: 'Baja' },
    };
    return map[nivel] || { cls: 'badge-pendiente', label: 'Pendiente' };
}

// ── API helpers ─────────────────────────────────────────────
async function apiGet(url) {
    const r = await fetch(url);
    if (!r.ok) throw new Error('API error ' + r.status);
    return r.json();
}
async function apiPost(url, body) {
    const r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    if (!r.ok) throw new Error('API error ' + r.status);
    return r.json();
}
async function apiPatch(url, body) {
    await fetch(url, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
}
async function apiDelete(url) {
    await fetch(url, { method: 'DELETE' });
}
async function apiBulkOrder(tasks) {
    await fetch('/api/kanban/bulk-order', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ tasks }) });
}

// ── Guardar orden tras drag ─────────────────────────────────
function persistOrder() {
    const updates = [];
    ['staging', 'pendiente', 'en-proceso', 'terminada'].forEach(function(col) {
        const container = col === 'staging'
            ? document.getElementById('kb-staging')
            : document.querySelector('#' + col + ' .kb-cards');
        if (!container) return;
        container.querySelectorAll('.kb-card[data-id]').forEach(function(card, idx) {
            updates.push({ id: parseInt(card.dataset.id), columna: col, orden: idx });
        });
    });
    if (updates.length) apiBulkOrder(updates);
}

// ── Renderizar fila de agenda ───────────────────────────────
function renderAgendaRow(data) {
    const { hora, asignatura, titulo, urgencia } = data;
    const badge = urgenciaBadge(urgencia);
    const row = document.createElement('div');
    row.className = `agenda-row urgencia-${urgencia || 'pendiente'}`;
    row.dataset.taskId = data.id || '';
    row.innerHTML = `
        <span class="agenda-hora">${hora || ''}</span>
        <div class="agenda-indicador"></div>
        <div class="agenda-info">
            <span class="agenda-asignatura">${titulo || ''}</span>
            <span class="agenda-subtitulo">${asignatura || ''}</span>
        </div>
        <span class="agenda-badge ${badge.cls}">${badge.label}</span>
    `;
    return row;
}

// ── Renderizar tarjeta Kanban ───────────────────────────────
function renderKanbanCard(data, agendaRow) {
    const { titulo, asignatura, fecha, urgencia } = data;
    const style = subjectStyle(asignatura);
    const dateLabel = fecha ? formatDateShort(fecha) : '';
    const days = daysLeft(fecha);
    const todayLabel = (days === 0) ? 'Hoy' : dateLabel;
    const badge = urgenciaBadge(urgencia);

    const card = document.createElement('div');
    card.classList.add('kb-card');
    if (data.id) card.dataset.id = data.id;
    card._agendaRow = agendaRow || null;
    card._data = data;

    card.innerHTML = `
        <span class="kb-card-del">×</span>
        <div class="kb-card-header-row">
            <div class="kb-card-title">${titulo}</div>
            <span class="agenda-badge ${badge.cls} kb-card-badge">${badge.label}</span>
        </div>
        <div class="kb-card-footer">
            <span class="kb-card-subject ${style.cls}">${asignatura || ''}</span>
            <span class="kb-card-date">${todayLabel}</span>
        </div>
    `;

    // Eliminar — también elimina fila de agenda y BD
    card.querySelector('.kb-card-del').addEventListener('click', function(e) {
        e.stopPropagation();
        if (data.id) apiDelete('/api/kanban/' + data.id);
        if (card._agendaRow) card._agendaRow.remove();
        const col = card.closest('.kanban-col');
        const staging = card.closest('#kb-staging');
        card.remove();
        if (col) { updateCount(col.id); updateHint(col.id); }
        if (staging) updateStagingHint();
    });

    // Click → popup solo si ya está en columna kanban
    card.addEventListener('click', function() {
        if (!card.closest('.kanban-col')) return;
        openCardPopup(card, data);
    });

    return card;
}

// ── Staging area ────────────────────────────────────────────
const stagingArea = document.getElementById('kb-staging');

function updateStagingHint() {
    if (!stagingArea) return;
    const hint = stagingArea.querySelector('.kb-staging-hint');
    if (!hint) return;
    hint.style.display = stagingArea.querySelectorAll('.kb-card').length > 0 ? 'none' : '';
}

function addToStaging(data, agendaRow) {
    if (!stagingArea) return;
    const hint = stagingArea.querySelector('.kb-staging-hint');
    const card = renderKanbanCard(data, agendaRow);
    stagingArea.insertBefore(card, hint || null);
    updateStagingHint();
}

// ── Contadores Kanban ───────────────────────────────────────
const COUNTER_IDS = {
    'pendiente':  'contador-pendiente',
    'en-proceso': 'contador-enProceso',
    'terminada':  'contador-terminada',
};

function updateCount(colId) {
    const zona = document.querySelector(`#${colId} .kb-cards`);
    if (!zona) return;
    const n = zona.querySelectorAll('.kb-card').length;
    const el = document.getElementById(COUNTER_IDS[colId]);
    if (el) el.textContent = n;
}

function updateAllCounts() {
    Object.keys(COUNTER_IDS).forEach(updateCount);
}

// ── Hints de columna vacía ──────────────────────────────────
function updateHint(colId) {
    const zona = document.querySelector(`#${colId} .kb-cards`);
    if (!zona) return;
    const hint = zona.querySelector('.kb-drop-hint');
    if (!hint) return;
    hint.style.display = zona.querySelectorAll('.kb-card').length > 0 ? 'none' : '';
}

function updateAllHints() {
    Object.keys(COUNTER_IDS).forEach(updateHint);
}

// ── Popup detalle de tarjeta ────────────────────────────────
let tarjetaActiva = null;

function openCardPopup(card, data) {
    tarjetaActiva = { card, data };
    document.getElementById('tarea').textContent = data.titulo || '';
    document.getElementById('dias-restantes').textContent = '';
    const fi = document.getElementById('fecha-input');
    fi.value = data.fecha || '';
    if (data.fecha) {
        const d = daysLeft(data.fecha);
        document.getElementById('dias-restantes').textContent =
            d === 0 ? 'Vence hoy' : d > 0 ? `Quedan ${d} días` : `Venció hace ${Math.abs(d)} días`;
    }
    document.getElementById('kanban-overlay').classList.add('active');
}

document.getElementById('fecha-input').addEventListener('input', function() {
    const d = daysLeft(this.value);
    document.getElementById('dias-restantes').textContent =
        d === null ? '' : d === 0 ? 'Vence hoy' : d > 0 ? `Quedan ${d} días` : `Venció hace ${Math.abs(d)} días`;
});

document.getElementById('btn-cancelar').addEventListener('click', function() {
    document.getElementById('kanban-overlay').classList.remove('active');
    tarjetaActiva = null;
});

document.getElementById('btn-guardar').addEventListener('click', function() {
    if (!tarjetaActiva) return;
    const { card, data } = tarjetaActiva;
    const nuevaFecha = document.getElementById('fecha-input').value;
    data.fecha = nuevaFecha;
    const dateEl = card.querySelector('.kb-card-date');
    if (dateEl) {
        const d = daysLeft(nuevaFecha);
        dateEl.textContent = d === 0 ? 'Hoy' : formatDateShort(nuevaFecha);
    }
    if (data.id) apiPatch('/api/kanban/' + data.id, { fecha: nuevaFecha || null });
    document.getElementById('kanban-overlay').classList.remove('active');
    tarjetaActiva = null;
});

// ── Drag & Drop con SortableJS ──────────────────────────────
const COLS = ['pendiente', 'en-proceso', 'terminada'];

if (stagingArea) {
    Sortable.create(stagingArea, {
        group: { name: 'kanban', pull: true, put: false },
        animation: 150,
        draggable: '.kb-card',
        filter: '.kb-staging-hint',
        preventOnFilter: false,
        ghostClass: 'kb-card-ghost',
        onStart: function() { document.body.style.cursor = 'grabbing'; },
        onEnd: function() {
            document.body.style.cursor = '';
            updateStagingHint();
            updateAllCounts();
            updateAllHints();
            persistOrder();
        },
    });
}

COLS.forEach(function(id) {
    const zona = document.querySelector('#' + id + ' .kb-cards');
    if (!zona) return;
    Sortable.create(zona, {
        group: 'kanban',
        animation: 150,
        draggable: '.kb-card',
        filter: '.kb-drop-hint',
        preventOnFilter: false,
        ghostClass: 'kb-card-ghost',
        onStart: function() { document.body.style.cursor = 'grabbing'; },
        onEnd: function() { document.body.style.cursor = ''; },
        onAdd: function(evt) {
            updateAllCounts();
            updateAllHints();
            persistOrder();
            // Al soltar en "terminada" → eliminar fila de agenda
            if (id === 'terminada') {
                const card = evt.item;
                if (card._agendaRow) {
                    card._agendaRow.remove();
                    card._agendaRow = null;
                }
            }
        },
        onRemove: function() { updateAllCounts(); updateAllHints(); persistOrder(); },
        onUpdate: function() { updateAllCounts(); updateAllHints(); persistOrder(); },
    });
});

// ── Modal "Añadir bloque" ───────────────────────────────────
const modalOverlay    = document.getElementById('modal-overlay');
const btnAnadirBloque = document.getElementById('btn-anadir-bloque');
const btnModalCancel  = document.getElementById('btn-modal-cancel');
const btnModalConfirm = document.getElementById('btn-modal-confirm');

function resetModal() {
    document.getElementById('modal-asignatura').value = '';
    document.getElementById('modal-subtitulo').value  = '';
    document.getElementById('modal-hora').value       = '';
    document.getElementById('modal-urgencia').value   = 'baja';
}

btnAnadirBloque.addEventListener('click', function() {
    resetModal();
    modalOverlay.classList.add('active');
});

['modal-asignatura', 'modal-subtitulo', 'modal-hora'].forEach(function(id) {
    document.getElementById(id).addEventListener('input', function() {
        this.classList.remove('modal-field-error');
    });
});

btnModalCancel.addEventListener('click', function() {
    modalOverlay.classList.remove('active');
    resetModal();
});

modalOverlay.addEventListener('click', function(e) {
    if (e.target === modalOverlay) {
        modalOverlay.classList.remove('active');
        resetModal();
    }
});

btnModalConfirm.addEventListener('click', async function() {
    const asignatura = document.getElementById('modal-asignatura').value.trim();
    const subtitulo  = document.getElementById('modal-subtitulo').value.trim();
    const hora       = document.getElementById('modal-hora').value.trim();
    const urgencia   = document.getElementById('modal-urgencia').value;

    let valid = true;
    ['modal-asignatura', 'modal-subtitulo', 'modal-hora'].forEach(function(id) {
        const el = document.getElementById(id);
        if (!el.value.trim()) { el.classList.add('modal-field-error'); valid = false; }
        else el.classList.remove('modal-field-error');
    });
    if (!valid) return;

    // Guardar en BD primero, luego pintar con el id real
    let taskData = { titulo: subtitulo, asignatura, hora, urgencia, fecha: null, columna: 'staging', orden: 0 };
    try {
        const saved = await apiPost('/api/kanban', taskData);
        taskData = Object.assign(taskData, { id: saved.id });
    } catch (_) { /* si falla la API igualmente mostramos la tarjeta sin id */ }

    // Fila en agenda
    const agendaList = document.getElementById('agenda-list');
    const row = renderAgendaRow({ hora, asignatura, titulo: subtitulo, urgencia, id: taskData.id });
    agendaList.appendChild(row);

    // Tarjeta en staging
    addToStaging(taskData, row);

    modalOverlay.classList.remove('active');
    resetModal();
});

// ── Carga inicial desde API ─────────────────────────────────
async function loadKanban() {
    let tasks;
    try {
        tasks = await apiGet('/api/kanban');
    } catch (_) {
        return; // sin conexión — no romper la página
    }

    const agendaList = document.getElementById('agenda-list');

    tasks.forEach(function(task) {
        if (task.columna === 'staging') {
            // Crear fila de agenda + tarjeta en staging
            const row = renderAgendaRow(task);
            agendaList.appendChild(row);
            addToStaging(task, row);

        } else if (['pendiente', 'en-proceso', 'terminada'].includes(task.columna)) {
            // Tarjeta directamente en su columna kanban (sin fila de agenda)
            const zona = document.querySelector('#' + task.columna + ' .kb-cards');
            if (!zona) return;
            const card = renderKanbanCard(task, null);
            const hint = zona.querySelector('.kb-drop-hint');
            zona.insertBefore(card, hint || null);
        }
    });

    updateAllCounts();
    updateAllHints();
    updateStagingHint();
}

loadKanban();