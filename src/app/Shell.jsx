import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import { api, IS_DEMO, useApp } from '../data/hooks'
import { Avatar, Menu, Segmented } from '../ui/kit'
import Icon from '../ui/Icon'

export function Brand() {
  return (
    <div className="brand">
      <span className="brand-mark" aria-hidden="true">
        <svg width="18" height="18" viewBox="0 0 18 18"><rect x="1" y="2" width="9" height="3.6" rx="1.8" fill="#2A1F33"/><rect x="5" y="7.2" width="12" height="3.6" rx="1.8" fill="#FFFBF6"/><rect x="1" y="12.4" width="8" height="3.6" rx="1.8" fill="#2A1F33"/></svg>
      </span>
      ShiftSync
    </div>
  )
}

export default function Shell() {
  const { profile, orgs, org, isManager, setOrgId } = useApp()
  const navigate = useNavigate()
  const links = isManager
    ? [['/schedule', 'calendar', 'Schedule'], ['/team', 'team', 'Team'], ['/settings', 'settings', 'Settings']]
    : [['/shifts', 'shifts', 'My shifts'], ['/availability', 'clock', 'Availability']]

  const orgItems = [
    { heading: 'Your businesses' },
    ...orgs.map(o => ({ label: o.name + (o.id === org.id ? '  ✓' : ''), onClick: () => { setOrgId(o.id); navigate('/') } })),
    'divider',
    { label: 'Add or join a business', icon: 'plus', onClick: () => navigate('/welcome') },
  ]
  const userItems = [
    isManager && { label: 'My shifts', icon: 'shifts', onClick: () => navigate('/shifts') },
    isManager && { label: 'My availability', icon: 'clock', onClick: () => navigate('/availability') },
    isManager && 'divider',
    { label: 'Sign out', onClick: () => api.signOut() },
  ]
  const orgButton = p => <button type="button" className="org-btn" {...p}><span className="name">{org.name}</span><Icon name="down" size={16} /></button>

  return (
    <div className="shell">
      {IS_DEMO && <DemoBar />}
      <aside className="side">
        <Brand />
        <Menu align="left" items={orgItems} trigger={orgButton} />
        <nav className="nav" aria-label="Main">
          {links.map(([to, icon, label]) => <NavLink key={to} to={to}><Icon name={icon} />{label}</NavLink>)}
        </nav>
        <div className="side-foot">
          <Menu align="left" up items={userItems} trigger={p => (
            <button type="button" className="user-btn" {...p}>
              <Avatar name={profile.name} id={profile.id} />
              <span className="grow"><b style={{ display: 'block', fontSize: 14 }}>{profile.name}</b><span className="small muted">{isManager ? 'Manager' : 'Team member'}</span></span>
            </button>
          )} />
        </div>
      </aside>

      <div style={{ minWidth: 0 }}>
        <header className="mobile-top">
          <Menu align="left" items={orgItems} trigger={orgButton} />
          <Menu items={userItems} trigger={p => <button type="button" className="icon-btn" aria-label="Account" {...p}><Avatar name={profile.name} id={profile.id} /></button>} />
        </header>
        <main className="main"><Outlet /></main>
      </div>

      <nav className="tabbar" aria-label="Main">
        {links.map(([to, icon, label]) => <NavLink key={to} to={to}><Icon name={icon} size={22} />{label}</NavLink>)}
      </nav>
    </div>
  )
}

function DemoBar() {
  const { isManager } = useApp()
  const navigate = useNavigate()
  return (
    <div className="demo-bar">
      <span>Demo with sample data. Nothing is saved.</span>
      <Segmented label="View as" value={isManager ? 'm' : 's'} options={[['m', 'Manager view'], ['s', 'Staff view']]}
        onChange={v => { api.demoSwitchUser(v === 'm' ? 'maya' : 'zoe'); navigate('/') }} />
    </div>
  )
}
