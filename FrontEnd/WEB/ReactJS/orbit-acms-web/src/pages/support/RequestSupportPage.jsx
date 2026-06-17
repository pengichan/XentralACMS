import { useState, useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import './RequestSupportPage.css';

function RequestSupportPage() {
  const location = useLocation();
  const [formData, setFormData] = useState({
    email: '',
    firstName: '',
    lastName: '',
    requestedUsername: '',
    requestType: 'Account Registration',
    message: ''
  });
  
  const [error, setError] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState(false);

  // Set initial request type based on query param
  useEffect(() => {
    const searchParams = new URLSearchParams(location.search);
    const typeParam = searchParams.get('type');
    if (typeParam === 'reset') {
      setFormData((prev) => ({ ...prev, requestType: 'Password/UserID Reset' }));
    } else {
      setFormData((prev) => ({ ...prev, requestType: 'Account Registration' }));
    }
  }, [location.search]);

  const handleChange = (e) => {
    const { id, value } = e.target;
    setFormData((prev) => ({ ...prev, [id]: value }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    if (!formData.email.trim() || !formData.firstName.trim() || !formData.lastName.trim()) {
      setError('Please fill out all required fields.');
      return;
    }

    if (formData.requestType === 'Account Registration' && !formData.requestedUsername.trim()) {
      setError('Please suggest a requested username.');
      return;
    }

    setLoading(true);
    try {
      const res = await fetch('http://localhost:8080/api/account-requests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData)
      });

      if (res.ok) {
        setSubmitted(true);
      } else {
        const errorText = await res.text();
        setError(errorText || 'Failed to submit request.');
      }
    } catch (err) {
      setError('Failed to connect to server.');
    } finally {
      setLoading(false);
    }
  };

  const isRegistration = formData.requestType === 'Account Registration';

  return (
    <section className="support-page">
      <div className="support-container">
        {!submitted ? (
          <form onSubmit={handleSubmit} className="support-card">
            <div className="support-header">
              <h2>Account Support Request</h2>
              <p>Submit a request to system administrators to manage your account.</p>
            </div>

            {error && (
              <div className="support-error-banner">
                {error}
              </div>
            )}

            <div className="support-row">
              <div className="support-field">
                <label htmlFor="firstName">First Name</label>
                <input
                  id="firstName"
                  type="text"
                  placeholder="First name"
                  value={formData.firstName}
                  onChange={handleChange}
                  required
                />
              </div>

              <div className="support-field">
                <label htmlFor="lastName">Last Name</label>
                <input
                  id="lastName"
                  type="text"
                  placeholder="Last name"
                  value={formData.lastName}
                  onChange={handleChange}
                  required
                />
              </div>
            </div>

            <div className="support-row">
              <div className="support-field">
                <label htmlFor="email">Contact Email Address</label>
                <input
                  id="email"
                  type="email"
                  placeholder="name@company.com"
                  value={formData.email}
                  onChange={handleChange}
                  required
                />
              </div>

              <div className="support-field">
                <label htmlFor="requestedUsername">
                  {isRegistration ? 'Requested Username' : 'Your UserID (if known)'}
                </label>
                <input
                  id="requestedUsername"
                  type="text"
                  placeholder={isRegistration ? 'e.g. jsmith' : 'e.g. jsmith (optional)'}
                  value={formData.requestedUsername}
                  onChange={handleChange}
                  required={isRegistration}
                />
              </div>
            </div>

            <div className="support-field">
              <label htmlFor="requestType">Support Category</label>
              <select
                id="requestType"
                value={formData.requestType}
                onChange={handleChange}
                required
              >
                <option value="Account Registration">Account Registration</option>
                <option value="Password/UserID Reset">Password/UserID Reset</option>
              </select>
            </div>

            <div className="support-field">
              <label htmlFor="message">Message / Details</label>
              <textarea
                id="message"
                placeholder="Specify your request details or why you need access..."
                value={formData.message}
                onChange={handleChange}
              />
            </div>

            <button type="submit" className="support-submit-btn" disabled={loading}>
              {loading ? 'Submitting Request...' : 'Submit Support Request'}
            </button>

            <div className="support-back-link">
              <Link to="/sign-in">Return to Sign In</Link>
            </div>
          </form>
        ) : (
          <div className="support-card support-success-card">
            <div className="support-success-icon">✓</div>
            <h3>Request Submitted Successfully!</h3>
            <p>
              Your support request has been logged in the system logs. 
              The system administrators have been notified. We will contact you at <strong>{formData.email}</strong> once your request is reviewed.
            </p>
            
            <Link to="/sign-in" className="btn btn-primary support-submit-btn" style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', textDecoration: 'none' }}>
              Return to Sign In
            </Link>
          </div>
        )}
      </div>
    </section>
  );
}

export default RequestSupportPage;
