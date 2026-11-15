import { FormEvent, useEffect, useRef, useState } from 'react'
import { MapPin, Phone, Printer, Share2, ShieldCheck } from 'lucide-react'
import { api } from '../lib/api'
import { useToast } from '../lib/ctx'
import { useLoad } from '../hooks/useLoad'
import { Badge, Button, Card, Chip, Empty, ErrorNote, Field, Notice, PageHeader, Ring, Segmented } from '../components/ui'

const getPos = (): Promise<GeolocationPosition | null> => new Promise((res) => navigator.geolocation ? navigator.geolocation.getCurrentPosition(res, () => res(null), { enableHighAccuracy: true, timeout: 8000 }) : res(null))

function Links({ links }: { links: any[] }) {
  return links.length === 0 ? <Notice tone="warn">You have no emergency contacts yet. Add one below.</Notice> : (
    <ul className="space-y-2">{links.map((l) => (
      <li key={l.phone} className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-sunken px-3.5 py-2.5"><b>{l.name}</b>
        <span className="flex gap-2"><a href={l.sms}><Button size="sm" variant="soft">Text</Button></a><a href={l.whatsapp} target="_blank" rel="noreferrer"><Button size="sm" variant="soft">WhatsApp</Button></a></span></li>))}</ul>)
}

export default function Sos() {
  const toast = useToast(); const contacts = useLoad(() => api('/sos/contacts'), []); const mid = useLoad(() => api('/sos/medical-id'), [])
  const [form, setForm] = useState({ name: '', phone: '', relation: '' }); const [count, setCount] = useState<number | null>(null)
  const [sent, setSent] = useState<any>(null); const [safe, setSafe] = useState<any>(null); const [err, setErr] = useState('')
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null); const [kind, setKind] = useState<'hospital' | 'pharmacy' | 'clinic'>('hospital'); const [openNow, setOpenNow] = useState(false)
  const [places, setPlaces] = useState<any[] | null>(null); const [finding, setFinding] = useState(false); const timer = useRef<number>()
  useEffect(() => () => clearInterval(timer.current), [])

  async function findNearby(c = coords, k = kind, o = openNow) {
    setFinding(true); setErr('')
    try {
      let at = c
      if (!at) { const p = await getPos(); if (!p) throw new Error('Location is blocked. Allow it in your browser to find places near you.'); at = { lat: p.coords.latitude, lng: p.coords.longitude }; setCoords(at) }
      setPlaces(await api(`/sos/hospitals?lat=${at.lat}&lng=${at.lng}&kind=${k}&open_now=${o}`))
    } catch (e: any) { setErr(e.message) } finally { setFinding(false) }
  }
  async function fire() {
    setErr(''); const p = await getPos(); const c = p ? { lat: p.coords.latitude, lng: p.coords.longitude } : null
    try { setSent(await api('/sos/trigger', { body: c ?? {} })); setSafe(null); if (c) { setCoords(c); findNearby(c, 'hospital', false) } } catch (e: any) { setErr(e.message) }
  }
  function start() { setCount(5); timer.current = window.setInterval(() => setCount((c) => { if (c === null) return null; if (c <= 1) { clearInterval(timer.current); fire(); return null } return c - 1 }), 1000) }
  const cancel = () => { clearInterval(timer.current); setCount(null) }
  async function share() {
    const text = sent?.message ?? 'I need help'
    if (navigator.share) { try { await navigator.share({ title: 'Emergency', text }) } catch { /* dismissed */ } } else { await navigator.clipboard?.writeText(text); toast('Message copied') }
  }
  async function addContact(e: FormEvent) { e.preventDefault(); try { await api('/sos/contacts', { body: form }); setForm({ name: '', phone: '', relation: '' }); contacts.reload(); mid.reload() } catch (er: any) { toast(er.message, 'error') } }
  const m = mid.data; const p = m?.profile ?? {}

  return (
    <>
      <PageHeader title="Emergency SOS" hint="Alert your contacts with your location (only if you allow it) and find help nearby." />
      <div className="grid md:grid-cols-2 gap-4">
        <Card tone="danger" className="text-center space-y-4">
          <a href="tel:112" className="inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-danger py-4 text-xl font-bold text-white hover:opacity-90"><Phone className="h-6 w-6" />Call 112</a>
          {count === null ? <Button variant="ghost" size="lg" className="w-full !border-danger !text-danger" onClick={start}>Alert my contacts</Button> : (
            <div className="flex flex-col items-center gap-2"><Ring value={((5 - count) / 5) * 100} tone="danger" size={96} stroke={9}><span className="font-display text-3xl font-bold text-danger" aria-live="assertive">{count}</span></Ring>
              <Button variant="ghost" onClick={cancel}>Cancel</Button></div>)}
          <p className="text-xs text-muted">A 5-second countdown prevents accidental alerts. You confirm each message on your own phone.</p>
        </Card>

        <Card className="space-y-3"><h2 className="font-semibold text-lg">Find help nearby</h2>
          <div className="flex flex-wrap items-center gap-2"><Segmented label="Place type" value={kind} onChange={(k) => { setKind(k); findNearby(coords, k, openNow) }} options={[{ value: 'hospital', label: 'Hospitals' }, { value: 'pharmacy', label: 'Pharmacies' }, { value: 'clinic', label: 'Clinics' }]} />
            <Chip on={openNow} onClick={() => { setOpenNow(!openNow); findNearby(coords, kind, !openNow) }}>Open now</Chip></div>
          {!places ? <Button variant="soft" loading={finding} icon={<MapPin className="h-4 w-4" />} onClick={() => findNearby()}>Use my location</Button> : places.length === 0 ? <Empty title="Nothing found nearby" hint="Try a wider search by changing the type." /> : (
            <ul className="divide-y divide-line max-h-72 overflow-y-auto">{places.map((h) => (
              <li key={h.maps_url} className="py-2.5 flex items-start justify-between gap-3"><div className="min-w-0"><p className="font-semibold">{h.name}</p><p className="text-sm text-muted truncate">{h.address}</p>
                <p className="text-xs mt-0.5">{h.distance_km} km{h.open_now === true && <span className="ml-2 text-ok font-semibold">Open</span>}{h.rating && <span className="ml-2 text-muted">★ {h.rating}</span>}</p></div>
                <div className="flex shrink-0 gap-1.5">{h.phone && <a href={`tel:${h.phone}`}><Button size="sm" variant="soft" aria-label={`Call ${h.name}`}><Phone className="h-4 w-4" /></Button></a>}<a href={h.maps_url} target="_blank" rel="noreferrer"><Button size="sm" variant="ghost">Directions</Button></a></div></li>))}</ul>)}
        </Card>
      </div>
      <div className="mt-3"><ErrorNote msg={err} /></div>

      {sent && (
        <Card className="mt-4 space-y-3" tone="warn"><h2 className="font-semibold text-lg">Send your alert</h2><p className="text-sm bg-surface rounded-lg p-3">{sent.message}</p>
          <Links links={sent.links} /><div className="flex flex-wrap gap-2"><Button size="sm" variant="ghost" icon={<Share2 className="h-4 w-4" />} onClick={share}>Share another way</Button>
            <Button size="sm" variant="soft" icon={<ShieldCheck className="h-4 w-4" />} onClick={async () => setSafe(await api('/sos/safe', { method: 'POST', body: {} }))}>I'm safe now</Button></div>
          {safe && <div className="space-y-2 border-t border-line pt-3"><p className="text-sm">{safe.message}</p><Links links={safe.links} /></div>}</Card>)}

      <Card className="mt-4 !p-0 overflow-hidden">
        <div className="flex items-center justify-between bg-danger px-5 py-2.5 text-white"><h2 className="font-display font-semibold">Medical ID</h2>
          <button onClick={() => window.print()} className="no-print flex items-center gap-1.5 text-sm font-medium hover:underline"><Printer className="h-4 w-4" />Print</button></div>
        {!m ? <p className="p-5 text-muted">Loading…</p> : (
          <div className="grid gap-4 p-5 sm:grid-cols-[auto_1fr]">
            <div className="text-center"><p className="text-xs text-muted">Blood group</p><p className="font-display text-5xl font-bold text-danger">{p.blood_group || '?'}</p></div>
            <dl className="grid sm:grid-cols-2 gap-x-6 gap-y-2 text-sm">
              <div><dt className="text-muted">Name</dt><dd className="font-semibold">{p.full_name || 'Not set'}{p.age ? `, ${p.age}` : ''}</dd></div>
              <div><dt className="text-muted">Allergies</dt><dd className="font-semibold">{p.allergies?.length ? p.allergies.join(', ') : 'None listed'}</dd></div>
              <div><dt className="text-muted">Conditions</dt><dd className="font-semibold">{p.conditions?.length ? p.conditions.join(', ') : 'None listed'}</dd></div>
              <div><dt className="text-muted">Medicines</dt><dd className="font-semibold">{m.medications.length ? m.medications.map((x: any) => `${x.name} ${x.dose ?? ''}`.trim()).join(', ') : 'None listed'}</dd></div>
              <div className="sm:col-span-2"><dt className="text-muted">Contacts</dt><dd className="font-semibold">{m.contacts.length ? m.contacts.map((c: any) => `${c.name} ${c.phone}`).join(' · ') : 'None added'}</dd></div></dl></div>)}
      </Card>

      <Card className="mt-4 no-print"><h2 className="font-semibold text-lg mb-3">Emergency contacts</h2>
        <ul className="mb-4 divide-y divide-line">{contacts.data?.map((c: any) => <li key={c.id} className="flex items-center justify-between py-2"><span><b>{c.name}</b> {c.relation && <Badge>{c.relation}</Badge>} <span className="text-muted ml-1">{c.phone}</span></span>
          <button onClick={async () => { await api(`/sos/contacts/${c.id}`, { method: 'DELETE' }); contacts.reload(); mid.reload() }} className="text-sm font-medium text-danger">Remove</button></li>)}</ul>
        <form onSubmit={addContact} className="grid sm:grid-cols-4 gap-3 items-end"><Field label="Name" required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          <Field label="Phone with country code" required value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="+91…" inputMode="tel" />
          <Field label="Relation" value={form.relation} onChange={(e) => setForm({ ...form, relation: e.target.value })} /><Button>Add contact</Button></form>
      </Card>
    </>
  )
}
