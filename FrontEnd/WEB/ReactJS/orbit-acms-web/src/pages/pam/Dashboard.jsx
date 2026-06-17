import React, { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';

const API = 'http://localhost:8080';

const statCardStyle = (color) => ({
  background: `linear-gradient(135deg, ${color}22, ${color}11)`,
  border: `1px solid ${color}44`,
  borderRadius: '12px',
  padding: '1.5rem 2rem',
  display: 'flex',
  flexDirection: 'column',
  gap: '0.4rem',
  minWidth: '160px',
  flex: 1,
});

function StatCard({ label, value, color = '#4facfe' }) {
  return (
    <div style={statCardStyle(color)}>
      <span style={{ fontSize: '2rem', fontWeight: 'bold', color }}>{value}</span>
      <span style={{ fontSize: '0.85rem', opacity: 0.8 }}>{label}</span>
    </div>
  );
}

function AdminDashboard({ user }) {
  const [stats, setStats] = useState({ servers: 0, users: 0, pendingTickets: 0, approvedTickets: 0, expiredAccess: 0 });
  const [recentTickets, setRecentTickets] = useState([]);
  const [recentLogs, setRecentLogs] = useState([]);

  useEffect(() => {
    async function loadData() {
      try {
        const [serversRes, usersRes, ticketsRes, logsRes] = await Promise.all([
          fetch(`${API}/api/servers`),
          fetch(`${API}/api/users`),
          fetch(`${API}/api/tickets`),
          fetch(`${API}/api/audit-logs`),
        ]);
        const servers = serversRes.ok ? await serversRes.json() : [];
        const users = usersRes.ok ? await usersRes.json() : [];
        const tickets = ticketsRes.ok ? await ticketsRes.json() : [];
        const logs = logsRes.ok ? await logsRes.json() : [];

        const now = new Date();
        const pending = tickets.filter(t => t.status === 'Pending').length;
        const approved = tickets.filter(t => t.status === 'Approved').length;
        const expired = tickets.filter(t => t.status === 'Approved' && t.validUntilStr && new Date(t.validUntilStr) < now).length;

        setStats({
          servers: servers.length,
          users: users.length,
          pendingTickets: pending,
          approvedTickets: approved,
          expiredAccess: expired,
        });
        setRecentTickets(tickets.slice(0, 5));
        setRecentLogs(logs.slice(0, 5));
      } catch (e) {
        console.error('Dashboard load error', e);
      }
    }
    loadData();
  }, []);

  return (
    <>
      <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', marginBottom: '2rem' }}>
        <StatCard label="Total Servers" value={stats.servers} color="#4facfe" />
        <StatCard label="Active Users" value={stats.users} color="#a8ffca" />
        <StatCard label="Pending Tickets" value={stats.pendingTickets} color="#ffcb42" />
        <StatCard label="Approved Tickets" value={stats.approvedTickets} color="#a8ffca" />
        <StatCard label="Expired Access" value={stats.expiredAccess} color="#ffcaca" />
      </div>

      <div style={{ display: 'flex', gap: '1.5rem', flexWrap: 'wrap' }}>
        <div className="pam-card" style={{ flex: 1, minWidth: '300px', padding: '1.5rem' }}>
          <h3 style={{ marginBottom: '1rem', color: '#ffcb42' }}>Recent Tickets</h3>
          {recentTickets.length === 0 && <p style={{ opacity: 0.6 }}>No tickets yet.</p>}
          {recentTickets.map(t => (
            <div key={t.id} style={{ padding: '0.6rem 0', borderBottom: '1px solid rgba(255,255,255,0.08)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <span style={{ fontWeight: 'bold', fontSize: '0.9rem' }}>{t.hostname || t.serverId}</span>
                <span style={{ marginLeft: '0.5rem', opacity: 0.6, fontSize: '0.8rem' }}>by {t.requesterId}</span>
              </div>
              <span style={{
                padding: '0.2rem 0.6rem', borderRadius: '4px', fontSize: '0.75rem',
                background: t.status === 'Approved' ? 'rgba(0,255,0,0.15)' : t.status === 'Rejected' ? 'rgba(255,0,0,0.15)' : 'rgba(255,203,66,0.15)',
                color: t.status === 'Approved' ? '#a8ffca' : t.status === 'Rejected' ? '#ffcaca' : '#ffcb42',
              }}>{t.status}</span>
            </div>
          ))}
        </div>

        <div className="pam-card" style={{ flex: 1, minWidth: '300px', padding: '1.5rem' }}>
          <h3 style={{ marginBottom: '1rem', color: '#4facfe' }}>Recent Audit Events</h3>
          {recentLogs.length === 0 && <p style={{ opacity: 0.6 }}>No audit events yet.</p>}
          {recentLogs.map(log => (
            <div key={log.logId} style={{ padding: '0.6rem 0', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
              <div style={{ fontSize: '0.85rem', fontWeight: 'bold' }}>{log.actionType}</div>
              <div style={{ fontSize: '0.75rem', opacity: 0.6 }}>{log.actor} · {new Date(log.timestamp).toLocaleString()}</div>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}

function UserDashboard({ user }) {
  const [stats, setStats] = useState({ servers: 0, pending: 0, approved: 0, expired: 0 });
  const [myTickets, setMyTickets] = useState([]);

  useEffect(() => {
    async function loadData() {
      try {
        const [serversRes, ticketsRes] = await Promise.all([
          fetch(`${API}/api/servers`),
          fetch(`${API}/api/tickets?requesterId=${encodeURIComponent(user.userId)}`),
        ]);
        const servers = serversRes.ok ? await serversRes.json() : [];
        const tickets = ticketsRes.ok ? await ticketsRes.json() : [];

        const now = new Date();
        const pending = tickets.filter(t => t.status === 'Pending').length;
        const approved = tickets.filter(t => t.status === 'Approved').length;
        const expired = tickets.filter(t => t.status === 'Approved' && t.validUntilStr && new Date(t.validUntilStr) < now).length;

        setStats({ servers: servers.length, pending, approved, expired });
        setMyTickets(tickets.slice(0, 6));
      } catch (e) {
        console.error('Dashboard load error', e);
      }
    }
    loadData();
  }, [user.userId]);

  return (
    <>
      <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', marginBottom: '2rem' }}>
        <StatCard label="Available Servers" value={stats.servers} color="#4facfe" />
        <StatCard label="Pending Requests" value={stats.pending} color="#ffcb42" />
        <StatCard label="Approved Access" value={stats.approved} color="#a8ffca" />
        <StatCard label="Expired Access" value={stats.expired} color="#ffcaca" />
      </div>

      <div className="pam-card" style={{ padding: '1.5rem' }}>
        <h3 style={{ marginBottom: '1rem', color: '#4facfe' }}>My Recent Requests</h3>
        {myTickets.length === 0 && <p style={{ opacity: 0.6 }}>No access requests yet. Go to Server List to request access.</p>}
        {myTickets.map(t => (
          <div key={t.id} style={{ padding: '0.7rem 0', borderBottom: '1px solid rgba(255,255,255,0.08)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <span style={{ fontWeight: 'bold', fontSize: '0.9rem' }}>💻 {t.hostname || t.serverId}</span>
              <div style={{ fontSize: '0.75rem', opacity: 0.6, marginTop: '0.2rem' }}>{t.reason}</div>
            </div>
            <span style={{
              padding: '0.2rem 0.6rem', borderRadius: '4px', fontSize: '0.75rem',
              background: t.status === 'Approved' ? 'rgba(0,255,0,0.15)' : t.status === 'Rejected' ? 'rgba(255,0,0,0.15)' : 'rgba(255,203,66,0.15)',
              color: t.status === 'Approved' ? '#a8ffca' : t.status === 'Rejected' ? '#ffcaca' : '#ffcb42',
            }}>{t.status}</span>
          </div>
        ))}
      </div>
    </>
  );
}

export default function Dashboard() {
  const { user, isAdmin, logout } = useAuth();

  return (
    <div className="pam-container">
      <div style={{ marginBottom: '1.5rem' }}>
        <h1 style={{ textShadow: '0 2px 10px rgba(0,0,0,0.5)', marginBottom: '0.3rem' }}>
          Welcome back, {user?.firstName || user?.userId} 👋
        </h1>
        <p style={{ opacity: 0.6, margin: 0, fontSize: '0.9rem' }}>
          Role: <strong style={{ color: isAdmin ? '#ffcb42' : '#4facfe' }}>
            {user?.roleName || 'User'}
          </strong>
        </p>
      </div>

      {isAdmin ? <AdminDashboard user={user} /> : <UserDashboard user={user} />}
    </div>
  );
}
