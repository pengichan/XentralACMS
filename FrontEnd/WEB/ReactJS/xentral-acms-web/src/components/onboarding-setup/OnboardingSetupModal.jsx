import { useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import SearchableCountrySelect from '../SearchableCountrySelect';
import countriesData from '../CountryCodes.json';
import './onboarding-setup.css';

const COUNTRY_CONFIGS = {
  '+65': { name: 'Singapore', length: [8] },
  '+60': { name: 'Malaysia', length: [9, 10] },
  '+95': { name: 'Myanmar', length: [7, 8, 9] },
  '+62': { name: 'Indonesia', length: [9, 10, 11, 12] },
  '+84': { name: 'Vietnam', length: [9] },
  '+66': { name: 'Thailand', length: [9] },
  '+63': { name: 'Philippines', length: [10] }
};

function splitPhone(numberStr) {
  if (!numberStr) return { countryCode: '+65', phoneNumber: '' };
  // Sort dial codes by length descending to match longest prefix first
  const sortedCountries = [...countriesData].sort((a, b) => b.dial_code.length - a.dial_code.length);
  for (const c of sortedCountries) {
    const code = c.dial_code.replace(/\s+/g, '');
    if (numberStr.startsWith(code)) {
      return {
        countryCode: code,
        phoneNumber: numberStr.substring(code.length)
      };
    }
  }
  return {
    countryCode: '+65',
    phoneNumber: numberStr === '00000000000' ? '' : numberStr
  };
}

function OnboardingSetupModal() {
  const { user, login } = useAuth();
  
  // Conditionally trigger onboarding if the user is the default admin setup account
  const isDefaultAdmin = user && user.userId === 'admin' && user.email === 'admin@xentralacms.local';
  
  const [formData, setFormData] = useState({
    userId: 'admin',
    firstName: 'System',
    lastName: 'Admin',
    email: 'admin@xentralacms.local',
    password: '',
    confirmPassword: ''
  });

  const [countryCode, setCountryCode] = useState('+65');
  const [phoneNumber, setPhoneNumber] = useState('');
  
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
    
    const cleanedPhone = phoneNumber.replace(/\D/g, '');
    const config = COUNTRY_CONFIGS[countryCode];
    if (config) {
      if (!config.length.includes(cleanedPhone.length)) {
        setError(`Mobile number for ${config.name} must be ${config.length.join(' or ')} digits long.`);
        return;
      }
    } else {
      if (cleanedPhone.length < 6 || cleanedPhone.length > 15) {
        setError('Mobile number must be between 6 and 15 digits long.');
        return;
      }
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
        mobileNo: countryCode + cleanedPhone,
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
            <label>Mobile Number</label>
            <div style={{ display: 'flex', gap: '8px' }}>
              <SearchableCountrySelect
                value={countryCode}
                onChange={setCountryCode}
              />
              <input
                type="text"
                value={phoneNumber}
                onChange={(e) => setPhoneNumber(e.target.value.replace(/\D/g, ''))}
                placeholder={countryCode === '+65' ? '8 digits' : 'Enter mobile number'}
                style={{ flex: 1 }}
                required
              />
            </div>
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
