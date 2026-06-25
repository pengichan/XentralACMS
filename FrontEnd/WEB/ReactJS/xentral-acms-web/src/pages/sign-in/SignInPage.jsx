import { useState, useEffect } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import LiquidGlass from 'liquid-glass-react'
import { useAuth } from '../../context/AuthContext'
import BrandLogo from '../../components/brand-logo/BrandLogo'
import StandardModal from '../../components/standard-modal/StandardModal'
import './SignInPage.css'

function SignInPage() {
  const [view, setView] = useState('login') // 'login', 'recover_userid', 'recover_password'
  const [formData, setFormData] = useState({
    userId: '',
    password: ''
  })
  
  // Account Recovery states
  const [recoverUserId, setRecoverUserId] = useState('')
  const [recoverFirstName, setRecoverFirstName] = useState('')
  const [recoverLastName, setRecoverLastName] = useState('')
  const [recoverEmail, setRecoverEmail] = useState('')
  const [recoverNewPassword, setRecoverNewPassword] = useState('')
  const [recoverConfirmPassword, setRecoverConfirmPassword] = useState('')
  const [resetSuccessMsg, setResetSuccessMsg] = useState('')
  const [loading, setLoading] = useState(false)
  const [recoveryStep, setRecoveryStep] = useState(1)
  const [recoveredUserId, setRecoveredUserId] = useState('')

  const [errorMessage, setErrorMessage] = useState('')
  const [setupCompleted, setSetupCompleted] = useState(false)
  const navigate = useNavigate()
  const { login, user } = useAuth()

  useEffect(() => {
    if (user && user.userId !== 'admin') {
      navigate('/dashboard')
    }
  }, [user, navigate])

  useEffect(() => {
    fetch('http://localhost:8080/api/system/setup-status')
      .then(res => res.json())
      .then(data => {
        if (data && typeof data.setupCompleted === 'boolean') {
          setSetupCompleted(data.setupCompleted)
        }
      })
      .catch(err => console.error('Failed to load setup status', err))
  }, [])

  const handleChange = (event) => {
    const { id, value } = event.target
    setFormData((previous) => ({ ...previous, [id]: value }))
  }

  const handleSignIn = async () => {
    if (!formData.userId.trim() || !formData.password.trim()) {
      setErrorMessage('Please enter both UserID and Password.')
      return
    }

    try {
      const res = await fetch('http://localhost:8080/api/users/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: formData.userId, password: formData.password })
      })

      if (res.ok) {
        const userData = await res.json()
        const roleRes = await fetch(`http://localhost:8080/api/user-roles/${userData.userRoleId}`)
        let roleName = 'USER'
        if (roleRes.ok) {
          const roleData = await roleRes.json()
          roleName = roleData.roleName || roleData.role_name || 'USER'
        }
        login({ ...userData, roleName })
        navigate('/dashboard')
      } else {
        const errorText = await res.text()
        setErrorMessage(errorText || 'Invalid credentials. Please try again.')
      }
    } catch (err) {
      setErrorMessage('Failed to connect to server.')
    }
  }

  const handleRecoverUserID = async (e) => {
    e.preventDefault()
    if (!recoverFirstName.trim() || !recoverLastName.trim() || !recoverEmail.trim()) {
      setErrorMessage('First name, last name, and email are required.')
      return
    }
    setLoading(true)
    setErrorMessage('')
    try {
      const res = await fetch('http://localhost:8080/api/auth/recover-account', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          firstName: recoverFirstName.trim(),
          lastName: recoverLastName.trim(),
          email: recoverEmail.trim(),
          newPassword: ''
        })
      })
      if (res.ok) {
        const data = await res.json()
        setRecoveredUserId(data.userId)
        setRecoveryStep(2)
      } else {
        const txt = await res.text()
        setErrorMessage(txt || 'No active account matches the details provided.')
      }
    } catch (err) {
      setErrorMessage('Failed to connect to recovery service.')
    } finally {
      setLoading(false)
    }
  }

  const handleVerifyPasswordResetIdentity = async (e) => {
    e.preventDefault()
    if (!recoverUserId.trim() || !recoverFirstName.trim() || !recoverLastName.trim() || !recoverEmail.trim()) {
      setErrorMessage('UserID, First name, last name, and email are required.')
      return
    }
    setLoading(true)
    setErrorMessage('')
    try {
      const res = await fetch('http://localhost:8080/api/auth/recover-account', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: recoverUserId.trim(),
          firstName: recoverFirstName.trim(),
          lastName: recoverLastName.trim(),
          email: recoverEmail.trim(),
          newPassword: ''
        })
      })
      if (res.ok) {
        setRecoveryStep(2)
      } else {
        const txt = await res.text()
        setErrorMessage(txt || 'No active account matches the details provided.')
      }
    } catch (err) {
      setErrorMessage('Failed to connect to recovery service.')
    } finally {
      setLoading(false)
    }
  }

  const handlePasswordResetSubmit = async (e) => {
    e.preventDefault()
    if (!recoverNewPassword.trim() || !recoverConfirmPassword.trim()) {
      setErrorMessage('Password fields are required.')
      return
    }
    if (recoverNewPassword !== recoverConfirmPassword) {
      setErrorMessage('Passwords do not match.')
      return
    }
    setLoading(true)
    setErrorMessage('')
    try {
      const res = await fetch('http://localhost:8080/api/auth/recover-account', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: recoverUserId.trim(),
          firstName: recoverFirstName.trim(),
          lastName: recoverLastName.trim(),
          email: recoverEmail.trim(),
          newPassword: recoverNewPassword.trim()
        })
      })
      if (res.ok) {
        setResetSuccessMsg(`Your password has been successfully reset! You can now log in with your UserID using your new password.`)
        setRecoveryStep(3)
      } else {
        const txt = await res.text()
        setErrorMessage(txt || 'Failed to reset password.')
      }
    } catch (err) {
      setErrorMessage('Failed to connect to reset service.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <section className="auth-page auth-page--signin">
      <span className="auth-orb auth-orb--one" />
      <span className="auth-orb auth-orb--two" />
      <span className="auth-orb auth-orb--three" />

      <LiquidGlass
        key={view}
        className={`auth-liquid ${view === 'login' ? 'auth-liquid--signin' : 'auth-liquid--recovery'}`}
        padding="0"
        cornerRadius={22}
        displacementScale={66}
        blurAmount={0.075}
        saturation={145}
        aberrationIntensity={2.5}
        elasticity={0}
        mode="standard"
        style={{ position: 'absolute', top: '50%', left: '50%' }}
      >
        {view === 'login' && (
          <form className="auth-card auth-card--signin" onSubmit={e => { e.preventDefault(); handleSignIn(); }}>
            <div className="auth-header brand-stack">
              <BrandLogo text="entral-ACMS" size="lg" />
            </div>

            <div className="field">
              <label htmlFor="userId">UserID</label>
              <input
                id="userId"
                type="text"
                placeholder="Enter your UserID"
                value={formData.userId}
                onChange={handleChange}
              />
            </div>

            <div className="field">
              <label htmlFor="password">Password</label>
              <input
                id="password"
                type="password"
                placeholder="Enter your password"
                value={formData.password}
                onChange={handleChange}
              />
            </div>

            <button type="submit" className="btn btn-primary">Sign In</button>

            {setupCompleted && (
              <div className="links links-split" style={{ display: 'flex', flexDirection: 'column', gap: '8px', alignItems: 'flex-start', width: '100%' }}>
                <div style={{ display: 'flex', width: '100%', justifyContent: 'space-between' }}>
                  <a className="link" href="#" onClick={(e) => { e.preventDefault(); setView('recover_userid'); setRecoveryStep(1); setRecoveredUserId(''); setErrorMessage(''); setResetSuccessMsg(''); setRecoverFirstName(''); setRecoverLastName(''); setRecoverEmail(''); }}>
                    Forgot UserID?
                  </a>
                  <a className="link" href="#" onClick={(e) => { e.preventDefault(); setView('recover_password'); setRecoveryStep(1); setRecoverUserId(''); setErrorMessage(''); setResetSuccessMsg(''); setRecoverFirstName(''); setRecoverLastName(''); setRecoverEmail(''); setRecoverNewPassword(''); setRecoverConfirmPassword(''); }}>
                    Forgot Password?
                  </a>
                </div>
                <Link className="link" to="/request-support?type=signup" style={{ marginTop: '4px' }}>Need an account? Request access</Link>
              </div>
            )}
          </form>
        )}

        {view === 'recover_userid' && (
          <div className="auth-card auth-card--signin">
            <div className="auth-header brand-stack">
              <h2>Recover UserID</h2>
              <p style={{ fontSize: '0.8rem', opacity: 0.7, textAlign: 'center', marginTop: '0.2rem' }}>
                {recoveryStep === 1 ? "Confirm your profile details to retrieve your UserID." : "UserID successfully recovered!"}
              </p>
            </div>

            {recoveryStep === 1 ? (
              <form onSubmit={handleRecoverUserID} style={{ display: 'grid', gap: '14px', width: '100%' }}>
                <div className="field">
                  <label htmlFor="recoverFirstName">First Name</label>
                  <input
                    id="recoverFirstName"
                    type="text"
                    placeholder="Enter your first name"
                    value={recoverFirstName}
                    onChange={(e) => setRecoverFirstName(e.target.value)}
                    required
                  />
                </div>

                <div className="field">
                  <label htmlFor="recoverLastName">Last Name</label>
                  <input
                    id="recoverLastName"
                    type="text"
                    placeholder="Enter your last name"
                    value={recoverLastName}
                    onChange={(e) => setRecoverLastName(e.target.value)}
                    required
                  />
                </div>

                <div className="field">
                  <label htmlFor="recoverEmail">Email Address</label>
                  <input
                    id="recoverEmail"
                    type="email"
                    placeholder="Enter your registered email"
                    value={recoverEmail}
                    onChange={(e) => setRecoverEmail(e.target.value)}
                    required
                  />
                </div>

                <button type="submit" className="btn btn-primary" disabled={loading}>
                  {loading ? 'Retrieving UserID...' : 'Retrieve UserID →'}
                </button>
              </form>
            ) : (
              <div style={{ display: 'grid', gap: '14px', width: '100%', textAlign: 'center' }}>
                <div style={{ background: 'rgba(79, 172, 254, 0.08)', border: '1px solid rgba(79, 172, 254, 0.2)', padding: '1.2rem', borderRadius: '10px', textAlign: 'center' }}>
                  <div style={{ fontSize: '0.72rem', color: 'rgba(255,255,255,0.5)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Your Username / UserID</div>
                  <div style={{ fontSize: '1.4rem', fontWeight: 'bold', color: '#4facfe', margin: '0.5rem 0', fontFamily: 'monospace', letterSpacing: '0.5px' }}>{recoveredUserId}</div>
                  <button 
                    type="button" 
                    onClick={() => {
                      navigator.clipboard.writeText(recoveredUserId);
                      alert('UserID copied to clipboard!');
                    }} 
                    style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)', color: '#fff', fontSize: '0.75rem', padding: '0.3rem 0.8rem', borderRadius: '6px', cursor: 'pointer' }}
                  >
                    📋 Copy UserID
                  </button>
                </div>
                <button type="button" className="btn btn-primary" onClick={() => { setView('login'); setFormData({ ...formData, userId: recoveredUserId }); }}>
                  Sign In Now
                </button>
              </div>
            )}

            <div className="links" style={{ display: 'flex', justifyContent: 'center', marginTop: '1rem' }}>
              <a className="link" href="#" onClick={(e) => { e.preventDefault(); setView('login'); setErrorMessage(''); }}>
                ← Back to Sign In
              </a>
            </div>
          </div>
        )}

        {view === 'recover_password' && (
          <div className="auth-card auth-card--signin">
            <div className="auth-header brand-stack">
              <h2>Reset Password</h2>
              <div className="wizard-steps-indicator" style={{ display: 'flex', gap: '8px', margin: '0.8rem 0' }}>
                <span style={{
                  padding: '4px 10px',
                  borderRadius: '20px',
                  fontSize: '0.72rem',
                  fontWeight: 'bold',
                  background: recoveryStep >= 1 ? 'rgba(79, 172, 254, 0.2)' : 'rgba(255,255,255,0.05)',
                  color: recoveryStep >= 1 ? '#4facfe' : 'rgba(255,255,255,0.4)',
                  border: '1px solid ' + (recoveryStep >= 1 ? '#4facfe' : 'rgba(255,255,255,0.1)')
                }}>
                  1. Verify
                </span>
                <span style={{
                  padding: '4px 10px',
                  borderRadius: '20px',
                  fontSize: '0.72rem',
                  fontWeight: 'bold',
                  background: recoveryStep >= 2 ? 'rgba(255, 203, 66, 0.2)' : 'rgba(255,255,255,0.05)',
                  color: recoveryStep >= 2 ? '#ffcb42' : 'rgba(255,255,255,0.4)',
                  border: '1px solid ' + (recoveryStep >= 2 ? '#ffcb42' : 'rgba(255,255,255,0.1)')
                }}>
                  2. Reset
                </span>
                <span style={{
                  padding: '4px 10px',
                  borderRadius: '20px',
                  fontSize: '0.72rem',
                  fontWeight: 'bold',
                  background: recoveryStep >= 3 ? 'rgba(16, 185, 129, 0.2)' : 'rgba(255,255,255,0.05)',
                  color: recoveryStep >= 3 ? '#10b981' : 'rgba(255,255,255,0.4)',
                  border: '1px solid ' + (recoveryStep >= 3 ? '#10b981' : 'rgba(255,255,255,0.1)')
                }}>
                  3. Success
                </span>
              </div>
              <p style={{ fontSize: '0.8rem', opacity: 0.7, textAlign: 'center', marginTop: '0.2rem' }}>
                {recoveryStep === 1 && "Confirm your account details to start password reset."}
                {recoveryStep === 2 && "Identity confirmed! Enter your new password below."}
                {recoveryStep === 3 && "Password has been successfully changed."}
              </p>
            </div>

            {recoveryStep === 1 && (
              <form onSubmit={handleVerifyPasswordResetIdentity} style={{ display: 'grid', gap: '14px', width: '100%' }}>
                <div className="field">
                  <label htmlFor="recoverUserId">UserID</label>
                  <input
                    id="recoverUserId"
                    type="text"
                    placeholder="Enter your UserID"
                    value={recoverUserId}
                    onChange={(e) => setRecoverUserId(e.target.value)}
                    required
                  />
                </div>

                <div className="field">
                  <label htmlFor="recoverFirstName">First Name</label>
                  <input
                    id="recoverFirstName"
                    type="text"
                    placeholder="Enter your first name"
                    value={recoverFirstName}
                    onChange={(e) => setRecoverFirstName(e.target.value)}
                    required
                  />
                </div>

                <div className="field">
                  <label htmlFor="recoverLastName">Last Name</label>
                  <input
                    id="recoverLastName"
                    type="text"
                    placeholder="Enter your last name"
                    value={recoverLastName}
                    onChange={(e) => setRecoverLastName(e.target.value)}
                    required
                  />
                </div>

                <div className="field">
                  <label htmlFor="recoverEmail">Email Address</label>
                  <input
                    id="recoverEmail"
                    type="email"
                    placeholder="Enter your registered email"
                    value={recoverEmail}
                    onChange={(e) => setRecoverEmail(e.target.value)}
                    required
                  />
                </div>

                <button type="submit" className="btn btn-primary" disabled={loading}>
                  {loading ? 'Verifying Details...' : 'Verify Details →'}
                </button>
              </form>
            )}

            {recoveryStep === 2 && (
              <form onSubmit={handlePasswordResetSubmit} style={{ display: 'grid', gap: '14px', width: '100%' }}>
                <div className="field">
                  <label htmlFor="recoverNewPassword">New Password</label>
                  <input
                    id="recoverNewPassword"
                    type="password"
                    placeholder="Enter new password"
                    value={recoverNewPassword}
                    onChange={(e) => setRecoverNewPassword(e.target.value)}
                    required
                  />
                </div>

                <div className="field">
                  <label htmlFor="recoverConfirmPassword">Confirm New Password</label>
                  <input
                    id="recoverConfirmPassword"
                    type="password"
                    placeholder="Confirm new password"
                    value={recoverConfirmPassword}
                    onChange={(e) => setRecoverConfirmPassword(e.target.value)}
                    required
                  />
                </div>

                <button type="submit" className="btn btn-primary" disabled={loading}>
                  {loading ? 'Updating Password...' : 'Reset Password →'}
                </button>
              </form>
            )}

            {recoveryStep === 3 && (
              <div style={{ display: 'grid', gap: '14px', width: '100%', textAlign: 'center', placeItems: 'center' }}>
                <div style={{ fontSize: '3rem', color: '#10b981' }}>✓</div>
                <div style={{ color: '#a8ffca', fontSize: '0.82rem', background: 'rgba(16,185,129,0.06)', border: '1px solid rgba(16,185,129,0.15)', padding: '0.8rem', borderRadius: '6px', lineHeight: 1.4, textAlign: 'center', width: '100%' }}>
                  {resetSuccessMsg}
                </div>
                <button type="button" className="btn btn-primary" onClick={() => { setView('login'); setFormData({ userId: recoverUserId, password: recoverNewPassword }); }}>
                  Sign In Now
                </button>
              </div>
            )}

            <div className="links" style={{ display: 'flex', justifyContent: 'center', marginTop: '1rem' }}>
              <a className="link" href="#" onClick={(e) => { e.preventDefault(); setView('login'); setErrorMessage(''); }}>
                ← Back to Sign In
              </a>
            </div>
          </div>
        )}
      </LiquidGlass>

      <StandardModal
        isOpen={Boolean(errorMessage)}
        title="Account Recovery"
        message={errorMessage}
        onClose={() => setErrorMessage('')}
      />
    </section>
  )
}

export default SignInPage
