const Database = require('better-sqlite3');
// Aquí es donde se crea el archivo. Se llamará 'pomodoro.db' 
// y aparecerá al lado de tu index.html
const db = new Database('pomodoro.db'); 

db.exec(`
  CREATE TABLE IF NOT EXISTS sesiones (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    tarea TEXT,
    duracion INTEGER,
    fecha DATETIME DEFAULT CURRENT_TIMESTAMP
  )
`);

console.log("¡Listo! Mira en tu carpeta WikiStudentweb, ha aparecido un archivo nuevo.");

db.exec(`
  CREATE TABLE IF NOT EXISTS folders (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT NOT NULL, -- Para saber de quién es la carpeta
    name TEXT NOT NULL,
    parent_id INTEGER DEFAULT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS decks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT NOT NULL, -- Para saber de quién es el mazo
    folder_id INTEGER,
    name TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (folder_id) REFERENCES folders(id)
  );

  CREATE TABLE IF NOT EXISTS cards (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT NOT NULL, -- Para saber de quién es la carta
    deck_id INTEGER,
    question TEXT NOT NULL,
    answer TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (deck_id) REFERENCES decks(id)
  );
`);
