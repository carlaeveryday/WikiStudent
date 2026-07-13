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

// Texto de "cuánto queda" para una fecha (+ hora opcional) límite.
// Si vence hoy y hay hora límite, cuenta en horas/minutos en vez de días.
function remainingLabel(fecha, horaLimite) {
    if (!fecha) return '';
    const d = daysLeft(fecha);
    if (d > 0) return `Quedan ${d} día${d === 1 ? '' : 's'}`;
    if (d < 0) return `Venció hace ${Math.abs(d)} día${Math.abs(d) === 1 ? '' : 's'}`;

    // d === 0 → vence hoy
    if (!horaLimite) return 'Vence hoy';

    const [hh, mm] = horaLimite.split(':').map(Number);
    const limite = new Date();
    limite.setHours(hh, mm, 0, 0);
    const diffMs = limite - new Date();

    if (diffMs <= 0) {
        const pasado = Math.abs(diffMs);
        const hrs = Math.floor(pasado / 3600000);
        const mins = Math.floor((pasado % 3600000) / 60000);
        return `Venció hace ${hrs > 0 ? hrs + 'h ' : ''}${mins}min`;
    }
    const hrs = Math.floor(diffMs / 3600000);
    const mins = Math.floor((diffMs % 3600000) / 60000);
    return `Quedan ${hrs > 0 ? hrs + 'h ' : ''}${mins}min`;
}

function isRemainingVencido(fecha, horaLimite) {
    if (!fecha) return false;
    const d = daysLeft(fecha);
    if (d > 0) return false;
    if (d < 0) return true;
    if (!horaLimite) return false;
    const [hh, mm] = horaLimite.split(':').map(Number);
    const limite = new Date();
    limite.setHours(hh, mm, 0, 0);
    return (limite - new Date()) <= 0;
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

// ── Bloque de fecha límite (agenda) ──────────────────────────
function deadlineHTML(data) {
    if (!data.fecha) return '';
    const vencido = isRemainingVencido(data.fecha, data.hora_limite) ? ' vencido' : '';
    return `
        <span class="agenda-deadline-date">${formatDateShort(data.fecha)}${data.hora_limite ? ' · ' + data.hora_limite : ''}</span>
        <span class="agenda-deadline-remaining${vencido}">${remainingLabel(data.fecha, data.hora_limite)}</span>
    `;
}

function renderDeadlineInto(el, data) {
    if (!el) return;
    el.innerHTML = deadlineHTML(data);
    el.style.display = data.fecha ? '' : 'none';
}

// ── Renderizar fila de agenda (bloque fijo) ─────────────────
function renderAgendaRow(data) {
    const { hora, asignatura, titulo, urgencia } = data;
    const badge = urgenciaBadge(urgencia);
    const row = document.createElement('div');
    row.className = `agenda-row urgencia-${urgencia || 'pendiente'}`;
    row.dataset.taskId = data.id || '';
    row._data = data;
    row._card = null;

    row.innerHTML = `
        <span class="agenda-hora">${hora || ''}</span>
        <div class="agenda-indicador"></div>
        <div class="agenda-info">
            <span class="agenda-asignatura">${titulo || ''}</span>
            <span class="agenda-subtitulo">${asignatura || ''}</span>
        </div>
        <div class="agenda-right">
            <span class="agenda-badge ${badge.cls}">${badge.label}</span>
            <div class="agenda-deadline">${deadlineHTML(data)}</div>
            <div class="agenda-actions">
                <span class="material-symbols-outlined agenda-edit" title="Editar">edit</span>
                <span class="material-symbols-outlined agenda-delete" title="Eliminar">close</span>
            </div>
        </div>
    `;

    const deadlineEl = row.querySelector('.agenda-deadline');
    deadlineEl.style.display = data.fecha ? '' : 'none';

    row.querySelector('.agenda-edit').addEventListener('click', function(e) {
        e.stopPropagation();
        openTaskModal(row._data, row, row._card);
    });

    row.querySelector('.agenda-delete').addEventListener('click', function(e) {
        e.stopPropagation();
        if (row._data.id) apiDelete('/api/kanban/' + row._data.id);
        if (row._card) {
            const card = row._card;
            const col = card.closest('.kanban-col');
            const staging = card.closest('#kb-staging');
            card.remove();
            if (col) { updateCount(col.id); updateHint(col.id); }
            if (staging) updateStagingHint();
        }
        row.remove();
    });

    return row;
}

function updateAgendaRowContent(row, data) {
    row._data = data;
    row.className = `agenda-row urgencia-${data.urgencia || 'pendiente'}`;
    row.querySelector('.agenda-hora').textContent = data.hora || '';
    row.querySelector('.agenda-asignatura').textContent = data.titulo || '';
    row.querySelector('.agenda-subtitulo').textContent = data.asignatura || '';

    const badge = urgenciaBadge(data.urgencia);
    const badgeEl = row.querySelector('.agenda-badge');
    badgeEl.className = `agenda-badge ${badge.cls}`;
    badgeEl.textContent = badge.label;

    renderDeadlineInto(row.querySelector('.agenda-deadline'), data);
}

// ── Renderizar tarjeta Kanban ───────────────────────────────
function renderKanbanCard(data, agendaRow) {
    const { titulo, asignatura, fecha, urgencia, hora_limite } = data;
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
        <span class="material-symbols-outlined kb-card-del" title="Eliminar">close</span>
        <div class="kb-card-header-row">
            <div class="kb-card-title">${titulo}</div>
            <span class="agenda-badge ${badge.cls} kb-card-badge">${badge.label}</span>
        </div>
        <div class="kb-card-footer">
            <span class="kb-card-subject ${style.cls}">${asignatura || ''}</span>
            <span class="kb-card-date">${fecha ? todayLabel + (hora_limite ? ' · ' + hora_limite : '') : ''}</span>
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

    // Click en cualquier parte de la tarjeta (staging o columna) → editar
    card.addEventListener('click', function() {
        openTaskModal(card._data, card._agendaRow, card);
    });

    return card;
}

function updateCardContent(card, data) {
    card._data = data;
    const style = subjectStyle(data.asignatura);
    const days = daysLeft(data.fecha);
    const todayLabel = days === 0 ? 'Hoy' : formatDateShort(data.fecha);

    card.querySelector('.kb-card-title').textContent = data.titulo || '';

    const badge = urgenciaBadge(data.urgencia);
    const badgeEl = card.querySelector('.kb-card-badge');
    badgeEl.className = `agenda-badge ${badge.cls} kb-card-badge`;
    badgeEl.textContent = badge.label;

    const subjEl = card.querySelector('.kb-card-subject');
    subjEl.className = `kb-card-subject ${style.cls}`;
    subjEl.textContent = data.asignatura || '';

    card.querySelector('.kb-card-date').textContent =
        data.fecha ? todayLabel + (data.hora_limite ? ' · ' + data.hora_limite : '') : '';
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
    if (!stagingArea) return null;
    const hint = stagingArea.querySelector('.kb-staging-hint');
    const card = renderKanbanCard(data, agendaRow);
    stagingArea.insertBefore(card, hint || null);
    updateStagingHint();
    return card;
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

// ── Modal "Añadir / editar bloque" ───────────────────────────
const modalOverlay    = document.getElementById('modal-overlay');
const modalTitleEl    = document.querySelector('#modal-bloque .modal-title');
const btnAnadirBloque = document.getElementById('btn-anadir-bloque');
const btnModalCancel  = document.getElementById('btn-modal-cancel');
const btnModalConfirm = document.getElementById('btn-modal-confirm');
const modalDiasRestantesEl = document.getElementById('modal-dias-restantes');

// Contexto de edición: null → estamos creando un bloque nuevo.
// { data, row, card } → estamos editando ese bloque existente.
let editingContext = null;

function resetModal() {
    modalTitleEl.textContent = 'Nuevo bloque';
    document.getElementById('modal-asignatura').value  = '';
    document.getElementById('modal-subtitulo').value   = '';
    document.getElementById('modal-hora').value        = '';
    document.getElementById('modal-urgencia').value    = 'baja';
    document.getElementById('modal-fecha').value       = '';
    document.getElementById('modal-hora-limite').value = '';
    modalDiasRestantesEl.textContent = '';
    ['modal-asignatura', 'modal-subtitulo', 'modal-hora'].forEach(function(id) {
        document.getElementById(id).classList.remove('modal-field-error');
    });
    editingContext = null;
}

function openTaskModal(data, row, card) {
    editingContext = { data, row, card };
    modalTitleEl.textContent = 'Editar bloque';
    document.getElementById('modal-asignatura').value  = data.asignatura || '';
    document.getElementById('modal-subtitulo').value   = data.titulo || '';
    document.getElementById('modal-hora').value        = data.hora || '';
    document.getElementById('modal-urgencia').value    = data.urgencia || 'baja';
    document.getElementById('modal-fecha').value       = data.fecha || '';
    document.getElementById('modal-hora-limite').value = data.hora_limite || '';
    updateModalRemainingPreview();
    modalOverlay.classList.add('active');
}

function updateModalRemainingPreview() {
    const fecha = document.getElementById('modal-fecha').value;
    const horaLimite = document.getElementById('modal-hora-limite').value;
    modalDiasRestantesEl.textContent = remainingLabel(fecha, horaLimite);
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

['modal-fecha', 'modal-hora-limite'].forEach(function(id) {
    document.getElementById(id).addEventListener('input', updateModalRemainingPreview);
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
    const fecha      = document.getElementById('modal-fecha').value || null;
    // La hora límite solo tiene sentido si hay fecha límite.
    const horaLimite = fecha ? (document.getElementById('modal-hora-limite').value || null) : null;

    let valid = true;
    ['modal-asignatura', 'modal-subtitulo', 'modal-hora'].forEach(function(id) {
        const el = document.getElementById(id);
        if (!el.value.trim()) { el.classList.add('modal-field-error'); valid = false; }
        else el.classList.remove('modal-field-error');
    });
    if (!valid) return;

    // ── Modo edición ──
    if (editingContext) {
        const { data, row, card } = editingContext;
        const updates = { titulo: subtitulo, asignatura, hora, urgencia, fecha, hora_limite: horaLimite };
        Object.assign(data, updates);

        if (data.id) apiPatch('/api/kanban/' + data.id, updates);
        if (row) updateAgendaRowContent(row, data);
        if (card) updateCardContent(card, data);

        modalOverlay.classList.remove('active');
        resetModal();
        return;
    }

    // ── Modo creación ──
    let taskData = { titulo: subtitulo, asignatura, hora, urgencia, fecha, hora_limite: horaLimite, columna: 'staging', orden: 0 };
    try {
        const saved = await apiPost('/api/kanban', taskData);
        taskData = Object.assign(taskData, { id: saved.id });
    } catch (_) { /* si falla la API igualmente mostramos la tarjeta sin id */ }

    // Fila en agenda
    const agendaList = document.getElementById('agenda-list');
    const row = renderAgendaRow(taskData);
    agendaList.appendChild(row);

    // Tarjeta en staging (vinculada a la fila, y viceversa)
    const card = addToStaging(taskData, row);
    row._card = card;

    modalOverlay.classList.remove('active');
    resetModal();
});

// ── Refresco periódico del tiempo restante en la agenda ──────
setInterval(function() {
    document.querySelectorAll('.agenda-row').forEach(function(row) {
        if (!row._data || !row._data.fecha) return;
        renderDeadlineInto(row.querySelector('.agenda-deadline'), row._data);
    });
}, 30000);

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
        // La fila de agenda (bloque fijo) se muestra para cualquier tarea
        // que no esté ya terminada, viva en la columna que viva.
        let row = null;
        if (task.columna !== 'terminada') {
            row = renderAgendaRow(task);
            agendaList.appendChild(row);
        }

        if (task.columna === 'staging') {
            const card = addToStaging(task, row);
            if (row) row._card = card;

        } else if (['pendiente', 'en-proceso', 'terminada'].includes(task.columna)) {
            const zona = document.querySelector('#' + task.columna + ' .kb-cards');
            if (!zona) return;
            const card = renderKanbanCard(task, row);
            if (row) row._card = card;
            const hint = zona.querySelector('.kb-drop-hint');
            zona.insertBefore(card, hint || null);
        }
    });

    updateAllCounts();
    updateAllHints();
    updateStagingHint();
}

loadKanban();