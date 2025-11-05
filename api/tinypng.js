// api/tinypng.js  (Vercel serverless function)
export default async function handler(req, res) {
  // CORS
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "POST") return res.status(405).send("Method Not Allowed");

  try {
    const apiKey = process.env.TINYPNG_API_KEY;
    if (!apiKey) return res.status(500).send("TINYPNG_API_KEY not set");

    // Read the raw body (Vercel provides req as a stream)
    const chunks = [];
    for await (const ch of req) chunks.push(ch);
    const body = Buffer.concat(chunks);

    // Very small, pragmatic multipart parse: find the file payload
    const ct = req.headers["content-type"] || "";
    const boundary = ct.split("boundary=")[1];
    if (!boundary) return res.status(400).send("No multipart boundary");

    const SEP = `--${boundary}`;
    const parts = body.toString("binary").split(SEP);
    // Find the part with `filename=`
    const filePart = parts.find(p => /filename=\".*\"/i.test(p));
    if (!filePart) return res.status(400).send("No file provided");

    // Extract binary after header separator
    const headEnd = filePart.indexOf("\r\n\r\n");
    const bin = filePart.slice(headEnd + 4);
    const binTrimmed = bin.replace(/\r\n--\r\n$/, ""); // trim trailing

    const fileBuf = Buffer.from(binTrimmed, "binary");

    // Send to TinyPNG
    const auth = "Basic " + Buffer.from("api:" + apiKey).toString("base64");
    const shrink = await fetch("https://api.tinify.com/shrink", {
      method: "POST",
      headers: { Authorization: auth },
      body: fileBuf,
    });

    if (!shrink.ok) {
      const txt = await shrink.text();
      return res.status(shrink.status).send(txt);
    }

    const location = shrink.headers.get("location");
    const resultResp = await fetch(location, { headers: { Authorization: auth } });
    const outBuf = Buffer.from(await resultResp.arrayBuffer());
    res.setHeader("Content-Type", resultResp.headers.get("content-type") || "application/octet-stream");
    res.status(200).send(outBuf);
  } catch (e) {
    res.status(500).send(String(e));
  }
}
