import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export default function NotificationBell() {
  const { user, isAdmin } = useAuth();
  const [notifications, setNotifications] = useState([]);
  const [isOpen, setIsOpen] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const dropdownRef = useRef(null);
  const navigate = useNavigate();

  const fetchNotifications = async () => {
    if (!user?.id) return;
    try {
      const res = await fetch(`http://localhost:8080/api/notifications?userId=${user.id}`);
      if (res.ok) {
        const data = await res.json();
        setNotifications(data);
        setUnreadCount(data.filter(n => !n.isRead).length);
      }
    } catch (e) {
      console.error('Failed to fetch notifications', e);
    }
  };

  useEffect(() => {
    fetchNotifications();

    // SSE Connection to listen for live alerts
    if (!user?.id) return;
    const eventSource = new EventSource('http://localhost:8080/api/system/events');

    eventSource.onmessage = (e) => {
      try {
        const payload = JSON.parse(e.data);
        if (payload.type === 'new_notification') {
          // If message is for this user OR role ADMIN for Admins
          if (payload.userId === user.id || (payload.userId === 'ROLE_ADMIN' && isAdmin)) {
            // Play subtle alert sound if possible, or just refetch notifications
            fetchNotifications();
            window.dispatchEvent(new CustomEvent('xentral_events_update', { detail: payload }));
          }
        }
      } catch (err) {
        // Ping
      }
    };

    // Close dropdown on click outside
    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);

    return () => {
      eventSource.close();
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [user?.id, isAdmin]);

  const handleMarkAsRead = async (id, e) => {
    if (e) e.stopPropagation();
    try {
      const res = await fetch(`http://localhost:8080/api/notifications/${id}/read`, {
        method: 'POST',
      });
      if (res.ok) {
        setNotifications(prev =>
          prev.map(n => n.id === id ? { ...n, isRead: true } : n)
        );
        setUnreadCount(prev => Math.max(0, prev - 1));
      }
    } catch (err) {
      console.error('Error marking notification as read', err);
    }
  };

  const handleNotificationClick = async (notif) => {
    if (!notif.isRead) {
      await handleMarkAsRead(notif.id);
    }
    setIsOpen(false);
    if (notif.link) {
      navigate(notif.link);
    }
  };

  const handleAction = async (ticketId, action, e) => {
    e.stopPropagation();
    try {
      const endpoint = action === 'approve' ? 'approve' : 'deny';
      const body = action === 'approve' 
        ? { approverId: user.userId, durationHours: 2 } 
        : { approverId: user.userId, reason: 'Declined via Notification Center' };

      const res = await fetch(`http://localhost:8080/api/tickets/${ticketId}/${endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      if (res.ok) {
        alert(`Access ticket successfully ${action}d!`);
        fetchNotifications();
      } else {
        const text = await res.text();
        alert(`Action failed: ${text || 'An error occurred'}`);
      }
    } catch (err) {
      console.error('Error performing ticket action', err);
    }
  };

  // Helper to extract ticket ID from links like "/tickets" or "/tickets/123"
  const getTicketIdFromLink = (link) => {
    if (!link) return null;
    const parts = link.split('/');
    return parts[parts.length - 1];
  };

  return (
    <div style={{ position: 'relative' }} ref={dropdownRef}>
      {/* Bell Icon Trigger */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        style={{
          background: 'rgba(255,255,255,0.06)',
          border: '1px solid rgba(255,255,255,0.1)',
          color: '#fff',
          width: '38px',
          height: '38px',
          borderRadius: '50%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          cursor: 'pointer',
          fontSize: '1.1rem',
          position: 'relative',
          transition: 'background 0.2s, transform 0.1s active',
        }}
      >
        🔔
        {unreadCount > 0 && (
          <span style={{
            position: 'absolute',
            top: '-2px',
            right: '-2px',
            background: '#ef4444',
            color: '#fff',
            fontSize: '0.65rem',
            fontWeight: 800,
            padding: '1px 5px',
            borderRadius: '999px',
            minWidth: '12px',
            textAlign: 'center',
            boxShadow: '0 2px 5px rgba(239, 68, 68, 0.5)'
          }}>
            {unreadCount}
          </span>
        )}
      </button>

      {/* Glassmorphic Dropdown Panel */}
      {isOpen && (
        <div style={{
          position: 'absolute',
          top: '48px',
          right: 0,
          width: '360px',
          background: 'rgba(10, 16, 32, 0.95)',
          backdropFilter: 'blur(20px)',
          border: '1px solid rgba(255,255,255,0.12)',
          borderRadius: '12px',
          boxShadow: '0 10px 30px rgba(0,0,0,0.5)',
          overflow: 'hidden',
          zIndex: 9999
        }}>
          {/* Header */}
          <div style={{
            padding: '1rem',
            borderBottom: '1px solid rgba(255,255,255,0.08)',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center'
          }}>
            <h4 style={{ margin: 0, color: '#fff', fontSize: '0.9rem', fontWeight: 600 }}>
              Notifications
            </h4>
            {unreadCount > 0 && (
              <span style={{ fontSize: '0.75rem', color: '#ffcb42', fontWeight: 500 }}>
                {unreadCount} unread
              </span>
            )}
          </div>

          {/* List */}
          <div style={{ maxHeight: '350px', overflowY: 'auto' }}>
            {notifications.length === 0 ? (
              <div style={{ padding: '2rem 1rem', textAlign: 'center', color: 'rgba(255,255,255,0.4)', fontSize: '0.8rem' }}>
                No notifications yet.
              </div>
            ) : (
              notifications.map((notif) => {
                const ticketId = getTicketIdFromLink(notif.link);
                const isPendingTicket = notif.title === 'New Access Ticket Request';

                return (
                  <div
                    key={notif.id}
                    onClick={() => handleNotificationClick(notif)}
                    style={{
                      padding: '0.9rem 1rem',
                      borderBottom: '1px solid rgba(255,255,255,0.05)',
                      background: notif.isRead ? 'transparent' : 'rgba(79, 172, 254, 0.05)',
                      cursor: 'pointer',
                      transition: 'background 0.2s',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '0.3rem'
                    }}
                    onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(255,255,255,0.03)'}
                    onMouseLeave={(e) => e.currentTarget.style.background = notif.isRead ? 'transparent' : 'rgba(79, 172, 254, 0.05)'}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '8px' }}>
                      <span style={{ fontSize: '0.82rem', fontWeight: 600, color: notif.isRead ? '#cbd5e1' : '#fff' }}>
                        {notif.title}
                      </span>
                      {!notif.isRead && (
                        <button
                          onClick={(e) => handleMarkAsRead(notif.id, e)}
                          title="Mark as read"
                          style={{
                            background: 'transparent',
                            border: 'none',
                            color: '#4facfe',
                            fontSize: '0.72rem',
                            cursor: 'pointer',
                            padding: 0
                          }}
                        >
                          ✓
                        </button>
                      )}
                    </div>

                    <p style={{ margin: 0, fontSize: '0.78rem', color: 'rgba(255,255,255,0.6)', lineHeight: 1.35 }}>
                      {notif.message}
                    </p>

                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '0.2rem' }}>
                      <span style={{ fontSize: '0.68rem', color: 'rgba(255,255,255,0.35)' }}>
                        {new Date(notif.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </span>

                      {/* Admin Quick Ticket Actions inside notification list */}
                      {isAdmin && isPendingTicket && ticketId && (
                        <div style={{ display: 'flex', gap: '8px' }} onClick={e => e.stopPropagation()}>
                          <button
                            onClick={(e) => handleAction(ticketId, 'approve', e)}
                            style={{
                              background: '#10b981',
                              color: '#fff',
                              border: 'none',
                              padding: '2px 8px',
                              borderRadius: '4px',
                              fontSize: '0.68rem',
                              fontWeight: 'bold',
                              cursor: 'pointer'
                            }}
                          >
                            Approve
                          </button>
                          <button
                            onClick={(e) => handleAction(ticketId, 'deny', e)}
                            style={{
                              background: '#ef4444',
                              color: '#fff',
                              border: 'none',
                              padding: '2px 8px',
                              borderRadius: '4px',
                              fontSize: '0.68rem',
                              fontWeight: 'bold',
                              cursor: 'pointer'
                            }}
                          >
                            Deny
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}
