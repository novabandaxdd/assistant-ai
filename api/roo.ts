import type { VercelRequest, VercelResponse } from '@vercel/node'

// Proxy para IBM Bob / Roo Code API
// Contorna o bloqueio de CORS do browser → IBM
export default async function handler(req: VercelRequest, res: VercelResponse) {
  const { method, headers, body } = req

  // Strip the /api/roo prefix, forward the rest to IBM
  const ibmPath = req.url?.replace(/^\/api\/roo/, '/apis/v3') ?? '/apis/v3'
  const ibmUrl  = `https://servicesessentials.ibm.com${ibmPath}`

  try {
    const upstream = await fetch(ibmUrl, {
      method: method ?? 'POST',
      headers: {
        'Content-Type':  'application/json',
        'Authorization': headers['authorization'] ?? '',
        'x-roo-api-key': (headers['x-roo-api-key'] as string) ?? '',
      },
      body: method !== 'GET' && method !== 'HEAD' ? JSON.stringify(body) : undefined,
    })

    const data = await upstream.text()
    res.status(upstream.status)
    res.setHeader('Content-Type', upstream.headers.get('content-type') ?? 'application/json')
    res.send(data)
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Proxy error'
    res.status(502).json({ error: msg })
  }
}
