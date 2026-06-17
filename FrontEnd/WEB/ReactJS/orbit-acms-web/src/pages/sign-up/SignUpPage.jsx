import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import LiquidGlass from 'liquid-glass-react'
import BrandLogo from '../../components/brand-logo/BrandLogo'
import StandardLoading from '../../components/standard-loading/StandardLoading'
import StandardModal from '../../components/standard-modal/StandardModal'
import { apiService } from '../../service/api-service'
import '../sign-in/SignInPage.css'
import './SignUpPage.css'

function SignUpPage() {
  const navigate = useNavigate()
  const [formData, setFormData] = useState({
    userId: '',
    firstName: '',
    lastName: '',
    email: '',
    phoneNo: '',
    password: '',
    confirmPassword: ''
  })
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [modalState, setModalState] = useState({
    isOpen: false,
    title: '',
    message: '',
    navigateOnConfirm: false
  })

  const handleChange = (event) => {
    const { id, value } = event.target
    setFormData((previous) => ({ ...previous, [id]: value }))
  }

  const handleSubmit = async (event) => {
    event.preventDefault()
    setModalState((previous) => ({ ...previous, isOpen: false, message: '' }))

    if (formData.password !== formData.confirmPassword) {
      setModalState({
        isOpen: true,
        title: 'Sign Up Error',
        message: 'Password and Confirm Password must match.',
        navigateOnConfirm: false
      })
      return
    }

    try {
      setIsSubmitting(true)
      await apiService.post('/api/users', {
        userId: formData.userId.trim(),
        user_id: formData.userId.trim(),
        firstName: formData.firstName.trim(),
        lastName: formData.lastName.trim(),
        email: formData.email.trim(),
        mobileNo: formData.phoneNo.trim(),
        loginPassword: formData.password,
        isActive: true
      })
      setModalState({
        isOpen: true,
        title: 'Sign Up Success',
        message: 'Account created successfully.',
        navigateOnConfirm: true
      })
    } catch (error) {
      setModalState({
        isOpen: true,
        title: 'Sign Up Error',
        message: error.message || 'Failed to create account.',
        navigateOnConfirm: false
      })
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleModalClose = () => {
    setModalState({
      isOpen: false,
      title: '',
      message: '',
      navigateOnConfirm: false
    })
  }

  const handleModalConfirm = () => {
    const shouldNavigate = modalState.navigateOnConfirm
    handleModalClose()
    if (shouldNavigate) {
      navigate('/sign-in')
    }
  }

  return (
    <section className="auth-page auth-page--signup">
      <span className="auth-orb auth-orb--one" />
      <span className="auth-orb auth-orb--two" />
      <span className="auth-orb auth-orb--three" />

      <LiquidGlass
        className="auth-liquid auth-liquid--signup"
        padding="0"
        cornerRadius={22}
        displacementScale={50}
        blurAmount={0.075}
        saturation={145}
        aberrationIntensity={1.2}
        elasticity={0}
        mode="standard"
        style={{ position: 'absolute', top: '50%', left: '50%' }}
      >
        <form className="auth-card auth-card--signup" onSubmit={handleSubmit}>
          <div className="auth-header brand-stack">
            <BrandLogo text="entral-ACMS" size="lg" />
          </div>

          <div className="form-grid">
            <div className="field">
              <label htmlFor="userId">UserID</label>
              <input id="userId" type="text" placeholder="Enter your user ID" value={formData.userId} onChange={handleChange} disabled={isSubmitting} required />
            </div>
            <div className="field">
              <label htmlFor="firstName">First Name</label>
              <input id="firstName" type="text" placeholder="Enter your first name" value={formData.firstName} onChange={handleChange} disabled={isSubmitting} required />
            </div>
            <div className="field">
              <label htmlFor="lastName">Last Name</label>
              <input id="lastName" type="text" placeholder="Enter your last name" value={formData.lastName} onChange={handleChange} disabled={isSubmitting} required />
            </div>
            <div className="field">
              <label htmlFor="email">Email</label>
              <input id="email" type="email" placeholder="you@example.com" value={formData.email} onChange={handleChange} disabled={isSubmitting} required />
            </div>
            <div className="field">
              <label htmlFor="phoneNo">Phone Number</label>
              <input id="phoneNo" type="tel" placeholder="Enter your phone number" value={formData.phoneNo} onChange={handleChange} disabled={isSubmitting} required />
            </div>
            <div className="field">
              <label htmlFor="password">Password</label>
              <input id="password" type="password" placeholder="Create password" value={formData.password} onChange={handleChange} disabled={isSubmitting} required />
            </div>
            <div className="field">
              <label htmlFor="confirmPassword">Confirm Password</label>
              <input id="confirmPassword" type="password" placeholder="Confirm your password" value={formData.confirmPassword} onChange={handleChange} disabled={isSubmitting} required />
            </div>
          </div>

          {isSubmitting && <StandardLoading />}

          <button type="submit" className="btn btn-primary" disabled={isSubmitting}>
            {isSubmitting ? 'Creating...' : 'Sign Up'}
          </button>

          <div className="links links-centered">
            <span className="muted-text">Already have an account?</span>
            <Link className="link" to="/sign-in">Sign In</Link>
          </div>
        </form>
      </LiquidGlass>

      <StandardModal
        isOpen={modalState.isOpen}
        title={modalState.title}
        message={modalState.message}
        onConfirm={handleModalConfirm}
        onClose={handleModalClose}
      />
    </section>
  )
}

export default SignUpPage
