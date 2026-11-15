import { Fragment, useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { AudioLines, Check, Mic, SendHorizontal, Trash2, Volume2, VolumeX } from 'lucide-react'
import { api } from '../lib/api'
import { useLang, short, useToast } from '../lib/ctx'
import { useVoice } from '../hooks/useVoice'
import { useLoad } from '../hooks/useLoad'
import { Button, Card, ErrorNote, Modal, PageHeader } from '../components/ui'
import VoiceMode from '../components/VoiceMode'

type Proposal = { type: string; args: any; summary: string }
type Msg = { role: 'user' | 'assistant'; text: string; urgent?: boolean; actions?: { feature: string; label: string }[]; proposals?: Proposal[]; done?: Record<number, string> }
const ROUTES: Record<string, string> = { symptom_checker: '/symptoms', doctors: '/doctors', reports: '/reports', sos: '/sos', profile: '/profile', reminders: '/reminders', analytics: '/analytics', family: '/family', dashboard: '/', summary: '/summary' }
const PROMPTS = ['I have had a fever for two days', 'Remind me to take my medicine at 8 pm daily', 'Log my blood pressure 128 over 82', 'Find a cardiologist near me', 'Explain my latest report']

function localIso() {
  const d = new Date(); const off = -d.getTimezoneOffset(); const pad = (n: number) => String(Math.floor(Math.abs(n))).padStart(2, '0')
  return new Date(d.getTime() + off * 60000).toISOString().slice(0, 19) + (off >= 0 ? '+' : '-') + pad(off / 60) + ':' + pad(off % 60)
}

/** Tiny safe renderer: **bold** and "- " bullets. No HTML is ever injected. */
function Rich({ text }: { text: string }) {
  return <>{text.split('\n').map((line, i) => {
    const bullet = /^\s*[-•]\s+/.test(line); const body = line.replace(/^\s*[-•]\s+/, '')
    const parts = body.split(/\*\*(.+?)\*\*/g).map((p, j) => (j % 2 ? <strong key={j}>{p}</strong> : <Fragment key={j}>{p}</Fragment>))
    return bullet ? <p key={i} className="pl-4 -indent-3 before:content-['•'] before:mr-2">{parts}</p> : <p key={i} className={line ? '' : 'h-2'}>{parts}</p>
  })}</>
}

export default function Chat() {
  const { lang } = useLang(); const nav = useNavigate(); const voice = useVoice(lang); const toast = useToast()
  const [msgs, setMsgs] = useState<Msg[]>([]); const [text, setText] = useState(''); const [busy, setBusy] = useState(false)
  const [err, setErr] = useState(''); const [speakReplies, setSpeak] = useState(false); const [voiceMode, setVoiceMode] = useState(false); const [confirmClear, setConfirmClear] = useState(false)
  const end = useRef<HTMLDivElement>(null); const msgsRef = useRef(msgs); msgsRef.current = msgs
  useLoad(async () => { const h = await api('/chat/history'); setMsgs(h.map((m: any) => ({ role: m.role, text: m.text, urgent: m.meta?.urgent, actions: m.meta?.actions }))); return h }, [])
  useEffect(() => end.current?.scrollIntoView({ behavior: 'smooth', block: 'end' }), [msgs, busy])

  const ask = useCallback(async (message: string): Promise<string> => {
    const history = msgsRef.current.slice(-10).map((m) => ({ role: m.role, text: m.text }))
    setMsgs((m) => [...m, { role: 'user', text: message }])
    const r = await api('/chat', { body: { message, history, language: short(lang), now: localIso(), tz: Intl.DateTimeFormat().resolvedOptions().timeZone } })
    setMsgs((m) => [...m, { role: 'assistant', text: r.reply, urgent: r.urgent, actions: r.actions, proposals: r.proposals }])
    return r.reply
  }, [lang])

  async function send(message: string) {
    if (!message.trim() || busy) return
    setText(''); setBusy(true); setErr('')
    try { const reply = await ask(message); if (speakReplies) voice.speak(reply) } catch (e: any) { setErr(e.message) } finally { setBusy(false) }
  }
  async function confirm(mi: number, pi: number, p: Proposal) {
    try { await api('/chat/execute', { body: { type: p.type, args: p.args } }); toast('Saved'); setMsgs((m) => m.map((x, i) => i === mi ? { ...x, done: { ...x.done, [pi]: 'saved' } } : x)) }
    catch (e: any) { toast(e.message, 'error') }
  }
  async function clear() { await api('/chat/history', { method: 'DELETE' }); setMsgs([]); setConfirmClear(false) }

  return (
    <>
      <PageHeader title="Health assistant" hint="Ask in your language. I can answer, take you to the right screen, and save reminders or readings once you confirm."
        actions={<div className="flex gap-2">
          {voice.supported && <Button variant="soft" icon={<AudioLines className="h-4 w-4" />} onClick={() => setVoiceMode(true)}>Voice conversation</Button>}
          {msgs.length > 0 && <Button variant="ghost" aria-label="Clear chat" onClick={() => setConfirmClear(true)}><Trash2 className="h-4 w-4" /></Button>}</div>} />
      <Card className="flex flex-col h-[66vh] md:h-[68vh] !p-0 overflow-hidden">
        <div className="flex-1 overflow-y-auto space-y-4 p-4 md:p-5" aria-live="polite">
          {msgs.length === 0 && (
            <div className="h-full grid place-content-center gap-4 text-center"><p className="text-muted">Try one of these</p>
              <div className="flex flex-wrap justify-center gap-2 max-w-lg">{PROMPTS.map((p) => <button key={p} onClick={() => send(p)} className="rounded-full border border-line bg-surface px-3.5 py-2 text-sm hover:bg-sunken">{p}</button>)}</div></div>)}
          {msgs.map((m, mi) => (
            <div key={mi} className={m.role === 'user' ? 'flex justify-end' : ''}>
              <div className={`max-w-[88%] space-y-2 ${m.role === 'user' ? 'items-end' : ''}`}>
                <div className={`rounded-2xl px-4 py-2.5 leading-relaxed ${m.role === 'user' ? 'bg-primary text-on-primary rounded-br-md' : m.urgent ? 'bg-danger-soft text-ink border border-danger/40 rounded-bl-md' : 'bg-sunken rounded-bl-md'}`}><Rich text={m.text} /></div>
                {m.proposals?.map((p, pi) => (
                  <div key={pi} className="rounded-xl border border-primary/30 bg-primary-soft p-3 text-sm"><p className="font-semibold">{p.summary || `Save ${p.type}`}</p>
                    {m.done?.[pi] ? <p className="text-ok font-medium mt-1 flex items-center gap-1"><Check className="h-4 w-4" />Saved</p> :
                      <div className="mt-2 flex gap-2"><Button size="sm" onClick={() => confirm(mi, pi, p)}>Confirm</Button><Button size="sm" variant="ghost" onClick={() => setMsgs((x) => x.map((y, i) => i === mi ? { ...y, proposals: y.proposals?.filter((_, k) => k !== pi) } : y))}>Dismiss</Button></div>}</div>))}
                {m.actions && m.actions.length > 0 && <div className="flex flex-wrap gap-2">{m.actions.map((a, j) => <Button key={j} size="sm" variant={a.feature === 'sos' ? 'danger' : 'soft'} onClick={() => nav(ROUTES[a.feature])}>{a.label}</Button>)}</div>}
              </div>
            </div>))}
          {busy && <div className="flex gap-1.5 px-2" role="status" aria-label="Assistant is typing">{[0, 1, 2].map((i) => <span key={i} className="h-2 w-2 rounded-full bg-muted animate-pulse" style={{ animationDelay: `${i * 150}ms` }} />)}</div>}
          <div ref={end} />
        </div>
        <div className="border-t border-line p-3 md:p-4 space-y-2">
          <ErrorNote msg={err || voice.error} />
          <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); send(text) }}>
            <input aria-label="Message" value={text} maxLength={2000} onChange={(e) => setText(e.target.value)} placeholder="Type or tap the mic" className="flex-1 min-w-0 rounded-xl border border-line px-3.5 py-2.5" />
            {voice.supported && <Button type="button" variant={voice.listening ? 'primary' : 'soft'} aria-label={voice.listening ? 'Stop listening' : 'Speak'} onClick={() => voice.listening ? voice.stop() : voice.listen((t) => send(t))}><Mic className="h-5 w-5" /></Button>}
            <Button aria-label="Send" disabled={busy || !text.trim()}><SendHorizontal className="h-5 w-5" /></Button>
          </form>
          <button onClick={() => { const n = !speakReplies; setSpeak(n); if (!n) voice.silence() }} className="flex items-center gap-1.5 text-xs text-muted hover:text-ink">{speakReplies ? <Volume2 className="h-4 w-4" /> : <VolumeX className="h-4 w-4" />}Read replies aloud: {speakReplies ? 'on' : 'off'}</button>
        </div>
      </Card>
      {voiceMode && <VoiceMode lang={lang} onTurn={ask} onClose={() => setVoiceMode(false)} />}
      <Modal open={confirmClear} title="Clear this conversation?" onClose={() => setConfirmClear(false)}>
        <p className="text-muted mb-4">This deletes your saved chat history. Reminders and readings you confirmed stay.</p>
        <div className="flex gap-2 justify-end"><Button variant="ghost" onClick={() => setConfirmClear(false)}>Keep</Button><Button variant="danger" onClick={clear}>Clear chat</Button></div>
      </Modal>
    </>
  )
}
