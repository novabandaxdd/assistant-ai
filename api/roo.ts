import type { VercelRequest, VercelResponse } from '@vercel/node'

// Proxy para IBM Bob / Roo Code API
// Contorna o bloqueio de CORS do browser → IBM
// Roda no servidor da Vercel (Node.js) — sem restrições de CORS
export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Allow preflight
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')
  if (req.method === 'OPTIONS') { res.status(200).end(); return }

  const ibmPath = (req.url ?? '').replace(/^\/api\/roo/, '/apis/v3')
  const ibmUrl  = `https://servicesessentials.ibm.com${ibmPath}`

  try {
    const upstream = await fetch(ibmUrl, {
      method:  req.method ?? 'POST',
      headers: {
        'Content-Type':  'application/json',
        'Authorization': (req.headers['authorization'] as string) ?? '',
      },
      body: req.method !== 'GET' && req.method !== 'HEAD'
        ? JSON.stringify(req.body)
        : undefined,
    })

    const text = await upstream.text()
    res.status(upstream.status)
    res.setHeader('Content-Type', upstream.headers.get('content-type') ?? 'application/json')
    res.send(text)
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Proxy error'
    res.status(502).json({ error: msg })
  }
}
