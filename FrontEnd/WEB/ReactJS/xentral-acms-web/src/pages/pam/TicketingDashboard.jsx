import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../../context/AuthContext';
import BrowserRdpSession from '../../components/BrowserRdpSession';

const API = 'http://localhost:8080';
const TABS = ['All', 'Pending', 'Approved', 'Rejected'];

const STATUS_STYLE = {
  Pending:  { bg: 'rgba(255,203,66,0.15)', color: '#ffcb42', border: 'rgba(255,203,66,0.4)' },
  Approved: { bg: 'rgba(0,255,0,0.12)',    color: '#a8ffca', border: 'rgba(0,255,0,0.3)' },
  Rejected: { bg: 'rgba(255,60,60,0.12)',  color: '#ffcaca', border: 'rgba(255,60,60,0.3)' },
};

const URGENCY_STYLE = {
  Critical: { bg: 'rgba(255,0,0,0.15)', color: '#ff7777', border: 'rgba(255,0,0,0.4)' },
  High: { bg: 'rgba(255,165,0,0.15)', color: '#ffd077', border: 'rgba(255,165,0,0.4)' },
  Normal: { bg: 'rgba(0,180,255,0.15)', color: '#77d5ff', border: 'rgba(0,180,255,0.4)' },
  Low: { bg: 'rgba(255,255,255,0.06)', color: '#dddddd', border: 'rgba(255,255,255,0.18)' },
};

const formatWindow = (startStr, endStr) => {
  if (!startStr || !endStr) return '—';
  const start = new Date(startStr);
  const end = new Date(endStr);
  if (isNaN(start.getTime()) || isNaN(end.getTime()) || start.getFullYear() < 2000 || end.getFullYear() < 2000) return '—';
  const options = { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false };
  return `${start.toLocaleString(undefined, options)} to ${end.toLocaleString(undefined, options)}`;
};

const MODAL_BACKDROP = {
  position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)',
  backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center',
  justifyContent: 'center', zIndex: 9999,
};
const MODAL_CARD = {
  background: 'rgba(10,16,35,0.98)', border: '1px solid rgba(255,255,255,0.12)',
  borderRadius: '16px', padding: '2rem', width: '460px', maxWidth: '95vw',
};

export default function TicketingDashboard() {
  const { user, isAdmin } = useAuth();
  const [tickets, setTickets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('All');
  const [approveModal, setApproveModal] = useState(null);
  const [denyModal, setDenyModal] = useState(null);
  const [approveForm, setApproveForm] = useState({ durationHours: 8, approvedFrom: '', approvedUntil: '' });
  const [denyReason, setDenyReason] = useState('');
  const [connectionState, setConnectionState] = useState(null); // 'loading' | 'ready' | 'error' | null
  const [rdpData, setRdpData] = useState(null);
  const [rdpConnectionError, setRdpConnectionError] = useState(null);
  const [activeSession, setActiveSession] = useState(null);
  
  // Credentials assignment state
  const [serverCredentials, setServerCredentials] = useState([]);
  const [selectedCredId, setSelectedCredId] = useState('');

  // Direct access grant states
  const [grantModal, setGrantModal] = useState(false);
  const [users, setUsers] = useState([]);
  const [serversList, setServersList] = useState([]);
  const [grantForm, setGrantForm] = useState({
    userId: '',
    serverId: '',
    credentialId: '',
    durationHours: 8,
    approvedFrom: '',
    approvedUntil: '',
    reason: 'Direct Admin Access Grant'
  });
  const [grantCredentials, setGrantCredentials] = useState([]);

  // Edit / Revoke access states
  const [editModal, setEditModal] = useState(null);
  const [editForm, setEditForm] = useState({ validFrom: '', validUntil: '', assignedCredentialId: '' });
  const [editCredentials, setEditCredentials] = useState([]);

  const ADMIN_ROLE_IDS = ['11111111-1111-1111-1111-111111111111', '00000000-0000-0000-0000-000000000001'];

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

  const splitDateTime = (dtStr) => {
    if (!dtStr) return { date: '', time: '' };
    const parts = dtStr.split('T');
    return { date: parts[0] || '', time: parts[1] || '' };
  };

  const joinDateTime = (date, time) => {
    if (!date) return '';
    return `${date}T${time || '00:00'}`;
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

  const setApproveStart = (newStart) => {
    const newStartStr = toLocalFromISO(newStart.toISOString());
    setApproveForm(prev => {
      const newEnd = new Date(newStart.getTime() + Number(prev.durationHours) * 3600000);
      return {
        ...prev,
        approvedFrom: newStartStr,
        approvedUntil: toLocalFromISO(newEnd.toISOString())
      };
    });
  };

  const setApproveEndOffset = (hours) => {
    setApproveForm(prev => {
      const startDt = new Date(prev.approvedFrom || Date.now());
      const newEnd = new Date(startDt.getTime() + hours * 3600000);
      return {
        ...prev,
        durationHours: hours,
        approvedUntil: toLocalFromISO(newEnd.toISOString())
      };
    });
  };

  const setGrantStart = (newStart) => {
    const newStartStr = toLocalFromISO(newStart.toISOString());
    setGrantForm(prev => {
      const newEnd = new Date(newStart.getTime() + Number(prev.durationHours) * 3600000);
      return {
        ...prev,
        approvedFrom: newStartStr,
        approvedUntil: toLocalFromISO(newEnd.toISOString())
      };
    });
  };

  const setGrantEndOffset = (hours) => {
    setGrantForm(prev => {
      const startDt = new Date(prev.approvedFrom || Date.now());
      const newEnd = new Date(startDt.getTime() + hours * 3600000);
      return {
        ...prev,
        durationHours: hours,
        approvedUntil: toLocalFromISO(newEnd.toISOString())
      };
    });
  };

  const setEditStart = (newStart) => {
    const newStartStr = toLocalFromISO(newStart.toISOString());
    setEditForm(prev => {
      const currentStart = new Date(prev.validFrom || Date.now());
      const currentEnd = new Date(prev.validUntil || Date.now());
      const durationMs = Math.max(0, currentEnd.getTime() - currentStart.getTime());
      const newEnd = new Date(newStart.getTime() + durationMs);
      return {
        ...prev,
        validFrom: newStartStr,
        validUntil: toLocalFromISO(newEnd.toISOString())
      };
    });
  };

  const setEditEndOffset = (hours) => {
    setEditForm(prev => {
      const startDt = new Date(prev.validFrom || Date.now());
      const newEnd = new Date(startDt.getTime() + hours * 3600000);
      return {
        ...prev,
        validUntil: toLocalFromISO(newEnd.toISOString())
      };
    });
  };

  const fetchTickets = useCallback(async () => {
    setLoading(true);
    try {
      const url = isAdmin
        ? `${API}/api/tickets`
        : `${API}/api/tickets?requesterId=${encodeURIComponent(user?.userId || '')}`;
      const res = await fetch(url);
      if (res.ok) setTickets(await res.json() || []);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  }, [isAdmin, user?.userId]);

  useEffect(() => { fetchTickets(); }, [fetchTickets]);

  useEffect(() => {
    const handleEventsUpdate = () => {
      fetchTickets();
    };
    window.addEventListener('xentral_events_update', handleEventsUpdate);
    return () => {
      window.removeEventListener('xentral_events_update', handleEventsUpdate);
    };
  }, [fetchTickets]);

  useEffect(() => {
    if (approveModal?.serverId) {
      fetch(`${API}/api/credentials/${approveModal.serverId}`)
        .then(res => res.json())
        .then(data => {
          setServerCredentials(data || []);
          if (data && data.length > 0) {
            setSelectedCredId(data[0].id);
          } else {
            setSelectedCredId('');
          }
        })
        .catch(err => console.error('Error fetching credentials', err));

      // Pre-fill duration from requested window
      const nowLocal = toLocalFromISO(new Date().toISOString());
      const reqStartStr = approveModal.requestedStartTime ? toLocalFromISO(approveModal.requestedStartTime) : '';
      const reqEndStr = approveModal.requestedEndTime ? toLocalFromISO(approveModal.requestedEndTime) : '';
      
      let approvedFrom = reqStartStr && new Date(approveModal.requestedStartTime) > new Date() ? reqStartStr : nowLocal;
      let approvedUntil = reqEndStr && new Date(approveModal.requestedEndTime) > new Date() ? reqEndStr : toLocalFromISO(new Date(Date.now() + 8 * 3600000).toISOString());
      
      const startDt = new Date(approvedFrom);
      const endDt = new Date(approvedUntil);
      const diffHours = Math.max(0.01, (endDt - startDt) / (1000 * 60 * 60));
      const roundedHours = Math.round(diffHours * 100) / 100;
      
      setApproveForm({
        approvedFrom,
        approvedUntil,
        durationHours: roundedHours
      });
    } else {
      setServerCredentials([]);
      setSelectedCredId('');
    }
  }, [approveModal]);

  useEffect(() => {
    if (editModal?.serverId) {
      fetch(`${API}/api/credentials/${editModal.serverId}`)
        .then(res => res.json())
        .then(data => {
          setEditCredentials(data || []);
          setEditForm(f => ({
            ...f,
            assignedCredentialId: editModal.assignedCredentialID || (data && data.length > 0 ? data[0].id : '')
          }));
        })
        .catch(err => console.error('Error fetching credentials for edit', err));
    } else {
      setEditCredentials([]);
    }
  }, [editModal]);

  const filteredTickets = activeTab === 'All'
    ? tickets
    : tickets.filter(t => t.status === activeTab);

  const handleApprove = async () => {
    const validUntilISO = toISOFromLocal(approveForm.approvedUntil);
    const validFromISO = toISOFromLocal(approveForm.approvedFrom);
    const res = await fetch(`${API}/api/tickets/${approveModal.id}/approve`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        approverId: user?.userId || 'ADMIN',
        durationHours: Number(approveForm.durationHours),
        assignedCredentialId: selectedCredId,
        validUntil: validUntilISO || undefined,
        validFrom: validFromISO || undefined,
      }),
    });
    if (res.ok) { setApproveModal(null); fetchTickets(); }
    else alert('Failed to approve ticket: ' + await res.text());
  };

  const handleDeny = async () => {
    if (!denyReason.trim()) return alert('Please enter a denial reason');
    const res = await fetch(`${API}/api/tickets/${denyModal.id}/deny`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ approverId: user?.userId || 'ADMIN', reason: denyReason }),
    });
    if (res.ok) { setDenyModal(null); setDenyReason(''); fetchTickets(); }
    else alert('Failed to deny ticket: ' + await res.text());
  };

  const handleOpenGrantModal = async () => {
    const nowLocal = toLocalFromISO(new Date().toISOString());
    const defaultUntil = toLocalFromISO(new Date(Date.now() + 8 * 3600000).toISOString());
    setGrantModal(true);
    setGrantForm({
      userId: '',
      serverId: '',
      credentialId: '',
      durationHours: 8,
      approvedFrom: nowLocal,
      approvedUntil: defaultUntil,
      reason: 'Direct Admin Access Grant'
    });
    setGrantCredentials([]);
    try {
      const resUsers = await fetch(`${API}/api/users`);
      if (resUsers.ok) {
        const u = await resUsers.json();
        setUsers(u || []);
      }
      const resServers = await fetch(`${API}/api/servers`);
      if (resServers.ok) {
        const s = await resServers.json();
        setServersList(s || []);
      }
    } catch (e) {
      console.error('Error loading grant references', e);
    }
  };

  const handleGrantServerChange = async (serverId) => {
    setGrantForm(f => ({ ...f, serverId, credentialId: '' }));
    setGrantCredentials([]);
    if (!serverId) return;
    try {
      const res = await fetch(`${API}/api/credentials/${serverId}`);
      if (res.ok) {
        const data = await res.json() || [];
        setGrantCredentials(data);
        if (data.length > 0) {
          setGrantForm(f => ({ ...f, credentialId: data[0].id }));
        }
      }
    } catch (e) {
      console.error('Error fetching server credentials for grant', e);
    }
  };

  const handleGrantSubmit = async (e) => {
    e.preventDefault();
    if (!grantForm.userId || !grantForm.serverId || !grantForm.credentialId) {
      return alert('User, Server, and Credential are required fields.');
    }

    try {
      const res = await fetch(`${API}/api/tickets/grant`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          requesterId: grantForm.userId,
          serverId: grantForm.serverId,
          assignedCredentialId: grantForm.credentialId,
          durationHours: Number(grantForm.durationHours),
          validFrom: toISOFromLocal(grantForm.approvedFrom) || undefined,
          validUntil: toISOFromLocal(grantForm.approvedUntil) || undefined,
          reason: grantForm.reason,
          approverId: user?.userId || 'ADMIN'
        })
      });

      if (res.ok) {
        setGrantModal(false);
        fetchTickets();
        alert('Access permission granted successfully!');
      } else {
        const txt = await res.text();
        alert('Failed to grant access: ' + txt);
      }
    } catch (err) {
      alert('Error: ' + err.message);
    }
  };

  const handleLaunchRDP = async (ticket) => {
    setConnectionState('loading');
    setRdpConnectionError(null);
    try {
      const res = await fetch(`${API}/api/remote/${ticket.id}`);
      if (!res.ok) {
        const errMsg = await res.text();
        throw new Error(errMsg || 'Secure gateway connection failed.');
      }
      const data = await res.json();
      data._ticketId = ticket.id;
      data._serverId = ticket.serverId;
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

  const isTicketActive = (t) => {
    if (t.status !== 'Approved') return false;
    const now = new Date();
    if (t.validUntilStr && new Date(t.validUntilStr) <= now) return false;
    if (t.validFromStr && new Date(t.validFromStr) > now) return false;
    return true;
  };

  const isTicketUpcoming = (t) => {
    if (t.status !== 'Approved') return false;
    const now = new Date();
    return t.validFromStr && new Date(t.validFromStr) > now;
  };

  const handleEditAccess = async () => {
    if (!editModal || !editForm.validUntil) return;
    const validUntilISO = toISOFromLocal(editForm.validUntil);
    const validFromISO = toISOFromLocal(editForm.validFrom);
    try {
      const res = await fetch(`${API}/api/tickets/${editModal.id}/modify`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          validUntil: validUntilISO, 
          validFrom: validFromISO || undefined,
          approverId: user?.userId || 'ADMIN',
          assignedCredentialId: editForm.assignedCredentialId
        }),
      });
      if (res.ok) { setEditModal(null); fetchTickets(); }
      else alert('Failed to modify access: ' + await res.text());
    } catch (e) { alert('Error: ' + e.message); }
  };

  const handleRevokeAccess = async (ticket) => {
    if (!window.confirm(`Revoke access for ${ticket.requesterId} to ${ticket.hostname}? This will immediately terminate their session.`)) return;
    const past = new Date(Date.now() - 60000).toISOString();
    try {
      const res = await fetch(`${API}/api/tickets/${ticket.id}/modify`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ validUntil: past, approverId: user?.userId || 'ADMIN' }),
      });
      if (res.ok) { fetchTickets(); }
      else alert('Failed to revoke access: ' + await res.text());
    } catch (e) { alert('Error: ' + e.message); }
  };

  return (
    <div className="pam-container">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
        <div>
          <h1 style={{ margin: 0, textShadow: '0 2px 10px rgba(0,0,0,0.5)' }}>
            {isAdmin ? 'Access Tickets' : 'My Access Requests'}
          </h1>
          <p style={{ margin: '0.3rem 0 0', opacity: 0.6, fontSize: '0.85rem' }}>
            {isAdmin ? 'Review and manage all user access requests' : 'Track your server access request status'}
          </p>
        </div>
        {isAdmin && (
          <button 
            onClick={handleOpenGrantModal} 
            className="pam-button"
            style={{ background: 'linear-gradient(90deg, #4facfe, #00f2fe)' }}
          >
            ➕ Grant Direct Access
          </button>
        )}
      </div>

      {/* Tab bar */}
      <div style={{ display: 'flex', gap: '0.25rem', marginBottom: '1.5rem', background: 'rgba(255,255,255,0.05)', padding: '0.3rem', borderRadius: '10px', width: 'fit-content' }}>
        {TABS.map(tab => (
          <button key={tab} onClick={() => setActiveTab(tab)} style={{
            padding: '0.45rem 1.1rem', borderRadius: '7px', border: 'none', cursor: 'pointer', fontSize: '0.85rem', fontWeight: activeTab === tab ? 700 : 400,
            background: activeTab === tab ? 'rgba(79,172,254,0.25)' : 'transparent',
            color: activeTab === tab ? '#4facfe' : 'rgba(255,255,255,0.6)',
            transition: 'all 0.15s',
          }}>
            {tab} {tab !== 'All' && <span style={{ opacity: 0.6, fontSize: '0.75rem' }}>({tickets.filter(t => t.status === tab).length})</span>}
          </button>
        ))}
      </div>

      {/* Table */}
      <div className="pam-card" style={{ overflowX: 'auto' }}>
        {loading ? <p style={{ padding: '2rem', opacity: 0.6 }}>Loading tickets…</p> :
          filteredTickets.length === 0 ? <p style={{ padding: '2rem', opacity: 0.6 }}>No tickets found.</p> : (
            <table className="pam-table">
              <thead>
                <tr>
                  <th>Server</th>
                  <th>Requested By</th>
                  <th>Access Type</th>
                  <th>Urgency</th>
                  <th>Request Window</th>
                  <th>Reason</th>
                  <th>Status</th>
                  <th>Submitted</th>
                  {isAdmin && <th style={{ textAlign: 'center' }}>Actions</th>}
                  {!isAdmin && <th style={{ textAlign: 'center' }}>Connect</th>}
                </tr>
              </thead>
              <tbody>
                {filteredTickets.map(t => {
                  const ss = STATUS_STYLE[t.status] || STATUS_STYLE.Pending;
                  const us = URGENCY_STYLE[t.urgency] || URGENCY_STYLE.Normal;
                  const active = isTicketActive(t);
                  return (
                    <tr key={t.id}>
                      <td style={{ fontWeight: 700, color: '#4facfe' }}>💻 {t.hostname || t.serverId}</td>
                      <td style={{ opacity: 0.8 }}>{t.requesterId}</td>
                      <td>
                        <span style={{ fontSize: '0.85rem', color: 'rgba(255,255,255,0.9)' }}>
                          {t.accessType || 'Remote Access'}
                        </span>
                      </td>
                      <td>
                        <span style={{ padding: '0.15rem 0.5rem', borderRadius: '999px', fontSize: '0.72rem', background: us.bg, color: us.color, border: `1px solid ${us.border}` }}>
                          {t.urgency || 'Normal'}
                        </span>
                      </td>
                      <td style={{ fontSize: '0.78rem', opacity: 0.85, whiteSpace: 'nowrap' }}>
                        {formatWindow(t.requestedStartTime, t.requestedEndTime)}
                      </td>
                      <td style={{ maxWidth: '220px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={t.reason}>{t.reason}</td>
                      <td>
                        <span style={{ padding: '0.2rem 0.6rem', borderRadius: '999px', fontSize: '0.75rem', background: ss.bg, color: ss.color, border: `1px solid ${ss.border}` }}>
                          {t.status}
                        </span>
                      </td>
                      <td style={{ opacity: 0.6, fontSize: '0.8rem' }}>
                        {new Date(t.createdDate).toLocaleDateString()}
                      </td>
                      {isAdmin && (
                        <td>
                          <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'center' }}>
                            {t.status === 'Pending' && (
                              <>
                                <button onClick={() => setApproveModal(t)} className="pam-action-btn pam-btn-approve">✓ Approve</button>
                                <button onClick={() => { setDenyModal(t); setDenyReason(''); }} className="pam-action-btn pam-btn-deny">✕ Deny</button>
                              </>
                            )}
                            {t.status === 'Approved' && (
                              <>
                                {(active || isTicketUpcoming(t)) ? (
                                  <>
                                    <button onClick={() => { setEditModal(t); setEditForm({ validFrom: toLocalFromISO(t.validFromStr), validUntil: toLocalFromISO(t.validUntilStr), assignedCredentialId: t.assignedCredentialID || '' }); }} className="pam-action-btn pam-btn-edit">
                                      ✏️ Edit
                                    </button>
                                    <button onClick={() => handleRevokeAccess(t)} className="pam-action-btn pam-btn-revoke">
                                      🚫 Revoke
                                    </button>
                                  </>
                                ) : (
                                  <span style={{ opacity: 0.4, fontSize: '0.8rem' }}>Expired</span>
                                )}
                              </>
                            )}
                            {t.status === 'Rejected' && <span style={{ opacity: 0.4, fontSize: '0.8rem' }}>Denied</span>}
                          </div>
                        </td>
                      )}
                      {!isAdmin && (
                        <td style={{ textAlign: 'center' }}>
                          {active ? (
                            <button onClick={() => handleLaunchRDP(t)} className="pam-action-btn pam-btn-connect">
                              🖥 Connect
                            </button>
                          ) : isTicketUpcoming(t) ? (
                            <span style={{ opacity: 0.6, fontSize: '0.8rem', color: '#ffcb42' }}>Upcoming</span>
                          ) : (
                            <span style={{ opacity: 0.3, fontSize: '0.8rem' }}>—</span>
                          )}
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
      </div>

      {/* Approve Modal */}
      {approveModal && (
        <div style={MODAL_BACKDROP} onClick={e => e.target === e.currentTarget && setApproveModal(null)}>
          <div style={MODAL_CARD}>
            <h2 style={{ margin: '0 0 0.5rem', color: '#a8ffca' }}>✓ Approve Ticket</h2>
            <p style={{ opacity: 0.6, fontSize: '0.85rem', margin: '0 0 0.8rem' }}>
              Server: <strong style={{ color: '#4facfe' }}>{approveModal.hostname}</strong> | User: <strong>{approveModal.requesterId}</strong>
            </p>

            {/* Show requested window if available */}
            {approveModal.requestedStartTime && approveModal.requestedEndTime && new Date(approveModal.requestedStartTime).getFullYear() >= 2000 && (
              <div style={{ background: 'rgba(79,172,254,0.08)', border: '1px solid rgba(79,172,254,0.2)', borderRadius: '8px', padding: '0.7rem 1rem', marginBottom: '1rem', fontSize: '0.78rem' }}>
                <span style={{ opacity: 0.6 }}>📅 Requested Window:</span>{' '}
                <strong style={{ color: '#4facfe' }}>{new Date(approveModal.requestedStartTime).toLocaleString()}</strong>
                <span style={{ opacity: 0.5 }}> → </span>
                <strong style={{ color: '#4facfe' }}>{new Date(approveModal.requestedEndTime).toLocaleString()}</strong>
              </div>
            )}

            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginBottom: '1rem' }}>
              <label style={{ fontSize: '0.8rem', color: 'rgba(255,255,255,0.6)', fontWeight: 600 }}>Start Access From</label>
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <input className="pam-input" type="date"
                  value={splitDateTime(approveForm.approvedFrom).date}
                  onChange={e => {
                    const newDate = e.target.value;
                    const newTime = splitDateTime(approveForm.approvedFrom).time || '00:00';
                    const val = joinDateTime(newDate, newTime);
                    const newStart = new Date(val);
                    const newEnd = new Date(newStart.getTime() + Number(approveForm.durationHours) * 3600000);
                    setApproveForm({ ...approveForm, approvedFrom: val, approvedUntil: toLocalFromISO(newEnd.toISOString()) });
                  }}
                  style={{ flex: 1 }}
                />
                <input className="pam-input" type="time"
                  value={splitDateTime(approveForm.approvedFrom).time}
                  onChange={e => {
                    const newDate = splitDateTime(approveForm.approvedFrom).date || new Date().toISOString().split('T')[0];
                    const newTime = e.target.value;
                    const val = joinDateTime(newDate, newTime);
                    const newStart = new Date(val);
                    const newEnd = new Date(newStart.getTime() + Number(approveForm.durationHours) * 3600000);
                    setApproveForm({ ...approveForm, approvedFrom: val, approvedUntil: toLocalFromISO(newEnd.toISOString()) });
                  }}
                  style={{ flex: 1 }}
                />
              </div>
              <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
                <button type="button" style={SHORTCUT_BTN_STYLE} onMouseEnter={handleMouseEnterShortcut} onMouseLeave={handleMouseLeaveShortcut} onClick={() => setApproveStart(new Date())}>Now</button>
                <button type="button" style={SHORTCUT_BTN_STYLE} onMouseEnter={handleMouseEnterShortcut} onMouseLeave={handleMouseLeaveShortcut} onClick={() => setApproveStart(new Date(Date.now() + 30 * 60000))}>+30m</button>
                <button type="button" style={SHORTCUT_BTN_STYLE} onMouseEnter={handleMouseEnterShortcut} onMouseLeave={handleMouseLeaveShortcut} onClick={() => setApproveStart(new Date(Date.now() + 60 * 60000))}>+1h</button>
                <button type="button" style={SHORTCUT_BTN_STYLE} onMouseEnter={handleMouseEnterShortcut} onMouseLeave={handleMouseLeaveShortcut} onClick={() => setApproveStart(new Date(Date.now() + 120 * 60000))}>+2h</button>
              </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginBottom: '1rem' }}>
              <label style={{ fontSize: '0.8rem', color: 'rgba(255,255,255,0.6)', fontWeight: 600 }}>Access Duration (hours)</label>
              <input className="pam-input" type="number" min={0.01} step="any" max={720}
                value={approveForm.durationHours} onChange={e => {
                  const hrs = e.target.value;
                  const startDt = new Date(approveForm.approvedFrom || Date.now());
                  const newEnd = new Date(startDt.getTime() + Number(hrs) * 3600000);
                  setApproveForm({ ...approveForm, durationHours: hrs, approvedUntil: toLocalFromISO(newEnd.toISOString()) });
                }} />
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginBottom: '1.5rem' }}>
              <label style={{ fontSize: '0.8rem', color: 'rgba(255,255,255,0.6)', fontWeight: 600 }}>Approved Until</label>
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <input className="pam-input" type="date"
                  value={splitDateTime(approveForm.approvedUntil).date}
                  onChange={e => {
                    const newDate = e.target.value;
                    const newTime = splitDateTime(approveForm.approvedUntil).time || '00:00';
                    const val = joinDateTime(newDate, newTime);
                    const startDt = new Date(approveForm.approvedFrom || Date.now());
                    const endDt = new Date(val);
                    const hrs = Math.max(0.01, (endDt.getTime() - startDt.getTime()) / 3600000);
                    setApproveForm({ ...approveForm, durationHours: Math.round(hrs * 100) / 100, approvedUntil: val });
                  }}
                  style={{ flex: 1 }}
                />
                <input className="pam-input" type="time"
                  value={splitDateTime(approveForm.approvedUntil).time}
                  onChange={e => {
                    const newDate = splitDateTime(approveForm.approvedUntil).date || new Date().toISOString().split('T')[0];
                    const newTime = e.target.value;
                    const val = joinDateTime(newDate, newTime);
                    const startDt = new Date(approveForm.approvedFrom || Date.now());
                    const endDt = new Date(val);
                    const hrs = Math.max(0.01, (endDt.getTime() - startDt.getTime()) / 3600000);
                    setApproveForm({ ...approveForm, durationHours: Math.round(hrs * 100) / 100, approvedUntil: val });
                  }}
                  style={{ flex: 1 }}
                />
              </div>
              <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
                <button type="button" style={SHORTCUT_BTN_STYLE} onMouseEnter={handleMouseEnterShortcut} onMouseLeave={handleMouseLeaveShortcut} onClick={() => setApproveEndOffset(1)}>+1h</button>
                <button type="button" style={SHORTCUT_BTN_STYLE} onMouseEnter={handleMouseEnterShortcut} onMouseLeave={handleMouseLeaveShortcut} onClick={() => setApproveEndOffset(2)}>+2h</button>
                <button type="button" style={SHORTCUT_BTN_STYLE} onMouseEnter={handleMouseEnterShortcut} onMouseLeave={handleMouseLeaveShortcut} onClick={() => setApproveEndOffset(4)}>+4h</button>
                <button type="button" style={SHORTCUT_BTN_STYLE} onMouseEnter={handleMouseEnterShortcut} onMouseLeave={handleMouseLeaveShortcut} onClick={() => setApproveEndOffset(8)}>+8h</button>
                <button type="button" style={SHORTCUT_BTN_STYLE} onMouseEnter={handleMouseEnterShortcut} onMouseLeave={handleMouseLeaveShortcut} onClick={() => setApproveEndOffset(24)}>+24h</button>
              </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginBottom: '1.5rem' }}>
              <label style={{ fontSize: '0.8rem', color: 'rgba(255,255,255,0.6)', fontWeight: 600 }}>Assigned Server Credential *</label>
              <select className="pam-select" value={selectedCredId} onChange={e => setSelectedCredId(e.target.value)} style={{ color: '#000' }}>
                {serverCredentials.length === 0 ? (
                  <option value="">-- No Credentials Linked to Server --</option>
                ) : (
                  serverCredentials.map(c => (
                    <option key={c.id} value={c.id}>
                      {c.username} ({c.secretType})
                    </option>
                  ))
                )}
              </select>
            </div>
            <div style={{ display: 'flex', gap: '0.8rem', justifyContent: 'flex-end' }}>
              <button onClick={() => setApproveModal(null)} style={{ padding: '0.6rem 1.2rem', borderRadius: '8px', background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.15)', color: '#fff', cursor: 'pointer' }}>Cancel</button>
              <button onClick={handleApprove} className="pam-button" style={{ background: 'linear-gradient(90deg, #00b050, #00d068)' }}>Approve</button>
            </div>
          </div>
        </div>
      )}

      {/* Deny Modal */}
      {denyModal && (
        <div style={MODAL_BACKDROP} onClick={e => e.target === e.currentTarget && setDenyModal(null)}>
          <div style={MODAL_CARD}>
            <h2 style={{ margin: '0 0 0.5rem', color: '#ffcaca' }}>✕ Deny Ticket</h2>
            <p style={{ opacity: 0.6, fontSize: '0.85rem', margin: '0 0 1.5rem' }}>
              Server: <strong style={{ color: '#4facfe' }}>{denyModal.hostname}</strong> | User: <strong>{denyModal.requesterId}</strong>
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginBottom: '1.5rem' }}>
              <label style={{ fontSize: '0.8rem', color: 'rgba(255,255,255,0.6)', fontWeight: 600 }}>Denial Reason *</label>
              <textarea className="pam-input" rows={3} placeholder="Explain why this request is being denied…"
                value={denyReason} onChange={e => setDenyReason(e.target.value)} />
            </div>
            <div style={{ display: 'flex', gap: '0.8rem', justifyContent: 'flex-end' }}>
              <button onClick={() => setDenyModal(null)} style={{ padding: '0.6rem 1.2rem', borderRadius: '8px', background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.15)', color: '#fff', cursor: 'pointer' }}>Cancel</button>
              <button onClick={handleDeny} className="pam-button" style={{ background: 'linear-gradient(90deg, #b00020, #d00030)' }}>Deny</button>
            </div>
          </div>
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
                      ticketId: rdpData._ticketId || null,
                      serverId: rdpData._serverId || null,
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

      {/* Grant Access Modal */}
      {grantModal && (
        <div style={MODAL_BACKDROP} onClick={e => e.target === e.currentTarget && setGrantModal(false)}>
          <div style={MODAL_CARD}>
            <h2 style={{ margin: '0 0 0.5rem', color: '#4facfe' }}>➕ Grant Direct Access</h2>
            <p style={{ opacity: 0.6, fontSize: '0.85rem', margin: '0 0 1.5rem' }}>
              Assign connection permissions directly to any user.
            </p>
            
            <form onSubmit={handleGrantSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div>
                <label style={{ fontSize: '0.8rem', color: 'rgba(255,255,255,0.6)', fontWeight: 600, display: 'block', marginBottom: '0.3rem' }}>Target User *</label>
                <select 
                  className="pam-select" 
                  value={grantForm.userId} 
                  onChange={e => setGrantForm(f => ({ ...f, userId: e.target.value }))}
                  style={{ color: '#000' }}
                  required
                >
                  <option value="">-- Select User --</option>
                  {users.filter(u => !ADMIN_ROLE_IDS.includes(u.userRoleId)).map(u => (
                    <option key={u.id} value={u.userId}>
                      {u.first_name || u.firstName || ''} {u.last_name || u.lastName || ''} ({u.userId})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label style={{ fontSize: '0.8rem', color: 'rgba(255,255,255,0.6)', fontWeight: 600, display: 'block', marginBottom: '0.3rem' }}>Target Server *</label>
                <select 
                  className="pam-select" 
                  value={grantForm.serverId} 
                  onChange={e => handleGrantServerChange(e.target.value)}
                  style={{ color: '#000' }}
                  required
                >
                  <option value="">-- Select Server --</option>
                  {serversList.map(s => (
                    <option key={s.id} value={s.id}>
                      {s.hostname} ({s.ipAddress})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label style={{ fontSize: '0.8rem', color: 'rgba(255,255,255,0.6)', fontWeight: 600, display: 'block', marginBottom: '0.3rem' }}>Assigned Server Credential *</label>
                <select 
                  className="pam-select" 
                  value={grantForm.credentialId} 
                  onChange={e => setGrantForm(f => ({ ...f, credentialId: e.target.value }))}
                  style={{ color: '#000' }}
                  required
                >
                  {grantForm.serverId ? (
                    grantCredentials.length === 0 ? (
                      <option value="">-- No Credentials Configured --</option>
                    ) : (
                      grantCredentials.map(c => (
                        <option key={c.id} value={c.id}>
                          {c.username} ({c.secretType})
                        </option>
                      ))
                    )
                  ) : (
                    <option value="">-- Select a Server First --</option>
                  )}
                </select>
              </div>

              <div>
                <label style={{ fontSize: '0.8rem', color: 'rgba(255,255,255,0.6)', fontWeight: 600, display: 'block', marginBottom: '0.3rem' }}>Start Access From *</label>
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                  <input 
                    className="pam-input" 
                    type="date" 
                    value={splitDateTime(grantForm.approvedFrom).date} 
                    onChange={e => {
                      const newDate = e.target.value;
                      const newTime = splitDateTime(grantForm.approvedFrom).time || '00:00';
                      const val = joinDateTime(newDate, newTime);
                      const newStart = new Date(val);
                      const newEnd = new Date(newStart.getTime() + Number(grantForm.durationHours) * 3600000);
                      setGrantForm(f => ({ ...f, approvedFrom: val, approvedUntil: toLocalFromISO(newEnd.toISOString()) }));
                    }}
                    style={{ flex: 1 }}
                    required
                  />
                  <input 
                    className="pam-input" 
                    type="time" 
                    value={splitDateTime(grantForm.approvedFrom).time} 
                    onChange={e => {
                      const newDate = splitDateTime(grantForm.approvedFrom).date || new Date().toISOString().split('T')[0];
                      const newTime = e.target.value;
                      const val = joinDateTime(newDate, newTime);
                      const newStart = new Date(val);
                      const newEnd = new Date(newStart.getTime() + Number(grantForm.durationHours) * 3600000);
                      setGrantForm(f => ({ ...f, approvedFrom: val, approvedUntil: toLocalFromISO(newEnd.toISOString()) }));
                    }}
                    style={{ flex: 1 }}
                    required
                  />
                </div>
                <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
                  <button type="button" style={SHORTCUT_BTN_STYLE} onMouseEnter={handleMouseEnterShortcut} onMouseLeave={handleMouseLeaveShortcut} onClick={() => setGrantStart(new Date())}>Now</button>
                  <button type="button" style={SHORTCUT_BTN_STYLE} onMouseEnter={handleMouseEnterShortcut} onMouseLeave={handleMouseLeaveShortcut} onClick={() => setGrantStart(new Date(Date.now() + 30 * 60000))}>+30m</button>
                  <button type="button" style={SHORTCUT_BTN_STYLE} onMouseEnter={handleMouseEnterShortcut} onMouseLeave={handleMouseLeaveShortcut} onClick={() => setGrantStart(new Date(Date.now() + 60 * 60000))}>+1h</button>
                  <button type="button" style={SHORTCUT_BTN_STYLE} onMouseEnter={handleMouseEnterShortcut} onMouseLeave={handleMouseLeaveShortcut} onClick={() => setGrantStart(new Date(Date.now() + 120 * 60000))}>+2h</button>
                </div>
              </div>

              <div>
                <label style={{ fontSize: '0.8rem', color: 'rgba(255,255,255,0.6)', fontWeight: 600, display: 'block', marginBottom: '0.3rem' }}>Access Duration (hours) *</label>
                <input 
                  className="pam-input" 
                  type="number" 
                  min={0.01} 
                  step="any"
                  max={720}
                  value={grantForm.durationHours} 
                  onChange={e => {
                    const hrs = e.target.value;
                    const startDt = new Date(grantForm.approvedFrom || Date.now());
                    const newEnd = new Date(startDt.getTime() + Number(hrs) * 3600000);
                    setGrantForm(f => ({ ...f, durationHours: hrs, approvedUntil: toLocalFromISO(newEnd.toISOString()) }));
                  }}
                  required
                />
              </div>

              <div>
                <label style={{ fontSize: '0.8rem', color: 'rgba(255,255,255,0.6)', fontWeight: 600, display: 'block', marginBottom: '0.3rem' }}>Approved Until *</label>
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                  <input 
                    className="pam-input" 
                    type="date" 
                    value={splitDateTime(grantForm.approvedUntil).date} 
                    onChange={e => {
                      const newDate = e.target.value;
                      const newTime = splitDateTime(grantForm.approvedUntil).time || '00:00';
                      const val = joinDateTime(newDate, newTime);
                      const startDt = new Date(grantForm.approvedFrom || Date.now());
                      const endDt = new Date(val);
                      const hrs = Math.max(0.01, (endDt.getTime() - startDt.getTime()) / 3600000);
                      setGrantForm(f => ({ ...f, durationHours: Math.round(hrs * 100) / 100, approvedUntil: val }));
                    }}
                    style={{ flex: 1 }}
                    required
                  />
                  <input 
                    className="pam-input" 
                    type="time" 
                    value={splitDateTime(grantForm.approvedUntil).time} 
                    onChange={e => {
                      const newDate = splitDateTime(grantForm.approvedUntil).date || new Date().toISOString().split('T')[0];
                      const newTime = e.target.value;
                      const val = joinDateTime(newDate, newTime);
                      const startDt = new Date(grantForm.approvedFrom || Date.now());
                      const endDt = new Date(val);
                      const hrs = Math.max(0.01, (endDt.getTime() - startDt.getTime()) / 3600000);
                      setGrantForm(f => ({ ...f, durationHours: Math.round(hrs * 100) / 100, approvedUntil: val }));
                    }}
                    style={{ flex: 1 }}
                    required
                  />
                </div>
                <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
                  <button type="button" style={SHORTCUT_BTN_STYLE} onMouseEnter={handleMouseEnterShortcut} onMouseLeave={handleMouseLeaveShortcut} onClick={() => setGrantEndOffset(1)}>+1h</button>
                  <button type="button" style={SHORTCUT_BTN_STYLE} onMouseEnter={handleMouseEnterShortcut} onMouseLeave={handleMouseLeaveShortcut} onClick={() => setGrantEndOffset(2)}>+2h</button>
                  <button type="button" style={SHORTCUT_BTN_STYLE} onMouseEnter={handleMouseEnterShortcut} onMouseLeave={handleMouseLeaveShortcut} onClick={() => setGrantEndOffset(4)}>+4h</button>
                  <button type="button" style={SHORTCUT_BTN_STYLE} onMouseEnter={handleMouseEnterShortcut} onMouseLeave={handleMouseLeaveShortcut} onClick={() => setGrantEndOffset(8)}>+8h</button>
                  <button type="button" style={SHORTCUT_BTN_STYLE} onMouseEnter={handleMouseEnterShortcut} onMouseLeave={handleMouseLeaveShortcut} onClick={() => setGrantEndOffset(24)}>+24h</button>
                </div>
              </div>

              <div>
                <label style={{ fontSize: '0.8rem', color: 'rgba(255,255,255,0.6)', fontWeight: 600, display: 'block', marginBottom: '0.3rem' }}>Reason / Remarks</label>
                <input 
                  className="pam-input" 
                  type="text" 
                  placeholder="e.g. Direct Admin Assignment"
                  value={grantForm.reason} 
                  onChange={e => setGrantForm(f => ({ ...f, reason: e.target.value }))}
                />
              </div>

              <div style={{ display: 'flex', gap: '0.8rem', justifyContent: 'flex-end', marginTop: '0.5rem' }}>
                <button type="button" onClick={() => setGrantModal(false)} style={{ padding: '0.6rem 1.2rem', borderRadius: '8px', background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.15)', color: '#fff', cursor: 'pointer' }}>Cancel</button>
                <button type="submit" className="pam-button" style={{ background: 'linear-gradient(90deg, #4facfe, #00f2fe)' }}>Grant Access</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit Access Modal */}
      {editModal && (
        <div style={MODAL_BACKDROP} onClick={e => e.target === e.currentTarget && setEditModal(null)}>
          <div style={MODAL_CARD}>
            <h2 style={{ margin: '0 0 0.5rem', color: '#ffcb42' }}>✏️ Edit Access</h2>
            <p style={{ opacity: 0.6, fontSize: '0.85rem', margin: '0 0 1.2rem' }}>
              Server: <strong style={{ color: '#4facfe' }}>{editModal.hostname}</strong> | User: <strong>{editModal.requesterId}</strong>
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginBottom: '1rem' }}>
              <label style={{ fontSize: '0.8rem', color: 'rgba(255,255,255,0.6)', fontWeight: 600 }}>New Start Date/Time</label>
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <input className="pam-input" type="date" value={splitDateTime(editForm.validFrom).date}
                  onChange={e => {
                    const newDate = e.target.value;
                    const newTime = splitDateTime(editForm.validFrom).time || '00:00';
                    const val = joinDateTime(newDate, newTime);
                    const newStart = new Date(val);
                    const currentStart = new Date(editForm.validFrom || Date.now());
                    const currentEnd = new Date(editForm.validUntil || Date.now());
                    const durationMs = Math.max(0, currentEnd.getTime() - currentStart.getTime());
                    const newEnd = new Date(newStart.getTime() + durationMs);
                    setEditForm(f => ({ ...f, validFrom: val, validUntil: toLocalFromISO(newEnd.toISOString()) }));
                  }}
                  style={{ flex: 1 }}
                />
                <input className="pam-input" type="time" value={splitDateTime(editForm.validFrom).time}
                  onChange={e => {
                    const newDate = splitDateTime(editForm.validFrom).date || new Date().toISOString().split('T')[0];
                    const newTime = e.target.value;
                    const val = joinDateTime(newDate, newTime);
                    const newStart = new Date(val);
                    const currentStart = new Date(editForm.validFrom || Date.now());
                    const currentEnd = new Date(editForm.validUntil || Date.now());
                    const durationMs = Math.max(0, currentEnd.getTime() - currentStart.getTime());
                    const newEnd = new Date(newStart.getTime() + durationMs);
                    setEditForm(f => ({ ...f, validFrom: val, validUntil: toLocalFromISO(newEnd.toISOString()) }));
                  }}
                  style={{ flex: 1 }}
                />
              </div>
              <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
                <button type="button" style={SHORTCUT_BTN_STYLE} onMouseEnter={handleMouseEnterShortcut} onMouseLeave={handleMouseLeaveShortcut} onClick={() => setEditStart(new Date())}>Now</button>
                <button type="button" style={SHORTCUT_BTN_STYLE} onMouseEnter={handleMouseEnterShortcut} onMouseLeave={handleMouseLeaveShortcut} onClick={() => setEditStart(new Date(Date.now() + 30 * 60000))}>+30m</button>
                <button type="button" style={SHORTCUT_BTN_STYLE} onMouseEnter={handleMouseEnterShortcut} onMouseLeave={handleMouseLeaveShortcut} onClick={() => setEditStart(new Date(Date.now() + 60 * 60000))}>+1h</button>
                <button type="button" style={SHORTCUT_BTN_STYLE} onMouseEnter={handleMouseEnterShortcut} onMouseLeave={handleMouseLeaveShortcut} onClick={() => setEditStart(new Date(Date.now() + 120 * 60000))}>+2h</button>
              </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginBottom: '1rem' }}>
              <label style={{ fontSize: '0.8rem', color: 'rgba(255,255,255,0.6)', fontWeight: 600 }}>New Expiry Date/Time</label>
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <input className="pam-input" type="date" value={splitDateTime(editForm.validUntil).date}
                  onChange={e => {
                    const newDate = e.target.value;
                    const newTime = splitDateTime(editForm.validUntil).time || '00:00';
                    const val = joinDateTime(newDate, newTime);
                    setEditForm(f => ({ ...f, validUntil: val }));
                  }}
                  style={{ flex: 1 }}
                />
                <input className="pam-input" type="time" value={splitDateTime(editForm.validUntil).time}
                  onChange={e => {
                    const newDate = splitDateTime(editForm.validUntil).date || new Date().toISOString().split('T')[0];
                    const newTime = e.target.value;
                    const val = joinDateTime(newDate, newTime);
                    setEditForm(f => ({ ...f, validUntil: val }));
                  }}
                  style={{ flex: 1 }}
                />
              </div>
              <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
                <button type="button" style={SHORTCUT_BTN_STYLE} onMouseEnter={handleMouseEnterShortcut} onMouseLeave={handleMouseLeaveShortcut} onClick={() => setEditEndOffset(1)}>+1h</button>
                <button type="button" style={SHORTCUT_BTN_STYLE} onMouseEnter={handleMouseEnterShortcut} onMouseLeave={handleMouseLeaveShortcut} onClick={() => setEditEndOffset(2)}>+2h</button>
                <button type="button" style={SHORTCUT_BTN_STYLE} onMouseEnter={handleMouseEnterShortcut} onMouseLeave={handleMouseLeaveShortcut} onClick={() => setEditEndOffset(4)}>+4h</button>
                <button type="button" style={SHORTCUT_BTN_STYLE} onMouseEnter={handleMouseEnterShortcut} onMouseLeave={handleMouseLeaveShortcut} onClick={() => setEditEndOffset(8)}>+8h</button>
                <button type="button" style={SHORTCUT_BTN_STYLE} onMouseEnter={handleMouseEnterShortcut} onMouseLeave={handleMouseLeaveShortcut} onClick={() => setEditEndOffset(24)}>+24h</button>
              </div>
            </div>
            
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginBottom: '1.5rem' }}>
              <label style={{ fontSize: '0.8rem', color: 'rgba(255,255,255,0.6)', fontWeight: 600 }}>Assigned Server Credential</label>
              <select 
                className="pam-select" 
                value={editForm.assignedCredentialId} 
                onChange={e => setEditForm(f => ({ ...f, assignedCredentialId: e.target.value }))} 
                style={{ color: '#000' }}
              >
                {editCredentials.length === 0 ? (
                  <option value="">-- No Credentials Linked to Server --</option>
                ) : (
                  editCredentials.map(c => (
                    <option key={c.id} value={c.id}>
                      {c.username} ({c.secretType})
                    </option>
                  ))
                )}
              </select>
            </div>

            <div style={{ display: 'flex', gap: '0.8rem', justifyContent: 'flex-end' }}>
              <button onClick={() => setEditModal(null)} style={{ padding: '0.6rem 1.2rem', borderRadius: '8px', background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.15)', color: '#fff', cursor: 'pointer' }}>Cancel</button>
              <button onClick={handleEditAccess} className="pam-button" style={{ background: 'linear-gradient(90deg, #ffcb42, #ff9900)' }}>Save Changes</button>
            </div>
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

const btnStyle = (color) => ({
  padding: '0.3rem 0.7rem', borderRadius: '6px', cursor: 'pointer',
  background: `${color}18`, border: `1px solid ${color}55`, color, fontSize: '0.78rem',
});
