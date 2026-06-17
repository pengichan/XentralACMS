import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useNavigate } from 'react-router-dom';

function ForceChangePasswordModal() {
  const { user, updateUser, logout } = useAuth();
  const navigate = useNavigate();

  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  // Modal only triggers if user is authenticated and marked as mustChangePassword
  if (!user || !user.mustChangePassword) return null;

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    if (password.length < 8) {
      setError('Password must be at least 8 characters long.');
      return;
    }

    if (password !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }

    setLoading(true);
    try {
      // Build update payload based on current user session values
      const payload = {
        id: user.id,
        userRoleId: user.userRoleId,
        userId: user.userId,
        firstName: user.firstName,
        lastName: user.lastName,
        email: user.email,
        mobileNo: user.mobileNo,
        loginPassword: password,
        mustChangePassword: false,
        isActive: true
      };

      const res = await fetch(`http://localhost:8080/api/users/${user.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (res.ok) {
        // Update local session state to clear the flag
        updateUser({ mustChangePassword: false });
        navigate('/dashboard');
      } else {
        const errText = await res.text();
        setError(errText || 'Failed to update password.');
      }
    } catch (err) {
      setError('Failed to connect to server.');
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = () => {
    logout();
    navigate('/sign-in');
  };

  return (
    <div style={{
      position: 'fixed',
      inset: 0,
      background: 'rgba(5, 8, 20, 0.95)',
      backdropFilter: 'blur(10px)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 100000
    }}>
      <div style={{
        background: 'rgba(15, 23, 42, 0.98)',
        border: '1px solid rgba(255, 255, 255, 0.12)',
        borderRadius: '16px',
        padding: '2.5rem',
        width: '420px',
        maxWidth: '90vw',
        boxShadow: '0 20px 50px rgba(0, 0, 0, 0.6)',
        display: 'flex',
        flexDirection: 'column',
        gap: '1.5rem',
        animation: 'forceFadeIn 0.25s ease-out'
      }}>
        <div style={{ textAlign: 'center' }}>
          <h2 style={{ margin: '0 0 0.5rem', color: '#fff', fontSize: '1.5rem' }}>🔒 Password Reset Required</h2>
          <p style={{ margin: 0, color: 'rgba(255, 255, 255, 0.6)', fontSize: '0.88rem', lineHeight: '1.4' }}>
            For security reasons, your administrator requires you to set a new password before accessing your account.
          </p>
        </div>

        {error && (
          <div style={{
            padding: '0.75rem 1rem',
            background: 'rgba(239, 68, 68, 0.1)',
            border: '1px solid rgba(239, 68, 68, 0.3)',
            borderRadius: '8px',
            color: '#f87171',
            fontSize: '0.85rem'
          }}>
            ⚠ {error}
          </div>
        )}

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
            <label style={{ fontSize: '0.78rem', color: 'rgba(255,255,255,0.55)', fontWeight: 600 }}>New Password</label>
            <input
              type="password"
              placeholder="Min 8 characters"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              className="pam-input"
              autoFocus
            />
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
            <label style={{ fontSize: '0.78rem', color: 'rgba(255,255,255,0.55)', fontWeight: 600 }}>Confirm New Password</label>
            <input
              type="password"
              placeholder="Confirm new password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              required
              className="pam-input"
            />
          </div>

          <button 
            type="submit" 
            className="pam-button" 
            disabled={loading}
            style={{ width: '100%', marginTop: '0.5rem' }}
          >
            {loading ? 'Updating Password...' : 'Save & Continue'}
          </button>
        </form>

        <div style={{ display: 'flex', justifyContent: 'center' }}>
          <button 
            onClick={handleLogout}
            style={{
              background: 'none',
              border: 'none',
              color: 'rgba(255, 255, 255, 0.4)',
              fontSize: '0.8rem',
              cursor: 'pointer',
              textDecoration: 'underline',
              padding: '4px 8px'
            }}
          >
            Cancel & Log Out
          </button>
        </div>
      </div>
    </div>
  );
}

export default ForceChangePasswordModal;
