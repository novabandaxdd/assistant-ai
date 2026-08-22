// Proxy para IBM Bob / Roo Code API
// Contorna o bloqueio de CORS do browser → IBM
// Roda no servidor da Vercel (Node.js) — sem restrições de CORS

export default async function handler(req, res) {
  // CORS preflight
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')
  if (req.method === 'OPTIONS') { res.status(200).end(); return }

  const ibmPath = (req.url ?? '').replace(/^\/api\/roo/, '/apis/v3')
  const ibmUrl  = `https://servicesessentials.ibm.com${ibmPath}`

  try {
    const bodyStr = req.body !== undefined ? JSON.stringify(req.body) : undefined

    const upstream = await fetch(ibmUrl, {
      method:  'POST',
      headers: {
        'Content-Type':  'application/json',
        'Authorization': req.headers['authorization'] ?? '',
      },
      body: bodyStr,
    })

    const text = await upstream.text()
    res.status(upstream.status)
    res.setHeader('Content-Type', 'application/json')
    res.send(text)
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Proxy error'
    res.status(502).json({ error: msg })
  }
}
