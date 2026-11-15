import { useState } from 'react'
import { api, download } from '../lib/api'
import { supabase } from '../lib/supabase'
import { Button, Card, ErrorNote } from './ui'

export default function PrivacyPanel() {
  const [confirm, setConfirm] = useState(''); const [err, setErr] = useState(''); const [busy, setBusy] = useState(false)
  async function exportData() {
    setErr('')
    try { download(new Blob([JSON.stringify(await api('/privacy/export'), null, 2)], { type: 'application/json' }), 'my-medicare-data.json') } catch (e: any) { setErr(e.message) }
  }
  async function remove() {
    setBusy(true); setErr('')
    try { await api('/privacy/account', { method: 'DELETE', body: { confirm } }); await supabase.auth.signOut() } catch (e: any) { setErr(e.message); setBusy(false) }
  }
  return (
    <Card className="mt-6">
      <h2 className="text-lg font-semibold">Your data</h2>
      <p className="text-sm text-muted mb-3">Download everything we hold about you, or permanently delete your account and records.</p>
      <Button variant="soft" onClick={exportData}>Download my data</Button>
      <div className="mt-5 border-t border-line pt-4">
        <p className="text-sm mb-2">To delete your account, type <b>DELETE</b>. This cannot be undone.</p>
        <div className="flex gap-2 flex-wrap"><input aria-label="Type DELETE to confirm" value={confirm} onChange={(e) => setConfirm(e.target.value)} className="rounded-xl border border-line px-3 py-2.5" />
          <Button variant="danger" disabled={confirm !== 'DELETE'} loading={busy} onClick={remove}>Delete my account</Button></div>
      </div>
      <div className="mt-3"><ErrorNote msg={err} /></div>
    </Card>
  )
}
