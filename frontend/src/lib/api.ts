import { supabase } from './supabase'

const BASE = ((import.meta.env.VITE_API_URL as string | undefined) || 'http://localhost:8000/api').replace(/\/$/, '')

async function call(path: string, opts: { method?: string; body?: unknown; form?: FormData } = {}): Promise<Response> {
  const { data } = await supabase.auth.getSession()
  const headers: Record<string, string> = { Authorization: `Bearer ${data.session?.access_token ?? ''}` }
  let body: BodyInit | undefined
  if (opts.form) body = opts.form
  else if (opts.body !== undefined) { headers['Content-Type'] = 'application/json'; body = JSON.stringify(opts.body) }
  let res: Response
  try {
    res = await fetch(BASE + path, { method: opts.method ?? (body ? 'POST' : 'GET'), headers, body })
  } catch {
    throw new Error(`Can't reach the server at ${BASE}. Is the backend running? (cd backend && uvicorn app.main:app --reload)`)
  }
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    const d = err.detail
    const msg = typeof d === 'string' ? d : Array.isArray(d) && d[0]?.msg ? String(d[0].msg).replace(/^Value error, /, '') : `Something went wrong (${res.status}). Please try again.`
    throw new Error(msg)
  }
  return res
}

export const api = async <T = any>(path: string, opts: { method?: string; body?: unknown; form?: FormData } = {}): Promise<T> => (await call(path, opts)).json()
export const apiBlob = async (path: string): Promise<Blob> => (await call(path)).blob()

export function download(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob)
  Object.assign(document.createElement('a'), { href: url, download: name }).click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
