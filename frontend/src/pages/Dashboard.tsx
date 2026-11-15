import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowRight, Check, Pill, SkipForward } from 'lucide-react'
import { api } from '../lib/api'
import { useLoad } from '../hooks/useLoad'
import { useToast } from '../lib/ctx'
import { dayLabel, fmtTime, greeting, label, whenLabel } from '../lib/format'
import { Badge, Button, Card, Chip, Empty, ErrorNote, PageHeader, PageSkeleton, Ring, Stat } from '../components/ui'

const ROUTE: Record<string, string> = { doctors: '/doctors', summary: '/summary', analytics: '/analytics', reminders: '/reminders', sos: '/sos', profile: '/profile', family: '/family', reports: '/reports' }
const TYPES = [['all', 'All'], ['symptom', 'Symptoms'], ['vital', 'Readings'], ['dose', 'Doses'], ['appointment', 'Visits'], ['report', 'Reports']]
const STATUS_TONE: Record<string, 'ok' | 'warn' | 'danger' | 'neutral'> = { in_range: 'ok', high: 'danger', low: 'warn', 'n/a': 'neutral' }
const VITAL_LABEL: Record<string, string> = { systolic_bp: 'Systolic BP', diastolic_bp: 'Diastolic BP', heart_rate: 'Heart rate', blood_glucose: 'Glucose', weight_kg: 'Weight', spo2: 'SpO₂', temperature_c: 'Temp' }

export default function Dashboard() {
  const { data: d, error, loading, reload } = useLoad(() => api('/dashboard'))
  const toast = useToast(); const [filter, setFilter] = useState('all')
  const events = useMemo(() => (d?.timeline ?? []).filter((e: any) => filter === 'all' || e.type === filter), [d, filter])
  const groups = useMemo(() => { const m: Record<string, any[]> = {}; events.forEach((e: any) => (m[dayLabel(e.at)] ??= []).push(e)); return Object.entries(m) }, [events])

  async function mark(id: string, status: 'taken' | 'skipped') {
    try { await api(`/reminders/doses/${id}`, { body: { status } }); toast(status === 'taken' ? 'Marked as taken' : 'Marked as skipped'); reload() } catch (e: any) { toast(e.message, 'error') }
  }
  if (loading && !d) return <PageSkeleton />
  if (error || !d) return <ErrorNote msg={error} />

  const score = d.health_score.score; const tone = score >= 75 ? 'primary' : score >= 50 ? 'warn' : 'danger'
  const pending = d.today_doses.filter((x: any) => x.status === 'pending')
  const vitals = Object.entries(d.vitals) as [string, { latest: number; status: string }][]

  return (
    <>
      <PageHeader title={`${greeting()}${d.name ? `, ${d.name.split(' ')[0]}` : ''}`} hint={new Date().toLocaleDateString([], { weekday: 'long', day: 'numeric', month: 'long' })} />

      <div className="grid lg:grid-cols-3 gap-4">
        <Card className="flex gap-5 items-center">
          <Ring value={score} tone={tone}><div><p className="font-display text-4xl font-semibold leading-none">{score}</p><p className="text-xs text-muted mt-1">health score</p></div></Ring>
          <div className="min-w-0 flex-1 space-y-1.5">
            {d.health_score.parts.map((p: any) => (
              <div key={p.label}><div className="flex justify-between text-xs"><span className="text-muted">{p.label}</span><span className="font-semibold">{Math.round((100 * p.earned) / p.max)}%</span></div>
                <div className="h-1.5 rounded-full bg-sunken"><div className="h-1.5 rounded-full bg-primary" style={{ width: `${(100 * p.earned) / p.max}%` }} /></div></div>))}
          </div>
        </Card>

        <Card className="lg:col-span-2">
          <h2 className="font-semibold text-lg mb-3">What to do next</h2>
          {d.actions.length === 0 ? <Empty title="You're all caught up" hint="Nothing needs your attention right now." /> : (
            <ul className="divide-y divide-line">
              {d.actions.slice(0, 3).map((a: any) => (
                <li key={a.id} className="flex items-center justify-between gap-3 py-3 first:pt-0 last:pb-0">
                  <div className="min-w-0"><p className="font-semibold">{a.title}</p><p className="text-sm text-muted line-clamp-2">{a.why}</p></div>
                  <Link to={ROUTE[a.feature] ?? '/'} className="shrink-0"><Button size="sm" variant={a.priority <= 2 ? 'primary' : 'soft'} icon={<ArrowRight className="h-4 w-4" />}>{a.cta}</Button></Link>
                </li>))}
            </ul>)}
        </Card>
      </div>

      <div className="grid md:grid-cols-2 gap-4 mt-4">
        <Card>
          <div className="flex items-center justify-between mb-3"><h2 className="font-semibold text-lg">Doses today</h2>
            {d.adherence.pct != null && <Badge tone={d.adherence.pct >= 80 ? 'ok' : 'warn'}>{d.adherence.pct}% taken this month</Badge>}</div>
          {d.today_doses.length === 0 && d.upcoming_reminders.length === 0 ? <Empty icon={<Pill className="h-5 w-5" />} title="No doses scheduled" hint="Add a medicine with reminder times in your profile." action={<Link to="/profile"><Button size="sm" variant="soft">Add medicine</Button></Link>} /> : (
            <ul className="space-y-2">
              {d.today_doses.map((x: any) => (
                <li key={x.id} className="flex items-center justify-between gap-2 rounded-xl bg-sunken px-3 py-2">
                  <div><p className="font-medium">{x.title}</p><p className="text-xs text-muted">{fmtTime(x.scheduled_for)}</p></div>
                  {x.status === 'pending' ? (
                    <div className="flex gap-1.5"><Button size="sm" onClick={() => mark(x.id, 'taken')} icon={<Check className="h-4 w-4" />}>Taken</Button>
                      <Button size="sm" variant="ghost" aria-label={`Skip ${x.title}`} onClick={() => mark(x.id, 'skipped')}><SkipForward className="h-4 w-4" /></Button></div>
                  ) : <Badge tone={x.status === 'taken' ? 'ok' : 'neutral'}>{x.status}</Badge>}
                </li>))}
              {d.upcoming_reminders.filter((r: any) => r.kind === 'medication').slice(0, 3).map((r: any) => (
                <li key={r.id} className="flex items-center justify-between rounded-xl border border-dashed border-line px-3 py-2"><p className="font-medium text-muted">{r.title}</p><p className="text-xs text-muted">{whenLabel(r.remind_at)}</p></li>))}
            </ul>)}
          {pending.length > 0 && <p className="text-xs text-muted mt-2">{pending.length} waiting for you</p>}
        </Card>

        <Card>
          <h2 className="font-semibold text-lg mb-3">Latest readings</h2>
          {vitals.length === 0 ? <Empty title="No readings yet" hint="Log blood pressure, glucose or weight to see trends." action={<Link to="/analytics"><Button size="sm" variant="soft">Log a reading</Button></Link>} /> : (
            <div className="grid grid-cols-2 gap-2.5">
              {vitals.slice(0, 6).map(([k, v]) => <Stat key={k} label={VITAL_LABEL[k] ?? label(k)} value={v.latest} sub={v.status === 'n/a' ? undefined : v.status.replace('_', ' ')} tone={STATUS_TONE[v.status]} />)}
            </div>)}
          {d.insights[0] && <p className="mt-3 rounded-xl bg-warn-soft text-warn text-sm px-3 py-2">{d.insights[0]}</p>}
        </Card>
      </div>

      {d.upcoming_appointments.length > 0 && (
        <Card className="mt-4" tone="primary"><h2 className="font-semibold text-lg mb-2">Upcoming visit</h2>
          {d.upcoming_appointments.map((a: any) => <p key={a.id}><span className="font-semibold">{a.doctors?.name}</span> <span className="text-muted">{a.doctors?.specialty}</span>, {whenLabel(a.scheduled_at)}</p>)}
        </Card>)}

      <Card className="mt-4">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-4"><h2 className="font-semibold text-lg">Your timeline</h2>
          <div className="flex flex-wrap gap-1.5">{TYPES.map(([v, l]) => <Chip key={v} on={filter === v} onClick={() => setFilter(v)}>{l}</Chip>)}</div></div>
        {groups.length === 0 ? <Empty title="Nothing here yet" hint="Symptom checks, readings, doses and visits will appear as you use the app." /> : groups.map(([day, list]) => (
          <div key={day} className="mb-5 last:mb-0"><p className="text-sm font-semibold text-muted mb-2">{day}</p>
            <ul className="space-y-2">{list.map((e: any, i: number) => (
              <li key={i} className="flex items-start justify-between gap-3 rounded-xl bg-sunken px-3.5 py-2.5">
                <div className="min-w-0"><p className="font-medium capitalize truncate">{label(e.title)}</p>{e.type !== 'vital' && e.detail && <p className="text-sm text-muted line-clamp-1">{label(String(e.detail))}</p>}</div>
                <div className="text-right shrink-0"><Badge tone="info">{e.type}</Badge>{e.type === 'vital' && <p className="text-sm font-semibold mt-0.5">{e.detail}</p>}</div>
              </li>))}</ul></div>))}
      </Card>
    </>
  )
}
