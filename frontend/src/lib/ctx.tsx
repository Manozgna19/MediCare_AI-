import { createContext, ReactNode, useCallback, useContext, useEffect, useState } from 'react'

// ---- language ----
const LangCtx = createContext({ lang: 'en-IN', setLang: (_: string) => {} })
export const useLang = () => useContext(LangCtx)
/** Backend takes a short code ("te"); speech APIs take the full BCP-47 tag ("te-IN"). */
export const short = (l: string) => l.split('-')[0]

// ---- theme ----
const ThemeCtx = createContext({ theme: 'light' as 'light' | 'dark', toggle: () => {} })
export const useTheme = () => useContext(ThemeCtx)

// ---- toasts ----
type Kind = 'ok' | 'error' | 'info'
const ToastCtx = createContext<(msg: string, kind?: Kind) => void>(() => {})
export const useToast = () => useContext(ToastCtx)

export function Providers({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState(localStorage.getItem('lang') ?? 'en-IN')
  const setLang = (l: string) => { localStorage.setItem('lang', l); setLangState(l); document.documentElement.lang = short(l) }
  const [theme, setTheme] = useState<'light' | 'dark'>(document.documentElement.classList.contains('dark') ? 'dark' : 'light')
  useEffect(() => { document.documentElement.classList.toggle('dark', theme === 'dark'); try { localStorage.setItem('theme', theme) } catch { /* private mode */ } }, [theme])
  const [toasts, setToasts] = useState<{ id: number; msg: string; kind: Kind }[]>([])
  const toast = useCallback((msg: string, kind: Kind = 'ok') => {
    const id = Date.now() + Math.random()
    setToasts((t) => [...t.slice(-2), { id, msg, kind }])
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 4200)
  }, [])
  return (
    <LangCtx.Provider value={{ lang, setLang }}>
      <ThemeCtx.Provider value={{ theme, toggle: () => setTheme((t) => (t === 'dark' ? 'light' : 'dark')) }}>
        <ToastCtx.Provider value={toast}>
          {children}
          <div aria-live="polite" className="no-print fixed bottom-24 md:bottom-6 left-1/2 -translate-x-1/2 z-50 flex flex-col gap-2 items-center pointer-events-none px-4 w-full max-w-md">
            {toasts.map((t) => (
              <p key={t.id} className={`animate-rise pointer-events-auto rounded-xl px-4 py-2.5 text-sm font-medium shadow-lg border ${t.kind === 'error' ? 'bg-danger-soft text-danger border-danger/30' : t.kind === 'ok' ? 'bg-ok-soft text-ok border-ok/30' : 'bg-surface text-ink border-line'}`}>{t.msg}</p>
            ))}
          </div>
        </ToastCtx.Provider>
      </ThemeCtx.Provider>
    </LangCtx.Provider>
  )
}
