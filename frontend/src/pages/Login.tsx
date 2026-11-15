import { FormEvent, useState } from 'react'
import { supabase } from '../lib/supabase'
import { Button, ErrorNote, Field, Notice, Pulse } from '../components/ui'

export default function Login() {
  const [mode, setMode] = useState<'in' | 'up'>('in')
  const [email, setEmail] = useState(''); const [password, setPassword] = useState(''); const [name, setName] = useState('')
  const [err, setErr] = useState(''); const [note, setNote] = useState(''); const [busy, setBusy] = useState(false)

  async function submit(e: FormEvent) {
    e.preventDefault(); setErr(''); setNote(''); setBusy(true)
    const { error } = mode === 'in'
      ? await supabase.auth.signInWithPassword({ email, password })
      : await supabase.auth.signUp({ email, password, options: { data: { full_name: name } } })
    setBusy(false)
    if (error) setErr(error.message)
    else if (mode === 'up') setNote('Check your email to confirm your account, then sign in.')
  }

  return (
    <div className="min-h-screen grid md:grid-cols-[1.1fr_1fr] bg-bg text-ink">
      <div className="bg-primary text-on-primary p-8 md:p-14 flex flex-col justify-between min-h-[280px]">
        <p className="font-display text-xl font-semibold">MediCare AI</p>
        <div>
          <Pulse className="w-full max-w-md text-on-primary/90 mb-6" draw />
          <h1 className="text-4xl md:text-6xl font-semibold leading-[1.05] max-w-xl">Your health, in one place you can talk to.</h1>
          <p className="mt-5 max-w-md text-on-primary/80 text-lg">Check symptoms, scan prescriptions, book doctors and keep up with your medicines, in the language you think in.</p>
        </div>
      </div>
      <form onSubmit={submit} className="p-8 md:p-14 flex flex-col justify-center gap-4 max-w-md w-full mx-auto">
        <h2 className="text-3xl font-semibold">{mode === 'in' ? 'Welcome back' : 'Create your account'}</h2>
        {mode === 'up' && <Field label="Full name" value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" required />}
        <Field label="Email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" required />
        <Field label="Password" type="password" minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} autoComplete={mode === 'in' ? 'current-password' : 'new-password'} required hint={mode === 'up' ? 'At least 8 characters' : undefined} />
        <ErrorNote msg={err} />{note && <Notice tone="ok">{note}</Notice>}
        <Button size="lg" loading={busy}>{mode === 'in' ? 'Sign in' : 'Create account'}</Button>
        <button type="button" className="text-sm font-medium text-primary underline" onClick={() => setMode(mode === 'in' ? 'up' : 'in')}>
          {mode === 'in' ? 'New here? Create an account' : 'Already registered? Sign in'}</button>
        <p className="text-xs text-muted">MediCare AI gives general health information and is not a substitute for a doctor. In an emergency call 112.</p>
      </form>
    </div>
  )
}
