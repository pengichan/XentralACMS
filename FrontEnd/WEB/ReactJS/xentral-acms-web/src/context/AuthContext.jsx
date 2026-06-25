import React, { createContext, useContext, useState, useCallback, useEffect } from 'react';
import * as signalR from '@microsoft/signalr';

const AuthContext = createContext(null);

// Role constants — must match the role_name values in dbo.user_role
export const ROLES = {
  SUPER_ADMIN: 'SUPER_ADMIN',
  ADMIN: 'ADMIN',
  USER: 'USER',
};

export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => {
    try {
      const stored = sessionStorage.getItem('xentral_user');
      return stored ? JSON.parse(stored) : null;
    } catch {
      return null;
    }
  });

  useEffect(() => {
    if (!user?.id) return;

    const connection = new signalR.HubConnectionBuilder()
      .withUrl('http://localhost:8080/api/system/events')
      .withAutomaticReconnect()
      .build();

    connection.on('OnEventUpdate', (message) => {
      try {
        const payload = JSON.parse(message);
        window.dispatchEvent(new CustomEvent('xentral_events_update', { detail: payload }));
      } catch (err) {
        console.error('Failed to parse event update message:', err);
      }
    });

    let isMounted = true;
    const startConnection = async () => {
      try {
        await connection.start();
        console.log('SignalR connected successfully!');
      } catch (err) {
        console.error('SignalR Hub connection failed, retrying in 5s...', err);
        if (isMounted) {
          setTimeout(startConnection, 5000);
        }
      }
    };

    startConnection();

    return () => {
      isMounted = false;
      connection.stop()
        .then(() => console.log('SignalR disconnected successfully.'))
        .catch((err) => console.error('SignalR stop failed:', err));
    };
  }, [user?.id]);


  const login = useCallback((userData) => {
    sessionStorage.setItem('xentral_user', JSON.stringify(userData));
    setUser(userData);
  }, []);

  const updateUser = useCallback((updatedFields) => {
    setUser((prev) => {
      if (!prev) return null;
      const newUser = { ...prev, ...updatedFields };
      sessionStorage.setItem('xentral_user', JSON.stringify(newUser));
      return newUser;
    });
  }, []);

  const logout = useCallback(() => {
    const stored = sessionStorage.getItem('xentral_user');
    if (stored) {
      try {
        const userData = JSON.parse(stored);
        const uId = userData?.userId || userData?.user_id || userData?.id;
        if (uId) {
          fetch('http://localhost:8080/api/users/logout', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ userId: uId })
          }).catch(err => console.error('Logout API call failed', err));
        }
      } catch (e) {
        console.error('Logout parsing error', e);
      }
    }
    sessionStorage.removeItem('xentral_user');
    setUser(null);
  }, []);

  const isAdmin = user?.roleName === ROLES.ADMIN || user?.roleName === ROLES.SUPER_ADMIN;
  const isSuperAdmin = user?.roleName === ROLES.SUPER_ADMIN;
  const isUser = user?.roleName === ROLES.USER;

  return (
    <AuthContext.Provider value={{ user, login, logout, updateUser, isAdmin, isSuperAdmin, isUser }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}
