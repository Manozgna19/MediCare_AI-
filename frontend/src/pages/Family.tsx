import { FormEvent, useState } from 'react'
import { BellPlus, Trash2 } from 'lucide-react'
import { api } from '../lib/api'
import { useToast } from '../lib/ctx'
import { useLoad } from '../hooks/useLoad'
import { Badge, Button, Card, Empty, ErrorNote, Field, Notice, PageHeader, Select } from '../components/ui'
import Pedigree from '../components/Pedigree'

const RELATIONS = ['mother', 'father', 'sister', 'brother', 'grandmother', 'grandfather', 'aunt', 'uncle', 'daughter', 'son']
const COMMON = ['Type 2 diabetes', 'Heart disease', 'Hypertension', 'Stroke', 'Breast cancer', 'Colon cancer', 'Asthma', 'Kidney disease', 'Thalassemia']
const TONE: Record<string, 'danger' | 'warn' | 'ok'> = { higher: 'danger', elevated: 'warn', mild: 'ok' }

export default function Family() {
  const toast = useToast(); const entries = useLoad(() => api('/family'), []); const an = useLoad(() => api('/family/analysis'), [])
  const [f, setF] = useState({ relation: 'mother', condition: '', age_at_diagnosis: '', side: '' }); const [err, setErr] = useState('')
  const reload = () => { entries.reload(); an.reload() }
  const isGrand = f.relation === 'grandmother' || f.relation === 'grandfather'

  async function add(e: FormEvent) {
    e.preventDefault(); setErr('')
    try { await api('/family', { body: { relation: f.relation, condition: f.condition, age_at_diagnosis: f.age_at_diagnosis ? +f.age_at_diagnosis : null, side: isGrand && f.side ? f.side : null } }); setF({ ...f, condition: '', age_at_diagnosis: '' }); reload(); toast('Added to your family history') }
    catch (er: any) { setErr(er.message) }
  }
  async function remind(topic: string) {
    const at = new Date(); at.setDate(at.getDate() + 30); at.setHours(10, 0, 0, 0)
    try { await api('/reminders', { body: { kind: 'screening', title: `Discuss ${topic.toLowerCase()} screening with your doctor`, body: 'Based on your family history.', remind_at: at.toISOString(), recurrence: 'yearly' } }); toast('Reminder set for next month') } catch (e: any) { toast(e.message, 'error') }
  }

  return (
    <>
      <PageHeader title="Family health history" hint="Record conditions in your relatives to learn which check-ups are worth discussing with your doctor." />
      <Card><form onSubmit={add} className="grid sm:grid-cols-5 gap-3 items-end">
        <Select label="Relative" value={f.relation} onChange={(e) => setF({ ...f, relation: e.target.value })}>{RELATIONS.map((r) => <option key={r} className="capitalize">{r}</option>)}</Select>
        <div className="sm:col-span-2"><Field label="Condition" required list="conds" value={f.condition} onChange={(e) => setF({ ...f, condition: e.target.value })} placeholder="Type 2 diabetes" /><datalist id="conds">{COMMON.map((c) => <option key={c} value={c} />)}</datalist></div>
        <Field label="Age at diagnosis" type="number" min={0} max={120} value={f.age_at_diagnosis} onChange={(e) => setF({ ...f, age_at_diagnosis: e.target.value })} />
        {isGrand ? <Select label="Side" value={f.side} onChange={(e) => setF({ ...f, side: e.target.value })}><option value="">Father's side</option><option value="maternal">Mother's side</option></Select> : <Button>Add</Button>}
        {isGrand && <Button className="sm:col-start-5">Add</Button>}</form><div className="mt-2"><ErrorNote msg={err} /></div></Card>

      <div className="mt-4 grid lg:grid-cols-[1.2fr_1fr] gap-4">
        <Card><h2 className="mb-2 text-lg font-semibold">Family tree</h2>
          {entries.data?.length === 0 ? <Empty title="Nothing recorded yet" hint="Add a relative and condition to see your tree." /> : <Pedigree entries={entries.data ?? []} />}
          {entries.data?.length > 0 && <ul className="mt-4 divide-y divide-line">{entries.data.map((e: any) => <li key={e.id} className="flex items-center justify-between py-2"><span className="capitalize"><b>{e.relation}</b>{e.side === 'maternal' && ' (mother’s side)'}: {e.condition}{e.age_at_diagnosis ? `, age ${e.age_at_diagnosis}` : ''}</span>
            <button aria-label={`Remove ${e.relation} ${e.condition}`} className="rounded-lg p-1.5 text-muted hover:bg-sunken hover:text-danger" onClick={() => api(`/family/${e.id}`, { method: 'DELETE' }).then(reload)}><Trash2 className="h-4 w-4" /></button></li>)}</ul>}</Card>

        <div className="space-y-3"><h2 className="text-lg font-semibold">What this may mean</h2>
          {!an.data || an.data.results.length === 0 ? <Card><Empty title="No insights yet" hint="Add a condition to see educational insights." /></Card> : an.data.results.map((r: any) => (
            <Card key={r.condition}><div className="flex items-center justify-between gap-2"><h3 className="font-semibold">{r.topic}</h3><Badge tone={TONE[r.concern_level]}>{r.concern_level}</Badge></div>
              <p className="mt-0.5 text-sm text-muted capitalize">{r.relatives.join(', ')}</p><p className="mt-2 text-sm">{r.education}</p>
              <ul className="mt-2 list-disc ml-5 text-sm space-y-1">{r.actions.map((a: string, i: number) => <li key={i}>{a}</li>)}</ul>
              {r.concern_level !== 'mild' && <Button size="sm" variant="soft" className="mt-3" icon={<BellPlus className="h-4 w-4" />} onClick={() => remind(r.topic)}>Remind me to ask my doctor</Button>}</Card>))}
          {an.data && <Notice tone="info">{an.data.disclaimer}</Notice>}</div>
      </div>
    </>
  )
}
