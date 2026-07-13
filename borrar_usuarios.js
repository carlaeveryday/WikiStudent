const db = require('better-sqlite3')('flashcards.db');
db.prepare('DELETE FROM users').run();
db.prepare("DELETE FROM sqlite_sequence WHERE name='users'").run();
console.log('✅ Usuarios borrados correctamente');
