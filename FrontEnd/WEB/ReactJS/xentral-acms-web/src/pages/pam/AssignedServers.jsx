import React, { useState, useEffect, useCallback } from 'react';
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
  borderRadius: '16px', padding: '2rem', width: '400px', maxWidth: '95vw',
};

export default function AssignedServers() {
  const { user, isAdmin } = useAuth();
  const [servers, setServers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Connection flow states
  const [selectedServer, setSelectedServer] = useState(null);
  const [connectionState, setConnectionState] = useState(null); // 'loading' | 'select_credential' | 'ready' | 'error' | null
  const [rdpData, setRdpData] = useState(null);
  const [serverCredentials, setServerCredentials] = useState([]);
  const [selectedCred, setSelectedCred] = useState(null);
  const [rdpConnectionError, setRdpConnectionError] = useState(null);
  const [activeSession, setActiveSession] = useState(null);

  const fetchAssignedServers = useCallback(async () => {
    if (!user?.userId) return;
    setLoading(true);
    setError(null);
    try {
      const endpoint = isAdmin 
        ? `${API}/api/servers` 
        : `${API}/api/assigned-servers?userId=${encodeURIComponent(user.userId)}`;
      const res = await fetch(endpoint);
      if (!res.ok) {
        throw new Error(`Failed to load servers: ${res.statusText} (${res.status})`);
      }
      setServers(await res.json() || []);
    } catch (e) {
      console.error(e);
      setError(e.message || 'Failed to fetch servers');
    } finally {
      setLoading(false);
    }
  }, [user?.userId, isAdmin]);

  useEffect(() => {
    fetchAssignedServers();
  }, [fetchAssignedServers]);

  useEffect(() => {
    const handleEventsUpdate = () => {
      fetchAssignedServers();
    };
    window.addEventListener('xentral_events_update', handleEventsUpdate);
    return () => {
      window.removeEventListener('xentral_events_update', handleEventsUpdate);
    };
  }, [fetchAssignedServers]);

  const handleLaunchRDP = async (server) => {
    setSelectedServer(server);
    setConnectionState('loading');
    setRdpConnectionError(null);
    setServerCredentials([]);
    setSelectedCred(null);

    if (isAdmin) {
      try {
        const res = await fetch(`${API}/api/credentials/${server.id}`);
        if (!res.ok) throw new Error('Failed to load credentials for this server.');
        const creds = await res.json() || [];
        setServerCredentials(creds);

        if (creds.length === 0) {
          throw new Error('No credentials found for this server. Please configure credentials in Server Details first.');
        } else if (creds.length === 1) {
          await handleFetchAdminAccess(server, creds[0]);
        } else {
          setConnectionState('select_credential');
        }
      } catch (e) {
        setRdpConnectionError(e.message);
        setConnectionState('error');
      }
    } else {
      try {
        const res = await fetch(`${API}/api/remote/${server.ticketId}`);
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
    }
  };

  const handleFetchAdminAccess = async (server, cred) => {
    setConnectionState('loading');
    try {
      const uId = user.id || user.userId;
      const res = await fetch(`${API}/api/remote-admin/connect?serverId=${server.id}&credentialId=${cred.id}&userId=${uId}`);
      if (!res.ok) {
        const errMsg = await res.text();
        throw new Error(errMsg || 'Admin access connection failed.');
      }
      const data = await res.json();
      setRdpData(data);
      setSelectedCred(cred);
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

  return (
    <div className="pam-container">
      <h1 style={{ textShadow: '0 2px 10px rgba(0,0,0,0.5)' }}>🔑 {isAdmin ? 'Server Direct Access' : 'Assigned Servers'}</h1>
      <p style={{ opacity: 0.7, marginBottom: '2rem' }}>
        {isAdmin 
          ? 'Manage and connect directly to any active server with secure credentials.'
          : 'Servers you currently have active approved tickets to connect to.'
        }
      </p>

      {error && (
        <div style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.25)', padding: '1rem 1.5rem', borderRadius: '10px', display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '2rem' }}>
          <span style={{ color: '#ef4444', fontSize: '1.2rem' }}>⚠️</span>
          <div style={{ flex: 1 }}>
            <span style={{ fontWeight: 600 }}>Error loading servers:</span> {error}
          </div>
          <button onClick={fetchAssignedServers} className="pam-button" style={{ padding: '0.3rem 0.8rem', fontSize: '0.8rem' }}>Retry</button>
        </div>
      )}

      {loading ? (
        <p style={{ opacity: 0.6 }}>Loading assigned servers…</p>
      ) : servers.length === 0 ? (
        <div className="pam-card" style={{ padding: '2rem', textAlign: 'center' }}>
          <p style={{ opacity: 0.7, margin: 0 }}>
            {isAdmin 
              ? 'No servers registered in the system.' 
              : 'You do not have any active approved tickets for server access.'
            }
          </p>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '1.5rem' }}>
          {servers.map(s => (
            <div key={s.id} className="pam-card" style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', minHeight: '180px' }}>
              <div>
                <h3 style={{ margin: '0 0 0.5rem', color: '#ffcb42' }}>💻 {s.hostname}</h3>
                <div style={{ fontSize: '0.85rem', opacity: 0.8, fontFamily: 'monospace', marginBottom: '0.50rem' }}>
                  {s.ipAddress}
                </div>
                <div style={{ fontSize: '0.82rem', opacity: 0.6, fontStyle: 'italic', marginBottom: '0.75rem' }}>
                  {s.description || 'No description provided'}
                </div>
              </div>
              <div>
                <div style={{ fontSize: '0.72rem', opacity: 0.5, borderTop: '1px solid rgba(255,255,255,0.06)', paddingTop: '0.50rem', marginBottom: '0.75rem' }}>
                  {s.validUntil ? (
                    <>Approved until: <strong style={{ color: '#a8ffca' }}>{new Date(s.validUntil).toLocaleString()}</strong></>
                  ) : (
                    <><span style={{ color: '#a8ffca' }}>⚡ Direct Admin Access</span></>
                  )}
                </div>
                <button onClick={() => handleLaunchRDP(s)} className="pam-button" style={{ width: '100%', fontSize: '0.82rem' }}>
                  🔌 Connect (RDP)
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

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

            {connectionState === 'select_credential' && (
              <div>
                <p style={{ opacity: 0.7, fontSize: '0.88rem', marginBottom: '1.2rem' }}>
                  Multiple credentials available for <strong style={{ color: '#4facfe' }}>{selectedServer?.hostname}</strong>. Choose a login account:
                </p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem', marginBottom: '1.5rem' }}>
                  {serverCredentials.map(c => (
                    <button
                      key={c.id}
                      onClick={() => handleFetchAdminAccess(selectedServer, c)}
                      className="pam-button"
                      style={{
                        textAlign: 'left',
                        padding: '0.8rem 1.2rem',
                        background: 'rgba(255,255,255,0.04)',
                        border: '1px solid rgba(255,255,255,0.1)',
                        borderRadius: '8px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        cursor: 'pointer',
                        color: '#fff',
                        fontWeight: 'normal',
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <span style={{ fontSize: '1.1rem' }}>👤</span>
                        <div>
                          <div style={{ fontWeight: 600, fontSize: '0.88rem' }}>{c.username}</div>
                          <div style={{ fontSize: '0.72rem', opacity: 0.5 }}>{c.secretType}</div>
                        </div>
                      </div>
                      <span style={{ color: '#4facfe', fontSize: '0.82rem' }}>Connect →</span>
                    </button>
                  ))}
                </div>
                <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                  <button onClick={() => setConnectionState(null)} style={{ padding: '0.6rem 1.2rem', borderRadius: '8px', background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.15)', color: '#fff', cursor: 'pointer' }}>Cancel</button>
                </div>
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
                      ticketId: selectedServer?.ticketId || null,
                      serverId: selectedServer?.id || null,
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
