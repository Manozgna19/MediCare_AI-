import { useCallback, useEffect, useRef, useState } from 'react'

/** Web Speech API wrapper. Recognition works best in Chrome/Edge; voices depend on the device. */
export function useVoice(lang: string) {
  const [listening, setListening] = useState(false)
  const [speaking, setSpeaking] = useState(false)
  const [error, setError] = useState('')
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([])
  const recRef = useRef<any>(null)
  const w = window as any
  const SR = w.SpeechRecognition || w.webkitSpeechRecognition
  const supported = Boolean(SR)

  useEffect(() => {
    if (!('speechSynthesis' in window)) return
    const load = () => setVoices(window.speechSynthesis.getVoices())
    load(); window.speechSynthesis.addEventListener('voiceschanged', load)
    return () => window.speechSynthesis.removeEventListener('voiceschanged', load)
  }, [])

  const voice = voices.find((v) => v.lang.replace('_', '-').toLowerCase() === lang.toLowerCase())
    ?? voices.find((v) => v.lang.toLowerCase().startsWith(lang.split('-')[0].toLowerCase()))
  /** false when we know voices are loaded but none match this language. */
  const hasVoice = voices.length === 0 ? true : Boolean(voice)

  const listen = useCallback((onText: (t: string) => void, onEnd?: () => void) => {
    if (!SR) return
    const rec = new SR()
    rec.lang = lang; rec.interimResults = false; rec.maxAlternatives = 1
    rec.onresult = (e: any) => onText(e.results[0][0].transcript)
    rec.onerror = (e: any) => { setError(e.error === 'not-allowed' ? 'Microphone access is blocked.' : e.error === 'no-speech' ? '' : 'Could not hear you. Try again.'); setListening(false) }
    rec.onend = () => { setListening(false); onEnd?.() }
    recRef.current = rec
    setError(''); setListening(true)
    try { rec.start() } catch { setListening(false) }
  }, [SR, lang])

  const stop = useCallback(() => { try { recRef.current?.stop() } catch { /* already stopped */ } }, [])

  const speak = useCallback((text: string, onDone?: () => void) => {
    if (!('speechSynthesis' in window)) { onDone?.(); return }
    window.speechSynthesis.cancel()
    const u = new SpeechSynthesisUtterance(text.replace(/[*_#]/g, ''))
    u.lang = lang; u.rate = 0.95
    if (voice) u.voice = voice
    u.onstart = () => setSpeaking(true)
    u.onend = () => { setSpeaking(false); onDone?.() }
    u.onerror = () => { setSpeaking(false); onDone?.() }
    window.speechSynthesis.speak(u)
  }, [lang, voice])

  const silence = useCallback(() => { window.speechSynthesis?.cancel(); setSpeaking(false) }, [])
  return { supported, listening, speaking, error, hasVoice, listen, stop, speak, silence }
}
