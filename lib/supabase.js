'use strict';

const { createClient } = require('@supabase/supabase-js');

if (!process.env.SUPABASE_URL || !process.env.SUPABASE_ANON_KEY) {
  throw new Error('Faltan SUPABASE_URL / SUPABASE_ANON_KEY en tu .env');
}

// ── Cliente ADMIN (service role) ──────────────────────────────────────────
// Salta la Row Level Security. SOLO se usa en tareas de servidor que no
// pertenecen a un usuario concreto: el cron de recordatorios y el borrado
// de la cuenta en auth.users (eso requiere privilegios de admin).
// Esta key NUNCA debe llegar al navegador.
const supabaseAdmin = process.env.SUPABASE_SERVICE_ROLE_KEY
  ? createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    })
  : null;

// ── Cliente por usuario ────────────────────────────────────────────────────
// Se crea "vacío" con la anon key y luego, en cada request, se le inyecta
// la sesión del usuario (access_token/refresh_token) con auth.setSession().
// Así las políticas RLS actúan exactamente como ese usuario: cada query
// respeta "auth.uid() = user_id" automáticamente, sin que tengamos que
// añadir WHERE user_id = ? a mano como hacíamos con SQLite.
function createUserClient() {
  return createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

module.exports = { supabaseAdmin, createUserClient };
