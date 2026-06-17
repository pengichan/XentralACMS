import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../../context/AuthContext';

export default function MyAccessHistory() {
  const { user } = useAuth();
  const [sessions, setSessions] = useState([]);
  const [loading, setLoading] = useState(true);

  const fetchSessions = useCallback(async () => {
    if (!user?.userId) return;
    setLoading(true);
    try {
      const res = await fetch(`http://localhost:8080/api/sessions?userId=${user.userId}`);
      if (res.ok) {
        setSessions(await res.json() || []);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, [user?.userId]);

  useEffect(() => {
    fetchSessions();
  }, [fetchSessions]);

  return (
    <div className="pam-container">
      <h1 style={{ textShadow: '0 2px 10px rgba(0,0,0,0.5)' }}>📜 My Access History</h1>
      <p style={{ opacity: 0.7, marginBottom: '2rem' }}>
        View all RDP connection launches associated with your account.
      </p>

      <div className="pam-card" style={{ overflowX: 'auto' }}>
        {loading ? (
          <p style={{ padding: '2rem', opacity: 0.6 }}>Loading access history…</p>
        ) : sessions.length === 0 ? (
          <p style={{ padding: '2rem', opacity: 0.6 }}>You have no remote access connections recorded yet.</p>
        ) : (
          <table className="pam-table">
            <thead>
              <tr>
                <th>Server Hostname</th>
                <th>Access Protocol</th>
                <th>Source Client IP</th>
                <th>Launch Time</th>
              </tr>
            </thead>
            <tbody>
              {sessions.map(s => (
                <tr key={s.id}>
                  <td style={{ fontWeight: 'bold', color: 'var(--auth-btn-mid, #4facfe)' }}>
                    💻 {s.serverName}
                  </td>
                  <td>
                    <span style={{
                      padding: '0.2rem 0.6rem', borderRadius: '4px', background: 'rgba(79,172,254,0.12)',
                      color: '#4facfe', border: '1px solid rgba(79,172,254,0.3)', fontSize: '0.75rem', fontWeight: 600
                    }}>
                      {s.protocol}
                    </span>
                  </td>
                  <td style={{ fontFamily: 'monospace', fontSize: '0.85rem' }}>
                    {s.clientIp || 'Unknown'}
                  </td>
                  <td style={{ fontSize: '0.85rem', opacity: 0.8 }}>
                    {new Date(s.startTime).toLocaleString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
