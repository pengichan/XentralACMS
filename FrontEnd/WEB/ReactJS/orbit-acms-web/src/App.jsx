import './App.css'
import { useEffect } from 'react'
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

function App() {
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()

  // Route protection
  useEffect(() => {
    const publicPaths = ['/sign-in', '/sign-up', '/']
    if (!user && !publicPaths.includes(location.pathname)) {
      navigate('/sign-in')
    }
  }, [user, location.pathname, navigate])

  // Inactivity timeout: 15 minutes (900000 ms)
  useEffect(() => {
    if (!user) return

    let timeoutId
    const TIMEOUT_DURATION = 15 * 60 * 1000 // 15 minutes

    const resetTimer = () => {
      if (timeoutId) clearTimeout(timeoutId)
      timeoutId = setTimeout(() => {
        logout()
        navigate('/sign-in')
        alert('You have been logged out due to 15 minutes of inactivity.')
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
  }, [user, logout, navigate])

  return (
    <UniversalTheme>
      <div className="app-shell" style={{ display: 'flex' }}>
        <SidebarNav />
        <div style={{ flex: 1, overflowY: 'auto' }}>
          <Routes>
          <Route path="/" element={<Navigate to="/sign-in" replace />} />
          <Route path="/login" element={<Navigate to="/sign-in" replace />} />
          <Route path="/sign-in" element={<SignInPage />} />
          <Route path="/sign-up" element={<Navigate to="/sign-in" replace />} />

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
          </Routes>
        </div>
      </div>
      <OnboardingSetupModal />
    </UniversalTheme>
  )
}

export default App
