import { useState, useEffect, useRef } from 'react'
import { initials, nameColor } from '../lib/utils'

export default function Topbar({
  profile, view, onView, tabs, onSignOut,
  orgs, currentOrg, onOrgChange, onManageOrgs
}){
  const [menuOpen, setMenuOpen] = useState(false)
  const [orgOpen, setOrgOpen]   = useState(false)
  const [mobileNav, setMobileNav] = useState(false)
  const orgRef = useRef(null)
  const menuRef = useRef(null)

  useEffect(()=>{
    function onClick(e){
      if(orgRef.current && !orgRef.current.contains(e.target)) setOrgOpen(false)
      if(menuRef.current && !menuRef.current.contains(e.target)) setMenuOpen(false)
    }
    document.addEventListener('mousedown', onClick)
    return ()=>document.removeEventListener('mousedown', onClick)
  }, [])

  const [bg, fg] = nameColor(profile?.name)
  const isPersonal = currentOrg?.id === '__personal__'

  return(
    <>
      <div className="topbar">
        <div className="topbar-left">
          <button
            className="menu-btn mobile-only"
            onClick={()=>setMobileNav(true)}
            aria-label="Open navigation menu">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="3" y1="6" x2="21" y2="6"/>
              <line x1="3" y1="12" x2="21" y2="12"/>
              <line x1="3" y1="18" x2="21" y2="18"/>
            </svg>
          </button>
          <div className="logo">Shift<span>Sync</span></div>
        </div>

        <div className="topbar-center desktop-only">
          <nav className="nav">
            {tabs.map(([v,l]) => (
              <button key={v}
                className={`nav-tab${view===v?' active':''}`}
                onClick={()=>onView(v)}>
                {l}
              </button>
            ))}
          </nav>
        </div>

        <div className="topbar-right">
          {/* Org switcher */}
          {currentOrg && (
            <div className="org-switcher" ref={orgRef}>
              <button className="org-btn" onClick={()=>setOrgOpen(o=>!o)} aria-haspopup="listbox" aria-expanded={orgOpen}>
                <span className={`org-dot ${isPersonal?'personal':''}`}></span>
                <span className="org-name">{currentOrg.name}</span>
                <svg width="10" height="10" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <polyline points="3 4.5 6 7.5 9 4.5"/>
                </svg>
              </button>
              {orgOpen && (
                <div className="org-dropdown" role="listbox">
                  <div className="org-dropdown-section">
                    <div className="org-dropdown-label">Personal</div>
                    <button
                      className={`org-dropdown-item${isPersonal?' selected':''}`}
                      onClick={()=>{onOrgChange({id:'__personal__',name:'Personal'}); setOrgOpen(false)}}>
                      <span className="org-dot personal"></span>
                      <span>My personal schedule</span>
                    </button>
                  </div>
                  {orgs.length>0 && (
                    <div className="org-dropdown-section">
                      <div className="org-dropdown-label">Organizations</div>
                      {orgs.map(o=>(
                        <button key={o.id}
                          className={`org-dropdown-item${currentOrg.id===o.id?' selected':''}`}
                          onClick={()=>{onOrgChange(o); setOrgOpen(false)}}>
                          <span className="org-dot"></span>
                          <span className="org-name-full">{o.name}</span>
                          {o.role==='admin' && <span className="pill pill-blue pill-tiny">Admin</span>}
                        </button>
                      ))}
                    </div>
                  )}
                  <button className="org-dropdown-action" onClick={()=>{onManageOrgs(); setOrgOpen(false)}}>
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <line x1="12" y1="5" x2="12" y2="19"/>
                      <line x1="5" y1="12" x2="19" y2="12"/>
                    </svg>
                    Create or join organization
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Profile menu */}
          <div className="profile-menu" ref={menuRef}>
            <button className="avatar avatar-btn" onClick={()=>setMenuOpen(o=>!o)}
              style={{width:32, height:32, fontSize:'12px', background:bg, color:fg}}
              aria-label="Profile menu">
              {initials(profile?.name)}
            </button>
            {menuOpen && (
              <div className="profile-dropdown">
                <div className="profile-dropdown-info">
                  <div className="profile-dropdown-name">{profile?.name}</div>
                  <div className="profile-dropdown-email">{profile?.email}</div>
                </div>
                <button className="profile-dropdown-item" onClick={()=>{onManageOrgs(); setMenuOpen(false)}}>
                  Manage organizations
                </button>
                <button className="profile-dropdown-item danger" onClick={()=>{onSignOut(); setMenuOpen(false)}}>
                  Sign out
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Mobile nav drawer */}
      {mobileNav && (
        <div className="mobile-drawer-overlay" onClick={()=>setMobileNav(false)}>
          <div className="mobile-drawer" onClick={e=>e.stopPropagation()}>
            <div className="mobile-drawer-header">
              <div className="logo">Shift<span>Sync</span></div>
              <button className="menu-btn" onClick={()=>setMobileNav(false)} aria-label="Close menu">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <line x1="6" y1="6" x2="18" y2="18"/>
                  <line x1="6" y1="18" x2="18" y2="6"/>
                </svg>
              </button>
            </div>
            <nav className="mobile-nav">
              {tabs.map(([v,l])=>(
                <button key={v}
                  className={`mobile-nav-tab${view===v?' active':''}`}
                  onClick={()=>{onView(v); setMobileNav(false)}}>
                  {l}
                </button>
              ))}
            </nav>
            <div className="mobile-drawer-footer">
              <div className="mobile-profile">
                <div className="avatar" style={{width:36,height:36,fontSize:'13px',background:bg,color:fg}}>{initials(profile?.name)}</div>
                <div>
                  <div style={{fontSize:'13px',fontWeight:500}}>{profile?.name}</div>
                  <div style={{fontSize:'11px',color:'#888'}}>{profile?.email}</div>
                </div>
              </div>
              <button className="btn btn-light" style={{width:'100%',marginTop:'10px'}} onClick={()=>{onManageOrgs(); setMobileNav(false)}}>
                Manage organizations
              </button>
              <button className="btn btn-red" style={{width:'100%',marginTop:'6px'}} onClick={onSignOut}>
                Sign out
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
