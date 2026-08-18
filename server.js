// ============================================================
// WikiStudent — server.js (MIGRADO A SUPABASE)
// ============================================================

require('dotenv').config();
const cron           = require('node-cron');
const admin          = require('firebase-admin');
const serviceAccount = require('./firebase-admin.json');

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

const express = require('express');
const path    = require('path');
const session = require('express-session');

const { supabaseAdmin, createUserClient } = require('./lib/supabase');

// ── 1. APP EXPRESS ────────────────────────────────────────────────────────────
const app = express();

// Render (y la mayoría de hostings) ponen un proxy delante que gestiona el
// HTTPS. Sin esto, Express no reconoce la conexión como segura y se niega
// a guardar la cookie de sesión (que marcamos como "secure" más abajo) —
// eso hacía que el login pareciera fallar silenciosamente en producción.
app.set('trust proxy', 1);

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
// Por defecto express.json() solo acepta 100kb de body. Las imágenes que
// manda flashcards.js van en base64 dentro del JSON (con ~33% de overhead
// sobre el tamaño real del archivo), así que con solo 1-2 fotos se supera
// ese límite de sobra — eso revienta ANTES de llegar a ninguna ruta, con un
// error que ni siquiera pasa por nuestro try/catch de /api/flashcards/generate
// (por eso no salía nada raro en los logs). Lo subimos a 20mb para dar
// margen a las 5 imágenes de 5MB que ya permite validate() en flashcards.js.
app.use(express.json({ limit: '20mb' }));
app.use(express.urlencoded({ extended: true, limit: '20mb' }));
app.use(express.static(__dirname));

// ── 2. SESIONES ───────────────────────────────────────────────────────────────
// Ya no guardamos aquí usuario/contraseña: solo los tokens que nos da
// Supabase Auth al hacer login. NOTA: esto usa el MemoryStore por defecto
// de express-session, que vale para desarrollo/uso personal, pero se
// reinicia si reinicias el servidor y no sirve si algún día tienes varias
// instancias corriendo a la vez. Si eso llega a pasar, lo cambiamos a
// connect-pg-simple apuntando a tu propia base de Supabase.
app.use(session({
  secret:            process.env.SESSION_SECRET,
  resave:            false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    secure:   process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge:   7 * 24 * 60 * 60 * 1000,
  },
}));

// ── 3. MIDDLEWARE: adjunta req.user + req.supabase (cliente autenticado) ─────
// Sustituye a passport.session(). En cada petición, si hay sesión guardada,
// reconstruimos un cliente de Supabase "logueado" como ese usuario: así
// todas las queries de la ruta respetan RLS automáticamente.
async function attachUser(req, res, next) {
  const saved = req.session.supabaseSession;
  if (!saved) {
    req.user = null;
    req.supabase = null;
    return next();
  }

  try {
    const supabase = createUserClient();
    const { data, error } = await supabase.auth.setSession({
      access_token:  saved.access_token,
      refresh_token: saved.refresh_token,
    });

    if (error || !data.session) {
      req.session.supabaseSession = null;
      req.user = null;
      req.supabase = null;
      return next();
    }

    // Los tokens rotan; guardamos siempre la versión más reciente.
    req.session.supabaseSession = {
      access_token:  data.session.access_token,
      refresh_token: data.session.refresh_token,
    };

    const { data: profile } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', data.session.user.id)
      .single();

    req.supabase = supabase;
    req.user = { ...data.session.user, ...profile };
    next();
  } catch (err) {
    console.error('attachUser error:', err.message);
    req.user = null;
    req.supabase = null;
    next();
  }
}

app.use(attachUser);

app.use((req, res, next) => {
  res.locals.currentUser = req.user || null;
  next();
});

// ── 4. MIDDLEWARE DE AUTENTICACIÓN ────────────────────────────────────────────
function ensureAuthenticated(req, res, next) {
  if (req.user) return next();
  res.status(401).json({ error: 'Inicia sesión para continuar' });
}

const authRouter = require('./routes/auth');
const { requireOnboarding } = require('./routes/auth');
app.use('/auth', authRouter);

// ── 5. RUTAS NAVEGACIÓN ───────────────────────────────────────────────────────
app.get('/', (req, res) => {
  if (req.user) return res.redirect('/web');
  res.render('index', { user: null, error: null });
});

app.get('/web', (req, res, next) => {
  if (!req.user) return res.redirect('/');
  next();
}, requireOnboarding, (req, res) => {
  res.render('app', { user: req.user });
});

// ── 6. API: CARPETAS ─────────────────────────────────────────────────────────
app.get('/api/folders', ensureAuthenticated, async (req, res) => {
  const { level, parent_id } = req.query;
  try {
    let query = req.supabase.from('folders').select('*');
    if (level === 'children') {
      const pid = (parent_id === undefined || parent_id === 'null') ? null : parent_id;
      query = pid === null
        ? query.is('parent_id', null).order('created_at', { ascending: true })
        : query.eq('parent_id', pid).order('created_at', { ascending: true });
    } else {
      query = query.order('name', { ascending: true });
    }
    const { data, error } = await query;
    if (error) throw error;
    res.json(data);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/folders', ensureAuthenticated, async (req, res) => {
  const { name, parent_id = null } = req.body;
  const { data, error } = await req.supabase
    .from('folders')
    .insert({ name, parent_id, user_id: req.user.id })
    .select()
    .single();
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

app.patch('/api/folders/:id', ensureAuthenticated, async (req, res) => {
  const { name, parent_id } = req.body;
  const updates = {};
  if (name !== undefined) updates.name = name;
  if (parent_id !== undefined) updates.parent_id = parent_id || null;
  const { error } = await req.supabase.from('folders').update(updates).eq('id', req.params.id);
  if (error) return res.status(500).json({ error: error.message });
  res.json({ success: true });
});

// Ya no borramos cards/decks a mano: el esquema tiene ON DELETE CASCADE
// desde folders → decks → cards, así que borrar la carpeta se lleva todo
// lo de dentro automáticamente.
app.delete('/api/folders/:id', ensureAuthenticated, async (req, res) => {
  const { error } = await req.supabase.from('folders').delete().eq('id', req.params.id);
  if (error) return res.status(500).json({ error: error.message });
  res.json({ success: true });
});

// ── 7. API: MAZOS ──────────────────────────────────────────────────────────
app.get('/api/decks', ensureAuthenticated, async (req, res) => {
  const { folder_id } = req.query;
  const fid = (folder_id === undefined || folder_id === 'null') ? null : folder_id;
  try {
    const { data, error } = fid === null
      ? await req.supabase.from('decks').select('*').is('folder_id', null).order('created_at', { ascending: true })
      : await req.supabase.from('decks').select('*').eq('folder_id', fid).order('created_at', { ascending: true });
    if (error) throw error;
    res.json(data);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/decks', ensureAuthenticated, async (req, res) => {
  const { name, folder_id = null } = req.body;
  const { data, error } = await req.supabase
    .from('decks')
    .insert({ name, folder_id, user_id: req.user.id })
    .select()
    .single();
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

app.patch('/api/decks/:id', ensureAuthenticated, async (req, res) => {
  const { name, folder_id } = req.body;
  const updates = {};
  if (name !== undefined) updates.name = name;
  if (folder_id !== undefined) updates.folder_id = folder_id || null;
  const { error } = await req.supabase.from('decks').update(updates).eq('id', req.params.id);
  if (error) return res.status(500).json({ error: error.message });
  res.json({ success: true });
});

// Igual que las carpetas: borrar el mazo se lleva las cards en cascada.
app.delete('/api/decks/:id', ensureAuthenticated, async (req, res) => {
  const { error } = await req.supabase.from('decks').delete().eq('id', req.params.id);
  if (error) return res.status(500).json({ error: error.message });
  res.json({ success: true });
});

// ── 8. API: CONTADORES ────────────────────────────────────────────────────────
app.get('/api/count/decks-in-folder/:folderId', ensureAuthenticated, async (req, res) => {
  const { count, error } = await req.supabase
    .from('decks').select('*', { count: 'exact', head: true }).eq('folder_id', req.params.folderId);
  if (error) return res.status(500).json({ error: error.message });
  res.json({ count });
});

app.get('/api/count/subfolders-in-folder/:folderId', ensureAuthenticated, async (req, res) => {
  const { count, error } = await req.supabase
    .from('folders').select('*', { count: 'exact', head: true }).eq('parent_id', req.params.folderId);
  if (error) return res.status(500).json({ error: error.message });
  res.json({ count });
});

app.get('/api/count/cards-in-deck/:deckId', ensureAuthenticated, async (req, res) => {
  const { count, error } = await req.supabase
    .from('cards').select('*', { count: 'exact', head: true }).eq('deck_id', req.params.deckId);
  if (error) return res.status(500).json({ error: error.message });
  res.json({ count });
});

// ── 9. API: TARJETAS Y BUSCADOR ───────────────────────────────────────────────
// El original interpolaba el nombre de tabla directamente en el SQL
// (`FROM ${table}`), lo que en Postgres/Supabase es una vía directa a
// inyección SQL si algún día ese endpoint se expone más. Lo dejamos con
// una lista blanca de tablas permitidas.
app.get('/api/names', ensureAuthenticated, async (req, res) => {
  const { table, pattern } = req.query;
  const allowed = ['folders', 'decks'];
  if (!allowed.includes(table)) return res.status(400).json({ error: 'Tabla no válida' });

  try {
    const [{ data: exact, error: e1 }, { data: variants, error: e2 }] = await Promise.all([
      req.supabase.from(table).select('name').eq('name', pattern),
      req.supabase.from(table).select('name').like('name', `${pattern} (%)`),
    ]);
    if (e1) throw e1;
    if (e2) throw e2;
    res.json([...exact, ...variants]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/cards/deck/:deckId', ensureAuthenticated, async (req, res) => {
  // RLS ya impide leer un deck ajeno, así que si esto no devuelve nada
  // es que el deck no existe o no es tuyo — igual que el chequeo manual
  // que hacía la versión SQLite.
  const { data: deck } = await req.supabase.from('decks').select('id').eq('id', req.params.deckId).single();
  if (!deck) return res.status(403).json({ error: 'Acceso denegado' });

  const { data, error } = await req.supabase
    .from('cards').select('*').eq('deck_id', req.params.deckId).order('id', { ascending: true });
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

app.put('/api/cards/deck/:deckId', ensureAuthenticated, async (req, res) => {
  const { cards } = req.body;
  const deckId = req.params.deckId;
  try {
    // OJO: a diferencia de better-sqlite3, el cliente de Supabase no hace
    // transacciones multi-sentencia desde el servidor. Este borrar+insertar
    // no es atómico: si el insert fallara justo después del delete te
    // quedarías con el mazo vacío. Para esta app (uso personal) el riesgo
    // es bajo, pero si más adelante quieres que sea atómico, lo movemos a
    // una función de Postgres (RPC) que haga ambas cosas en una transacción.
    const { error: delErr } = await req.supabase.from('cards').delete().eq('deck_id', deckId);
    if (delErr) throw delErr;

    if (Array.isArray(cards) && cards.length) {
      const rows = cards.map(c => ({ user_id: req.user.id, deck_id: deckId, question: c.q, answer: c.a }));
      const { error: insErr } = await req.supabase.from('cards').insert(rows);
      if (insErr) throw insErr;
    }
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── 9b. API: GENERADOR DE FLASHCARDS CON IA (Gemini) ───────────────────────────
// Antes flashcards.js llamaba a Gemini DIRECTAMENTE desde el navegador con la
// API key escrita en el propio archivo JS. Cualquiera que abriera "Ver código
// fuente" podía copiarla y gastarla a tu costa — y Google también escanea el
// código público en busca de claves expuestas y las revoca automáticamente en
// cuanto las detecta. Eso es lo más probable que esté causando el 403 que
// viste en consola: la key quedó inutilizada por haber estado a la vista.
//
// Ahora el navegador solo habla con TU servidor (esta ruta) y es el servidor
// el que llama a Gemini con la key leída de tu .env — nunca viaja al cliente.
//
// ⚠️ Pasos que te faltan a ti:
//   1) Revoca la key vieja (AIza...) en https://aistudio.google.com/apikey
//      (o Google Cloud Console → Credenciales) y genera una nueva.
//   2) En Render (NO en tu .env local, eso solo vale en tu ordenador):
//      Dashboard → tu servicio → Environment → Add Environment Variable
//      Key: GEMINI_API_KEY   Value: tu_key_nueva (sin comillas alrededor)
//   3) Guarda: Render redespliega solo. Espera a que el deploy termine.
//
// .replace(/^["']|["']$/g, '') quita comillas por si al pegar la key en el
// panel de Render (o en el .env) se colaron sin querer, p.ej. si pegaste
// GEMINI_API_KEY="AIzaSy..." tal cual — eso dejaría la key con comillas
// literales dentro de process.env.GEMINI_API_KEY y rompería la petición a
// Gemini con un error que ni siquiera es un 403/429 normal (por eso salía
// un 500 "a secas": el fetch de abajo fallaba al construir la URL, antes de
// llegar a hablar con Gemini).
const GEMINI_API_KEY = (process.env.GEMINI_API_KEY || '').trim().replace(/^["']|["']$/g, '');
const geminiUrl = (model) =>
  `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${GEMINI_API_KEY}`;

// Aviso en el arranque — esto SÍ debería aparecer en los logs de Render en
// cuanto el servicio arranca (no hace falta ni generar una flashcard para
// verlo). Si no ves ni esta línea, el problema no es la key: es que no
// estás mirando los logs del servicio/deploy correctos, o el deploy con
// este código todavía no ha terminado.
if (!GEMINI_API_KEY) {
  console.warn('⚠️  [Gemini] GEMINI_API_KEY no está definida — /api/flashcards/generate devolverá 500 hasta que la añadas en Render → Environment.');
} else {
  console.log(`✅ [Gemini] GEMINI_API_KEY detectada (empieza por "${GEMINI_API_KEY.slice(0, 6)}…", ${GEMINI_API_KEY.length} caracteres).`);
}

app.post('/api/flashcards/generate', ensureAuthenticated, async (req, res) => {
  // Log de diagnóstico: esto confirma que la petición SÍ llega al servidor.
  // Si generas una flashcard y esta línea no aparece en los logs de Render,
  // el problema no es la key ni Gemini — es que la petición no está
  // llegando a este servidor (caché del navegador, deploy antiguo todavía
  // sirviendo, dominio equivocado, etc.).
  console.log(`[flashcards] petición recibida — user=${req.user?.id}, tema="${(req.body?.topic || '').slice(0, 40)}", imágenes=${(req.body?.images || []).length}`);

  if (!GEMINI_API_KEY) {
    return res.status(500).json({ error: 'Falta GEMINI_API_KEY en el servidor (revisa Render → Environment, no el .env local).' });
  }

  const { topic, qty, images } = req.body;
  // "images" (opcional): [{ mime_type, data }] en base64 — el navegador ya
  // hace esa conversión con FileReader antes de mandarlas, igual que antes.
  const tieneImagenes = Array.isArray(images) && images.length > 0;

  if ((!topic || !topic.trim()) && !tieneImagenes) {
    return res.status(400).json({ error: 'Escribe algo o adjunta una imagen.' });
  }
  const cantidad = Number(qty) > 0 && Number(qty) <= 30 ? Number(qty) : 10;

  try {
    const parts = [];
    if (tieneImagenes) {
      for (const img of images) {
        if (!img?.mime_type || !img?.data) continue;
        parts.push({ inline_data: { mime_type: img.mime_type, data: img.data } });
      }
    }
    const temaFinal = (topic && topic.trim()) || 'el contenido de las imágenes adjuntas';
    parts.push({
      text: `Genera exactamente ${cantidad} flashcards de estudio sobre: "${temaFinal}".
Devuelve ÚNICAMENTE un array JSON válido, sin texto extra, sin markdown, sin bloques de código:
[{"q":"pregunta","a":"respuesta"}]`,
    });

    // Node 18+ trae fetch nativo (coherente con el resto del proyecto). Si tu
    // Node es más antiguo, instala node-fetch y haz
    // "const fetch = require('node-fetch');" arriba del todo del archivo.
    const geminiRes = await fetch(geminiUrl('gemini-2.5-flash'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contents: [{ parts }], generationConfig: { temperature: 0.7 } }),
    });

    if (!geminiRes.ok) {
      const detalle = await geminiRes.text().catch(() => '');
      console.error('[Gemini] error', geminiRes.status, detalle);
      const mensaje = geminiRes.status === 403
        ? 'Gemini rechazó la clave (403). Revisa que GEMINI_API_KEY sea una key nueva y válida en el .env.'
        : geminiRes.status === 429
          ? 'Se ha alcanzado el límite de peticiones a Gemini por ahora, prueba en un rato.'
          : `Error de Gemini (${geminiRes.status})`;
      return res.status(geminiRes.status === 429 ? 429 : 502).json({ error: mensaje });
    }

    const data  = await geminiRes.json();
    const raw   = data.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
    const clean = raw.replace(/```json|```/g, '').trim();

    let generated;
    try {
      generated = JSON.parse(clean);
    } catch (e) {
      console.error('[Gemini] respuesta no era JSON válido:', raw.slice(0, 300));
      return res.status(502).json({ error: 'Gemini devolvió una respuesta que no se pudo interpretar como JSON.' });
    }
    if (!Array.isArray(generated) || !generated.length) {
      return res.status(502).json({ error: 'Gemini no devolvió ninguna tarjeta válida.' });
    }

    res.json({ cards: generated.map(({ q, a }) => ({ q, a })) });
  } catch (err) {
    console.error('[Gemini] excepción:', err);
    res.status(500).json({ error: err.message });
  }
});

// ── 10. API: KANBAN ───────────────────────────────────────────────────────────
app.get('/api/kanban', ensureAuthenticated, async (req, res) => {
  try {
    const { data: tasks, error } = await req.supabase
      .from('kanban_tasks').select('*').order('columna', { ascending: true }).order('orden', { ascending: true });
    if (error) throw error;

    if (!req.user.kanban_onboarded) {
      const defaults = [
        { titulo: 'Integrales — Tema 5',   asignatura: 'Matemáticas II',     hora: '09:00', urgencia: 'urgente', fecha: null, hora_limite: null, columna: 'staging', orden: 0 },
        { titulo: 'Problemas de óptica',   asignatura: 'Física',             hora: '11:30', urgencia: 'media',   fecha: null, hora_limite: null, columna: 'staging', orden: 1 },
        { titulo: 'Transición democrática', asignatura: 'Historia de España', hora: '16:00', urgencia: 'baja',    fecha: null, hora_limite: null, columna: 'staging', orden: 2 },
      ].map(t => ({ ...t, user_id: req.user.id }));

      const { error: insErr } = await req.supabase.from('kanban_tasks').insert(defaults);
      if (insErr) throw insErr;

      await req.supabase.from('profiles').update({ kanban_onboarded: true }).eq('id', req.user.id);
      req.user.kanban_onboarded = true;

      const { data: newTasks, error: e2 } = await req.supabase
        .from('kanban_tasks').select('*').order('columna', { ascending: true }).order('orden', { ascending: true });
      if (e2) throw e2;
      return res.json(newTasks);
    }

    res.json(tasks);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/kanban', ensureAuthenticated, async (req, res) => {
  const { titulo, asignatura = '', hora = '', urgencia = 'baja', fecha = null, hora_limite = null, columna = 'staging', orden = 0 } = req.body;
  if (!titulo) return res.status(400).json({ error: 'titulo requerido' });
  const { data, error } = await req.supabase
    .from('kanban_tasks')
    .insert({ user_id: req.user.id, titulo, asignatura, hora, urgencia, fecha, hora_limite, columna, orden })
    .select()
    .single();
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

app.patch('/api/kanban/:id', ensureAuthenticated, async (req, res) => {
  const { data: existing } = await req.supabase.from('kanban_tasks').select('id').eq('id', req.params.id).single();
  if (!existing) return res.status(403).json({ error: 'Acceso denegado' });

  const fields = ['titulo', 'asignatura', 'hora', 'urgencia', 'fecha', 'hora_limite', 'columna', 'orden'];
  const updates = {};
  for (const f of fields) if (req.body[f] !== undefined) updates[f] = req.body[f];

  if (Object.keys(updates).length === 0) return res.json({ success: true });
  const { error } = await req.supabase.from('kanban_tasks').update(updates).eq('id', req.params.id);
  if (error) return res.status(500).json({ error: error.message });
  res.json({ success: true });
});

app.delete('/api/kanban/:id', ensureAuthenticated, async (req, res) => {
  const { error } = await req.supabase.from('kanban_tasks').delete().eq('id', req.params.id);
  if (error) return res.status(500).json({ error: error.message });
  res.json({ success: true });
});

app.put('/api/kanban/bulk-order', ensureAuthenticated, async (req, res) => {
  const { tasks } = req.body;
  if (!Array.isArray(tasks)) return res.status(400).json({ error: 'tasks debe ser un array' });
  try {
    // Igual que el PUT de cards: varias updates sueltas, no una transacción.
    const results = await Promise.all(
      tasks.map(t => req.supabase.from('kanban_tasks').update({ columna: t.columna, orden: t.orden }).eq('id', t.id))
    );
    const failed = results.find(r => r.error);
    if (failed) throw failed.error;
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── 11. API: RANKING ─────────────────────────────────────────────────────────
//
// NUEVO — tiempo real vía Server-Sent Events (SSE):
// No añadimos socket.io ni ninguna dependencia nueva: SSE funciona sobre
// HTTP normal (una petición GET que el navegador mantiene abierta con
// EventSource) y Express ya lo soporta de fábrica. Cada vez que cambian
// puntos/racha de alguien, `broadcastRanking()` empuja el ranking fresco
// a todos los clientes conectados (dashboard Y página /pages/ranking.html
// a la vez, en cualquier pestaña de cualquier usuario).
//
// rankingClients: Set de objetos `res` de Express con la conexión SSE abierta.
const rankingClients = new Set();

// Columnas que necesitamos tanto para el widget del dashboard como para la
// página completa de ranking (incluye avatar_url para pintar el sidebar/
// podio sin tener que pedir un endpoint de perfil aparte).
const RANKING_SELECT = 'id, username, points, streak, avatar_url';

// Límite por defecto si no se especifica ?limit=. El dashboard pide 6
// (podio + 3), la página dedicada pide más (p.ej. 30).
const RANKING_DEFAULT_LIMIT = 6;
const RANKING_MAX_LIMIT     = 100; // cota de seguridad ante ?limit= arbitrario

async function fetchRankingUsers(limit = RANKING_DEFAULT_LIMIT) {
  const safeLimit = Math.min(Math.max(Number(limit) || RANKING_DEFAULT_LIMIT, 1), RANKING_MAX_LIMIT);
  const { data, error } = await supabaseAdmin
    .from('profiles').select(RANKING_SELECT).order('points', { ascending: false }).limit(safeLimit);
  if (error) throw error;
  return data;
}

// Emite el ranking actualizado a todas las conexiones SSE abiertas. Se usa
// supabaseAdmin (no req.supabase) porque esto no ocurre dentro de una
// petición de un usuario concreto, sino como efecto secundario para todos.
async function broadcastRanking(limit = RANKING_MAX_LIMIT) {
  if (rankingClients.size === 0) return; // nadie escuchando, no gastes una query
  try {
    const users = await fetchRankingUsers(limit);
    const payload = `event: ranking-update\ndata: ${JSON.stringify({ users })}\n\n`;
    for (const client of rankingClients) client.write(payload);
  } catch (err) {
    console.error('[Ranking][SSE] Error al difundir:', err.message);
  }
}

app.get('/api/ranking', ensureAuthenticated, async (req, res) => {
  try {
    const users = await fetchRankingUsers(req.query.limit);
    res.json({ users, currentUserId: req.user.id });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Stream SSE — abrir con `new EventSource('/api/ranking/stream')` en el
// front. Requiere sesión (misma cookie que el resto de /api), así que
// EventSource funciona sin tocar nada porque manda cookies automáticamente.
app.get('/api/ranking/stream', ensureAuthenticated, (req, res) => {
  res.writeHead(200, {
    'Content-Type':      'text/event-stream',
    'Cache-Control':     'no-cache, no-transform',
    Connection:           'keep-alive',
    // Evita que nginx/proxies con buffering (Render incluido) retengan
    // los chunks en vez de enviarlos según llegan.
    'X-Accel-Buffering': 'no',
  });
  res.write('retry: 5000\n\n');

  rankingClients.add(res);

  // Snapshot inicial nada más conectar, así la UI no espera al primer
  // cambio de otra persona para pintar el ranking.
  fetchRankingUsers(RANKING_MAX_LIMIT)
    .then(users => res.write(`event: ranking-update\ndata: ${JSON.stringify({ users })}\n\n`))
    .catch(() => {});

  // Ping de comentario cada 20s para mantener viva la conexión a través de
  // proxies/balanceadores que cierran sockets inactivos.
  const keepAlive = setInterval(() => res.write(':ping\n\n'), 20000);

  req.on('close', () => {
    clearInterval(keepAlive);
    rankingClients.delete(res);
  });
});

app.post('/api/ranking/add-points', ensureAuthenticated, async (req, res) => {
  const { puntos } = req.body;
  if (!puntos || isNaN(puntos)) return res.status(400).json({ error: 'puntos inválidos' });
  try {
    // Lectura + escritura en vez de un "points = points + ?" atómico: si
    // esto empieza a recibir clics muy rápidos y notas puntos perdidos por
    // condiciones de carrera, lo cambiamos a una función RPC de Postgres.
    const { data: current, error: readErr } = await req.supabase
      .from('profiles').select('points').eq('id', req.user.id).single();
    if (readErr) throw readErr;

    const { error: updErr } = await req.supabase
      .from('profiles').update({ points: current.points + Number(puntos) }).eq('id', req.user.id);
    if (updErr) throw updErr;

    const users = await fetchRankingUsers(req.query.limit);

    // Difunde el cambio en tiempo real a todo el mundo conectado (incluido
    // el propio usuario en otras pestañas/dispositivos).
    broadcastRanking();

    res.json({ users, currentUserId: req.user.id });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── 12. API: ESTADÍSTICAS DEL DASHBOARD ──────────────────────────────────────
app.get('/api/stats', ensureAuthenticated, async (req, res) => {
  try {
    const { data: user, error } = await req.supabase
      .from('profiles').select('points, streak, today_seconds, last_study_date, today_points').eq('id', req.user.id).single();
    if (error) throw error;

    const todayISO = new Date().toISOString().slice(0, 10);
    if (user.last_study_date !== todayISO) {
      await req.supabase.from('profiles').update({ today_seconds: 0, today_points: 0 }).eq('id', req.user.id);
      user.today_seconds = 0;
      user.today_points = 0;
    }

    const { count, error: countErr } = await req.supabase
      .from('profiles').select('*', { count: 'exact', head: true }).gt('points', user.points);
    if (countErr) throw countErr;

    res.json({
      todaySeconds: user.today_seconds,
      streak:       user.streak,
      position:     count + 1,
      todayPoints:  user.today_points,
      totalPoints:  user.points,
    });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/stats/session', ensureAuthenticated, async (req, res) => {
  const { duration, points } = req.body;
  if (!duration || !points) return res.status(400).json({ error: 'faltan datos' });

  try {
    const todayISO = new Date().toISOString().slice(0, 10);
    const { data: user, error } = await req.supabase
      .from('profiles').select('last_study_date, streak, today_seconds, today_points').eq('id', req.user.id).single();
    if (error) throw error;

    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayISO = yesterday.toISOString().slice(0, 10);

    let newStreak = user.streak;
    if (user.last_study_date === todayISO) {
      // ya estudió hoy, la racha no cambia
    } else if (user.last_study_date === yesterdayISO) {
      newStreak = user.streak + 1;
    } else {
      newStreak = 1;
    }

    const { error: updErr } = await req.supabase.from('profiles').update({
      today_seconds:   user.today_seconds + Number(duration),
      today_points:    user.today_points + Number(points),
      last_study_date: todayISO,
      streak:          newStreak,
    }).eq('id', req.user.id);
    if (updErr) throw updErr;

    await req.supabase.from('pomodoro_sessions').insert({ user_id: req.user.id, duration, points });

    const { data: fresh, error: freshErr } = await req.supabase
      .from('profiles').select('today_seconds, today_points, streak, points').eq('id', req.user.id).single();
    if (freshErr) throw freshErr;

    const { count, error: countErr } = await req.supabase
      .from('profiles').select('*', { count: 'exact', head: true }).gt('points', fresh.points);
    if (countErr) throw countErr;

    // La racha (streak) se muestra en la lista de ranking de otros
    // usuarios, así que aunque `points` no cambie aquí, hay que avisar a
    // quien esté mirando /pages/ranking.html en tiempo real.
    broadcastRanking();

    res.json({
      todaySeconds: fresh.today_seconds,
      todayPoints:  fresh.today_points,
      streak:       fresh.streak,
      totalPoints:  fresh.points,
      position:     count + 1,
    });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── LOGOUT ───────────────────────────────────────────────────────────────────
app.get('/logout', async (req, res) => {
  try { if (req.supabase) await req.supabase.auth.signOut(); } catch (_) {}
  req.session.destroy(() => {
    res.clearCookie('connect.sid');
    res.redirect('/');
  });
});

// ══════════════════════════════════════════════════════════════
// API: USUARIO — configuración
// ══════════════════════════════════════════════════════════════

app.post('/api/user/username', ensureAuthenticated, async (req, res) => {
  const { username } = req.body;
  if (!username || username.trim().length < 3) {
    return res.status(400).json({ error: 'El nombre debe tener al menos 3 caracteres.' });
  }
  const trimmed = username.trim();
  if (!/^[a-zA-Z0-9_.\-]+$/.test(trimmed)) {
    return res.status(400).json({ error: 'Solo letras, números, guiones, puntos y _.' });
  }
  try {
    // "username" es citext en el esquema, así que la comparación ya es
    // insensible a mayúsculas/minúsculas por sí sola.
    const { data: existing } = await req.supabase
      .from('profiles').select('id').eq('username', trimmed).neq('id', req.user.id).maybeSingle();
    if (existing) return res.status(409).json({ error: 'Ese nombre ya está en uso.' });

    const { error } = await req.supabase.from('profiles').update({ username: trimmed }).eq('id', req.user.id);
    if (error) throw error;
    res.json({ success: true, username: trimmed });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Cambiar email ahora pasa por Supabase Auth: envía un correo de
// confirmación al nuevo email antes de aplicar el cambio de verdad.
app.post('/api/user/email', ensureAuthenticated, async (req, res) => {
  const { email } = req.body;
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res.status(400).json({ error: 'Email inválido.' });
  }
  const { error } = await req.supabase.auth.updateUser({ email: email.toLowerCase() });
  if (error) return res.status(500).json({ error: error.message });
  res.json({ success: true, message: 'Revisa tu correo para confirmar el cambio.' });
});

app.post('/api/user/recovery-email', ensureAuthenticated, async (req, res) => {
  const { recoveryEmail } = req.body;
  if (!recoveryEmail) return res.status(400).json({ error: 'Email requerido.' });
  const { error } = await req.supabase
    .from('profiles').update({ recovery_email: recoveryEmail.toLowerCase() }).eq('id', req.user.id);
  if (error) return res.status(500).json({ error: error.message });
  res.json({ success: true });
});

// Ya no necesitamos comprobar la contraseña actual a mano con bcrypt:
// el propio token de sesión activo es la prueba de identidad que
// Supabase exige para dejarte cambiar la contraseña.
app.post('/api/user/password', ensureAuthenticated, async (req, res) => {
  const { newPassword } = req.body;
  if (!newPassword || newPassword.length < 8) {
    return res.status(400).json({ message: 'La contraseña debe tener al menos 8 caracteres.' });
  }
  const { error } = await req.supabase.auth.updateUser({ password: newPassword });
  if (error) return res.status(500).json({ message: error.message });
  res.json({ success: true });
});

app.post('/api/user/notification-token', ensureAuthenticated, async (req, res) => {
  const { token } = req.body;
  if (!token) return res.status(400).json({ error: 'Token requerido.' });
  const { error } = await req.supabase.from('profiles').update({ notification_token: token }).eq('id', req.user.id);
  if (error) return res.status(500).json({ error: error.message });
  res.json({ success: true });
});

// ── API: RECORDATORIOS DEL CALENDARIO ────────────────────────────────────────
// El calendario en sí (eventos, notas, emociones) vive en localStorage del
// navegador — pero un recordatorio con hora necesita que ALGUIEN lo revise
// aunque el usuario tenga la app cerrada, y eso solo lo puede hacer el
// servidor. Por eso, solo los eventos que llevan recordatorio se guardan
// también aquí, en la tabla `calendar_reminders` (ver migración SQL).
//
// reminder_mode:
//   'same_day' → se avisa UNA vez, el día del evento, a reminder_time.
//   'daily'    → se avisa TODOS los días a reminder_time hasta que llega
//                el día del evento (incluido).
app.post('/api/calendar/reminders', ensureAuthenticated, async (req, res) => {
  const { label, type = 'event', event_date, reminder_time, reminder_mode } = req.body;

  if (!label || !event_date || !reminder_time) {
    return res.status(400).json({ error: 'Faltan datos del recordatorio (label, event_date, reminder_time).' });
  }
  if (!['daily', 'same_day'].includes(reminder_mode)) {
    return res.status(400).json({ error: 'reminder_mode debe ser "daily" o "same_day".' });
  }

  const { data, error } = await req.supabase
    .from('calendar_reminders')
    .insert({
      user_id:       req.user.id,
      label,
      type,
      event_date,
      reminder_time,
      reminder_mode,
    })
    .select('id')
    .single();

  if (error) return res.status(500).json({ error: error.message });
  res.json({ success: true, id: data.id });
});

app.delete('/api/calendar/reminders/:id', ensureAuthenticated, async (req, res) => {
  const { error } = await req.supabase
    .from('calendar_reminders')
    .delete()
    .eq('id', req.params.id)
    .eq('user_id', req.user.id); // por si acaso, aunque RLS ya lo cubre
  if (error) return res.status(500).json({ error: error.message });
  res.json({ success: true });
});

app.post('/api/user/send-test-notification', ensureAuthenticated, async (req, res) => {
  try {
    const { data: profile, error } = await req.supabase
      .from('profiles').select('notification_token').eq('id', req.user.id).single();
    if (error) throw error;
    if (!profile?.notification_token) return res.status(404).json({ error: 'Este usuario no tiene un token registrado.' });

    const mensaje = {
      notification: {
        title: '¡WikiStudent Alerta! 📅',
        body: 'Tu código funciona perfectamente. ¡Ya tienes notificaciones nativas!',
      },
      token: profile.notification_token,
    };
    const response = await admin.messaging().send(mensaje);
    console.log('🚀 ¡Notificación enviada con éxito!', response);
    res.json({ success: true, message: '¡Notificación enviada!' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/user/export', ensureAuthenticated, async (req, res) => {
  try {
    const [{ data: profile }, { data: kanban }, { data: pomodoros }, { data: decks }, { data: cards }] = await Promise.all([
      req.supabase.from('profiles').select('id, username, created_at').eq('id', req.user.id).single(),
      req.supabase.from('kanban_tasks').select('*'),
      req.supabase.from('pomodoro_sessions').select('*'),
      req.supabase.from('decks').select('*'),
      req.supabase.from('cards').select('*'),
    ]);
    res.json({
      user: { ...profile, email: req.user.email },
      kanban, pomodoros, decks, cards,
      exportedAt: new Date().toISOString(),
    });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.delete('/api/user/data', ensureAuthenticated, async (req, res) => {
  try {
    await req.supabase.from('kanban_tasks').delete().eq('user_id', req.user.id);
    await req.supabase.from('pomodoro_sessions').delete().eq('user_id', req.user.id);
    await req.supabase.from('decks').delete().eq('user_id', req.user.id);   // arrastra las cards
    await req.supabase.from('folders').delete().eq('user_id', req.user.id);
    await req.supabase.from('profiles').update({
      points: 0, streak: 0, today_seconds: 0, today_points: 0, kanban_onboarded: false,
    }).eq('id', req.user.id);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.delete('/api/user/account', ensureAuthenticated, async (req, res) => {
  const { password } = req.body;
  try {
    const hasLocalPassword = req.user.app_metadata?.provider === 'email';
    if (hasLocalPassword) {
      if (!password) return res.status(400).json({ error: 'Introduce tu contraseña para confirmar.' });
      // Reautenticamos con un cliente aparte para no pisar la sesión activa.
      const check = createUserClient();
      const { error: signErr } = await check.auth.signInWithPassword({ email: req.user.email, password });
      if (signErr) return res.status(401).json({ error: 'Contraseña incorrecta.' });
    }

    await req.supabase.from('kanban_tasks').delete().eq('user_id', req.user.id);
    await req.supabase.from('pomodoro_sessions').delete().eq('user_id', req.user.id);
    await req.supabase.from('decks').delete().eq('user_id', req.user.id);
    await req.supabase.from('folders').delete().eq('user_id', req.user.id);

    if (!supabaseAdmin) throw new Error('Falta SUPABASE_SERVICE_ROLE_KEY en el .env para poder borrar la cuenta.');
    // Borra el usuario de auth.users; el profile se borra solo por el
    // ON DELETE CASCADE que pusimos en la tabla profiles.
    const { error: delErr } = await supabaseAdmin.auth.admin.deleteUser(req.user.id);
    if (delErr) throw delErr;

    req.session.destroy(() => {
      res.clearCookie('connect.sid');
      res.json({ success: true });
    });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ⏰ RELOJ DE RECORDATORIOS
// ============================================================
// Usa supabaseAdmin porque necesita leer tareas de TODOS los usuarios,
// no de uno solo — algo que RLS no permitiría con el cliente normal.
//
// Esto vive en una función aparte (comprobarRecordatorios) para poder
// dispararla de DOS formas a la vez:
//   1) El cron interno de abajo (node-cron), que solo funciona mientras
//      el proceso está despierto.
//   2) La ruta GET /api/cron/recordatorios, para que un servicio externo
//      gratuito (cron-job.org, UptimeRobot...) la llame cada minuto y
//      así los recordatorios sigan funcionando aunque Render (plan free)
//      haya dormido el servicio por falta de tráfico.
async function comprobarRecordatorios() {
  try {
    const ahora = new Date();
    const enDiez = new Date(ahora.getTime() + 10 * 60 * 1000);

    // Ambas cosas en hora de España — así coincide con lo que
    // el usuario escribió en el formulario (que es hora local, no UTC).
    const horaObjetivo = enDiez.toLocaleTimeString('en-GB', {
      timeZone: 'Europe/Madrid',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    });

    const hoyISO = ahora.toLocaleDateString('en-CA', { timeZone: 'Europe/Madrid' });
    // (esto reemplaza también la vuelta rara por new Date(...).toISOString() de antes,
    // que era innecesaria y podía romperse si el navegador/motor JS no ubica el TZ bien)

    if (!supabaseAdmin) return;
    // ... el resto del bloque sigue igual desde aquí 

    // OJO: nunca metas un operando vacío en el .or() (p.ej. "fecha.eq.,"),
    // Postgres intenta convertir esa cadena vacía al tipo de la columna
    // (date) y revienta con el error 22007. "fecha.is.null" ya cubre
    // el caso de tareas sin fecha límite, no hace falta nada más.
    const { data: tareas, error } = await supabaseAdmin
      .from('kanban_tasks')
      .select('id, user_id, titulo, asignatura, hora, fecha, columna')
      .eq('hora', horaObjetivo)
      .neq('columna', 'terminada')
      .or(`fecha.is.null,fecha.eq.${hoyISO}`);
    if (error) throw error;
    if (!tareas || tareas.length === 0) return;

    const userIds = [...new Set(tareas.map(t => t.user_id))];
    const { data: profiles, error: profErr } = await supabaseAdmin
      .from('profiles')
      .select('id, username, notification_token')
      .in('id', userIds)
      .not('notification_token', 'is', null);
    if (profErr) throw profErr;

    const profileMap = new Map(profiles.map(p => [p.id, p]));
    console.log(`🔔 [Recordatorios] Objetivo ${horaObjetivo} (España). Revisando ${tareas.length} tarea(s)...`);

    for (const tarea of tareas) {
      const profile = profileMap.get(tarea.user_id);
      if (!profile) continue; // usuario sin token registrado

      const mensaje = {
        notification: {
          title: `⏰ En 10 minutos — ${tarea.titulo}`,
          body:  `${tarea.asignatura ? tarea.asignatura + ' · ' : ''}Empieza a las ${tarea.hora}. ¡Prepárate!`,
        },
        token: profile.notification_token,
      };

      try {
        await admin.messaging().send(mensaje);
        console.log(`  ✅ Aviso a ${profile.username} → "${tarea.titulo}" (${tarea.hora})`);
      } catch (errEnvio) {
        if (errEnvio.code === 'messaging/registration-token-not-registered') {
          await supabaseAdmin.from('profiles').update({ notification_token: null }).eq('id', tarea.user_id);
          console.warn(`  ⚠️ Token inválido para ${profile.username}, eliminado.`);
        } else {
          console.error(`  ❌ Error al notificar a ${profile.username}:`, errEnvio.message);
        }
      }
    }
  } catch (error) {
    console.error('Error en el reloj de recordatorios:', error);
  }
}

// ⏰ RELOJ DE RECORDATORIOS DEL CALENDARIO
// ============================================================
// Igual que comprobarRecordatorios() pero para los eventos del calendario
// (tabla calendar_reminders). Se ejecuta cada minuto y compara la hora
// ACTUAL (no +10 min, aquí el usuario elige la hora exacta del aviso)
// contra reminder_time, en hora de España.
//
//   - reminder_mode = 'same_day' → solo dispara si event_date es HOY.
//   - reminder_mode = 'daily'    → dispara todos los días desde hoy hasta
//                                   (e incluyendo) event_date.
//
// `last_notified_date` evita mandar el mismo aviso más de una vez el
// mismo día (el cron pasa cada minuto, así que sin esto se duplicaría
// mientras el reloj marque esa hora).
async function comprobarRecordatoriosCalendario() {
  try {
    if (!supabaseAdmin) return;

    const ahora = new Date();
    const horaActual = ahora.toLocaleTimeString('en-GB', {
      timeZone: 'Europe/Madrid',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    });
    const hoyISO = ahora.toLocaleDateString('en-CA', { timeZone: 'Europe/Madrid' });

    const { data: recordatorios, error } = await supabaseAdmin
      .from('calendar_reminders')
      .select('id, user_id, label, type, event_date, reminder_time, reminder_mode, last_notified_date')
      .eq('reminder_time', horaActual)
      .or(`last_notified_date.is.null,last_notified_date.neq.${hoyISO}`)
      .or(`and(reminder_mode.eq.same_day,event_date.eq.${hoyISO}),and(reminder_mode.eq.daily,event_date.gte.${hoyISO})`);

    if (error) throw error;
    if (!recordatorios || recordatorios.length === 0) return;

    const userIds = [...new Set(recordatorios.map(r => r.user_id))];
    const { data: profiles, error: profErr } = await supabaseAdmin
      .from('profiles')
      .select('id, username, notification_token')
      .in('id', userIds)
      .not('notification_token', 'is', null);
    if (profErr) throw profErr;

    const profileMap = new Map(profiles.map(p => [p.id, p]));
    console.log(`🔔 [Recordatorios calendario] Objetivo ${horaActual} (España). Revisando ${recordatorios.length} recordatorio(s)...`);

    for (const rec of recordatorios) {
      const profile = profileMap.get(rec.user_id);
      if (!profile) continue; // usuario sin token registrado

      const esHoyElEvento = rec.event_date === hoyISO;
      const mensaje = {
        notification: {
          title: esHoyElEvento ? `📅 Hoy — ${rec.label}` : `⏰ Recordatorio — ${rec.label}`,
          body:  esHoyElEvento
            ? `${rec.type === 'exam' ? 'Examen' : 'Evento'} hoy. ¡No lo olvides!`
            : `${rec.type === 'exam' ? 'Examen' : 'Evento'} el ${rec.event_date}.`,
        },
        token: profile.notification_token,
      };

      try {
        await admin.messaging().send(mensaje);
        console.log(`  ✅ Aviso a ${profile.username} → "${rec.label}" (${rec.reminder_mode})`);
      } catch (errEnvio) {
        if (errEnvio.code === 'messaging/registration-token-not-registered') {
          await supabaseAdmin.from('profiles').update({ notification_token: null }).eq('id', rec.user_id);
          console.warn(`  ⚠️ Token inválido para ${profile.username}, eliminado.`);
        } else {
          console.error(`  ❌ Error al notificar a ${profile.username}:`, errEnvio.message);
        }
      }

      // Marcamos el aviso de hoy como hecho. Si era "same_day" ya no hace
      // falta la fila (solo se avisa una vez), así que la borramos; si
      // era "daily" la dejamos para que vuelva a saltar mañana.
      if (rec.reminder_mode === 'same_day') {
        await supabaseAdmin.from('calendar_reminders').delete().eq('id', rec.id);
      } else {
        await supabaseAdmin.from('calendar_reminders').update({ last_notified_date: hoyISO }).eq('id', rec.id);
      }
    }
  } catch (error) {
    console.error('Error en el reloj de recordatorios del calendario:', error);
  }
}

// Cron interno: sigue funcionando solo mientras el proceso está despierto.
cron.schedule('* * * * *', comprobarRecordatorios);
cron.schedule('* * * * *', comprobarRecordatoriosCalendario);

// Ruta para que un pinger externo gratuito (cron-job.org, UptimeRobot...)
// dispare la comprobación cada minuto desde fuera, y de paso mantenga el
// servicio despierto en el plan free de Render. No requiere login: la
// protegemos con una clave simple en la query para que no la dispare
// cualquiera. Pon CRON_SECRET en tus variables de entorno.
app.get('/api/cron/recordatorios', async (req, res) => {
  if (req.query.key !== process.env.CRON_SECRET) {
    return res.status(401).json({ error: 'No autorizado' });
  }
  await comprobarRecordatorios();
  await comprobarRecordatoriosCalendario();
  res.json({ success: true, checkedAt: new Date().toISOString() });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 WikiStudent en http://localhost:${PORT}`));