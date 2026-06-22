import React from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth, ROLES } from '../context/AuthContext';

export default function SidebarNav() {
  const location = useLocation();
  const navigate = useNavigate();
  const { user, isAdmin, isSuperAdmin, logout } = useAuth();

  const [pendingTickets, setPendingTickets] = React.useState(0);
  const [pendingRequests, setPendingRequests] = React.useState(0);

  React.useEffect(() => {
    if (!user?.id) return;
    const checkActiveStatus = async () => {
      try {
        const res = await fetch(`http://localhost:8080/api/users/${user.id}`);
        if (res.ok) {
          const data = await res.json();
          if (data && data.isActive === false) {
            logout();
            navigate('/sign-in');
            alert('Your account has been deactivated. You have been logged out.');
          }
        }
      } catch (e) {
        console.error('Failed to check user active status', e);
      }
    };

    checkActiveStatus();
    
    // Check every 10 seconds as well
    const timer = setInterval(checkActiveStatus, 10000);
    return () => clearInterval(timer);
  }, [location.pathname, user?.id, logout, navigate]);

  React.useEffect(() => {
    if (!user?.id || !isAdmin) return;
    const fetchCounts = async () => {
      try {
        const res = await fetch('http://localhost:8080/api/system/pending-counts');
        if (res.ok) {
          const data = await res.json();
          setPendingTickets(data.pendingTickets || 0);
          setPendingRequests(data.pendingRequests || 0);
        }
      } catch (e) {
        console.error('Failed to fetch pending counts', e);
      }
    };
    fetchCounts();
    const interval = setInterval(fetchCounts, 10000);
    return () => clearInterval(interval);
  }, [user?.id, isAdmin]);

  // Role-based navigation per design spec
  const adminLinks = [
    { name: 'Dashboard',       path: '/dashboard',        icon: '🏠' },
    { name: 'Server List',     path: '/pam/servers',      icon: '💻' },
    { name: 'Tickets',         path: '/pam/tickets',      icon: '🎫' },
    { name: 'Credential Vault',path: '/pam/credentials',  icon: '🔑' },
    { name: 'Audit Logs',      path: '/pam/audit-logs',   icon: '📜' },
    { name: 'Reports',         path: '/pam/reports',      icon: '📊' },
    { name: 'User Management', path: '/pam/users',        icon: '👥' },
    { name: 'Settings',        path: '/pam/settings',     icon: '⚙️' },
  ];

  const userLinks = [
    { name: 'Dashboard',       path: '/dashboard',           icon: '🏠' },
    { name: 'Server List',     path: '/pam/servers',         icon: '💻' },
    { name: 'Assigned Servers', path: '/pam/assigned-servers', icon: '🔑' },
    { name: 'My Requests',     path: '/pam/tickets',         icon: '🎫' },
    { name: 'My Access History', path: '/pam/access-history', icon: '📜' },
    { name: 'Settings',        path: '/pam/settings',        icon: '⚙️' },
  ];

  const navLinks = isAdmin ? adminLinks : userLinks;

  const handleLogout = () => {
    logout();
    navigate('/sign-in');
  };

  // Hide nav on auth pages and support request page
  const hiddenPaths = ['/sign-in', '/sign-up', '/', '/request-support'];
  if (hiddenPaths.includes(location.pathname)) {
    return null;
  }

  return (
    <aside style={{
      width: '240px',
      minHeight: '100dvh',
      background: 'rgba(10, 16, 35, 0.92)',
      backdropFilter: 'blur(16px)',
      borderRight: '1px solid rgba(255,255,255,0.08)',
      display: 'flex',
      flexDirection: 'column',
      position: 'sticky',
      top: 0,
      zIndex: 1000,
      flexShrink: 0,
    }}>
      {/* Brand */}
      <div style={{ padding: '1.8rem 1.5rem 1.2rem', borderBottom: '1px solid rgba(255,255,255,0.07)' }}>
        <h2 style={{ margin: 0, color: '#fff', fontWeight: 800, fontSize: '1.2rem', letterSpacing: '-0.5px' }}>
          <span style={{ color: '#ffcb42' }}>X</span>entral<span style={{ color: '#4facfe' }}>ACMS</span>
        </h2>
        <p style={{ margin: '0.3rem 0 0', color: 'rgba(255,255,255,0.4)', fontSize: '0.72rem', letterSpacing: '1px', textTransform: 'uppercase' }}>
          {isSuperAdmin ? 'Super Admin' : isAdmin ? 'Admin' : 'User'} Portal
        </p>
      </div>

      {/* Navigation */}
      <nav style={{ flex: 1, padding: '1rem 0.75rem', display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
        {navLinks.map((link) => {
          const active = location.pathname === link.path;
          let badgeCount = 0;
          if (isAdmin) {
            if (link.name === 'Tickets') {
              badgeCount = pendingTickets;
            } else if (link.name === 'User Management') {
              badgeCount = pendingRequests;
            }
          }

          return (
            <Link
              key={link.path}
              to={link.path}
              style={{
                textDecoration: 'none',
                color: active ? '#fff' : 'rgba(255,255,255,0.55)',
                fontWeight: active ? 600 : 400,
                background: active
                  ? 'linear-gradient(90deg, rgba(79,172,254,0.18), rgba(79,172,254,0.05))'
                  : 'transparent',
                borderLeft: active ? '3px solid #4facfe' : '3px solid transparent',
                padding: '0.65rem 0.9rem',
                borderRadius: '0 8px 8px 0',
                transition: 'all 0.18s ease',
                display: 'flex',
                alignItems: 'center',
                gap: '10px',
                fontSize: '0.88rem',
              }}
            >
              <span style={{ fontSize: '1rem', minWidth: '20px', textAlign: 'center' }}>{link.icon}</span>
              <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
                {link.name}
                {badgeCount > 0 && (
                  <span style={{
                    background: '#ef4444',
                    color: '#fff',
                    fontSize: '0.70rem',
                    fontWeight: 800,
                    padding: '1px 6px',
                    borderRadius: '999px',
                    minWidth: '16px',
                    textAlign: 'center',
                    lineHeight: '1.25rem',
                    boxShadow: '0 2px 5px rgba(239, 68, 68, 0.4)'
                  }}>
                    {badgeCount}
                  </span>
                )}
              </span>
            </Link>
          );
        })}
      </nav>

      {/* User footer */}
      <div style={{ padding: '1rem 1.2rem', borderTop: '1px solid rgba(255,255,255,0.07)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '0.75rem' }}>
          <div style={{
            width: '34px', height: '34px', borderRadius: '50%',
            background: 'linear-gradient(135deg, #ffcb42, #4facfe)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: '#000', fontWeight: 800, fontSize: '0.85rem', flexShrink: 0,
          }}>
            {(user?.firstName?.[0] || user?.userId?.[0] || 'U').toUpperCase()}
          </div>
          <div style={{ minWidth: 0 }}>
            <div style={{ color: '#fff', fontSize: '0.85rem', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {user?.firstName ? `${user.firstName} ${user.lastName}` : user?.userId || 'Guest'}
            </div>
            <div style={{ color: 'rgba(255,255,255,0.4)', fontSize: '0.7rem' }}>
              {user?.roleName || 'User'}
            </div>
          </div>
        </div>
        <button
          onClick={handleLogout}
          style={{
            background: 'rgba(255, 60, 60, 0.12)',
            border: '1px solid rgba(255, 60, 60, 0.3)',
            color: '#ffcaca',
            padding: '0.5rem 1rem',
            borderRadius: '6px',
            cursor: 'pointer',
            fontWeight: 600,
            width: '100%',
            fontSize: '0.82rem',
            transition: 'background 0.2s',
          }}
        >
          🚪 Sign Out
        </button>
      </div>
    </aside>
  );
}
