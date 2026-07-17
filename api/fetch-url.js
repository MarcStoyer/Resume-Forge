export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: { message: "Method not allowed." } });
  }

  const url = req.body?.url;
  if (!url || typeof url !== "string") {
    return res.status(400).json({
      error: { message: "Missing 'url' in request body." },
    });
  }

  let parsedUrl;
  try {
    parsedUrl = new URL(url);
  } catch {
    return res.status(400).json({ error: { message: "Invalid URL." } });
  }

  if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
    return res.status(400).json({
      error: { message: "Only HTTP and HTTPS URLs are supported." },
    });
  }

  try {
    const response = await fetch(parsedUrl, {
      headers: {
        "user-agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36",
        accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "accept-language": "en-US,en;q=0.9",
      },
      redirect: "follow",
    });

    if (!response.ok) {
      return res.status(200).json({
        ok: false,
        status: response.status,
        html: "",
        text: "",
        message: `HTTP ${response.status} — site may require login or block automated fetches.`,
      });
    }

    const html = await response.text();
    const text = html
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
      .replace(/<[^>]+>/g, " ")
      .replace(/&nbsp;/g, " ")
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 20000);

    return res.status(200).json({ ok: true, status: response.status, text });
  } catch (e) {
    return res.status(200).json({
      ok: false,
      status: 0,
      html: "",
      text: "",
      message: "Couldn't fetch that URL: " + String(e),
    });
  }
}
