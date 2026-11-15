import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { CalendarPlus, Clock, LocateFixed, Star, Video } from 'lucide-react'
import { api, apiBlob, download } from '../lib/api'
import { useToast } from '../lib/ctx'
import { useLoad } from '../hooks/useLoad'
import { dayLabel, fmtTime, initials, whenLabel } from '../lib/format'
import { Badge, Button, Card, Chip, Empty, ErrorNote, Modal, PageHeader, Segmented, Select, Skeleton, Textarea } from '../components/ui'

const SPECIALTIES = ['General Physician', 'Cardiologist', 'Dermatologist', 'Pediatrician', 'Gynecologist', 'Endocrinologist', 'Orthopedist', 'Gastroenterologist', 'Neurologist', 'Ophthalmologist', 'Pulmonologist', 'Urologist']

export default function Doctors() {
  const toast = useToast(); const [params, setParams] = useSearchParams()
  const [tab, setTab] = useState<'find' | 'mine'>('find')
  const specialty = params.get('specialty') ?? ''
  const [language, setLanguage] = useState(''); const [sort, setSort] = useState('soonest'); const [maxFee, setMaxFee] = useState('')
  const [tele, setTele] = useState(false); const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null)
  const [pick, setPick] = useState<any>(null); const [slots, setSlots] = useState<any[]>([]); const [slot, setSlot] = useState<string>(''); const [reason, setReason] = useState('')
  const [resched, setResched] = useState<any>(null); const [busy, setBusy] = useState(false); const [err, setErr] = useState('')

  const q = new URLSearchParams({ sort: coords && sort === 'distance' ? 'distance' : sort === 'distance' ? 'soonest' : sort, ...(specialty && { specialty }), ...(language && { language }), ...(maxFee && { max_fee: maxFee }), ...(tele && { teleconsult: 'true' }), ...(coords && { lat: String(coords.lat), lng: String(coords.lng) }) })
  const docs = useLoad(() => api(`/doctors?${q}`), [q.toString()])
  const appts = useLoad(() => api('/appointments'), [])

  useEffect(() => {
    const doc = pick ?? (resched && { id: resched.doctor_id }); if (!doc) return
    setSlots([]); setSlot(''); api(`/doctors/${doc.id}/slots`).then(setSlots).catch((e) => setErr(e.message))
  }, [pick, resched])

  const byDay = useMemo(() => { const m: Record<string, any[]> = {}; slots.forEach((s) => (m[dayLabel(s.starts_at)] ??= []).push(s)); return Object.entries(m) }, [slots])
  const locate = () => navigator.geolocation.getCurrentPosition((p) => { setCoords({ lat: p.coords.latitude, lng: p.coords.longitude }); setSort('distance') }, () => toast('Location is blocked. Search by specialty instead.', 'error'))

  async function confirm() {
    setBusy(true); setErr('')
    try {
      if (resched) { await api(`/appointments/${resched.id}/reschedule`, { body: { slot_id: slot } }); toast('Appointment moved') }
      else { await api('/appointments', { body: { slot_id: slot, reason } }); toast('Appointment booked. We will remind you.') }
      setPick(null); setResched(null); setReason(''); appts.reload(); docs.reload(); setTab('mine')
    } catch (e: any) { setErr(e.message); const d = pick ?? { id: resched?.doctor_id }; api(`/doctors/${d.id}/slots`).then(setSlots) } finally { setBusy(false) }
  }
  async function cancel(id: string) { try { await api(`/appointments/${id}`, { method: 'DELETE' }); toast('Appointment cancelled', 'info'); appts.reload() } catch (e: any) { toast(e.message, 'error') } }
  async function ics(id: string) { try { download(await apiBlob(`/appointments/${id}/ics`), 'appointment.ics') } catch (e: any) { toast(e.message, 'error') } }
  const upcoming = (appts.data ?? []).filter((a: any) => a.status === 'confirmed'); const past = (appts.data ?? []).filter((a: any) => a.status !== 'confirmed')
  const open = Boolean(pick || resched); const closeModal = () => { setPick(null); setResched(null); setErr('') }

  return (
    <>
      <PageHeader title="Doctors" hint="Find the right specialist and book a time that works."
        actions={<Segmented label="View" value={tab} onChange={setTab} options={[{ value: 'find', label: 'Find a doctor' }, { value: 'mine', label: 'My appointments', badge: upcoming.length || undefined }]} />} />

      {tab === 'find' ? (
        <>
          <div className="mb-4 -mx-4 px-4 md:mx-0 md:px-0 flex gap-1.5 overflow-x-auto pb-1">{['', ...SPECIALTIES].map((s) => <Chip key={s || 'all'} on={specialty === s} onClick={() => setParams(s ? { specialty: s } : {})}>{s || 'All'}</Chip>)}</div>
          <Card className="mb-5 grid sm:grid-cols-2 lg:grid-cols-5 gap-3 items-end">
            <Select label="Sort by" value={sort} onChange={(e) => setSort(e.target.value)}><option value="soonest">Earliest available</option><option value="rating">Top rated</option><option value="fee">Lowest fee</option><option value="distance">Nearest</option></Select>
            <Select label="Language" value={language} onChange={(e) => setLanguage(e.target.value)}><option value="">Any</option>{['English', 'Hindi', 'Telugu', 'Tamil', 'Urdu', 'Malayalam'].map((l) => <option key={l}>{l}</option>)}</Select>
            <Select label="Fee up to" value={maxFee} onChange={(e) => setMaxFee(e.target.value)}><option value="">Any</option>{[500, 800, 1000].map((f) => <option key={f} value={f}>₹{f}</option>)}</Select>
            <div className="flex gap-2 flex-wrap"><Chip on={tele} onClick={() => setTele(!tele)}>Video visit</Chip></div>
            <Button variant="soft" icon={<LocateFixed className="h-4 w-4" />} onClick={locate}>{coords ? 'Near you' : 'Use my location'}</Button>
          </Card>
          <ErrorNote msg={docs.error} />
          <div className="space-y-3">
            {docs.loading && !docs.data && [1, 2, 3].map((i) => <Skeleton key={i} className="h-28" />)}
            {docs.data?.length === 0 && <Card><Empty title="No doctors match" hint="Try removing a filter or choosing a different specialty." action={<Button variant="soft" onClick={() => { setParams({}); setLanguage(''); setMaxFee(''); setTele(false) }}>Clear filters</Button>} /></Card>}
            {docs.data?.map((d: any) => (
              <Card key={d.id} className="flex flex-wrap items-center gap-4">
                <div className="grid h-14 w-14 shrink-0 place-items-center rounded-full bg-primary-soft font-display text-lg font-semibold text-primary" aria-hidden>{initials(d.name)}</div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2"><h2 className="text-lg font-semibold">{d.name}</h2>{d.teleconsult && <Badge tone="info"><Video className="mr-1 h-3 w-3" />Video visit</Badge>}</div>
                  <p className="text-muted">{d.specialty}, {d.clinic}</p>
                  <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
                    <span className="inline-flex items-center gap-1"><Star className="h-4 w-4 fill-accent text-accent" aria-hidden />{d.rating}</span><span>₹{d.fee_inr}</span>
                    <span className="text-muted">{d.languages?.join(', ')}</span>{d.distance_km != null && <span className="text-muted">{d.distance_km} km away</span>}</div></div>
                <div className="flex flex-col items-end gap-2">
                  {d.next_slot ? <p className="flex items-center gap-1 text-sm font-semibold text-ok"><Clock className="h-4 w-4" aria-hidden />{whenLabel(d.next_slot)}</p> : <p className="text-sm text-muted">No open slots</p>}
                  <Button disabled={!d.next_slot} onClick={() => { setErr(''); setPick(d) }}>Book</Button></div>
              </Card>))}
          </div>
        </>
      ) : (
        <div className="space-y-6">
          <section><h2 className="mb-3 text-lg font-semibold">Upcoming</h2>
            {upcoming.length === 0 ? <Card><Empty title="No upcoming appointments" action={<Button variant="soft" onClick={() => setTab('find')}>Find a doctor</Button>} /></Card> : upcoming.map((a: any) => (
              <Card key={a.id} className="mb-3 flex flex-wrap items-center justify-between gap-3">
                <div><p className="text-lg font-semibold">{a.doctors?.name}</p><p className="text-muted">{a.doctors?.specialty}, {a.doctors?.clinic}</p><p className="mt-1 font-medium">{whenLabel(a.scheduled_at)}</p>{a.reason && <p className="text-sm text-muted">{a.reason}</p>}</div>
                <div className="flex flex-wrap gap-2"><Button size="sm" variant="soft" icon={<CalendarPlus className="h-4 w-4" />} onClick={() => ics(a.id)}>Add to calendar</Button><Button size="sm" variant="ghost" onClick={() => { setErr(''); setResched(a) }}>Reschedule</Button><Button size="sm" variant="ghost" onClick={() => cancel(a.id)}>Cancel</Button></div>
              </Card>))}</section>
          {past.length > 0 && <section><h2 className="mb-3 text-lg font-semibold">Past and cancelled</h2>{past.map((a: any) => <Card key={a.id} className="mb-2 flex justify-between items-center"><span>{a.doctors?.name}, {whenLabel(a.scheduled_at)}</span><Badge>{a.status}</Badge></Card>)}</section>}
        </div>)}

      <Modal open={open} title={resched ? 'Pick a new time' : `Book ${pick?.name ?? ''}`} onClose={closeModal}>
        {byDay.length === 0 ? <p className="text-muted">No open slots right now.</p> : <div className="space-y-3 max-h-64 overflow-y-auto">{byDay.map(([day, list]) => (
          <div key={day}><p className="mb-1 text-sm font-semibold text-muted">{day}</p><div className="flex flex-wrap gap-1.5">{list.map((s) => <Chip key={s.id} on={slot === s.id} onClick={() => setSlot(s.id)}>{fmtTime(s.starts_at)}</Chip>)}</div></div>))}</div>}
        {!resched && <Textarea label="Reason for visit (optional)" rows={2} className="mt-4" maxLength={300} value={reason} onChange={(e) => setReason(e.target.value)} />}
        <div className="mt-3"><ErrorNote msg={err} /></div>
        <div className="mt-4 flex justify-end gap-2"><Button variant="ghost" onClick={closeModal}>Cancel</Button><Button disabled={!slot} loading={busy} onClick={confirm}>{resched ? 'Move appointment' : 'Confirm booking'}</Button></div>
      </Modal>
    </>
  )
}
