import { lazy, Suspense, useEffect, useState } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import type { Session } from '@supabase/supabase-js'
import { isSupabaseConfigured, supabase } from './lib/supabase'
import { Providers } from './lib/ctx'
import Layout from './components/Layout'
import { PageSkeleton } from './components/ui'
import Login from './pages/Login'
import SetupNotice from './components/SetupNotice'

const Dashboard = lazy(() => import('./pages/Dashboard'))
const Chat = lazy(() => import('./pages/Chat'))
const Symptoms = lazy(() => import('./pages/Symptoms'))
const Doctors = lazy(() => import('./pages/Doctors'))
const Reports = lazy(() => import('./pages/Reports'))
const Sos = lazy(() => import('./pages/Sos'))
const Profile = lazy(() => import('./pages/Profile'))
const Reminders = lazy(() => import('./pages/Reminders'))
const Analytics = lazy(() => import('./pages/Analytics'))
const Family = lazy(() => import('./pages/Family'))
const Summary = lazy(() => import('./pages/Summary'))

export default function App() {
  const [session, setSession] = useState<Session | null>(null)
  const [ready, setReady] = useState(false)
  useEffect(() => {
    if (!isSupabaseConfigured) { setReady(true); return }
    supabase.auth.getSession().then(({ data }) => { setSession(data.session); setReady(true) })
    const { data } = supabase.auth.onAuthStateChange((_e, s) => setSession(s))
    return () => data.subscription.unsubscribe()
  }, [])
  if (!ready) return null
  if (!isSupabaseConfigured) return <SetupNotice />
  return (
    <Providers>
      {!session ? <Login /> : (
        <Suspense fallback={<div className="p-8"><PageSkeleton /></div>}>
          <Routes>
            <Route element={<Layout />}>
              <Route path="/" element={<Dashboard />} />
              <Route path="/chat" element={<Chat />} />
              <Route path="/symptoms" element={<Symptoms />} />
              <Route path="/doctors" element={<Doctors />} />
              <Route path="/reports" element={<Reports />} />
              <Route path="/sos" element={<Sos />} />
              <Route path="/profile" element={<Profile />} />
              <Route path="/reminders" element={<Reminders />} />
              <Route path="/analytics" element={<Analytics />} />
              <Route path="/family" element={<Family />} />
              <Route path="/summary" element={<Summary />} />
              <Route path="*" element={<Navigate to="/" />} />
            </Route>
          </Routes>
        </Suspense>
      )}
    </Providers>
  )
}
