import React from 'react';
import { useAuth } from '../../context/AuthContext';

export default function Settings() {
  const { user } = useAuth();

  return (
    <div className="pam-container">
      <h1 style={{ textShadow: '0 2px 10px rgba(0,0,0,0.5)' }}>⚙️ System Settings</h1>
      <p style={{ opacity: 0.7, marginBottom: '2rem' }}>
        Manage platform parameters, configuration metadata, and security settings.
      </p>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '1.5rem' }}>
        
        {/* Security Policies */}
        <div className="pam-card" style={{ padding: '2rem' }}>
          <h3>🔐 Security & Compliance</h3>
          <div style={{ marginTop: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid rgba(255,255,255,0.06)', paddingBottom: '0.50rem' }}>
              <span style={{ opacity: 0.7 }}>Credential Encryption</span>
              <span style={{ color: '#a8ffca', fontWeight: 600 }}>AES-256 Enabled</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid rgba(255,255,255,0.06)', paddingBottom: '0.50rem' }}>
              <span style={{ opacity: 0.7 }}>Audit Logging</span>
              <span style={{ color: '#a8ffca', fontWeight: 600 }}>Active (Immutable)</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid rgba(255,255,255,0.06)', paddingBottom: '0.50rem' }}>
              <span style={{ opacity: 0.7 }}>Super Admin Protection</span>
              <span style={{ color: '#ffcb42', fontWeight: 600 }}>Hardened</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ opacity: 0.7 }}>RDP Session Tracking</span>
              <span style={{ color: '#4facfe', fontWeight: 600 }}>Active (SessionAudit)</span>
            </div>
          </div>
        </div>

        {/* System Metadata */}
        <div className="pam-card" style={{ padding: '2rem' }}>
          <h3>💻 Environment Info</h3>
          <div style={{ marginTop: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid rgba(255,255,255,0.06)', paddingBottom: '0.50rem' }}>
              <span style={{ opacity: 0.7 }}>Project Version</span>
              <span>v1.0.0 (Prototype)</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid rgba(255,255,255,0.06)', paddingBottom: '0.50rem' }}>
              <span style={{ opacity: 0.7 }}>Backend Gateway</span>
              <span>Go API Server (localhost:8080)</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid rgba(255,255,255,0.06)', paddingBottom: '0.50rem' }}>
              <span style={{ opacity: 0.7 }}>Database Engine</span>
              <span>MS SQL Server Express</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ opacity: 0.7 }}>Authorized Actor</span>
              <span style={{ fontFamily: 'monospace' }}>{user?.userId || 'unknown'}</span>
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}
