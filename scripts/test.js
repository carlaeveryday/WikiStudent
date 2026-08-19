// ============================================================
//  WIKISTUDENT — test.js
//  Tests: rama (15q) · grado-rapido (8q) · grado-detallado (20q)
//  + TEST ESPECIALISTA POR RAMA (40q) — cargado desde JSON
// ============================================================

// ── ESTADO GLOBAL ──────────────────────────────────────────
let indiceActual   = 0;
let testActual     = null;   // 'rama' | 'grado-rapido' | 'grado-detallado' | 'especialista'
let puntuacion     = {};
let preguntasEspecialistaActuales = [];  // 40 preguntas de la rama elegida

// ── CLAVES Y NOMBRES ───────────────────────────────────────
const NOMBRES_RAMA = {
    ING:  "Ing. y Arquitectura",
    SLD:  "Ciencias de la Salud",
    CIEN: "Ciencias y Naturaleza",
    SOC:  "CC. Sociales y Jurídicas",
    ART:  "Artes y Humanidades"
};

const COLORES_RAMA = {
    ING:  "#00d2ff",
    SLD:  "#ff6b2b",
    CIEN: "#a8ff78",
    SOC:  "#f7971e",
    ART:  "#c471ed"
};

const NOMBRES_GRADO = {
    salud:        "Ciencias de la Salud",
    tecnologia:   "Tecnología e Ingeniería",
    juridicas:    "Ciencias Jurídicas",
    arte:         "Arte y Diseño",
    ciencias:     "Ciencias Puras",
    educacion:    "Educación",
    deporte:      "Deporte y Salud",
    comunicacion: "Comunicación y Turismo",
    sociales:     "Ciencias Sociales"
};

const COLORES_GRADO = {
    salud:        "#ff6b2b",
    tecnologia:   "#00d2ff",
    juridicas:    "#f7971e",
    arte:         "#c471ed",
    ciencias:     "#a8ff78",
    educacion:    "#ffdd57",
    deporte:      "#43e97b",
    comunicacion: "#f093fb",
    sociales:     "#4facfe"
};

// ── COLORES SUBCATEGORÍAS ESPECIALISTA ────────────────────
const COLORES_ESPECIALISTA = {
    // Ingeniería
    INFORMATICA:        "#00d2ff",
    MECANICA:           "#f7971e",
    ELECTRONICA:        "#a8ff78",
    CIVIL:              "#4facfe",
    ARQUITECTURA:       "#c471ed",
    QUIMICA:            "#43e97b",
    ENERGIA:            "#ffdd57",
    AERO:               "#ff6b2b",
    AGRARIA:            "#96f2a4",
    NAVAL:              "#0084b4",
    TELECOMUNICACIONES: "#f093fb",
    ROBOTICA:           "#ff4d6d",
    DISENO_INDUSTRIAL:  "#7ee8fa",
    BIOMEDICA:          "#ff9a9e",
    MATERIALES:         "#c9a86a",
    EDIFICACION:        "#89f7fe",
    FORESTAL:           "#2d9d5f",
    RECURSOS_MINEROS:   "#8d6748",
    SONIDO_IMAGEN:      "#fbc2eb",
    // Ciencias Puras
    MATEMATICAS:        "#00d2ff",
    FISICA:             "#f7971e",
    BIOLOGIA:           "#a8ff78",
    BIOQUIMICA:         "#4facfe",
    BIOTECNOLOGIA:      "#c471ed",
    CIENCIAS_MAR:       "#43e97b",
    GEOLOGIA:           "#ffdd57",
    CIENCIAS_AMB:       "#ff6b2b",
    CIENCIA_DATOS:      "#f093fb",
    BIOMEDICAS:         "#96f2a4",
    // Salud
    MEDICINA:           "#ff6b2b",
    ENFERMERIA:         "#f093fb",
    FARMACIA:           "#43e97b",
    FISIOTERAPIA:       "#00d2ff",
    PSICOLOGIA:         "#c471ed",
    ODONTOLOGIA:        "#f7971e",
    NUTRICION:          "#a8ff78",
    VETERINARIA:        "#4facfe",
    OPTICA:             "#ffdd57",
    CAFYD:              "#96f2a4",
    // Sociales
    DERECHO:            "#f7971e",
    ADE:                "#00d2ff",
    ECONOMIA:           "#a8ff78",
    MARKETING:          "#f093fb",
    RRLL_RRHH:          "#43e97b",
    CIENCIA_POLITICA:   "#c471ed",
    COMUNICACION:       "#ffdd57",
    TURISMO:            "#ff6b2b",
    EDUCACION:          "#4facfe",
    SOCIOLOGIA:         "#96f2a4",
    CRIMINOLOGIA:       "#0084b4",
    FINANZAS:           "#ffb347",
    // Arte y Humanidades
    BELLAS_ARTES:       "#c471ed",
    DISENO:             "#00d2ff",
    VIDEOJUEGOS:        "#43e97b",
    HISTORIA:           "#f7971e",
    HISTORIA_ARTE:      "#f093fb",
    FILOSOFIA:          "#a8ff78",
    FILOLOGIA:          "#ffdd57",
    LENGUAS:            "#4facfe",
    TRADUCCION:         "#ff6b2b",
    MUSICA:             "#96f2a4",
    ARTES_ESCENICAS:    "#ffb347"
};

// Nombres legibles de subcategorías especialista
const NOMBRES_ESPECIALISTA = {
    INFORMATICA:        "Informática / IA",
    MECANICA:           "Mecánica / Automoción",
    ELECTRONICA:        "Electrónica / Robótica",
    CIVIL:              "Ing. Civil / Obras Públicas",
    ARQUITECTURA:       "Arquitectura",
    QUIMICA:            "Ing. Química / Materiales",
    ENERGIA:            "Energías Renovables",
    AERO:               "Ing. Aeroespacial",
    AGRARIA:            "Ing. Agraria / Forestal",
    NAVAL:              "Ing. Naval / Tecnologías Marinas",
    TELECOMUNICACIONES: "Telecomunicaciones",
    ROBOTICA:           "Robótica",
    DISENO_INDUSTRIAL:  "Diseño Industrial",
    BIOMEDICA:          "Ing. Biomédica",
    MATERIALES:         "Ing. de Materiales",
    EDIFICACION:        "Ing. de Edificación",
    FORESTAL:           "Ing. Forestal",
    RECURSOS_MINEROS:   "Ing. de Recursos Mineros",
    SONIDO_IMAGEN:      "Ing. de Sonido e Imagen",
    MATEMATICAS:        "Matemáticas / Estadística",
    FISICA:             "Física",
    BIOLOGIA:           "Biología / Genética",
    BIOQUIMICA:         "Bioquímica",
    BIOTECNOLOGIA:      "Biotecnología / Bioinformática",
    CIENCIAS_MAR:       "Ciencias del Mar",
    GEOLOGIA:           "Geología",
    CIENCIAS_AMB:       "Ciencias Ambientales",
    CIENCIA_DATOS:      "Ciencia de Datos",
    BIOMEDICAS:         "Ciencias Biomédicas / Neurociencia",
    MEDICINA:           "Medicina",
    ENFERMERIA:         "Enfermería",
    FARMACIA:           "Farmacia",
    FISIOTERAPIA:       "Fisioterapia / Terapia Ocupacional",
    PSICOLOGIA:         "Psicología / Logopedia",
    ODONTOLOGIA:        "Odontología",
    NUTRICION:          "Nutrición y Dietética",
    VETERINARIA:        "Veterinaria",
    OPTICA:             "Óptica y Optometría",
    CAFYD:              "CAFYD / Deporte",
    DERECHO:            "Derecho / Criminología",
    ADE:                "ADE / Gestión de Empresas",
    ECONOMIA:           "Economía",
    MARKETING:          "Marketing / Publicidad",
    RRLL_RRHH:          "RRHH / Trabajo Social",
    CIENCIA_POLITICA:   "Ciencia Política / RRII",
    COMUNICACION:       "Periodismo / Comunicación",
    TURISMO:            "Turismo / Hostelería",
    EDUCACION:          "Educación / Pedagogía",
    SOCIOLOGIA:         "Sociología",
    CRIMINOLOGIA:       "Criminología",
    FINANZAS:           "Finanzas / Contabilidad",
    BELLAS_ARTES:       "Bellas Artes",
    DISENO:             "Diseño",
    VIDEOJUEGOS:        "Diseño de Videojuegos",
    HISTORIA:           "Historia / Arqueología",
    HISTORIA_ARTE:      "Historia del Arte / Patrimonio",
    FILOSOFIA:          "Filosofía / Humanidades",
    FILOLOGIA:          "Filología / Literatura",
    LENGUAS:            "Lenguas Modernas",
    TRADUCCION:         "Traducción e Interpretación",
    MUSICA:             "Musicología",
    ARTES_ESCENICAS:    "Artes Escénicas / Gestión Cultural"
};

// ── DESCRIPCIONES ──────────────────────────────────────────
const datosRama = {
    ING:  { descripcion: "Tienes mentalidad constructora. Disfrutas diseñando sistemas, resolviendo retos técnicos y haciendo que las cosas funcionen. Bachillerato de Ciencias (Tecnología) es tu camino natural." },
    SLD:  { descripcion: "Combinas curiosidad científica con vocación de cuidar. El cuerpo humano y la salud te apasionan. Bachillerato de Ciencias (Biosanitario) encaja perfecto contigo." },
    CIEN: { descripcion: "Eres observador, analítico y te pregunta el por qué de todo. La naturaleza, la física o la química son tu terreno. Bachillerato de Ciencias te abre todas las puertas." },
    SOC:  { descripcion: "Piensas en colectivo: la justicia, la sociedad y el bienestar te mueven. Bachillerato de Humanidades y Ciencias Sociales es donde brillarás." },
    ART:  { descripcion: "Ves el mundo de forma única. La expresión, la cultura y las ideas son tu combustible. Bachillerato de Artes o Humanidades es tu espacio natural." }
};

const datosGrado = {
    salud:        { descripcion: "Vocación de cuidar combinada con rigor científico. Enorme impacto humano y alta valoración social." },
    tecnologia:   { descripcion: "Mentes que construyen el futuro. Alta demanda laboral en cualquier sector." },
    juridicas:    { descripcion: "Analítico y persuasivo. Combina argumentación, estrategia y defensa de derechos." },
    arte:         { descripcion: "La creación y la cultura son tu motor. Amplio abanico de salidas en industrias creativas." },
    ciencias:     { descripcion: "Mente matemática orientada a descubrir cómo funciona el universo. Clave para la innovación." },
    educacion:    { descripcion: "Tu vocación es enseñar y transformar personas. Impacto directo en la sociedad desde el primer día." },
    deporte:      { descripcion: "Pasión por el movimiento, la salud y el rendimiento. Sector en auge con salidas en deporte y salud." },
    comunicacion: { descripcion: "Social, creativo y con visión global. Te mueves bien entre culturas y entornos dinámicos." },
    sociales:     { descripcion: "Curioso por la sociedad y el comportamiento humano. Salidas en investigación, política y ONG." }
};

// ── RUTAS JSON — PREGUNTAS ESPECIALISTA (40q por rama) ────
// Ajusta las rutas según tu estructura de carpetas
const JSON_RAMA = {
    ING:  [
        '/data/tests/test_ingenieria_bloque1.json'
        // Añade aquí bloque2/3/4 cuando estén listos (40 preguntas en total)
    ],
    CIEN: [
        '/data/tests/test_ciencias_bloque1.json',
        '/data/tests/test_ciencias_bloque2.json',
        '/data/tests/test_ciencias_bloque3.json',
        '/data/tests/test_ciencias_bloque4.json'
    ],
    SLD:  [
        '/data/tests/test_salud_bloque1.json',
        '/data/tests/test_salud_bloque2.json',
        '/data/tests/test_salud_bloque3.json',
        '/data/tests/test_salud_bloque4.json'
    ],
    SOC:  [
        '/data/tests/test_sociales_bloque1.json',
        '/data/tests/test_sociales_bloque2.json',
        '/data/tests/test_sociales_bloque3.json',
        '/data/tests/test_sociales_bloque4.json'
    ],
    ART:  [
        '/data/tests/test_arte_bloque1.json',
        '/data/tests/test_arte_bloque2.json',
        '/data/tests/test_arte_bloque3.json',
        '/data/tests/test_arte_bloque4.json'
    ]
};

// ── ESTADO PANTALLA DE BIENVENIDA ─────────────────────────
let cardSeleccionada = null;  // 'a' | 'b'
let ramaSeleccionada = null;  // 'ING' | 'SLD' | 'CIEN' | 'SOC' | 'ART'

function selectCard(card) {
    cardSeleccionada = card;
    ramaSeleccionada = null;

    ['a', 'b'].forEach(c => {
        const el      = document.getElementById('card-' + c);
        const iconEl  = document.getElementById('check-icon-' + c);
        const isThis  = (c === card);
        el.classList.toggle('selected', isThis);
        if (iconEl) iconEl.style.opacity = isThis ? '1' : '0';
    });

    document.querySelectorAll('.rama-btn').forEach(b => b.classList.remove('active'));

    const expandEl = document.getElementById('expand-rama');
    expandEl.classList.toggle('open', card === 'a');

    const ctaZone    = document.getElementById('cta-zone');
    const ctaRama    = document.getElementById('cta-rama');
    const ctaCarrera = document.getElementById('cta-carrera');
    const ramaTag    = document.getElementById('cta-rama-tag');

    if (card === 'b') {
        ctaRama.style.display    = 'flex';
        ctaCarrera.style.display = 'none';
        if (ramaTag) ramaTag.style.display = 'none';
        ctaZone.classList.add('open');
    } else {
        ctaRama.style.display    = 'none';
        ctaCarrera.style.display = 'none';
        ctaZone.classList.remove('open');
    }
}

function selectRama(codigo, nombre) {
    ramaSeleccionada = codigo;

    document.querySelectorAll('.rama-btn').forEach(b => {
        b.classList.toggle('active', b.id === 'rama-' + codigo);
    });

    const ctaZone    = document.getElementById('cta-zone');
    const ctaCarrera = document.getElementById('cta-carrera');
    const ramaTag    = document.getElementById('cta-rama-tag');
    const sub        = document.getElementById('cta-carrera-sub');

    if (ramaTag) {
        ramaTag.textContent   = nombre;
        ramaTag.style.display = 'inline-flex';
    }
    // ← AQUÍ se actualizan el nº de preguntas y el texto correcto
    if (sub) sub.textContent = '12 preguntas · ~3 min · 99% accuracy';

    ctaCarrera.style.display = 'flex';
    ctaZone.classList.add('open');

    setTimeout(() => {
        ctaCarrera.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }, 350);
}

// ── CARGAR JSONs DE ESPECIALISTA Y ARRANCAR TEST ──────────
async function startTestEspecialista() {
    if (!ramaSeleccionada) return;

    // Mostrar spinner de carga si existe
    const spinner = document.getElementById('spinner-carga');
    if (spinner) spinner.style.display = 'flex';

    try {
        const rutas = JSON_RAMA[ramaSeleccionada];
        const bloques = await Promise.all(rutas.map(r => fetch(r).then(res => res.json())));

        // Aplanar las 40 preguntas de los 4 bloques en un array unificado
        preguntasEspecialistaActuales = bloques.flatMap(bloque =>
            bloque.preguntas.map(p => ({
                id:      p.id,
                // normalizar campo texto de pregunta
                pregunta: p.enunciado || p.pregunta || p.titulo || '',
                opciones: p.opciones.map(o => ({
                    texto: o.texto,
                    pesos: o.scores || o.pesos || {}
                }))
            }))
        );

        if (spinner) spinner.style.display = 'none';
        startTest('especialista');

    } catch (err) {
        if (spinner) spinner.style.display = 'none';
        console.error('Error cargando preguntas especialista:', err);
        alert('No se pudieron cargar las preguntas. Comprueba la consola.');
    }
}

// ── ABRIR / CERRAR OVERLAY ─────────────────────────────────
function startTest(tipo) {
    testActual   = tipo;
    indiceActual = 0;
    puntuacion   = {};

    document.getElementById('overlay').classList.add('active');
    document.getElementById('screenTest').classList.add('active');
    document.getElementById('screenResultados').classList.remove('active');

    mostrarPregunta();
}

function cerrarOverlay() {
    document.getElementById('overlay').classList.remove('active');
    document.getElementById('screenTest').classList.remove('active');
    document.getElementById('screenResultados').classList.remove('active');
    indiceActual = 0;
    puntuacion   = {};
    testActual   = null;
    preguntasEspecialistaActuales = [];
}

function cerrarTest() { cerrarOverlay(); }

// ── MOSTRAR PREGUNTA ───────────────────────────────────────
function preguntasActuales() {
    if (testActual === 'rama')             return preguntasRama;
    if (testActual === 'grado-rapido')     return preguntasGradoRapido;
    if (testActual === 'grado-detallado')  return preguntasGradoDetallado;
    if (testActual === 'especialista')     return preguntasEspecialistaActuales;
    return [];
}

function mostrarPregunta() {
    const lista    = preguntasActuales();
    const pregunta = lista[indiceActual];
    const total    = lista.length;

    // Barra de progreso
    const pct     = Math.round((indiceActual / total) * 100);
    const barraEl = document.getElementById('barra-progreso');
    if (barraEl) barraEl.style.width = pct + '%';

    document.getElementById('num-pregunta').innerText =
        `Pregunta ${indiceActual + 1} de ${total}`;
    document.getElementById('pregunta-texto').innerText =
        pregunta.pregunta || pregunta.titulo || pregunta.enunciado || '';

    const contenedor = document.getElementById('contenedor-opciones');
    contenedor.innerHTML = '';
    const letras = ['A', 'B', 'C', 'D'];

    pregunta.opciones.forEach((opcion, i) => {
        const btn = document.createElement('button');
        btn.classList.add('boton-opcion');
        btn.innerHTML = `<span class="letra">${letras[i]}</span><span class="opcion-texto">${opcion.texto}</span>`;

        btn.onclick = () => {
            const pesos = opcion.pesos || opcion.scores || {};
            for (const clave in pesos) {
                puntuacion[clave] = (puntuacion[clave] || 0) + pesos[clave];
            }
            indiceActual++;
            if (indiceActual < lista.length) {
                mostrarPregunta();
            } else {
                mostrarResultado();
            }
        };
        contenedor.appendChild(btn);
    });
}

// ── MOSTRAR RESULTADO ──────────────────────────────────────
function mostrarResultado() {
    document.getElementById('screenTest').classList.remove('active');
    document.getElementById('screenResultados').classList.add('active');

    const esRama        = testActual === 'rama';
    const esEspecialista = testActual === 'especialista';

    let nombres, colores, datos;
    if (esRama) {
        nombres = NOMBRES_RAMA;
        colores = COLORES_RAMA;
        datos   = datosRama;
    } else if (esEspecialista) {
        nombres = NOMBRES_ESPECIALISTA;
        colores = COLORES_ESPECIALISTA;
        datos   = {};  // sin descripción predefinida; se genera dinámica abajo
    } else {
        nombres = NOMBRES_GRADO;
        colores = COLORES_GRADO;
        datos   = datosGrado;
    }

    const total = Object.values(puntuacion).reduce((a, b) => a + b, 0) || 1;

    // Ordenar por puntuación descendente
    const sorted = Object.entries(puntuacion).sort((a, b) => b[1] - a[1]);

    const ganadoraClave  = sorted[0][0];
    const ganadoraNombre = nombres[ganadoraClave] || ganadoraClave;

    // ── Título y descripción ───────────────────────────────
    if (esEspecialista) {
        // TOP 3 de subcategorías
        const top3 = sorted.slice(0, 3);
        document.getElementById('resultado-titulo').innerText =
            '🎯 Tu carrera ideal: ' + (nombres[top3[0][0]] || top3[0][0]);

        const lineas = top3.map(([ clave ], idx) => {
            const medalla = ['🥇', '🥈', '🥉'][idx];
            return `${medalla} ${nombres[clave] || clave}`;
        }).join('\n');
        document.getElementById('resultado-descripcion').innerText =
            'Tu Top 3 de áreas según tus respuestas:\n\n' + lineas +
            '\n\nConsulta el mapa de grados para explorar carreras exactas en cada área.';
    } else {
        document.getElementById('resultado-titulo').innerText =
            (esRama ? 'Tu rama: ' : 'Tu perfil: ') + ganadoraNombre;
        document.getElementById('resultado-descripcion').innerText =
            (datos[ganadoraClave] && datos[ganadoraClave].descripcion) || '';
    }

    // ── GRÁFICO DE PASTEL ──────────────────────────────────
    const canvas = document.getElementById('grafico-pastel');
    const ctx    = canvas.getContext('2d');
    const cx     = canvas.width  / 2;
    const cy     = canvas.height / 2;
    const radio  = Math.min(cx, cy) - 10;

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Para especialista mostramos solo Top 5 en el gráfico para no saturar
    const segmentos = esEspecialista
        ? sorted.filter(([, v]) => v > 0).slice(0, 5)
        : sorted.filter(([, v]) => v > 0);

    let angulo = -Math.PI / 2;

    segmentos.forEach(([clave, puntos]) => {
        const porcentaje = puntos / total;
        const fin = angulo + porcentaje * 2 * Math.PI;
        const color = colores[clave] || '#aaa';

        ctx.beginPath();
        ctx.moveTo(cx, cy);
        ctx.arc(cx, cy, radio, angulo, fin);
        ctx.closePath();
        ctx.fillStyle = color;
        ctx.fill();
        ctx.strokeStyle = '#0a192f';
        ctx.lineWidth = 3;
        ctx.stroke();

        angulo = fin;
    });

    // Círculo interior (donut)
    ctx.beginPath();
    ctx.arc(cx, cy, radio * 0.52, 0, 2 * Math.PI);
    ctx.fillStyle = '#0a192f';
    ctx.fill();

    // Texto central
    const pctGanadora = Math.round((puntuacion[ganadoraClave] / total) * 100);
    ctx.fillStyle     = colores[ganadoraClave] || '#fff';
    ctx.font          = `bold ${Math.floor(radio * 0.28)}px Montserrat, sans-serif`;
    ctx.textAlign     = 'center';
    ctx.textBaseline  = 'middle';
    ctx.fillText(pctGanadora + '%', cx, cy);

    // ── LEYENDA ────────────────────────────────────────────
    const leyenda = document.getElementById('leyenda-pastel');
    leyenda.innerHTML = '';

    segmentos.forEach(([clave, puntos]) => {
        const pct    = Math.round((puntos / total) * 100);
        const color  = colores[clave] || '#aaa';
        const nombre = nombres[clave] || clave;

        leyenda.innerHTML += `
          <div class="leyenda-fila">
            <span class="leyenda-dot" style="background:${color}"></span>
            <span class="leyenda-nombre">${nombre}</span>
            <span class="leyenda-pct" style="color:${color}">${pct}%</span>
          </div>`;
    });
}

// ============================================================
//  PREGUNTAS TEST 1 — RAMA ACADÉMICA (15 preguntas)
// ============================================================
const preguntasRama = [
  {
    "id": "rama_01",
    "pregunta": "Van a remodelar un parque abandonado en tu barrio. ¿Qué prefieres hacer?",
    "opciones": [
      { "texto": "Diseñar los planos, luces solares y sistemas de riego.", "pesos": { "ING": 3, "CIEN": 1 } },
      { "texto": "Investigar qué plantas ayudarán más a la fauna local.", "pesos": { "CIEN": 3, "SLD": 1 } },
      { "texto": "Hacer encuestas a los vecinos y gestionar las licencias.", "pesos": { "SOC": 3, "ART": 1 } },
      { "texto": "Diseñar el logo, los murales y el estilo artístico.", "pesos": { "ART": 3, "SOC": 1 } }
    ]
  },
  {
    "id": "rama_02",
    "pregunta": "Un amigo lleva semanas muy cansado y con mareos. ¿Qué haces?",
    "opciones": [
      { "texto": "Le recomiendas una app de salud y analizas sus datos.", "pesos": { "ING": 2, "SLD": 2 } },
      { "texto": "Buscas si es por falta de vitaminas o un problema hormonal.", "pesos": { "SLD": 3, "CIEN": 1 } },
      { "texto": "Le acompañas al médico para apoyarle emocionalmente.", "pesos": { "SLD": 2, "SOC": 2 } },
      { "texto": "Hablas con él por si es un tema de estrés o agobio.", "pesos": { "SOC": 3, "ART": 1 } }
    ]
  },
  {
    "id": "rama_03",
    "pregunta": "Tienes que hacer un trabajo libre para clase. ¿Qué tema eliges?",
    "opciones": [
      { "texto": "Crear un robot o una app para resolver un problema diario.", "pesos": { "ING": 3, "CIEN": 1 } },
      { "texto": "Investigar el impacto del cambio climático en el mar.", "pesos": { "CIEN": 3, "SOC": 1 } },
      { "texto": "Grabar un podcast sobre una injusticia o cultura local.", "pesos": { "ART": 2, "SOC": 2 } },
      { "texto": "Analizar cómo influyen las redes en lo que compran los jóvenes.", "pesos": { "SOC": 3, "ING": 1 } }
    ]
  },
  {
    "id": "rama_04",
    "pregunta": "En una serie un personaje enferma gravemente. ¿Qué te interesa más?",
    "opciones": [
      { "texto": "Los robots, escáneres e IA que usan para curarle.", "pesos": { "ING": 3, "SLD": 1 } },
      { "texto": "Cómo descubren la enfermedad analizando sus síntomas.", "pesos": { "SLD": 3, "CIEN": 1 } },
      { "texto": "El drama familiar y cómo le trata el hospital.", "pesos": { "SOC": 2, "ART": 2 } },
      { "texto": "La ciencia detrás del virus o célula que causa el problema.", "pesos": { "CIEN": 3, "SLD": 1 } }
    ]
  },
  {
    "id": "rama_05",
    "pregunta": "Te dan presupuesto para organizar un festival en tu instituto. ¿De qué te encargas?",
    "opciones": [
      { "texto": "Montar el escenario, el sonido, las luces y la red Wi-Fi.", "pesos": { "ING": 3, "CIEN": 1 } },
      { "texto": "Diseñar el menú saludable, el reciclaje y el puesto de primeros auxilios.", "pesos": { "SLD": 2, "CIEN": 2 } },
      { "texto": "Controlar las actuaciones, la música, los carteles y la decoración.", "pesos": { "ART": 3, "ING": 1 } },
      { "texto": "Gestionar el dinero de las entradas, los permisos y las normas del evento.", "pesos": { "SOC": 3, "ING": 1 } }
    ]
  },
  {
    "id": "rama_06",
    "pregunta": "Pasas una semana trabajando con un profesional. ¿A quién eliges?",
    "opciones": [
      { "texto": "Un ingeniero que diseña satélites espaciales.", "pesos": { "ING": 3, "CIEN": 1 } },
      { "texto": "Un científico que investiga la cura del Alzheimer.", "pesos": { "SLD": 2, "CIEN": 2 } },
      { "texto": "Un abogado defensor de los derechos humanos.", "pesos": { "SOC": 3, "ART": 1 } },
      { "texto": "Un director de cine o un escritor famoso.", "pesos": { "ART": 3, "SOC": 1 } }
    ]
  },
  {
    "id": "rama_07",
    "pregunta": "El agua va a escasear en tu región en 20 años. ¿Cómo ayudas?",
    "opciones": [
      { "texto": "Creando sistemas de desalinización y tuberías inteligentes.", "pesos": { "ING": 3, "CIEN": 1 } },
      { "texto": "Estudiando cómo el agua sucia afecta a la salud humana.", "pesos": { "SLD": 2, "CIEN": 2 } },
      { "texto": "Analizando de dónde viene el agua subterránea con la ciencia.", "pesos": { "CIEN": 3, "ING": 1 } },
      { "texto": "Creando campañas de ahorro y exigiendo nuevas leyes.", "pesos": { "SOC": 3, "ART": 1 } }
    ]
  },
  {
    "id": "rama_08",
    "pregunta": "Puedes inventar una asignatura nueva para tu instituto. ¿Cuál eliges?",
    "opciones": [
      { "texto": "Programación y desarrollo técnico de videojuegos.", "pesos": { "ING": 3, "ART": 1 } },
      { "texto": "ADN y medicina del futuro para curar enfermedades.", "pesos": { "CIEN": 2, "SLD": 2 } },
      { "texto": "Debates sobre leyes, privacidad e inteligencia artificial.", "pesos": { "SOC": 2, "ART": 2 } },
      { "texto": "Creación de historias para redes, podcasts y series.", "pesos": { "ART": 3, "SOC": 1 } }
    ]
  },
  {
    "id": "rama_09",
    "pregunta": "Participas en un concurso tecnológico de 24 horas. ¿Cuál es tu rol?",
    "opciones": [
      { "texto": "Escribir el código y montar la estructura del programa.", "pesos": { "ING": 3, "CIEN": 1 } },
      { "texto": "Buscar datos científicos que demuestren que la idea funciona.", "pesos": { "CIEN": 3, "SLD": 1 } },
      { "texto": "Explicar el proyecto a los jueces y defender la idea social.", "pesos": { "SOC": 3, "ART": 1 } },
      { "texto": "Diseñar las pantallas, los colores y cómo se ve la app.", "pesos": { "ART": 3, "ING": 1 } }
    ]
  },
  {
    "id": "rama_10",
    "pregunta": "Elige un podcast para escuchar en un viaje largo:",
    "opciones": [
      { "texto": "Cómo funcionan internet, los satélites y las redes eléctricas.", "pesos": { "ING": 3, "CIEN": 1 } },
      { "texto": "Nuevos descubrimientos médicos, trasplantes y vacunas.", "pesos": { "SLD": 3, "CIEN": 1 } },
      { "texto": "Psicología, mente humana y por qué tomamos decisiones.", "pesos": { "SOC": 2, "ART": 2 } },
      { "texto": "Historia, cultura y cómo el arte refleja las crisis mundiales.", "pesos": { "ART": 3, "SOC": 1 } }
    ]
  },
  {
    "id": "rama_11",
    "pregunta": "Vas a abrir un canal de TikTok o YouTube que se vuelva viral. ¿De qué trataría?",
    "opciones": [
      { "texto": "Análisis de gadgets, IA, consolas e inventos tecnológicos.", "pesos": { "ING": 2, "CIEN": 2 } },
      { "texto": "Consejos de psicología, salud física, nutrición y bienestar.", "pesos": { "SLD": 3, "ING": 1 } },
      { "texto": "Debates de actualidad, economía, política y problemas del mundo.", "pesos": { "SOC": 3, "ING": 1 } },
      { "texto": "Reviews de cine, tendencias de moda, música o tutoriales de dibujo.", "pesos": { "ART": 3, "ING": 1 } }
    ]
  },
  {
    "id": "rama_12",
    "pregunta": "Estás jugando a un videojuego de estrategia y supervivencia. ¿En qué te centras?",
    "opciones": [
      { "texto": "Construir la base perfecta, optimizar recursos y meter defensas automáticas.", "pesos": { "ING": 3, "CIEN": 1 } },
      { "texto": "Investigar nuevas tecnologías en el laboratorio y buscar curas.", "pesos": { "CIEN": 2, "SLD": 2 } },
      { "texto": "Negociar alianzas con otros clanes y crear las leyes de tu ciudad.", "pesos": { "SOC": 3, "ART": 1 } },
      { "texto": "Personalizar el diseño de los personajes, los edificios y la estética.", "pesos": { "ART": 3, "SOC": 1 } }
    ]
  },
  {
    "id": "rama_13",
    "pregunta": "Vas a escribir un artículo para el periódico del instituto. ¿Tema?",
    "opciones": [
      { "texto": "Por qué todos los niños deberían aprender a programar.", "pesos": { "ING": 3, "SOC": 1 } },
      { "texto": "Los riesgos de tomar pastillas sin receta médica.", "pesos": { "SLD": 2, "CIEN": 2 } },
      { "texto": "Cómo los políticos y ayuntamientos ignoran a los jóvenes.", "pesos": { "SOC": 3, "ART": 1 } },
      { "texto": "Por qué el arte y la filosofía son vitales para el mundo.", "pesos": { "ART": 3, "SOC": 1 } }
    ]
  },
  {
    "id": "rama_14",
    "pregunta": "Tienes dinero para financiar una investigación. ¿A cuál se lo das?",
    "opciones": [
      { "texto": "Crear baterías que duren el triple para coches eléctricos.", "pesos": { "ING": 3, "CIEN": 1 } },
      { "texto": "Modificar el ADN para curar enfermedades raras en niños.", "pesos": { "SLD": 3, "CIEN": 1 } },
      { "texto": "Analizar cómo la falta de dinero afecta a las notas escolares.", "pesos": { "SOC": 3, "CIEN": 1 } },
      { "texto": "Salvar idiomas antiguos en peligro de desaparecer.", "pesos": { "ART": 3, "SOC": 1 } }
    ]
  },
  {
    "id": "rama_15",
    "pregunta": "En el futuro, ¿qué te gustaría que dijeran tus compañeros de trabajo?",
    "opciones": [
      { "texto": "Siempre encontraba el truco técnico para que todo funcionara.", "pesos": { "ING": 3, "CIEN": 1 } },
      { "texto": "Sabía muchísimo sobre el cuerpo humano y cuidaba de todos.", "pesos": { "SLD": 3, "CIEN": 1 } },
      { "texto": "Buscaba siempre la justicia y sabía escuchar a la gente.", "pesos": { "SOC": 3, "ART": 1 } },
      { "texto": "Hacía cosas creativas que cambiaban la forma de ver el mundo.", "pesos": { "ART": 3, "SOC": 1 } }
    ]
  }
];

// ============================================================
//  PREGUNTAS TEST 2 — GRADO RÁPIDO (8 preguntas)
// ============================================================
const preguntasGradoRapido = [
  {
    "id": "gr_01",
    "pregunta": "¿Qué actividad te daría más satisfacción en tu día a día?",
    "opciones": [
      { "texto": "Atender pacientes y mejorar su salud.", "pesos": { "salud": 3, "educacion": 1 } },
      { "texto": "Programar o diseñar sistemas digitales.", "pesos": { "tecnologia": 3, "ciencias": 1 } },
      { "texto": "Defender a alguien o redactar leyes.", "pesos": { "juridicas": 3, "sociales": 1 } },
      { "texto": "Crear arte, diseño o contenido visual.", "pesos": { "arte": 3, "comunicacion": 1 } }
    ]
  },
  {
    "id": "gr_02",
    "pregunta": "¿En qué tipo de entorno te imaginas trabajando?",
    "opciones": [
      { "texto": "Hospital, clínica o laboratorio.", "pesos": { "salud": 3, "ciencias": 1 } },
      { "texto": "Empresa tecnológica o startup.", "pesos": { "tecnologia": 3, "juridicas": 1 } },
      { "texto": "Aula, ONG o administración pública.", "pesos": { "educacion": 3, "sociales": 1 } },
      { "texto": "Estudio creativo, hotel o medios de comunicación.", "pesos": { "arte": 2, "comunicacion": 2 } }
    ]
  },
  {
    "id": "gr_03",
    "pregunta": "¿Qué tipo de impacto quieres tener en la sociedad?",
    "opciones": [
      { "texto": "Salvar vidas o mejorar la salud pública.", "pesos": { "salud": 3, "ciencias": 1 } },
      { "texto": "Construir la infraestructura del futuro.", "pesos": { "tecnologia": 3, "ciencias": 1 } },
      { "texto": "Defender la justicia y los derechos humanos.", "pesos": { "juridicas": 3, "sociales": 1 } },
      { "texto": "Educar, inspirar o transformar personas.", "pesos": { "educacion": 3, "sociales": 1 } }
    ]
  },
  {
    "id": "gr_04",
    "pregunta": "¿Con cuál de estas materias disfrutas más?",
    "opciones": [
      { "texto": "Biología, Química o Anatomía.", "pesos": { "salud": 3, "ciencias": 2 } },
      { "texto": "Matemáticas, Física o Estadística.", "pesos": { "ciencias": 3, "tecnologia": 2 } },
      { "texto": "Psicología, Filosofía o Sociología.", "pesos": { "sociales": 3, "educacion": 1 } },
      { "texto": "Historia del Arte, Dibujo o Música.", "pesos": { "arte": 3, "comunicacion": 1 } }
    ]
  },
  {
    "id": "gr_05",
    "pregunta": "¿Qué problema te motivaría más resolver?",
    "opciones": [
      { "texto": "Una enfermedad sin diagnóstico claro.", "pesos": { "salud": 3, "ciencias": 1 } },
      { "texto": "Un sistema que no funciona o un bug crítico.", "pesos": { "tecnologia": 3, "ciencias": 1 } },
      { "texto": "Un alumno que no entiende la materia.", "pesos": { "educacion": 3, "sociales": 1 } },
      { "texto": "Una injusticia o vulneración de derechos.", "pesos": { "juridicas": 3, "sociales": 2 } }
    ]
  },
  {
    "id": "gr_06",
    "pregunta": "¿Cuánto te importa trabajar directamente con personas?",
    "opciones": [
      { "texto": "Es lo más esencial para mí.", "pesos": { "educacion": 3, "sociales": 2 } },
      { "texto": "Me gusta, pero no es imprescindible.", "pesos": { "juridicas": 3, "comunicacion": 1 } },
      { "texto": "Prefiero trabajar con sistemas o datos.", "pesos": { "tecnologia": 3, "ciencias": 1 } },
      { "texto": "Me adapto; disfruto entornos muy variados.", "pesos": { "comunicacion": 3, "deporte": 1 } }
    ]
  },
  {
    "id": "gr_07",
    "pregunta": "¿Qué sector te resulta más interesante para trabajar?",
    "opciones": [
      { "texto": "Sanidad pública o privada.", "pesos": { "salud": 3, "deporte": 1 } },
      { "texto": "Empresas tecnológicas o startups.", "pesos": { "tecnologia": 3, "ciencias": 1 } },
      { "texto": "Educación, ONG o administración pública.", "pesos": { "educacion": 3, "sociales": 2 } },
      { "texto": "Cultura, turismo, hostelería o medios.", "pesos": { "comunicacion": 3, "arte": 1 } }
    ]
  },
  {
    "id": "gr_08",
    "pregunta": "¿Cómo te imaginas dentro de 10 años?",
    "opciones": [
      { "texto": "Médico, enfermero o investigador médico.", "pesos": { "salud": 3, "ciencias": 1 } },
      { "texto": "Ingeniero, programador o arquitecto.", "pesos": { "tecnologia": 3, "ciencias": 1 } },
      { "texto": "Abogado, juez o político.", "pesos": { "juridicas": 3, "sociales": 1 } },
      { "texto": "Artista, comunicador o creador de contenido.", "pesos": { "arte": 3, "comunicacion": 1 } }
    ]
  }
];

// ============================================================
//  PREGUNTAS TEST 3 — GRADO DETALLADO (20 preguntas)
// ============================================================
const preguntasGradoDetallado = [
  { "id": "gd_01", "pregunta": "¿Qué actividad te daría más satisfacción en tu día a día?", "opciones": [ { "texto": "Atender pacientes y mejorar su salud.", "pesos": { "salud": 3, "educacion": 1 } }, { "texto": "Programar o diseñar sistemas digitales.", "pesos": { "tecnologia": 3, "ciencias": 1 } }, { "texto": "Defender a alguien o redactar leyes.", "pesos": { "juridicas": 3, "sociales": 1 } }, { "texto": "Crear arte, música o contenido visual.", "pesos": { "arte": 3, "comunicacion": 1 } } ] },
  { "id": "gd_02", "pregunta": "¿En qué entorno preferirías trabajar?", "opciones": [ { "texto": "Hospital, clínica o laboratorio.", "pesos": { "salud": 3, "ciencias": 1 } }, { "texto": "Empresa tech o startup.", "pesos": { "tecnologia": 3, "juridicas": 1 } }, { "texto": "Al aire libre o instalaciones deportivas.", "pesos": { "deporte": 3, "salud": 1 } }, { "texto": "Hotel, restaurante o agencia de comunicación.", "pesos": { "comunicacion": 3, "arte": 1 } } ] },
  { "id": "gd_03", "pregunta": "¿Qué tipo de impacto quieres tener?", "opciones": [ { "texto": "Salvar vidas o mejorar la salud pública.", "pesos": { "salud": 3, "ciencias": 1 } }, { "texto": "Construir la infraestructura del futuro.", "pesos": { "tecnologia": 3, "ciencias": 1 } }, { "texto": "Defender la justicia y los derechos humanos.", "pesos": { "juridicas": 3, "sociales": 1 } }, { "texto": "Educar, inspirar o transformar personas.", "pesos": { "educacion": 3, "sociales": 1 } } ] },
  { "id": "gd_04", "pregunta": "¿Qué habilidad quieres dominar al máximo?", "opciones": [ { "texto": "Conocimientos médicos y habilidades clínicas.", "pesos": { "salud": 3, "ciencias": 1 } }, { "texto": "Programación y arquitectura de software.", "pesos": { "tecnologia": 3, "ciencias": 1 } }, { "texto": "Argumentación y oratoria jurídica.", "pesos": { "juridicas": 3, "sociales": 1 } }, { "texto": "Diseño, composición y expresión visual.", "pesos": { "arte": 3, "comunicacion": 1 } } ] },
  { "id": "gd_05", "pregunta": "¿Con cuál de estas materias disfrutas más?", "opciones": [ { "texto": "Biología, Química o Anatomía.", "pesos": { "salud": 3, "ciencias": 2 } }, { "texto": "Matemáticas, Física o Estadística.", "pesos": { "ciencias": 3, "tecnologia": 2 } }, { "texto": "Psicología, Filosofía o Sociología.", "pesos": { "sociales": 3, "educacion": 1 } }, { "texto": "Historia del Arte, Dibujo o Música.", "pesos": { "arte": 3, "comunicacion": 1 } } ] },
  { "id": "gd_06", "pregunta": "¿Cuánto te importa trabajar directamente con personas?", "opciones": [ { "texto": "Es lo más esencial para mí.", "pesos": { "educacion": 3, "sociales": 2 } }, { "texto": "Me gusta, pero no es imprescindible.", "pesos": { "juridicas": 3, "comunicacion": 1 } }, { "texto": "Prefiero trabajar con sistemas, datos u objetos.", "pesos": { "tecnologia": 3, "ciencias": 1 } }, { "texto": "Me adapto; disfruto entornos muy variados.", "pesos": { "comunicacion": 3, "deporte": 1 } } ] },
  { "id": "gd_07", "pregunta": "¿Qué tipo de problema te motiva más resolver?", "opciones": [ { "texto": "Una enfermedad sin diagnóstico claro.", "pesos": { "salud": 3, "ciencias": 1 } }, { "texto": "Un sistema que no funciona o un bug crítico.", "pesos": { "tecnologia": 3, "ciencias": 1 } }, { "texto": "Un alumno que no comprende algo.", "pesos": { "educacion": 3, "sociales": 1 } }, { "texto": "Una injusticia o vulneración de derechos.", "pesos": { "juridicas": 3, "sociales": 2 } } ] },
  { "id": "gd_08", "pregunta": "¿Qué te gustaría estudiar en profundidad?", "opciones": [ { "texto": "El cuerpo humano, las enfermedades y su tratamiento.", "pesos": { "salud": 3, "ciencias": 1 } }, { "texto": "Las matemáticas, el universo o la materia.", "pesos": { "ciencias": 3, "tecnologia": 1 } }, { "texto": "El deporte, el movimiento y el rendimiento físico.", "pesos": { "deporte": 3, "salud": 1 } }, { "texto": "Los viajes, culturas, gastronomía o medios.", "pesos": { "comunicacion": 3, "arte": 1 } } ] },
  { "id": "gd_09", "pregunta": "¿Cómo prefieres resolver los retos?", "opciones": [ { "texto": "Con un enfoque científico y basado en evidencia.", "pesos": { "ciencias": 3, "salud": 1 } }, { "texto": "Con creatividad, intuición y estética.", "pesos": { "arte": 3, "comunicacion": 1 } }, { "texto": "Con empatía, escucha y acompañamiento.", "pesos": { "educacion": 3, "sociales": 2 } }, { "texto": "Con estrategia, liderazgo y planificación.", "pesos": { "juridicas": 3, "tecnologia": 1 } } ] },
  { "id": "gd_10", "pregunta": "¿Cuántos años de carrera estarías dispuesto/a a cursar?", "opciones": [ { "texto": "Los que haga falta, 6 o más.", "pesos": { "salud": 3, "juridicas": 1 } }, { "texto": "Entre 4 y 5 años.", "pesos": { "tecnologia": 3, "ciencias": 1 } }, { "texto": "Prefiero ciclos cortos o FP Superior.", "pesos": { "deporte": 3, "comunicacion": 1 } }, { "texto": "No importa si es lo que me apasiona.", "pesos": { "arte": 3, "educacion": 1 } } ] },
  { "id": "gd_11", "pregunta": "¿Qué papel te imaginas teniendo en la sociedad?", "opciones": [ { "texto": "Cuidador, sanitario o investigador médico.", "pesos": { "salud": 3, "ciencias": 1 } }, { "texto": "Creador de tecnología e innovación.", "pesos": { "tecnologia": 3, "ciencias": 1 } }, { "texto": "Educador, orientador o trabajador social.", "pesos": { "educacion": 3, "sociales": 2 } }, { "texto": "Artista, comunicador o creador de cultura.", "pesos": { "arte": 3, "comunicacion": 1 } } ] },
  { "id": "gd_12", "pregunta": "¿Qué tipo de reto académico te atrae más?", "opciones": [ { "texto": "Resolver problemas matemáticos complejos.", "pesos": { "ciencias": 3, "tecnologia": 2 } }, { "texto": "Analizar casos legales y sentencias.", "pesos": { "juridicas": 3, "sociales": 1 } }, { "texto": "Diseñar una campaña de comunicación.", "pesos": { "comunicacion": 3, "arte": 1 } }, { "texto": "Entrenar o analizar el rendimiento deportivo.", "pesos": { "deporte": 3, "salud": 1 } } ] },
  { "id": "gd_13", "pregunta": "¿Qué tipo de contenido disfrutas en tu tiempo libre?", "opciones": [ { "texto": "Documentales de ciencia o medicina.", "pesos": { "ciencias": 3, "salud": 1 } }, { "texto": "Tecnología, startups o emprendimiento.", "pesos": { "tecnologia": 3, "juridicas": 1 } }, { "texto": "Política, sociedad o activismo.", "pesos": { "sociales": 3, "juridicas": 1 } }, { "texto": "Arte, diseño, moda o música.", "pesos": { "arte": 3, "comunicacion": 1 } } ] },
  { "id": "gd_14", "pregunta": "¿Qué sector te parece más interesante para trabajar?", "opciones": [ { "texto": "Sanidad pública o privada.", "pesos": { "salud": 3, "deporte": 1 } }, { "texto": "Empresas tecnológicas o startups.", "pesos": { "tecnologia": 3, "ciencias": 1 } }, { "texto": "Educación, ONG o administración pública.", "pesos": { "educacion": 3, "sociales": 2 } }, { "texto": "Cultura, turismo, hostelería o medios.", "pesos": { "comunicacion": 3, "arte": 1 } } ] },
  { "id": "gd_15", "pregunta": "¿Qué tipo de trabajo final de carrera harías con más ilusión?", "opciones": [ { "texto": "Un estudio clínico o investigación médica.", "pesos": { "salud": 3, "ciencias": 1 } }, { "texto": "Una app, IA o proyecto de ingeniería.", "pesos": { "tecnologia": 3, "ciencias": 1 } }, { "texto": "Un análisis social, jurídico o educativo.", "pesos": { "juridicas": 2, "sociales": 2, "educacion": 1 } }, { "texto": "Un proyecto artístico, musical o de diseño.", "pesos": { "arte": 3, "comunicacion": 1 } } ] },
  { "id": "gd_16", "pregunta": "Imagina que eres referente en tu campo. ¿Por qué lo eres?", "opciones": [ { "texto": "Por curar una enfermedad o desarrollar una vacuna.", "pesos": { "salud": 3, "ciencias": 1 } }, { "texto": "Por crear tecnología usada en todo el mundo.", "pesos": { "tecnologia": 3, "ciencias": 1 } }, { "texto": "Por ganar un caso histórico o cambiar una ley.", "pesos": { "juridicas": 3, "sociales": 1 } }, { "texto": "Por revolucionar la enseñanza.", "pesos": { "educacion": 3, "sociales": 1 } } ] },
  { "id": "gd_17", "pregunta": "¿Cuál de estas frases te representa mejor?", "opciones": [ { "texto": "Quiero entender cómo funciona el cuerpo humano hasta el último detalle.", "pesos": { "salud": 3, "ciencias": 2 } }, { "texto": "Quiero construir cosas que la gente use cada día.", "pesos": { "tecnologia": 3, "arte": 1 } }, { "texto": "Quiero que la justicia sea accesible para todos.", "pesos": { "juridicas": 3, "sociales": 2 } }, { "texto": "Quiero que mi trabajo emocione o inspire a otros.", "pesos": { "arte": 3, "comunicacion": 2 } } ] },
  { "id": "gd_18", "pregunta": "¿Qué te imaginas haciendo el primer día de trabajo?", "opciones": [ { "texto": "Revisando el historial de un paciente o analizando muestras.", "pesos": { "salud": 3, "ciencias": 1 } }, { "texto": "Escribiendo código o revisando un diseño técnico.", "pesos": { "tecnologia": 3, "ciencias": 1 } }, { "texto": "Preparando una clase o una sesión con un grupo.", "pesos": { "educacion": 3, "sociales": 1 } }, { "texto": "Diseñando un logotipo, un rodaje o una campaña.", "pesos": { "arte": 3, "comunicacion": 2 } } ] },
  { "id": "gd_19", "pregunta": "Si te propusieran un proyecto de investigación, ¿cuál elegiría tu corazón?", "opciones": [ { "texto": "Estudiar nuevas terapias para enfermedades crónicas.", "pesos": { "salud": 3, "ciencias": 2 } }, { "texto": "Analizar cómo los algoritmos toman decisiones por nosotros.", "pesos": { "tecnologia": 3, "sociales": 1 } }, { "texto": "Investigar por qué fracasan los sistemas educativos.", "pesos": { "educacion": 3, "sociales": 2 } }, { "texto": "Explorar cómo el deporte mejora la salud mental.", "pesos": { "deporte": 3, "salud": 1 } } ] },
  { "id": "gd_20", "pregunta": "¿Cuál de estas noticias te haría querer trabajar en ese campo inmediatamente?", "opciones": [ { "texto": "Científicos descubren que una bacteria puede curar el cáncer.", "pesos": { "salud": 3, "ciencias": 2 } }, { "texto": "Una IA diseña el edificio más eficiente de la historia.", "pesos": { "tecnologia": 3, "ciencias": 1 } }, { "texto": "Un tribunal anula una ley injusta gracias a un joven abogado.", "pesos": { "juridicas": 3, "sociales": 1 } }, { "texto": "Un cortometraje hecho por un adolescente gana en Cannes.", "pesos": { "arte": 3, "comunicacion": 2 } } ] }
];