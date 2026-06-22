import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import BrowserRdpSession from '../../components/BrowserRdpSession';

const API = 'http://localhost:8080';

const MODAL_BACKDROP = {
  position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)',
  backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center',
  justifyContent: 'center', zIndex: 9999,
};
const MODAL_CARD = {
  background: 'rgba(10,16,35,0.98)', border: '1px solid rgba(255,255,255,0.12)',
  borderRadius: '16px', padding: '2rem', width: '440px', maxWidth: '95vw',
};

export default function ServerDetails() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user, isAdmin, isSuperAdmin } = useAuth();

  const [server, setServer] = useState(null);
  const [credentials, setCredentials] = useState([]);
  const [logs, setLogs] = useState([]);
  const [activeTab, setActiveTab] = useState('Overview');
  const [loading, setLoading] = useState(true);
  
  // User ticket status tracking (to show Connect button)
  const [activeTicket, setActiveTicket] = useState(null);
  const [connectionState, setConnectionState] = useState(null); // 'loading' | 'ready' | 'error' | null
  const [rdpData, setRdpData] = useState(null);
  const [rdpConnectionError, setRdpConnectionError] = useState(null);
  const [activeSession, setActiveSession] = useState(null);

  // Add credential state
  const [credForm, setCredForm] = useState({ username: '', password: '', secretType: 'Password' });
  const [addingCred, setAddingCred] = useState(false);
  const [revealedPasswords, setRevealedPasswords] = useState({});

  const fetchCredentials = useCallback(async () => {
    try {
      const res = await fetch(`${API}/api/credentials/${id}`);
      if (res.ok) setCredentials(await res.json() || []);
    } catch (e) { console.error(e); }
  }, [id]);

  const fetchUserTickets = useCallback(async (serverId) => {
    if (!user?.userId) return;
    try {
      const res = await fetch(`${API}/api/tickets?requesterId=${encodeURIComponent(user.userId)}`);
      if (res.ok) {
        const tickets = await res.json() || [];
        const active = tickets.find(t => 
          t.serverId === serverId && 
          t.status === 'Approved' && 
          (!t.validUntilStr || new Date(t.validUntilStr) > new Date())
        );
        if (active) {
          setActiveTicket(active);
        }
      }
    } catch (e) { console.error(e); }
  }, [user?.userId]);

  const fetchServerDetails = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API}/api/servers/${id}`);
      if (res.ok) {
        const data = await res.json();
        setServer(data);
        fetchCredentials();
        if (user?.userId) {
          fetchUserTickets(data.id);
        }
      } else {
        alert('Server not found');
        navigate('/pam/servers');
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, [id, user?.userId, navigate, fetchCredentials, fetchUserTickets]);

  const fetchLogs = useCallback(async () => {
    if (!server?.hostname) return;
    try {
      const res = await fetch(`${API}/api/audit-logs?serverName=${encodeURIComponent(server.hostname)}`);
      if (res.ok) setLogs(await res.json() || []);
    } catch (e) { console.error(e); }
  }, [server?.hostname]);

  useEffect(() => {
    fetchServerDetails();
  }, [fetchServerDetails]);

  useEffect(() => {
    if (activeTab === 'Logs') {
      fetchLogs();
    }
  }, [activeTab, fetchLogs]);

  const handleAddCredential = async (e) => {
    e.preventDefault();
    if (!credForm.username || !credForm.password) return alert('Username and password are required');
    setAddingCred(true);
    try {
      const res = await fetch(`${API}/api/credentials`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          serverId: id,
          username: credForm.username,
          encryptedPassword: credForm.password,
          secretType: credForm.secretType,
        })
      });
      if (res.ok) {
        setCredForm({ username: '', password: '', secretType: 'Password' });
        fetchCredentials();
        alert('Credential saved to vault');
      } else {
        alert('Failed to save credential');
      }
    } catch (e) { console.error(e); }
    finally { setAddingCred(false); }
  };

  const handleReveal = async (c) => {
    if (revealedPasswords[c.id]) {
      setRevealedPasswords(prev => {
        const next = { ...prev };
        delete next[c.id];
        return next;
      });
      return;
    }

    try {
      const res = await fetch(`${API}/api/credentials/${c.id}/reveal`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ actor: user?.userId || 'unknown', role: isSuperAdmin ? 'SUPER_ADMIN' : 'ADMIN' })
      });
      if (res.ok) {
        const data = await res.json();
        setRevealedPasswords(prev => ({ ...prev, [c.id]: data.password }));
      } else {
        alert('Failed to reveal password: ' + await res.text());
      }
    } catch (err) {
      alert('Error: ' + err.message);
    }
  };

  const handleDeleteCredential = async (credId) => {
    if (!window.confirm('Are you sure you want to delete this credential?')) return;
    try {
      const res = await fetch(`${API}/api/credentials/${credId}`, { method: 'DELETE' });
      if (res.ok) fetchCredentials();
      else alert('Failed to delete credential');
    } catch (e) { console.error(e); }
  };

  const handleLaunchRDP = async () => {
    if (!activeTicket) return;
    setConnectionState('loading');
    setRdpConnectionError(null);
    try {
      const res = await fetch(`${API}/api/remote/${activeTicket.id}`);
      if (!res.ok) {
        const errMsg = await res.text();
        throw new Error(errMsg || 'Secure gateway connection failed.');
      }
      const data = await res.json();
      setRdpData(data);
      setConnectionState('ready');
    } catch (e) {
      setRdpConnectionError(e.message);
      setConnectionState('error');
    }
  };

  const handleLaunchRDPAdmin = async (cred) => {
    setConnectionState('loading');
    setRdpConnectionError(null);
    try {
      const uId = user.id || user.userId;
      const res = await fetch(`${API}/api/remote-admin/connect?serverId=${server.id}&credentialId=${cred.id}&userId=${uId}`);
      if (!res.ok) {
        const errMsg = await res.text();
        throw new Error(errMsg || 'Admin access connection failed.');
      }
      const data = await res.json();
      setRdpData(data);
      setConnectionState('ready');
    } catch (e) {
      setRdpConnectionError(e.message);
      setConnectionState('error');
    }
  };

  const downloadRDP = () => {
    if (!rdpData) return;
    const blob = new Blob([rdpData.rdpFile], { type: 'application/x-rdp' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `${rdpData.hostname || 'server'}.rdp`;
    document.body.appendChild(a); a.click();
    document.body.removeChild(a); URL.revokeObjectURL(url);
    if (rdpData.password) {
      navigator.clipboard.writeText(rdpData.password);
    }
  };

  if (loading) {
    return (
      <div className="pam-container">
        <p style={{ opacity: 0.6 }}>Loading server details...</p>
      </div>
    );
  }

  if (!server) return null;

  // Filter tabs by role: normal users only get Overview & Device Info
  const tabs = isAdmin 
    ? ['Overview', 'Credentials', 'Device Info', 'Logs']
    : ['Overview', 'Device Info'];

  return (
    <div className="pam-container">
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <button 
            onClick={() => navigate('/pam/servers')}
            style={{ background: 'transparent', border: 'none', color: '#4facfe', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '5px', marginBottom: '0.8rem', fontSize: '0.88rem' }}
          >
            ← Back to Servers
          </button>
          <h1 style={{ margin: 0, textShadow: '0 2px 10px rgba(0,0,0,0.5)' }}>💻 {server.hostname}</h1>
          <p style={{ margin: '0.3rem 0 0', opacity: 0.6, fontSize: '0.85rem' }}>
            IP Address: <span style={{ fontFamily: 'monospace' }}>{server.ipAddress}</span> | OS: {server.osType}
          </p>
        </div>
        
        {/* Connection status for normal user */}
        {activeTicket && (
          <button onClick={handleLaunchRDP} className="pam-button" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            🔌 Connect (RDP)
          </button>
        )}
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: '0.25rem', borderBottom: '1px solid rgba(255,255,255,0.08)', paddingBottom: '1px' }}>
        {tabs.map(tab => (
          <button 
            key={tab} 
            onClick={() => setActiveTab(tab)}
            style={{
              padding: '0.8rem 1.5rem',
              background: activeTab === tab ? 'rgba(79,172,254,0.12)' : 'transparent',
              border: 'none',
              borderBottom: activeTab === tab ? '3px solid #4facfe' : '3px solid transparent',
              color: activeTab === tab ? '#fff' : 'rgba(255,255,255,0.5)',
              fontWeight: activeTab === tab ? 700 : 400,
              cursor: 'pointer',
              fontSize: '0.92rem',
              transition: 'all 0.15s',
            }}
          >
            {tab}
          </button>
        ))}
      </div>

      {/* Tab Panel Content */}
      <div style={{ marginTop: '1rem' }}>
        
        {/* OVERVIEW TAB */}
        {activeTab === 'Overview' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
            <div className="pam-card" style={{ padding: '2rem' }}>
              <h3 style={{ margin: '0 0 1.5rem', borderBottom: '1px solid rgba(255,255,255,0.06)', paddingBottom: '0.50rem' }}>Overview</h3>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '1.5rem' }}>
                <div>
                  <span style={{ opacity: 0.5, fontSize: '0.8rem', display: 'block' }}>Hostname</span>
                  <strong style={{ fontSize: '1.1rem' }}>{server.hostname}</strong>
                </div>
                <div>
                  <span style={{ opacity: 0.5, fontSize: '0.8rem', display: 'block' }}>IP Address</span>
                  <strong style={{ fontSize: '1.1rem', fontFamily: 'monospace' }}>{server.ipAddress}</strong>
                </div>
                <div>
                  <span style={{ opacity: 0.5, fontSize: '0.8rem', display: 'block' }}>OS Type</span>
                  <strong style={{ fontSize: '1.1rem' }}>{server.osType}</strong>
                </div>
                <div>
                  <span style={{ opacity: 0.5, fontSize: '0.8rem', display: 'block' }}>Environment</span>
                  <strong style={{ fontSize: '1.1rem', color: '#ffcb42' }}>{server.environment || 'Production'}</strong>
                </div>
                <div>
                  <span style={{ opacity: 0.5, fontSize: '0.8rem', display: 'block' }}>Location</span>
                  <strong style={{ fontSize: '1.1rem' }}>{server.location || 'Default DC'}</strong>
                </div>
                <div>
                  <span style={{ opacity: 0.5, fontSize: '0.8rem', display: 'block' }}>Status</span>
                  <strong style={{ 
                    fontSize: '1.1rem', 
                    color: server.isActive ? '#a8ffca' : '#ffcaca' 
                  }}>
                    {server.isActive ? 'Active' : 'Inactive'}
                  </strong>
                </div>
              </div>
              <div style={{ marginTop: '1.5rem' }}>
                <span style={{ opacity: 0.5, fontSize: '0.8rem', display: 'block' }}>Description / Remarks</span>
                <p style={{ margin: '0.3rem 0 0', opacity: 0.8 }}>{server.description || 'No description provided'}</p>
              </div>
            </div>

            <div className="pam-card" style={{ padding: '2rem' }}>
              <h3>Credential Summary</h3>
              <p style={{ opacity: 0.6, fontSize: '0.82rem', margin: '0.2rem 0 1rem' }}>Stored server credential accounts linked to this machine.</p>
              {credentials.length === 0 ? (
                <p style={{ opacity: 0.5, margin: 0 }}>No credentials linked to this server.</p>
              ) : (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '1rem' }}>
                  {credentials.map(c => {
                    const isTicketAssigned = activeTicket && activeTicket.assignedCredentialId === c.id;
                    const canConnect = isAdmin || isTicketAssigned;
                    return (
                      <div key={c.id} style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '8px', padding: '0.8rem 1.2rem', display: 'flex', alignItems: 'center', gap: '15px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <span style={{ color: '#4facfe', fontSize: '1.2rem' }}>👤</span>
                          <div>
                            <div style={{ fontWeight: 600, fontSize: '0.88rem' }}>{c.username}</div>
                            <div style={{ fontSize: '0.72rem', opacity: 0.5 }}>{c.secretType}</div>
                          </div>
                        </div>
                        {canConnect && (
                          <button
                            onClick={() => isAdmin ? handleLaunchRDPAdmin(c) : handleLaunchRDP()}
                            className="pam-button"
                            style={{ fontSize: '0.75rem', padding: '0.25rem 0.6rem' }}
                          >
                            🔌 Connect
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        )}

        {/* CREDENTIALS TAB */}
        {activeTab === 'Credentials' && isAdmin && (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 340px', gap: '1.5rem', alignItems: 'start' }}>
            {/* List */}
            <div className="pam-card" style={{ padding: '2rem' }}>
              <h3 style={{ margin: '0 0 1rem' }}>Linked Accounts</h3>
              {credentials.length === 0 ? (
                <p style={{ opacity: 0.6, padding: '1rem 0' }}>No credentials saved for this server.</p>
              ) : (
                <table className="pam-table" style={{ margin: 0, background: 'transparent', boxShadow: 'none' }}>
                  <thead>
                    <tr>
                      <th>Account Name</th>
                      <th>Type</th>
                      <th>Secret</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {credentials.map(c => (
                      <tr key={c.id}>
                        <td style={{ fontWeight: 700, color: '#4facfe' }}>👤 {c.username}</td>
                        <td style={{ fontSize: '0.85rem' }}>{c.secretType}</td>
                        <td>
                          {revealedPasswords[c.id] ? (
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                              <span style={{ fontFamily: 'monospace', color: '#ffcb42', fontSize: '0.9rem' }}>{revealedPasswords[c.id]}</span>
                              <button
                                onClick={() => {
                                  navigator.clipboard.writeText(revealedPasswords[c.id]);
                                  alert('Password copied');
                                }}
                                style={{ background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.15)', color: '#fff', padding: '0.2rem 0.5rem', borderRadius: '4px', cursor: 'pointer', fontSize: '0.7rem' }}
                              >
                                Copy
                              </button>
                            </div>
                          ) : (
                            <span style={{ opacity: 0.4, letterSpacing: '2px' }}>••••••••</span>
                          )}
                        </td>
                        <td>
                          <div style={{ display: 'flex', gap: '0.4rem' }}>
                            {isSuperAdmin && (
                              <button 
                                onClick={() => handleReveal(c)} 
                                style={{ background: 'transparent', border: '1px solid rgba(255,203,66,0.4)', color: '#ffcb42', cursor: 'pointer', padding: '0.3rem 0.6rem', borderRadius: '4px', fontSize: '0.78rem' }}
                              >
                                {revealedPasswords[c.id] ? 'Hide' : '👁 Reveal'}
                              </button>
                            )}
                            <button 
                              onClick={() => handleDeleteCredential(c.id)} 
                              style={{ background: 'transparent', border: '1px solid rgba(255,60,60,0.4)', color: '#ffcaca', cursor: 'pointer', padding: '0.3rem 0.6rem', borderRadius: '4px', fontSize: '0.78rem' }}
                            >
                              Delete
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>

            {/* Add Panel */}
            <div className="pam-card" style={{ padding: '2rem' }}>
              <h3>Add Credential</h3>
              <form onSubmit={handleAddCredential} style={{ display: 'flex', flexDirection: 'column', gap: '1rem', marginTop: '1.2rem' }}>
                <div>
                  <label style={{ fontSize: '0.78rem', opacity: 0.6, display: 'block', marginBottom: '0.3rem' }}>Username</label>
                  <input 
                    className="pam-input" 
                    placeholder="e.g. Administrator" 
                    value={credForm.username} 
                    onChange={e => setCredForm(f => ({ ...f, username: e.target.value }))}
                  />
                </div>
                <div>
                  <label style={{ fontSize: '0.78rem', opacity: 0.6, display: 'block', marginBottom: '0.3rem' }}>Password / Secret</label>
                  <input 
                    className="pam-input" 
                    type="password" 
                    placeholder="••••••••" 
                    value={credForm.password} 
                    onChange={e => setCredForm(f => ({ ...f, password: e.target.value }))}
                  />
                </div>
                <div>
                  <label style={{ fontSize: '0.78rem', opacity: 0.6, display: 'block', marginBottom: '0.3rem' }}>Type</label>
                  <select 
                    className="pam-select" 
                    value={credForm.secretType} 
                    onChange={e => setCredForm(f => ({ ...f, secretType: e.target.value }))}
                    style={{ color: '#000' }}
                  >
                    <option value="Password">Password</option>
                    <option value="SSH Key">SSH Key</option>
                  </select>
                </div>
                <button type="submit" disabled={addingCred} className="pam-button" style={{ marginTop: '0.5rem' }}>
                  {addingCred ? 'Adding...' : 'Add Account'}
                </button>
              </form>
            </div>
          </div>
        )}

        {/* DEVICE INFO TAB */}
        {activeTab === 'Device Info' && (
          <div className="pam-card" style={{ padding: '2rem' }}>
            <h3 style={{ margin: '0 0 1.5rem', borderBottom: '1px solid rgba(255,255,255,0.06)', paddingBottom: '0.50rem' }}>Network & System Metadata</h3>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.2rem', maxWidth: '600px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid rgba(255,255,255,0.04)', paddingBottom: '0.4rem' }}>
                <span style={{ opacity: 0.6 }}>Hostname:</span>
                <span style={{ fontWeight: 600 }}>{server.hostname}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid rgba(255,255,255,0.04)', paddingBottom: '0.4rem' }}>
                <span style={{ opacity: 0.6 }}>IP Address:</span>
                <span style={{ fontFamily: 'monospace' }}>{server.ipAddress}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid rgba(255,255,255,0.04)', paddingBottom: '0.4rem' }}>
                <span style={{ opacity: 0.6 }}>OS Platform:</span>
                <span>{server.osType}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid rgba(255,255,255,0.04)', paddingBottom: '0.4rem' }}>
                <span style={{ opacity: 0.6 }}>Remote Protocol:</span>
                <span>{server.remoteProtocol || 'RDP'}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid rgba(255,255,255,0.04)', paddingBottom: '0.4rem' }}>
                <span style={{ opacity: 0.6 }}>Environment:</span>
                <span>{server.environment || 'Production'}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid rgba(255,255,255,0.04)', paddingBottom: '0.4rem' }}>
                <span style={{ opacity: 0.6 }}>Location:</span>
                <span>{server.location || 'Default DC'}</span>
              </div>
            </div>
          </div>
        )}

        {/* LOGS TAB */}
        {activeTab === 'Logs' && isAdmin && (
          <div className="pam-card" style={{ padding: '2rem' }}>
            <h3 style={{ margin: '0 0 1rem' }}>Server Event History</h3>
            {logs.length === 0 ? (
              <p style={{ opacity: 0.6, padding: '1rem 0' }}>No logs found for this server hostname.</p>
            ) : (
              <table className="pam-table" style={{ margin: 0, background: 'transparent', boxShadow: 'none' }}>
                <thead>
                  <tr>
                    <th>Timestamp</th>
                    <th>Actor</th>
                    <th>Action</th>
                    <th>Result</th>
                    <th>Details</th>
                  </tr>
                </thead>
                <tbody>
                  {logs.map(l => (
                    <tr key={l.logId}>
                      <td style={{ fontSize: '0.8rem', opacity: 0.6 }}>{new Date(l.timestamp).toLocaleString()}</td>
                      <td style={{ fontWeight: 600 }}>{l.actor} ({l.actorRole})</td>
                      <td>
                        <span style={{
                          padding: '0.15rem 0.5rem', borderRadius: '4px', fontSize: '0.72rem',
                          background: l.actionType.includes('Reveal') ? 'rgba(255,203,66,0.12)' : 'rgba(79,172,254,0.12)',
                          color: l.actionType.includes('Reveal') ? '#ffcb42' : '#4facfe',
                        }}>
                          {l.actionType}
                        </span>
                      </td>
                      <td style={{ color: l.result === 'Success' ? '#a8ffca' : '#ffcaca' }}>{l.result}</td>
                      <td style={{ fontSize: '0.85rem', opacity: 0.8 }}>{l.details}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}

      </div>

      {/* Connection Wizard Modal */}
      {connectionState && (
        <div style={MODAL_BACKDROP} onClick={e => e.target === e.currentTarget && setConnectionState(null)}>
          <div style={MODAL_CARD}>
            <h2 style={{ margin: '0 0 0.5rem', color: '#4facfe' }}>🖥 Launch RDP Session</h2>
            
            {connectionState === 'loading' && (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1.2rem', padding: '1.5rem 0' }}>
                <div className="standard-loading-spinner" style={{ width: '36px', height: '36px', border: '3px solid rgba(255,255,255,0.1)', borderTopColor: '#4facfe', borderRadius: '50%', animation: 'spin 1s linear infinite' }} />
                <p style={{ opacity: 0.8, fontSize: '0.92rem', margin: 0 }}>Securing Remote Access Credentials...</p>
              </div>
            )}

            {connectionState === 'ready' && rdpData && (
              <div>
                <p style={{ opacity: 0.6, fontSize: '0.85rem', margin: '0 0 1.5rem' }}>
                  Connecting to <strong style={{ color: '#4facfe' }}>{rdpData.hostname}</strong> ({rdpData.ipAddress})
                </p>
                <div style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px', padding: '1rem', marginBottom: '1.2rem' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.4rem' }}>
                    <span style={{ opacity: 0.6, fontSize: '0.8rem' }}>Username</span>
                    <span style={{ fontFamily: 'monospace', fontWeight: 700 }}>{rdpData.username}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ opacity: 0.6, fontSize: '0.8rem' }}>Password</span>
                    <span style={{ fontFamily: 'monospace', letterSpacing: '3px', opacity: 0.5 }}>••••••••</span>
                  </div>
                </div>

                <div style={{ display: 'flex', gap: '0.8rem', justifyContent: 'flex-end', flexWrap: 'wrap' }}>
                  <button onClick={() => setConnectionState(null)} style={{ padding: '0.6rem 1.2rem', borderRadius: '8px', background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.15)', color: '#fff', cursor: 'pointer' }}>Close</button>
                  <button onClick={downloadRDP} className="pam-button" style={{ background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.2)' }}>⬇ Download .rdp</button>
                  <button onClick={() => {
                    setActiveSession({
                      hostname: rdpData.hostname,
                      ipAddress: rdpData.ipAddress,
                      username: rdpData.username,
                      password: rdpData.password,
                      token: rdpData.token || null,
                      validUntil: rdpData.validUntil || null,
                      ticketId: activeTicket?.id || null,
                      serverId: id || null,
                      userId: user?.userId || null,
                      rdpFile: rdpData.rdpFile || null,
                    });
                    setConnectionState(null);
                  }} className="pam-button">🔌 Connect in Browser</button>
                </div>
              </div>
            )}

            {connectionState === 'error' && (
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', background: 'rgba(239, 68, 68, 0.1)', border: '1px solid rgba(239, 68, 68, 0.2)', padding: '1rem', borderRadius: '8px', marginBottom: '1.5rem' }}>
                  <span style={{ fontSize: '1.5rem', color: '#ef4444' }}>⚠️</span>
                  <div>
                    <h4 style={{ margin: '0 0 0.2rem', color: '#f87171' }}>Access Gateway Refused Connection</h4>
                    <p style={{ margin: 0, fontSize: '0.8rem', opacity: 0.8, color: '#fca5a5', whiteSpace: 'pre-wrap' }}>{rdpConnectionError}</p>
                  </div>
                </div>
                <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                  <button onClick={() => setConnectionState(null)} className="pam-button" style={{ background: '#ef4444' }}>Close</button>
                </div>
              </div>
            )}

          </div>
        </div>
      )}

      {activeSession && (
        <BrowserRdpSession
          hostname={activeSession.hostname}
          ipAddress={activeSession.ipAddress}
          username={activeSession.username}
          password={activeSession.password}
          token={activeSession.token}
          validUntil={activeSession.validUntil}
          ticketId={activeSession.ticketId}
          serverId={activeSession.serverId}
          userId={activeSession.userId}
          rdpFile={activeSession.rdpFile}
          onClose={() => setActiveSession(null)}
        />
      )}
    </div>
  );
}
