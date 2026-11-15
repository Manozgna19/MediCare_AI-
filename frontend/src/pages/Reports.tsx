import { useRef, useState, DragEvent } from 'react'
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { FileUp, Send, TrendingDown, TrendingUp } from 'lucide-react'
import { api } from '../lib/api'
import { useLang, short, useToast } from '../lib/ctx'
import { useLoad } from '../hooks/useLoad'
import { fmtDate } from '../lib/format'
import { Badge, Button, Card, Empty, ErrorNote, Notice, PageHeader, Segmented, Skeleton } from '../components/ui'

function Ask({ id }: { id: string }) {
  const { lang } = useLang(); const [q, setQ] = useState(''); const [a, setA] = useState(''); const [busy, setBusy] = useState(false); const [err, setErr] = useState('')
  async function go() { setBusy(true); setErr(''); try { setA((await api(`/reports/${id}/ask`, { body: { question: q, language: short(lang) } })).answer) } catch (e: any) { setErr(e.message) } finally { setBusy(false) } }
  return (
    <div className="space-y-3"><div className="flex gap-2"><input aria-label="Ask about this report" value={q} maxLength={500} onChange={(e) => setQ(e.target.value)} placeholder="e.g. What does my HbA1c mean?" className="flex-1 rounded-xl border border-line px-3.5 py-2.5" />
      <Button loading={busy} disabled={q.trim().length < 3} onClick={go} aria-label="Ask"><Send className="h-4 w-4" /></Button></div>
      <ErrorNote msg={err} />{a && <p className="rounded-xl bg-sunken p-3.5 whitespace-pre-wrap">{a}</p>}
      <p className="text-xs text-muted">Answers come only from this document. Confirm anything important with your doctor.</p></div>
  )
}

function ReportCard({ r, onImport }: { r: any; onImport: (id: string) => void }) {
  const p = r.parsed ?? {}; const [tab, setTab] = useState('summary')
  const tabs = [{ value: 'summary', label: 'Summary' }, ...(p.medications?.length ? [{ value: 'meds', label: 'Medicines' }] : []), ...(p.lab_results?.length ? [{ value: 'labs', label: 'Lab values' }] : []), { value: 'ask', label: 'Ask' }]
  return (
    <Card className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2"><div><h2 className="text-lg font-semibold capitalize">{(r.doc_type ?? 'document').replace(/_/g, ' ')}</h2><p className="text-sm text-muted">{fmtDate(r.created_at)}{p.doctor ? `, ${p.doctor}` : ''}</p></div>
        <Segmented label="Report sections" value={tab} onChange={setTab} options={tabs} /></div>
      {tab === 'summary' && <div className="space-y-3">{r.summary && <p className="leading-relaxed">{r.summary}</p>}
        {p.things_to_ask_doctor?.length > 0 && <div><h3 className="font-semibold mb-1">Questions to ask your doctor</h3><ul className="list-disc ml-5 text-sm space-y-1">{p.things_to_ask_doctor.map((q: string, i: number) => <li key={i}>{q}</li>)}</ul></div>}
        {p.low_confidence_fields?.length > 0 && <Notice tone="warn">Some fields were hard to read: {p.low_confidence_fields.join(', ')}. Please check the original.</Notice>}</div>}
      {tab === 'meds' && <div className="space-y-3"><div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr className="text-left text-muted"><th className="pb-2">Medicine</th><th>Dose</th><th>How often</th><th>Notes</th></tr></thead>
        <tbody>{p.medications.map((m: any, i: number) => <tr key={i} className="border-t border-line"><td className="py-2 font-semibold">{m.name}</td><td>{m.dose}</td><td>{m.frequency}</td><td>{m.duration ?? m.instructions}</td></tr>)}</tbody></table></div>
        <Button variant="soft" onClick={() => onImport(r.id)}>Add these to my medicines</Button></div>}
      {tab === 'labs' && <div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr className="text-left text-muted"><th className="pb-2">Test</th><th>Result</th><th>Normal range</th><th>Flag</th></tr></thead>
        <tbody>{p.lab_results.map((t: any, i: number) => { const bad = t.flag && !['normal', 'none'].includes(String(t.flag).toLowerCase()); return <tr key={i} className="border-t border-line"><td className="py-2 font-semibold">{t.test}</td><td>{t.value} {t.unit}</td><td className="text-muted">{t.reference_range}</td><td>{t.flag && <Badge tone={bad ? 'danger' : 'ok'}>{t.flag}</Badge>}</td></tr> })}</tbody></table></div>}
      {tab === 'ask' && <Ask id={r.id} />}
    </Card>
  )
}

export default function Reports() {
  const { lang } = useLang(); const toast = useToast(); const input = useRef<HTMLInputElement>(null)
  const [tab, setTab] = useState<'docs' | 'trends'>('docs'); const [busy, setBusy] = useState(false); const [err, setErr] = useState(''); const [over, setOver] = useState(false)
  const list = useLoad(() => api('/reports'), []); const labs = useLoad(() => api('/reports/lab-trends'), [])

  async function scan(file?: File | null) {
    if (!file) return
    setBusy(true); setErr('')
    const form = new FormData(); form.append('file', file); form.append('language', short(lang))
    try { await api('/reports/scan', { form }); toast('Document scanned'); list.reload(); labs.reload() } catch (e: any) { setErr(e.message) } finally { setBusy(false); if (input.current) input.current.value = '' }
  }
  async function importMeds(id: string) {
    try { const r = await api(`/reports/${id}/import-medications`, { method: 'POST', body: {} }); toast(`${r.imported} medicine(s) added`)
      r.interactions?.length && toast(`Heads up: ${r.interactions[0].message}`, 'error') } catch (e: any) { toast(e.message, 'error') }
  }
  const onDrop = (e: DragEvent) => { e.preventDefault(); setOver(false); scan(e.dataTransfer.files?.[0]) }

  return (
    <>
      <PageHeader title="Reports and prescriptions" hint="Scan a photo or PDF. We read it, organise it, and explain it in simple words."
        actions={<Segmented label="View" value={tab} onChange={setTab} options={[{ value: 'docs', label: 'Documents' }, { value: 'trends', label: 'Lab trends' }]} />} />
      <div onDragOver={(e) => { e.preventDefault(); setOver(true) }} onDragLeave={() => setOver(false)} onDrop={onDrop}
        className={`mb-5 rounded-2xl border-2 border-dashed p-6 text-center transition ${over ? 'border-primary bg-primary-soft' : 'border-line bg-surface'}`}>
        <FileUp className="mx-auto h-8 w-8 text-primary" aria-hidden />
        <p className="mt-2 font-semibold">{busy ? 'Reading your document…' : 'Drop a prescription or report here'}</p><p className="text-sm text-muted">JPG, PNG or PDF, up to 10 MB. Use good light and a flat page.</p>
        <input ref={input} type="file" accept="image/*,application/pdf" capture="environment" aria-label="Choose file" className="sr-only" id="file" onChange={(e) => scan(e.target.files?.[0])} />
        <label htmlFor="file" className="mt-3 inline-block cursor-pointer"><span className={`inline-flex rounded-xl bg-primary px-4 py-2.5 font-semibold text-on-primary ${busy ? 'opacity-50' : 'hover:opacity-90'}`}>Choose file or take photo</span></label>
      </div>
      <ErrorNote msg={err} />
      {tab === 'docs' ? (
        <div className="space-y-4 mt-4">{list.loading && !list.data && <Skeleton className="h-40" />}
          {list.data?.length === 0 && <Card><Empty title="No documents yet" hint="Scanned prescriptions and lab reports appear here." /></Card>}
          {list.data?.map((r: any) => <ReportCard key={r.id} r={r} onImport={importMeds} />)}</div>
      ) : (
        <div className="grid md:grid-cols-2 gap-4 mt-4">
          {labs.data?.length === 0 && <Card className="md:col-span-2"><Empty title="No lab values yet" hint="Scan lab reports and we'll chart each test over time." /></Card>}
          {labs.data?.map((t: any) => (
            <Card key={t.test}><div className="flex items-start justify-between gap-2"><div><h3 className="font-semibold">{t.test}</h3><p className="text-sm text-muted">Normal: {t.reference_range ?? 'not listed'}</p></div>
              <div className="text-right"><p className="font-display text-2xl font-semibold">{t.latest} <span className="text-sm text-muted">{t.unit}</span></p>
                {t.change_pct != null && <p className={`flex items-center justify-end gap-1 text-xs font-semibold ${t.abnormal ? 'text-danger' : 'text-muted'}`}>{t.change_pct >= 0 ? <TrendingUp className="h-3.5 w-3.5" /> : <TrendingDown className="h-3.5 w-3.5" />}{Math.abs(t.change_pct)}% since first</p>}</div></div>
              {t.points.length > 1 ? <div className="h-36 mt-2" role="img" aria-label={`${t.test} over time`}><ResponsiveContainer><LineChart data={t.points.map((p: any) => ({ d: fmtDate(p.t), v: p.v }))}><CartesianGrid stroke="rgb(var(--line))" strokeDasharray="3 3" /><XAxis dataKey="d" tick={{ fontSize: 11 }} /><YAxis domain={['auto', 'auto']} tick={{ fontSize: 11 }} width={36} /><Tooltip /><Line dataKey="v" stroke="rgb(var(--primary))" strokeWidth={2.5} dot /></LineChart></ResponsiveContainer></div> : <p className="mt-3 text-sm text-muted">One result so far. Scan another report to see a trend.</p>}
            </Card>))}
        </div>)}
    </>
  )
}
