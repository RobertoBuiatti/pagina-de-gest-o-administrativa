const path = require('path');
const fs = require('fs');
const Database = require('better-sqlite3');

const dbPath = path.join(__dirname, '..', 'data.sqlite');
let dbInstance = null;

function getDb() {
  if (!dbInstance) {
    try {
      dbInstance = new Database(dbPath);
      dbInstance.pragma('journal_mode = WAL'); // Enable Write-Ahead Logging for better concurrency
    } catch (error) {
      console.error('Error initializing database:', error);
      throw new Error('Failed to initialize database.');
    }
  }
  return dbInstance;
}

function reinitializeDb() {
  if (dbInstance) {
    dbInstance.close();
    dbInstance = null;
  }
  return getDb();
}

// Função de migração
function migrate() {
  const db = getDb(); // Get the current db instance
  // Cria a tabela de migrações se não existir
  db.exec(`
    CREATE TABLE IF NOT EXISTS migrations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      created_at TEXT DEFAULT (datetime('now'))
    );
  `);

  // Busca as migrações já aplicadas
  const appliedMigrations = db.prepare('SELECT name FROM migrations').all().map(row => row.name);

  // Lê os arquivos de migração
  const migrationsDir = path.join(__dirname, '..', 'migrations');
  const migrationFiles = fs.readdirSync(migrationsDir).filter(file => file.endsWith('.sql')).sort();

  // Aplica as migrações pendentes
  for (const file of migrationFiles) {
    if (!appliedMigrations.includes(file)) {
      console.log(`Aplicando migração: ${file}`);
      const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf8');
      db.exec(sql);
      db.prepare('INSERT INTO migrations (name) VALUES (?)').run(file);
    }
  }
}

module.exports = { getDb, reinitializeDb, migrate };
