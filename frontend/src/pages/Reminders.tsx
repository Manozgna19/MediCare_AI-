import { FormEvent, useState } from 'react'
import { BellRing, Check, Clock, SkipForward, Sparkles } from 'lucide-react'
import { api } from '../lib/api'
import { enablePush } from '../lib/firebase'
import { useToast } from '../lib/ctx'
import { useLoad } from '../hooks/useLoad'
import { fmtTime, whenLabel } from '../lib/format'
import { Badge, Button, Card, Empty, ErrorNote, Field, PageHeader, Ring, Segmented, Select } from '../components/ui'

export default function Reminders() {
  const toast = useToast(); const [tab, setTab] = useState<'today' | 'all' | 'adherence'>('today')
  const doses = useLoad(() => api('/reminders/doses'), []); const list = useLoad(() => api('/reminders'), []); const adh = useLoad(() => api('/reminders/adherence'), [])
  const [f, setF] = useState({ title: '', remind_at: '', recurrence: 'none' }); const [err, setErr] = useState('')
  const refresh = () => { doses.reload(); adh.reload() }

  const mark = (id: string, status: 'taken' | 'skipped') => api(`/reminders/doses/${id}`, { body: { status } }).then(() => { toast(status === 'taken' ? 'Marked as taken' : 'Skipped'); refresh() }).catch((e) => toast(e.message, 'error'))
  const snooze = (id: string) => api(`/reminders/doses/${id}/snooze`, { body: { minutes: 10 } }).then(() => { toast("We'll remind you again in 10 minutes", 'info'); refresh() }).catch((e) => toast(e.message, 'error'))
  async function add(e: FormEvent) { e.preventDefault(); setErr(''); try { await api('/reminders', { body: { ...f, kind: 'custom', remind_at: new Date(f.remind_at).toISOString() } }); setF({ title: '', remind_at: '', recurrence: 'none' }); list.reload(); toast('Reminder added') } catch (er: any) { setErr(er.message) } }
  async function push() { try { await enablePush(); toast('Notifications are on for this device') } catch (e: any) { toast(e.message, 'error') } }
  async function screenings() { const r = await api('/reminders/screenings/generate', { method: 'POST', body: {} }); toast(r.created ? `${r.created} check-up reminder(s) added` : 'Your check-ups are already set up', 'info'); list.reload() }

  const a = adh.data; const pending = doses.data?.logged.filter((d: any) => d.status === 'pending') ?? []
  const done = doses.data?.logged.filter((d: any) => d.status !== 'pending') ?? []

  return (
    <>
      <PageHeader title="Reminders" hint="Medicines, appointments and routine check-ups, with a record of what you took."
        actions={<Segmented label="View" value={tab} onChange={setTab} options={[{ value: 'today', label: 'Today', badge: pending.length || undefined }, { value: 'all', label: 'All reminders' }, { value: 'adherence', label: 'Adherence' }]} />} />

      {tab === 'today' && (
        <div className="space-y-4">
          <Card><h2 className="mb-3 text-lg font-semibold">Due now</h2>
            {pending.length === 0 ? <Empty icon={<Check className="h-5 w-5" />} title="Nothing due" hint="Doses appear here when their reminder goes off." /> : <ul className="space-y-2">{pending.map((d: any) => (
              <li key={d.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-primary-soft px-4 py-3"><div><p className="font-semibold">{d.title}</p><p className="text-sm text-muted">Due at {fmtTime(d.scheduled_for)}</p></div>
                <div className="flex gap-1.5"><Button size="sm" icon={<Check className="h-4 w-4" />} onClick={() => mark(d.id, 'taken')}>Taken</Button><Button size="sm" variant="ghost" icon={<Clock className="h-4 w-4" />} onClick={() => snooze(d.id)}>10 min</Button>
                  <Button size="sm" variant="ghost" aria-label={`Skip ${d.title}`} onClick={() => mark(d.id, 'skipped')}><SkipForward className="h-4 w-4" /></Button></div></li>))}</ul>}</Card>
          <div className="grid md:grid-cols-2 gap-4">
            <Card><h2 className="mb-3 text-lg font-semibold">Coming up today</h2>{doses.data?.upcoming.length ? <ul className="space-y-2">{doses.data.upcoming.map((u: any) => <li key={u.id} className="flex justify-between rounded-xl bg-sunken px-3.5 py-2.5"><span className="font-medium">{u.title}</span><span className="text-muted">{whenLabel(u.remind_at)}</span></li>)}</ul> : <p className="text-muted">No more doses in the next 12 hours.</p>}</Card>
            <Card><h2 className="mb-3 text-lg font-semibold">Already logged</h2>{done.length ? <ul className="space-y-2">{done.map((d: any) => <li key={d.id} className="flex items-center justify-between rounded-xl bg-sunken px-3.5 py-2.5"><span className="font-medium">{d.title}</span><Badge tone={d.status === 'taken' ? 'ok' : 'neutral'}>{d.status}</Badge></li>)}</ul> : <p className="text-muted">Nothing logged yet.</p>}</Card></div>
        </div>)}

      {tab === 'all' && (
        <div className="space-y-4">
          <Card className="flex flex-wrap gap-2"><Button variant="soft" icon={<BellRing className="h-4 w-4" />} onClick={push}>Turn on notifications</Button><Button variant="soft" icon={<Sparkles className="h-4 w-4" />} onClick={screenings}>Suggest check-ups for me</Button></Card>
          <Card><form onSubmit={add} className="grid sm:grid-cols-4 gap-3 items-end"><Field label="Reminder" required maxLength={120} value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} />
            <Field label="When" type="datetime-local" required value={f.remind_at} onChange={(e) => setF({ ...f, remind_at: e.target.value })} />
            <Select label="Repeat" value={f.recurrence} onChange={(e) => setF({ ...f, recurrence: e.target.value })}><option value="none">Once</option><option value="daily">Daily</option><option value="weekly">Weekly</option><option value="yearly">Yearly</option></Select><Button>Add</Button></form>
            <div className="mt-2"><ErrorNote msg={err} /></div></Card>
          <Card>{list.data?.length === 0 ? <Empty title="No reminders yet" /> : <ul className="divide-y divide-line">{list.data?.map((r: any) => (
            <li key={r.id} className="flex items-center justify-between gap-3 py-2.5"><div><p className="font-semibold">{r.title} <Badge tone="info">{r.kind}</Badge></p><p className="text-sm text-muted">{whenLabel(r.remind_at)}{r.recurrence !== 'none' && `, repeats ${r.recurrence}`}</p></div>
              <button className="text-sm font-medium text-danger" onClick={() => api(`/reminders/${r.id}`, { method: 'DELETE' }).then(() => list.reload())}>Delete</button></li>))}</ul>}</Card>
        </div>)}

      {tab === 'adherence' && (a?.total ? (
        <div className="space-y-4">
          <div className="grid md:grid-cols-3 gap-4">
            <Card className="flex items-center gap-4"><Ring value={a.pct} tone={a.pct >= 80 ? 'primary' : a.pct >= 60 ? 'warn' : 'danger'} size={110}><span className="font-display text-3xl font-semibold">{a.pct}%</span></Ring><div><p className="font-semibold">Doses taken</p><p className="text-sm text-muted">{a.taken} of {a.total} in 30 days</p></div></Card>
            <Card><p className="text-sm text-muted">Current streak</p><p className="font-display text-4xl font-semibold">{a.streak_days} <span className="text-lg text-muted">{a.streak_days === 1 ? 'day' : 'days'}</span></p><p className="text-sm text-muted">of every dose taken</p></Card>
            <Card><p className="mb-2 font-semibold">By medicine</p><ul className="space-y-2">{a.per_medicine.map((m: any) => <li key={m.title}><div className="flex justify-between text-sm"><span>{m.title}</span><span className="font-semibold">{m.pct}%</span></div><div className="h-1.5 rounded-full bg-sunken"><div className="h-1.5 rounded-full bg-primary" style={{ width: `${m.pct}%` }} /></div></li>)}</ul></Card></div>
          <Card><p className="mb-3 font-semibold">Last 30 days</p><div className="flex flex-wrap gap-1.5" role="img" aria-label="Daily adherence calendar">{a.by_day.map((d: any) => { const r = d.taken / d.total; return <div key={d.date} title={`${d.date}: ${d.taken}/${d.total}`} className={`h-7 w-7 rounded-md ${r === 1 ? 'bg-primary' : r >= 0.5 ? 'bg-accent' : 'bg-danger/70'}`} /> })}</div>
            <p className="mt-3 flex flex-wrap gap-4 text-xs text-muted"><span><i className="mr-1 inline-block h-2.5 w-2.5 rounded-sm bg-primary" />all taken</span><span><i className="mr-1 inline-block h-2.5 w-2.5 rounded-sm bg-accent" />some missed</span><span><i className="mr-1 inline-block h-2.5 w-2.5 rounded-sm bg-danger/70" />mostly missed</span></p></Card></div>
      ) : <Card><Empty title="No dose history yet" hint="Add a medicine with reminder times. When reminders go off, mark each dose taken and we'll track your streak." /></Card>)}
    </>
  )
}
