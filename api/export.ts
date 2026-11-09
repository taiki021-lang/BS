// Vercel serverless function: researcher-only export of all responses as JSON.
// The browser admin page (#/admin) converts the JSON to CSV.
//
// Server-only env vars (set in Vercel, never prefixed with VITE_):
//   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, EXPORT_TOKEN (long random string)
//
// Self-contained on purpose (no relative imports) so Vercel can run it as-is.
import { createHash, timingSafeEqual } from 'node:crypto'
import type { VercelRequest, VercelResponse } from '@vercel/node'

function sameSecret(a: string, b: string): boolean {
  const ha = createHash('sha256').update(a).digest()
  const hb = createHash('sha256').update(b).digest()
  return timingSafeEqual(ha, hb)
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Cache-Control', 'no-store')
  if (req.method !== 'GET') return res.status(405).send('Method not allowed')

  const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, EXPORT_TOKEN } = process.env
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY || !EXPORT_TOKEN || EXPORT_TOKEN.length < 16) {
    return res.status(500).send('Export is not configured on the server.')
  }
  const auth = req.headers.authorization ?? ''
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : ''
  if (!token || !sameSecret(token, EXPORT_TOKEN)) return res.status(401).send('Unauthorized')

  const table = req.query.table === 'progress' ? 'progress' : 'responses'
  const order = table === 'progress' ? 'id.asc' : 'created_at.asc'
  const rows: unknown[] = []
  const page = 1000
  for (let from = 0; ; from += page) {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/${table}?select=*&order=${order}`, {
      headers: {
        apikey: SUPABASE_SERVICE_ROLE_KEY,
        // Legacy service_role keys are JWTs and go in Authorization too; new sb_secret_ keys must not.
        ...(SUPABASE_SERVICE_ROLE_KEY.startsWith('eyJ') ? { Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}` } : {}),
        Range: `${from}-${from + page - 1}`,
      },
    })
    if (!r.ok) return res.status(502).send(`Supabase error ${r.status}`)
    const batch = (await r.json()) as unknown[]
    rows.push(...batch)
    if (batch.length < page) break
  }
  return res.status(200).json(rows)
}
