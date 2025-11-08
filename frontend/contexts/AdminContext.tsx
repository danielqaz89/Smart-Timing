'use client';

import React, { createContext, useContext, useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';

const API_BASE = process.env.NEXT_PUBLIC_API_BASE || 'http://localhost:4000';

interface AdminUser {
  id: number;
  username: string;
  email: string;
  role: string;
  last_login?: string;
}

interface AdminContextType {
  admin: AdminUser | null;
  token: string | null;
  loading: boolean;
  logout: () => void;
  fetchWithAuth: (url: string, options?: RequestInit) => Promise<Response>;
}

const AdminContext = createContext<AdminContextType | undefined>(undefined);

export function AdminProvider({ children }: { children: React.ReactNode }) {
  const [admin, setAdmin] = useState<AdminUser | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  useEffect(() => {
    // Load admin from localStorage on mount
    const storedToken = localStorage.getItem('admin_token');
    const storedAdmin = localStorage.getItem('admin_user');

    if (storedToken && storedAdmin) {
      setToken(storedToken);
      setAdmin(JSON.parse(storedAdmin));
    }

    setLoading(false);
  }, []);

  const logout = () => {
    localStorage.removeItem('admin_token');
    localStorage.removeItem('admin_user');
    setAdmin(null);
    setToken(null);
    router.push('/admin');
  };

  const fetchWithAuth = async (url: string, options: RequestInit = {}) => {
    const isFormData = typeof window !== 'undefined' && (options.body instanceof FormData);
    const headers: any = {
      ...options.headers,
      Authorization: `Bearer ${token}`,
    };
    if (!isFormData) {
      headers['Content-Type'] = headers['Content-Type'] || 'application/json';
    }

    const response = await fetch(url, { ...options, headers });

    if (response.status === 401) {
      // Token expired or invalid, logout
      logout();
      throw new Error('Session expired');
    }

    return response;
  };

  return (
    <AdminContext.Provider value={{ admin, token, loading, logout, fetchWithAuth }}>
      {children}
    </AdminContext.Provider>
  );
}

export function useAdmin() {
  const context = useContext(AdminContext);
  if (context === undefined) {
    throw new Error('useAdmin must be used within AdminProvider');
  }
  return context;
}
