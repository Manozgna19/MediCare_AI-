import { useCallback, useEffect, useRef, useState } from 'react'
import { Mic, X } from 'lucide-react'
import { useVoice } from '../hooks/useVoice'
import { Button, Notice } from './ui'

type Phase = 'listening' | 'thinking' | 'speaking' | 'paused'
const STATUS: Record<Phase, string> = { listening: 'Listening…', thinking: 'Thinking…', speaking: 'Speaking…', paused: 'Tap the mic to talk' }

/** Hands-free loop: listen, answer aloud, listen again. Say "stop" to leave. */
export default function VoiceMode({ lang, onTurn, onClose }: { lang: string; onTurn: (text: string) => Promise<string>; onClose: () => void }) {
  const v = useVoice(lang); const vr = useRef(v); vr.current = v
  const [phase, setPhase] = useState<Phase>('paused'); const [heard, setHeard] = useState(''); const [said, setSaid] = useState('')
  const active = useRef(true); const loop = useRef<() => void>(() => {})

  loop.current = useCallback(() => {
    if (!active.current) return
    setPhase('listening'); let got = false
    vr.current.listen(async (t) => {
      got = true; setHeard(t)
      if (/^(stop|exit|close|bye|बंद|ఆపు)\b/i.test(t.trim())) { onClose(); return }
      setPhase('thinking')
      try { const r = await onTurn(t); if (!active.current) return; setSaid(r); setPhase('speaking'); vr.current.speak(r, () => loop.current()) }
      catch (e: any) { setSaid(e.message); setPhase('paused') }
    }, () => { if (active.current && !got) setPhase('paused') })
  }, [onTurn, onClose])

  useEffect(() => { active.current = true; if (v.supported) loop.current(); return () => { active.current = false; vr.current.stop(); vr.current.silence() } }, []) // eslint-disable-line

  return (
    <div role="dialog" aria-modal="true" aria-label="Voice conversation" className="no-print fixed inset-0 z-50 flex flex-col items-center justify-between bg-bg p-6 text-center">
      <div className="flex w-full justify-end"><button onClick={onClose} aria-label="Close voice mode" className="rounded-full p-2 hover:bg-sunken"><X className="h-6 w-6" /></button></div>
      <div className="flex flex-col items-center gap-6 max-w-lg">
        {!v.supported ? <Notice tone="warn">Voice input isn't supported in this browser. Try Chrome or Edge, or type your question.</Notice> : (
          <>
            <button onClick={() => (phase === 'paused' ? loop.current() : phase === 'listening' ? v.stop() : v.silence())} aria-label={STATUS[phase]}
              className={`grid h-40 w-40 place-items-center rounded-full ${phase === 'paused' ? 'bg-sunken text-primary' : 'bg-primary text-on-primary'} ${phase === 'listening' || phase === 'speaking' ? 'orb-live' : ''}`}>
              <Mic className="h-14 w-14" aria-hidden /></button>
            <p className="font-display text-2xl font-semibold" aria-live="polite">{STATUS[phase]}</p>
          </>)}
        {heard && <p className="text-muted">“{heard}”</p>}
        {said && <p className="text-lg leading-relaxed">{said}</p>}
        {!v.hasVoice && <Notice tone="info">This device has no installed voice for this language, so replies may sound off. You can still read them here.</Notice>}
        {v.error && <Notice tone="danger">{v.error}</Notice>}
      </div>
      <p className="text-sm text-muted">Say “stop” to end the conversation. In an emergency call 112.</p>
    </div>
  )
}
