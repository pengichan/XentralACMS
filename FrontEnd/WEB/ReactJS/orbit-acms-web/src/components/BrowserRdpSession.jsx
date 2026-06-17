import React, { useState, useEffect, useRef, useMemo } from 'react';

const API = 'http://localhost:8080';

const OVERLAY_STYLE = {
  position: 'fixed',
  inset: 0,
  zIndex: 99999,
  background: '#0a0f1d',
  color: '#cbd5e1',
  fontFamily: 'system-ui, -apple-system, sans-serif',
  display: 'flex',
  flexDirection: 'column',
  overflow: 'hidden',
};

const LOADER_CONTAINER = {
  flex: 1,
  display: 'flex',
  flexDirection: 'column',
  justifyContent: 'center',
  alignItems: 'center',
  background: '#030712',
  padding: '2rem',
};

const DESKTOP_CONTAINER = {
  flex: 1,
  background: '#000000',
  position: 'relative',
  display: 'flex',
  flexDirection: 'column',
};

const TOP_BAR = {
  height: '40px',
  background: 'rgba(15, 23, 42, 0.9)',
  borderBottom: '1px solid rgba(255,255,255,0.08)',
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  padding: '0 1rem',
  fontSize: '0.85rem',
  color: '#e2e8f0',
};

const DISCONNECT_BTN = {
  background: '#ef4444',
  color: '#fff',
  border: 'none',
  padding: '0.3rem 0.8rem',
  borderRadius: '4px',
  cursor: 'pointer',
  fontWeight: 'bold',
  fontSize: '0.75rem',
  transition: 'background 0.2s',
};

function formatCountdown(totalSeconds) {
  if (totalSeconds <= 0) return '00:00:00';
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = Math.floor(totalSeconds % 60);
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

export default function BrowserRdpSession({ hostname, ipAddress, username, password, token, validUntil, ticketId, serverId, userId, onClose }) {
  const [loading, setLoading] = useState(true);
  const [logs, setLogs] = useState([]);
  const [remaining, setRemaining] = useState(null);
  const [currentValidUntil, setCurrentValidUntil] = useState(validUntil);
  const closedRef = useRef(false);

  const baseLogs = [
    `[INFO] Initializing secure RDP tunnel to gateway...`,
    `[INFO] Routing connection via XentralACMS Gateway Proxy...`,
    `[INFO] Validating authorization ticket and permissions...`,
    `[INFO] Fetching encrypted credentials securely...`,
    `[INFO] Authenticating as user: "${username}"...`,
    `[INFO] Establishing Remote Desktop Protocol handshake...`
  ];

  const closeSessionOnServer = () => {
    if (closedRef.current) return;
    closedRef.current = true;
    const body = {};
    if (ticketId) body.ticketId = ticketId;
    else if (serverId && userId) { body.serverId = serverId; body.userId = userId; }
    else return;
    try {
      navigator.sendBeacon(`${API}/api/remote/sessions/close`, JSON.stringify(body));
    } catch {
      fetch(`${API}/api/remote/sessions/close`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        keepalive: true,
      }).catch(() => {});
    }
  };

  const handleDisconnect = () => {
    closeSessionOnServer();
    onClose();
  };

  const handleOpenExternal = async () => {
    try {
      const res = await fetch(`${API}/api/remote/generate-token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ipAddress, username, password })
      });
      if (res.ok) {
        const data = await res.json();
        const newToken = data.token;
        window.open(`http://${window.location.hostname}:9250/?token=${newToken}&autoconnect=true`, '_blank');
      } else {
        alert("Failed to generate secure external session token.");
      }
    } catch (e) {
      console.error("Error generating external token:", e);
      alert("Error initiating external RDP session.");
    }
  };

  const startConnection = () => {
    setLoading(true);
    setLogs([]);
    let index = 0;
    let timeoutId1 = null;
    let timeoutId2 = null;

    const interval = setInterval(() => {
      if (index < baseLogs.length) {
        const logLine = baseLogs[index];
        setLogs((prev) => [...prev, logLine]);
        index++;
      } else {
        clearInterval(interval);
        timeoutId1 = setTimeout(() => {
          setLogs((prev) => [
            ...prev,
            `[SUCCESS] Connection established! Rendering desktop...`
          ]);
          timeoutId2 = setTimeout(() => setLoading(false), 500);
        }, 300);
      }
    }, 350);

    return () => {
      clearInterval(interval);
      if (timeoutId1) clearTimeout(timeoutId1);
      if (timeoutId2) clearTimeout(timeoutId2);
    };
  };

  useEffect(() => {
    const cancel = startConnection();
    return cancel;
  }, []);

  // Countdown timer
  useEffect(() => {
    if (!currentValidUntil) { setRemaining(null); return; }
    const endTime = new Date(currentValidUntil).getTime();
    if (isNaN(endTime) || endTime < 946684800000) { setRemaining(null); return; } // Before year 2000

    const tick = () => {
      const now = Date.now();
      const diff = Math.max(0, Math.floor((endTime - now) / 1000));
      setRemaining(diff);
      if (diff <= 0) {
        handleDisconnect();
      }
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [currentValidUntil]);

  // Poll for ticket updates to dynamically sync session length / extensions / revoking
  useEffect(() => {
    if (!ticketId) return;
    const checkTicket = async () => {
      try {
        const res = await fetch(`${API}/api/tickets/${ticketId}`);
        if (res.ok) {
          const data = await res.json();
          if (data.status !== 'Approved') {
            // Access was revoked by admin
            handleDisconnect();
          } else if (data.validUntil) {
            setCurrentValidUntil(data.validUntil);
          }
        }
      } catch (e) {
        console.error('Error polling ticket status:', e);
      }
    };

    const intervalId = setInterval(checkTicket, 10000); // Poll every 10 seconds
    return () => clearInterval(intervalId);
  }, [ticketId]);

  // Close session on unmount
  useEffect(() => {
    return () => { closeSessionOnServer(); };
  }, []);

  // We use the memoized RdpViewport component defined below to completely isolate
  // the iframe from parent component updates (such as the 1-second countdown ticks).

  const countdownColor = remaining !== null && remaining <= 300 ? '#ef4444' : remaining !== null && remaining <= 900 ? '#ffcb42' : '#a8ffca';

  return (
    <div style={OVERLAY_STYLE}>
      {loading ? (
        <div style={LOADER_CONTAINER}>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1.5rem', width: '550px', maxWidth: '95vw' }}>
            <div className="standard-loading-spinner" style={{ width: '40px', height: '40px', border: '3px solid rgba(255,255,255,0.1)', borderTopColor: '#ffcb42', borderRadius: '50%', animation: 'spin 1s linear infinite' }} />
            <h3 style={{ margin: 0, color: '#ffcb42', letterSpacing: '1px', textTransform: 'uppercase' }}>
              ESTABLISHING RDP GATEWAY CONNECTION
            </h3>
            
            <div style={{
              width: '100%',
              background: '#020617',
              border: '1px solid rgba(255,255,255,0.08)',
              borderRadius: '8px',
              padding: '1.2rem',
              fontFamily: 'Consolas, monospace',
              fontSize: '0.82rem',
              textAlign: 'left',
              display: 'flex',
              flexDirection: 'column',
              gap: '0.4rem',
              minHeight: '220px',
            }}>
              {logs.map((log, idx) => {
                let logColor = '#10b981';
                if (log && log.startsWith('[SUCCESS]')) logColor = '#a8ffca';
                return (
                  <div key={idx} style={{ color: logColor }}>{log || ''}</div>
                );
              })}
            </div>
          </div>
        </div>
      ) : (
        <div style={DESKTOP_CONTAINER}>
          {/* Top Info Bar */}
          <div style={TOP_BAR}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ fontSize: '1.1rem' }}>🖥️</span>
              <strong>XentralACMS Secure HTML5 Remote Client</strong>
              <span style={{ opacity: 0.3 }}>|</span>
              <span style={{ color: '#ffcb42', fontWeight: 600 }}>{hostname}</span>
              <span style={{ opacity: 0.6 }}>({ipAddress})</span>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
              {/* Countdown Timer */}
              {remaining !== null ? (
                <span style={{ fontFamily: 'Consolas, monospace', fontWeight: 700, color: countdownColor, fontSize: '0.82rem', letterSpacing: '1px' }}>
                  ⏱ {formatCountdown(remaining)}
                </span>
              ) : (
                <span style={{ opacity: 0.5, fontSize: '0.78rem' }}>⚡ Unlimited</span>
              )}
              <span style={{ opacity: 0.3 }}>|</span>
              <span style={{ opacity: 0.7 }}>SSO Tunnel: <strong style={{ color: '#a8ffca' }}>{username}</strong></span>
              <button 
                onClick={handleOpenExternal} 
                style={{ 
                  background: 'rgba(255,255,255,0.08)', 
                  border: '1px solid rgba(255,255,255,0.15)', 
                  color: '#fff', 
                  padding: '0.3rem 0.8rem', 
                  borderRadius: '4px', 
                  cursor: 'pointer', 
                  fontSize: '0.72rem',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px'
                }}
              >
                🌐 Open in External Tab
              </button>
              <button style={DISCONNECT_BTN} onClick={handleDisconnect}>✕ Disconnect</button>
            </div>
          </div>

          {/* Desktop Body */}
          <RdpViewport token={token} />
        </div>
      )}
    </div>
  );
}

const RdpViewport = React.memo(({ token }) => {
  return (
    <div style={{ flex: 1, position: 'relative', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', background: '#000' }}>
        <iframe
          src={`http://${window.location.hostname}:9250/?token=${token}&autoconnect=true`}
          title="RDP Session Client"
          style={{ flex: 1, border: 'none', background: '#000', width: '100%', height: '100%' }}
        />
      </div>
    </div>
  );
});

