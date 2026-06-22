import { useState, useEffect } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import LiquidGlass from 'liquid-glass-react'
import { useAuth } from '../../context/AuthContext'
import BrandLogo from '../../components/brand-logo/BrandLogo'
import StandardModal from '../../components/standard-modal/StandardModal'
import './SignInPage.css'

function SignInPage() {
  const [view, setView] = useState('login') // 'login', 'recover'
  const [formData, setFormData] = useState({
    userId: '',
    password: ''
  })
  
  // Account Recovery states (No-Email passwordless check)
  const [recoverFirstName, setRecoverFirstName] = useState('')
  const [recoverLastName, setRecoverLastName] = useState('')
  const [recoverEmail, setRecoverEmail] = useState('')
  const [recoverNewPassword, setRecoverNewPassword] = useState('')
  const [recoverConfirmPassword, setRecoverConfirmPassword] = useState('')
  const [resetSuccessMsg, setResetSuccessMsg] = useState('')
  const [loading, setLoading] = useState(false)

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

  const handleRecoverAccount = async (e) => {
    e.preventDefault()
    if (!recoverFirstName.trim() || !recoverLastName.trim() || !recoverEmail.trim()) {
      setErrorMessage('First name, last name, and email are required.')
      return
    }
    if (recoverNewPassword && recoverNewPassword !== recoverConfirmPassword) {
      setErrorMessage('Passwords do not match.')
      return
    }
    setLoading(true)
    setErrorMessage('')
    setResetSuccessMsg('')
    try {
      const res = await fetch('http://localhost:8080/api/auth/recover-account', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          firstName: recoverFirstName.trim(),
          lastName: recoverLastName.trim(),
          email: recoverEmail.trim(),
          newPassword: recoverNewPassword.trim()
        })
      })
      if (res.ok) {
        const data = await res.json()
        if (data.passwordReset) {
          setResetSuccessMsg(`Recovery successful! Your Username/UserID is "${data.userId}" and your password has been updated.`)
        } else {
          setResetSuccessMsg(`Recovery successful! Your Username/UserID is "${data.userId}".`)
        }
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

  return (
    <section className="auth-page auth-page--signin">
      <span className="auth-orb auth-orb--one" />
      <span className="auth-orb auth-orb--two" />
      <span className="auth-orb auth-orb--three" />

      <LiquidGlass
        className="auth-liquid auth-liquid--signin"
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
              <div className="links links-split">
                <a className="link" href="#" onClick={(e) => { e.preventDefault(); setView('recover'); setErrorMessage(''); setResetSuccessMsg(''); setRecoverFirstName(''); setRecoverLastName(''); setRecoverEmail(''); setRecoverNewPassword(''); setRecoverConfirmPassword(''); }}>
                  Forgot Username/Password?
                </a>
                <Link className="link" to="/request-support?type=signup">Need an account? Request access</Link>
              </div>
            )}
          </form>
        )}

        {view === 'recover' && (
          <form className="auth-card auth-card--signin" onSubmit={handleRecoverAccount} style={{ maxWidth: '400px', width: '90vw' }}>
            <div className="auth-header brand-stack">
              <h2>Account Recovery</h2>
              <p style={{ fontSize: '0.8rem', opacity: 0.7, textAlign: 'center', marginTop: '0.2rem' }}>
                Verify your profile details to recover your UserID or reset your password.
              </p>
            </div>

            {resetSuccessMsg && (
              <div style={{ color: '#a8ffca', fontSize: '0.82rem', background: 'rgba(0,255,0,0.06)', border: '1px solid rgba(0,255,0,0.15)', padding: '0.8rem', borderRadius: '6px', textAlign: 'center', marginBottom: '1rem', lineHeight: 1.4 }}>
                ✓ {resetSuccessMsg}
              </div>
            )}

            <div className="field">
              <label htmlFor="recoverFirstName">First Name</label>
              <input
                id="recoverFirstName"
                type="text"
                placeholder="Enter your first name"
                value={recoverFirstName}
                onChange={(e) => setRecoverFirstName(e.target.value)}
                required
                disabled={Boolean(resetSuccessMsg)}
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
                disabled={Boolean(resetSuccessMsg)}
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
                disabled={Boolean(resetSuccessMsg)}
              />
            </div>

            {!resetSuccessMsg && (
              <>
                <div style={{ margin: '1rem 0 0.5rem 0', height: '1px', background: 'rgba(255,255,255,0.08)' }} />
                <p style={{ fontSize: '0.75rem', color: '#ffcb42', opacity: 0.8, marginBottom: '0.5rem' }}>
                  🔒 Optional: Enter a new password to reset it.
                </p>

                <div className="field">
                  <label htmlFor="recoverNewPassword">New Password (Optional)</label>
                  <input
                    id="recoverNewPassword"
                    type="password"
                    placeholder="Enter new password"
                    value={recoverNewPassword}
                    onChange={(e) => setRecoverNewPassword(e.target.value)}
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
                  />
                </div>
              </>
            )}

            {!resetSuccessMsg ? (
              <button type="submit" className="btn btn-primary" disabled={loading}>
                {loading ? 'Verifying Details...' : 'Recover Account'}
              </button>
            ) : (
              <button type="button" className="btn btn-primary" onClick={() => setView('login')}>
                Go to Sign In
              </button>
            )}

            <div className="links" style={{ display: 'flex', justifyContent: 'center', marginTop: '1rem' }}>
              <a className="link" href="#" onClick={(e) => { e.preventDefault(); setView('login'); setErrorMessage(''); setResetSuccessMsg(''); }}>
                ← Back to Sign In
              </a>
            </div>
          </form>
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
