// Catch-all proxy for IBM Bob / Roo Code API — Vercel Serverless Function
// Handles: /api/roo/chat/completions  (and any sub-path)
// CommonJS export for maximum Vercel Node runtime compatibility.

module.exports = async function handler(req, res) {
  // CORS preflight
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')
  if (req.method === 'OPTIONS') { res.status(200).end(); return }

  // /api/roo/chat/completions  →  /apis/v3/chat/completions
  const subPath = (req.query.path || []).join('/')
  const ibmUrl  = `https://servicesessentials.ibm.com/apis/v3/${subPath}`

  try {
    const bodyStr = req.body !== undefined ? JSON.stringify(req.body) : undefined

    const upstream = await fetch(ibmUrl, {
      method:  req.method,
      headers: {
        'Content-Type':  'application/json',
        'Authorization': req.headers['authorization'] || '',
      },
      body: req.method !== 'GET' && req.method !== 'HEAD' ? bodyStr : undefined,
    })

    const text = await upstream.text()
    res.status(upstream.status)
    res.setHeader('Content-Type', upstream.headers.get('content-type') || 'application/json')
    res.send(text)
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Proxy error'
    res.status(502).json({ error: msg })
  }
}
