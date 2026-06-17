import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../../context/AuthContext';

const API = 'http://localhost:8080';

const SEVERITY_STYLE = {
  Info:     { bg: 'rgba(79,172,254,0.15)',  color: '#4facfe' },
  Warning:  { bg: 'rgba(255,203,66,0.15)', color: '#ffcb42' },
  Critical: { bg: 'rgba(255,60,60,0.18)',  color: '#ffcaca' },
};

const RESULT_STYLE = {
  Success: { bg: 'rgba(0,255,0,0.12)',   color: '#a8ffca' },
  Failure: { bg: 'rgba(255,60,60,0.12)', color: '#ffcaca' },
};

export default function AuditLogs() {
  const { user, isSuperAdmin } = useAuth();
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterAction, setFilterAction] = useState('');
  const [filterSeverity, setFilterSeverity] = useState('');
  const [filterResult, setFilterResult] = useState('');
  const [filterServer, setFilterServer] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  const fetchLogs = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API}/api/audit-logs`);
      if (res.ok) setLogs(await res.json() || []);
    } catch (e) {
      console.error('Failed to fetch audit logs', e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchLogs(); }, [fetchLogs]);



  // Unique action types and server names for filter dropdowns
  const actionTypes = [...new Set(logs.map(l => l.actionType))].sort();
  const serverNames = [...new Set(logs.map(l => l.serverName).filter(Boolean))].sort();

  const filtered = logs.filter(l => {
    const matchSearch = search === '' ||
      l.actor?.toLowerCase().includes(search.toLowerCase()) ||
      l.actionType?.toLowerCase().includes(search.toLowerCase()) ||
      l.targetName?.toLowerCase().includes(search.toLowerCase()) ||
      l.details?.toLowerCase().includes(search.toLowerCase());
    const matchAction = filterAction === '' || l.actionType === filterAction;
    const matchSeverity = filterSeverity === '' || l.severity === filterSeverity;
    const matchResult = filterResult === '' || l.result === filterResult;
    const matchServer = filterServer === '' || l.serverName === filterServer;

    let matchDate = true;
    if (startDate || endDate) {
      const logDate = new Date(l.timestamp);
      if (startDate) {
        const start = new Date(startDate);
        start.setHours(0, 0, 0, 0);
        if (logDate < start) matchDate = false;
      }
      if (endDate) {
        const end = new Date(endDate);
        end.setHours(23, 59, 59, 999);
        if (logDate > end) matchDate = false;
      }
    }

    return matchSearch && matchAction && matchSeverity && matchResult && matchServer && matchDate;
  });

  return (
    <div className="pam-container">
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1.5rem' }}>
        <div>
          <h1 style={{ margin: 0, textShadow: '0 2px 10px rgba(0,0,0,0.5)' }}>System Audit Logs</h1>
          <p style={{ margin: '0.3rem 0 0', opacity: 0.6, fontSize: '0.85rem' }}>
            {filtered.length} of {logs.length} log entries shown
          </p>
        </div>

        <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
          <button onClick={fetchLogs} style={{
            padding: '0.55rem 1rem', borderRadius: '8px', cursor: 'pointer',
            background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.15)',
            color: '#fff', fontSize: '0.85rem',
          }}>
            ↻ Refresh
          </button>
        </div>
      </div>

      {/* Filters */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '0.8rem', marginBottom: '1.5rem' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
          <label style={{ fontSize: '0.75rem', opacity: 0.6, fontWeight: 600 }}>Search Text</label>
          <input
            className="pam-input"
            placeholder="Search actor, target, details…"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
          <label style={{ fontSize: '0.75rem', opacity: 0.6, fontWeight: 600 }}>Action Type</label>
          <select
            className="pam-select"
            value={filterAction}
            onChange={e => setFilterAction(e.target.value)}
            style={{ color: '#000' }}
          >
            <option value="">All Actions</option>
            {actionTypes.map(a => <option key={a} value={a}>{a}</option>)}
          </select>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
          <label style={{ fontSize: '0.75rem', opacity: 0.6, fontWeight: 600 }}>Severity</label>
          <select
            className="pam-select"
            value={filterSeverity}
            onChange={e => setFilterSeverity(e.target.value)}
            style={{ color: '#000' }}
          >
            <option value="">All Severities</option>
            <option value="Info">Info</option>
            <option value="Warning">Warning</option>
            <option value="Critical">Critical</option>
          </select>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
          <label style={{ fontSize: '0.75rem', opacity: 0.6, fontWeight: 600 }}>Result</label>
          <select
            className="pam-select"
            value={filterResult}
            onChange={e => setFilterResult(e.target.value)}
            style={{ color: '#000' }}
          >
            <option value="">All Results</option>
            <option value="Success">Success</option>
            <option value="Failure">Failure</option>
          </select>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
          <label style={{ fontSize: '0.75rem', opacity: 0.6, fontWeight: 600 }}>Server</label>
          <select
            className="pam-select"
            value={filterServer}
            onChange={e => setFilterServer(e.target.value)}
            style={{ color: '#000' }}
          >
            <option value="">All Servers</option>
            {serverNames.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
          <label style={{ fontSize: '0.75rem', opacity: 0.6, fontWeight: 600 }}>Start Date</label>
          <input
            className="pam-input"
            type="date"
            value={startDate}
            onChange={e => setStartDate(e.target.value)}
          />
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
          <label style={{ fontSize: '0.75rem', opacity: 0.6, fontWeight: 600 }}>End Date</label>
          <input
            className="pam-input"
            type="date"
            value={endDate}
            onChange={e => setEndDate(e.target.value)}
          />
        </div>
      </div>

      {/* Table */}
      <div className="pam-card" style={{ overflowX: 'auto' }}>
        {loading ? (
          <p style={{ padding: '2rem', opacity: 0.6 }}>Loading logs…</p>
        ) : filtered.length === 0 ? (
          <p style={{ padding: '2rem', opacity: 0.6 }}>No audit logs found.</p>
        ) : (
          <table className="pam-table">
            <thead>
              <tr>
                <th>Timestamp</th>
                <th>Actor</th>
                <th>Role</th>
                <th>Action</th>
                <th>Target</th>
                <th>Server</th>
                <th>Result</th>
                <th>Severity</th>
                <th>Details</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((log) => {
                const severity = SEVERITY_STYLE[log.severity] || SEVERITY_STYLE.Info;
                const result = RESULT_STYLE[log.result] || RESULT_STYLE.Success;
                return (
                  <tr key={log.logId}>
                    <td style={{ whiteSpace: 'nowrap', fontSize: '0.78rem', opacity: 0.75 }}>
                      {new Date(log.timestamp).toLocaleString()}
                    </td>
                    <td style={{ fontWeight: 600 }}>{log.actor}</td>
                    <td style={{ opacity: 0.7, fontSize: '0.82rem' }}>{log.actorRole}</td>
                    <td style={{ fontWeight: 700, color: '#4facfe' }}>{log.actionType}</td>
                    <td style={{ opacity: 0.8 }}>{log.targetName || log.targetType}</td>
                    <td style={{ opacity: 0.7, fontSize: '0.82rem' }}>{log.serverName || '—'}</td>
                    <td>
                      <span style={{ padding: '0.2rem 0.5rem', borderRadius: '4px', fontSize: '0.75rem', background: result.bg, color: result.color }}>
                        {log.result}
                      </span>
                    </td>
                    <td>
                      <span style={{ padding: '0.2rem 0.5rem', borderRadius: '4px', fontSize: '0.75rem', background: severity.bg, color: severity.color }}>
                        {log.severity}
                      </span>
                    </td>
                    <td style={{ maxWidth: '280px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', opacity: 0.65, fontSize: '0.8rem' }} title={log.details}>
                      {log.details}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

    </div>
  );
}
