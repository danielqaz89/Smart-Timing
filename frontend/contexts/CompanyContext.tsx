'use client';

import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { useRouter } from 'next/navigation';

const API_BASE = process.env.NEXT_PUBLIC_API_BASE || 'http://localhost:4000';

interface CompanyUser {
  id: number;
  email: string;
  role: 'admin' | 'case_manager' | 'member';
  approved: boolean;
}

interface Company {
  id: number;
  name: string;
  logo_base64?: string;
}

interface CompanyContextType {
  company: Company | null;
  user: CompanyUser | null;
  token: string | null;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
  fetchWithAuth: (url: string, options?: RequestInit) => Promise<Response>;
  hasRole: (...roles: Array<'admin' | 'case_manager' | 'member'>) => boolean;
}

const CompanyContext = createContext<CompanyContextType | undefined>(undefined);

export function CompanyProvider({ children }: { children: ReactNode }) {
  const [company, setCompany] = useState<Company | null>(null);
  const [user, setUser] = useState<CompanyUser | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const router = useRouter();

  useEffect(() => {
    // Load token from localStorage on mount
    const storedToken = localStorage.getItem('company_token');
    if (storedToken) {
      setToken(storedToken);
      fetchUserInfo(storedToken);
    } else {
      setIsLoading(false);
    }
  }, []);

  const fetchUserInfo = async (authToken: string) => {
    try {
      const response = await fetch(`${API_BASE}/api/company/me`, {
        headers: {
          'Authorization': `Bearer ${authToken}`,
        },
      });

      if (!response.ok) {
        throw new Error('Failed to fetch user info');
      }

      const data = await response.json();
      setCompany(data.company);
      setUser(data.user);
    } catch (error) {
      console.error('Failed to fetch user info:', error);
      // Clear invalid token
      localStorage.removeItem('company_token');
      setToken(null);
    } finally {
      setIsLoading(false);
    }
  };

  const login = async (email: string, password: string) => {
    const response = await fetch(`${API_BASE}/api/company/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });

    if (!response.ok) {
      const data = await response.json();
      throw new Error(data.error || 'Login failed');
    }

    const data = await response.json();
    const newToken = data.token;

    localStorage.setItem('company_token', newToken);
    setToken(newToken);
    
    await fetchUserInfo(newToken);
    router.push('/portal/dashboard');
  };

  const logout = () => {
    localStorage.removeItem('company_token');
    setToken(null);
    setCompany(null);
    setUser(null);
    router.push('/portal/login');
  };

  const fetchWithAuth = async (url: string, options: RequestInit = {}) => {
    if (!token) {
      throw new Error('No authentication token');
    }

    const response = await fetch(url, {
      ...options,
      headers: {
        ...options.headers,
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
    });

    // Auto-logout on 401
    if (response.status === 401) {
      logout();
      throw new Error('Session expired');
    }

    return response;
  };

  const hasRole = (...roles: Array<'admin' | 'case_manager' | 'member'>) => {
    if (!user) return false;
    return roles.includes(user.role);
  };

  return (
    <CompanyContext.Provider
      value={{
        company,
        user,
        token,
        isLoading,
        login,
        logout,
        fetchWithAuth,
        hasRole,
      }}
    >
      {children}
    </CompanyContext.Provider>
  );
}

export function useCompany() {
  const context = useContext(CompanyContext);
  if (context === undefined) {
    throw new Error('useCompany must be used within a CompanyProvider');
  }
  return context;
}
