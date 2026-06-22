import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';

const API = 'http://localhost:8080';
const EMPTY_FORM = {
  hostname: '', ipAddress: '', osType: 'Windows Server',
  description: '', environment: 'Production', location: '',
  serverStatus: 'Active', remoteProtocol: 'RDP',
};

const MODAL_BACKDROP = {
  position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)',
  backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center',
  justifyContent: 'center', zIndex: 9999,
};
const MODAL_CARD = {
  background: 'rgba(15, 23, 42, 0.98)', border: '1px solid rgba(255,255,255,0.12)',
  borderRadius: '16px', padding: '2rem', width: '520px', maxWidth: '95vw',
  maxHeight: '90vh', overflowY: 'auto',
};

function ServerModal({ mode, initial, onSave, onClose }) {
  const [form, setForm] = useState(initial || EMPTY_FORM);
  const [saving, setSaving] = useState(false);

  // Scan states
  const [scanCredentials, setScanCredentials] = useState(false);
  const [adminUser, setAdminUser] = useState('Administrator');
  const [adminPassword, setAdminPassword] = useState('');
  const [scannedUsers, setScannedUsers] = useState([]);
  const [selectedUsers, setSelectedUsers] = useState({}); // { [username]: { checked: boolean, password: '' } }
  const [step, setStep] = useState(1); // 1: Server Details, 2: Select Users

  const set = (field) => (e) => setForm(f => ({ ...f, [field]: e.target.value }));

  const handleSave = async () => {
    if (!form.hostname || !form.ipAddress || !form.osType) {
      alert('Hostname, IP Address, and OS Type are required');
      return;
    }

    if (mode === 'create' && scanCredentials) {
      if (!adminUser || !adminPassword) {
        alert('Admin Username and Password are required to scan users');
        return;
      }
      setSaving(true);
      try {
        const scanRes = await fetch(`${API}/api/servers/scan-users`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            ipAddress: form.ipAddress,
            username: adminUser,
            password: adminPassword
          })
        });
        if (scanRes.ok) {
          const data = await scanRes.json();
          // Filter out the account used to scan from the checklist
          const filteredUsers = (data.users || []).filter(u => u.toLowerCase() !== adminUser.toLowerCase());
          setScannedUsers(filteredUsers);
          const initialSelected = {};
          filteredUsers.forEach(u => {
            initialSelected[u] = { checked: false, password: '' };
          });
          setSelectedUsers(initialSelected);
          setStep(2);
        } else {
          alert('Failed to scan users: ' + await scanRes.text());
        }
      } catch (err) {
        console.error(err);
        alert('Error scanning users: ' + err.message);
      } finally {
        setSaving(false);
      }
      return;
    }

    setSaving(true);
    const result = await onSave(form);
    setSaving(false);
    if (result) onClose();
  };

  const handleImportAndSave = async () => {
    // Validate that checked accounts have passwords filled
    const checkedUsernames = Object.keys(selectedUsers).filter(u => selectedUsers[u].checked);
    for (const username of checkedUsernames) {
      if (!selectedUsers[username].password) {
        alert(`Please enter a password for the checked account "${username}"`);
        return;
      }
    }

    setSaving(true);
    try {
      const newServer = await onSave(form);
      if (newServer && newServer.id) {
        const importPromises = [];

        // Automatically add the admin account used to scan to the credentials list
        importPromises.push(
          fetch(`${API}/api/credentials`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              serverId: newServer.id,
              username: adminUser,
              encryptedPassword: adminPassword,
              secretType: 'Password'
            })
          })
        );

        // Add any checked local accounts
        checkedUsernames.forEach(username => {
          const item = selectedUsers[username];
          importPromises.push(
            fetch(`${API}/api/credentials`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                serverId: newServer.id,
                username: username,
                encryptedPassword: item.password,
                secretType: 'Password'
              })
            })
          );
        });

        if (importPromises.length > 0) {
          await Promise.all(importPromises);
        }
        onClose();
      }
    } catch (err) {
      console.error(err);
      alert('Error saving server and credentials');
    } finally {
      setSaving(false);
    }
  };

  if (step === 2) {
    return (
      <div style={MODAL_BACKDROP} onClick={(e) => e.target === e.currentTarget && onClose()}>
        <div style={{ ...MODAL_CARD, width: '560px' }}>
          <h2 style={{ margin: '0 0 0.5rem', color: '#fff' }}>👤 Import Local Accounts</h2>
          <p style={{ opacity: 0.6, fontSize: '0.85rem', marginBottom: '1rem' }}>
            Scanned users from <strong style={{ color: '#4facfe' }}>{form.hostname} ({form.ipAddress})</strong>
          </p>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <div style={{ background: 'rgba(255, 203, 66, 0.08)', border: '1px solid rgba(255, 203, 66, 0.25)', padding: '0.8rem 1rem', borderRadius: '8px', fontSize: '0.82rem', color: '#ffe699', display: 'flex', gap: '0.5rem', alignItems: 'flex-start' }}>
              <span style={{ fontSize: '1.1rem' }}>🔒</span>
              <div>
                <strong>Notice on Passwords:</strong> For security reasons, Windows local passwords cannot be retrieved in plain-text. Please check the local users you want to add, and type in their passwords to import them.
              </div>
            </div>

            <div style={{ maxHeight: '250px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '0.8rem', paddingRight: '0.5rem' }}>
              {scannedUsers.length === 0 ? (
                <p style={{ opacity: 0.5, fontStyle: 'italic', padding: '1rem 0' }}>No active accounts found to import.</p>
              ) : (
                scannedUsers.map(user => {
                  const info = selectedUsers[user] || { checked: false, password: '' };
                  return (
                    <div key={user} style={{ display: 'flex', alignItems: 'center', gap: '0.8rem', background: 'rgba(255,255,255,0.03)', padding: '0.6rem 1rem', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.08)' }}>
                      <input 
                        type="checkbox"
                        checked={info.checked}
                        onChange={(e) => setSelectedUsers(prev => ({
                          ...prev,
                          [user]: { ...prev[user], checked: e.target.checked }
                        }))}
                        style={{ width: '18px', height: '18px', cursor: 'pointer' }}
                      />
                      <span style={{ fontWeight: 'bold', color: '#fff', minWidth: '130px', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        👤 {user}
                      </span>
                      <input 
                        className="pam-input"
                        type="password"
                        placeholder="Enter password"
                        disabled={!info.checked}
                        value={info.password}
                        onChange={(e) => setSelectedUsers(prev => ({
                          ...prev,
                          [user]: { ...prev[user], password: e.target.value }
                        }))}
                        style={{ flex: 1, padding: '0.45rem', fontSize: '0.85rem', color: '#fff' }}
                      />
                    </div>
                  );
                })
              )}
            </div>
          </div>

          <div style={{ display: 'flex', gap: '0.8rem', marginTop: '1.5rem', justifyContent: 'flex-end' }}>
            <button onClick={() => setStep(1)} style={{ padding: '0.6rem 1.2rem', borderRadius: '8px', background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.15)', color: '#fff', cursor: 'pointer' }}>
              Back
            </button>
            <button onClick={handleImportAndSave} disabled={saving} className="pam-button" style={{ minWidth: '120px' }}>
              {saving ? 'Importing…' : 'Import & Save'}
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={MODAL_BACKDROP} onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div style={MODAL_CARD}>
        <h2 style={{ margin: '0 0 1.5rem', color: '#fff' }}>
          {mode === 'create' ? '➕ Add New Server' : '✏️ Edit Server'}
        </h2>

        <div style={{ display: 'grid', gap: '1rem', gridTemplateColumns: '1fr 1fr' }}>
          {[
            ['hostname', 'Hostname *', 'text'],
            ['ipAddress', 'IP Address *', 'text'],
            ['environment', 'Environment', 'select', ['Production', 'Staging', 'Development', 'UAT']],
            ['location', 'Location', 'text'],
          ].map(([key, label, type, options]) => (
            <div key={key} style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
              <label style={{ fontSize: '0.8rem', color: 'rgba(255,255,255,0.6)', fontWeight: 600 }}>{label}</label>
              {type === 'select' ? (
                <select className="pam-select" value={form[key]} onChange={set(key)} style={{ color: '#000' }}>
                  {options.map(o => <option key={o} value={o}>{o}</option>)}
                </select>
              ) : (
                <input className="pam-input" value={form[key]} onChange={set(key)} />
              )}
            </div>
          ))}

          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
            <label style={{ fontSize: '0.8rem', color: 'rgba(255,255,255,0.6)', fontWeight: 600 }}>OS Type *</label>
            <select className="pam-select" value={form.osType} onChange={set('osType')} style={{ color: '#000' }}>
              {['Windows Server', 'Windows 10', 'Windows 11', 'Ubuntu Linux', 'CentOS', 'RHEL'].map(o => <option key={o} value={o}>{o}</option>)}
            </select>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
            <label style={{ fontSize: '0.8rem', color: 'rgba(255,255,255,0.6)', fontWeight: 600 }}>Remote Protocol</label>
            <select className="pam-select" value={form.remoteProtocol} onChange={set('remoteProtocol')} style={{ color: '#000' }}>
              {['RDP', 'SSH', 'VNC', 'None'].map(o => <option key={o} value={o}>{o}</option>)}
            </select>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
            <label style={{ fontSize: '0.8rem', color: 'rgba(255,255,255,0.6)', fontWeight: 600 }}>Status</label>
            <select className="pam-select" value={form.serverStatus} onChange={set('serverStatus')} style={{ color: '#000' }}>
              {['Active', 'Inactive', 'Maintenance'].map(o => <option key={o} value={o}>{o}</option>)}
            </select>
          </div>

          <div style={{ gridColumn: '1 / -1', display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
            <label style={{ fontSize: '0.8rem', color: 'rgba(255,255,255,0.6)', fontWeight: 600 }}>Remarks</label>
            <textarea className="pam-input" rows={2} value={form.description} onChange={set('description')} style={{ resize: 'vertical' }} />
          </div>

          {mode === 'create' && (
            <div style={{ gridColumn: '1 / -1', marginTop: '0.5rem', display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: '#fff', fontSize: '0.9rem', cursor: 'pointer', fontWeight: 600 }}>
                <input 
                  type="checkbox"
                  checked={scanCredentials}
                  onChange={(e) => setScanCredentials(e.target.checked)}
                  style={{ width: '16px', height: '16px', cursor: 'pointer' }}
                />
                🔍 Scan local users & import credentials
              </label>
              {scanCredentials && (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', background: 'rgba(255,255,255,0.03)', padding: '1rem', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.08)' }}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                    <label style={{ fontSize: '0.8rem', color: 'rgba(255,255,255,0.6)', fontWeight: 600 }}>Admin Username *</label>
                    <input className="pam-input" value={adminUser} onChange={(e) => setAdminUser(e.target.value)} />
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                    <label style={{ fontSize: '0.8rem', color: 'rgba(255,255,255,0.6)', fontWeight: 600 }}>Admin Password *</label>
                    <input className="pam-input" type="password" value={adminPassword} onChange={(e) => setAdminPassword(e.target.value)} />
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        <div style={{ display: 'flex', gap: '0.8rem', marginTop: '1.5rem', justifyContent: 'flex-end' }}>
          <button onClick={onClose} style={{ padding: '0.6rem 1.2rem', borderRadius: '8px', background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.15)', color: '#fff', cursor: 'pointer' }}>
            Cancel
          </button>
          <button onClick={handleSave} disabled={saving} className="pam-button" style={{ minWidth: '110px' }}>
            {saving ? 'Scanning…' : scanCredentials ? 'Scan & Next' : mode === 'create' ? 'Add Server' : 'Save Changes'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function ServerManagement() {
  const navigate = useNavigate();
  const { isAdmin, user } = useAuth();
  const [servers, setServers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState(null); // null | {mode:'create'|'edit', server?}
  const [requestModal, setRequestModal] = useState(null); // server for ticket request
  const [ticketForm, setTicketForm] = useState({ reason: '', urgency: 'Normal', accessType: 'Remote Access', requestedStartTime: '', requestedEndTime: '' });
  const [submitting, setSubmitting] = useState(false);

  // Helper: convert local datetime-local string to ISO
  const toISOFromLocal = (dtStr) => {
    if (!dtStr) return '';
    const d = new Date(dtStr);
    return isNaN(d.getTime()) ? '' : d.toISOString();
  };
  // Helper: convert ISO to datetime-local format
  const toLocalFromISO = (isoStr) => {
    if (!isoStr) return '';
    const d = new Date(isoStr);
    if (isNaN(d.getTime()) || d.getFullYear() < 2000) return '';
    const pad = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  };

  const SHORTCUT_BTN_STYLE = {
    padding: '0.25rem 0.5rem',
    borderRadius: '4px',
    background: 'rgba(255, 255, 255, 0.05)',
    border: '1px solid rgba(255, 255, 255, 0.12)',
    color: 'rgba(255, 255, 255, 0.7)',
    fontSize: '0.72rem',
    cursor: 'pointer',
    transition: 'all 0.15s ease',
    outline: 'none',
    marginTop: '0.25rem',
  };

  const handleMouseEnterShortcut = (e) => {
    e.currentTarget.style.background = 'rgba(79, 172, 254, 0.15)';
    e.currentTarget.style.borderColor = 'rgba(79, 172, 254, 0.4)';
    e.currentTarget.style.color = '#4facfe';
  };

  const handleMouseLeaveShortcut = (e) => {
    e.currentTarget.style.background = 'rgba(255, 255, 255, 0.05)';
    e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.12)';
    e.currentTarget.style.color = 'rgba(255, 255, 255, 0.7)';
  };

  const setRequestStart = (newStart) => {
    const newStartStr = toLocalFromISO(newStart.toISOString());
    setTicketForm(prev => {
      const currentStart = new Date(prev.requestedStartTime || Date.now());
      const currentEnd = new Date(prev.requestedEndTime || Date.now());
      const durationMs = currentEnd.getTime() - currentStart.getTime();
      const finalDuration = durationMs > 0 ? durationMs : 8 * 3600000;
      const newEnd = new Date(newStart.getTime() + finalDuration);
      return {
        ...prev,
        requestedStartTime: newStartStr,
        requestedEndTime: toLocalFromISO(newEnd.toISOString())
      };
    });
  };

  const setRequestEndOffset = (hours) => {
    setTicketForm(prev => {
      const startDt = new Date(prev.requestedStartTime || Date.now());
      const newEnd = new Date(startDt.getTime() + hours * 3600000);
      return {
        ...prev,
        requestedEndTime: toLocalFromISO(newEnd.toISOString())
      };
    });
  };

  const handleOpenRequestModal = (server) => {
    const nowLocal = toLocalFromISO(new Date().toISOString());
    const defaultUntil = toLocalFromISO(new Date(Date.now() + 8 * 3600000).toISOString());
    setTicketForm({
      reason: '',
      urgency: 'Normal',
      accessType: 'Remote Access',
      requestedStartTime: nowLocal,
      requestedEndTime: defaultUntil
    });
    setRequestModal(server);
  };

  useEffect(() => { fetchServers(); }, []);

  const fetchServers = async () => {
    try {
      const res = await fetch(`${API}/api/servers`);
      if (res.ok) setServers(await res.json() || []);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  };

  const handleCreate = async (form) => {
    try {
      const res = await fetch(`${API}/api/servers`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form),
      });
      if (res.ok) {
        const data = await res.json();
        fetchServers();
        return data;
      } else {
        alert('Failed to create server: ' + await res.text());
        return null;
      }
    } catch (e) {
      console.error(e);
      alert('Error creating server');
      return null;
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Are you sure you want to delete this server? This cannot be undone.')) return;
    const res = await fetch(`${API}/api/servers/${id}`, { method: 'DELETE' });
    if (res.ok) fetchServers();
    else alert('Failed to delete server');
  };

  const handleRequestTicket = async () => {
    if (!ticketForm.reason.trim()) return alert('Please provide a reason for access');
    if (!ticketForm.requestedStartTime || !ticketForm.requestedEndTime) return alert('Please provide requested start and end times');
    setSubmitting(true);
    const payload = {
      requesterId: user?.userId || user?.id || '',
      serverId: requestModal.id,
      reason: ticketForm.reason,
      accessType: ticketForm.accessType,
      urgency: ticketForm.urgency,
      requestedStartTime: new Date(ticketForm.requestedStartTime).toISOString(),
      requestedEndTime: new Date(ticketForm.requestedEndTime).toISOString(),
    };
    const res = await fetch(`${API}/api/tickets/request`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
    });
    setSubmitting(false);
    if (res.ok) {
      setRequestModal(null);
      setTicketForm({ reason: '', urgency: 'Normal', accessType: 'Remote Access', requestedStartTime: '', requestedEndTime: '' });
      alert('Access request submitted successfully! Awaiting admin approval.');
    } else alert('Failed to submit request: ' + await res.text());
  };

  return (
    <div className="pam-container">
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
        <div>
          <h1 style={{ margin: 0, textShadow: '0 2px 10px rgba(0,0,0,0.5)' }}>Server List</h1>
          <p style={{ margin: '0.3rem 0 0', opacity: 0.6, fontSize: '0.85rem' }}>
            {isAdmin ? 'Manage all servers in the environment' : 'View available servers and request access'}
          </p>
        </div>
        {isAdmin && (
          <button className="pam-button" onClick={() => setModal({ mode: 'create' })}>
            ➕ Add Server
          </button>
        )}
      </div>

      {/* Table */}
      <div className="pam-card" style={{ overflowX: 'auto' }}>
        {loading ? <p style={{ padding: '2rem', opacity: 0.6 }}>Loading servers…</p> : (
          servers.length === 0 ? <p style={{ padding: '2rem', opacity: 0.6 }}>No servers found.</p> : (
            <table className="pam-table">
              <thead>
                <tr>
                  <th>Hostname</th>
                  <th>IP Address</th>
                  <th>OS Type</th>
                  <th>Environment</th>
                  <th>Protocol</th>
                  <th>Status</th>
                  <th style={{ textAlign: 'center' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {servers.map(s => (
                  <tr key={s.id}>
                    <td style={{ fontWeight: 700, color: '#4facfe' }}>💻 {s.hostname}</td>
                    <td style={{ fontFamily: 'monospace' }}>{s.ipAddress}</td>
                    <td>{s.osType}</td>
                    <td>{s.environment || '—'}</td>
                    <td>{s.remoteProtocol || s.description ? (s.remoteProtocol || 'RDP') : '—'}</td>
                    <td>
                      <span style={{
                        padding: '0.2rem 0.6rem', borderRadius: '999px', fontSize: '0.75rem',
                        background: s.isActive ? 'rgba(0,255,0,0.12)' : 'rgba(255,0,0,0.12)',
                        color: s.isActive ? '#a8ffca' : '#ffcaca', border: `1px solid ${s.isActive ? 'rgba(0,255,0,0.3)' : 'rgba(255,0,0,0.3)'}`,
                      }}>
                        {s.isActive ? '● Active' : '● Inactive'}
                      </span>
                    </td>
                    <td>
                      <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'center' }}>
                        {isAdmin ? (
                          <>
                            <button onClick={() => navigate(`/pam/servers/${s.id}`)} style={btnStyle('#ffcb42')}>View</button>
                            <button onClick={() => setModal({ mode: 'edit', server: s })} style={btnStyle('#4facfe')}>Edit</button>
                            <button onClick={() => handleDelete(s.id)} style={btnStyle('#ff4c4c')}>Delete</button>
                          </>
                        ) : (
                          <>
                            <button onClick={() => navigate(`/pam/servers/${s.id}`)} style={btnStyle('#ffcb42')}>View</button>
                            <button onClick={() => handleOpenRequestModal(s)} style={btnStyle('#a8ffca')}>Request Access</button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )
        )}
      </div>

      {/* Admin Server Modal */}
      {modal && (
        <ServerModal
          mode={modal.mode}
          initial={modal.server || EMPTY_FORM}
          onSave={modal.mode === 'create' ? handleCreate : async (form) => {
            const res = await fetch(`${API}/api/servers/${modal.server.id}`, {
              method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form),
            });
            if (res.ok) { fetchServers(); return true; }
            else { alert('Failed to update server'); return false; }
          }}
          onClose={() => setModal(null)}
        />
      )}

      {/* User Request Access Modal */}
      {requestModal && (
        <div style={MODAL_BACKDROP} onClick={(e) => e.target === e.currentTarget && setRequestModal(null)}>
          <div style={{ ...MODAL_CARD, width: '440px' }}>
            <h2 style={{ margin: '0 0 0.5rem', color: '#fff' }}>🎫 Request Server Access</h2>
            <p style={{ opacity: 0.6, fontSize: '0.85rem', marginBottom: '1.5rem' }}>
              Server: <strong style={{ color: '#4facfe' }}>{requestModal.hostname}</strong> ({requestModal.ipAddress})
            </p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              {[
                ['Urgency', 'urgency', 'select', ['Low', 'Normal', 'High', 'Critical']],
              ].map(([label, key, type, options]) => (
                <div key={key} style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                  <label style={{ fontSize: '0.8rem', color: 'rgba(255,255,255,0.6)', fontWeight: 600 }}>{label}</label>
                  <select className="pam-select" value={ticketForm[key]}
                    onChange={e => setTicketForm(f => ({ ...f, [key]: e.target.value }))} style={{ color: '#000' }}>
                    {options.map(o => <option key={o} value={o}>{o}</option>)}
                  </select>
                </div>
              ))}

              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                <label style={{ fontSize: '0.8rem', color: 'rgba(255,255,255,0.6)', fontWeight: 600 }}>Requested Start Time *</label>
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                  <input 
                    className="pam-input" 
                    type="date" 
                    value={splitDateTime(ticketForm.requestedStartTime).date} 
                    onChange={e => {
                      const newDate = e.target.value;
                      const newTime = splitDateTime(ticketForm.requestedStartTime).time || '00:00';
                      const val = joinDateTime(newDate, newTime);
                      const newStart = new Date(val);
                      const currentStart = new Date(ticketForm.requestedStartTime || Date.now());
                      const currentEnd = new Date(ticketForm.requestedEndTime || Date.now());
                      const durationMs = currentEnd.getTime() - currentStart.getTime();
                      const finalDuration = durationMs > 0 ? durationMs : 8 * 3600000;
                      const newEnd = new Date(newStart.getTime() + finalDuration);
                      setTicketForm(f => ({ ...f, requestedStartTime: val, requestedEndTime: toLocalFromISO(newEnd.toISOString()) }));
                    }}
                    style={{ flex: 1 }}
                    required 
                  />
                  <input 
                    className="pam-input" 
                    type="time" 
                    value={splitDateTime(ticketForm.requestedStartTime).time} 
                    onChange={e => {
                      const newDate = splitDateTime(ticketForm.requestedStartTime).date || new Date().toISOString().split('T')[0];
                      const newTime = e.target.value;
                      const val = joinDateTime(newDate, newTime);
                      const newStart = new Date(val);
                      const currentStart = new Date(ticketForm.requestedStartTime || Date.now());
                      const currentEnd = new Date(ticketForm.requestedEndTime || Date.now());
                      const durationMs = currentEnd.getTime() - currentStart.getTime();
                      const finalDuration = durationMs > 0 ? durationMs : 8 * 3600000;
                      const newEnd = new Date(newStart.getTime() + finalDuration);
                      setTicketForm(f => ({ ...f, requestedStartTime: val, requestedEndTime: toLocalFromISO(newEnd.toISOString()) }));
                    }}
                    style={{ flex: 1 }}
                    required 
                  />
                </div>
                <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
                  <button type="button" style={SHORTCUT_BTN_STYLE} onMouseEnter={handleMouseEnterShortcut} onMouseLeave={handleMouseLeaveShortcut} onClick={() => setRequestStart(new Date())}>Now</button>
                  <button type="button" style={SHORTCUT_BTN_STYLE} onMouseEnter={handleMouseEnterShortcut} onMouseLeave={handleMouseLeaveShortcut} onClick={() => setRequestStart(new Date(Date.now() + 30 * 60000))}>+30m</button>
                  <button type="button" style={SHORTCUT_BTN_STYLE} onMouseEnter={handleMouseEnterShortcut} onMouseLeave={handleMouseLeaveShortcut} onClick={() => setRequestStart(new Date(Date.now() + 60 * 60000))}>+1h</button>
                  <button type="button" style={SHORTCUT_BTN_STYLE} onMouseEnter={handleMouseEnterShortcut} onMouseLeave={handleMouseLeaveShortcut} onClick={() => setRequestStart(new Date(Date.now() + 120 * 60000))}>+2h</button>
                </div>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                <label style={{ fontSize: '0.8rem', color: 'rgba(255,255,255,0.6)', fontWeight: 600 }}>Requested End Time *</label>
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                  <input 
                    className="pam-input" 
                    type="date" 
                    value={splitDateTime(ticketForm.requestedEndTime).date} 
                    onChange={e => {
                      const newDate = e.target.value;
                      const newTime = splitDateTime(ticketForm.requestedEndTime).time || '00:00';
                      const val = joinDateTime(newDate, newTime);
                      setTicketForm(f => ({ ...f, requestedEndTime: val }));
                    }}
                    style={{ flex: 1 }}
                    required 
                  />
                  <input 
                    className="pam-input" 
                    type="time" 
                    value={splitDateTime(ticketForm.requestedEndTime).time} 
                    onChange={e => {
                      const newDate = splitDateTime(ticketForm.requestedEndTime).date || new Date().toISOString().split('T')[0];
                      const newTime = e.target.value;
                      const val = joinDateTime(newDate, newTime);
                      setTicketForm(f => ({ ...f, requestedEndTime: val }));
                    }}
                    style={{ flex: 1 }}
                    required 
                  />
                </div>
                <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
                  <button type="button" style={SHORTCUT_BTN_STYLE} onMouseEnter={handleMouseEnterShortcut} onMouseLeave={handleMouseLeaveShortcut} onClick={() => setRequestEndOffset(1)}>+1h</button>
                  <button type="button" style={SHORTCUT_BTN_STYLE} onMouseEnter={handleMouseEnterShortcut} onMouseLeave={handleMouseLeaveShortcut} onClick={() => setRequestEndOffset(2)}>+2h</button>
                  <button type="button" style={SHORTCUT_BTN_STYLE} onMouseEnter={handleMouseEnterShortcut} onMouseLeave={handleMouseLeaveShortcut} onClick={() => setRequestEndOffset(4)}>+4h</button>
                  <button type="button" style={SHORTCUT_BTN_STYLE} onMouseEnter={handleMouseEnterShortcut} onMouseLeave={handleMouseLeaveShortcut} onClick={() => setRequestEndOffset(8)}>+8h</button>
                  <button type="button" style={SHORTCUT_BTN_STYLE} onMouseEnter={handleMouseEnterShortcut} onMouseLeave={handleMouseLeaveShortcut} onClick={() => setRequestEndOffset(24)}>+24h</button>
                </div>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                <label style={{ fontSize: '0.8rem', color: 'rgba(255,255,255,0.6)', fontWeight: 600 }}>Reason for Access *</label>
                <textarea className="pam-input" rows={3} placeholder="Describe why you need access to this server…"
                  value={ticketForm.reason} onChange={e => setTicketForm(f => ({ ...f, reason: e.target.value }))} style={{ resize: 'vertical' }} />
              </div>
            </div>

            <div style={{ display: 'flex', gap: '0.8rem', marginTop: '1.5rem', justifyContent: 'flex-end' }}>
              <button onClick={() => setRequestModal(null)} style={{ padding: '0.6rem 1.2rem', borderRadius: '8px', background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.15)', color: '#fff', cursor: 'pointer' }}>
                Cancel
              </button>
              <button className="pam-button" onClick={handleRequestTicket} disabled={submitting}>
                {submitting ? 'Submitting…' : 'Submit Request'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const btnStyle = (color) => ({
  padding: '0.35rem 0.8rem', borderRadius: '6px', cursor: 'pointer',
  background: `${color}18`, border: `1px solid ${color}55`, color, fontSize: '0.8rem',
  transition: 'background 0.15s',
});
