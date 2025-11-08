'use client';

import React, { createContext, useContext, useMemo } from 'react';
import useSWR from 'swr';
import { useLanguage } from './LanguageContext';

export type TranslationsMap = Record<string, { key: string; category?: string; no?: string; en?: string }>;

type TranslationsContextType = {
  translations: TranslationsMap;
  t: (key: string, fallback?: string) => string;
};

const TranslationsContext = createContext<TranslationsContextType | undefined>(undefined);

const API_BASE = process.env.NEXT_PUBLIC_API_BASE || 'http://localhost:4000';

export function TranslationsProvider({ children }: { children: React.ReactNode }) {
  const { language } = useLanguage();
  const { data } = useSWR<TranslationsMap>(`${API_BASE}/api/cms/translations`, async (url: string) => {
    const res = await fetch(url, { cache: 'no-store' });
    if (!res.ok) throw new Error('Failed to load translations');
    return res.json();
  }, { revalidateOnFocus: false });

  const t = useMemo(() => {
    const map = data || {};
    return (key: string, fallback?: string) => {
      const entry = map[key];
      if (!entry) return fallback ?? key;
      const val = language === 'en' ? (entry.en ?? entry.no) : (entry.no ?? entry.en);
      return (val && String(val).trim()) || fallback || key;
    };
  }, [data, language]);

  return (
    <TranslationsContext.Provider value={{ translations: data || {}, t }}>
      {children}
    </TranslationsContext.Provider>
  );
}

export function useTranslations() {
  const ctx = useContext(TranslationsContext);
  if (!ctx) throw new Error('useTranslations must be used within TranslationsProvider');
  return ctx;
}