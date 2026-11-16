import { useMemo, useState } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import { AppContext, useOrgs, useSession } from '../data/hooks'
import { LoadError } from '../ui/kit'
import Shell from './Shell'
import Login from '../pages/Login'
import Welcome from '../pages/Welcome'
import Setup from '../pages/Setup'
import Schedule from '../pages/Schedule'
import Team from '../pages/Team'
import Settings from '../pages/Settings'
import MyShifts from '../pages/MyShifts'
import MyAvailability from '../pages/MyAvailability'

const remember = { get: () => { try { return localStorage.getItem('shiftsync.org') } catch { return null } }, set: v => { try { localStorage.setItem('shiftsync.org', v) } catch { /* private mode */ } } }

export default function App() {
  const session = useSession()
  if (session.status === 'loading') return <div className="center-screen"><div className="spinner" /></div>
  if (session.status === 'out') return <Login />
  return <SignedIn profile={session.profile} />
}

function SignedIn({ profile }) {
  const orgsQ = useOrgs(profile.id)
  const [orgId, setOrgIdState] = useState(remember.get)
  const orgs = orgsQ.data
  const org = orgs?.find(o => o.id === orgId) || orgs?.[0] || null
  const ctx = useMemo(() => ({
    profile, orgs: orgs || [], org, isManager: org?.role === 'admin',
    setOrgId: id => { remember.set(id); setOrgIdState(id) },
  }), [profile, orgs, org])

  if (orgsQ.isLoading) return <div className="center-screen"><div className="spinner" /></div>
  if (orgsQ.error) return <div className="center-screen"><LoadError error={orgsQ.error} retry={orgsQ.refetch} /></div>

  const home = ctx.isManager ? '/schedule' : '/shifts'
  const manager = el => (ctx.isManager ? el : <Navigate to="/shifts" replace />)
  return (
    <AppContext.Provider value={ctx}>
      {!org ? (
        <Routes><Route path="*" element={<Welcome first />} /></Routes>
      ) : (
        <Routes>
          <Route path="/welcome" element={<Welcome />} />
          <Route path="/setup" element={manager(<Setup />)} />
          <Route element={<Shell />}>
            <Route path="/schedule/:week?" element={manager(<Schedule />)} />
            <Route path="/team" element={manager(<Team />)} />
            <Route path="/settings" element={manager(<Settings />)} />
            <Route path="/shifts/:week?" element={<MyShifts />} />
            <Route path="/availability" element={<MyAvailability />} />
            <Route path="*" element={<Navigate to={home} replace />} />
          </Route>
        </Routes>
      )}
    </AppContext.Provider>
  )
}

