/* ==================================================================
   ESPACIO DE LECTURA Y ARCHIVOS — WikiStudent
   Todo se guarda localmente en el navegador del usuario (IndexedDB),
   no requiere backend. Soporta PDF, imágenes y archivos de texto,
   con subrayador y notas adhesivas persistentes por documento.
   ================================================================== */

(function () {
    "use strict";

    /* ----------------------------------------------------------------
       CONFIG PDF.JS
       ---------------------------------------------------------------- */
    if (window.pdfjsLib) {
        pdfjsLib.GlobalWorkerOptions.workerSrc =
            "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";
    }

    const COLOR_MAP = {
        yellow: "rgba(255, 210, 63, 0.55)",
        green: "rgba(78, 203, 113, 0.5)",
        pink: "rgba(231, 22, 214, 0.4)",
        blue: "rgba(0, 210, 255, 0.42)"
    };

    /* ----------------------------------------------------------------
       INDEXEDDB — almacenamiento local de archivos + anotaciones
       ---------------------------------------------------------------- */
    const DB_NAME = "wikistudent-lectura";
    const STORE_NAME = "archivos";
    let dbPromise = null;

    function abrirDB() {
        if (dbPromise) return dbPromise;
        dbPromise = new Promise((resolve, reject) => {
            const req = indexedDB.open(DB_NAME, 1);
            req.onupgradeneeded = () => {
                const db = req.result;
                if (!db.objectStoreNames.contains(STORE_NAME)) {
                    db.createObjectStore(STORE_NAME, { keyPath: "id" });
                }
            };
            req.onsuccess = () => resolve(req.result);
            req.onerror = () => reject(req.error);
        });
        return dbPromise;
    }

    async function guardarRegistro(record) {
        const db = await abrirDB();
        return new Promise((resolve, reject) => {
            const tx = db.transaction(STORE_NAME, "readwrite");
            tx.objectStore(STORE_NAME).put(record);
            tx.oncomplete = () => resolve();
            tx.onerror = () => reject(tx.error);
        });
    }

    async function borrarRegistro(id) {
        const db = await abrirDB();
        return new Promise((resolve, reject) => {
            const tx = db.transaction(STORE_NAME, "readwrite");
            tx.objectStore(STORE_NAME).delete(id);
            tx.oncomplete = () => resolve();
            tx.onerror = () => reject(tx.error);
        });
    }

    async function listarRegistros() {
        const db = await abrirDB();
        return new Promise((resolve, reject) => {
            const tx = db.transaction(STORE_NAME, "readonly");
            const req = tx.objectStore(STORE_NAME).getAll();
            req.onsuccess = () => resolve(req.result || []);
            req.onerror = () => reject(req.error);
        });
    }

    /* ----------------------------------------------------------------
       UTILIDADES
       ---------------------------------------------------------------- */
    function uid() {
        return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
    }

    function escapeHtml(str) {
        return str
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;");
    }

    function formatoTamano(bytes) {
        if (bytes < 1024) return bytes + " B";
        if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB";
        return (bytes / (1024 * 1024)).toFixed(1) + " MB";
    }

    function categoriaDe(file) {
        if (file.type === "application/pdf" || /\.pdf$/i.test(file.name)) return "pdf";
        if (file.type.startsWith("image/")) return "imagen";
        return "texto";
    }

    function iconoDe(categoria) {
        if (categoria === "pdf") return "picture_as_pdf";
        if (categoria === "imagen") return "image";
        return "description";
    }

    /* ----------------------------------------------------------------
       ESTADO GLOBAL
       ---------------------------------------------------------------- */
    let herramientaActual = "select"; // 'select' | 'highlight' | 'note'
    let colorActual = "yellow";
    let archivoActivo = null; // registro completo cargado en el visor
    let textoCrudoActivo = ""; // sólo para archivos de texto

    /* ----------------------------------------------------------------
       ELEMENTOS
       ---------------------------------------------------------------- */
    const $upload = document.getElementById("lectura-upload");
    const $inputArchivo = document.getElementById("input-archivo");
    const $btnUpload = document.getElementById("lectura-upload-btn");
    const $lista = document.getElementById("archivos-lista");
    const $listaVacia = document.getElementById("archivos-vacio");
    const $visorArea = document.getElementById("visor-area");
    const $visorVacio = document.getElementById("visor-vacio");
    const $colores = document.getElementById("visor-colors");
    const $btnLimpiar = document.getElementById("btn-limpiar-anotaciones");
    const $btnBorrarArchivo = document.getElementById("btn-borrar-archivo");
    const $honestidadBanner = document.getElementById("honestidad-banner");
    const $cerrarHonestidad = document.getElementById("cerrar-honestidad");

    /* ----------------------------------------------------------------
       BANNER DE HONESTIDAD
       ---------------------------------------------------------------- */
    if (localStorage.getItem("wikistudent-honestidad-cerrado") === "1") {
        $honestidadBanner.style.display = "none";
    }
    $cerrarHonestidad.addEventListener("click", () => {
        $honestidadBanner.style.display = "none";
        localStorage.setItem("wikistudent-honestidad-cerrado", "1");
    });

    /* ----------------------------------------------------------------
       SUBIDA DE ARCHIVOS (drag & drop + selector)
       ---------------------------------------------------------------- */
    $upload.addEventListener("click", (e) => {
        if (e.target !== $btnUpload && e.target.closest(".lectura-upload__btn") === null) {
            // permitir click en toda la zona, no sólo el botón
        }
        $inputArchivo.click();
    });

    ["dragenter", "dragover"].forEach((evt) =>
        $upload.addEventListener(evt, (e) => {
            e.preventDefault();
            $upload.classList.add("drag-activo");
        })
    );

    ["dragleave", "drop"].forEach((evt) =>
        $upload.addEventListener(evt, (e) => {
            e.preventDefault();
            $upload.classList.remove("drag-activo");
        })
    );

    $upload.addEventListener("drop", (e) => {
        const files = e.dataTransfer.files;
        if (files && files.length) manejarNuevosArchivos(files);
    });

    $inputArchivo.addEventListener("change", (e) => {
        if (e.target.files && e.target.files.length) manejarNuevosArchivos(e.target.files);
        e.target.value = "";
    });

    async function manejarNuevosArchivos(fileList) {
        for (const file of Array.from(fileList)) {
            const categoria = categoriaDe(file);
            const record = {
                id: uid(),
                name: file.name,
                size: file.size,
                categoria,
                dateAdded: Date.now(),
                blob: file,
                highlights: [],
                notes: []
            };
            await guardarRegistro(record);
        }
        await refrescarLista();
    }

    /* ----------------------------------------------------------------
       LISTA DE ARCHIVOS
       ---------------------------------------------------------------- */
    async function refrescarLista() {
        const registros = await listarRegistros();
        registros.sort((a, b) => b.dateAdded - a.dateAdded);

        $lista.innerHTML = "";
        $listaVacia.style.display = registros.length ? "none" : "block";

        registros.forEach((record) => {
            const li = document.createElement("li");
            li.className = "archivo-item" + (archivoActivo && archivoActivo.id === record.id ? " activo" : "");
            li.dataset.id = record.id;

            const tipoClase = record.categoria === "pdf" ? "tipo-pdf" : record.categoria === "imagen" ? "tipo-img" : "tipo-texto";

            li.innerHTML = `
                <div class="archivo-item__icono ${tipoClase}">
                    <span class="material-symbols-outlined">${iconoDe(record.categoria)}</span>
                </div>
                <div class="archivo-item__info">
                    <div class="archivo-item__nombre">${escapeHtml(record.name)}</div>
                    <div class="archivo-item__meta">${formatoTamano(record.size)}</div>
                </div>
                <span class="material-symbols-outlined archivo-item__borrar" title="Eliminar">close</span>
            `;

            li.addEventListener("click", (e) => {
                if (e.target.closest(".archivo-item__borrar")) return;
                abrirArchivo(record.id);
            });

            li.querySelector(".archivo-item__borrar").addEventListener("click", async (e) => {
                e.stopPropagation();
                await borrarRegistro(record.id);
                if (archivoActivo && archivoActivo.id === record.id) {
                    archivoActivo = null;
                    mostrarVisorVacio();
                }
                await refrescarLista();
            });

            $lista.appendChild(li);
        });
    }

    function mostrarVisorVacio() {
        $visorArea.innerHTML = "";
        $visorArea.appendChild($visorVacio);
        $visorVacio.style.display = "flex";
        $btnLimpiar.setAttribute("disabled", "disabled");
        $btnBorrarArchivo.setAttribute("disabled", "disabled");
    }

    /* ----------------------------------------------------------------
       ABRIR ARCHIVO EN EL VISOR
       ---------------------------------------------------------------- */
    async function abrirArchivo(id) {
        const registros = await listarRegistros();
        const record = registros.find((r) => r.id === id);
        if (!record) return;

        archivoActivo = record;
        await refrescarLista();

        $visorArea.innerHTML = "";
        $btnLimpiar.removeAttribute("disabled");
        $btnBorrarArchivo.removeAttribute("disabled");

        if (record.categoria === "pdf") {
            await renderizarPDF(record);
        } else if (record.categoria === "imagen") {
            await renderizarImagen(record);
        } else {
            await renderizarTexto(record);
        }

        aplicarHerramientaAPaginasVisibles();
    }

    /* ----------------------------------------------------------------
       CREAR WRAPPER DE PÁGINA (común a imagen / pdf / texto)
       ---------------------------------------------------------------- */
    function crearPaginaWrapper(page, record) {
        const wrapper = document.createElement("div");
        wrapper.className = "pagina-doc";
        wrapper.dataset.page = page;
        wrapper.style.width = "min(760px, 100%)";

        wrapper.addEventListener("click", (e) => {
            if (herramientaActual !== "note") return;
            if (e.target.closest(".nota-adhesiva")) return;
            const rect = wrapper.getBoundingClientRect();
            const x = ((e.clientX - rect.left) / rect.width) * 100;
            const y = ((e.clientY - rect.top) / rect.height) * 100;
            const nota = { id: uid(), page, x, y, color: colorActual, text: "" };
            record.notes.push(nota);
            guardarRegistro(record);
            crearNotaDOM(wrapper, nota, record);
        });

        return wrapper;
    }

    /* ----------------------------------------------------------------
       CAPA DE SUBRAYADO (canvas) — usada en PDF e imágenes
       ---------------------------------------------------------------- */
    function anadirCapaDibujo(wrapper, page, record, anchoRef, altoRef) {
        const canvas = document.createElement("canvas");
        canvas.className = "capa-dibujo";
        wrapper.appendChild(canvas);

        function ajustarTamano() {
            const rect = wrapper.getBoundingClientRect();
            canvas.width = rect.width;
            canvas.height = rect.height;
            redibujar();
        }

        const ctx = canvas.getContext("2d");

        function dibujarTrazo(trazo) {
            if (!trazo.points || trazo.points.length < 2) return;
            ctx.strokeStyle = COLOR_MAP[trazo.color] || COLOR_MAP.yellow;
            ctx.lineWidth = Math.max(14, canvas.width * 0.018);
            ctx.lineCap = "round";
            ctx.lineJoin = "round";
            ctx.beginPath();
            trazo.points.forEach(([x, y], i) => {
                const px = x * canvas.width;
                const py = y * canvas.height;
                if (i === 0) ctx.moveTo(px, py);
                else ctx.lineTo(px, py);
            });
            ctx.stroke();
        }

        function redibujar() {
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            record.highlights
                .filter((h) => h.page === page && h.points)
                .forEach(dibujarTrazo);
        }

        let dibujando = false;
        let trazoActual = null;

        function puntoRelativo(e) {
            const rect = canvas.getBoundingClientRect();
            return [(e.clientX - rect.left) / rect.width, (e.clientY - rect.top) / rect.height];
        }

        canvas.addEventListener("pointerdown", (e) => {
            if (herramientaActual !== "highlight") return;
            dibujando = true;
            trazoActual = { id: uid(), page, color: colorActual, points: [puntoRelativo(e)] };
            canvas.setPointerCapture(e.pointerId);
        });

        canvas.addEventListener("pointermove", (e) => {
            if (!dibujando || !trazoActual) return;
            trazoActual.points.push(puntoRelativo(e));
            redibujar();
            dibujarTrazo(trazoActual);
        });

        function terminarTrazo() {
            if (dibujando && trazoActual && trazoActual.points.length > 1) {
                record.highlights.push(trazoActual);
                guardarRegistro(record);
            }
            dibujando = false;
            trazoActual = null;
            redibujar();
        }

        canvas.addEventListener("pointerup", terminarTrazo);
        canvas.addEventListener("pointerleave", () => {
            if (dibujando) terminarTrazo();
        });

        // tamaño inicial (una vez cargado el contenido visual)
        requestAnimationFrame(ajustarTamano);
    }

    /* ----------------------------------------------------------------
       NOTAS ADHESIVAS
       ---------------------------------------------------------------- */
    function crearNotaDOM(wrapper, nota, record) {
        const div = document.createElement("div");
        div.className = "nota-adhesiva" + (nota.color !== "yellow" ? " color-" + nota.color : "");
        div.style.left = nota.x + "%";
        div.style.top = nota.y + "%";

        div.innerHTML = `
            <div class="nota-adhesiva__drag"></div>
            <div class="nota-adhesiva__header">
                <span class="material-symbols-outlined nota-adhesiva__cerrar">close</span>
            </div>
            <textarea placeholder="Escribe tu apunte...">${escapeHtml(nota.text || "")}</textarea>
        `;

        const textarea = div.querySelector("textarea");
        let guardarTimeout = null;
        textarea.addEventListener("input", () => {
            nota.text = textarea.value;
            clearTimeout(guardarTimeout);
            guardarTimeout = setTimeout(() => guardarRegistro(record), 400);
        });

        div.querySelector(".nota-adhesiva__cerrar").addEventListener("click", () => {
            record.notes = record.notes.filter((n) => n.id !== nota.id);
            guardarRegistro(record);
            div.remove();
        });

        // arrastrar la nota dentro de su página
        const dragHandle = div.querySelector(".nota-adhesiva__drag");
        dragHandle.addEventListener("pointerdown", (e) => {
            e.preventDefault();
            dragHandle.setPointerCapture(e.pointerId);
            const moverse = (ev) => {
                const rect = wrapper.getBoundingClientRect();
                const x = Math.min(96, Math.max(0, ((ev.clientX - rect.left) / rect.width) * 100));
                const y = Math.min(96, Math.max(0, ((ev.clientY - rect.top) / rect.height) * 100));
                div.style.left = x + "%";
                div.style.top = y + "%";
                nota.x = x;
                nota.y = y;
            };
            const soltar = () => {
                window.removeEventListener("pointermove", moverse);
                window.removeEventListener("pointerup", soltar);
                guardarRegistro(record);
            };
            window.addEventListener("pointermove", moverse);
            window.addEventListener("pointerup", soltar);
        });

        wrapper.appendChild(div);
    }

    function pintarNotasDePagina(wrapper, page, record) {
        record.notes.filter((n) => n.page === page).forEach((nota) => crearNotaDOM(wrapper, nota, record));
    }

    /* ----------------------------------------------------------------
       RENDER: IMAGEN
       ---------------------------------------------------------------- */
    async function renderizarImagen(record) {
        const url = URL.createObjectURL(record.blob);
        const wrapper = crearPaginaWrapper(1, record);

        const img = document.createElement("img");
        img.className = "contenido-img";
        img.src = url;
        wrapper.appendChild(img);

        $visorArea.appendChild(wrapper);

        img.addEventListener("load", () => {
            anadirCapaDibujo(wrapper, 1, record);
            pintarNotasDePagina(wrapper, 1, record);
        });
    }

    /* ----------------------------------------------------------------
       RENDER: TEXTO (.txt, .md)
       ---------------------------------------------------------------- */
    function renderTextoConHighlights(rawText, highlights) {
        if (!highlights.length) return escapeHtml(rawText);
        const ordenadas = [...highlights].filter((h) => typeof h.start === "number").sort((a, b) => a.start - b.start);
        let html = "";
        let cursor = 0;
        ordenadas.forEach((h) => {
            if (h.start < cursor) return; // evita solapes
            html += escapeHtml(rawText.slice(cursor, h.start));
            html += `<mark class="user-highlight hl-${h.color}">${escapeHtml(rawText.slice(h.start, h.end))}</mark>`;
            cursor = h.end;
        });
        html += escapeHtml(rawText.slice(cursor));
        return html;
    }

    function offsetDentroDe(root, node, offset) {
        const range = document.createRange();
        range.selectNodeContents(root);
        range.setEnd(node, offset);
        return range.toString().length;
    }

    async function renderizarTexto(record) {
        const texto = await record.blob.text();
        textoCrudoActivo = texto;

        const wrapper = crearPaginaWrapper(1, record);
        wrapper.style.width = "100%";

        const contenido = document.createElement("div");
        contenido.className = "contenido-texto";
        contenido.innerHTML = renderTextoConHighlights(texto, record.highlights);
        wrapper.appendChild(contenido);

        contenido.addEventListener("mouseup", () => {
            if (herramientaActual !== "highlight") return;
            const sel = window.getSelection();
            if (!sel || sel.isCollapsed || sel.rangeCount === 0) return;
            const range = sel.getRangeAt(0);
            if (!contenido.contains(range.commonAncestorContainer)) return;

            const start = offsetDentroDe(contenido, range.startContainer, range.startOffset);
            const end = offsetDentroDe(contenido, range.endContainer, range.endOffset);
            sel.removeAllRanges();
            if (end <= start) return;

            record.highlights.push({ id: uid(), page: 1, start, end, color: colorActual });
            contenido.innerHTML = renderTextoConHighlights(texto, record.highlights);
            guardarRegistro(record);
        });

        $visorArea.appendChild(wrapper);
        pintarNotasDePagina(wrapper, 1, record);
    }

    /* ----------------------------------------------------------------
       RENDER: PDF (pdf.js)
       ---------------------------------------------------------------- */
    async function renderizarPDF(record) {
        if (!window.pdfjsLib) {
            $visorArea.innerHTML = '<p style="color:rgba(230,241,255,0.5);padding:20px;">No se pudo cargar el visor de PDF.</p>';
            return;
        }

        const buffer = await record.blob.arrayBuffer();
        const pdf = await pdfjsLib.getDocument({ data: buffer }).promise;

        for (let num = 1; num <= pdf.numPages; num++) {
            const page = await pdf.getPage(num);
            const escala = 1.3;
            const viewport = page.getViewport({ scale: escala });

            const wrapper = crearPaginaWrapper(num, record);
            wrapper.style.width = viewport.width + "px";
            wrapper.style.maxWidth = "100%";

            const canvas = document.createElement("canvas");
            canvas.className = "contenido-pdf";
            canvas.width = viewport.width;
            canvas.height = viewport.height;
            wrapper.appendChild(canvas);

            $visorArea.appendChild(wrapper);

            const ctx = canvas.getContext("2d");
            await page.render({ canvasContext: ctx, viewport }).promise;

            anadirCapaDibujo(wrapper, num, record);
            pintarNotasDePagina(wrapper, num, record);
        }
    }

    /* ----------------------------------------------------------------
       BARRA DE HERRAMIENTAS
       ---------------------------------------------------------------- */
    document.querySelectorAll(".visor-tool[data-tool]").forEach((btn) => {
        btn.addEventListener("click", () => {
            herramientaActual = btn.dataset.tool;
            document.querySelectorAll(".visor-tool[data-tool]").forEach((b) => b.classList.toggle("activo", b === btn));
            aplicarHerramientaAPaginasVisibles();
        });
    });

    $colores.addEventListener("click", (e) => {
        const swatch = e.target.closest(".color-swatch");
        if (!swatch) return;
        colorActual = swatch.dataset.color;
        $colores.querySelectorAll(".color-swatch").forEach((s) => s.classList.toggle("activo", s === swatch));
    });

    function aplicarHerramientaAPaginasVisibles() {
        document.querySelectorAll(".pagina-doc").forEach((wrapper) => {
            wrapper.classList.toggle("modo-highlight", herramientaActual === "highlight");
            wrapper.classList.toggle("modo-nota", herramientaActual === "note");
        });
    }

    $btnLimpiar.addEventListener("click", async () => {
        if (!archivoActivo) return;
        if (!confirm("¿Borrar todos los subrayados y notas de este documento?")) return;
        archivoActivo.highlights = [];
        archivoActivo.notes = [];
        await guardarRegistro(archivoActivo);
        abrirArchivo(archivoActivo.id);
    });

    $btnBorrarArchivo.addEventListener("click", async () => {
        if (!archivoActivo) return;
        if (!confirm(`¿Eliminar "${archivoActivo.name}" del Espacio de Lectura?`)) return;
        await borrarRegistro(archivoActivo.id);
        archivoActivo = null;
        mostrarVisorVacio();
        await refrescarLista();
    });

    /* ----------------------------------------------------------------
       INICIO
       ---------------------------------------------------------------- */
    refrescarLista();
})();
