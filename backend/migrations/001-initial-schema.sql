
-- 001-initial-schema.sql
CREATE TABLE IF NOT EXISTS extractions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  text TEXT,
  fields TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS transactions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  amount REAL,
  date TEXT,
  category TEXT,
  description TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);
