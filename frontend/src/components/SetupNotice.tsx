export default function SetupNotice() {
  return (
    <div className="grid min-h-screen place-items-center bg-bg p-6 text-ink">
      <div role="alert" className="w-full max-w-lg rounded-2xl border border-line bg-surface p-8">
        <h1 className="text-2xl font-semibold">One more step to get started</h1>
        <p className="mt-2 text-muted">The app can't find your Supabase settings. Create <code className="rounded bg-sunken px-1.5 py-0.5">frontend/.env</code> with:</p>
        <pre className="mt-4 overflow-x-auto rounded-xl bg-sunken p-4 text-sm">{`VITE_SUPABASE_URL=https://YOUR-PROJECT-REF.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-public-key
VITE_API_URL=http://localhost:8000/api`}</pre>
        <p className="mt-4 text-sm text-muted">Find both values in Supabase under Project Settings, then API. Use the <b>anon</b> key here, never the service_role key. Then stop and restart <code className="rounded bg-sunken px-1.5 py-0.5">npm run dev</code>.</p>
      </div>
    </div>
  )
}
