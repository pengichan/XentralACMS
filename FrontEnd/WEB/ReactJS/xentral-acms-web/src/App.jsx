import './App.css'
import { useEffect, useState } from 'react'
import { Navigate, Route, Routes, useNavigate, useLocation } from 'react-router-dom'
import { useAuth } from './context/AuthContext'
import SignInPage from './pages/sign-in/SignInPage'
import UniversalTheme from './components/universal-theme/UniversalTheme'
import SidebarNav from './components/SidebarNav'
import { Link } from 'react-router-dom'
import ServerManagement from './pages/pam/ServerManagement'
import CredentialVault from './pages/pam/CredentialVault'
import TicketingDashboard from './pages/pam/TicketingDashboard'
import AuditLogs from './pages/pam/AuditLogs'
import ReportsExport from './pages/pam/ReportsExport'
import Dashboard from './pages/pam/Dashboard'
import UserManagement from './pages/pam/UserManagement'
import AssignedServers from './pages/pam/AssignedServers'
import MyAccessHistory from './pages/pam/MyAccessHistory'
import Settings from './pages/pam/Settings'
import ServerDetails from './pages/pam/ServerDetails'
import OnboardingSetupModal from './components/onboarding-setup/OnboardingSetupModal'
import RequestSupportPage from './pages/support/RequestSupportPage'
import FileBox from './pages/pam/FileBox'
import ForceChangePasswordModal from './components/ForceChangePasswordModal'
import NotificationBell from './components/NotificationBell'

function App() {
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [timeoutMinutes, setTimeoutMinutes] = useState(15)

  // Route protection
  useEffect(() => {
    const publicPaths = ['/sign-in', '/sign-up', '/', '/request-support']
    if (!user && !publicPaths.includes(location.pathname)) {
      navigate('/sign-in')
    }
  }, [user, location.pathname, navigate])

  // Fetch dynamic system settings for inactivity timeout
  useEffect(() => {
    if (!user) return
    fetch('http://localhost:8080/api/system/settings')
      .then(res => {
        if (res.ok) return res.json();
        throw new Error('Not ok');
      })
      .then(data => {
        if (data && data.inactivityTimeoutMinutes) {
          setTimeoutMinutes(data.inactivityTimeoutMinutes)
        }
      })
      .catch(err => console.error('Failed to load system settings', err))
  }, [user])

  // Inactivity timeout: dynamic duration based on database config
  useEffect(() => {
    if (!user) return

    let timeoutId
    const TIMEOUT_DURATION = timeoutMinutes * 60 * 1000 

    const resetTimer = () => {
      if (timeoutId) clearTimeout(timeoutId)
      timeoutId = setTimeout(() => {
        logout()
        navigate('/sign-in')
        alert(`You have been logged out due to ${timeoutMinutes} minutes of inactivity.`)
      }, TIMEOUT_DURATION)
    }

    // Set initial timer
    resetTimer()

    // Listen to user activity events
    const events = ['mousemove', 'keydown', 'scroll', 'click', 'mousedown', 'touchstart']
    events.forEach(event => {
      window.addEventListener(event, resetTimer)
    })

    return () => {
      if (timeoutId) clearTimeout(timeoutId)
      events.forEach(event => {
        window.removeEventListener(event, resetTimer)
      })
    }
  }, [user, timeoutMinutes, logout, navigate])

  return (
    <UniversalTheme>
      <div className="app-shell" style={{ display: 'flex', minHeight: '100vh', background: '#090d16' }}>
        <SidebarNav />
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflowY: 'auto' }}>
          {user && !['/sign-in', '/sign-up', '/', '/request-support'].includes(location.pathname) && (
            <header style={{
              height: '60px',
              borderBottom: '1px solid rgba(255,255,255,0.08)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '0 2rem',
              background: 'rgba(10, 16, 35, 0.65)',
              backdropFilter: 'blur(10px)',
              position: 'sticky',
              top: 0,
              zIndex: 999,
              color: '#fff'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                <span style={{ fontSize: '0.85rem', color: 'rgba(255,255,255,0.45)', fontWeight: 600, letterSpacing: '0.5px', textTransform: 'uppercase' }}>
                  XentralACMS Portal
                </span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '2rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.75rem', color: '#a8ffca', background: 'rgba(16, 185, 129, 0.05)', border: '1px solid rgba(16, 185, 129, 0.15)', padding: '0.25rem 0.6rem', borderRadius: '6px', fontWeight: 600, letterSpacing: '0.3px' }}>
                  <span className="secure-pulse-dot" style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#10b981', display: 'inline-block' }} />
                  SECURE TUNNEL: ACTIVE
                </div>

                <div style={{ width: '1px', height: '20px', background: 'rgba(255,255,255,0.1)' }} />

                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <span style={{
                    padding: '0.15rem 0.5rem',
                    borderRadius: '4px',
                    fontSize: '0.68rem',
                    fontWeight: 700,
                    textTransform: 'uppercase',
                    background: (user?.roleName === 'Super Admin' || user?.roleName === 'Admin' || user?.roleName === 'SUPER_ADMIN') ? 'rgba(255,203,66,0.15)' : 'rgba(255,255,255,0.06)',
                    color: (user?.roleName === 'Super Admin' || user?.roleName === 'Admin' || user?.roleName === 'SUPER_ADMIN') ? '#ffcb42' : '#fff',
                    border: `1px solid ${(user?.roleName === 'Super Admin' || user?.roleName === 'Admin' || user?.roleName === 'SUPER_ADMIN') ? 'rgba(255,203,66,0.3)' : 'rgba(255,255,255,0.15)'}`
                  }}>
                    {user?.roleName || 'USER'}
                  </span>
                  <span style={{ fontSize: '0.82rem', opacity: 0.85, fontWeight: 600 }}>
                    {user?.firstName ? `${user.firstName} ${user.lastName?.[0] || ''}.` : user?.userId}
                  </span>
                </div>

                <div style={{ width: '1px', height: '20px', background: 'rgba(255,255,255,0.1)' }} />

                <NotificationBell />
              </div>
            </header>
          )}
          <div style={{ flex: 1, padding: '2rem' }}>
          <Routes>
          <Route path="/" element={<Navigate to="/sign-in" replace />} />
          <Route path="/login" element={<Navigate to="/sign-in" replace />} />
          <Route path="/sign-in" element={<SignInPage />} />
          <Route path="/sign-up" element={<Navigate to="/sign-in" replace />} />
          <Route path="/request-support" element={<RequestSupportPage />} />

          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/pam/servers" element={<ServerManagement />} />
          <Route path="/pam/servers/:id" element={<ServerDetails />} />
          <Route path="/pam/credentials" element={<CredentialVault />} />
          <Route path="/pam/tickets" element={<TicketingDashboard />} />
          <Route path="/pam/audit-logs" element={<AuditLogs />} />
          <Route path="/pam/reports" element={<ReportsExport />} />
          <Route path="/pam/users" element={<UserManagement />} />
          <Route path="/pam/assigned-servers" element={<AssignedServers />} />
           <Route path="/pam/access-history" element={<MyAccessHistory />} />
          <Route path="/pam/settings" element={<Settings />} />
          <Route path="/pam/files" element={<FileBox />} />
          </Routes>
          </div>
        </div>
      </div>
      <OnboardingSetupModal />
      <ForceChangePasswordModal />
    </UniversalTheme>
  )
}

export default App
