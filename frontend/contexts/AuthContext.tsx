"use client";
import { createContext, useContext, useState, useEffect, ReactNode } from 'react';

interface User {
  email: string;
  name?: string;
  picture?: string;
}

interface AuthContextType {
  user: User | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  login: () => void;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Load user from localStorage on mount
  useEffect(() => {
    const storedUser = localStorage.getItem('smart_timing_user');
    if (storedUser) {
      try {
        setUser(JSON.parse(storedUser));
      } catch (e) {
        console.error('Failed to parse stored user:', e);
        localStorage.removeItem('smart_timing_user');
      }
    }
    setIsLoading(false);
  }, []);

  // Check for OAuth callback on mount
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const googleAuth = params.get('google_auth');
    const userEmail = params.get('user_email');
    const userName = params.get('user_name');
    const userPicture = params.get('user_picture');

    if (googleAuth === 'success' && userEmail) {
      const newUser: User = {
        email: userEmail,
        name: userName || undefined,
        picture: userPicture || undefined,
      };
      setUser(newUser);
      localStorage.setItem('smart_timing_user', JSON.stringify(newUser));
      
      // Clean up URL
      window.history.replaceState({}, '', window.location.pathname);
    }
  }, []);

  const login = () => {
    // Redirect to Google OAuth
    const apiBase = process.env.NEXT_PUBLIC_API_BASE || 'http://localhost:4000';
    window.location.href = `${apiBase}/api/auth/google?user_id=oauth`;
  };

  const logout = () => {
    setUser(null);
    localStorage.removeItem('smart_timing_user');
    window.location.href = '/login';
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        isLoading,
        isAuthenticated: !!user,
        login,
        logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
