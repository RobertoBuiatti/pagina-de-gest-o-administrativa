const { getDb } = require('../database');

/**
 * Cria uma transação (usado pela rota POST /api/transactions)
 * Campos esperados no corpo: amount, date, category, description
 */
function createTransaction(req, res) {
  const db = getDb();
  const { amount, date, category, description } = req.body || {};
  const stmt = db.prepare('INSERT INTO transactions (amount, date, category, description) VALUES (?, ?, ?, ?)');
  const info = stmt.run(amount || 0, date || null, category || null, description || null);
  res.json({ id: info.lastInsertRowid });
}

/**
 * Atualiza uma transação existente (rota PUT /api/transactions/:id)
 * Aceita payload parcial: amount, date, category, description
 * Retorna os dados atualizados (consulta após atualização).
 */
function updateTransaction(req, res) {
  const db = getDb();
  const id = Number(req.params.id);
  if (!id) return res.status(400).json({ error: 'invalid id' });

  const { amount, date, category, description } = req.body || {};

  const stmt = db.prepare(
    `UPDATE transactions
     SET amount = COALESCE(?, amount),
         date = COALESCE(?, date),
         category = COALESCE(?, category),
         description = COALESCE(?, description)
     WHERE id = ?`
  );
  try {
    stmt.run(
      amount === undefined ? null : amount,
      date === undefined ? null : date,
      category === undefined ? null : category,
      description === undefined ? null : description,
      id
    );
    const row = db.prepare('SELECT id, amount, date, category, description, created_at FROM transactions WHERE id = ?').get(id);
    if (!row) return res.status(404).json({ error: 'not found' });
    res.json(row);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'update failed' });
  }
}

/**
 * Remove transação (rota DELETE /api/transactions/:id)
 */
function deleteTransaction(req, res) {
  const db = getDb();
  const id = Number(req.params.id);
  if (!id) return res.status(400).json({ error: 'invalid id' });

  try {
    const stmt = db.prepare('DELETE FROM transactions WHERE id = ?');
    const info = stmt.run(id);
    if (info.changes === 0) return res.status(404).json({ error: 'not found' });
    res.json({ deleted: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'delete failed' });
  }
}

module.exports = { createTransaction, updateTransaction, deleteTransaction };
