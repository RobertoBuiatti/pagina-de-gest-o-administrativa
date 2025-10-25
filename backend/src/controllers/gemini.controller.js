// Access database for aggregated transactions
const { getDb } = require('../database');
const GOOGLE_API_KEY = process.env.GOOGLE_API_KEY;

async function geminiRawPost(req, res) {
  const { text } = req.body || {};
  if (!text || !String(text).trim()) return res.status(400).json({ erro: 'Texto bruto obrigatório.' });

  const prompt = `
Extraia do texto abaixo os campos "valor", "data" e "descricao". Retorne apenas um objeto JSON com chaves "valor", "data" e "descricao". Se não encontrar, coloque null.
Texto:
${String(text).replace(/`/g, '\`')}
`;

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

    const respText = await resp.text().catch(() => '');
    let respData = null;
    try {
      respData = respText ? JSON.parse(respText) : null;
    } catch (e) {
      respData = respText;
    }

    const textOut = (respData && respData.candidates && respData.candidates[0] && respData.candidates[0].content && respData.candidates[0].content.parts && respData.candidates[0].content.parts[0] && respData.candidates[0].content.parts[0].text)
      ? respData.candidates[0].content.parts[0].text
      : (respData && respData.candidates && respData.candidates[0] && respData.candidates[0].content) || (respData && respData.output && respData.output[0] && respData.output[0].content) || (respData && respData.generated_text) || (typeof respData === 'string' ? respData : '');

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
}

async function geminiAggregateAnalysis(req, res) {
  try {
    const db = getDb();
    const { start, end, limit, data } = req.body || {};

    // Se o cliente enviou dados explicitamente, use-os diretamente (espera-se um array de lançamentos).
    // Caso contrário, consulta o banco de dados como antes.
    let rows = null;
    if (data && Array.isArray(data) && data.length) {
      rows = data.map(d => ({
        date: d.date || null,
        description: d.description || d.desc || null,
        category: d.category || null,
        amount: Number(d.amount ?? d.value ?? 0),
        created_at: d.created_at || new Date().toISOString()
      }));
    } else {
      const baseFilters = [];
      const params = [];
      if (start) {
        baseFilters.push("COALESCE(date, date(created_at)) >= ?");
        params.push(start);
      }
      if (end) {
        baseFilters.push("COALESCE(date, date(created_at)) <= ?");
        params.push(end);
      }
      const baseWhere = baseFilters.length ? `WHERE ${baseFilters.join(' AND ')}` : '';
      const limitVal = Number(limit || 500);

      const stmtParams = params.slice(0);
      stmtParams.push(limitVal);

      rows = db.prepare(`
        SELECT COALESCE(date, date(created_at)) as date, description, category, amount, created_at
        FROM transactions
        ${baseWhere}
        ORDER BY date ASC, created_at ASC
        LIMIT ?
      `).all(...stmtParams);
    }

    if (!rows || rows.length === 0) {
      return res.status(200).json({ message: 'Sem lançamentos', parsed: null, raw: null });
    }

    // Log para diagnóstico: confirmar número de lançamentos recebidos
    try {
      console.log('geminiAggregateAnalysis: rows count =', Array.isArray(rows) ? rows.length : 0);
      console.log('geminiAggregateAnalysis: sample row =', rows && rows.length ? rows[0] : null);
    } catch (e) {
      console.log('geminiAggregateAnalysis: erro ao logar rows', e && e.message);
    }

    // Build textual list of transactions for Gemini
    let text = '';
    for (const r of rows) {
      const date = r.date || 'sem-data';
      const cat = r.category || 'sem-categoria';
      const desc = (r.description || '').replace(/[\r\n]+/g, ' ').trim() || '-';
      const amt = Number(r.amount || 0).toFixed(2);
      text += `${date} | ${cat} | ${desc} | ${amt}\n`;
    }

    const prompt = `
Analise os lançamentos abaixo (formato: data | categoria | descrição | valor). Gere e retorne apenas um objeto JSON válido com as chaves:
- "summary": texto curto com os principais pontos (máx 2 frases)
- "top_categories": array de objetos { "name": "<categoria>", "amount": <valor absoluto> } com até 5 maiores categorias
- "cash_flow_trend": uma das strings "positivo", "negativo" ou "estável"
- "recommendations": array de strings com recomendações práticas e acionáveis
- "anomalies": array de strings descrevendo possíveis lançamentos anômalos (se houver)
Use valores numéricos em ponto flutuante para montantes. Não retorne explicações adicionais — apenas o JSON.

Lançamentos:
${text}
`;

    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GOOGLE_API_KEY}`;
    const body = {
      contents: [
        { parts: [{ text: prompt }] }
      ]
    };

    // Log do prompt e do endpoint para diagnóstico (não expor chave)
    try {
      console.log('geminiAggregateAnalysis: endpoint =', url);
      console.log('geminiAggregateAnalysis: prompt length =', typeof prompt === 'string' ? prompt.length : 0);
      console.log('geminiAggregateAnalysis: prompt preview =', (typeof prompt === 'string' ? prompt.slice(0, 1000) : ''));
    } catch (e) {
      console.log('geminiAggregateAnalysis: erro ao logar prompt', e && e.message);
    }

    const resp = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });

    const respText = await resp.text().catch(() => '');
    let respData = null;
    try {
      respData = respText ? JSON.parse(respText) : null;
    } catch (e) {
      respData = respText;
    }

    // Log resposta bruta do Gemini para diagnóstico
    try {
      console.log('geminiAggregateAnalysis: respText (len) =', typeof respText === 'string' ? respText.length : null);
      // console.log('geminiAggregateAnalysis: respText =', respText); // disponível para debug mais profundo
    } catch (e) {
      console.log('geminiAggregateAnalysis: erro ao logar respText', e && e.message);
    }

    const textOut = (respData && respData.candidates && respData.candidates[0] && respData.candidates[0].content && respData.candidates[0].content.parts && respData.candidates[0].content.parts[0] && respData.candidates[0].content.parts[0].text)
      ? respData.candidates[0].content.parts[0].text
      : (respData && respData.candidates && respData.candidates[0] && respData.candidates[0].content) || (respData && respData.output && respData.output[0] && respData.output[0].content) || (respData && respData.generated_text) || (typeof respData === 'string' ? respData : '');

    const jsonMatch = String(textOut).match(/\{[\s\S]*\}/);
    let parsed = null;
    if (jsonMatch) {
      try { parsed = JSON.parse(jsonMatch[0]); } catch (e) { parsed = null; }
    }

    return res.json({ parsed: parsed || null, raw: textOut });
  } catch (err) {
    console.error('gemini-aggregate error', err);
    return res.status(500).json({ erro: 'Erro ao gerar análise', detalhe: err.message });
  }
}

module.exports = { geminiRawPost, geminiAggregateAnalysis };
