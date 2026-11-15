import { FormEvent, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Plus } from 'lucide-react'
import { api } from '../lib/api'
import { useToast } from '../lib/ctx'
import { useLoad } from '../hooks/useLoad'
import { Button, Card, Chip, ErrorNote, Field, Notice, PageHeader, PageSkeleton, Ring, Select, Stat, Switch, TagInput } from '../components/ui'
import PrivacyPanel from '../components/PrivacyPanel'

const CONSENT = ['profile', 'medications', 'symptoms', 'reports', 'family', 'vitals']
const PRESETS = [['Morning', '08:00'], ['Afternoon', '14:00'], ['Evening', '18:00'], ['Night', '21:00']]
function nextOccurrence(hhmm: string) { const [h, m] = hhmm.split(':').map(Number); const d = new Date(); d.setHours(h, m, 0, 0); if (d.getTime() < Date.now()) d.setDate(d.getDate() + 1); return d.toISOString() }

export default function Profile() {
  const toast = useToast(); const prof = useLoad(() => api('/profile'), []); const meds = useLoad(async () => (await api('/medications')).filter((m: any) => m.active), [])
  const ints = useLoad(() => api('/medications/interactions'), [])
  const [p, setP] = useState<any>(null); const [saving, setSaving] = useState(false); const [err, setErr] = useState('')
  const [med, setMed] = useState({ name: '', dose: '', frequency: '' }); const [times, setTimes] = useState<string[]>([]); const [custom, setCustom] = useState(''); const [warn, setWarn] = useState<string[]>([])
  useEffect(() => { if (prof.data) setP({ allergies: [], conditions: [], ai_consent: {}, ...prof.data }) }, [prof.data])
  if (!p) return <PageSkeleton />
  const set = (k: string, v: any) => setP({ ...p, [k]: v })
  const bmi = p.height_cm && p.weight_kg ? +(p.weight_kg / (p.height_cm / 100) ** 2).toFixed(1) : null
  const comp = prof.data?.completeness

  async function save(e: FormEvent) {
    e.preventDefault(); setSaving(true); setErr('')
    try { const { id, created_at, completeness, ...body } = p; await api('/profile', { method: 'PUT', body }); toast('Profile saved'); prof.reload() } catch (er: any) { setErr(er.message) } finally { setSaving(false) }
  }
  async function addMed(e: FormEvent) {
    e.preventDefault()
    try {
      const r = await api('/medications', { body: { ...med, reminder_times: times.map(nextOccurrence) } })
      setWarn([...(r.warnings ?? []), ...(r.interactions ?? []).map((i: any) => `${i.meds.join(' + ')}: ${i.message}`)])
      setMed({ name: '', dose: '', frequency: '' }); setTimes([]); meds.reload(); ints.reload(); toast(times.length ? 'Medicine added with reminders' : 'Medicine added')
    } catch (er: any) { toast(er.message, 'error') }
  }
  const num = (k: string) => (e: any) => set(k, e.target.value === '' ? null : +e.target.value)

  return (
    <>
      <PageHeader title="My profile" hint="Used to make guidance fit you. Your data is private to your account." />
      {comp && comp.pct < 100 && (
        <Card tone="primary" className="mb-4 flex items-center gap-5"><Ring value={comp.pct} size={84} stroke={9}><span className="font-display text-xl font-semibold">{comp.pct}%</span></Ring>
          <div><p className="font-semibold">Your profile is {comp.pct}% complete</p><p className="text-sm text-muted">Still missing: {comp.missing.slice(0, 4).join(', ')}.</p></div></Card>)}
      <form onSubmit={save} className="space-y-4">
        <Card><h2 className="font-semibold text-lg mb-3">About you</h2><div className="grid sm:grid-cols-4 gap-4">
          <Field className="sm:col-span-2" label="Full name" value={p.full_name ?? ''} onChange={(e) => set('full_name', e.target.value)} autoComplete="name" />
          <Field label="Age" type="number" min={0} max={120} value={p.age ?? ''} onChange={num('age')} />
          <Select label="Sex" value={p.sex ?? ''} onChange={(e) => set('sex', e.target.value)}><option value="">Select</option><option value="female">Female</option><option value="male">Male</option><option value="other">Other</option></Select>
          <Select label="Blood group" value={p.blood_group ?? ''} onChange={(e) => set('blood_group', e.target.value)}><option value="">Unknown</option>{['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'].map((b) => <option key={b}>{b}</option>)}</Select></div></Card>
        <Card><h2 className="font-semibold text-lg mb-3">Body and lifestyle</h2><div className="grid sm:grid-cols-4 gap-4 items-end">
          <Field label="Height (cm)" type="number" value={p.height_cm ?? ''} onChange={num('height_cm')} /><Field label="Weight (kg)" type="number" step="0.1" value={p.weight_kg ?? ''} onChange={num('weight_kg')} />
          <Field label="Waist (cm)" type="number" value={p.waist_cm ?? ''} onChange={num('waist_cm')} hint="Used for diabetes risk" />{bmi && <Stat label="BMI" value={bmi} sub={bmi < 18.5 ? 'under' : bmi < 25 ? 'healthy' : bmi < 30 ? 'over' : 'obese range'} />}
          <Select className="sm:col-span-2" label="How active are you?" value={p.activity_level ?? ''} onChange={(e) => set('activity_level', e.target.value || null)}><option value="">Select</option><option value="vigorous">Vigorous exercise or heavy physical work</option><option value="moderate">Moderate exercise or work</option><option value="mild">Light activity</option><option value="sedentary">Mostly sitting, no exercise</option></Select>
          <div className="sm:col-span-2"><Switch label="I smoke or chew tobacco" checked={!!p.smoker} onChange={(v) => set('smoker', v)} /></div></div></Card>
        <Card className="grid md:grid-cols-2 gap-4"><TagInput label="Allergies" value={p.allergies ?? []} onChange={(v) => set('allergies', v)} placeholder="Type and press Enter, e.g. penicillin" />
          <TagInput label="Health conditions" value={p.conditions ?? []} onChange={(v) => set('conditions', v)} placeholder="e.g. type 2 diabetes" /></Card>
        <Card><h2 className="font-semibold text-lg">What the assistant may use</h2><p className="text-sm text-muted mb-2">Switch off anything you don't want the AI to see when helping you.</p>
          <div className="grid sm:grid-cols-2 gap-x-8">{CONSENT.map((c) => <Switch key={c} label={c} checked={p.ai_consent?.[c] ?? true} onChange={(v) => set('ai_consent', { ...p.ai_consent, [c]: v })} />)}</div></Card>
        <ErrorNote msg={err} /><Button size="lg" loading={saving}>Save profile</Button>
      </form>

      <h2 className="text-2xl font-semibold mt-10 mb-3">Medicines</h2>
      {ints.data?.length > 0 && <div className="mb-3 space-y-2">{ints.data.map((i: any, k: number) => <Notice key={k} tone={i.severity === 'high' ? 'danger' : 'warn'}><b>{i.meds.join(' + ')}:</b> {i.message} Ask your doctor or pharmacist.</Notice>)}</div>}
      <Card>
        <ul className="mb-5 divide-y divide-line">{meds.data?.length === 0 && <li className="py-2 text-muted">No medicines added yet.</li>}
          {meds.data?.map((m: any) => <li key={m.id} className="flex items-center justify-between py-2.5"><span><b>{m.name}</b> <span className="text-muted">{m.dose} {m.frequency}</span></span>
            <button className="text-sm font-medium text-danger" onClick={() => api(`/medications/${m.id}/stop`, { method: 'PATCH' }).then(() => { meds.reload(); ints.reload() })}>Stop</button></li>)}</ul>
        {warn.map((w, i) => <div key={i} className="mb-2"><Notice tone="warn">{w}</Notice></div>)}
        <form onSubmit={addMed} className="space-y-3"><div className="grid sm:grid-cols-3 gap-3"><Field label="Medicine" required value={med.name} onChange={(e) => setMed({ ...med, name: e.target.value })} />
          <Field label="Dose" value={med.dose} onChange={(e) => setMed({ ...med, dose: e.target.value })} placeholder="500 mg" /><Field label="Frequency" value={med.frequency} onChange={(e) => setMed({ ...med, frequency: e.target.value })} placeholder="Twice daily" /></div>
          <div><p className="text-sm font-medium mb-1.5">Remind me daily at</p><div className="flex flex-wrap items-center gap-1.5">
            {PRESETS.map(([l, t]) => <Chip key={t} on={times.includes(t)} onClick={() => setTimes(times.includes(t) ? times.filter((x) => x !== t) : [...times, t])}>{l} {t}</Chip>)}
            {times.filter((t) => !PRESETS.some(([, x]) => x === t)).map((t) => <Chip key={t} on onClick={() => setTimes(times.filter((x) => x !== t))}>{t}</Chip>)}
            <input type="time" aria-label="Custom reminder time" value={custom} onChange={(e) => setCustom(e.target.value)} className="rounded-xl border border-line px-2 py-1.5" />
            <Button type="button" size="sm" variant="soft" disabled={!custom} onClick={() => { if (!times.includes(custom)) setTimes([...times, custom]); setCustom('') }} icon={<Plus className="h-4 w-4" />}>Add time</Button></div></div>
          <Button>Add medicine</Button></form>
        <p className="mt-3 text-xs text-muted">We check new medicines against your allergies and other medicines. This is a basic screen, not a replacement for a pharmacist. <Link className="underline" to="/reminders">Manage reminders</Link></p>
      </Card>
      <PrivacyPanel />
    </>
  )
}
