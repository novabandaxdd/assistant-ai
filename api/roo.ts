import type { VercelRequest, VercelResponse } from '@vercel/node'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // CORS preflight
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')
  if (req.method === 'OPTIONS') { res.status(200).end(); return }

  const ibmPath = (req.url ?? '').replace(/^\/api\/roo/, '/apis/v3')
  const ibmUrl  = `https://servicesessentials.ibm.com${ibmPath}`

  try {
    // Re-serialize body exactly as received — Vercel parses JSON body automatically,
    // so we must stringify it back to send as raw JSON to IBM
    const bodyStr = req.body !== undefined ? JSON.stringify(req.body) : undefined

    const upstream = await fetch(ibmUrl, {
      method:  'POST',
      headers: {
        'Content-Type':  'application/json',
        'Authorization': (req.headers['authorization'] as string) ?? '',
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
