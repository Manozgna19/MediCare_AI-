import { Printer } from 'lucide-react'
import { api } from '../lib/api'
import { useLoad } from '../hooks/useLoad'
import { fmtDate, label } from '../lib/format'
import { Button, ErrorNote, PageHeader, PageSkeleton } from '../components/ui'

const UNITS: Record<string, string> = { heart_rate: 'bpm', blood_glucose: 'mg/dL', weight_kg: 'kg', spo2: '%', temperature_c: '°C', systolic_bp: 'mmHg', diastolic_bp: 'mmHg' }
const Sec = ({ title, children }: { title: string; children: React.ReactNode }) => <section className="break-inside-avoid border-t border-line pt-4"><h2 className="mb-2 text-lg font-semibold">{title}</h2>{children}</section>

export default function Summary() {
  const { data: s, error, loading } = useLoad(() => api('/dashboard/summary'), [])
  if (loading && !s) return <PageSkeleton />
  if (error || !s) return <ErrorNote msg={error} />
  const p = s.profile
  return (
    <div className="max-w-3xl">
      <div className="no-print"><PageHeader title="Doctor summary" hint="One page to bring to a visit. Print it or save it as a PDF." actions={<Button icon={<Printer className="h-4 w-4" />} onClick={() => window.print()}>Print or save PDF</Button>} /></div>
      <article className="space-y-5 rounded-2xl border border-line bg-surface p-6 md:p-8 print:border-0 print:p-0">
        <header><h1 className="text-3xl font-semibold">{p.full_name || 'Patient'}</h1>
          <p className="text-muted">{[p.age && `${p.age} years`, p.sex, p.blood_group && `Blood group ${p.blood_group}`, s.bmi && `BMI ${s.bmi}`, p.smoker && 'Smoker'].filter(Boolean).join(', ')}</p>
          <p className="text-xs text-muted">Prepared {fmtDate(s.generated_at)} from information the patient entered in MediCare AI. Not a medical record.</p></header>
        <Sec title="Allergies"><p className={p.allergies?.length ? 'font-semibold text-danger' : 'text-muted'}>{p.allergies?.length ? p.allergies.join(', ') : 'None listed'}</p></Sec>
        <Sec title="Conditions"><p>{p.conditions?.length ? p.conditions.join(', ') : 'None listed'}</p></Sec>
        <Sec title="Current medicines">{s.medications.length === 0 ? <p className="text-muted">None listed</p> : <ul className="space-y-0.5">{s.medications.map((m: any, i: number) => <li key={i}><b>{m.name}</b> {m.dose} {m.frequency}</li>)}</ul>}
          {s.adherence_pct_30d != null && <p className="mt-1 text-sm text-muted">Took {s.adherence_pct_30d}% of reminded doses in the last 30 days.</p>}</Sec>
        {Object.keys(s.latest_vitals).length > 0 && <Sec title="Recent readings"><table className="w-full text-sm"><thead><tr className="text-left text-muted"><th className="pb-1">Measure</th><th>Latest</th><th>Average</th><th>Readings</th><th>Status</th></tr></thead>
          <tbody>{Object.entries(s.latest_vitals).map(([k, v]: any) => <tr key={k} className="border-t border-line"><td className="py-1.5 capitalize">{label(k)}</td><td className="font-semibold">{v.value} {UNITS[k]}</td><td>{v.mean}</td><td>{v.readings}</td><td className={v.status === 'high' || v.status === 'low' ? 'font-semibold text-danger' : ''}>{label(v.status)}</td></tr>)}</tbody></table></Sec>}
        {s.insights.length > 0 && <Sec title="Trends to discuss"><ul className="list-disc ml-5 space-y-1 text-sm">{s.insights.map((i: string, n: number) => <li key={n}>{i}</li>)}</ul></Sec>}
        {s.recent_symptom_checks.length > 0 && <Sec title="Recent symptom checks"><ul className="space-y-1 text-sm">{s.recent_symptom_checks.map((c: any, i: number) => <li key={i}><b className="capitalize">{c.symptoms.map(label).join(', ')}</b>, {fmtDate(c.created_at)}, <span className="capitalize">{label(c.risk_level)}</span></li>)}</ul></Sec>}
        {s.recent_reports.length > 0 && <Sec title="Recent reports"><ul className="space-y-1 text-sm">{s.recent_reports.map((r: any, i: number) => <li key={i}><b className="capitalize">{label(r.doc_type ?? 'report')}</b>, {fmtDate(r.created_at)}{r.summary && <span className="text-muted">: {r.summary}</span>}</li>)}</ul></Sec>}
        {s.family_history.length > 0 && <Sec title="Family history"><p className="text-sm capitalize">{s.family_history.map((f: any) => `${f.relation}: ${f.condition}${f.age_at_diagnosis ? ` (${f.age_at_diagnosis})` : ''}`).join('; ')}</p></Sec>}
      </article>
    </div>
  )
}
