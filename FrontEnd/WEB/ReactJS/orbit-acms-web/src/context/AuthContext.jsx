import React, { createContext, useContext, useState, useCallback } from 'react';

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

  const login = useCallback((userData) => {
    sessionStorage.setItem('xentral_user', JSON.stringify(userData));
    setUser(userData);
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
    <AuthContext.Provider value={{ user, login, logout, isAdmin, isSuperAdmin, isUser }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}
