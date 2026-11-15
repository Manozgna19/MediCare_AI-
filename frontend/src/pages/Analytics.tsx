import { FormEvent, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Area, CartesianGrid, ComposedChart, Line, ReferenceArea, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { Sparkles, Trash2 } from 'lucide-react'
import { api } from '../lib/api'
import { useLang, short, useToast } from '../lib/ctx'
import { useLoad } from '../hooks/useLoad'
import { fmtDate, fmtDateTime, label } from '../lib/format'
import { Badge, Button, Card, Chip, Empty, ErrorNote, Field, Notice, PageHeader, PageSkeleton, Stat } from '../components/ui'

const KINDS = ['bp', 'heart_rate', 'blood_glucose', 'weight_kg', 'spo2', 'temperature_c']
const NAMES: Record<string, string> = { bp: 'Blood pressure', heart_rate: 'Heart rate', blood_glucose: 'Glucose', weight_kg: 'Weight', spo2: 'Oxygen (SpO₂)', temperature_c: 'Temperature' }
const UNITS: Record<string, string> = { heart_rate: 'bpm', blood_glucose: 'mg/dL', weight_kg: 'kg', spo2: '%', temperature_c: '°C', systolic_bp: 'mmHg', diastolic_bp: 'mmHg' }
const RISK_TONE: Record<string, 'ok' | 'warn' | 'danger'> = { low: 'ok', moderate: 'warn', high: 'danger' }

export default function Analytics() {
  const { lang } = useLang(); const toast = useToast()
  const data = useLoad(() => api(`/analytics?language=${short(lang)}`), []); const recent = useLoad(() => api('/vitals?limit=8'), [])
  const [kind, setKind] = useState('bp'); const [chart, setChart] = useState('systolic_bp'); const [val, setVal] = useState(''); const [sys, setSys] = useState(''); const [dia, setDia] = useState('')
  const [err, setErr] = useState(''); const [explain, setExplain] = useState(''); const [busy, setBusy] = useState(false)
  const reload = () => { data.reload(); recent.reload() }

  async function add(e: FormEvent) {
    e.preventDefault(); setErr('')
    try {
      if (kind === 'bp') { await api('/vitals/bp', { body: { systolic: +sys, diastolic: +dia } }); setSys(''); setDia(''); setChart('systolic_bp') }
      else { await api('/vitals', { body: { kind, value: +val } }); setVal(''); setChart(kind) }
      toast('Reading saved'); reload()
    } catch (er: any) { setErr(er.message) }
  }
  async function explainIt() { setBusy(true); try { setExplain((await api(`/analytics?explain=true&language=${short(lang)}`)).explanation ?? '') } catch (e: any) { toast(e.message, 'error') } finally { setBusy(false) } }

  const d = data.data; const s = d?.series?.[chart]
  const pts = useMemo(() => {
    if (!s) return []
    const base: any[] = s.points.map((p: any, i: number) => ({ x: fmtDate(p.t), value: p.v, avg: s.rolling7[i], anomaly: s.anomalies.includes(i) }))
    if (s.forecast_7d != null) { base[base.length - 1].forecast = base[base.length - 1].value; base.push({ x: 'in 7 days', forecast: s.forecast_7d, band: s.forecast_band }) }
    return base
  }, [s])
  if (data.loading && !d) return <PageSkeleton />
  const [lo, hi] = s?.range ?? [null, null]

  return (
    <>
      <PageHeader title="Health trends" hint="Log readings to see how they change, spot drift early, and understand your risk." />
      <Card><form onSubmit={add} className="space-y-3">
        <div className="flex flex-wrap gap-1.5" role="group" aria-label="Measurement">{KINDS.map((k) => <Chip key={k} on={kind === k} onClick={() => setKind(k)}>{NAMES[k]}</Chip>)}</div>
        <div className="flex flex-wrap items-end gap-3">
          {kind === 'bp' ? <><Field label="Top number (systolic)" type="number" inputMode="numeric" required value={sys} onChange={(e) => setSys(e.target.value)} /><Field label="Bottom number (diastolic)" type="number" inputMode="numeric" required value={dia} onChange={(e) => setDia(e.target.value)} /></>
            : <Field label={`${NAMES[kind]} (${UNITS[kind]})`} type="number" step="any" inputMode="decimal" required value={val} onChange={(e) => setVal(e.target.value)} />}
          <Button>Save reading</Button></div><ErrorNote msg={err} /></form></Card>

      {d && Object.keys(d.series).length === 0 ? <Card className="mt-4"><Empty title="No readings yet" hint="Save your first reading above. After a few, you'll see charts, forecasts and unusual-value alerts." /></Card> : d && (
        <>
          <Card className="mt-4">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2"><div className="flex flex-wrap gap-1.5" role="group" aria-label="Chart series">{Object.keys(d.series).map((k) => <Chip key={k} on={chart === k} onClick={() => setChart(k)}>{label(k)}</Chip>)}</div>
              {s && <Badge tone={s.status === 'in_range' ? 'ok' : s.status === 'n/a' ? 'neutral' : 'danger'}>latest {s.latest} {UNITS[chart]}{s.status !== 'n/a' && `, ${s.status.replace('_', ' ')}`}</Badge>}</div>
            {pts.length < 2 ? <Empty title="Log one more reading to see a chart" /> : (
              <div className="h-72" role="img" aria-label={`${label(chart)} over time with a 7 day forecast`}>
                <ResponsiveContainer><ComposedChart data={pts} margin={{ left: 0, right: 8, top: 8 }}><CartesianGrid stroke="rgb(var(--line))" strokeDasharray="3 3" /><XAxis dataKey="x" tick={{ fontSize: 11 }} /><YAxis domain={['auto', 'auto']} tick={{ fontSize: 11 }} width={40} />
                  {lo != null && hi != null && <ReferenceArea y1={lo} y2={hi} fill="rgb(var(--ok))" fillOpacity={0.08} />}
                  <Tooltip contentStyle={{ background: 'rgb(var(--surface))', border: '1px solid rgb(var(--line))', borderRadius: 12 }} />
                  <Area dataKey="band" stroke="none" fill="rgb(var(--primary))" fillOpacity={0.15} name="Likely range" />
                  <Line dataKey="avg" stroke="rgb(var(--accent))" strokeDasharray="5 4" dot={false} name="7-reading average" />
                  <Line dataKey="forecast" stroke="rgb(var(--primary))" strokeDasharray="2 4" strokeWidth={2} dot={false} name="Forecast" />
                  <Line dataKey="value" stroke="rgb(var(--primary))" strokeWidth={2.5} name="Reading" dot={(p: any) => <circle key={p.index} cx={p.cx} cy={p.cy} r={p.payload.anomaly ? 6 : 3.5} fill={p.payload.anomaly ? 'rgb(var(--danger))' : 'rgb(var(--primary))'} stroke="rgb(var(--surface))" strokeWidth={1.5} />} /></ComposedChart></ResponsiveContainer></div>)}
            {s?.forecast_7d != null && <p className="mt-2 text-sm text-muted">If this trend continues, about <b className="text-ink">{s.forecast_7d}</b> in a week (likely {s.forecast_band[0]} to {s.forecast_band[1]}). {s.anomalies.length > 0 && 'Red dots are readings unusual for you.'} A rough estimate, not a prediction of your health.</p>}
          </Card>

          <div className="mt-4 grid md:grid-cols-3 gap-4">
            <Card><h2 className="mb-2 font-semibold">Things to notice</h2>{d.insights.length === 0 ? <p className="text-muted">No concerning drift detected.</p> : <ul className="space-y-2 text-sm">{d.insights.map((i: string, n: number) => <li key={n} className="rounded-lg bg-warn-soft px-3 py-2 text-warn">{i}</li>)}</ul>}
              {d.correlations.length > 0 && <div className="mt-3"><p className="mb-1 text-sm font-semibold">Patterns across measures</p><ul className="space-y-1.5 text-sm text-muted">{d.correlations.map((c: any, n: number) => <li key={n}>{c.note}</li>)}</ul></div>}</Card>
            <Card><div className="mb-2 flex items-center justify-between"><h2 className="font-semibold">Heart and metabolic</h2><Badge tone={RISK_TONE[d.risk.band]}>{d.risk.band}</Badge></div>
              <p className="text-sm text-muted">{d.risk.factors.length ? `Factors: ${d.risk.factors.join(', ')}.` : 'No risk factors recorded.'}</p>{d.bmi && <div className="mt-3"><Stat label="BMI" value={d.bmi} /></div>}</Card>
            <Card><div className="mb-2 flex items-center justify-between"><h2 className="font-semibold">Diabetes risk score</h2>{d.idrs.available && <Badge tone={RISK_TONE[d.idrs.band]}>{d.idrs.band}</Badge>}</div>
              {d.idrs.available ? <><p className="font-display text-3xl font-semibold">{d.idrs.score}<span className="text-base text-muted"> / 100</span></p><ul className="mt-2 text-sm text-muted space-y-0.5">{Object.entries(d.idrs.parts).map(([k, v]) => <li key={k} className="flex justify-between capitalize"><span>{label(k)}</span><span>{String(v)}</span></li>)}</ul></> :
                <p className="text-sm text-muted">Add your {d.idrs.missing.join(', ')} in your <Link to="/profile" className="underline text-primary">profile</Link> to see this score.</p>}
              <p className="mt-2 text-xs text-muted">A simple screening score, not a diagnosis.</p></Card>
          </div>

          <div className="mt-4 grid md:grid-cols-[1fr_1fr] gap-4">
            <Card><Button variant="soft" loading={busy} icon={<Sparkles className="h-4 w-4" />} onClick={explainIt}>Explain my trends in plain words</Button>{explain && <p className="mt-3 leading-relaxed">{explain}</p>}</Card>
            <Card><h2 className="mb-2 font-semibold">Recent readings</h2>{recent.data?.length === 0 ? <p className="text-muted">None yet.</p> : <ul className="divide-y divide-line">{recent.data?.map((r: any) => (
              <li key={r.id} className="flex items-center justify-between py-1.5 text-sm"><span><b className="capitalize">{label(r.kind)}</b> {r.value} <span className="text-muted">{UNITS[r.kind]}</span><br /><span className="text-xs text-muted">{fmtDateTime(r.recorded_at)}</span></span>
                <button aria-label="Delete reading" className="rounded-lg p-1.5 text-muted hover:bg-sunken hover:text-danger" onClick={() => api(`/vitals/${r.id}`, { method: 'DELETE' }).then(reload)}><Trash2 className="h-4 w-4" /></button></li>))}</ul>}</Card></div>
          <div className="mt-3"><Notice tone="info">{d.disclaimer}</Notice></div>
        </>)}
    </>
  )
}
