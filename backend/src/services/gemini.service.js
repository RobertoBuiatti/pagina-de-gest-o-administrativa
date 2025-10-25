const GOOGLE_API_KEY = process.env.GOOGLE_API_KEY;

async function callGeminiExtract(text, imageData) {
  try {
    const url = `https://generativelanguage.googleapis.com/v1beta2/models/text-bison-001:generate?key=${GOOGLE_API_KEY}`;

    const baseInstruction = `Extract from the following OCR text (or image if OCR text is missing) the amount, the date, and a short description. Return ONLY a single JSON object with keys "amount", "date", and "description". If a field is not present, use null. Do not include any extra commentary or formatting.`;

    let prompt = baseInstruction + "\n\n";

    if (String(text || '').trim()) {
      prompt += `OCR Text:\n\n"""${String(text).replace(/"""/g, '\"""')}´´´`;
    } else if (imageData) {
      prompt += `OCR Text is empty. Analyze the image provided (base64 data or data URL) and extract amount, date and a short description. Image (base64 or data URL):\n\n${imageData}`;
    } else {
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

    const respText = await resp.text().catch(() => '');
    let data = null;
    try {
      data = respText ? JSON.parse(respText) : null;
    } catch (e) {
      data = respText;
    }

    let out = null;
    if (data && data.candidates && data.candidates[0] && data.candidates[0].content) out = data.candidates[0].content;
    else if (data && data.output && data.output[0] && data.output[0].content) out = data.output[0].content;
    else if (data && data.generated_text) out = data.generated_text;
    else if (data && data.choices && data.choices[0] && data.choices[0].message) out = data.choices[0].message;
    else if (typeof data === 'string') out = data;
    if (!out) return null;

    const outText = typeof out === 'object' ? JSON.stringify(out) : String(out);

    const jsonMatch = outText.match(/\{[\s\S]*\}/);
    let parsed = null;
    if (jsonMatch) {
      try { parsed = JSON.parse(jsonMatch[0]); } catch (e) { /* ignore parse error */ }
    }

    if (!parsed) {
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

module.exports = { callGeminiExtract };
