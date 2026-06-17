import { useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import './onboarding-setup.css';

function OnboardingSetupModal() {
  const { user, login } = useAuth();
  
  // Conditionally trigger onboarding if the user is the default admin setup account
  const isDefaultAdmin = user && user.userId === 'admin' && user.email === 'admin@xentralacms.local';
  
  const [formData, setFormData] = useState({
    userId: 'admin',
    firstName: 'System',
    lastName: 'Admin',
    email: 'admin@xentralacms.local',
    mobileNo: '00000000000',
    password: '',
    confirmPassword: ''
  });
  
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  if (!isDefaultAdmin) return null;

  const handleChange = (e) => {
    const { id, value } = e.target;
    setFormData((prev) => ({ ...prev, [id]: value }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    // Validations
    if (!formData.userId.trim() || formData.userId === 'admin') {
      setError('Please choose a custom, secure UserID.');
      return;
    }
    if (!formData.firstName.trim() || !formData.lastName.trim()) {
      setError('Please enter your first and last name.');
      return;
    }
    if (!formData.email.trim() || formData.email === 'admin@xentralacms.local') {
      setError('Please enter your actual corporate email address.');
      return;
    }
    if (!formData.mobileNo.trim() || formData.mobileNo === '00000000000') {
      setError('Please enter a valid mobile number.');
      return;
    }
    if (!formData.password || formData.password === 'admin') {
      setError('Please set a strong password. You cannot keep "admin".');
      return;
    }
    if (formData.password !== formData.confirmPassword) {
      setError('Passwords do not match.');
      return;
    }

    setLoading(true);
    try {
      const payload = {
        id: user.id,
        userRoleId: user.userRoleId,
        userId: formData.userId.trim(),
        firstName: formData.firstName.trim(),
        lastName: formData.lastName.trim(),
        email: formData.email.trim(),
        mobileNo: formData.mobileNo.trim(),
        loginPassword: formData.password,
        isActive: true
      };

      const res = await fetch(`http://localhost:8080/api/users/${user.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (res.ok) {
        const updatedUser = await res.json();
        // Update the AuthContext with the new user details, keeping their roleName
        login({ ...updatedUser, roleName: user.roleName });
      } else {
        const errorText = await res.text();
        setError(errorText || 'Failed to update credentials.');
      }
    } catch (err) {
      setError('Failed to connect to server.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="onboarding-backdrop">
      <div className="onboarding-card">
        <div className="onboarding-header">
          <h2>Secure Your Super Admin Profile</h2>
          <p>This is your first login. For security, please customize your UserID, email, and set a strong password before continuing.</p>
        </div>

        {error && (
          <div className="onboarding-error-banner">
            <span>⚠</span>
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="onboarding-form">
          <div className="onboarding-field">
            <label htmlFor="userId">Custom UserID (Login ID)</label>
            <input
              id="userId"
              type="text"
              value={formData.userId}
              onChange={handleChange}
              placeholder="e.g. jsmith"
              required
            />
          </div>

          <div className="onboarding-field">
            <label htmlFor="email">Work Email</label>
            <input
              id="email"
              type="email"
              value={formData.email}
              onChange={handleChange}
              placeholder="e.g. j.smith@company.com"
              required
            />
          </div>

          <div className="onboarding-field">
            <label htmlFor="firstName">First Name</label>
            <input
              id="firstName"
              type="text"
              value={formData.firstName}
              onChange={handleChange}
              required
            />
          </div>

          <div className="onboarding-field">
            <label htmlFor="lastName">Last Name</label>
            <input
              id="lastName"
              type="text"
              value={formData.lastName}
              onChange={handleChange}
              required
            />
          </div>

          <div className="onboarding-field span-2">
            <label htmlFor="mobileNo">Mobile Number</label>
            <input
              id="mobileNo"
              type="text"
              value={formData.mobileNo}
              onChange={handleChange}
              placeholder="e.g. 09123456789"
              required
            />
          </div>

          <div className="onboarding-field">
            <label htmlFor="password">New Password</label>
            <input
              id="password"
              type="password"
              value={formData.password}
              onChange={handleChange}
              placeholder="Choose a strong password"
              required
            />
          </div>

          <div className="onboarding-field">
            <label htmlFor="confirmPassword">Confirm Password</label>
            <input
              id="confirmPassword"
              type="password"
              value={formData.confirmPassword}
              onChange={handleChange}
              placeholder="Retype password"
              required
            />
          </div>

          <button 
            type="submit" 
            className="onboarding-submit-btn span-2"
            disabled={loading}
          >
            {loading ? 'Securing Account...' : 'Complete Setup & Secure Account'}
          </button>
        </form>
      </div>
    </div>
  );
}

export default OnboardingSetupModal;
