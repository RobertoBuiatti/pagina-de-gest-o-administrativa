const { getDb } = require('../database');

function createTransaction(req, res) {
  const db = getDb();
  const { amount, date, category, description } = req.body || {};
  const stmt = db.prepare('INSERT INTO transactions (amount, date, category, description) VALUES (?, ?, ?, ?)');
  const info = stmt.run(amount || 0, date || null, category || null, description || null);
  res.json({ id: info.lastInsertRowid });
}

module.exports = { createTransaction };
