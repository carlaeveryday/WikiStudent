'use strict';

// supabase-js necesita un "storage" para guardar el code_verifier de PKCE
// entre la petición que inicia el login con Google y la petición del
// callback. En el navegador usaría localStorage; aquí, como todo pasa por
// el servidor, lo guardamos en la sesión de Express (que ya tienes montada
// con express-session). Debe sobrevivir exactamente esas dos peticiones.
function sessionStorageAdapter(req) {
  return {
    getItem: (key) => req.session.supabaseAuthStorage?.[key] ?? null,
    setItem: (key, value) => {
      if (!req.session.supabaseAuthStorage) req.session.supabaseAuthStorage = {};
      req.session.supabaseAuthStorage[key] = value;
    },
    removeItem: (key) => {
      if (req.session.supabaseAuthStorage) delete req.session.supabaseAuthStorage[key];
    },
  };
}

module.exports = { sessionStorageAdapter };
