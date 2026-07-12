// ============================================================
// WikiStudent — routes/auth.js (MIGRADO A SUPABASE AUTH)
// ============================================================

'use strict';

const express      = require('express');
const { createClient } = require('@supabase/supabase-js');
const router        = express.Router();

const { supabaseAdmin, createUserClient } = require('../lib/supabase');
const { sessionStorageAdapter } = require('../lib/pkceSessionStorage');

// URL pública de tu app. En local es localhost:3000; en producción,
// añade APP_URL=https://tu-dominio.com a las variables de entorno.
const APP_URL = process.env.APP_URL || 'http://localhost:3000';

// ── Validación de registro (igual que antes) ──────────────────────────────
function validateRegister(body) {
  const { username, email, password, gender, date_of_birth, accept_terms } = body;

  if (!username || username.trim().length < 3)
    return 'El nombre de usuario debe tener al menos 3 caracteres.';
  if (!/^[a-zA-Z0-9_]+$/.test(username))
    return 'El usuario solo puede contener letras, números y guión bajo.';
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
    return 'Introduce un correo electrónico válido.';
  if (!password || password.length < 8)
    return 'La contraseña debe tener al menos 8 caracteres.';
  if (!gender || !['male', 'female', 'non_binary', 'prefer_not'].includes(gender))
    return 'Selecciona un género válido.';
  if (!date_of_birth)
    return 'Introduce tu fecha de nacimiento.';

  const dob = new Date(date_of_birth);
  const minAge = new Date();
  minAge.setFullYear(minAge.getFullYear() - 13);
  if (dob > minAge)
    return 'Debes tener al menos 13 años para registrarte.';
  if (!accept_terms)
    return 'Debes aceptar los Términos de uso y Cookies.';

  return null;
}

function redirectIfAuthenticated(req, res, next) {
  if (req.user) return res.redirect('/web');
  next();
}

// Mensajes de Supabase traducidos a algo legible para el usuario.
function friendlyAuthError(error) {
  const msg = error?.message || '';
  if (msg.includes('Email not confirmed')) return 'Debes verificar tu correo antes de entrar. Revisa tu bandeja de entrada.';
  if (msg.includes('Invalid login credentials')) return 'Correo o contraseña incorrectos.';
  if (msg.includes('Password should be at least')) return 'La contraseña es demasiado corta.';
  return msg || 'Error interno. Inténtalo de nuevo.';
}

// ══════════════════════════════════════════════════════════════
// GOOGLE OAUTH
// ══════════════════════════════════════════════════════════════

// GET /auth/google — arranca el flujo: pedimos a Supabase la URL de Google
// y redirigimos al navegador allí. skipBrowserRedirect:true evita que
// supabase-js intente hacer el redirect él mismo (eso es cosa del browser,
// no de Node) y nos deja hacerlo nosotros con res.redirect.
router.get('/google', redirectIfAuthenticated, async (req, res) => {
  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY, {
    auth: {
      storage:           sessionStorageAdapter(req),
      persistSession:    true,
      autoRefreshToken:  false,
      flowType:          'pkce',
    },
  });

  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo:         `${APP_URL}/auth/google/callback`,
      skipBrowserRedirect: true,
      scopes:              'email profile',
    },
  });

  if (error || !data?.url) {
    return res.redirect('/?auth_error=google');
  }

  req.session.save(() => res.redirect(data.url));
});

// GET /auth/google/callback — Supabase nos devuelve aquí con ?code=...
// Intercambiamos ese código (usando el mismo code_verifier que guardamos
// en el paso anterior) por una sesión real de Supabase.
router.get('/google/callback', async (req, res) => {
  const { code, error: oauthError } = req.query;
  if (oauthError || !code) return res.redirect('/?auth_error=google');

  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY, {
    auth: {
      storage:           sessionStorageAdapter(req),
      persistSession:    true,
      autoRefreshToken:  false,
      flowType:          'pkce',
    },
  });

  const { data, error } = await supabase.auth.exchangeCodeForSession(code);
  if (error || !data?.session) return res.redirect('/?auth_error=google');

  req.session.supabaseSession = {
    access_token:  data.session.access_token,
    refresh_token: data.session.refresh_token,
  };
  delete req.session.supabaseAuthStorage; // ya no hace falta el code_verifier temporal

  req.session.save((err) => {
    if (err) console.error('❌ session.save:', err);
    res.redirect('/web');
  });
});

// ══════════════════════════════════════════════════════════════
// REGISTRO / LOGIN LOCAL
// ══════════════════════════════════════════════════════════════

// POST /auth/register
router.post('/register', redirectIfAuthenticated, async (req, res) => {
  const { username, email, password, gender, date_of_birth, notifications } = req.body;

  const validationError = validateRegister(req.body);
  if (validationError) {
    return res.render('index', { user: null, error: validationError, activeTab: 'register', info: null });
  }

  const trimmedUsername = username.trim();
  const normalizedEmail = email.toLowerCase().trim();

  try {
    // Comprobar username antes de crear la cuenta (el email lo valida Supabase él solo).
    const { data: usernameTaken } = await supabaseAdmin
      .from('profiles').select('id').eq('username', trimmedUsername).maybeSingle();
    if (usernameTaken) {
      return res.render('index', { user: null, error: 'Ese nombre de usuario ya está en uso.', activeTab: 'register', info: null });
    }

    const supabase = createUserClient();
    const { data, error } = await supabase.auth.signUp({
      email:    normalizedEmail,
      password,
      options: {
        emailRedirectTo: `${APP_URL}/auth/callback`,
        data: { username: trimmedUsername }, // lo lee el trigger handle_new_user en Postgres
      },
    });

    if (error) {
      return res.render('index', { user: null, error: friendlyAuthError(error), activeTab: 'register', info: null });
    }

    // Supabase no da error si el email ya existe (para no filtrar qué
    // correos están registrados) — en su lugar devuelve un user con
    // identities vacío. Así detectamos el duplicado.
    if (data.user && Array.isArray(data.user.identities) && data.user.identities.length === 0) {
      return res.render('index', { user: null, error: 'Ya existe una cuenta con ese correo.', activeTab: 'register', info: null });
    }

    // Completar el perfil con los datos que el trigger no conoce
    // (el trigger solo pone username y perfil_completado).
    if (data.user) {
      await supabaseAdmin.from('profiles').update({
        gender,
        date_of_birth,
        notifications: notifications === '1',
      }).eq('id', data.user.id);
    }

    return res.render('index', {
      user:      null,
      error:     null,
      activeTab: null,
      info:      '¡Registro completado! Revisa tu correo para verificar tu cuenta.',
    });

  } catch (err) {
    console.error('[auth/register] ❌', err);
    res.render('index', { user: null, error: 'Error interno. Inténtalo de nuevo.', activeTab: 'register', info: null });
  }
});

// POST /auth/login
router.post('/login', redirectIfAuthenticated, async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.render('index', { user: null, error: 'Correo o contraseña incorrectos.', activeTab: 'login', info: null });
  }

  try {
    const supabase = createUserClient();
    const { data, error } = await supabase.auth.signInWithPassword({
      email: email.toLowerCase().trim(),
      password,
    });

    if (error) {
      return res.render('index', { user: null, error: friendlyAuthError(error), activeTab: 'login', info: null });
    }

    req.session.supabaseSession = {
      access_token:  data.session.access_token,
      refresh_token: data.session.refresh_token,
    };
    req.session.save(() => res.redirect('/web'));

  } catch (err) {
    console.error('[auth/login] ❌', err);
    res.render('index', { user: null, error: 'Error interno.', activeTab: 'login', info: null });
  }
});

// GET /auth/logout
router.get('/logout', async (req, res) => {
  try {
    if (req.supabase) await req.supabase.auth.signOut();
  } catch (_) {}
  req.session.destroy(() => {
    res.clearCookie('connect.sid');
    res.redirect('/');
  });
});

// ══════════════════════════════════════════════════════════════
// GET /auth/callback — aterrizaje de los enlaces que manda Supabase por
// email (confirmación de registro, cambio de email, recuperación de
// contraseña). Supabase entrega el access_token/refresh_token en el
// FRAGMENTO de la URL (después de #), que solo el navegador puede leer
// — por eso esta página tiene un pequeño script que los coge y se los
// manda a nuestro servidor para guardarlos en la sesión.
// ══════════════════════════════════════════════════════════════
router.get('/callback', (req, res) => {
  res.send(`<!DOCTYPE html>
<html lang="es">
<head><meta charset="UTF-8"><title>Confirmando…</title></head>
<body style="font-family:sans-serif;background:#0d1117;color:#fff;display:flex;align-items:center;justify-content:center;height:100vh;margin:0">
  <p>Confirmando tu cuenta, un segundo…</p>
  <script>
    (async () => {
      const params = new URLSearchParams(window.location.hash.slice(1));
      const access_token  = params.get('access_token');
      const refresh_token = params.get('refresh_token');

      if (!access_token || !refresh_token) {
        window.location.href = '/?auth_error=confirm';
        return;
      }

      try {
        const res = await fetch('/auth/session', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ access_token, refresh_token }),
        });
        const json = await res.json();
        window.location.href = json.success ? '/web' : '/?auth_error=confirm';
      } catch (e) {
        window.location.href = '/?auth_error=confirm';
      }
    })();
  </script>
</body>
</html>`);
});

// POST /auth/session — guarda en la sesión de Express los tokens que nos
// mandó la página de arriba, tras comprobar que son válidos.
router.post('/session', async (req, res) => {
  const { access_token, refresh_token } = req.body;
  if (!access_token || !refresh_token) return res.status(400).json({ success: false });

  try {
    const supabase = createUserClient();
    const { data, error } = await supabase.auth.setSession({ access_token, refresh_token });
    if (error || !data.session) return res.status(401).json({ success: false });

    req.session.supabaseSession = {
      access_token:  data.session.access_token,
      refresh_token: data.session.refresh_token,
    };
    req.session.save((err) => {
      if (err) return res.status(500).json({ success: false });
      res.json({ success: true });
    });
  } catch (err) {
    res.status(500).json({ success: false });
  }
});

// ══════════════════════════════════════════════════════════════
// ONBOARDING — elegir username tras entrar con Google
// ══════════════════════════════════════════════════════════════

function requireOnboarding(req, res, next) {
  if (req.user.perfil_completado) return next();
  res.redirect('/auth/onboarding');
}

router.get('/onboarding', (req, res) => {
  if (!req.user) return res.redirect('/');
  if (req.user.perfil_completado) return res.redirect('/web');
  res.render('onboarding', { user: req.user });
});

router.get('/check-username', async (req, res) => {
  if (!req.user) return res.status(401).json({ error: 'No autenticado.' });

  const { username } = req.query;
  if (!username || username.length < 3 || username.length > 30) return res.json({ available: false });

  const VALID_CHARS = /^[a-zA-Z0-9_.\-]+$/;
  if (!VALID_CHARS.test(username)) return res.json({ available: false });

  try {
    const { data: existing } = await req.supabase
      .from('profiles').select('id').eq('username', username).neq('id', req.user.id).maybeSingle();
    res.json({ available: !existing });
  } catch (err) {
    console.error('check-username error:', err);
    res.status(500).json({ error: err.message });
  }
});

router.patch('/onboarding', async (req, res) => {
  if (!req.user) return res.status(401).json({ error: 'No autenticado.' });

  const { username } = req.body;
  if (!username || typeof username !== 'string') {
    return res.status(400).json({ error: 'Nombre de usuario requerido.' });
  }

  const trimmed = username.trim();
  if (trimmed.length < 3 || trimmed.length > 30) {
    return res.status(400).json({ error: 'El nombre debe tener entre 3 y 30 caracteres.' });
  }
  const VALID_CHARS = /^[a-zA-Z0-9_.\-]+$/;
  if (!VALID_CHARS.test(trimmed)) {
    return res.status(400).json({ error: 'Solo se permiten letras, números, guiones y puntos.' });
  }

  try {
    const { data: existing } = await req.supabase
      .from('profiles').select('id').eq('username', trimmed).neq('id', req.user.id).maybeSingle();
    if (existing) return res.status(409).json({ error: 'Ese nombre ya está en uso. Prueba otro.' });

    const { error } = await req.supabase
      .from('profiles').update({ username: trimmed, perfil_completado: true }).eq('id', req.user.id);
    if (error) throw error;

    console.log(`✅ Onboarding completado: usuario ${req.user.id} → "${trimmed}"`);
    res.json({ success: true, username: trimmed });
  } catch (err) {
    console.error('Error en PATCH /auth/onboarding:', err);
    res.status(500).json({ error: 'Error interno. Inténtalo de nuevo.' });
  }
});

module.exports = router;
module.exports.requireOnboarding = requireOnboarding;