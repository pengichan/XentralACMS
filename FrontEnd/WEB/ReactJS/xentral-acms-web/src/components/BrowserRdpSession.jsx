import React, { useState, useEffect, useRef } from 'react';

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
  zIndex: 50,
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

export default function BrowserRdpSession({ hostname, ipAddress, username, password, token, validUntil, ticketId, serverId, userId, rdpFile, onClose }) {
  const [loading, setLoading] = useState(true);
  const [logs, setLogs] = useState([]);
  const [failed, setFailed] = useState(false);
  const [failReason, setFailReason] = useState('');
  const [remaining, setRemaining] = useState(null);
  const [currentValidUntil, setCurrentValidUntil] = useState(validUntil);
  const closedRef = useRef(false);
  const connectTimeoutRef = useRef(null);

  // Clipboard states
  const [remoteClipboard, setRemoteClipboard] = useState('');
  const [successMsg, setSuccessMsg] = useState('');
  const [copiedId, setCopiedId] = useState(''); // File ID or custom ID for visual feedback
  const [apiHost, setApiHost] = useState('');
  const [hostIps, setHostIps] = useState([]);
  const [selectedIp, setSelectedIp] = useState('');
  const lastSyncedClipboardRef = useRef('');

  const baseLogs = [
    `[INFO] Initializing secure RDP tunnel to gateway...`,
    `[INFO] Routing connection via XentralACMS Gateway Proxy...`,
    `[INFO] Validating authorization ticket and permissions...`,
    `[INFO] Fetching encrypted credentials securely...`,
    `[INFO] Authenticating as user: "${username}"...`,
    `[INFO] Establishing Remote Desktop Protocol handshake...`
  ];

  const getBackendBaseUrl = () => {
    if (API.includes('localhost') || API.includes('127.0.0.1')) {
      return `http://${window.location.hostname}:8080`;
    }
    return API;
  };

  const showToast = (msg) => {
    setSuccessMsg(msg);
    setTimeout(() => setSuccessMsg(''), 3000);
  };

  // File transfer methods removed per user request

  const sendClipboardToRemote = () => {
    if (!localClipboard.trim()) return;
    const iframe = document.getElementById('rdp-iframe');
    if (iframe && iframe.contentWindow) {
      iframe.contentWindow.postMessage({ type: 'send-clipboard', content: localClipboard }, '*');
      showToast('Clipboard synchronized to Remote PC!');
    }
  };

  const simulateTyping = () => {
    if (!localClipboard) return;
    const iframe = document.getElementById('rdp-iframe');
    if (iframe && iframe.contentWindow) {
      iframe.contentWindow.postMessage({ type: 'type-text', content: localClipboard }, '*');
      showToast('Typing keystrokes inside Remote PC...');
    }
  };

  const copyToLocalClipboard = (text) => {
    if (!text) return;
    navigator.clipboard.writeText(text)
      .then(() => {
        showToast('Copied to local clipboard!');
      })
      .catch(() => {
        alert('Failed to copy to clipboard. Please copy it manually.');
      });
  };

  const copyText = (text, id) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(''), 2000);
  };

  const closeSessionOnServer = () => {
    if (closedRef.current) return;
    closedRef.current = true;
    const body = {};
    if (ticketId) body.ticketId = ticketId;
    else if (serverId && userId) { body.serverId = serverId; body.userId = userId; }
    else return;
    try {
      navigator.sendBeacon(`${API}/api/remote/sessions/close`, JSON.stringify(body));
    } catch (e) {
      fetch(`${API}/api/remote/sessions/close`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        keepalive: true,
      }).catch(() => {});
    }
  };

  const handleDisconnect = () => {
    if (connectTimeoutRef.current) {
      clearTimeout(connectTimeoutRef.current);
    }
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

  const downloadRDP = () => {
    if (!rdpFile) return;
    const blob = new Blob([rdpFile], { type: 'application/x-rdp' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${hostname || 'server'}.rdp`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    if (password) {
      navigator.clipboard.writeText(password);
    }
  };

  const startConnection = () => {
    setLoading(true);
    setLogs([]);
    setFailed(false);
    setFailReason('');
    let index = 0;

    const interval = setInterval(() => {
      if (index < baseLogs.length) {
        const logLine = baseLogs[index];
        setLogs((prev) => [...prev, logLine]);
        index++;
      } else {
        clearInterval(interval);
      }
    }, 250);

    return () => {
      clearInterval(interval);
    };
  };

  useEffect(() => {
    setApiHost(getBackendBaseUrl());
    
    fetch(`${API}/api/system/host-ips`)
      .then(res => res.json())
      .then(data => {
        if (Array.isArray(data)) {
          setHostIps(data);
          const nonLocal = data.find(ip => ip !== 'localhost' && ip !== '127.0.0.1');
          setSelectedIp(nonLocal || data[0] || 'localhost');
        }
      })
      .catch(err => console.error("Failed to fetch host IPs:", err));

    const cancel = startConnection();
    return () => {
      cancel();
      if (connectTimeoutRef.current) clearTimeout(connectTimeoutRef.current);
    };
  }, []);

  // Listen to postMessage events from index.html (iframe)
  useEffect(() => {
    const handleMessage = (e) => {
      if (!e.data || !e.data.type) return;

      if (e.data.type === 'rdp-connect') {
        setLogs((prev) => [...prev, '[INFO] Handshake complete. Verifying credentials and rendering session...']);
        
        // Start a fallback timer just in case no bitmap event is received (e.g. static black screen)
        if (connectTimeoutRef.current) clearTimeout(connectTimeoutRef.current);
        connectTimeoutRef.current = setTimeout(() => {
          setLogs((prev) => {
            if (!prev.some(l => l.includes('Desktop session active'))) {
              return [...prev, '[SUCCESS] Session connected. Showing viewport.'];
            }
            return prev;
          });
          setLoading(false);
        }, 3000);

      } else if (e.data.type === 'rdp-bitmap') {
        if (connectTimeoutRef.current) {
          clearTimeout(connectTimeoutRef.current);
          connectTimeoutRef.current = null;
        }
        setLogs((prev) => {
          if (!prev.some(l => l.includes('Desktop session active'))) {
            return [...prev, '[SUCCESS] Desktop session active. Rendering viewport...'];
          }
          return prev;
        });
        setTimeout(() => setLoading(false), 200);

      } else if (e.data.type === 'rdp-clipboard') {
        const contentText = e.data.content || '';
        
        setRemoteClipboard(contentText);
        lastSyncedClipboardRef.current = contentText; // Prevent echo loop
        
        // Auto-copy text into local clipboard
        if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(contentText)
            .then(() => {
              showToast('Remote clipboard auto-synced locally!');
            })
            .catch(() => {});
        }

      } else if (e.data.type === 'rdp-error') {
        if (connectTimeoutRef.current) {
          clearTimeout(connectTimeoutRef.current);
          connectTimeoutRef.current = null;
        }
        setFailed(true);
        const rawMsg = e.data.message || 'Connection error';
        let translated = rawMsg;
        const errMsg = String(rawMsg).toLowerCase();
        if (errMsg.indexOf('econnrefused') !== -1 || errMsg.indexOf('etimedout') !== -1 || errMsg.indexOf('timeout') !== -1) {
          translated = "Target server is offline or unreachable. Verify the host is online and Remote Desktop is enabled.";
        } else if (errMsg.indexOf('logon') !== -1 || errMsg.indexOf('access denied') !== -1 || errMsg.indexOf('authentication') !== -1 || errMsg.indexOf('credentials') !== -1 || errMsg.indexOf('security') !== -1) {
          translated = "Authentication failed (Access Denied). Verify that credentials are correct and authorized for RDP.";
        }
        setFailReason(translated);
        setLogs((prev) => {
          if (prev.some(l => l.includes('[FAILURE]'))) return prev;
          return [...prev, `[FAILURE] ${translated}`];
        });
        setLoading(true);

      } else if (e.data.type === 'rdp-close') {
        if (connectTimeoutRef.current) {
          clearTimeout(connectTimeoutRef.current);
          connectTimeoutRef.current = null;
        }
        setLogs((prev) => {
          if (!prev.includes('[INFO] Remote connection closed.')) {
            return [...prev, '[INFO] Remote connection closed.'];
          }
          return prev;
        });
        setLogs((prev) => {
          if (!prev.some(l => l.includes('[FAILURE]'))) {
            setFailed(true);
            setFailReason("Session disconnected or terminated. Another user may have connected, or the session has ended.");
            setLoading(true);
            return [...prev, '[FAILURE] Session disconnected or terminated. (Another user may have connected, or the session has ended.)'];
          }
          return prev;
        });
      }
    };

    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
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

  const syncLocalClipboardToRemote = async () => {
    try {
      if (navigator.clipboard && navigator.clipboard.readText) {
        const text = await navigator.clipboard.readText();
        if (text && text !== lastSyncedClipboardRef.current) {
          lastSyncedClipboardRef.current = text;
          const iframe = document.getElementById('rdp-iframe');
          if (iframe && iframe.contentWindow) {
            iframe.contentWindow.postMessage({ type: 'send-clipboard', content: text }, '*');
          }
        }
      }
    } catch (e) {
      // Permission or focus error - ignore safely
    }
  };

  // Auto-sync local clipboard to remote on activity/focus
  useEffect(() => {
    const handleActivity = () => {
      syncLocalClipboardToRemote();
    };

    window.addEventListener('focus', handleActivity);
    document.addEventListener('click', handleActivity);
    
    const timer = setInterval(() => {
      if (document.hasFocus()) {
        syncLocalClipboardToRemote();
      }
    }, 2000);

    return () => {
      window.removeEventListener('focus', handleActivity);
      document.removeEventListener('click', handleActivity);
      clearInterval(timer);
    };
  }, []);

  // Remote control methods for file box automated commands removed

  const countdownColor = remaining !== null && remaining <= 300 ? '#ef4444' : remaining !== null && remaining <= 900 ? '#ffcb42' : '#a8ffca';

  // Computed Commands
  const effectiveApiHost = apiHost || getBackendBaseUrl();

  const formatBytes = (bytes) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  return (
    <div style={OVERLAY_STYLE}>
      {/* Desktop Container is always rendered in background so RDP iframe connects immediately */}
      <div style={DESKTOP_CONTAINER}>
        {/* Top Info Bar */}
        <div style={TOP_BAR}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ fontSize: '1.1rem' }}>🖥️</span>
            <strong>XentralACMS Secure Remote Desktop</strong>
            <span style={{ opacity: 0.3 }}>|</span>
            <span style={{ color: '#ffcb42', fontWeight: 600 }}>{hostname}</span>
            <span style={{ opacity: 0.6 }}>({ipAddress})</span>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            {/* Countdown Timer */}
            {remaining !== null ? (
              <span style={{ fontFamily: 'Consolas, monospace', fontWeight: 700, color: countdownColor, fontSize: '0.82rem', letterSpacing: '1px' }}>
                ⏱ {formatCountdown(remaining)}
              </span>
            ) : (
              <span style={{ opacity: 0.5, fontSize: '0.78rem' }}>⚡ Unlimited</span>
            )}
            
            <span style={{ opacity: 0.3 }}>|</span>
            <span style={{ opacity: 0.7 }}>Tunnel User: <strong style={{ color: '#a8ffca' }}>{username}</strong></span>
            
            {rdpFile && (
              <button 
                onClick={downloadRDP} 
                style={{ 
                  background: 'rgba(79, 172, 254, 0.12)', 
                  border: '1px solid rgba(79, 172, 254, 0.3)', 
                  color: '#4facfe', 
                  padding: '0.35rem 0.8rem', 
                  borderRadius: '6px', 
                  cursor: 'pointer', 
                  fontSize: '0.75rem',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px',
                  fontWeight: 'bold'
                }}
              >
                ⬇ Download Native RDP
              </button>
            )}

            <button 
              onClick={handleOpenExternal} 
              style={{ 
                background: 'rgba(255,255,255,0.06)', 
                border: '1px solid rgba(255,255,255,0.12)', 
                color: '#fff', 
                padding: '0.35rem 0.8rem', 
                borderRadius: '6px', 
                cursor: 'pointer', 
                fontSize: '0.75rem',
                display: 'flex',
                alignItems: 'center',
                gap: '4px'
              }}
            >
              🌐 Open External Tab
            </button>

            {/* Sidebar toggle button removed */}

            <button style={DISCONNECT_BTN} onClick={handleDisconnect}>✕ Disconnect</button>
          </div>
        </div>

        {/* Floating Success Message/Toast */}
        {successMsg && (
          <div style={{
            position: 'absolute',
            top: '55px',
            right: '20px',
            background: 'rgba(16, 185, 129, 0.95)',
            color: '#fff',
            padding: '0.6rem 1.2rem',
            borderRadius: '6px',
            fontSize: '0.82rem',
            fontWeight: 600,
            zIndex: 99999,
            boxShadow: '0 4px 12px rgba(0,0,0,0.5)',
            pointerEvents: 'none',
            animation: 'fadeIn 0.2s ease-out'
          }}>
            ✓ {successMsg}
          </div>
        )}

        {/* Desktop Body Split-Screen */}
        <div style={{ display: 'flex', flex: 1, overflow: 'hidden', position: 'relative' }}>
          <RdpViewport token={token} />
        </div>
      </div>

      {/* Loading & Failure Overlay */}
      {loading && (
        <div style={{
          position: 'absolute',
          inset: 0,
          zIndex: 100000,
          background: '#030712',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          alignItems: 'center',
          padding: '2rem'
        }}>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1.5rem', width: '550px', maxWidth: '95vw' }}>
            {failed ? (
              <div style={{ fontSize: '2.5rem' }}>❌</div>
            ) : (
              <div className="standard-loading-spinner" style={{ width: '40px', height: '40px', border: '3px solid rgba(255,255,255,0.1)', borderTopColor: '#ffcb42', borderRadius: '50%', animation: 'spin 1s linear infinite' }} />
            )}
            
            <h3 style={{ margin: 0, color: failed ? '#ef4444' : '#ffcb42', letterSpacing: '1px', textTransform: 'uppercase' }}>
              {failed ? (failReason.toLowerCase().includes('disconnected') || failReason.toLowerCase().includes('terminated') ? 'RDP SESSION TERMINATED' : 'RDP CONNECTION FAILED') : 'ESTABLISHING RDP GATEWAY CONNECTION'}
            </h3>
            
            <div style={{
              width: '100%',
              background: '#020617',
              border: failed ? '1px solid rgba(239, 68, 68, 0.3)' : '1px solid rgba(255,255,255,0.08)',
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
                if (log && log.startsWith('[FAILURE]')) logColor = '#f87171';
                return (
                  <div key={idx} style={{ color: logColor }}>{log || ''}</div>
                );
              })}
            </div>

            {failed && (
              <button 
                onClick={handleDisconnect} 
                style={{
                  background: '#ef4444',
                  color: '#fff',
                  border: 'none',
                  padding: '0.6rem 2.2rem',
                  borderRadius: '6px',
                  cursor: 'pointer',
                  fontWeight: 'bold',
                  fontSize: '0.85rem',
                  boxShadow: '0 4px 12px rgba(239, 68, 68, 0.45)',
                  transition: 'background 0.2s',
                }}
              >
                Close Viewport
              </button>
            )}
          </div>
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
          id="rdp-iframe"
          src={`http://${window.location.hostname}:9250/?token=${token}&autoconnect=true`}
          title="RDP Session Client"
          allow="clipboard-read; clipboard-write"
          style={{ flex: 1, border: 'none', background: '#000', width: '100%', height: '100%' }}
        />
      </div>
    </div>
  );
});
