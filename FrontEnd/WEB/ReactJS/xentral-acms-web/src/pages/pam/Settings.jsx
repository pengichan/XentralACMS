import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../../context/AuthContext';

const API = 'http://localhost:8080';

const MODAL_BACKDROP = {
  position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)',
  backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center',
  justifyContent: 'center', zIndex: 9999,
};
const MODAL_CARD = {
  background: 'rgba(10,16,35,0.98)', border: '1px solid rgba(255,255,255,0.12)',
  borderRadius: '16px', padding: '2rem', width: '480px', maxWidth: '95vw', maxHeight: '90vh', overflowY: 'auto',
};

export default function Settings() {
  const { user } = useAuth();

  // Active Tab
  const [activeTab, setActiveTab] = useState('smtp'); // 'smtp' or 'policies'

  // SMTP Profiles States
  const [profiles, setProfiles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [successMsg, setSuccessMsg] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  
  // System Policies States
  const [sysSettings, setSysSettings] = useState({
    inactivityTimeoutMinutes: 15,
    minPasswordLength: 8,
    forcePasswordReset: true,
    auditLogRetentionDays: 90
  });
  const [loadingSys, setLoadingSys] = useState(false);
  const [savingSys, setSavingSys] = useState(false);
  const [clearingLogs, setClearingLogs] = useState(false);
  const [showClearLogsConfirm, setShowClearLogsConfirm] = useState(false);
  const [policySuccess, setPolicySuccess] = useState('');
  const [policyError, setPolicyError] = useState('');

  // Edit Profile Form State (used for both Create and Update)
  const [showFormModal, setShowFormModal] = useState(false);
  const [currentProfile, setCurrentProfile] = useState(null); // null means creating
  const [form, setForm] = useState({
    profileName: '',
    enabled: false,
    host: '',
    port: '587',
    username: '',
    password: '',
    senderFrom: '',
    isActive: false
  });

  // Test Connection State
  const [recipient, setRecipient] = useState('');
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState('');
  const [testError, setTestError] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  const fetchProfiles = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API}/api/system/smtp`);
      if (res.ok) {
        setProfiles(await res.json() || []);
      }
    } catch (err) {
      console.error('Failed to load SMTP profiles', err);
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchSystemSettings = useCallback(async () => {
    setLoadingSys(true);
    setPolicyError('');
    try {
      const res = await fetch(`${API}/api/system/settings`);
      if (res.ok) {
        setSysSettings(await res.json());
      } else {
        setPolicyError('Failed to load global policies from server.');
      }
    } catch (err) {
      console.error('Failed to load system settings', err);
      setPolicyError('Connection error loading global policies.');
    } finally {
      setLoadingSys(false);
    }
  }, []);

  useEffect(() => {
    fetchProfiles();
    fetchSystemSettings();
  }, [fetchProfiles, fetchSystemSettings]);

  const handleSaveSystemSettings = async (e) => {
    e.preventDefault();
    setSavingSys(true);
    setPolicySuccess('');
    setPolicyError('');
    try {
      const res = await fetch(`${API}/api/system/settings`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(sysSettings)
      });
      if (res.ok) {
        setPolicySuccess('Global policies updated successfully!');
      } else {
        setPolicyError(await res.text() || 'Failed to update system settings.');
      }
    } catch (err) {
      setPolicyError('Failed to connect to server.');
    } finally {
      setSavingSys(false);
    }
  };

  const handleClearLogs = async () => {
    setClearingLogs(true);
    try {
      const actor = user?.userId || 'SuperAdmin';
      const res = await fetch(`${API}/api/audit-logs?actor=${encodeURIComponent(actor)}`, {
        method: 'DELETE',
      });
      if (res.ok) {
        setShowClearLogsConfirm(false);
        alert('All audit logs cleared successfully.');
      } else {
        alert('Failed to clear logs: ' + await res.text());
      }
    } catch (err) {
      alert('Error connecting to server to clear logs.');
    } finally {
      setClearingLogs(false);
    }
  };

  const openCreateModal = () => {
    setCurrentProfile(null);
    setForm({
      profileName: '',
      enabled: false,
      host: '',
      port: '587',
      username: '',
      password: '',
      senderFrom: '',
      isActive: false
    });
    setSuccessMsg('');
    setErrorMsg('');
    setShowFormModal(true);
  };

  const openEditModal = (profile) => {
    setCurrentProfile(profile);
    setForm({
      profileName: profile.profileName || '',
      enabled: profile.enabled || false,
      host: profile.host || '',
      port: profile.port || '587',
      username: profile.username || '',
      password: profile.password || '',
      senderFrom: profile.senderFrom || '',
      isActive: profile.isActive || false
    });
    setSuccessMsg('');
    setErrorMsg('');
    setShowFormModal(true);
  };

  const handleFormChange = (e) => {
    const { id, value, type, checked } = e.target;
    
    // Auto-detect SMTP settings from Username/Sender email domain
    let extraFields = {};
    if ((id === 'username' || id === 'senderFrom') && value.includes('@')) {
      const parts = value.split('@');
      if (parts.length > 1) {
        const domain = parts[1].toLowerCase().trim();
        let detectedHost = '';
        let detectedPort = '587';
        let detectedName = '';
        
        if (domain === 'gmail.com') {
          detectedHost = 'smtp.gmail.com';
          detectedName = 'Gmail';
        } else if (domain === 'outlook.com' || domain === 'hotmail.com' || domain === 'live.com' || domain === 'office365.com') {
          detectedHost = 'smtp.office365.com';
          detectedName = 'Outlook / Office 365';
        } else if (domain === 'yahoo.com' || domain === 'ymail.com') {
          detectedHost = 'smtp.mail.yahoo.com';
          detectedName = 'Yahoo Mail';
        }
        
        if (detectedHost) {
          if (!form.host) extraFields.host = detectedHost;
          if (!form.port || form.port === '587') extraFields.port = detectedPort;
          if (!form.profileName) extraFields.profileName = detectedName;
        }
      }
    }

    setForm(prev => ({
      ...prev,
      [id]: type === 'checkbox' ? checked : value,
      ...extraFields
    }));
  };

  const handleSave = async (e) => {
    e.preventDefault();
    setSaving(true);
    setSuccessMsg('');
    setErrorMsg('');
    
    const isEditing = currentProfile !== null;
    const url = isEditing 
      ? `${API}/api/system/smtp/${currentProfile.id}`
      : `${API}/api/system/smtp`;
    const method = isEditing ? 'PUT' : 'POST';

    try {
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form)
      });
      if (res.ok) {
        setShowFormModal(false);
        fetchProfiles();
      } else {
        setErrorMsg(await res.text() || 'Failed to save SMTP configuration');
      }
    } catch (err) {
      setErrorMsg('Failed to connect to server');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (profileId) => {
    if (!window.confirm('Are you sure you want to delete this SMTP profile?')) return;
    try {
      const res = await fetch(`${API}/api/system/smtp/${profileId}`, {
        method: 'DELETE'
      });
      if (res.ok) {
        fetchProfiles();
      } else {
        alert(await res.text() || 'Failed to delete SMTP profile');
      }
    } catch (err) {
      alert('Error connecting to server to delete profile');
    }
  };

  const handleActivate = async (profileId) => {
    try {
      const res = await fetch(`${API}/api/system/smtp/${profileId}/activate`, {
        method: 'POST'
      });
      if (res.ok) {
        fetchProfiles();
      } else {
        alert(await res.text() || 'Failed to activate profile');
      }
    } catch (err) {
      alert('Error connecting to server to activate profile');
    }
  };

  const handleTest = async () => {
    if (!recipient.trim()) {
      alert('Please specify a recipient email address.');
      return;
    }
    setTesting(true);
    setTestResult('');
    setTestError('');
    try {
      const res = await fetch(`${API}/api/system/smtp/test`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          recipient: recipient.trim(),
          ...form
        })
      });
      const data = await res.json();
      if (res.ok) {
        setTestResult(data.message || 'Test email sent successfully!');
      } else {
        setTestError(data.message || 'Connection failed.');
      }
    } catch (err) {
      setTestError('Failed to connect to server.');
    } finally {
      setTesting(false);
    }
  };

  const btnStyle = (color) => ({
    padding: '0.3rem 0.65rem', borderRadius: '6px', cursor: 'pointer',
    background: `${color}15`, border: `1px solid ${color}55`, color,
    fontSize: '0.75rem', fontWeight: 600, transition: 'background 0.15s',
    whiteSpace: 'nowrap',
  });

  return (
    <div className="pam-container">
      <h1 style={{ textShadow: '0 2px 10px rgba(0,0,0,0.5)' }}>⚙️ System Settings</h1>
      <p style={{ opacity: 0.7, marginBottom: '2rem' }}>
        Manage platform parameters, configuration metadata, and security settings.
      </p>

      {/* Modern Tabs */}
      <div style={{ display: 'flex', gap: '1rem', borderBottom: '1px solid rgba(255,255,255,0.08)', marginBottom: '2rem' }}>
        <button
          type="button"
          onClick={() => setActiveTab('smtp')}
          style={{
            background: 'none', border: 'none', color: activeTab === 'smtp' ? '#4facfe' : 'rgba(255,255,255,0.5)',
            borderBottom: activeTab === 'smtp' ? '3px solid #4facfe' : '3px solid transparent',
            padding: '0.75rem 1.2rem', cursor: 'pointer', fontWeight: 600, fontSize: '0.92rem', transition: 'all 0.15s'
          }}
        >
          📨 Email SMTP Profiles
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('policies')}
          style={{
            background: 'none', border: 'none', color: activeTab === 'policies' ? '#4facfe' : 'rgba(255,255,255,0.5)',
            borderBottom: activeTab === 'policies' ? '3px solid #4facfe' : '3px solid transparent',
            padding: '0.75rem 1.2rem', cursor: 'pointer', fontWeight: 600, fontSize: '0.92rem', transition: 'all 0.15s'
          }}
        >
          🛡️ Global System Policies
        </button>
      </div>

      {activeTab === 'smtp' ? (
        <div className="pam-card" style={{ padding: '2rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', flexWrap: 'wrap', gap: '1rem' }}>
            <div>
              <h3 style={{ margin: 0 }}>📧 Email Notifications (SMTP Configuration)</h3>
              <p style={{ opacity: 0.6, fontSize: '0.82rem', margin: '0.3rem 0 0' }}>
                Configure and manage multiple email profiles (Gmail, Outlook, custom SMTP) for system notifications.
              </p>
            </div>
            <button className="pam-button" onClick={openCreateModal}>
              ➕ Add SMTP Profile
            </button>
          </div>

          {loading ? (
            <p style={{ opacity: 0.5 }}>Loading email configuration...</p>
          ) : profiles.length === 0 ? (
            <p style={{ opacity: 0.5, padding: '1.5rem 0' }}>No SMTP configuration profiles found. Add one to enable email setups.</p>
          ) : (
            <div style={{ overflowX: 'auto', marginTop: '1.5rem' }}>
              <table className="pam-table">
                <thead>
                  <tr>
                    <th>Profile Name</th>
                    <th>Server Host</th>
                    <th>Username / Email</th>
                    <th>Port</th>
                    <th>Live Status</th>
                    <th>Active Profile</th>
                    <th style={{ textAlign: 'center' }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {profiles.map(p => (
                    <tr key={p.id}>
                      <td><strong style={{ color: '#fff' }}>{p.profileName}</strong></td>
                      <td style={{ fontFamily: 'monospace', fontSize: '0.85rem' }}>{p.host}</td>
                      <td style={{ opacity: 0.8, fontSize: '0.85rem' }}>{p.username}</td>
                      <td style={{ opacity: 0.7, fontSize: '0.85rem' }}>{p.port}</td>
                      <td>
                        <span style={{
                          padding: '0.2rem 0.65rem', borderRadius: '999px', fontSize: '0.72rem', fontWeight: 600,
                          background: p.enabled ? 'rgba(0,255,0,0.1)' : 'rgba(255,255,255,0.05)',
                          color: p.enabled ? '#a8ffca' : 'rgba(255,255,255,0.4)',
                          border: p.enabled ? '1px solid rgba(0,255,0,0.3)' : '1px solid rgba(255,255,255,0.15)'
                        }}>
                          {p.enabled ? '● Live' : '● Mock Mode'}
                        </span>
                      </td>
                      <td>
                        {p.isActive ? (
                          <span style={{
                            padding: '0.2rem 0.65rem', borderRadius: '999px', fontSize: '0.72rem', fontWeight: 600,
                            background: 'rgba(79,172,254,0.15)', color: '#4facfe', border: '1px solid rgba(79,172,254,0.4)'
                          }}>
                            ★ Active
                          </span>
                        ) : (
                          <button onClick={() => handleActivate(p.id)} style={btnStyle('#4facfe')}>
                            Activate
                          </button>
                        )}
                      </td>
                      <td>
                        <div style={{ display: 'flex', gap: '0.4rem', justifyContent: 'center' }}>
                          <button onClick={() => openEditModal(p)} style={btnStyle('#ffcb42')}>
                            ✏️ Edit
                          </button>
                          {!p.isActive && (
                            <button onClick={() => handleDelete(p.id)} style={btnStyle('#ff4c4c')}>
                              🗑 Delete
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
          
          {/* Active security policies & environment info */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '1.5rem' }}>
            <div className="pam-card" style={{ padding: '2rem' }}>
              <h3>🔐 Active Protections</h3>
              <div style={{ marginTop: '1.2rem', display: 'flex', flexDirection: 'column', gap: '0.9rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid rgba(255,255,255,0.06)', paddingBottom: '0.50rem' }}>
                  <span style={{ opacity: 0.7 }}>Credential Encryption</span>
                  <span style={{ color: '#a8ffca', fontWeight: 600 }}>AES-256 Enabled</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid rgba(255,255,255,0.06)', paddingBottom: '0.50rem' }}>
                  <span style={{ opacity: 0.7 }}>Audit Logging</span>
                  <span style={{ color: '#a8ffca', fontWeight: 600 }}>Active (Immutable)</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ opacity: 0.7 }}>RDP Session Tracking</span>
                  <span style={{ color: '#4facfe', fontWeight: 600 }}>Active (SessionAudit)</span>
                </div>
              </div>
            </div>

            <div className="pam-card" style={{ padding: '2rem' }}>
              <h3>💻 Environment Info</h3>
              <div style={{ marginTop: '1.2rem', display: 'flex', flexDirection: 'column', gap: '0.9rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid rgba(255,255,255,0.06)', paddingBottom: '0.50rem' }}>
                  <span style={{ opacity: 0.7 }}>Database Engine</span>
                  <span>MS SQL Server Express</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid rgba(255,255,255,0.06)', paddingBottom: '0.50rem' }}>
                  <span style={{ opacity: 0.7 }}>Backend Gateway</span>
                  <span>Go API Server (localhost:8080)</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ opacity: 0.7 }}>Authorized Actor</span>
                  <span style={{ fontFamily: 'monospace' }}>{user?.userId || 'unknown'}</span>
                </div>
              </div>
            </div>
          </div>

          {/* Settings Policy Form */}
          <div className="pam-card" style={{ padding: '2rem' }}>
            <h3>⚙️ Policy Configurations</h3>
            <p style={{ opacity: 0.6, fontSize: '0.82rem', margin: '0.3rem 0 1.5rem' }}>
              Manage access timeouts, security policies, and retention limits across Xentral ACMS.
            </p>

            {loadingSys ? (
              <p style={{ opacity: 0.5 }}>Loading system policies...</p>
            ) : (
              <form onSubmit={handleSaveSystemSettings} style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '1.5rem' }}>
                  
                  {/* Session Timeout */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                    <label style={{ fontSize: '0.85rem', fontWeight: 600 }}>⏱ Inactivity Session Timeout</label>
                    <p style={{ opacity: 0.5, fontSize: '0.78rem', margin: 0 }}>Automatically logs users out after continuous inactivity.</p>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginTop: '0.3rem' }}>
                      <input
                        type="number"
                        min="1"
                        max="1440"
                        className="pam-input"
                        value={sysSettings.inactivityTimeoutMinutes}
                        onChange={(e) => setSysSettings(prev => ({ ...prev, inactivityTimeoutMinutes: parseInt(e.target.value) || 15 }))}
                        required
                        style={{ width: '120px' }}
                      />
                      <span style={{ opacity: 0.8, fontSize: '0.85rem' }}>Minutes</span>
                    </div>
                  </div>

                  {/* Password Min Length */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                    <label style={{ fontSize: '0.85rem', fontWeight: 600 }}>🔐 Minimum Password Length</label>
                    <p style={{ opacity: 0.5, fontSize: '0.78rem', margin: 0 }}>Enforced limit for standard user password updates.</p>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginTop: '0.3rem' }}>
                      <input
                        type="number"
                        min="4"
                        max="128"
                        className="pam-input"
                        value={sysSettings.minPasswordLength}
                        onChange={(e) => setSysSettings(prev => ({ ...prev, minPasswordLength: parseInt(e.target.value) || 8 }))}
                        required
                        style={{ width: '120px' }}
                      />
                      <span style={{ opacity: 0.8, fontSize: '0.85rem' }}>Characters</span>
                    </div>
                  </div>

                  {/* Log Retention */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                    <label style={{ fontSize: '0.85rem', fontWeight: 600 }}>📜 Audit Log Retention Period</label>
                    <p style={{ opacity: 0.5, fontSize: '0.78rem', margin: 0 }}>Duration in days before audit log entries undergo pruning.</p>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginTop: '0.3rem' }}>
                      <input
                        type="number"
                        min="1"
                        max="3650"
                        className="pam-input"
                        value={sysSettings.auditLogRetentionDays}
                        onChange={(e) => setSysSettings(prev => ({ ...prev, auditLogRetentionDays: parseInt(e.target.value) || 90 }))}
                        required
                        style={{ width: '120px' }}
                      />
                      <span style={{ opacity: 0.8, fontSize: '0.85rem' }}>Days</span>
                    </div>
                  </div>

                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', background: 'rgba(255,255,255,0.02)', padding: '0.75rem', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.05)' }}>
                  <input
                    id="forcePasswordReset"
                    type="checkbox"
                    checked={sysSettings.forcePasswordReset}
                    onChange={(e) => setSysSettings(prev => ({ ...prev, forcePasswordReset: e.target.checked }))}
                    style={{ width: '18px', height: '18px', cursor: 'pointer' }}
                  />
                  <div>
                    <label htmlFor="forcePasswordReset" style={{ fontSize: '0.85rem', fontWeight: 600, cursor: 'pointer', display: 'block' }}>
                      Force First-Time Password Reset
                    </label>
                    <span style={{ opacity: 0.5, fontSize: '0.75rem' }}>Requires newly approved user accounts to immediately reset their password.</span>
                  </div>
                </div>

                {policySuccess && (
                  <div style={{ padding: '0.75rem 1rem', background: 'rgba(0,255,0,0.08)', border: '1px solid rgba(0,255,0,0.3)', borderRadius: '8px', color: '#a8ffca', fontSize: '0.85rem' }}>
                    ✓ {policySuccess}
                  </div>
                )}

                {policyError && (
                  <div style={{ padding: '0.75rem 1rem', background: 'rgba(255,60,60,0.1)', border: '1px solid rgba(255,60,60,0.3)', borderRadius: '8px', color: '#ffcaca', fontSize: '0.85rem' }}>
                    ⚠ {policyError}
                  </div>
                )}

                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '1rem', borderTop: '1px solid rgba(255,255,255,0.08)', paddingTop: '1.2rem', marginTop: '0.5rem' }}>
                  <button type="submit" disabled={savingSys} className="pam-button">
                    {savingSys ? 'Saving Policies...' : '💾 Save Global Policies'}
                  </button>
                </div>
              </form>
            )}
          </div>

          {/* Maintenance Actions */}
          <div className="pam-card" style={{ padding: '2rem', border: '1px solid rgba(255,60,60,0.2)' }}>
            <h3 style={{ color: '#ffcaca' }}>🚨 System Maintenance & Pruning</h3>
            <p style={{ opacity: 0.6, fontSize: '0.82rem', margin: '0.3rem 0 1.5rem' }}>
              Perform dangerous operations. Data deleted here cannot be recovered.
            </p>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem', background: 'rgba(255,60,60,0.02)', padding: '1.2rem', borderRadius: '8px', border: '1px solid rgba(255,60,60,0.1)' }}>
              <div>
                <strong style={{ display: 'block', marginBottom: '0.2rem', color: '#ffcaca' }}>Purge System Audit Logs</strong>
                <span style={{ fontSize: '0.78rem', opacity: 0.55 }}>Permanently deletes all audit history logs. A single log clear audit entry will remain.</span>
              </div>
              <button
                type="button"
                onClick={() => setShowClearLogsConfirm(true)}
                style={{
                  padding: '0.6rem 1.2rem', borderRadius: '8px', cursor: 'pointer',
                  background: 'rgba(255,60,60,0.15)', border: '1px solid rgba(255,60,60,0.4)',
                  color: '#ffcaca', fontWeight: 600, fontSize: '0.82rem', transition: 'background 0.15s'
                }}
              >
                🗑 Clear Audit Logs
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit/Create SMTP Profile Form Modal */}
      {showFormModal && (
        <div style={MODAL_BACKDROP} onClick={e => e.target === e.currentTarget && setShowFormModal(false)}>
          <div style={MODAL_CARD}>
            <h2 style={{ margin: '0 0 1rem', color: '#fff' }}>
              {currentProfile ? '✏️ Edit SMTP Profile' : '➕ Create SMTP Profile'}
            </h2>
            
            <form onSubmit={handleSave} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                <label style={{ fontSize: '0.78rem', color: 'rgba(255,255,255,0.55)', fontWeight: 600 }}>SMTP Provider Preset</label>
                <select
                  className="pam-select"
                  style={{ cursor: 'pointer' }}
                  onChange={(e) => {
                    const val = e.target.value;
                    let host = '';
                    let port = '587';
                    let profileName = form.profileName;
                    
                    if (val === 'gmail') {
                      host = 'smtp.gmail.com';
                      port = '587';
                      if (!profileName) profileName = 'Gmail';
                    } else if (val === 'outlook') {
                      host = 'smtp.office365.com';
                      port = '587';
                      if (!profileName) profileName = 'Outlook / Office 365';
                    } else if (val === 'yahoo') {
                      host = 'smtp.mail.yahoo.com';
                      port = '587';
                      if (!profileName) profileName = 'Yahoo Mail';
                    } else if (val === 'sendgrid') {
                      host = 'smtp.sendgrid.net';
                      port = '587';
                      if (!profileName) profileName = 'SendGrid';
                    } else if (val === 'mailgun') {
                      host = 'smtp.mailgun.org';
                      port = '587';
                      if (!profileName) profileName = 'Mailgun';
                    } else if (val === 'ses') {
                      host = 'email-smtp.us-east-1.amazonaws.com';
                      port = '587';
                      if (!profileName) profileName = 'Amazon SES';
                    }
                    
                    setForm(prev => ({
                      ...prev,
                      host: host || prev.host,
                      port: port || prev.port,
                      profileName: profileName
                    }));
                  }}
                  defaultValue=""
                >
                  <option value="" disabled>-- Select a Provider (Optional) --</option>
                  <option value="gmail">Gmail (smtp.gmail.com)</option>
                  <option value="outlook">Outlook / Office 365 (smtp.office365.com)</option>
                  <option value="yahoo">Yahoo Mail (smtp.mail.yahoo.com)</option>
                  <option value="sendgrid">SendGrid (smtp.sendgrid.net)</option>
                  <option value="mailgun">Mailgun (smtp.mailgun.org)</option>
                  <option value="ses">Amazon SES (email-smtp.us-east-1.amazonaws.com)</option>
                  <option value="custom">Custom / Other</option>
                </select>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                <label style={{ fontSize: '0.78rem', color: 'rgba(255,255,255,0.55)', fontWeight: 600 }}>Profile Name *</label>
                <input
                  id="profileName"
                  type="text"
                  className="pam-input"
                  placeholder="e.g. Gmail Backup or Office 365 Main"
                  value={form.profileName}
                  onChange={handleFormChange}
                  required
                />
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', background: 'rgba(255,255,255,0.02)', padding: '0.5rem', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.05)' }}>
                <input
                  id="enabled"
                  type="checkbox"
                  checked={form.enabled}
                  onChange={handleFormChange}
                  style={{ width: '16px', height: '16px', cursor: 'pointer' }}
                />
                <label htmlFor="enabled" style={{ fontSize: '0.82rem', fontWeight: 600, cursor: 'pointer' }}>
                  Enable Live SMTP Dispatch
                </label>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.8rem' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                  <label style={{ fontSize: '0.78rem', color: 'rgba(255,255,255,0.55)', fontWeight: 600 }}>SMTP Host *</label>
                  <input
                    id="host"
                    type="text"
                    className="pam-input"
                    placeholder="smtp.example.com"
                    value={form.host}
                    onChange={handleFormChange}
                    required
                  />
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                  <label style={{ fontSize: '0.78rem', color: 'rgba(255,255,255,0.55)', fontWeight: 600 }}>SMTP Port *</label>
                  <input
                    id="port"
                    type="text"
                    className="pam-input"
                    placeholder="587"
                    value={form.port}
                    onChange={handleFormChange}
                    required
                  />
                </div>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                <label style={{ fontSize: '0.78rem', color: 'rgba(255,255,255,0.55)', fontWeight: 600 }}>SMTP Username / Email (Optional)</label>
                <input
                  id="username"
                  type="text"
                  className="pam-input"
                  placeholder="admin@domain.com"
                  value={form.username}
                  onChange={handleFormChange}
                />
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem', position: 'relative' }}>
                <label style={{ fontSize: '0.78rem', color: 'rgba(255,255,255,0.55)', fontWeight: 600 }}>SMTP Password (Optional)</label>
                <div style={{ display: 'flex', gap: '0.4rem' }}>
                  <input
                    id="password"
                    type={showPassword ? 'text' : 'password'}
                    className="pam-input"
                    placeholder="App password"
                    value={form.password}
                    onChange={handleFormChange}
                    style={{ flex: 1 }}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    style={{
                      padding: '0 0.75rem', borderRadius: '8px', cursor: 'pointer',
                      background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.15)', color: '#fff',
                      fontSize: '0.8rem',
                    }}
                  >
                    {showPassword ? 'Hide' : 'Show'}
                  </button>
                </div>
                <span style={{ fontSize: '0.72rem', opacity: 0.5, marginTop: '0.2rem' }}>
                  * Leave username and password blank for passwordless corporate direct send or IP-authorized relays.
                </span>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                <label style={{ fontSize: '0.78rem', color: 'rgba(255,255,255,0.55)', fontWeight: 600 }}>Sender From Address *</label>
                <input
                  id="senderFrom"
                  type="email"
                  className="pam-input"
                  placeholder="no-reply@domain.com"
                  value={form.senderFrom}
                  onChange={handleFormChange}
                  required
                />
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', background: 'rgba(255,255,255,0.02)', padding: '0.5rem', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.05)' }}>
                <input
                  id="isActive"
                  type="checkbox"
                  checked={form.isActive}
                  onChange={handleFormChange}
                  style={{ width: '16px', height: '16px', cursor: 'pointer' }}
                />
                <label htmlFor="isActive" style={{ fontSize: '0.82rem', fontWeight: 600, cursor: 'pointer' }}>
                  Set as Active Profile (deactivates other profiles)
                </label>
              </div>

              {errorMsg && (
                <div style={{ padding: '0.75rem 1rem', background: 'rgba(255,60,60,0.1)', border: '1px solid rgba(255,60,60,0.3)', borderRadius: '8px', color: '#ffcaca', fontSize: '0.85rem' }}>
                  ⚠ {errorMsg}
                </div>
              )}

              {/* Form Connection Tester */}
              <div style={{ marginTop: '0.5rem', background: 'rgba(255,255,255,0.02)', padding: '1rem', borderRadius: '10px', border: '1px solid rgba(255,255,255,0.06)' }}>
                <span style={{ fontSize: '0.8rem', fontWeight: 600, display: 'block', marginBottom: '0.5rem' }}>🧪 Test Form Configuration</span>
                <div style={{ display: 'flex', gap: '0.4rem' }}>
                  <input
                    type="email"
                    className="pam-input"
                    placeholder="test-recipient@domain.com"
                    value={recipient}
                    onChange={(e) => setRecipient(e.target.value)}
                    style={{ flex: 1, fontSize: '0.8rem' }}
                  />
                  <button
                    type="button"
                    onClick={handleTest}
                    disabled={testing}
                    className="pam-button"
                    style={{
                      background: 'linear-gradient(90deg, #4facfe, #00f2fe)', border: 'none', color: '#000',
                      fontWeight: 700, fontSize: '0.75rem', padding: '0 0.8rem'
                    }}
                  >
                    {testing ? 'Testing...' : 'Test'}
                  </button>
                </div>
                {testResult && (
                  <div style={{ marginTop: '0.5rem', color: '#a8ffca', fontSize: '0.78rem' }}>✓ {testResult}</div>
                )}
                {testError && (
                  <div style={{ marginTop: '0.5rem', color: '#ffcaca', fontSize: '0.78rem' }}>⚠ {testError}</div>
                )}
              </div>

              <div style={{ display: 'flex', gap: '0.8rem', marginTop: '1rem', justifyContent: 'flex-end' }}>
                <button type="button" onClick={() => setShowFormModal(false)} style={{ padding: '0.6rem 1.2rem', borderRadius: '8px', background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.15)', color: '#fff', cursor: 'pointer' }}>
                  Cancel
                </button>
                <button type="submit" disabled={saving} className="pam-button">
                  {saving ? 'Saving...' : 'Save Profile'}
                </button>
              </div>

            </form>
          </div>
        </div>
      )}

      {/* Clear Logs Confirm Modal */}
      {showClearLogsConfirm && (
        <div style={MODAL_BACKDROP} onClick={e => e.target === e.currentTarget && setShowClearLogsConfirm(false)}>
          <div style={{ ...MODAL_CARD, border: '1px solid rgba(255,60,60,0.3)' }}>
            <h2 style={{ margin: '0 0 0.75rem', color: '#ffcaca' }}>⚠ Clear All Audit Logs</h2>
            <p style={{ opacity: 0.7, fontSize: '0.9rem', margin: '0 0 0.75rem' }}>
              This will permanently delete <strong>all current audit log entries</strong>. A single record will be kept to record this clear action.
            </p>
            <p style={{ opacity: 0.5, fontSize: '0.8rem', margin: '0 0 1.5rem' }}>
              This is an irreversible action. Only proceed if you have already archived or exported the logs you need.
            </p>
            <div style={{ display: 'flex', gap: '0.8rem', justifyContent: 'flex-end' }}>
              <button
                type="button"
                onClick={() => setShowClearLogsConfirm(false)}
                style={{ padding: '0.6rem 1.2rem', borderRadius: '8px', background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.15)', color: '#fff', cursor: 'pointer' }}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleClearLogs}
                disabled={clearingLogs}
                style={{
                  padding: '0.6rem 1.2rem', borderRadius: '8px', cursor: 'pointer',
                  background: 'linear-gradient(90deg, #b00020, #d00030)',
                  border: '1px solid rgba(255,60,60,0.5)', color: '#fff', fontWeight: 700, fontSize: '0.85rem',
                }}
              >
                {clearingLogs ? 'Clearing…' : 'Clear All Logs'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

