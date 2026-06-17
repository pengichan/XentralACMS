import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../../context/AuthContext';

const API = 'http://localhost:8080';

// Role IDs must match dbo.user_role seed data.
// SUPER_ADMIN is intentionally excluded from assignable roles — it's a singleton.
const ROLE_ID_MAP = {
  SUPER_ADMIN: '00000000-0000-0000-0000-000000000001',
  ADMIN:       '11111111-1111-1111-1111-111111111111',
  USER:        '22222222-2222-2222-2222-222222222222',
};

// Only these two roles can ever be assigned to users
const ASSIGNABLE_ROLES = [
  { value: ROLE_ID_MAP.USER,  label: 'User' },
  { value: ROLE_ID_MAP.ADMIN, label: 'Admin' },
];

const MODAL_BACKDROP = {
  position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)',
  backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center',
  justifyContent: 'center', zIndex: 9999,
};
const MODAL_CARD = {
  background: 'rgba(10,16,35,0.98)', border: '1px solid rgba(255,255,255,0.12)',
  borderRadius: '16px', padding: '2rem', width: '480px', maxWidth: '95vw', maxHeight: '90vh', overflowY: 'auto',
};

const ROLE_BADGE = {
  SUPER_ADMIN: { bg: 'rgba(255,203,66,0.15)', color: '#ffcb42', border: 'rgba(255,203,66,0.4)', label: '★ Super Admin' },
  ADMIN:       { bg: 'rgba(79,172,254,0.15)',  color: '#4facfe', border: 'rgba(79,172,254,0.4)', label: 'Admin' },
  USER:        { bg: 'rgba(168,255,202,0.12)', color: '#a8ffca', border: 'rgba(168,255,202,0.3)', label: 'User' },
};

const STATUS_BADGE = {
  active:   { bg: 'rgba(0,255,0,0.1)',   color: '#a8ffca', border: 'rgba(0,255,0,0.3)',   label: '● Active' },
  inactive: { bg: 'rgba(255,60,60,0.1)', color: '#ffcaca', border: 'rgba(255,60,60,0.3)', label: '● Disabled' },
};

const EMPTY_CREATE_FORM = {
  userId: '', firstName: '', lastName: '', email: '', mobileNo: '',
  loginPassword: '', confirmPassword: '', roleId: ROLE_ID_MAP.USER, remark: '',
};

function badgeStyle(style) {
  return { padding: '0.2rem 0.65rem', borderRadius: '999px', fontSize: '0.72rem', fontWeight: 600, background: style.bg, color: style.color, border: `1px solid ${style.border}` };
}

function roleNameFromId(roleId) {
  for (const [name, id] of Object.entries(ROLE_ID_MAP)) {
    if (id === roleId) return name;
  }
  return 'USER';
}

// ─── Create User Modal ──────────────────────────────────────────────────────
function CreateUserModal({ onCreated, onClose }) {
  const [form, setForm] = useState(EMPTY_CREATE_FORM);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const set = (k) => (e) => setForm(f => ({ ...f, [k]: e.target.value }));

  const handleSave = async () => {
    setError('');
    const required = ['userId', 'firstName', 'lastName', 'email', 'mobileNo', 'loginPassword'];
    for (const k of required) {
      if (!form[k].trim()) { setError(`${k.replace(/([A-Z])/g, ' $1')} is required`); return; }
    }
    if (form.loginPassword !== form.confirmPassword) {
      setError('Passwords do not match'); return;
    }

    setSaving(true);
    const payload = {
      userId: form.userId.trim(),
      firstName: form.firstName.trim(),
      lastName: form.lastName.trim(),
      email: form.email.trim(),
      mobileNo: form.mobileNo.trim(),
      loginPassword: form.loginPassword,
      userRoleId: form.roleId,
      remark: form.remark.trim(),
    };

    const res = await fetch(`${API}/api/users`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
    });
    setSaving(false);
    if (res.ok) { onCreated(); onClose(); }
    else setError(await res.text() || 'Failed to create user');
  };

  const fields = [
    ['userId', 'User ID *', 'text', 'Unique login ID'],
    ['firstName', 'First Name *', 'text', ''],
    ['lastName', 'Last Name *', 'text', ''],
    ['email', 'Email *', 'email', ''],
    ['mobileNo', 'Mobile No *', 'text', ''],
    ['loginPassword', 'Password *', 'password', ''],
    ['confirmPassword', 'Confirm Password *', 'password', ''],
  ];

  return (
    <div style={MODAL_BACKDROP} onClick={e => e.target === e.currentTarget && onClose()}>
      <div style={MODAL_CARD}>
        <h2 style={{ margin: '0 0 1.5rem', color: '#fff' }}>👤 Create New User</h2>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.9rem' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.9rem' }}>
            {fields.map(([key, label, type, placeholder]) => (
              <div key={key} style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                <label style={{ fontSize: '0.78rem', color: 'rgba(255,255,255,0.55)', fontWeight: 600 }}>{label}</label>
                <input className="pam-input" type={type} placeholder={placeholder}
                  value={form[key]} onChange={set(key)} autoComplete="off" />
              </div>
            ))}

            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
              <label style={{ fontSize: '0.78rem', color: 'rgba(255,255,255,0.55)', fontWeight: 600 }}>Role</label>
              {/* Super Admin is NOT an assignable role — only User and Admin */}
              <select className="pam-select" value={form.roleId} onChange={set('roleId')} style={{ color: '#000' }}>
                {ASSIGNABLE_ROLES.map(r => (
                  <option key={r.value} value={r.value}>{r.label}</option>
                ))}
              </select>
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
            <label style={{ fontSize: '0.78rem', color: 'rgba(255,255,255,0.55)', fontWeight: 600 }}>Remark</label>
            <input className="pam-input" placeholder="Optional notes" value={form.remark} onChange={set('remark')} />
          </div>
        </div>

        {error && (
          <div style={{ marginTop: '1rem', padding: '0.7rem 1rem', background: 'rgba(255,60,60,0.1)', border: '1px solid rgba(255,60,60,0.3)', borderRadius: '8px', color: '#ffcaca', fontSize: '0.85rem' }}>
            {error}
          </div>
        )}

        <div style={{ display: 'flex', gap: '0.8rem', marginTop: '1.5rem', justifyContent: 'flex-end' }}>
          <button onClick={onClose} style={{ padding: '0.6rem 1.2rem', borderRadius: '8px', background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.15)', color: '#fff', cursor: 'pointer' }}>
            Cancel
          </button>
          <button onClick={handleSave} disabled={saving} className="pam-button">
            {saving ? 'Creating…' : 'Create User'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Edit User Modal ─────────────────────────────────────────────────────────
function EditUserModal({ targetUser, isSuperAdmin, onUpdated, onClose }) {
  const [form, setForm] = useState({
    userId: targetUser.userId || '',
    firstName: targetUser.firstName || '',
    lastName: targetUser.lastName || '',
    email: targetUser.email || '',
    mobileNo: targetUser.mobileNo || '',
    loginPassword: '',
    confirmPassword: '',
    roleId: targetUser.userRoleId || ROLE_ID_MAP.USER,
    isActive: targetUser.isActive !== false,
    remark: targetUser.remark || '',
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const set = (k) => (e) => {
    const val = e.target.type === 'checkbox' ? e.target.checked : e.target.value;
    setForm(f => ({ ...f, [k]: val }));
  };

  const handleSave = async () => {
    setError('');
    const required = ['userId', 'firstName', 'lastName', 'email', 'mobileNo'];
    for (const k of required) {
      if (!form[k].trim()) { setError(`${k.replace(/([A-Z])/g, ' $1')} is required`); return; }
    }
    if (form.loginPassword && form.loginPassword !== form.confirmPassword) {
      setError('Passwords do not match'); return;
    }

    setSaving(true);
    const payload = {
      id: targetUser.id,
      userId: form.userId.trim(),
      firstName: form.firstName.trim(),
      lastName: form.lastName.trim(),
      email: form.email.trim(),
      mobileNo: form.mobileNo.trim(),
      userRoleId: form.roleId,
      isActive: form.isActive,
      remark: form.remark.trim(),
    };
    if (form.loginPassword) {
      payload.loginPassword = form.loginPassword;
    }

    const res = await fetch(`${API}/api/users/${targetUser.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    setSaving(false);
    if (res.ok) { onUpdated(); onClose(); }
    else setError(await res.text() || 'Failed to update user');
  };

  const fields = [
    ['userId', 'User ID *', 'text', 'Unique login ID'],
    ['firstName', 'First Name *', 'text', ''],
    ['lastName', 'Last Name *', 'text', ''],
    ['email', 'Email *', 'email', ''],
    ['mobileNo', 'Mobile No *', 'text', ''],
    ['loginPassword', 'New Password (Optional)', 'password', 'Leave blank to keep current'],
    ['confirmPassword', 'Confirm New Password', 'password', 'Leave blank to keep current'],
  ];

  return (
    <div style={MODAL_BACKDROP} onClick={e => e.target === e.currentTarget && onClose()}>
      <div style={MODAL_CARD}>
        <h2 style={{ margin: '0 0 1.5rem', color: '#fff' }}>✏️ Edit User Details</h2>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.9rem' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.9rem' }}>
            {fields.map(([key, label, type, placeholder]) => (
              <div key={key} style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                <label style={{ fontSize: '0.78rem', color: 'rgba(255,255,255,0.55)', fontWeight: 600 }}>{label}</label>
                <input className="pam-input" type={type} placeholder={placeholder}
                  value={form[key]} onChange={set(key)} autoComplete="off" />
              </div>
            ))}

            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
              <label style={{ fontSize: '0.78rem', color: 'rgba(255,255,255,0.55)', fontWeight: 600 }}>Role</label>
              <select className="pam-select" value={form.roleId} onChange={set('roleId')} disabled={!isSuperAdmin} style={{ color: '#000', opacity: isSuperAdmin ? 1 : 0.6 }}>
                {targetUser.userRoleId === ROLE_ID_MAP.SUPER_ADMIN && (
                  <option value={ROLE_ID_MAP.SUPER_ADMIN}>Super Admin</option>
                )}
                {ASSIGNABLE_ROLES.map(r => (
                  <option key={r.value} value={r.value}>{r.label}</option>
                ))}
              </select>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginTop: '0.35rem' }}>
            <input type="checkbox" id="isActive" checked={form.isActive} onChange={set('isActive')} style={{ cursor: 'pointer' }} />
            <label htmlFor="isActive" style={{ fontSize: '0.85rem', color: '#fff', cursor: 'pointer', fontWeight: 600 }}>
              Account Active
            </label>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
            <label style={{ fontSize: '0.78rem', color: 'rgba(255,255,255,0.55)', fontWeight: 600 }}>Remark</label>
            <input className="pam-input" placeholder="Optional notes" value={form.remark} onChange={set('remark')} />
          </div>
        </div>

        {error && (
          <div style={{ marginTop: '1rem', padding: '0.7rem 1rem', background: 'rgba(255,60,60,0.1)', border: '1px solid rgba(255,60,60,0.3)', borderRadius: '8px', color: '#ffcaca', fontSize: '0.85rem' }}>
            {error}
          </div>
        )}

        <div style={{ display: 'flex', gap: '0.8rem', marginTop: '1.5rem', justifyContent: 'flex-end' }}>
          <button onClick={onClose} style={{ padding: '0.6rem 1.2rem', borderRadius: '8px', background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.15)', color: '#fff', cursor: 'pointer' }}>
            Cancel
          </button>
          <button onClick={handleSave} disabled={saving} className="pam-button">
            {saving ? 'Saving…' : 'Save Changes'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Delete Confirm Modal ────────────────────────────────────────────────────
function DeleteConfirmModal({ targetUser, onDeleted, onClose }) {
  const [confirm, setConfirm] = useState('');
  const [deleting, setDeleting] = useState(false);

  const handleDelete = async () => {
    if (confirm !== targetUser.userId) return;
    setDeleting(true);
    const res = await fetch(`${API}/api/users/${targetUser.id}`, { method: 'DELETE' });
    setDeleting(false);
    if (res.ok) { onDeleted(); onClose(); }
    else alert('Failed to delete user: ' + await res.text());
  };

  return (
    <div style={MODAL_BACKDROP} onClick={e => e.target === e.currentTarget && onClose()}>
      <div style={{ ...MODAL_CARD, width: '400px' }}>
        <h2 style={{ margin: '0 0 0.5rem', color: '#ffcaca' }}>🗑 Delete User</h2>
        <p style={{ opacity: 0.7, fontSize: '0.85rem', margin: '0 0 0.5rem' }}>
          This will permanently remove <strong style={{ color: '#fff' }}>{targetUser.firstName} {targetUser.lastName}</strong> from the system.
        </p>
        <p style={{ opacity: 0.5, fontSize: '0.8rem', margin: '0 0 1.5rem' }}>
          This action cannot be undone. Type <strong style={{ color: '#ffcb42', fontFamily: 'monospace' }}>{targetUser.userId}</strong> to confirm.
        </p>
        <input
          className="pam-input"
          placeholder={`Type "${targetUser.userId}" to confirm`}
          value={confirm}
          onChange={e => setConfirm(e.target.value)}
          style={{ marginBottom: '1.5rem' }}
        />
        <div style={{ display: 'flex', gap: '0.8rem', justifyContent: 'flex-end' }}>
          <button onClick={onClose} style={{ padding: '0.6rem 1.2rem', borderRadius: '8px', background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.15)', color: '#fff', cursor: 'pointer' }}>Cancel</button>
          <button
            onClick={handleDelete}
            disabled={confirm !== targetUser.userId || deleting}
            style={{
              padding: '0.6rem 1.2rem', borderRadius: '8px', cursor: confirm === targetUser.userId ? 'pointer' : 'not-allowed',
              background: confirm === targetUser.userId ? 'linear-gradient(90deg,#b00020,#d00030)' : 'rgba(255,60,60,0.1)',
              border: '1px solid rgba(255,60,60,0.4)', color: '#ffcaca', fontWeight: 700, fontSize: '0.85rem',
              opacity: confirm === targetUser.userId ? 1 : 0.5,
            }}
          >
            {deleting ? 'Deleting…' : 'Delete User'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Main Page ───────────────────────────────────────────────────────────────
export default function UserManagement() {
  const { user: currentUser, isAdmin, isSuperAdmin } = useAuth();
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterRole, setFilterRole] = useState('ALL');
  const [showCreate, setShowCreate] = useState(false);
  const [editModal, setEditModal] = useState(null);
  const [deleteModal, setDeleteModal] = useState(null);
  const [actionLoading, setActionLoading] = useState(null);

  const fetchUsers = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API}/api/users`);
      if (res.ok) setUsers(await res.json() || []);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchUsers(); }, [fetchUsers]);

  // Enable/Disable toggles are now managed inside the EditUserModal.

  const isProtectedSuperAdmin = (u) => u.userRoleId === ROLE_ID_MAP.SUPER_ADMIN;

  const filtered = users.filter(u => {
    const matchSearch = search === '' ||
      u.firstName?.toLowerCase().includes(search.toLowerCase()) ||
      u.lastName?.toLowerCase().includes(search.toLowerCase()) ||
      u.userId?.toLowerCase().includes(search.toLowerCase()) ||
      u.email?.toLowerCase().includes(search.toLowerCase());
    const userRoleName = roleNameFromId(u.userRoleId);
    const matchRole = filterRole === 'ALL' || userRoleName === filterRole;
    return matchSearch && matchRole;
  });

  const stats = {
    total: users.length,
    superAdmins: users.filter(u => roleNameFromId(u.userRoleId) === 'SUPER_ADMIN').length,
    admins: users.filter(u => roleNameFromId(u.userRoleId) === 'ADMIN').length,
    regularUsers: users.filter(u => roleNameFromId(u.userRoleId) === 'USER').length,
    disabled: users.filter(u => !u.isActive).length,
  };

  return (
    <div className="pam-container">
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1.5rem' }}>
        <div>
          <h1 style={{ margin: 0, textShadow: '0 2px 10px rgba(0,0,0,0.5)' }}>User Management</h1>
          <p style={{ margin: '0.3rem 0 0', opacity: 0.6, fontSize: '0.85rem' }}>
            {isSuperAdmin ? 'Manage all users, roles, and account status' : 'Manage user accounts and status'}
          </p>
        </div>
        <button className="pam-button" onClick={() => setShowCreate(true)}>
          ➕ Create User
        </button>
      </div>

      {/* Stat cards */}
      <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', marginBottom: '1.5rem' }}>
        {[
          ['Total Users', stats.total, '#4facfe'],
          ['Super Admin', stats.superAdmins, '#ffcb42'],
          ['Admins', stats.admins, '#4facfe'],
          ['Regular Users', stats.regularUsers, '#a8ffca'],
          ['Disabled', stats.disabled, '#ffcaca'],
        ].map(([label, val, color]) => (
          <div key={label} style={{ flex: 1, minWidth: '120px', padding: '1rem 1.2rem', borderRadius: '10px', background: `${color}10`, border: `1px solid ${color}30` }}>
            <div style={{ fontSize: '1.6rem', fontWeight: 800, color }}>{val}</div>
            <div style={{ fontSize: '0.78rem', opacity: 0.7 }}>{label}</div>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div style={{ display: 'flex', gap: '1rem', marginBottom: '1.2rem', flexWrap: 'wrap', alignItems: 'center' }}>
        <input
          className="pam-input"
          placeholder="🔍 Search by name, UserID, or email…"
          value={search}
          onChange={e => setSearch(e.target.value)}
          style={{ flex: 1, minWidth: '220px' }}
        />
        <div style={{ display: 'flex', gap: '0.25rem', background: 'rgba(255,255,255,0.05)', padding: '0.25rem', borderRadius: '8px' }}>
          {['ALL', 'SUPER_ADMIN', 'ADMIN', 'USER'].map(role => (
            <button key={role} onClick={() => setFilterRole(role)} style={{
              padding: '0.35rem 0.9rem', borderRadius: '6px', border: 'none', cursor: 'pointer', fontSize: '0.8rem',
              fontWeight: filterRole === role ? 700 : 400,
              background: filterRole === role ? 'rgba(79,172,254,0.25)' : 'transparent',
              color: filterRole === role ? '#4facfe' : 'rgba(255,255,255,0.55)',
            }}>
              {role === 'ALL' ? 'All' : role === 'SUPER_ADMIN' ? 'Super Admin' : role === 'ADMIN' ? 'Admin' : 'User'}
            </button>
          ))}
        </div>
      </div>

      {/* User Table */}
      <div className="pam-card" style={{ overflowX: 'auto' }}>
        {loading ? (
          <p style={{ padding: '2rem', opacity: 0.6 }}>Loading users…</p>
        ) : filtered.length === 0 ? (
          <p style={{ padding: '2rem', opacity: 0.6 }}>No users found matching your filters.</p>
        ) : (
          <table className="pam-table">
            <thead>
              <tr>
                <th>User</th>
                <th>User ID</th>
                <th>Email</th>
                <th>Role</th>
                <th>Status</th>
                <th>Last Login</th>
                <th style={{ textAlign: 'center' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(u => {
                const roleName = roleNameFromId(u.userRoleId);
                const rb = ROLE_BADGE[roleName] || ROLE_BADGE.USER;
                const sb = u.isActive ? STATUS_BADGE.active : STATUS_BADGE.inactive;
                const isMe = u.id === currentUser?.id;
                const isProtected = isProtectedSuperAdmin(u);
                const busy = actionLoading === u.id;

                return (
                  <tr key={u.id} style={{ opacity: u.isActive ? 1 : 0.55 }}>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <div style={{
                          width: '32px', height: '32px', borderRadius: '50%', flexShrink: 0,
                          background: isProtected
                            ? 'linear-gradient(135deg, #ffcb42, #ff8c00)'
                            : 'linear-gradient(135deg, #4facfe, #a8ffca)',
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          color: '#000', fontWeight: 800, fontSize: '0.8rem',
                        }}>
                          {isProtected ? '★' : (u.firstName?.[0] || '?').toUpperCase()}
                        </div>
                        <div>
                          <div style={{ fontWeight: 600 }}>
                            {u.firstName} {u.lastName}
                            {isMe && <span style={{ marginLeft: '6px', fontSize: '0.7rem', color: '#4facfe', opacity: 0.8 }}>(you)</span>}
                          </div>
                          {u.remark && <div style={{ fontSize: '0.72rem', opacity: 0.5 }}>{u.remark}</div>}
                        </div>
                      </div>
                    </td>
                    <td style={{ fontFamily: 'monospace', fontSize: '0.85rem' }}>{u.userId}</td>
                    <td style={{ opacity: 0.8, fontSize: '0.85rem' }}>{u.email}</td>
                    <td><span style={badgeStyle(rb)}>{rb.label}</span></td>
                    <td><span style={badgeStyle(sb)}>{sb.label}</span></td>
                    <td style={{ opacity: 0.55, fontSize: '0.78rem' }}>
                      {u.lastLogin && u.lastLogin !== '0001-01-01T00:00:00Z'
                        ? new Date(u.lastLogin).toLocaleDateString()
                        : 'Never'}
                    </td>
                    <td>
                      <div style={{ display: 'flex', gap: '0.4rem', justifyContent: 'center', flexWrap: 'wrap' }}>
                        {isProtected ? (
                          <span style={{ fontSize: '0.72rem', opacity: 0.35, fontStyle: 'italic' }}>Protected</span>
                        ) : isMe ? (
                          <span style={{ fontSize: '0.72rem', opacity: 0.35, fontStyle: 'italic' }}>—</span>
                        ) : (
                          <>
                            {/* Edit User details, Status & Role */}
                            <button onClick={() => setEditModal(u)} style={btnStyle('#ffcb42')} disabled={busy}>
                              ✏️ Edit
                            </button>

                            {/* Delete — Super Admin only, shows modal with type-to-confirm */}
                            {isSuperAdmin && (
                              <button onClick={() => setDeleteModal(u)} style={btnStyle('#ff4c4c')} disabled={busy}>
                                🗑 Delete
                              </button>
                            )}
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Modals */}
      {showCreate  && <CreateUserModal onCreated={fetchUsers} onClose={() => setShowCreate(false)} />}
      {editModal   && <EditUserModal targetUser={editModal} isSuperAdmin={isSuperAdmin} onUpdated={fetchUsers} onClose={() => setEditModal(null)} />}
      {deleteModal && <DeleteConfirmModal targetUser={deleteModal} onDeleted={fetchUsers} onClose={() => setDeleteModal(null)} />}
    </div>
  );
}

const btnStyle = (color) => ({
  padding: '0.3rem 0.65rem', borderRadius: '6px', cursor: 'pointer',
  background: `${color}15`, border: `1px solid ${color}55`, color,
  fontSize: '0.75rem', fontWeight: 600, transition: 'background 0.15s',
  whiteSpace: 'nowrap',
});
