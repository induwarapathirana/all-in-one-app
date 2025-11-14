// api/upscale.js - proxies image bytes to Hugging Face Real-ESRGAN models
const MODEL_MAP = {
  general: 'nateraw/real-esrgan',
  anime: 'nateraw/real-esrgan-x4plus-anime'
};

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return;
  }

  if (req.method === 'GET') {
    const tokenPresent = Boolean(process.env.HUGGINGFACE_TOKEN);
    if (!tokenPresent) {
      res.status(200).json({
        ready: false,
        error:
          'Cloud upscaling is not configured. Add a HUGGINGFACE_TOKEN environment variable to enable the Hugging Face proxy.'
      });
      return;
    }
    res.status(200).json({ ready: true, models: MODEL_MAP });
    return;
  }

  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method Not Allowed' });
    return;
  }

  try {
    const token = process.env.HUGGINGFACE_TOKEN;
    if (!token) {
      res.status(500).json({
        error:
          'Missing HUGGINGFACE_TOKEN environment variable. Create a Hugging Face access token at https://huggingface.co/settings/tokens and set it as HUGGINGFACE_TOKEN in your deployment settings.'
      });
      return;
    }

    const chunks = [];
    for await (const chunk of req) {
      chunks.push(chunk);
    }
    const rawBody = Buffer.concat(chunks).toString('utf8');
    if (!rawBody) {
      res.status(400).json({ error: 'Missing request body' });
      return;
    }

    let body;
    try {
      body = JSON.parse(rawBody);
    } catch (err) {
      res.status(400).json({ error: 'Body must be valid JSON' });
      return;
    }

    const { image, mime, model } = body || {};
    if (!image || typeof image !== 'string') {
      res.status(400).json({ error: 'No image payload provided' });
      return;
    }

    const modelId = MODEL_MAP[model] || MODEL_MAP.general;
    const buffer = Buffer.from(image, 'base64');
    const contentType = typeof mime === 'string' && mime ? mime : 'image/png';

    const hfResp = await fetch(`https://api-inference.huggingface.co/models/${modelId}`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': contentType,
        'x-wait-for-model': 'true'
      },
      body: buffer
    });

    if (!hfResp.ok) {
      const errText = await hfResp.text();
      let message = errText;
      try {
        const parsed = JSON.parse(errText);
        message = parsed.error || parsed.message || errText;
      } catch (err) {
        // ignore JSON parse errors, fall back to raw text
      }
      res.status(hfResp.status).json({ error: message || 'Upscale request failed' });
      return;
    }

    const outBuffer = Buffer.from(await hfResp.arrayBuffer());
    const outType = hfResp.headers.get('content-type') || 'image/png';
    const base64 = outBuffer.toString('base64');

    res.setHeader('Content-Type', 'application/json');
    res.status(200).json({
      image: `data:${outType};base64,${base64}`,
      contentType: outType
    });
  } catch (error) {
    res.status(500).json({ error: error.message || 'Unexpected upscale failure' });
  }
}
