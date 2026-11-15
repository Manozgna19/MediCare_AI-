import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowLeft, ArrowRight, Mic, Phone, Volume2, X } from 'lucide-react'
import { api } from '../lib/api'
import { useLang, short } from '../lib/ctx'
import { useVoice } from '../hooks/useVoice'
import { useLoad } from '../hooks/useLoad'
import { fmtDateTime, label } from '../lib/format'
import { Button, Card, Chip, Empty, ErrorNote, LevelBadge, Notice, PageHeader, Segmented, Textarea } from '../components/ui'
import BodyMap, { REGIONS } from '../components/BodyMap'

const SEV = ['', 'Barely noticeable', 'Mild', 'Mild', 'Noticeable', 'Moderate', 'Quite strong', 'Strong', 'Very strong', 'Severe', 'Worst imaginable']
const BANNER: Record<string, { tone: 'ok' | 'warn' | 'danger'; title: string }> = {
  self_care: { tone: 'ok', title: 'Likely manageable at home' }, see_doctor_soon: { tone: 'warn', title: 'See a doctor in the next few days' },
  see_doctor_today: { tone: 'warn', title: 'See a doctor today' }, emergency: { tone: 'danger', title: 'Get emergency help now' },
}

export default function Symptoms() {
  const { lang } = useLang(); const voice = useVoice(lang)
  const [tab, setTab] = useState<'new' | 'history'>('new'); const [step, setStep] = useState(1)
  const [region, setRegion] = useState<string | null>('chest'); const [picked, setPicked] = useState<string[]>([])
  const [severity, setSeverity] = useState(5); const [days, setDays] = useState(1); const [text, setText] = useState('')
  const [answers, setAnswers] = useState<Record<string, boolean>>({}); const [questions, setQuestions] = useState<any[]>([])
  const [res, setRes] = useState<any>(null); const [busy, setBusy] = useState(false); const [err, setErr] = useState('')
  const history = useLoad(() => api('/symptoms/history'), [tab])

  useEffect(() => {
    if (step !== 2 || !picked.length) return
    api(`/symptoms/followups?symptoms=${picked.join(',')}`).then(setQuestions).catch(() => setQuestions([]))
  }, [step, picked])

  const toggle = (s: string) => setPicked((p) => (p.includes(s) ? p.filter((x) => x !== s) : [...p, s]))
  async function run() {
    setBusy(true); setErr('')
    try { setRes(await api('/symptoms/check', { body: { symptoms: picked, free_text: text, severity, duration_days: days, answers, language: short(lang) } })); setStep(3) }
    catch (e: any) { setErr(e.message) } finally { setBusy(false) }
  }
  const reset = () => { setStep(1); setRes(null); setPicked([]); setAnswers({}); setText(''); setSeverity(5); setDays(1) }
  const g = res?.guidance
  const readAloud = () => voice.speak([BANNER[res.triage.level].title, g?.when_to_seek_care, ...(res.triage.reasons ?? []), g?.self_care?.length ? 'What may help: ' + g.self_care.join('. ') : ''].filter(Boolean).join('. '))

  return (
    <>
      <PageHeader title="Symptom check" hint="Tell us where it hurts. You get a clear next step, not a diagnosis."
        actions={<Segmented label="View" value={tab} onChange={setTab} options={[{ value: 'new', label: 'New check' }, { value: 'history', label: 'History' }]} />} />

      {tab === 'history' ? (
        <Card>{history.loading ? <p className="text-muted">Loading…</p> : !history.data?.length ? <Empty title="No checks yet" hint="Your past symptom checks will be listed here." /> : (
          <ul className="divide-y divide-line">{history.data.map((h: any) => (
            <li key={h.id} className="py-3 flex items-start justify-between gap-3 first:pt-0 last:pb-0"><div><p className="font-medium capitalize">{h.symptoms.map(label).join(', ')}</p>
              <p className="text-sm text-muted">{fmtDateTime(h.created_at)}, severity {h.severity}/10</p></div><LevelBadge level={h.risk_level} /></li>))}</ul>)}</Card>
      ) : step < 3 ? (
        <>
          <ol className="mb-4 flex gap-2" aria-label="Progress">{['Where', 'Details'].map((l, i) => (
            <li key={l} aria-current={step === i + 1 ? 'step' : undefined} className={`flex-1 rounded-full px-4 py-1.5 text-sm font-semibold text-center ${step === i + 1 ? 'bg-primary text-on-primary' : step > i + 1 ? 'bg-primary-soft text-primary' : 'bg-sunken text-muted'}`}>{l}</li>))}</ol>

          {step === 1 && (
            <Card><div className="grid md:grid-cols-[210px_1fr] gap-6 items-start">
              <BodyMap region={region} onSelect={setRegion} />
              <div className="space-y-4">
                <div><p className="font-semibold mb-2">Choose an area, then what you feel</p>
                  <div className="flex flex-wrap gap-1.5 mb-4">{Object.entries(REGIONS).map(([id, r]) => <Chip key={id} on={region === id} onClick={() => setRegion(id)}>{r.label}</Chip>)}</div>
                  {region && <div className="flex flex-wrap gap-2" role="group" aria-label={REGIONS[region].label}>{REGIONS[region].symptoms.map((s) => <Chip key={s} on={picked.includes(s)} onClick={() => toggle(s)}>{label(s)}</Chip>)}</div>}</div>
                {picked.length > 0 && <div><p className="text-sm text-muted mb-1.5">Selected</p>
                  <div className="flex flex-wrap gap-1.5">{picked.map((s) => <span key={s} className="inline-flex items-center gap-1 rounded-full bg-primary-soft text-primary pl-3 pr-1.5 py-1 text-sm font-medium">{label(s)}<button aria-label={`Remove ${label(s)}`} onClick={() => toggle(s)} className="rounded-full p-0.5 hover:bg-primary/20"><X className="h-3.5 w-3.5" /></button></span>)}</div></div>}
                <Button disabled={!picked.length} onClick={() => setStep(2)} icon={<ArrowRight className="h-4 w-4" />}>Continue</Button></div></div></Card>)}

          {step === 2 && (
            <Card className="space-y-5">
              <div className="grid sm:grid-cols-2 gap-5">
                <label className="block"><span className="text-sm font-medium">How strong is it? <b>{severity}/10</b> <span className="text-muted">{SEV[severity]}</span></span>
                  <input type="range" min={1} max={10} value={severity} onChange={(e) => setSeverity(+e.target.value)} className="w-full accent-[rgb(var(--primary))] mt-2" /></label>
                <label className="block"><span className="text-sm font-medium">For how many days?</span>
                  <input type="number" min={0} max={365} value={days} onChange={(e) => setDays(Math.max(0, +e.target.value))} className="mt-1 w-28 rounded-xl border border-line px-3 py-2.5" /></label></div>
              {questions.length > 0 && (
                <fieldset className="space-y-2"><legend className="font-semibold mb-1">A few quick questions</legend>
                  {questions.map((q) => (
                    <div key={q.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-sunken px-3.5 py-2.5"><p className="text-sm max-w-md">{q.q}</p>
                      <div className="flex gap-1.5" role="group" aria-label={q.q}><Chip on={answers[q.id] === true} onClick={() => setAnswers({ ...answers, [q.id]: true })}>Yes</Chip><Chip on={answers[q.id] === false} onClick={() => setAnswers({ ...answers, [q.id]: false })}>No</Chip></div></div>))}</fieldset>)}
              <div><Textarea label="Anything else we should know?" rows={3} maxLength={1000} value={text} onChange={(e) => setText(e.target.value)} />
                {voice.supported && <Button type="button" size="sm" variant="soft" className="mt-2" icon={<Mic className="h-4 w-4" />} onClick={() => voice.listening ? voice.stop() : voice.listen((t) => setText((x) => (x ? x + ' ' : '') + t))}>{voice.listening ? 'Listening… tap to stop' : 'Dictate'}</Button>}</div>
              <ErrorNote msg={err || voice.error} />
              <div className="flex gap-2"><Button variant="ghost" onClick={() => setStep(1)} icon={<ArrowLeft className="h-4 w-4" />}>Back</Button><Button loading={busy} onClick={run}>See my result</Button></div></Card>)}
        </>
      ) : res && (
        <div className="space-y-4">
          <Card tone={BANNER[res.triage.level].tone}>
            <div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-sm text-muted">Suggested next step</p><h2 className="text-2xl font-semibold">{BANNER[res.triage.level].title}</h2></div>
              {voice.supported && <Button variant="ghost" size="sm" icon={<Volume2 className="h-4 w-4" />} onClick={readAloud}>Read aloud</Button>}</div>
            {g?.when_to_seek_care && <p className="mt-2">{g.when_to_seek_care}</p>}
            {res.triage.reasons?.length > 0 && <ul className="mt-3 list-disc ml-5 text-sm space-y-0.5">{res.triage.reasons.map((r: string, i: number) => <li key={i}>{r}</li>)}</ul>}
            {res.triage.level === 'emergency' && <div className="mt-4 flex flex-wrap gap-2"><a href="tel:112"><Button variant="danger" icon={<Phone className="h-4 w-4" />}>Call 112</Button></a><Link to="/sos"><Button variant="ghost">Open SOS</Button></Link></div>}
          </Card>
          <Card><h3 className="font-semibold mb-3">Who to see</h3>
            <div className="flex flex-wrap gap-2">{res.specialties.map((s: any) => <Link key={s.specialty} to={`/doctors?specialty=${encodeURIComponent(s.specialty)}`}><Button variant="soft" icon={<ArrowRight className="h-4 w-4" />}>{s.specialty}</Button></Link>)}</div></Card>
          {g?.possible_causes?.length > 0 && <Card><h3 className="font-semibold mb-3">Possible causes</h3><ul className="space-y-2.5">{g.possible_causes.map((c: any, i: number) => <li key={i}><span className="font-medium">{c.name}</span> <span className="text-xs rounded-full bg-sunken px-2 py-0.5 text-muted">{label(c.likelihood ?? '')}</span><p className="text-sm text-muted">{c.why}</p></li>)}</ul></Card>}
          <div className="grid md:grid-cols-2 gap-4">
            {g?.self_care?.length > 0 && <Card><h3 className="font-semibold mb-2">What may help</h3><ul className="list-disc ml-5 space-y-1 text-sm">{g.self_care.map((s: string, i: number) => <li key={i}>{s}</li>)}</ul></Card>}
            {g?.warning_signs?.length > 0 && <Card tone="danger"><h3 className="font-semibold mb-2 text-danger">Go to emergency care if</h3><ul className="list-disc ml-5 space-y-1 text-sm">{g.warning_signs.map((s: string, i: number) => <li key={i}>{s}</li>)}</ul></Card>}</div>
          {g?.questions_for_doctor?.length > 0 && <Card><h3 className="font-semibold mb-2">Questions to ask your doctor</h3><ul className="list-disc ml-5 text-sm space-y-1">{g.questions_for_doctor.map((s: string, i: number) => <li key={i}>{s}</li>)}</ul></Card>}
          {!g?.possible_causes && <Notice tone="info">Detailed guidance is temporarily unavailable, but the next step above still applies.</Notice>}
          <div className="flex gap-2"><Button variant="ghost" onClick={reset}>Start a new check</Button></div>
          <p className="text-xs text-muted">{res.disclaimer}</p>
        </div>)}
    </>
  )
}
