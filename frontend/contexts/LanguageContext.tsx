'use client';

import React, { createContext, useContext, useEffect, useRef, useState } from 'react';
import { useSnackbar } from 'notistack';
import { fetchSettings, updateSettings } from '../lib/api';

export type Language = 'no' | 'en';

type LanguageContextType = {
  language: Language;
  setLanguage: (lang: Language) => void;
};

const LanguageContext = createContext<LanguageContextType | undefined>(undefined);

export function LanguageProvider({ children }: { children: React.ReactNode }) {
  const { enqueueSnackbar, closeSnackbar } = useSnackbar();
  const [language, setLang] = useState<Language>('no');
  const prevRef = useRef<Language>('no');
  const [ready, setReady] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const s = await fetchSettings('default');
        const lang = (s?.language as Language) || 'no';
        setLang(lang);
        prevRef.current = lang;
      } catch {
        // fall back to default
        setLang('no');
        prevRef.current = 'no';
      } finally {
        setReady(true);
      }
    })();
  }, []);

  const setLanguage = (lang: Language) => {
    if (!ready) return;
    if (lang === language) return;
    const previous = language;
    prevRef.current = previous;
    setLang(lang);
    // persist to DB
    updateSettings({ language: lang }, 'default').catch(() => {});

    const label = lang === 'en' ? 'English' : 'Norsk';
    const undoLabel = previous === 'en' ? 'English' : 'Norsk';
    const key = enqueueSnackbar(`Språk endret til ${label}`, {
      variant: 'info',
      autoHideDuration: 5000,
      action: (
        <button
          onClick={() => {
            setLang(previous);
            updateSettings({ language: previous }, 'default').catch(() => {});
            closeSnackbar(key as any);
            enqueueSnackbar(`Angret – tilbake til ${undoLabel}`, { variant: 'success' });
          }}
          style={{
            background: 'transparent',
            border: 'none',
            color: '#1976d2',
            cursor: 'pointer',
            fontWeight: 600,
          }}
        >
          Angre
        </button>
      ),
    } as any);
  };

  return (
    <LanguageContext.Provider value={{ language, setLanguage }}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useLanguage() {
  const ctx = useContext(LanguageContext);
  if (!ctx) throw new Error('useLanguage must be used within LanguageProvider');
  return ctx;
}
