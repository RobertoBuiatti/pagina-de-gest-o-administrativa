require('dotenv').config()
const express = require('express')
const cors = require('cors')
const path = require('path')
const Database = require('better-sqlite3')

const app = express()
app.use(cors())
app.use(express.json({ limit: '10mb' })) // allow large image payloads

// DB
const dbPath = path.join(__dirname, '..', 'data.sqlite')
const db = new Database(dbPath)

// init tables
db.prepare(`
  CREATE TABLE IF NOT EXISTS extractions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    text TEXT,
    fields TEXT,
    created_at TEXT DEFAULT (datetime('now'))
  )
`).run()

db.prepare(`
  CREATE TABLE IF NOT EXISTS transactions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    amount REAL,
    date TEXT,
    category TEXT,
    description TEXT,
    created_at TEXT DEFAULT (datetime('now'))
  )
`).run()

 // helper
function jsonFields(obj) {
  try { return JSON.stringify(obj || {}) } catch (e) { return '{}' }
}

 // Gemini / Generative API helper
const GOOGLE_API_KEY = process.env.GOOGLE_API_KEY;
const GEMINI_MODEL = process.env.GEMINI_MODEL || 'text-bison-001';
if (!GOOGLE_API_KEY) {
  console.warn('GOOGLE_API_KEY não está definido. Coloque sua chave em backend/.env e reinicie o servidor.');
}

/**
 * callGeminiExtract(text, imageData)
 * - text: OCR text (may be empty)
 * - imageData: optional data URL / base64 string of the original image
 *
 * Strategy:
 * 1) Prefer using the provided OCR text. Ask Gemini to return a single JSON object { amount, date, description }.
 * 2) If no useful info is returned and imageData is provided, call Gemini again including the image (base64 / data URL)
 *    in the prompt and instruct the model to analyze the image and return the same JSON object.
 *
 * Note: Sending raw base64 in prompt can be large; we send it only when necessary.
 */
async function callGeminiExtract(text, imageData) {
  try {
    const url = `https://generativelanguage.googleapis.com/v1beta2/models/text-bison-001:generate?key=${GOOGLE_API_KEY}`;

    // build prompt preferring text; include imageData only when needed
    const baseInstruction = `Extract from the following OCR text (or image if OCR text is missing) the amount, the date, and a short description. Return ONLY a single JSON object with keys "amount", "date", and "description". If a field is not present, use null. Do not include any extra commentary or formatting.`;

    let prompt = baseInstruction + "\n\n";

    if (String(text || '').trim()) {
      prompt += `OCR Text:\n\n"""${String(text).replace(/"""/g, '\\"""')}"""`;
    } else if (imageData) {
      prompt += `OCR Text is empty. Analyze the image provided (base64 data or data URL) and extract amount, date and a short description. Image (base64 or data URL):\n\n${imageData}`;
    } else {
      // fallback: nothing to analyze
      prompt += `No OCR text and no image provided. Return a JSON object with nulls.`;
    }

  const body = {
    contents: [
      { parts: [{ text: prompt }] }
    ]
  };

    const resp = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });

    // read raw text first to avoid JSON parse errors on empty/non-json responses
    const respText = await resp.text().catch(() => '');
    console.log('Gemini call respText length:', respText ? respText.length : 0);
    let data = null;
    try {
      data = respText ? JSON.parse(respText) : null;
      console.log('Gemini call parsed JSON:', data);
    } catch (e) {
      // not JSON — keep raw text
      data = respText;
      console.log('Gemini call non-JSON response (preview):', String(data).slice(0, 500));
    }

    // model may return text in different fields depending on API version
    let out = null;
    if (data && data.candidates && data.candidates[0] && data.candidates[0].content) out = data.candidates[0].content;
    else if (data && data.output && data.output[0] && data.output[0].content) out = data.output[0].content;
    else if (data && data.generated_text) out = data.generated_text;
    else if (data && data.choices && data.choices[0] && data.choices[0].message) out = data.choices[0].message;
    else if (typeof data === 'string') out = data;
    if (!out) return null;

    const outText = typeof out === 'object' ? JSON.stringify(out) : String(out);

    // try to extract JSON object from the model output
    const jsonMatch = outText.match(/\{[\s\S]*\}/);
    let parsed = null;
    if (jsonMatch) {
      try { parsed = JSON.parse(jsonMatch[0]); } catch (e) { /* ignore parse error */ }
    }

    if (!parsed) {
      // fallback: extract simple key:value pairs by regex
      const amount = (outText.match(/amount[:\s\-]*([^\n\r]+)/i) || [])[1] || null;
      const date = (outText.match(/date[:\s\-]*([^\n\r]+)/i) || [])[1] || null;
      const description = (outText.match(/description[:\s\-]*([^\n\r]+)/i) || [])[1] || null;
      parsed = { amount: amount ? amount.trim() : null, date: date ? date.trim() : null, description: description ? description.trim() : null };
    }

    return parsed;
  } catch (err) {
    console.error('callGeminiExtract error', err);
    return null;
  }
}

// POST /api/ocr
app.post('/api/ocr', async (req, res) => {
  const { text, fields, image } = req.body || {}
  // clone fields to avoid mutating caller object
  const parsed = Object.assign({ amount: null, date: null, description: null, type: null }, fields || {})

  // helper to normalize/parse amount strings into number-friendly format
  function parseAmountValue(rawAmount) {
    if (!rawAmount) return null
    try {
      const normalized = String(rawAmount).replace(/[^\d\.,-]/g, '').replace(/\./g, '').replace(',', '.')
      const n = parseFloat(normalized)
      return Number.isNaN(n) ? null : n
    } catch (e) { return null }
  }

  // decide whether we need to call Gemini: if amount or date are missing or invalid
  const hasAmount = parseAmountValue(parsed.amount) !== null
  const hasDate = !!(parsed.date && String(parsed.date).trim())
  let geminiUsed = false

  if ((!hasAmount || !hasDate) && (text || image)) {
    try {
      // pass image when available so Gemini can analyze it if text isn't enough
      const g = await callGeminiExtract(text, image)
      if (g) {
        geminiUsed = true
        if (!parsed.amount && g.amount) parsed.amount = g.amount
        if (!parsed.date && g.date) parsed.date = g.date
        if (!parsed.description && g.description) parsed.description = g.description
      }
    } catch (e) {
      console.error('Gemini extraction failed', e)
    }
  }

  // store extraction (text + resolved fields)
  const stmt = db.prepare('INSERT INTO extractions (text, fields) VALUES (?, ?)')
  const info = stmt.run(text || '', jsonFields(parsed))

  // optional: if fields include amount/date create a transaction
  try {
    let amount = parseAmountValue(parsed.amount)
    const date = parsed.date || null
    if (amount !== null) {
      const tstmt = db.prepare('INSERT INTO transactions (amount, date, category, description) VALUES (?, ?, ?, ?)')
      tstmt.run(amount, date, 'imported', parsed.description ? String(parsed.description).slice(0, 255) : 'Criado via OCR import')
    }
  } catch (err) {
    console.error('auto-transaction failed', err)
  }

  res.json({ id: info.lastInsertRowid, geminiUsed, fields: parsed, text: text || '' })
})

// POST /api/gemini-raw
app.post('/api/gemini-raw', async (req, res) => {
  const { text } = req.body || {}
  if (!text || !String(text).trim()) return res.status(400).json({ erro: 'Texto bruto obrigatório.' })

  const prompt = `
Extraia do texto abaixo os campos "valor", "data" e "descricao". Retorne apenas um objeto JSON com chaves "valor", "data" e "descricao". Se não encontrar, coloque null.
Texto:
${String(text).replace(/`/g, '\\`')}
`

  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GOOGLE_API_KEY}`;

  const body = {
    contents: [
      { parts: [{ text: prompt }] }
    ]
  };

  try {
    const resp = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });

    // read raw text first to avoid JSON parse errors
    const respText = await resp.text().catch(() => '');
    console.log('gemini-raw respText length:', respText ? respText.length : 0);
    let data = null;
    try {
      data = respText ? JSON.parse(respText) : null;
      console.log('gemini-raw parsed JSON:', data);
    } catch (e) {
      data = respText;
      console.log('gemini-raw non-JSON response (preview):', String(data).slice(0, 500));
    }

    const textOut = (data && data.candidates && data.candidates[0] && data.candidates[0].content && data.candidates[0].content.parts && data.candidates[0].content.parts[0] && data.candidates[0].content.parts[0].text)
      ? data.candidates[0].content.parts[0].text
      : (data && data.candidates && data.candidates[0] && data.candidates[0].content) || (data && data.output && data.output[0] && data.output[0].content) || (data && data.generated_text) || (typeof data === 'string' ? data : '');
    console.log('gemini-raw textOut preview:', (typeof textOut === 'string' ? textOut.slice(0, 800) : JSON.stringify(textOut)).replace(/\n/g, ' '));

    const jsonMatch = String(textOut).match(/\{[\s\S]*\}/);
    let parsed = null;
    if (jsonMatch) {
      try { parsed = JSON.parse(jsonMatch[0]); } catch (e) { parsed = null; }
    }

    if (!parsed) {
      const valor = (String(textOut).match(/valor[:\s\-]*([^\n\r]+)/i) || [])[1] || null;
      const date = (String(textOut).match(/data[:\s\-]*([^\n\r]+)/i) || [])[1] || null;
      const desc = (String(textOut).match(/descri[cç]ao[:\s\-]*([^\n\r]+)/i) || [])[1] || null;
      parsed = { valor: valor ? valor.trim() : null, data: date ? date.trim() : null, descricao: desc ? desc.trim() : null };
    }

    return res.json({ parsed, raw: textOut });
  } catch (err) {
    console.error('gemini-raw error', err);
    return res.status(500).json({ erro: 'Erro ao chamar Gemini', detalhe: err.message });
  }
})

// POST /api/transactions
app.post('/api/transactions', (req, res) => {
  const { amount, date, category, description } = req.body || {}
  const stmt = db.prepare('INSERT INTO transactions (amount, date, category, description) VALUES (?, ?, ?, ?)')
  const info = stmt.run(amount || 0, date || null, category || null, description || null)
  res.json({ id: info.lastInsertRowid })
})

// GET /api/summary
app.get('/api/summary', (req, res) => {
  const { start, end } = req.query
  // simple aggregation: total income, total expenses, balance, and simple timeseries by day (last 30 days)
  const incomeRow = db.prepare("SELECT SUM(amount) as income FROM transactions WHERE amount > 0").get()
  const expensesRow = db.prepare("SELECT SUM(amount) as expenses FROM transactions WHERE amount < 0").get()
  const income = incomeRow.income || 0
  const expenses = Math.abs(expensesRow.expenses || 0)
  const balance = income - expenses

  // small timeseries (last 14 days)
  const timeseries = []
  const stmt = db.prepare("SELECT date(amount), SUM(amount) as balance FROM transactions GROUP BY date")
  // fallback simple timeseries using created_at if date is null
  const rows = db.prepare("SELECT COALESCE(date(date), date(created_at)) as day, SUM(amount) as balance FROM transactions GROUP BY day ORDER BY day DESC LIMIT 14").all()
  for (const r of rows.reverse()) {
    timeseries.push({ date: r.day, balance: r.balance || 0 })
  }

  res.json({ income, expenses, balance, timeseries })
})

// GET /api/analytics
app.get('/api/analytics', (req, res) => {
  // return basic categories and timeseries for charts
  const categories = db.prepare("SELECT category, SUM(amount) as amount FROM transactions GROUP BY category").all()
  const timeseries = db.prepare("SELECT COALESCE(date(date), date(created_at)) as date, SUM(amount) as income, SUM(CASE WHEN amount<0 THEN amount ELSE 0 END) as expenses FROM transactions GROUP BY date ORDER BY date DESC LIMIT 30").all().reverse().map(r => ({
    date: r.date,
    income: r.income || 0,
    expenses: Math.abs(r.expenses || 0)
  }))

  res.json({
    categories: categories.map(c => ({ name: c.category || 'Uncategorized', amount: c.amount || 0 })),
    timeseries
  })
})

// static proxy helper for dev: serve frontend built files if present
const frontendDist = path.join(__dirname, '..', '..', 'frontend', 'dist')
app.use('/', express.static(frontendDist))

const port = process.env.PORT || 3000
app.listen(port, () => {
  console.log(`Backend listening on http://localhost:${port}`)
})
