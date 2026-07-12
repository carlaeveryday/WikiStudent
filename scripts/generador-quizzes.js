/* ============================================================
   flashcards.js — WikiStudent (servidor local + caché local + skeletons)
   ============================================================ */

'use strict';

/* ── Usuario simulado ── */
const USUARIO_ACTUAL = "carla_123";

/* ── API config (Gemini) ── */
const API_KEY = "AIzaSyBI_N3W3LtfGSLGQHb7hCLYSzLizO1wlNA";
const API_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${API_KEY}`;

/* ================================================================
   CACHÉ LOCAL
   ================================================================ */

const _cache = {
    _store: new Map(),
    TTL: 60_000,

    key(folderId) { return folderId === null ? '__root__' : String(folderId); },

    get(folderId) {
        const entry = this._store.get(this.key(folderId));
        if (!entry) return null;
        if (Date.now() - entry.ts > this.TTL) { this._store.delete(this.key(folderId)); return null; }
        return entry;
    },

    set(folderId, data) { this._store.set(this.key(folderId), { ...data, ts: Date.now() }); },
    invalidate(folderId) { this._store.delete(this.key(folderId)); },
    invalidateAll() { this._store.clear(); }
};

/* ================================================================
   API LOCAL — HELPERS
   ================================================================ */

async function apiFetch(path, options = {}) {
    const res = await fetch(`/api${path}`, { 
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        ...options
    });
    if (!res.ok) throw new Error(`[API] ${options.method || 'GET'} ${path} → ${res.status}`);
    return res.json();
}

/* ================================================================
   CARPETAS
   ================================================================ */

async function createNewFolder(name, parentId = null) {
    const data = await apiFetch('/folders', {
        method: 'POST',
        body: JSON.stringify({ name, parent_id: parentId })
    });
    _cache.invalidate(parentId);
    return data;
}

async function getUserFolders(parentId = null) {
    const qs = parentId === null ? '?level=children' : `?level=children&parent_id=${parentId}`;
    return apiFetch(`/folders${qs}`).catch(() => []);
}

async function getAllUserFolders() {
    return apiFetch(`/folders`).catch(() => []);
}

async function deleteFolderFromDB(folderId) {
    await apiFetch(`/folders/${folderId}`, { method: 'DELETE' }).catch(console.error);
    _cache.invalidateAll();
}

async function renameFolderInDB(folderId, newName) {
    await apiFetch(`/folders/${folderId}`, {
        method: 'PATCH',
        body: JSON.stringify({ name: newName })
    }).catch(console.error);
    _cache.invalidateAll();
}

async function moveFolderInDB(folderId, newParentId) {
    await apiFetch(`/folders/${folderId}`, {
        method: 'PATCH',
        body: JSON.stringify({ parent_id: newParentId || null })
    }).catch(console.error);
    _cache.invalidateAll();
}

/* ================================================================
   MAZOS (DECKS)
   ================================================================ */

async function createDeckInDB(name, folderId = null) {
    const data = await apiFetch('/decks', {
        method: 'POST',
        body: JSON.stringify({ name, folder_id: folderId })
    });
    _cache.invalidate(folderId);
    return data;
}

async function getUserDecks(folderId = null) {
    const qs = folderId === null ? '' : `?folder_id=${folderId}`;
    return apiFetch(`/decks${qs}`).catch(() => []);
}

async function deleteDeckFromDB(deckId) {
    await apiFetch(`/decks/${deckId}`, { method: 'DELETE' }).catch(console.error);
    _cache.invalidateAll();
}

async function moveDeckInDB(deckId, newFolderId) {
    await apiFetch(`/decks/${deckId}`, {
        method: 'PATCH',
        body: JSON.stringify({ folder_id: newFolderId || null })
    }).catch(console.error);
    _cache.invalidateAll();
}

/* ================================================================
   TARJETAS (CARDS)
   ================================================================ */

async function saveCardsInDB(deckId, cardsArray) {
    if (!deckId) return;
    const serialized = cardsArray.map(c => ({
        q: c.q,
        a: c.opciones ? JSON.stringify({ opciones: c.opciones, correcta: c.correcta, tipo: c.tipo }) : c.a
    }));
    await apiFetch(`/cards/deck/${deckId}`, {
        method: 'PUT',
        body: JSON.stringify({ cards: serialized })
    });
    console.log(`[API] ${cardsArray.length} preguntas guardadas en quiz ${deckId}`);
}

async function getCardsForDeck(deckId) {
    const data = await apiFetch(`/cards/deck/${deckId}`).catch(() => []);
    return data.map(c => {
        let opciones = ['Verdadero', 'Falso'];
        let correcta = c.answer;
        let tipo = 'verdadero-falso';
        try {
            const parsed = JSON.parse(c.answer);
            if (parsed && parsed.opciones) {
                opciones = parsed.opciones;
                correcta = parsed.correcta;
                tipo     = parsed.tipo || 'multiple';
            }
        } catch (_) {}
        return { q: c.question, a: correcta, opciones, correcta, tipo, id: c.id };
    });
}

async function saveDeckToLocal(folderId, deckData) {
    let deckId = currentDeckId;
    if (!deckId) {
        const deck = await createDeckInDB(deckData.name, folderId);
        if (!deck) return;
        deckId = deck.id;
        currentDeckId = deckId;
    }
    await saveCardsInDB(deckId, deckData.cards);
}

/* ================================================================
   CONTEOS
   ================================================================ */

async function countDecksInFolder(folderId) {
    const data = await apiFetch(`/count/decks-in-folder/${folderId}`).catch(() => ({ count: 0 }));
    return data.count ?? 0;
}

async function countSubfoldersInFolder(folderId) {
    const data = await apiFetch(`/count/subfolders-in-folder/${folderId}`).catch(() => ({ count: 0 }));
    return data.count ?? 0;
}

async function countCardsInDeck(deckId) {
    const data = await apiFetch(`/count/cards-in-deck/${deckId}`).catch(() => ({ count: 0 }));
    return data.count ?? 0;
}

/* ================================================================
   NAVEGACIÓN JERÁRQUICA — BREADCRUMBS
   ================================================================ */

let breadcrumbStack = [{ id: null, name: 'Mis Carpetas' }];

function currentFolderId() {
    return breadcrumbStack[breadcrumbStack.length - 1].id;
}

function renderBreadcrumb() {
    const el = document.querySelector('.breadcrumb');
    if (!el) return;
    el.innerHTML = '';
    breadcrumbStack.forEach((crumb, idx) => {
        const isLast = idx === breadcrumbStack.length - 1;
        const span = document.createElement('span');
        span.textContent = crumb.name;
        if (isLast) {
            span.className = 'bc-active';
        } else {
            span.className = 'bc-link';
            span.addEventListener('click', () => {
                breadcrumbStack = breadcrumbStack.slice(0, idx + 1);
                renderBreadcrumb();
                loadUserContent();
            });
        }
        el.appendChild(span);
        if (!isLast) {
            const sep = document.createElement('span');
            sep.textContent = '›';
            el.appendChild(sep);
        }
    });
}

async function navigateIntoFolder(folderId, folderName) {
    breadcrumbStack.push({ id: folderId, name: folderName });
    renderBreadcrumb();
    await loadUserContent();
}

/* ================================================================
   SKELETON LOADERS
   ================================================================ */

function showSkeletons(count = 4) {
    const repoEl  = document.getElementById('repositorio');
    const addCard = document.getElementById('btnNuevaCarpeta');
    repoEl.querySelectorAll('.rep-card:not(#btnNuevaCarpeta), .skeleton-card').forEach(c => c.remove());
    for (let i = 0; i < count; i++) {
        const sk = document.createElement('div');
        sk.className = 'skeleton-card';
        repoEl.insertBefore(sk, addCard);
    }
}

function removeSkeletons() {
    document.querySelectorAll('.skeleton-card').forEach(s => s.remove());
}

/* ================================================================
   CARGA DEL REPOSITORIO
   ================================================================ */

async function loadUserContent(opts = {}) {
    const folderId    = currentFolderId();
    const repoEl      = document.getElementById('repositorio');
    const addCard     = document.getElementById('btnNuevaCarpeta');
    const cachedEntry = _cache.get(folderId);

    if (cachedEntry && !opts.forceRefresh) {
        renderRepoFromData(cachedEntry, addCard, repoEl);
        applySearchFilter(document.getElementById('busc-rep').value.trim());
        _refreshRepoInBackground(folderId, repoEl, addCard);
        return;
    }

    showSkeletons(5);
    repoEl.classList.add('loading');

    try {
        const [folders, decks] = await Promise.all([
            getUserFolders(folderId),
            getUserDecks(folderId)
        ]);

        // safeCount ensures .then always receives a plain number, never an object
        const safeCount = p => p.then(n => (typeof n === 'number' ? n : (n?.count ?? 0)))
                               .catch(() => 0);

        const folderCountsArr = await Promise.all(
            folders.map(f =>
                Promise.all([
                    safeCount(countDecksInFolder(f.id)),
                    safeCount(countSubfoldersInFolder(f.id))
                ]).then(([decks, subs]) => [f.id, { decks, subs }])
            )
        );
        const deckCountsArr = await Promise.all(
            decks.map(d => safeCount(countCardsInDeck(d.id)).then(count => [d.id, count]))
        );

        const folderCounts = new Map(folderCountsArr);
        const deckCounts   = new Map(deckCountsArr);

        _cache.set(folderId, { folders, decks, folderCounts, deckCounts });

        // Clean up loading state BEFORE rendering cards
        removeSkeletons();
        repoEl.classList.remove('loading');
        repoEl.querySelectorAll('.rep-card:not(#btnNuevaCarpeta)').forEach(c => c.remove());

        renderRepoFromData({ folders, decks, folderCounts, deckCounts }, addCard, repoEl);
        applySearchFilter(document.getElementById('busc-rep').value.trim());

    } catch (err) {
        // On failure, still clean up so the screen doesn't stay stuck on skeletons
        console.error('[loadUserContent]', err);
        removeSkeletons();
        repoEl.classList.remove('loading');
    }
}

function renderRepoFromData({ folders, decks, folderCounts, deckCounts }, addCard, repoEl) {
    repoEl.querySelectorAll('.rep-card:not(#btnNuevaCarpeta), .skeleton-card').forEach(c => c.remove());

    for (const folder of folders) {
        const counts = folderCounts.get(folder.id) ?? { decks: 0, subs: 0 };
        const { decks: dCount, subs: sCount } = typeof counts === 'object' ? counts : { decks: counts, subs: 0 };
        const sub = `${sCount} ${sCount === 1 ? 'carpeta' : 'carpetas'} • ${dCount} ${dCount === 1 ? 'mazo' : 'mazos'}`;
        const card = buildFolderCard(folder.name, sub);
        card.dataset.id = folder.id;
        repoEl.insertBefore(card, addCard);
    }

    for (const deck of decks) {
        const n    = deckCounts.get(deck.id) ?? 0;
        const card = buildDeckCard(deck.name, `${n} ${n === 1 ? 'pregunta' : 'preguntas'}`);
        card.dataset.id = deck.id;
        repoEl.insertBefore(card, addCard);
    }
}

async function _refreshRepoInBackground(folderId, repoEl, addCard) {
    // FIX Bug 3: check BEFORE each await, not just before rendering.
    // Without this, a navigation mid-flight would let the old folder's data
    // overwrite the newly-navigated folder's content.
    if (currentFolderId() !== folderId) return;

    const [folders, decks] = await Promise.all([
        getUserFolders(folderId),
        getUserDecks(folderId)
    ]);

    if (currentFolderId() !== folderId) return; // check again after first await

    const safeCount = p => p.then(n => (typeof n === 'number' ? n : (n?.count ?? 0)))
                           .catch(() => 0);

    const folderCountsArr = await Promise.all(
        folders.map(f =>
            Promise.all([
                safeCount(countDecksInFolder(f.id)),
                safeCount(countSubfoldersInFolder(f.id))
            ]).then(([decks, subs]) => [f.id, { decks, subs }])
        )
    );
    const deckCountsArr = await Promise.all(
        decks.map(d => safeCount(countCardsInDeck(d.id)).then(count => [d.id, count]))
    );

    const folderCounts = new Map(folderCountsArr);
    const deckCounts   = new Map(deckCountsArr);
    _cache.set(folderId, { folders, decks, folderCounts, deckCounts });

    if (currentFolderId() !== folderId) return; // final check before touching DOM
    renderRepoFromData({ folders, decks, folderCounts, deckCounts }, addCard, repoEl);
    applySearchFilter(document.getElementById('busc-rep').value.trim());
}

/* ================================================================
   BUSCADOR EN TIEMPO REAL
   ================================================================ */

function applySearchFilter(query) {
    const repoEl = document.getElementById('repositorio');
    const cards  = repoEl.querySelectorAll('.rep-card:not(#btnNuevaCarpeta)');
    const term   = query.toLowerCase().trim();
    cards.forEach(card => {
        const name = (card.dataset.name || '').toLowerCase();
        card.style.display = (!term || name.includes(term)) ? '' : 'none';
    });
}

document.getElementById('busc-rep').addEventListener('input', (e) => { applySearchFilter(e.target.value); });
document.getElementById('btnBuscar').addEventListener('click', () => { applySearchFilter(document.getElementById('busc-rep').value); });
document.getElementById('busc-rep').addEventListener('keydown', (e) => { if (e.key === 'Enter') applySearchFilter(e.target.value); });

/* ================================================================
   STATE
   ================================================================ */

let cards         = [];
let currentIndex  = 0;
let selectedQty   = 20;
let currentDeck   = null;
let currentDeckId = null;

let studyCards    = [];
let studyIndex    = 0;
let studyAciertos = 0;
let studyFallos   = 0;

/* ================================================================
   DOM refs
   ================================================================ */

const screenRepo    = document.getElementById('screen-repositorio');
const screenEditor  = document.getElementById('screen-editor');
const screenEstudio = document.getElementById('screen-estudio');
const editorTitle   = document.getElementById('editor-deck-name');
const estudioTitle  = document.getElementById('estudio-deck-name');
const btnVolver     = document.getElementById('btnVolver');

const tarjeta      = document.getElementById('tarjeta');
const pregunta     = document.getElementById('pregunta');
const contador     = document.getElementById('contador');
const dotsEl       = document.getElementById('dots');

const tarjetaEstudio    = document.getElementById('tarjeta-estudio');
const preguntaEstudio   = document.getElementById('pregunta-estudio');
const respuestaEstudio  = document.getElementById('respuesta-estudio');
const contadorEstudio   = document.getElementById('contador-estudio');
const dotsEstudio       = document.getElementById('dots-estudio');

const temaInput    = document.getElementById('tema');
const fileUpload   = document.getElementById('file-upload');
const btnGenerar   = document.getElementById('btnGenerar');
const btnAnterior  = document.getElementById('btnAnterior');
const btnSiguiente = document.getElementById('btnSiguiente');
const btnAnadir    = document.getElementById('btnAnadir');
const inputPregunta  = document.getElementById('nuevaPregunta');
// inputRespuesta eliminado — quiz usa opciones, no respuesta única

/* ================================================================
   SCREEN NAVIGATION
   ================================================================ */

// Pantallas que _fadeIn debe mostrar explícitamente con display:block
// (#repositorio es grid y nunca pasa por aquí, así que no hay conflicto)
const SCREEN_DISPLAY = new Map([
    ['screen-repositorio', 'block'],
    ['screen-editor',      'block'],
    ['screen-estudio',     'block'],
]);

function _fadeIn(el) {
    // El CSS define display:none en screen-editor y screen-estudio como regla
    // permanente. El.style.display='' la elimina pero la hoja de estilos gana.
    // Hay que poner display:block explícitamente para vencer esa regla.
    el.style.display = SCREEN_DISPLAY.get(el.id) || 'block';
    void el.offsetWidth; // force reflow para que la transición de opacidad funcione
    el.classList.add('visible');
}

function _fadeOut(el, cb) {
    // Si ya está oculto, disparar el callback de inmediato para no perderlo.
    if (el.style.display === 'none' || getComputedStyle(el).display === 'none') {
        if (cb) cb();
        return;
    }
    el.classList.remove('visible');
    setTimeout(() => {
        el.style.display = 'none';
        if (cb) cb();
    }, 230);
}

function showEditor(deckName, deckId = null) {
    currentDeck   = deckName;
    currentDeckId = deckId;
    cards         = [];
    currentIndex  = 0;
    editorTitle.textContent = `Editando: ${deckName}`;

    const btnGuardar = document.getElementById('btnGuardarCambios');
    if (btnGuardar) {
        btnGuardar.innerHTML = '<span class="material-symbols-outlined">save</span> Guardar Cambios';
        btnGuardar.disabled  = false;
        btnGuardar.classList.remove('saved');
    }

    _fadeOut(screenEstudio);
    _fadeOut(screenRepo, () => {
        _fadeIn(screenEditor);
        if (deckId) {
            getCardsForDeck(deckId).then(loaded => { cards = loaded; renderCard(); });
        } else {
            renderCard();
        }
    });
}

function showRepository() {
    _fadeOut(screenEditor);
    _fadeOut(screenEstudio, () => {
        _fadeIn(screenRepo);
        loadUserContent();
    });
}

function showEstudio(deckName, deckCards) {
    studyCards    = [...deckCards];
    studyIndex    = 0;
    studyAciertos = 0;
    studyFallos   = 0;
    estudioTitle.textContent = `Estudiando: ${deckName}`;
    _fadeOut(screenEditor);
    _fadeOut(screenRepo, () => {
        _fadeIn(screenEstudio);
        renderStudyCard();
    });
}

btnVolver.addEventListener('click', showRepository);
document.getElementById('btnVolverDesdeEstudio').addEventListener('click', showRepository);

/* ================================================================
   NAVEGACIÓN — UN SOLO CLICK EN CARPETA
   ================================================================ */

document.getElementById('repositorio').addEventListener('click', (e) => {
    if (e.target.closest('.kebab-btn') || e.target.closest('.kebab-menu') ||
        e.target.closest('.crear-dropdown') || e.target.closest('#btnNuevaCarpeta')) return;

    const folderCard = e.target.closest('.rep-card.carpeta:not(.carpeta-nueva)');
    if (folderCard) {
        const folderId   = folderCard.dataset.id;
        const folderName = folderCard.dataset.name;
        if (folderId && folderName) navigateIntoFolder(folderId, folderName);
        return;
    }

    const estudiarBtn = e.target.closest('.btn-estudiar');
    if (estudiarBtn) {
        const card   = estudiarBtn.closest('.rep-card');
        const deckId = card.dataset.id || null;
        const name   = card.dataset.name || 'Mazo';
        if (!deckId) { alert('Guarda el mazo antes de estudiarlo.'); return; }
        getCardsForDeck(deckId).then(loaded => {
            if (!loaded.length) { alert('Este quiz no tiene preguntas todavía.'); return; }
            showEstudio(name, loaded);
        });
        return;
    }

    const editBtn = e.target.closest('.btn-editar');
    if (editBtn) {
        const card   = editBtn.closest('.rep-card');
        const deckId = card.dataset.id || null;
        showEditor(card.dataset.name || 'Mazo sin nombre', deckId);
    }
});

/* ================================================================
   FLASHCARD RENDER — EDITOR
   ================================================================ */

function renderCard() {
    dotsEl.innerHTML = '';

    const opcionesContainer = document.getElementById('opciones-container');
    const badgeLabel        = document.getElementById('badge-label');

    if (!cards.length) {
        pregunta.textContent = 'Genera o añade preguntas para empezar';
        if (opcionesContainer) opcionesContainer.innerHTML = '';
        contador.textContent = '— / —';
        return;
    }

    const card     = cards[currentIndex];
    const opciones = card.opciones || ['Verdadero', 'Falso'];
    const correcta = card.correcta !== undefined ? card.correcta : card.a;
    const tipo     = card.tipo || (opciones.length === 2 && opciones[0] === 'Verdadero' ? 'verdadero-falso' : 'multiple');

    pregunta.textContent = card.q;
    contador.textContent = `${currentIndex + 1} / ${cards.length}`;

    if (badgeLabel) {
        badgeLabel.textContent = tipo === 'verdadero-falso' ? 'VERDADERO / FALSO' : 'MÚLTIPLE OPCIÓN';
    }

    if (opcionesContainer) {
        opcionesContainer.innerHTML = '';
        let respondido = false; /* bloquea después de responder */

        opciones.forEach((opcion) => {
            const div = document.createElement('div');
            div.className = 'opcion';
            div.textContent = opcion;

            const esCorrecta = Array.isArray(correcta)
                ? correcta.includes(opcion)
                : opcion === correcta;

            if (esCorrecta) div.dataset.correcta = 'true';

            div.addEventListener('click', () => {
                if (tipo === 'verdadero-falso') {
                    /* Radio: una sola respuesta, revela resultado inmediatamente */
                    if (respondido) return;
                    respondido = true;
                    opcionesContainer.querySelectorAll('.opcion').forEach(o => {
                        o.classList.remove('seleccionada');
                        o.classList.add(o.dataset.correcta === 'true' ? 'correcta' : 'incorrecta');
                    });
                    div.classList.remove('incorrecta');
                    div.classList.add(esCorrecta ? 'correcta' : 'incorrecta');

                } else {
                    /* Múltiple: toggle selección, no revela hasta confirmar */
                    div.classList.toggle('seleccionada');
                }
            });

            opcionesContainer.appendChild(div);
        });

        /* Botón "Comprobar" solo para múltiple opción */
        if (tipo === 'multiple') {
            const btnComprobar = document.createElement('button');
            btnComprobar.className = 'btn-comprobar';
            btnComprobar.textContent = 'Comprobar respuesta';
            btnComprobar.addEventListener('click', () => {
                if (respondido) return;
                respondido = true;
                opcionesContainer.querySelectorAll('.opcion').forEach(o => {
                    const correctaEsta = o.dataset.correcta === 'true';
                    const seleccionada = o.classList.contains('seleccionada');
                    o.classList.remove('seleccionada');
                    if (correctaEsta) {
                        o.classList.add('correcta');
                    } else if (seleccionada) {
                        o.classList.add('incorrecta');
                    }
                });
                btnComprobar.disabled = true;
                btnComprobar.style.opacity = '0.4';
            });
            opcionesContainer.appendChild(btnComprobar);
        }
    }

    const total = Math.min(cards.length, 10);
    for (let i = 0; i < total; i++) {
        const dot = document.createElement('div');
        dot.className = 'dot' + (i === currentIndex % 10 ? ' activo' : '');
        dotsEl.appendChild(dot);
    }
}

/* Tarjeta NO se voltea — es un quiz, no una flashcard */
btnAnterior.addEventListener('click',  () => { if (currentIndex > 0)                   { currentIndex--; renderCard(); } });
btnSiguiente.addEventListener('click', () => { if (currentIndex < cards.length - 1)    { currentIndex++; renderCard(); } });

/* ================================================================
   FLASHCARD RENDER — ESTUDIO
   ================================================================ */

function renderStudyCard() {
    tarjetaEstudio.classList.remove('volteada');
    dotsEstudio.innerHTML = '';

    if (!studyCards.length) {
        preguntaEstudio.textContent  = 'No hay preguntas.';
        respuestaEstudio.textContent = '';
        contadorEstudio.textContent  = '— / —';
        return;
    }

    const card = studyCards[studyIndex];
    preguntaEstudio.textContent  = card.q;
    respuestaEstudio.textContent = card.a;
    contadorEstudio.textContent  = `${studyIndex + 1} / ${studyCards.length}`;

    const total = Math.min(studyCards.length, 10);
    for (let i = 0; i < total; i++) {
        const dot    = document.createElement('div');
        const estado = studyCards[i]._estado;
        let cls = 'dot';
        if (i === studyIndex % 10)     cls += ' activo';
        else if (estado === 'acierto') cls += ' correcto';
        else if (estado === 'fallo')   cls += ' incorrecto';
        dot.className = cls;
        dotsEstudio.appendChild(dot);
    }
}

tarjetaEstudio.addEventListener('click', () => { if (studyCards.length) tarjetaEstudio.classList.toggle('volteada'); });

document.getElementById('btnAcierto').addEventListener('click', () => {
    if (!studyCards.length) return;
    studyCards[studyIndex]._estado = 'acierto';
    studyAciertos++;
    avanzarEstudio();
});

document.getElementById('btnFallo').addEventListener('click', () => {
    if (!studyCards.length) return;
    studyCards[studyIndex]._estado = 'fallo';
    studyFallos++;
    avanzarEstudio();
});

function avanzarEstudio() {
    if (studyIndex < studyCards.length - 1) { studyIndex++; renderStudyCard(); }
    else mostrarPopupResultados();
}

/* ================================================================
   POPUP DE RESULTADOS
   ================================================================ */

function mostrarPopupResultados() {
    const total = studyAciertos + studyFallos;
    const pct   = total > 0 ? Math.round((studyAciertos / total) * 100) : 0;

    document.getElementById('popup-percent').textContent  = `${pct}%`;
    document.getElementById('popup-aciertos').textContent = `${studyAciertos} aciertos`;
    document.getElementById('popup-fallos').textContent   = `${studyFallos} fallos`;

    document.getElementById('grafica-circular').style.background =
        `conic-gradient(#10b981 0% ${pct}%, #f2310f ${pct}% 100%)`;

    document.getElementById('popupResultados').classList.add('open');
}

document.getElementById('btnRepetir').addEventListener('click', () => {
    document.getElementById('popupResultados').classList.remove('open');
    studyCards    = studyCards.map(c => ({ ...c, _estado: undefined }));
    studyIndex    = 0;
    studyAciertos = 0;
    studyFallos   = 0;
    renderStudyCard();
});

document.getElementById('btnSalirEstudio').addEventListener('click', () => {
    document.getElementById('popupResultados').classList.remove('open');
    showRepository();
});

/* ================================================================
   BOTÓN GUARDAR CAMBIOS (editor)
   ================================================================ */

document.getElementById('btnGuardarCambios').addEventListener('click', async () => {
    const btn = document.getElementById('btnGuardarCambios');
    if (!currentDeckId && !currentDeck) return;

    btn.disabled = true;
    btn.innerHTML = '<span class="material-symbols-outlined rotating">sync</span> Guardando…';

    try {
        await saveDeckToLocal(currentFolderId(), { name: currentDeck, cards });

        if (currentDeckId) {
            const folderId   = currentFolderId();
            const cacheEntry = _cache.get(folderId);
            if (cacheEntry) {
                const deckCountsNew = new Map(cacheEntry.deckCounts);
                deckCountsNew.set(currentDeckId, cards.length);
                _cache.set(folderId, { ...cacheEntry, deckCounts: deckCountsNew });
            }
        }

        btn.innerHTML = '<span class="material-symbols-outlined">check_circle</span> Guardado';
        btn.classList.add('saved');
        setTimeout(() => {
            btn.innerHTML = '<span class="material-symbols-outlined">save</span> Guardar Cambios';
            btn.classList.remove('saved');
            btn.disabled  = false;
        }, 2500);
    } catch (err) {
        btn.innerHTML = '<span class="material-symbols-outlined">error</span> Error al guardar';
        btn.disabled  = false;
        console.error('[Guardar]', err);
    }
});

/* ================================================================
   QUANTITY SELECTOR
   ================================================================ */

document.querySelectorAll('.qty-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        const qty = parseInt(btn.dataset.qty);

        // 50 preguntas es función premium
        if (qty === 50) {
            openPremiumModal('qty50');
            return;
        }

        document.querySelectorAll('.qty-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        selectedQty = qty;
    });
});

/* ================================================================
   AI GENERATION
   ================================================================ */

function fileToBase64(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload  = () => resolve(reader.result.split(',')[1]);
        reader.onerror = reject;
        reader.readAsDataURL(file);
    });
}

function validate(text, files) {
    if (!text && !files.length)       return 'Escribe algo o adjunta una imagen.';
    if (text.length > 3000)           return 'El texto no puede superar los 3000 caracteres.';
    if (files.length > 5)             return 'Máximo 5 imágenes.';
    for (const f of files) {
        if (f.size > 5 * 1024 * 1024) return `"${f.name}" supera los 5 MB.`;
    }
    return null;
}

btnGenerar.addEventListener('click', async () => {
    const text  = temaInput.value.trim();
    const files = Array.from(fileUpload.files);
    const error = validate(text, files);
    if (error) { alert(error); return; }

    btnGenerar.style.opacity       = '0.5';
    btnGenerar.style.pointerEvents = 'none';
    btnGenerar.querySelector('span').textContent = 'sync';

    try {
        const parts = [];
        for (const file of files) {
            parts.push({ inline_data: { mime_type: file.type, data: await fileToBase64(file) } });
        }

        const topic = text || 'el contenido de las imágenes adjuntas';
        parts.push({ text:
            `Genera exactamente ${selectedQty} preguntas de quiz sobre: "${topic}".
Devuelve ÚNICAMENTE un array JSON válido, sin texto extra, sin markdown, sin bloques de código.
Cada objeto debe tener una pregunta clara y una respuesta concisa:
[{"q":"pregunta","a":"respuesta"}]`
        });

        const res = await fetch(API_URL, {
            method:  'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ contents: [{ parts }], generationConfig: { temperature: 0.7 } })
        });

        if (!res.ok) throw new Error(`Error de API (${res.status})`);

        const data      = await res.json();
        const raw       = data.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
        const clean     = raw.replace(/```json|```/g, '').trim();
        const generated = JSON.parse(clean);

        if (!Array.isArray(generated) || !generated.length) throw new Error('Respuesta no válida');

        cards        = generated.map(c => ({ q: c.q, opciones: c.opciones, correcta: c.correcta, tipo: c.tipo, a: c.correcta }));
        currentIndex = 0;
        renderCard();

    } catch (err) {
        alert('Error generando preguntas: ' + err.message);
    } finally {
        btnGenerar.style.opacity       = '';
        btnGenerar.style.pointerEvents = '';
        btnGenerar.querySelector('span').textContent = 'arrow_outward';
    }
});

/* ================================================================
   MANUAL ADD — select dinámico
   ================================================================ */

const manualTipoSelect  = document.getElementById('manual-tipo-select');
const manualOpcionesDiv = document.getElementById('manual-opciones');

/* Renderiza el bloque de opciones según el tipo seleccionado */
function renderManualOpciones() {
    const tipo = manualTipoSelect.value;
    manualOpcionesDiv.innerHTML = '';

    if (tipo === 'verdadero-falso') {
        /* Dos opciones fijas, no editables. Radio para marcar la correcta */
        ['Verdadero', 'Falso'].forEach((label, idx) => {
            const row = document.createElement('div');
            row.className = 'manual-opcion-row';
            row.innerHTML = `
                <input type="radio" name="manual-correcta" value="${idx}" id="chkVF${idx}">
                <label for="chkVF${idx}" class="manual-opcion-fixed">${label}</label>`;
            manualOpcionesDiv.appendChild(row);
        });

    } else {
        /* Múltiple opción: 4 inputs editables, checkboxes para marcar las correctas */
        ['A', 'B', 'C', 'D'].forEach((letra, idx) => {
            const row = document.createElement('div');
            row.className = 'manual-opcion-row';
            row.innerHTML = `
                <input type="checkbox" name="manual-correcta-multi" value="${idx}" id="chkM${idx}">
                <input type="text" class="manual-opcion-input" placeholder="Opción ${letra}">`;
            manualOpcionesDiv.appendChild(row);
        });
    }
}

/* Inicializar al cargar */
renderManualOpciones();

/* Actualizar cuando cambia el select */
manualTipoSelect.addEventListener('change', renderManualOpciones);

btnAnadir.addEventListener('click', addManualCard);
inputPregunta.addEventListener('keydown', (e) => { if (e.key === 'Enter') addManualCard(); });

function addManualCard() {
    const q    = inputPregunta.value.trim();
    const tipo = manualTipoSelect.value;
    if (!q) return;

    let opciones = [];
    let correcta;

    if (tipo === 'verdadero-falso') {
        opciones = ['Verdadero', 'Falso'];
        const checked = manualOpcionesDiv.querySelector('input[name="manual-correcta"]:checked');
        if (!checked) { alert('Selecciona cuál es la opción correcta.'); return; }
        correcta = opciones[parseInt(checked.value)];

    } else {
        const inputs   = manualOpcionesDiv.querySelectorAll('.manual-opcion-input');
        const checks   = manualOpcionesDiv.querySelectorAll('input[name="manual-correcta-multi"]:checked');
        opciones = Array.from(inputs).map(i => i.value.trim()).filter(Boolean);
        if (opciones.length < 2) { alert('Añade al menos 2 opciones.'); return; }
        if (!checks.length)      { alert('Marca al menos una opción correcta.'); return; }
        /* correcta: array de textos de las opciones marcadas */
        correcta = Array.from(checks).map(c => {
            const allInputs = manualOpcionesDiv.querySelectorAll('.manual-opcion-input');
            return allInputs[parseInt(c.value)]?.value.trim();
        }).filter(Boolean);
    }

    cards.push({ q, opciones, correcta, tipo, a: Array.isArray(correcta) ? correcta[0] : correcta });

    /* Reset */
    inputPregunta.value = '';
    renderManualOpciones();

    currentIndex = cards.length - 1;
    renderCard();
}

/* ================================================================
   KEBAB MENUS
   ================================================================ */

/* ================================================================
   KEBAB MENUS — floating menu appended to <body> to avoid z-index
   stacking context issues inside CSS Grid
   ================================================================ */

let _activeCard = null;

/* Shared floating menu element, lives in <body> */
const _floatingMenu = (() => {
    const el = document.createElement('div');
    el.className = 'kebab-menu kebab-menu--floating';
    el.style.cssText = 'position:fixed; z-index:9999; display:none; width:180px; min-width:unset; max-width:180px;';
    document.body.appendChild(el);
    return el;
})();

function closeAllMenus() {
    _floatingMenu.style.display = 'none';
    _floatingMenu.innerHTML = '';
    _activeCard = null;
}

function positionFloatingMenu(btn) {
    const btnRect  = btn.getBoundingClientRect();
    const menuWidth = 180;
    let top  = btnRect.bottom + 4;
    let left = btnRect.right - menuWidth;

    // Flip upward if too close to bottom
    if (top + 220 > window.innerHeight - 10) top = btnRect.top - 220;
    // Keep within left edge
    if (left < 8) left = 8;

    _floatingMenu.style.top  = top  + 'px';
    _floatingMenu.style.left = left + 'px';
    _floatingMenu.style.display = 'block';
}

document.addEventListener('click', (e) => {
    if (e.target.closest('.kebab-btn')) {
        e.stopPropagation();
        const btn  = e.target.closest('.kebab-btn');
        const card = e.target.closest('.rep-card');
        const isOpen = _floatingMenu.style.display !== 'none' && _activeCard === card;
        closeAllMenus();
        if (!isOpen) {
            // Clone the hidden inline menu's HTML into the floating menu
            const inlineMenu = card.querySelector('.kebab-menu:not(.kebab-menu--floating)');
            _floatingMenu.innerHTML = inlineMenu.innerHTML;
            _activeCard = card;
            positionFloatingMenu(btn);
        }
        return;
    }

    if (e.target.closest('.kebab-menu--floating button')) {
        e.stopPropagation();
        const btn    = e.target.closest('button');
        const action = btn.dataset.action;
        const card   = _activeCard;
        const name   = card ? card.dataset.name || '—' : '—';
        closeAllMenus();
        if (card) handleKebabAction(action, card, name);
        return;
    }

    const crearDD = document.getElementById('crearDropdown');
    if (!e.target.closest('#btnNuevaCarpeta')) crearDD.classList.remove('open');

    closeAllMenus();
});

// Close on scroll or resize to avoid stale positioning
window.addEventListener('scroll', closeAllMenus, true);
window.addEventListener('resize', closeAllMenus);

function handleKebabAction(action, card, name) {
    const id = card.dataset.id || null;

    switch (action) {
        case 'rename': {
            const newName = prompt(`Renombrar "${name}" a:`, name);
            if (newName && newName.trim()) {
                const nameEl = card.querySelector('.carpeta-title p') || card.querySelector('.mazo-title p');
                if (nameEl) nameEl.textContent = newName.trim();
                card.dataset.name = newName.trim();
                if (id) {
                    if (card.dataset.type === 'folder') {
                        renameFolderInDB(id, newName.trim());
                    } else {
                        apiFetch(`/decks/${id}`, {
                            method: 'PATCH',
                            body: JSON.stringify({ name: newName.trim() })
                        }).catch(console.error);
                    }
                }
                _cache.invalidateAll();
            }
            break;
        }
        case 'move':
            openMoveModal(card, name, id);
            break;
        case 'private':
            openPremiumModal();
            break;
        case 'duplicate':
            duplicateItem(card, name, id);
            break;
        case 'delete':
            if (confirm(`¿Eliminar "${name}"? Esta acción no se puede deshacer.`)) {
                card.remove();
                if (id) {
                    if (card.dataset.type === 'folder') deleteFolderFromDB(id);
                    else deleteDeckFromDB(id);
                }
                _cache.invalidate(currentFolderId());
            }
            break;
    }
}

/* ================================================================
   MODAL PREMIUM
   ================================================================ */

function openPremiumModal(context = 'private') {
    const desc = document.querySelector('#modalPremium .modal-premium-desc');
    if (desc) {
        if (context === 'qty50') {
            desc.innerHTML = `
                La opción de <strong>50 preguntas</strong> solo está disponible para usuarios
                con plan <strong>Premium</strong>.<br>Actualiza tu cuenta para desbloquear
                la generación de hasta 50 preguntas por quiz de una sola vez.
            `;
        } else {
            desc.innerHTML = `
                La opción <strong>Hacer Privada</strong> solo está disponible para usuarios
                con plan <strong>Premium</strong>.<br>Actualiza tu cuenta para controlar
                la visibilidad de tus mazos y carpetas.
            `;
        }
    }
    document.getElementById('modalPremium').classList.add('open');
}

document.getElementById('modalPremiumCerrar').addEventListener('click', () => {
    document.getElementById('modalPremium').classList.remove('open');
});

document.getElementById('modalPremium').addEventListener('click', (e) => {
    if (e.target === document.getElementById('modalPremium'))
        document.getElementById('modalPremium').classList.remove('open');
});

/* ================================================================
   MODAL MOVER
   ================================================================ */

let _moveCard = null;
let _moveId   = null;

async function openMoveModal(card, name, id) {
    _moveCard = card;
    _moveId   = id;

    const list = document.getElementById('moveModalList');
    list.innerHTML = '<p style="color:rgba(230,241,255,0.4);font-size:0.85rem;">Cargando carpetas…</p>';
    document.getElementById('modalMover').classList.add('open');

    // Siempre forzar recarga desde la BD para reflejar eliminaciones recientes
    _cache.invalidateAll();
    const folders = await getAllUserFolders();
    list.innerHTML = '';

    const rootLabel = document.createElement('label');
    rootLabel.className = 'move-option';
    rootLabel.innerHTML = `
        <input type="radio" name="moveTarget" value="__root__">
        <span class="material-symbols-outlined">home</span>
        <span>Raíz (sin carpeta)</span>`;
    list.appendChild(rootLabel);

    if (!folders.length) return;

    folders.forEach(f => {
        if (_moveCard && _moveCard.dataset.type === 'folder' && f.id === _moveId) return;
        const label = document.createElement('label');
        label.className = 'move-option';
        label.innerHTML = `
            <input type="radio" name="moveTarget" value="${f.id}">
            <span class="material-symbols-outlined">folder_open</span>
            <span>${escapeHtml(f.name)}</span>`;
        list.appendChild(label);
    });
}

document.getElementById('modalMoverCancelar').addEventListener('click', () => {
    document.getElementById('modalMover').classList.remove('open');
});

document.getElementById('modalMover').addEventListener('click', (e) => {
    if (e.target === document.getElementById('modalMover'))
        document.getElementById('modalMover').classList.remove('open');
});

document.getElementById('modalMoverGuardar').addEventListener('click', async () => {
    const selected = document.querySelector('input[name="moveTarget"]:checked');
    if (!selected) { alert('Selecciona una carpeta de destino.'); return; }

    const rawValue = selected.value;
    const targetId = rawValue === '__root__' ? null : rawValue;

    if (_moveCard && _moveId) {
        if (_moveCard.dataset.type === 'folder') {
            await moveFolderInDB(_moveId, targetId);
        } else {
            await moveDeckInDB(_moveId, targetId);
        }
        document.getElementById('modalMover').classList.remove('open');
        _cache.invalidateAll();
        await loadUserContent({ forceRefresh: true });
    }

    _moveCard = null;
    _moveId   = null;
});

/* ================================================================
   CREAR NUEVA CARPETA / MAZO
   ================================================================ */

const btnNueva       = document.getElementById('btnNuevaCarpeta');
const crearDD        = document.getElementById('crearDropdown');
const modal          = document.getElementById('modalCrear');
const modalNombre    = document.getElementById('modalNombre');
const modalCancelar  = document.getElementById('modalCancelar');
const modalConfirmar = document.getElementById('modalConfirmar');
const modalTitulo    = modal.querySelector('h3');

let _modalTipo = 'carpeta';

btnNueva.addEventListener('click', (e) => {
    if (e.target.closest('.crear-option')) return;
    e.stopPropagation();
    crearDD.classList.toggle('open');
});

document.querySelectorAll('.crear-option').forEach(btn => {
    btn.addEventListener('click', (e) => {
        e.stopPropagation();
        crearDD.classList.remove('open');
        const tipo = btn.dataset.crear;
        if (tipo === 'carpeta') openModal('carpeta');
        else if (tipo === 'mazo' || tipo === 'quizz') openModal('mazo');
    });
});

function openModal(tipo = 'carpeta') {
    _modalTipo = tipo;
    modalNombre.value = '';
    if (modalTitulo) modalTitulo.textContent = tipo === 'mazo' ? 'Nuevo Quiz' : 'Nueva Carpeta';
    modal.classList.add('open');
    setTimeout(() => modalNombre.focus(), 50);
}

function closeModal() { modal.classList.remove('open'); }

modalCancelar.addEventListener('click', closeModal);
modal.addEventListener('click', (e) => { if (e.target === modal) closeModal(); });
modalNombre.addEventListener('keydown', (e) => { if (e.key === 'Enter') confirmCreate(); });
modalConfirmar.addEventListener('click', confirmCreate);

async function confirmCreate() {
    const name = modalNombre.value.trim();
    if (!name) { modalNombre.focus(); return; }

    const repoEl  = document.getElementById('repositorio');
    const addCard = document.getElementById('btnNuevaCarpeta');

    if (_modalTipo === 'mazo') {
        const deck = await createDeckInDB(name, currentFolderId());
        const newCard = buildDeckCard(name, '0 preguntas');
        if (deck) newCard.dataset.id = deck.id;
        repoEl.insertBefore(newCard, addCard);
        _cache.invalidate(currentFolderId());
        closeModal();
        if (deck) showEditor(name, deck.id);

    } else {
        const folder = await createNewFolder(name, currentFolderId());
        const newCard = buildFolderCard(name, '0 mazos');
        if (folder) newCard.dataset.id = folder.id;
        repoEl.insertBefore(newCard, addCard);
        _cache.invalidate(currentFolderId());
        closeModal();
    }
}

/* ================================================================
   DUPLICAR
   ================================================================ */

async function duplicateItem(card, name, id) {
    const type = card.dataset.type;
    const baseName = name.replace(/ \(\d+\)$/, '');
    const newName  = await getNextDuplicateName(baseName, type);

    const repoEl  = document.getElementById('repositorio');
    const addCard = document.getElementById('btnNuevaCarpeta');

    if (type === 'folder') {
        const newFolder = await createNewFolder(newName, currentFolderId());
        const newCard   = buildFolderCard(newName, '0 mazos');
        if (newFolder) newCard.dataset.id = newFolder.id;
        repoEl.insertBefore(newCard, addCard);

    } else {
        const newDeck = await createDeckInDB(newName, currentFolderId());
        let copiedCount = 0;
        if (newDeck && id) {
            const originalCards = await getCardsForDeck(id);
            if (originalCards.length) {
                await saveCardsInDB(newDeck.id, originalCards);
                copiedCount = originalCards.length;
            }
        }
        const label   = `${copiedCount} ${copiedCount === 1 ? 'pregunta' : 'preguntas'}`;
        const newCard = buildDeckCard(newName, label);
        if (newDeck) newCard.dataset.id = newDeck.id;
        repoEl.insertBefore(newCard, addCard);
    }

    _cache.invalidate(currentFolderId());
}

async function getNextDuplicateName(baseName, type) {
    const table = type === 'folder' ? 'folders' : 'decks';
    const data = await apiFetch(
        `/names?table=${table}&pattern=${encodeURIComponent(baseName)}`
    ).catch(() => []);

    if (!data.length) return `${baseName} (2)`;

    const nums = data
        .map(row => {
            const match = row.name.match(/\((\d+)\)$/);
            return match ? parseInt(match[1]) : (row.name === baseName ? 1 : 0);
        })
        .filter(n => n > 0);

    const max = nums.length ? Math.max(...nums) : 1;
    return `${baseName} (${max + 1})`;
}

/* ================================================================
   BUILDERS
   ================================================================ */

function buildFolderCard(name, sub) {
    const card = document.createElement('div');
    card.className    = 'rep-card carpeta';
    card.dataset.type = 'folder';
    card.dataset.name = name;
    card.innerHTML = `
        <button class="kebab-btn material-symbols-outlined">more_vert</button>
        <div class="kebab-menu">
            <button data-action="rename"><span class="material-symbols-outlined">edit</span> Renombrar</button>
            <button data-action="move"><span class="material-symbols-outlined">drive_file_move</span> Mover</button>
            <button data-action="duplicate"><span class="material-symbols-outlined">content_copy</span> Duplicar</button>
            <button data-action="private"><span class="material-symbols-outlined">lock</span> Hacer Privada</button>
            <button data-action="delete" class="danger"><span class="material-symbols-outlined">delete</span> Eliminar</button>
        </div>
        <span class="visibility-badge">Pública</span>
        <span class="material-symbols-outlined carpeta-symbol">folder_open</span>
        <div class="carpeta-title">
            <p>${escapeHtml(name)}</p>
            <span class="number">${escapeHtml(sub)}</span>
        </div>`;
    return card;
}

function buildDeckCard(name, cardCount = '0 preguntas') {
    const card = document.createElement('div');
    card.className    = 'rep-card mazo';
    card.dataset.type = 'deck';
    card.dataset.name = name;
    card.innerHTML = `
        <button class="kebab-btn material-symbols-outlined">more_vert</button>
        <div class="kebab-menu">
            <button data-action="rename"><span class="material-symbols-outlined">edit</span> Renombrar</button>
            <button data-action="move"><span class="material-symbols-outlined">drive_file_move</span> Mover</button>
            <button data-action="duplicate"><span class="material-symbols-outlined">content_copy</span> Duplicar</button>
            <button data-action="private"><span class="material-symbols-outlined">lock</span> Hacer Privada</button>
            <button data-action="delete" class="danger"><span class="material-symbols-outlined">delete</span> Eliminar</button>
        </div>
        <span class="visibility-badge">Pública</span>
        <div class="mazoi-wrapper">
            <span class="material-symbols-outlined mazo-symbol">stacks</span>
            <div class="mazo-title">
                <p>${escapeHtml(name)}</p>
                <span class="number">${escapeHtml(cardCount)}</span>
            </div>
        </div>
        <div class="btn-mazo">
            <div class="btn-estudiar"><span class="material-symbols-outlined">play_arrow</span> Estudiar</div>
            <div class="btn-editar">Editar</div>
        </div>`;
    return card;
}

function escapeHtml(str) {
    return String(str)
        .replace(/&/g, '&amp;').replace(/</g, '&lt;')
        .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/* ================================================================
   INIT
   ================================================================ */

screenRepo.classList.add('visible')
renderBreadcrumb();
loadUserContent();

/* ================================================================
   TEST DE CONEXIÓN — ejecuta en consola: testLocal()
   ================================================================ */

window.testLocal = async function () {
    console.log('🔍 Probando conexión con servidor local...');
    const folders = await getUserFolders();
    console.log(`📁 Carpetas encontradas: ${folders.length}`, folders);
    const decks = await getUserDecks();
    console.log(`📋 Quizzes encontrados: ${decks.length}`, decks);
    console.log('✅ Conexión con servidor local funcionando correctamente.');
};