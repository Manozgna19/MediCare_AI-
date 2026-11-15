"""Supabase access for the whole backend: PostgREST via the official supabase-py client.

All data access goes through `sb.table(...).select()/.insert()/.update()/.delete()/.upsert()`.
`sb` uses the service_role key, which bypasses Row Level Security, so EVERY query in this codebase
filters by the verified user id (see deps.get_user_id). RLS policies in database/schema.sql still protect
the data against direct access from the browser with the anon key.
"""
from supabase import Client, create_client

from .config import settings

try:
    sb: Client = create_client(settings.supabase_url, settings.supabase_key)
except Exception as e:  # supabase-py raises on malformed URL/key
    raise RuntimeError(
        f"Could not create the Supabase client ({e}). Check SUPABASE_URL and SUPABASE_KEY in backend/.env: "
        "use the project URL and the service_role (secret) key from Supabase > Project Settings > API."
    ) from e


def one(query) -> dict:
    """Run a .maybe_single() query safely; supabase-py may return None when no row exists."""
    r = query.execute()
    return (r.data if r else None) or {}
