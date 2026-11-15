import { useState } from 'react'
import { NavLink, Outlet, Link, useLocation } from 'react-router-dom'
import { Activity, Bell, CalendarClock, ClipboardList, FileText, Home, Languages, LogOut, MessageCircle, Moon, MoreHorizontal, Stethoscope, Sun, UserRound, Users } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { LANGUAGES } from '../lib/languages'
import { useLang, useTheme } from '../lib/ctx'
import { Modal, Pulse } from './ui'

const GROUPS = [
  { name: 'Today', items: [{ to: '/', label: 'Overview', icon: Home }, { to: '/chat', label: 'Assistant', icon: MessageCircle }] },
  { name: 'Care', items: [{ to: '/symptoms', label: 'Symptom check', icon: Stethoscope }, { to: '/doctors', label: 'Doctors', icon: CalendarClock }, { to: '/reports', label: 'Reports', icon: FileText }, { to: '/reminders', label: 'Reminders', icon: Bell }] },
  { name: 'Insights', items: [{ to: '/analytics', label: 'Trends', icon: Activity }, { to: '/family', label: 'Family history', icon: Users }, { to: '/summary', label: 'Doctor summary', icon: ClipboardList }] },
  { name: 'You', items: [{ to: '/profile', label: 'My profile', icon: UserRound }] },
]
const TABS = [GROUPS[0].items[0], GROUPS[0].items[1], GROUPS[1].items[0], GROUPS[1].items[1]]

export default function Layout() {
  const { lang, setLang } = useLang(); const { theme, toggle } = useTheme()
  const [more, setMore] = useState(false); const loc = useLocation()
  const langSelect = (
    <label className="flex items-center gap-2 rounded-lg bg-sunken px-2.5 py-1.5 text-sm"><Languages className="h-4 w-4 text-muted" aria-hidden />
      <select aria-label="Language" value={lang} onChange={(e) => setLang(e.target.value)} className="bg-transparent font-medium outline-none">
        {LANGUAGES.map((l) => <option key={l.code} value={l.code}>{l.label}</option>)}</select></label>
  )
  const themeBtn = <button onClick={toggle} aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'} className="rounded-lg p-2 hover:bg-sunken">{theme === 'dark' ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}</button>

  return (
    <div className="min-h-screen md:flex">
      <aside className="no-print hidden md:flex md:w-64 shrink-0 flex-col gap-5 border-r border-line bg-surface p-5 sticky top-0 h-screen overflow-y-auto">
        <Link to="/" className="flex items-center gap-2.5 font-display text-xl font-semibold text-primary">
          <span className="grid h-9 w-9 place-items-center rounded-xl bg-primary text-on-primary"><Pulse className="h-5 w-6" /></span>MediCare AI</Link>
        <nav aria-label="Main" className="flex-1 space-y-5">
          {GROUPS.map((g) => (
            <div key={g.name}><p className="px-3 mb-1 text-xs font-semibold text-muted">{g.name}</p>
              {g.items.map(({ to, label, icon: Icon }) => (
                <NavLink key={to} to={to} end={to === '/'} className={({ isActive }) => `flex items-center gap-3 rounded-xl px-3 py-2 text-[15px] font-medium transition ${isActive ? 'bg-primary-soft text-primary' : 'text-ink/80 hover:bg-sunken'}`}>
                  <Icon className="h-[18px] w-[18px]" aria-hidden />{label}</NavLink>))}</div>
          ))}
        </nav>
        <div className="flex items-center justify-between gap-2">{langSelect}{themeBtn}</div>
        <button onClick={() => supabase.auth.signOut()} className="flex items-center gap-3 rounded-xl px-3 py-2 text-sm font-medium text-muted hover:bg-sunken"><LogOut className="h-[18px] w-[18px]" />Sign out</button>
      </aside>

      <header className="no-print md:hidden sticky top-0 z-20 flex items-center justify-between border-b border-line bg-surface/95 backdrop-blur px-4 py-2.5" style={{ paddingTop: 'max(0.625rem, env(safe-area-inset-top))' }}>
        <Link to="/" className="flex items-center gap-2 font-display text-lg font-semibold text-primary"><Pulse className="h-4 w-6" />MediCare AI</Link>
        <div className="flex items-center gap-1">{langSelect}{themeBtn}</div>
      </header>

      <main key={loc.pathname} className="animate-rise flex-1 min-w-0 p-4 md:p-10 max-w-5xl w-full mx-auto pb-32 md:pb-12 print:p-0">
        <Outlet />
      </main>

      <Link to="/sos" aria-label="Emergency SOS" className="no-print sos-pulse fixed right-4 bottom-24 md:bottom-8 md:right-8 z-30 grid h-16 w-16 place-items-center rounded-full bg-danger font-display text-lg font-bold text-white shadow-xl hover:opacity-90">SOS</Link>

      <nav aria-label="Primary" className="no-print md:hidden fixed bottom-0 inset-x-0 z-20 grid grid-cols-5 border-t border-line bg-surface/95 backdrop-blur" style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}>
        {TABS.map(({ to, label, icon: Icon }) => (
          <NavLink key={to} to={to} end={to === '/'} className={({ isActive }) => `flex flex-col items-center gap-0.5 py-2.5 text-[11px] font-semibold ${isActive ? 'text-primary' : 'text-muted'}`}><Icon className="h-5 w-5" aria-hidden />{label.split(' ')[0]}</NavLink>))}
        <button onClick={() => setMore(true)} className="flex flex-col items-center gap-0.5 py-2.5 text-[11px] font-semibold text-muted"><MoreHorizontal className="h-5 w-5" aria-hidden />More</button>
      </nav>

      <Modal open={more} title="More" onClose={() => setMore(false)}>
        <div className="grid gap-1">
          {GROUPS.flatMap((g) => g.items).filter((i) => !TABS.includes(i)).map(({ to, label, icon: Icon }) => (
            <Link key={to} to={to} onClick={() => setMore(false)} className="flex items-center gap-3 rounded-xl px-3 py-3 font-medium hover:bg-sunken"><Icon className="h-5 w-5 text-primary" aria-hidden />{label}</Link>))}
          <button onClick={() => supabase.auth.signOut()} className="flex items-center gap-3 rounded-xl px-3 py-3 font-medium text-muted hover:bg-sunken"><LogOut className="h-5 w-5" />Sign out</button>
        </div>
      </Modal>
    </div>
  )
}
