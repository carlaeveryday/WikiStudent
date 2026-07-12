const express = require('express');
const Database = require('better-sqlite3');
const path = require('path');

const app = express();
const db = new Database('quizzes.db'); 
const PORT = 3000;

app.use(express.json());
app.use(express.static('.'));

// Configuración de Tablas con created_at para evitar errores de carga
db.exec(`
  CREATE TABLE IF NOT EXISTS folders (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    user_id TEXT NOT NULL,
    parent_id INTEGER DEFAULT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS decks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    user_id TEXT NOT NULL,
    folder_id INTEGER DEFAULT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS cards (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT NOT NULL,
    deck_id INTEGER NOT NULL,
    question TEXT NOT NULL,
    answer TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (deck_id) REFERENCES decks(id)
  );
`);

console.log("✅ Base de datos de quizzes configurada correctamente.");

/* --- RUTAS DE CARPETAS --- */
app.get('/folders/:userId', (req, res) => {
    const { userId } = req.params;
    const { level, parent_id } = req.query;
    try {
        let folders;
        if (level === 'children') {
            folders = (parent_id === undefined || parent_id === 'null')
                ? db.prepare('SELECT * FROM folders WHERE user_id = ? AND parent_id IS NULL ORDER BY created_at ASC').all(userId)
                : db.prepare('SELECT * FROM folders WHERE user_id = ? AND parent_id = ? ORDER BY created_at ASC').all(userId, parent_id);
        } else {
            folders = db.prepare('SELECT * FROM folders WHERE user_id = ? ORDER BY name ASC').all(userId);
        }
        res.json(folders);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/folders', (req, res) => {
    const { user_id, name, parent_id = null } = req.body;
    const info = db.prepare('INSERT INTO folders (user_id, name, parent_id) VALUES (?, ?, ?)').run(user_id, name, parent_id);
    res.json(db.prepare('SELECT * FROM folders WHERE id = ?').get(info.lastInsertRowid));
});

app.patch('/folders/:id', (req, res) => {
    const { name, parent_id } = req.body;
    if (name !== undefined) db.prepare('UPDATE folders SET name = ? WHERE id = ?').run(name, req.params.id);
    if (parent_id !== undefined) db.prepare('UPDATE folders SET parent_id = ? WHERE id = ?').run(parent_id, req.params.id);
    res.json(db.prepare('SELECT * FROM folders WHERE id = ?').get(req.params.id));
});

app.delete('/folders/:id', (req, res) => {
    db.prepare('DELETE FROM cards WHERE deck_id IN (SELECT id FROM decks WHERE folder_id = ?)').run(req.params.id);
    db.prepare('DELETE FROM decks WHERE folder_id = ?').run(req.params.id);
    db.prepare('DELETE FROM folders WHERE id = ?').run(req.params.id);
    res.json({ success: true });
});

/* --- RUTAS DE MAZOS --- */
app.get('/decks/:userId', (req, res) => {
    const { userId } = req.params;
    const { folder_id } = req.query;
    const decks = (folder_id === undefined || folder_id === 'null')
        ? db.prepare('SELECT * FROM decks WHERE user_id = ? AND folder_id IS NULL ORDER BY created_at ASC').all(userId)
        : db.prepare('SELECT * FROM decks WHERE user_id = ? AND folder_id = ? ORDER BY created_at ASC').all(userId, folder_id);
    res.json(decks);
});

app.post('/decks', (req, res) => {
    const { user_id, name, folder_id = null } = req.body;
    const info = db.prepare('INSERT INTO decks (user_id, name, folder_id) VALUES (?, ?, ?)').run(user_id, name, folder_id);
    res.json(db.prepare('SELECT * FROM decks WHERE id = ?').get(info.lastInsertRowid));
});

app.patch('/decks/:id', (req, res) => {
    const { name, folder_id } = req.body;
    if (name !== undefined) db.prepare('UPDATE decks SET name = ? WHERE id = ?').run(name, req.params.id);
    if (folder_id !== undefined) db.prepare('UPDATE decks SET folder_id = ? WHERE id = ?').run(folder_id, req.params.id);
    res.json(db.prepare('SELECT * FROM decks WHERE id = ?').get(req.params.id));
});

app.delete('/decks/:id', (req, res) => {
    db.prepare('DELETE FROM cards WHERE deck_id = ?').run(req.params.id);
    db.prepare('DELETE FROM decks WHERE id = ?').run(req.params.id);
    res.json({ success: true });
});

/* --- RUTA DE NOMBRES (para duplicar) --- */
app.get('/names/:userId', (req, res) => {
    const { table, pattern } = req.query;
    if (!['folders', 'decks'].includes(table)) return res.status(400).json({ error: 'Invalid table' });
    const rows = db.prepare(`SELECT name FROM ${table} WHERE user_id = ? AND name LIKE ?`).all(req.params.userId, `${pattern}%`);
    res.json(rows);
});

/* --- RUTAS DE TARJETAS --- */
app.get('/cards/deck/:deckId', (req, res) => {
    const cards = db.prepare('SELECT * FROM cards WHERE deck_id = ? ORDER BY id ASC').all(req.params.deckId);
    res.json(cards);
});

app.put('/cards/deck/:deckId', (req, res) => {
    const { user_id, cards } = req.body;
    const deckId = req.params.deckId;
    const transaction = db.transaction((rows) => {
        db.prepare('DELETE FROM cards WHERE deck_id = ?').run(deckId);
        const insert = db.prepare('INSERT INTO cards (user_id, deck_id, question, answer) VALUES (?, ?, ?, ?)');
        for (const c of rows) insert.run(user_id, deckId, c.q, c.a);
    });
    transaction(cards);
    res.json({ success: true });
});

/* --- RUTAS DE CONTEO (Evitan el pantallazo blanco) --- */
app.get('/count/decks-in-folder/:folderId', (req, res) => {
    const row = db.prepare('SELECT COUNT(*) as count FROM decks WHERE folder_id = ?').get(req.params.folderId);
    res.json({ count: row ? row.count : 0 });
});

app.get('/count/subfolders-in-folder/:folderId', (req, res) => {
    const row = db.prepare('SELECT COUNT(*) as count FROM folders WHERE parent_id = ?').get(req.params.folderId);
    res.json({ count: row ? row.count : 0 });
});

app.get('/count/cards-in-deck/:deckId', (req, res) => {
    const row = db.prepare('SELECT COUNT(*) as count FROM cards WHERE deck_id = ?').get(req.params.deckId);
    res.json({ count: row ? row.count : 0 });
});

app.listen(PORT, () => console.log(`🚀 Servidor en http://localhost:${PORT}`));