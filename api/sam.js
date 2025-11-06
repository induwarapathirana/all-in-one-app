// api/sam.js (Vercel serverless function for Hugging Face SAM)
export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "POST") return res.status(405).send("Method Not Allowed");

  try {
    const token = process.env.HUGGINGFACE_TOKEN;
    if (!token) return res.status(500).send("HUGGINGFACE_TOKEN not set");

    const model = process.env.HUGGINGFACE_SAM_MODEL || "facebook/sam-vit-huge";

    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    const rawBody = Buffer.concat(chunks);

    let imagePayload = rawBody.toString("utf8").trim();
    if (!imagePayload) return res.status(400).send("Empty request body");

    if (req.headers["content-type"]?.includes("application/json") || imagePayload.startsWith("{")) {
      try {
        const parsed = JSON.parse(imagePayload || "{}");
        imagePayload = parsed.image || parsed.data || "";
      } catch (err) {
        return res.status(400).send("Invalid JSON body");
      }
    }

    if (!imagePayload) return res.status(400).send("No image payload provided");

    let buffer;
    if (imagePayload.startsWith("data:")) {
      const base64 = imagePayload.split(",")[1];
      if (!base64) return res.status(400).send("Malformed data URL");
      buffer = Buffer.from(base64, "base64");
    } else {
      buffer = Buffer.from(imagePayload, "base64");
    }

    const baseUrl = (process.env.HUGGINGFACE_API_BASE || "https://router.huggingface.co/hf-inference").replace(/\/?$/, "");
    const target = `${baseUrl}/models/${encodeURIComponent(model)}`;

    const hfResp = await fetch(target, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "image/png",
        "Content-Type": "application/octet-stream",
      },
      body: buffer,
    });

    if (!hfResp.ok) {
      const errorText = await hfResp.text();
      return res.status(hfResp.status).send(errorText || "Hugging Face request failed");
    }

    const arrayBuf = await hfResp.arrayBuffer();
    const outBuf = Buffer.from(arrayBuf);
    const respType = hfResp.headers.get("content-type") || "image/png";
    res.setHeader("Content-Type", respType);
    res.status(200).send(outBuf);
  } catch (err) {
    res.status(500).send(String(err));
  }
}
