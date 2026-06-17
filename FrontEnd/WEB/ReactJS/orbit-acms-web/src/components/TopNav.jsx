import React from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';

export default function TopNav() {
  const location = useLocation();
  const navigate = useNavigate();

  const navLinks = [
    { name: 'Servers', path: '/pam/servers' },
    { name: 'Vault', path: '/pam/credentials' },
    { name: 'Ticketing', path: '/pam/tickets' }
  ];

  const handleLogout = () => {
    // Basic logout simulation for prototype
    navigate('/sign-in');
  };

  // Hide nav on auth pages
  if (location.pathname === '/sign-in' || location.pathname === '/sign-up') {
    return null;
  }

  return (
    <nav style={{
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      padding: '1rem 2rem',
      background: 'rgba(15, 23, 42, 0.8)',
      backdropFilter: 'blur(10px)',
      borderBottom: '1px solid rgba(255,255,255,0.1)',
      position: 'sticky',
      top: 0,
      zIndex: 1000
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '2rem' }}>
        <h2 style={{ margin: 0, color: 'var(--auth-btn-start, #ffcb42)', fontWeight: 'bold' }}>
          Orbit ACMS
        </h2>
        <div style={{ display: 'flex', gap: '1.5rem' }}>
          {navLinks.map((link) => (
            <Link 
              key={link.path}
              to={link.path}
              style={{
                textDecoration: 'none',
                color: location.pathname === link.path ? '#fff' : 'rgba(255,255,255,0.6)',
                fontWeight: location.pathname === link.path ? 'bold' : 'normal',
                transition: 'color 0.2s ease'
              }}
            >
              {link.name}
            </Link>
          ))}
        </div>
      </div>
      
      <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
        <span style={{ color: 'rgba(255,255,255,0.8)', fontSize: '0.9rem' }}>
          Admin User
        </span>
        <button 
          onClick={handleLogout}
          style={{
            background: 'transparent',
            border: '1px solid rgba(255,255,255,0.3)',
            color: '#fff',
            padding: '0.5rem 1rem',
            borderRadius: '6px',
            cursor: 'pointer'
          }}
        >
          Logout
        </button>
      </div>
    </nav>
  );
}
