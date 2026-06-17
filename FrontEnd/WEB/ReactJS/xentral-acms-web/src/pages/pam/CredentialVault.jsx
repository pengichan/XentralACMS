import React, { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';

export default function CredentialVault() {
  const { user, isSuperAdmin } = useAuth();
  const [servers, setServers] = useState([]);
  const [credentials, setCredentials] = useState([]);
  const [selectedServerId, setSelectedServerId] = useState('');
  const [formData, setFormData] = useState({ username: '', encryptedPassword: '', secretType: 'Password' });
  const [revealedPasswords, setRevealedPasswords] = useState({});
  const [editingCredentialId, setEditingCredentialId] = useState(null);

  useEffect(() => {
    fetchServers();
  }, []);

  useEffect(() => {
    if (selectedServerId) {
      fetchCredentials(selectedServerId);
    } else {
      setCredentials([]);
    }
  }, [selectedServerId]);

  const fetchServers = async () => {
    const res = await fetch('http://localhost:8080/api/servers');
    if (res.ok) setServers(await res.json() || []);
  };

  const fetchCredentials = async (serverId) => {
    const res = await fetch(`http://localhost:8080/api/credentials/${serverId}`);
    if (res.ok) setCredentials(await res.json() || []);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!selectedServerId) return alert('Select a server first');
    
    const isEdit = !!editingCredentialId;
    const url = isEdit 
      ? `http://localhost:8080/api/credentials/${editingCredentialId}`
      : 'http://localhost:8080/api/credentials';
      
    const payload = isEdit 
      ? { 
          username: formData.username,
          encryptedPassword: formData.encryptedPassword, // backend preserves existing if empty
          secretType: formData.secretType
        }
      : { ...formData, serverId: selectedServerId };

    const res = await fetch(url, {
      method: isEdit ? 'PUT' : 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    
    if (res.ok) {
      setFormData({ username: '', encryptedPassword: '', secretType: 'Password' });
      setEditingCredentialId(null);
      fetchCredentials(selectedServerId);
    } else {
      alert(isEdit ? 'Failed to update credential' : 'Failed to add credential');
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Are you sure you want to delete this credential?')) return;
    try {
      const res = await fetch(`http://localhost:8080/api/credentials/${id}`, {
        method: 'DELETE'
      });
      if (res.ok) {
        fetchCredentials(selectedServerId);
      } else {
        alert('Failed to delete credential');
      }
    } catch (e) {
      console.error(e);
    }
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
      const res = await fetch(`http://localhost:8080/api/credentials/${c.id}/reveal`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ actor: user?.userId || user?.email || 'unknown', role: isSuperAdmin ? 'SUPER_ADMIN' : 'ADMIN' })
      });
      if (res.ok) {
        const data = await res.json();
        setRevealedPasswords(prev => ({ ...prev, [c.id]: data.password }));
      } else {
        alert('Failed to reveal password: ' + await res.text());
      }
    } catch (err) {
      alert('Error revealing password: ' + err.message);
    }
  };

  const handleEdit = (c) => {
    setEditingCredentialId(c.id);
    setFormData({
      username: c.username,
      encryptedPassword: '', // leave empty unless changing it
      secretType: c.secretType
    });
  };

  const handleCancelEdit = () => {
    setEditingCredentialId(null);
    setFormData({ username: '', encryptedPassword: '', secretType: 'Password' });
  };

  return (
    <div className="pam-container">
      <h1 style={{ textShadow: '0 2px 10px rgba(0,0,0,0.5)' }}>Credential Vault</h1>
      
      <div style={{ display: 'flex', gap: '2rem', flexWrap: 'wrap' }}>
        <div className="pam-card" style={{ padding: '2rem', flex: '1', minWidth: '300px' }}>
          <h3>Select Server</h3>
          <select 
            className="pam-select"
            style={{ marginTop: '1rem' }}
            value={selectedServerId}
            onChange={(e) => {
              setSelectedServerId(e.target.value);
              setEditingCredentialId(null);
              setFormData({ username: '', encryptedPassword: '', secretType: 'Password' });
            }}
          >
            <option style={{color:'#000'}} value="">-- Select a Server --</option>
            {servers.map(s => <option style={{color:'#000'}} key={s.id} value={s.id}>{s.hostname} ({s.ipAddress})</option>)}
          </select>

          {selectedServerId && (
            <div style={{ marginTop: '2rem' }}>
              <h4>{editingCredentialId ? 'Edit Credential' : 'Add Credential'}</h4>
              <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1rem', marginTop: '1rem' }}>
                <input 
                  className="pam-input"
                  placeholder="Username" 
                  value={formData.username} 
                  onChange={(e) => setFormData({...formData, username: e.target.value})} 
                  required 
                />
                <input 
                  className="pam-input"
                  type="password"
                  placeholder={editingCredentialId ? "Password / Secret (leave blank to keep current)" : "Password / Secret"} 
                  value={formData.encryptedPassword} 
                  onChange={(e) => setFormData({...formData, encryptedPassword: e.target.value})} 
                  required={!editingCredentialId} 
                />
                <select 
                  className="pam-select"
                  value={formData.secretType}
                  onChange={(e) => setFormData({...formData, secretType: e.target.value})}
                >
                  <option style={{color:'#000'}} value="Password">Password</option>
                  <option style={{color:'#000'}} value="SSH Key">SSH Key</option>
                </select>


                <div style={{ display: 'flex', gap: '0.5rem' }}>
                  <button className="pam-button" style={{ flex: 1 }} type="submit">{editingCredentialId ? 'Update' : 'Save to Vault'}</button>
                  {editingCredentialId && (
                    <button 
                      className="pam-button" 
                      style={{ flex: 1, background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.15)' }} 
                      type="button" 
                      onClick={handleCancelEdit}
                    >
                      Cancel
                    </button>
                  )}
                </div>
              </form>
            </div>
          )}
        </div>

        <div style={{ flex: '2', minWidth: '300px', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <h3>Stored Credentials</h3>
          {!selectedServerId && <p style={{ opacity: 0.7 }}>Select a server to view credentials.</p>}
          {selectedServerId && credentials.length === 0 && <p style={{ opacity: 0.7 }}>No credentials found for this server.</p>}
          
          {selectedServerId && credentials.length > 0 && (
            <table className="pam-table">
              <thead>
                <tr>
                  <th>Account Name</th>
                  <th>Secret Type</th>
                  <th>Added Date</th>
                  <th>Secret</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {credentials.map(c => (
                  <tr key={c.id}>
                    <td style={{ fontWeight: 'bold', color: 'var(--auth-btn-mid, #4facfe)' }}>
                      👤 {c.username}
                    </td>
                    <td>{c.secretType}</td>

                    <td>{new Date(c.createdDate).toLocaleDateString()}</td>
                    <td>
                      {revealedPasswords[c.id] ? (
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <span style={{ fontFamily: 'monospace', color: '#ffcb42' }}>{revealedPasswords[c.id]}</span>
                          <button
                            onClick={() => {
                              navigator.clipboard.writeText(revealedPasswords[c.id]);
                              alert('Password copied to clipboard');
                            }}
                            style={{
                              background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.2)',
                              color: '#fff', borderRadius: '4px', cursor: 'pointer', padding: '0.15rem 0.35rem', fontSize: '0.68rem'
                            }}
                          >
                            📋 Copy
                          </button>
                        </div>
                      ) : (
                        <span style={{ opacity: 0.5, letterSpacing: '2px' }}>••••••••</span>
                      )}
                    </td>
                    <td>
                      <div style={{ display: 'flex', gap: '0.4rem' }}>
                        {isSuperAdmin && (
                          <button
                            onClick={() => handleReveal(c)}
                            style={{
                              background: 'transparent',
                              border: '1px solid rgba(255, 203, 66, 0.5)',
                              color: '#ffcb42',
                              padding: '0.4rem 0.8rem',
                              borderRadius: '6px',
                              cursor: 'pointer',
                              fontSize: '0.8rem'
                            }}
                          >
                            {revealedPasswords[c.id] ? 'Hide' : '👁 Reveal'}
                          </button>
                        )}
                        <button 
                          onClick={() => handleEdit(c)}
                          style={{
                            background: 'transparent',
                            border: '1px solid rgba(79, 172, 254, 0.5)',
                            color: '#4facfe',
                            padding: '0.4rem 0.8rem',
                            borderRadius: '6px',
                            cursor: 'pointer',
                            fontSize: '0.8rem'
                          }}
                        >
                          ✏️ Edit
                        </button>
                        <button 
                          onClick={() => handleDelete(c.id)}
                          style={{
                            background: 'transparent',
                            border: '1px solid rgba(255, 0, 0, 0.5)',
                            color: '#ffcaca',
                            padding: '0.4rem 0.8rem',
                            borderRadius: '6px',
                            cursor: 'pointer',
                            fontSize: '0.8rem'
                          }}
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
      </div>
    </div>
  );
}
