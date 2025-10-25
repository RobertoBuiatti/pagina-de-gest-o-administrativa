const { getDb } = require('../database');
const { callGeminiExtract } = require('../services/gemini.service');

/**
 * Preprocess image (base64 or data URL) before sending to OCR/LLM.
 * Uses `sharp` when available to apply a practical pipeline:
 *  - auto rotate
 *  - grayscale
 *  - resize (1.5x)
 *  - normalize (contrast)
 *  - threshold + sharpen
 * Falls back to returning the original image if `sharp` isn't installed.
 *
 * Nota: para operações avançadas (CLAHE, adaptiveThreshold, deskew com OpenCV),
 * recomendo instalar e usar um script Python + OpenCV ou adicionar
 * um módulo nativo (ex: opencv4nodejs). Aqui mantivemos uma solução prática
 * que funciona com `sharp`.
 */
async function preprocessImageBase64(imageData) {
  if (!imageData) return null;
  try {
    // extrai base64 se for data URL
    const m = String(imageData).match(/^data:(image\/\w+);base64,(.*)$/);
    let base64 = imageData;
    let mime = 'image/png';
    if (m) {
      mime = m[1];
      base64 = m[2];
    }
    const buf = Buffer.from(base64, 'base64');

    // tenta usar sharp para um pipeline simples e efetivo
    const sharp = require('sharp');
    let img = sharp(buf).rotate(); // corrige orientação via EXIF

    // obter meta para calcular resize seguro
    const meta = await img.metadata().catch(() => ({}));
    const width = meta.width ? Math.round(meta.width * 1.5) : undefined;

    img = img.grayscale().normalize();
    if (width) img = img.resize({ width });

    // threshold e sharpening para realçar texto
    // valor do threshold pode ser ajustado conforme necessário
    img = img.threshold(150).sharpen();

    const outBuf = await img.toBuffer();
    return `data:${mime};base64,${outBuf.toString('base64')}`;
  } catch (e) {
    // Se sharp não existir ou falhar, apenas logamos e retornamos a imagem original.
    console.warn('Preprocess image skipped (sharp ausente ou falha):', e && e.message ? e.message : e);
    return imageData;
  }
}

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
      // tenta pré-processar a imagem antes de enviar ao Gemini/Tesseract
      const processedImage = image ? await preprocessImageBase64(image) : null;
      const g = await callGeminiExtract(text, processedImage);
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
