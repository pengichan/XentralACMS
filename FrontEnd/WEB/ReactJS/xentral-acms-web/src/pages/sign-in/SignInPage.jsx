import { useState, useEffect } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import LiquidGlass from 'liquid-glass-react'
import { useAuth } from '../../context/AuthContext'
import BrandLogo from '../../components/brand-logo/BrandLogo'
import StandardModal from '../../components/standard-modal/StandardModal'
import './SignInPage.css'

function SignInPage() {
  const [view, setView] = useState('login') // 'login', 'forgot-request', 'forgot-verify'
  const [formData, setFormData] = useState({
    userId: '',
    password: ''
  })
  
  // Forgot Password / Self-Service Reset states
  const [resetEmail, setResetEmail] = useState('')
  const [resetCode, setResetCode] = useState('')
  const [resetNewPassword, setResetNewPassword] = useState('')
  const [resetConfirmPassword, setResetConfirmPassword] = useState('')
  const [successMessage, setSuccessMessage] = useState('')
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
        // Fetch the role name from user_roles
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

  const handleRequestResetCode = async (e) => {
    e.preventDefault()
    if (!resetEmail.trim()) {
      setErrorMessage('Please enter your email address.')
      return
    }
    setLoading(true)
    setErrorMessage('')
    setSuccessMessage('')
    try {
      const res = await fetch('http://localhost:8080/api/auth/forgot-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: resetEmail.trim() })
      })
      if (res.ok) {
        setSuccessMessage('A 6-digit verification code has been dispatched. Check your inbox (or backend log).')
        setView('forgot-verify')
      } else {
        const txt = await res.text()
        setErrorMessage(txt || 'No active account matches this email.')
      }
    } catch (err) {
      setErrorMessage('Failed to request recovery code.')
    } finally {
      setLoading(false)
    }
  }

  const handleVerifyAndResetPassword = async (e) => {
    e.preventDefault()
    if (!resetCode.trim() || !resetNewPassword.trim() || !resetConfirmPassword.trim()) {
      setErrorMessage('Please fill out all fields.')
      return
    }
    if (resetNewPassword !== resetConfirmPassword) {
      setErrorMessage('Passwords do not match.')
      return
    }
    setLoading(true)
    setErrorMessage('')
    setSuccessMessage('')
    try {
      const res = await fetch('http://localhost:8080/api/auth/reset-password-verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: resetEmail.trim(),
          code: resetCode.trim(),
          newPassword: resetNewPassword.trim()
        })
      })
      if (res.ok) {
        alert('Password successfully reset! You can now log in.')
        setResetEmail('')
        setResetCode('')
        setResetNewPassword('')
        setResetConfirmPassword('')
        setView('login')
      } else {
        const txt = await res.text()
        setErrorMessage(txt || 'Invalid or expired verification code.')
      }
    } catch (err) {
      setErrorMessage('Failed to reset password.')
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
                <a className="link" href="#" onClick={(e) => { e.preventDefault(); setView('forgot-request'); setErrorMessage(''); setSuccessMessage(''); }}>
                  Forgot password?
                </a>
                <Link className="link" to="/request-support?type=signup">Need an account? Request access</Link>
              </div>
            )}
          </form>
        )}

        {view === 'forgot-request' && (
          <form className="auth-card auth-card--signin" onSubmit={handleRequestResetCode}>
            <div className="auth-header brand-stack">
              <h2>Password Recovery</h2>
              <p style={{ fontSize: '0.8rem', opacity: 0.7, textAlign: 'center', marginTop: '0.2rem' }}>
                Enter your email address to receive a secure recovery code.
              </p>
            </div>

            <div className="field">
              <label htmlFor="resetEmail">Email Address</label>
              <input
                id="resetEmail"
                type="email"
                placeholder="Enter your registered email"
                value={resetEmail}
                onChange={(e) => setResetEmail(e.target.value)}
                required
              />
            </div>

            <button type="submit" className="btn btn-primary" disabled={loading}>
              {loading ? 'Sending Code...' : 'Send Verification Code'}
            </button>

            <div className="links links-column" style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', alignItems: 'center', marginTop: '1rem' }}>
              <a className="link" href="#" onClick={(e) => { e.preventDefault(); setView('login'); setErrorMessage(''); setSuccessMessage(''); }}>
                ← Back to Sign In
              </a>
              <Link className="link" to="/request-support?type=reset" style={{ fontSize: '0.8rem', opacity: 0.6 }}>
                Need administrator assistance?
              </Link>
            </div>
          </form>
        )}

        {view === 'forgot-verify' && (
          <form className="auth-card auth-card--signin" onSubmit={handleVerifyAndResetPassword}>
            <div className="auth-header brand-stack">
              <h2>Reset Password</h2>
              <p style={{ fontSize: '0.8rem', opacity: 0.7, textAlign: 'center', marginTop: '0.2rem' }}>
                Verify your identity and specify your new account password.
              </p>
            </div>

            {successMessage && (
              <div style={{ color: '#a8ffca', fontSize: '0.8rem', background: 'rgba(0,255,0,0.06)', padding: '0.5rem', borderRadius: '4px', textAlign: 'center', marginBottom: '0.5rem' }}>
                ✓ {successMessage}
              </div>
            )}

            <div className="field">
              <label htmlFor="resetCode">6-Digit Verification Code</label>
              <input
                id="resetCode"
                type="text"
                maxLength="6"
                placeholder="Enter 6-digit code"
                value={resetCode}
                onChange={(e) => setResetCode(e.target.value)}
                required
              />
            </div>

            <div className="field">
              <label htmlFor="resetNewPassword">New Password</label>
              <input
                id="resetNewPassword"
                type="password"
                placeholder="Enter new password"
                value={resetNewPassword}
                onChange={(e) => setResetNewPassword(e.target.value)}
                required
              />
            </div>

            <div className="field">
              <label htmlFor="resetConfirmPassword">Confirm New Password</label>
              <input
                id="resetConfirmPassword"
                type="password"
                placeholder="Confirm new password"
                value={resetConfirmPassword}
                onChange={(e) => setResetConfirmPassword(e.target.value)}
                required
              />
            </div>

            <button type="submit" className="btn btn-primary" disabled={loading}>
              {loading ? 'Resetting Password...' : 'Reset Password'}
            </button>

            <div className="links links-column" style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', alignItems: 'center', marginTop: '1rem' }}>
              <a className="link" href="#" onClick={(e) => { e.preventDefault(); setView('login'); setErrorMessage(''); setSuccessMessage(''); }}>
                ← Back to Sign In
              </a>
              <a className="link" href="#" onClick={handleRequestResetCode} style={{ fontSize: '0.8rem', opacity: 0.6 }}>
                Resend Code
              </a>
            </div>
          </form>
        )}
      </LiquidGlass>

      <StandardModal
        isOpen={Boolean(errorMessage)}
        title="Sign In Error"
        message={errorMessage}
        onClose={() => setErrorMessage('')}
      />
    </section>
  )
}

export default SignInPage
