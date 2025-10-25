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
    let data = null;
    try {
      data = respText ? JSON.parse(respText) : null;
    } catch (e) {
      data = respText;
    }

    const textOut = (data && data.candidates && data.candidates[0] && data.candidates[0].content && data.candidates[0].content.parts && data.candidates[0].content.parts[0] && data.candidates[0].content.parts[0].text)
      ? data.candidates[0].content.parts[0].text
      : (data && data.candidates && data.candidates[0] && data.candidates[0].content) || (data && data.output && data.output[0] && data.output[0].content) || (data && data.generated_text) || (typeof data === 'string' ? data : '');

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

module.exports = { geminiRawPost };
