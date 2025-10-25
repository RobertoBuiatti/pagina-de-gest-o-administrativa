const { getDb } = require('../database');
const { callGeminiExtract } = require('../services/gemini.service');

function jsonFields(obj) {
  try { return JSON.stringify(obj || {}) } catch (e) { return '{}'; }
}

async function ocrPost(req, res) {
  const db = getDb();
  const { text, fields, image } = req.body || {};
  const parsed = Object.assign({ amount: null, date: null, description: null, type: null }, fields || {});

  function parseAmountValue(rawAmount) {
    if (!rawAmount) return null;
    try {
      const normalized = String(rawAmount).replace(/[^\d\.,-]/g, '').replace(/\./g, '').replace(',', '.');
      const n = parseFloat(normalized);
      return Number.isNaN(n) ? null : n;
    } catch (e) { return null; }
  }

  const hasAmount = parseAmountValue(parsed.amount) !== null;
  const hasDate = !!(parsed.date && String(parsed.date).trim());
  let geminiUsed = false;

  if ((!hasAmount || !hasDate) && (text || image)) {
    try {
      const g = await callGeminiExtract(text, image);
      if (g) {
        geminiUsed = true;
        if (!parsed.amount && g.amount) parsed.amount = g.amount;
        if (!parsed.date && g.date) parsed.date = g.date;
        if (!parsed.description && g.description) parsed.description = g.description;
      }
    } catch (e) {
      console.error('Gemini extraction failed', e);
    }
  }

  const stmt = db.prepare('INSERT INTO extractions (text, fields) VALUES (?, ?)');
  const info = stmt.run(text || '', jsonFields(parsed));

  try {
    let amount = parseAmountValue(parsed.amount);
    const date = parsed.date || null;

    const typeRaw = (parsed.type || '').toString().toLowerCase();
    if (amount !== null) {
      if (typeRaw.includes('saída') || typeRaw.includes('saida') || typeRaw === 'saida') {
        if (amount > 0) amount = -Math.abs(amount);
      } else if (typeRaw.includes('entrada') || typeRaw === 'entrada') {
        amount = Math.abs(amount);
      }
      const tstmt = db.prepare('INSERT INTO transactions (amount, date, category, description) VALUES (?, ?, ?, ?)');
      tstmt.run(amount, date, 'imported', parsed.description ? String(parsed.description).slice(0, 255) : 'Criado via OCR import');
      parsed.amount = amount;
    }
  } catch (err) {
    console.error('auto-transaction failed', err);
  }

  res.json({ id: info.lastInsertRowid, geminiUsed, fields: parsed, text: text || '' });
}

module.exports = { ocrPost };
