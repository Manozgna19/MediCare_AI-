import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined

/** False until frontend/.env contains both values; App shows a setup screen instead of a blank page. */
export const isSupabaseConfigured = Boolean(url && anonKey)

// The browser only ever gets the public anon key. Placeholders keep this module importable when .env is missing.
export const supabase = createClient(url || 'http://localhost:54321', anonKey || 'missing-anon-key')
