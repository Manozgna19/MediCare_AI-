import { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode, SelectHTMLAttributes, TextareaHTMLAttributes, useEffect, useId, useState, KeyboardEvent } from 'react'
import { Loader2, X } from 'lucide-react'

export const Card = ({ children, className = '', tone }: { children: ReactNode; className?: string; tone?: 'danger' | 'warn' | 'ok' | 'primary' }) => (
  <section className={`rounded-2xl border p-5 ${tone === 'danger' ? 'bg-danger-soft border-danger/30' : tone === 'warn' ? 'bg-warn-soft border-warn/30' : tone === 'ok' ? 'bg-ok-soft border-ok/30' : tone === 'primary' ? 'bg-primary-soft border-primary/20' : 'bg-surface border-line'} ${className}`}>{children}</section>
)

export const PageHeader = ({ title, hint, actions }: { title: string; hint?: string; actions?: ReactNode }) => (
  <header className="mb-6 flex flex-wrap items-end justify-between gap-3">
    <div>
      <h1 className="text-3xl font-semibold">{title}</h1>
      {hint && <p className="text-muted mt-1 max-w-prose">{hint}</p>}
    </div>
    {actions}
  </header>
)

type BtnProps = ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'soft' | 'ghost' | 'danger'; size?: 'sm' | 'md' | 'lg'; loading?: boolean; icon?: ReactNode }
export function Button({ variant = 'primary', size = 'md', loading, icon, className = '', children, disabled, ...p }: BtnProps) {
  const v = {
    primary: 'bg-primary text-on-primary hover:opacity-90', soft: 'bg-primary-soft text-primary hover:bg-primary/20',
    ghost: 'text-ink hover:bg-sunken border border-line', danger: 'bg-danger text-white hover:opacity-90',
  }[variant]
  const s = { sm: 'px-3 py-1.5 text-sm', md: 'px-4 py-2.5', lg: 'px-6 py-3.5 text-lg' }[size]
  return (
    <button {...p} disabled={disabled || loading} className={`inline-flex items-center justify-center gap-2 rounded-xl font-semibold transition disabled:opacity-50 disabled:cursor-not-allowed ${v} ${s} ${className}`}>
      {loading ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : icon}{children}
    </button>
  )
}

const inputCls = 'mt-1 w-full rounded-xl border border-line px-3 py-2.5 focus:border-primary'
export const Field = ({ label, hint, className = '', ...p }: InputHTMLAttributes<HTMLInputElement> & { label: string; hint?: string }) => (
  <label className={`block ${className}`}><span className="text-sm font-medium">{label}</span>
    <input {...p} className={inputCls} />{hint && <span className="text-xs text-muted">{hint}</span>}</label>
)
export const Select = ({ label, children, className = '', ...p }: SelectHTMLAttributes<HTMLSelectElement> & { label: string }) => (
  <label className={`block ${className}`}><span className="text-sm font-medium">{label}</span><select {...p} className={inputCls}>{children}</select></label>
)
export const Textarea = ({ label, className = '', ...p }: TextareaHTMLAttributes<HTMLTextAreaElement> & { label: string }) => (
  <label className={`block ${className}`}><span className="text-sm font-medium">{label}</span><textarea {...p} className={inputCls} /></label>
)

export const Chip = ({ on, children, ...p }: { on?: boolean; children: ReactNode } & ButtonHTMLAttributes<HTMLButtonElement>) => (
  <button type="button" aria-pressed={on} {...p} className={`rounded-full border px-3.5 py-1.5 text-sm font-medium transition ${on ? 'bg-primary text-on-primary border-primary' : 'bg-surface border-line hover:bg-sunken'}`}>{children}</button>
)

const toneCls = { ok: 'bg-ok-soft text-ok', warn: 'bg-warn-soft text-warn', danger: 'bg-danger-soft text-danger', info: 'bg-primary-soft text-primary', neutral: 'bg-sunken text-muted' }
export const Badge = ({ tone = 'neutral', children }: { tone?: keyof typeof toneCls; children: ReactNode }) => (
  <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${toneCls[tone]}`}>{children}</span>
)
const LEVEL_TONE: Record<string, keyof typeof toneCls> = { self_care: 'ok', see_doctor_soon: 'warn', see_doctor_today: 'warn', emergency: 'danger' }
export const LevelBadge = ({ level }: { level: string }) => <Badge tone={LEVEL_TONE[level] ?? 'info'}>{level.replace(/_/g, ' ')}</Badge>

export function Segmented<T extends string>({ options, value, onChange, label }: { options: { value: T; label: string; badge?: number }[]; value: T; onChange: (v: T) => void; label: string }) {
  const onKey = (e: KeyboardEvent) => {
    const i = options.findIndex((o) => o.value === value)
    if (e.key === 'ArrowRight') onChange(options[(i + 1) % options.length].value)
    if (e.key === 'ArrowLeft') onChange(options[(i - 1 + options.length) % options.length].value)
  }
  return (
    <div role="tablist" aria-label={label} onKeyDown={onKey} className="inline-flex flex-wrap gap-1 rounded-xl bg-sunken p-1">
      {options.map((o) => (
        <button key={o.value} role="tab" aria-selected={o.value === value} tabIndex={o.value === value ? 0 : -1} onClick={() => onChange(o.value)}
          className={`rounded-lg px-4 py-1.5 text-sm font-semibold transition ${o.value === value ? 'bg-surface text-ink shadow-sm' : 'text-muted hover:text-ink'}`}>
          {o.label}{o.badge ? <span className="ml-1.5 rounded-full bg-primary text-on-primary px-1.5 text-xs">{o.badge}</span> : null}
        </button>
      ))}
    </div>
  )
}

export const Skeleton = ({ className = '' }: { className?: string }) => <div aria-hidden className={`animate-pulse rounded-xl bg-sunken ${className}`} />
export const PageSkeleton = () => (
  <div role="status" aria-label="Loading" className="space-y-4"><Skeleton className="h-9 w-64" /><div className="grid md:grid-cols-3 gap-4"><Skeleton className="h-40" /><Skeleton className="h-40" /><Skeleton className="h-40" /></div><Skeleton className="h-72" /></div>
)

export const Empty = ({ icon, title, hint, action }: { icon?: ReactNode; title: string; hint?: string; action?: ReactNode }) => (
  <div className="flex flex-col items-center text-center gap-2 py-8 text-muted">
    {icon && <div className="rounded-full bg-sunken p-3 text-primary">{icon}</div>}
    <p className="font-semibold text-ink">{title}</p>{hint && <p className="text-sm max-w-xs">{hint}</p>}{action}
  </div>
)

export const Notice = ({ tone = 'warn', children }: { tone?: 'warn' | 'danger' | 'ok' | 'info'; children: ReactNode }) => (
  <p role={tone === 'danger' ? 'alert' : 'status'} className={`rounded-xl px-3.5 py-2.5 text-sm ${toneCls[tone]}`}>{children}</p>
)
export const ErrorNote = ({ msg }: { msg: string }) => (msg ? <Notice tone="danger">{msg}</Notice> : null)

export const Stat = ({ label, value, sub, tone }: { label: string; value: ReactNode; sub?: ReactNode; tone?: keyof typeof toneCls }) => (
  <div className="rounded-xl bg-sunken p-3.5">
    <p className="text-xs text-muted font-medium">{label}</p>
    <p className="font-display text-2xl font-semibold mt-0.5">{value}</p>
    {sub && <p className={`text-xs mt-0.5 font-medium ${tone ? toneCls[tone].split(' ')[1] : 'text-muted'}`}>{sub}</p>}
  </div>
)

export function Ring({ value, size = 132, stroke = 11, tone = 'primary', children }: { value: number; size?: number; stroke?: number; tone?: 'primary' | 'warn' | 'danger'; children?: ReactNode }) {
  const [v, setV] = useState(0)
  useEffect(() => { const t = setTimeout(() => setV(value), 60); return () => clearTimeout(t) }, [value])
  const r = (size - stroke) / 2; const c = 2 * Math.PI * r
  const col = { primary: 'rgb(var(--primary))', warn: 'rgb(var(--accent))', danger: 'rgb(var(--danger))' }[tone]
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90" aria-hidden>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgb(var(--sunken))" strokeWidth={stroke} />
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={col} strokeWidth={stroke} strokeLinecap="round" strokeDasharray={c} strokeDashoffset={c * (1 - v / 100)} style={{ transition: 'stroke-dashoffset 1s ease-out' }} />
      </svg>
      <div className="absolute inset-0 grid place-items-center text-center">{children}</div>
    </div>
  )
}

export function Switch({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <label className="flex items-center justify-between gap-3 py-1.5 cursor-pointer">
      <span className="capitalize">{label}</span>
      <button type="button" role="switch" aria-checked={checked} aria-label={label} onClick={() => onChange(!checked)}
        className={`relative h-6 w-11 rounded-full transition ${checked ? 'bg-primary' : 'bg-line'}`}>
        <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white transition-all ${checked ? 'left-[22px]' : 'left-0.5'}`} />
      </button>
    </label>
  )
}

export function Modal({ open, title, onClose, children }: { open: boolean; title: string; onClose: () => void; children: ReactNode }) {
  const id = useId()
  useEffect(() => {
    if (!open) return
    const k = (e: globalThis.KeyboardEvent) => e.key === 'Escape' && onClose()
    document.addEventListener('keydown', k); return () => document.removeEventListener('keydown', k)
  }, [open, onClose])
  if (!open) return null
  return (
    <div className="no-print fixed inset-0 z-40 grid place-items-end md:place-items-center bg-ink/40 p-0 md:p-4" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div role="dialog" aria-modal="true" aria-labelledby={id} className="animate-rise w-full max-w-md rounded-t-3xl md:rounded-2xl bg-surface border border-line p-6 max-h-[90vh] overflow-y-auto">
        <div className="flex items-start justify-between gap-3 mb-3"><h2 id={id} className="text-xl font-semibold">{title}</h2>
          <button onClick={onClose} aria-label="Close" className="rounded-lg p-1 hover:bg-sunken"><X className="h-5 w-5" /></button></div>
        {children}
      </div>
    </div>
  )
}

export function TagInput({ label, value, onChange, placeholder }: { label: string; value: string[]; onChange: (v: string[]) => void; placeholder?: string }) {
  const [text, setText] = useState('')
  const add = () => { const t = text.trim(); if (t && !value.some((v) => v.toLowerCase() === t.toLowerCase())) onChange([...value, t]); setText('') }
  return (
    <div>
      <span className="text-sm font-medium">{label}</span>
      <div className="mt-1 flex flex-wrap gap-1.5 rounded-xl border border-line bg-surface p-2">
        {value.map((t) => (
          <span key={t} className="inline-flex items-center gap-1 rounded-full bg-primary-soft text-primary pl-3 pr-1.5 py-1 text-sm font-medium">{t}
            <button type="button" aria-label={`Remove ${t}`} onClick={() => onChange(value.filter((v) => v !== t))} className="rounded-full p-0.5 hover:bg-primary/20"><X className="h-3.5 w-3.5" /></button></span>
        ))}
        <input aria-label={label} value={text} placeholder={value.length ? '' : placeholder} onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); add() } if (e.key === 'Backspace' && !text && value.length) onChange(value.slice(0, -1)) }}
          onBlur={add} className="min-w-[8rem] flex-1 bg-transparent px-1 py-1 outline-none" />
      </div>
    </div>
  )
}

export const Pulse = ({ className = '', draw = false }: { className?: string; draw?: boolean }) => (
  <svg viewBox="0 0 400 80" className={className} fill="none" aria-hidden>
    <path d="M0 42h90l22-30 28 62 24-40 14 14h222" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className={draw ? 'draw' : ''} style={{ ['--len' as string]: 620 }} />
  </svg>
)
