import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import LiquidGlass from 'liquid-glass-react'
import { useAuth } from '../../context/AuthContext'
import BrandLogo from '../../components/brand-logo/BrandLogo'
import StandardModal from '../../components/standard-modal/StandardModal'
import './SignInPage.css'

function SignInPage() {
  const [formData, setFormData] = useState({
    userId: '',
    password: ''
  })
  const [errorMessage, setErrorMessage] = useState('')
  const navigate = useNavigate()
  const { login } = useAuth()

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
        <form className="auth-card auth-card--signin">
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

          <button type="button" className="btn btn-primary" onClick={handleSignIn}>Sign In</button>

          <div className="links links-split">
            <Link className="link" to="/request-support?type=reset">Forgot password/UserID</Link>
            <Link className="link" to="/request-support?type=signup">Need an account? Request access</Link>
          </div>
        </form>
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
