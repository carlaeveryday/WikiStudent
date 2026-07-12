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
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
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

// ── 10. API: KANBAN ───────────────────────────────────────────────────────────
app.get('/api/kanban', ensureAuthenticated, async (req, res) => {
  try {
    const { data: tasks, error } = await req.supabase
      .from('kanban_tasks').select('*').order('columna', { ascending: true }).order('orden', { ascending: true });
    if (error) throw error;

    if (!req.user.kanban_onboarded) {
      const defaults = [
        { titulo: 'Integrales — Tema 5',   asignatura: 'Matemáticas II',     hora: '09:00', urgencia: 'urgente', fecha: null, columna: 'staging', orden: 0 },
        { titulo: 'Problemas de óptica',   asignatura: 'Física',             hora: '11:30', urgencia: 'media',   fecha: null, columna: 'staging', orden: 1 },
        { titulo: 'Transición democrática', asignatura: 'Historia de España', hora: '16:00', urgencia: 'baja',    fecha: null, columna: 'staging', orden: 2 },
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
  const { titulo, asignatura = '', hora = '', urgencia = 'baja', fecha = null, columna = 'staging', orden = 0 } = req.body;
  if (!titulo) return res.status(400).json({ error: 'titulo requerido' });
  const { data, error } = await req.supabase
    .from('kanban_tasks')
    .insert({ user_id: req.user.id, titulo, asignatura, hora, urgencia, fecha, columna, orden })
    .select()
    .single();
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

app.patch('/api/kanban/:id', ensureAuthenticated, async (req, res) => {
  const { data: existing } = await req.supabase.from('kanban_tasks').select('id').eq('id', req.params.id).single();
  if (!existing) return res.status(403).json({ error: 'Acceso denegado' });

  const fields = ['titulo', 'asignatura', 'hora', 'urgencia', 'fecha', 'columna', 'orden'];
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
app.get('/api/ranking', ensureAuthenticated, async (req, res) => {
  const { data, error } = await req.supabase
    .from('profiles').select('id, username, points, streak').order('points', { ascending: false }).limit(6);
  if (error) return res.status(500).json({ error: error.message });
  res.json({ users: data, currentUserId: req.user.id });
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

    const { data: users, error: rankErr } = await req.supabase
      .from('profiles').select('id, username, points, streak').order('points', { ascending: false }).limit(6);
    if (rankErr) throw rankErr;

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
    const enQuince = new Date(ahora.getTime() + 15 * 60 * 1000);
    const hh = String(enQuince.getUTCHours()).padStart(2, '0');
    const mm = String(enQuince.getUTCMinutes()).padStart(2, '0');
    const horaObjetivo = `${hh}:${mm}`;

    const hoyISO = new Date(
      ahora.toLocaleString('en-CA', { timeZone: 'Europe/Madrid' }).slice(0, 10)
    ).toISOString().slice(0, 10);

    if (!supabaseAdmin) return; // sin service role key no podemos hacer el barrido global

    const { data: tareas, error } = await supabaseAdmin
      .from('kanban_tasks')
      .select('id, user_id, titulo, asignatura, hora, fecha, columna')
      .eq('hora', horaObjetivo)
      .neq('columna', 'terminada')
      .or(`fecha.is.null,fecha.eq.,fecha.eq.${hoyISO}`);
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
          title: `⏰ En 15 minutos — ${tarea.titulo}`,
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

// Cron interno: sigue funcionando solo mientras el proceso está despierto.
cron.schedule('* * * * *', comprobarRecordatorios);

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
  res.json({ success: true, checkedAt: new Date().toISOString() });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 WikiStudent en http://localhost:${PORT}`));