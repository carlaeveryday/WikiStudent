/* ============================================================
   flashcards.js — WikiStudent (servidor local + caché local + skeletons)
   ============================================================ */

'use strict';

/* La generación con IA ya NO se hace desde aquí con una key visible en el
   navegador — ahora se pide a nuestro propio backend (ver más abajo,
   btnGenerar), que es quien habla con Gemini usando GEMINI_API_KEY desde
   el .env del servidor. Así la clave nunca viaja al cliente. */

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
    const res = await fetch(path, {
        credentials: 'include',   // ← necesario para que la cookie de sesión viaje con cada petición
        headers: { 'Content-Type': 'application/json' },
        ...options
    });
    if (!res.ok) {
        // Si el servidor mandó { error: "..." } lo usamos tal cual (mensaje
        // legible), y si no, nos quedamos con el genérico de antes.
        let msg = `[API] ${options.method || 'GET'} ${path} → ${res.status}`;
        try {
            const body = await res.json();
            if (body?.error) msg = body.error;
        } catch (_) { /* la respuesta no era JSON, nos quedamos con el mensaje genérico */ }
        throw new Error(msg);
    }
    return res.json();
}

/* ================================================================
   CARPETAS
   ================================================================ */

async function createNewFolder(name, parentId = null) {
    // El servidor obtiene el user_id de req.user.id (Passport); no lo enviamos desde el cliente
    const data = await apiFetch('/api/folders', {
        method: 'POST',
        body: JSON.stringify({ name, parent_id: parentId })
    });
    _cache.invalidate(parentId);
    return data;
}

async function getUserFolders(parentId = null) {
    const qs = parentId === null ? '?level=children' : `?level=children&parent_id=${parentId}`;
    return apiFetch(`/api/folders${qs}`).catch(() => []);
}

async function getAllUserFolders() {
    return apiFetch('/api/folders').catch(() => []);
}

async function deleteFolderFromDB(folderId) {
    await apiFetch(`/api/folders/${folderId}`, { method: 'DELETE' }).catch(console.error);
    _cache.invalidateAll();
}

async function renameFolderInDB(folderId, newName) {
    await apiFetch(`/api/folders/${folderId}`, {
        method: 'PATCH',
        body: JSON.stringify({ name: newName })
    }).catch(console.error);
    _cache.invalidateAll();
}

async function moveFolderInDB(folderId, newParentId) {
    await apiFetch(`/api/folders/${folderId}`, {
        method: 'PATCH',
        body: JSON.stringify({ parent_id: newParentId || null })
    }).catch(console.error);
    _cache.invalidateAll();
}

/* ================================================================
   MAZOS (DECKS)
   ================================================================ */

async function createDeckInDB(name, folderId = null) {
    const data = await apiFetch('/api/decks', {
        method: 'POST',
        body: JSON.stringify({ name, folder_id: folderId })
    });
    _cache.invalidate(folderId);
    return data;
}

async function getUserDecks(folderId = null) {
    const qs = folderId === null ? '' : `?folder_id=${folderId}`;
    return apiFetch(`/api/decks${qs}`).catch(() => []);
}

async function deleteDeckFromDB(deckId) {
    await apiFetch(`/api/decks/${deckId}`, { method: 'DELETE' }).catch(console.error);
    _cache.invalidateAll();
}

async function moveDeckInDB(deckId, newFolderId) {
    await apiFetch(`/api/decks/${deckId}`, {
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
    await apiFetch(`/api/cards/deck/${deckId}`, {
        method: 'PUT',
        body: JSON.stringify({ cards: cardsArray })
    });
    console.log(`[API] ${cardsArray.length} tarjetas guardadas en mazo ${deckId}`);
}

async function getCardsForDeck(deckId) {
    const data = await apiFetch(`/api/cards/deck/${deckId}`).catch(() => []);
    return data.map(c => ({ q: c.question, a: c.answer, id: c.id }));
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
    const data = await apiFetch(`/api/count/decks-in-folder/${folderId}`).catch(() => ({ count: 0 }));
    return data.count ?? 0;
}

async function countSubfoldersInFolder(folderId) {
    const data = await apiFetch(`/api/count/subfolders-in-folder/${folderId}`).catch(() => ({ count: 0 }));
    return data.count ?? 0;
}

async function countCardsInDeck(deckId) {
    const data = await apiFetch(`/api/count/cards-in-deck/${deckId}`).catch(() => ({ count: 0 }));
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
        const card = buildDeckCard(deck.name, `${n} ${n === 1 ? 'tarjeta' : 'tarjetas'}`);
        card.dataset.id = deck.id;
        repoEl.insertBefore(card, addCard);
    }
}

async function _refreshRepoInBackground(folderId, repoEl, addCard) {
    // FIX Bug 3: check BEFORE each await, not just before rendering.
    if (currentFolderId() !== folderId) return;

    const [folders, decks] = await Promise.all([
        getUserFolders(folderId),
        getUserDecks(folderId)
    ]);

    if (currentFolderId() !== folderId) return;

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

    if (currentFolderId() !== folderId) return;
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
let selectedQty   = 15;
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
const respuesta    = document.getElementById('respuesta');
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
const inputRespuesta = document.getElementById('nuevaRespuesta');

/* ================================================================
   SCREEN NAVIGATION
   ================================================================ */

const SCREEN_DISPLAY = new Map([
    ['screen-repositorio', 'block'],
    ['screen-editor',      'block'],
    ['screen-estudio',     'block'],
]);

function _fadeIn(el) {
    el.style.display = SCREEN_DISPLAY.get(el.id) || 'block';
    void el.offsetWidth;
    el.classList.add('visible');
}

function _fadeOut(el, cb) {
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
            if (!loaded.length) { alert('Este mazo no tiene tarjetas todavía.'); return; }
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
    tarjeta.classList.remove('volteada');
    dotsEl.innerHTML = '';

    if (!cards.length) {
        pregunta.textContent  = 'Genera o añade tarjetas para empezar';
        respuesta.textContent = '';
        contador.textContent  = '— / —';
        return;
    }

    const card = cards[currentIndex];
    pregunta.textContent  = card.q;
    respuesta.textContent = card.a;
    contador.textContent  = `${currentIndex + 1} / ${cards.length}`;

    const total = Math.min(cards.length, 10);
    for (let i = 0; i < total; i++) {
        const dot = document.createElement('div');
        dot.className = 'dot' + (i === currentIndex % 10 ? ' activo' : '');
        dotsEl.appendChild(dot);
    }
}

tarjeta.addEventListener('click', () => { if (cards.length) tarjeta.classList.toggle('volteada'); });
btnAnterior.addEventListener('click', () => { if (currentIndex > 0) { currentIndex--; renderCard(); } });
btnSiguiente.addEventListener('click', () => { if (currentIndex < cards.length - 1) { currentIndex++; renderCard(); } });

/* ================================================================
   FLASHCARD RENDER — ESTUDIO
   ================================================================ */

function renderStudyCard() {
    tarjetaEstudio.classList.remove('volteada');
    dotsEstudio.innerHTML = '';

    if (!studyCards.length) {
        preguntaEstudio.textContent  = 'No hay tarjetas.';
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
        document.querySelectorAll('.qty-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        selectedQty = parseInt(btn.dataset.qty);
    });
});

/* ================================================================
   AI GENERATION — INLINE ERROR + SPINNING ICON
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

function showGeneradorError(msg) {
    const el = document.getElementById('generador-error');
    if (!el) return;
    el.textContent = msg;
    el.style.display = 'flex';
    // Ocultar automáticamente tras 4 segundos
    clearTimeout(el._hideTimeout);
    el._hideTimeout = setTimeout(() => { el.style.display = 'none'; }, 4000);
}

function hideGeneradorError() {
    const el = document.getElementById('generador-error');
    if (el) el.style.display = 'none';
}

function setGenerarLoading(loading) {
    const iconSpan = btnGenerar.querySelector('span.material-symbols-outlined');
    if (loading) {
        btnGenerar.style.opacity       = '0.6';
        btnGenerar.style.pointerEvents = 'none';
        if (iconSpan) {
            iconSpan.textContent = 'sync';
            iconSpan.classList.add('rotating');
        }
    } else {
        btnGenerar.style.opacity       = '';
        btnGenerar.style.pointerEvents = '';
        if (iconSpan) {
            iconSpan.textContent = 'arrow_outward';
            iconSpan.classList.remove('rotating');
        }
    }
}

btnGenerar.addEventListener('click', async () => {
    const text  = temaInput.value.trim();
    const files = Array.from(fileUpload.files);
    const error = validate(text, files);
    if (error) {
        showGeneradorError(error);
        return;
    }

    hideGeneradorError();
    setGenerarLoading(true);

    try {
        const images = [];
        for (const file of files) {
            images.push({ mime_type: file.type, data: await fileToBase64(file) });
        }

        // Ya no llamamos a Gemini directamente: se lo pedimos a nuestro
        // propio servidor (POST /api/flashcards/generate), que es quien
        // tiene la API key guardada en el .env.
        const { cards: generated } = await apiFetch('/api/flashcards/generate', {
            method: 'POST',
            body: JSON.stringify({ topic: text, qty: selectedQty, images }),
        });

        if (!Array.isArray(generated) || !generated.length) throw new Error('Respuesta no válida');

        cards        = generated.map(({ q, a }) => ({ q, a }));
        currentIndex = 0;
        renderCard();

    } catch (err) {
        showGeneradorError('Error generando flashcards: ' + err.message);
    } finally {
        setGenerarLoading(false);
    }
});

/* ================================================================
   MANUAL ADD
   ================================================================ */

btnAnadir.addEventListener('click', addManualCard);
inputRespuesta.addEventListener('keydown', (e) => { if (e.key === 'Enter') addManualCard(); });

function addManualCard() {
    const q = inputPregunta.value.trim();
    const a = inputRespuesta.value.trim();
    if (!q || !a) return;
    cards.push({ q, a });
    inputPregunta.value  = '';
    inputRespuesta.value = '';
    currentIndex = cards.length - 1;
    renderCard();
}

/* ================================================================
   KEBAB MENUS — floating menu appended to <body> to avoid z-index
   stacking context issues inside CSS Grid
   ================================================================ */

let _activeCard = null;

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

    if (top + 220 > window.innerHeight - 10) top = btnRect.top - 220;
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

window.addEventListener('scroll', closeAllMenus, true);
window.addEventListener('resize', closeAllMenus);

/* ================================================================
   MODAL ELIMINAR — custom confirm dialog
   ================================================================ */

let _deleteCard = null;
let _deleteId   = null;

function openDeleteModal(card, name, id) {
    _deleteCard = card;
    _deleteId   = id;
    const nombreEl = document.getElementById('modalEliminarNombre');
    if (nombreEl) nombreEl.textContent = `"${name}"`;
    document.getElementById('modalEliminar').classList.add('open');
}

function closeDeleteModal() {
    document.getElementById('modalEliminar').classList.remove('open');
    _deleteCard = null;
    _deleteId   = null;
}

document.getElementById('modalEliminarCancelar').addEventListener('click', closeDeleteModal);

document.getElementById('modalEliminar').addEventListener('click', (e) => {
    if (e.target === document.getElementById('modalEliminar')) closeDeleteModal();
});

document.getElementById('modalEliminarConfirmar').addEventListener('click', () => {
    if (!_deleteCard) { closeDeleteModal(); return; }
    _deleteCard.remove();
    if (_deleteId) {
        if (_deleteCard.dataset.type === 'folder') deleteFolderFromDB(_deleteId);
        else deleteDeckFromDB(_deleteId);
    }
    _cache.invalidate(currentFolderId());
    closeDeleteModal();
});

/* ================================================================
   KEBAB ACTION HANDLER
   ================================================================ */

function handleKebabAction(action, card, name) {
    const id = card.dataset.id || null;

    switch (action) {
        case 'rename':
            openRenameModal(card, name, id);
            break;
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
            openDeleteModal(card, name, id);
            break;
    }
}

/* ================================================================
   MODAL PREMIUM
   ================================================================ */

function openPremiumModal() { document.getElementById('modalPremium').classList.add('open'); }

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

    // Forzar recarga desde la BD para que las carpetas eliminadas no aparezcan
    const folders = await getAllUserFolders();
    list.innerHTML = '';

    // Obtener los IDs de carpetas visibles actualmente en el DOM (las no eliminadas)
    const visibleFolderIds = new Set(
        Array.from(document.querySelectorAll('#repositorio .rep-card.carpeta[data-id]'))
            .map(el => String(el.dataset.id))
    );

    // Construir set de IDs a excluir: la propia carpeta + sus descendientes
    const excludedIds = new Set();
    if (_moveCard && _moveCard.dataset.type === 'folder' && id) {
        const movingId = String(id);
        excludedIds.add(movingId);
        // Marcar recursivamente todos los descendientes
        const markDescendants = (parentId) => {
            folders.forEach(f => {
                if (String(f.parent_id) === parentId) {
                    const fid = String(f.id);
                    if (!excludedIds.has(fid)) {
                        excludedIds.add(fid);
                        markDescendants(fid);
                    }
                }
            });
        };
        markDescendants(movingId);
    }

    const rootLabel = document.createElement('label');
    rootLabel.className = 'move-option';
    rootLabel.innerHTML = `
        <input type="radio" name="moveTarget" value="__root__">
        <span class="material-symbols-outlined">home</span>
        <span>Raíz (sin carpeta)</span>`;
    list.appendChild(rootLabel);

    if (!folders.length) return;

    folders.forEach(f => {
        const fid = String(f.id);
        // Excluir: la carpeta en sí misma, sus descendientes, y carpetas eliminadas del DOM
        if (excludedIds.has(fid)) return;
        if (!visibleFolderIds.has(fid)) return;

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
        else if (tipo === 'mazo') openModal('mazo');
    });
});

/* ── Renombrar con modal ── */
let _renameCard = null;
let _renameId   = null;

function openRenameModal(card, currentName, id) {
    _renameCard = card;
    _renameId   = id;
    _modalTipo  = 'rename';
    modalNombre.value = currentName;
    if (modalTitulo) modalTitulo.textContent = 'Renombrar';
    modal.classList.add('open');
    setTimeout(() => { modalNombre.select(); modalNombre.focus(); }, 50);
}

function openModal(tipo = 'carpeta') {
    _modalTipo = tipo;
    modalNombre.value = '';
    if (modalTitulo) modalTitulo.textContent = tipo === 'mazo' ? 'Nuevo Mazo' : 'Nueva Carpeta';
    modal.classList.add('open');
    setTimeout(() => modalNombre.focus(), 50);
}

function closeModal() { modal.classList.remove('open'); }

modalCancelar.addEventListener('click', closeModal);
modal.addEventListener('click', (e) => { if (e.target === modal) closeModal(); });
modalNombre.addEventListener('keydown', (e) => { if (e.key === 'Enter') confirmCreate(); });
modalConfirmar.addEventListener('click', confirmCreate);

async function confirmCreate() {
    let name = modalNombre.value.trim(); 
    if (!name) { modalNombre.focus(); return; }

    const table = (_modalTipo === 'carpeta' || _modalTipo === 'folder' || (_renameCard && _renameCard.dataset.type === 'folder')) ? 'folders' : 'decks';

    /* ── 1. VALIDACIÓN UNIVERSAL DE DUPLICADOS ── */
    // Usamos el nombre base (sin sufijo " (N)") para buscar todas las variantes
    const baseName = name.replace(/ \(\d+\)$/, '').trim();

    // El servidor devuelve solo el nombre exacto + "baseName (N)" — sin falsos positivos
    const data = await apiFetch(`/api/names?table=${table}&pattern=${encodeURIComponent(baseName)}`).catch(() => []);
    const existingNames = new Set(data.map(row => row.name));

    // Si es un renombre y el usuario no cambió el nombre, no hacer nada
    const isSameNameAsBefore = _modalTipo === 'rename' && _renameCard && _renameCard.dataset.name === name;

    if (!isSameNameAsBefore && existingNames.has(baseName)) {
        // El sufijo es el número total de variantes existentes + 1
        // existingNames contiene: "baseName" + "baseName (2)" + "baseName (3)"...
        name = `${baseName} (${existingNames.size + 1})`;
    } else if (!isSameNameAsBefore) {
        // No existe ninguna variante, usar el nombre base limpio
        name = baseName;
    }

    /* ── 2. CASO: RENOMBRAR ── */
    if (_modalTipo === 'rename') {
        const card = _renameCard;
        const id   = _renameId;
        
        closeModal();
        _renameCard = null;
        _renameId   = null;

        if (card) {
            const nameEl = card.querySelector('.carpeta-title p') || card.querySelector('.mazo-title p');
            if (nameEl) nameEl.textContent = name;
            card.dataset.name = name; // Actualizamos el dataset con el nombre (con número si hubo choque)
        }
        if (id) {
            if (card && card.dataset.type === 'folder') {
                await renameFolderInDB(id, name);
            } else {
                await apiFetch(`/api/decks/${id}`, {
                    method: 'PATCH',
                    body: JSON.stringify({ name })
                }).catch(console.error);
                _cache.invalidateAll();
            }
        }
        await loadUserContent({ forceRefresh: true });
        return;
    }

    /* ── 3. CASO: CREACIÓN NUEVA ── */
    const repoEl  = document.getElementById('repositorio');
    const addCard = document.getElementById('btnNuevaCarpeta');

    if (_modalTipo === 'mazo') {
        const deck = await createDeckInDB(name, currentFolderId());
        const newCard = buildDeckCard(name, '0 tarjetas');
        if (deck) newCard.dataset.id = deck.id;
        repoEl.insertBefore(newCard, addCard);
        _cache.invalidate(currentFolderId());
        closeModal();
        await loadUserContent({ forceRefresh: true });
        if (deck) showEditor(name, deck.id);

    } else {
        const folder = await createNewFolder(name, currentFolderId());
        const newCard = buildFolderCard(name, '0 carpetas • 0 mazos');
        if (folder) newCard.dataset.id = folder.id;
        repoEl.insertBefore(newCard, addCard);
        _cache.invalidate(currentFolderId());
        closeModal();
        await loadUserContent({ forceRefresh: true });
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
        const label   = `${copiedCount} ${copiedCount === 1 ? 'tarjeta' : 'tarjetas'}`;
        const newCard = buildDeckCard(newName, label);
        if (newDeck) newCard.dataset.id = newDeck.id;
        repoEl.insertBefore(newCard, addCard);
    }

    _cache.invalidate(currentFolderId());
}

async function getNextDuplicateName(baseName, type) {
    const table = type === 'folder' ? 'folders' : 'decks';
    const data = await apiFetch(
        `/api/names?table=${table}&pattern=${encodeURIComponent(baseName)}`
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

function buildDeckCard(name, cardCount = '0 tarjetas') {
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

screenRepo.classList.add('visible');
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
    console.log(`🃏 Mazos encontrados: ${decks.length}`, decks);
    console.log('✅ Conexión con servidor local funcionando correctamente.');
};