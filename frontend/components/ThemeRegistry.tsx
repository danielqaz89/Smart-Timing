"use client";
import { ReactNode, useState, useEffect, createContext, useContext } from "react";
import { CssBaseline, ThemeProvider, createTheme, PaletteMode } from "@mui/material";
import { SnackbarProvider } from 'notistack';
import { updateSettings, fetchSettings } from "../lib/api";

const ThemeModeContext = createContext({
  mode: 'dark' as PaletteMode,
  toggleMode: () => {},
});

export function useThemeMode() {
  return useContext(ThemeModeContext);
}

export default function ThemeRegistry({ children }: { children: ReactNode }) {
  const [mode, setMode] = useState<PaletteMode>('dark');
  const [loaded, setLoaded] = useState(false);

  // Load theme from database on mount
  useEffect(() => {
    fetchSettings('default').then(settings => {
      if (settings?.theme_mode) {
        setMode(settings.theme_mode as PaletteMode);
      }
      setLoaded(true);
    }).catch(() => setLoaded(true));
  }, []);

  const toggleMode = async () => {
    const newMode = mode === 'dark' ? 'light' : 'dark';
    setMode(newMode);
    
    // Save to database
    try {
      await updateSettings({ theme_mode: newMode }, 'default');
    } catch (e) {
      console.error('Failed to save theme mode:', e);
    }
  };

  const theme = createTheme({
    palette: { mode },
    typography: { fontFamily: "Inter, Roboto, Helvetica, Arial, sans-serif" },
  });

  return (
    <ThemeModeContext.Provider value={{ mode, toggleMode }}>
      <ThemeProvider theme={theme}>
        <CssBaseline />
        <SnackbarProvider maxSnack={3} autoHideDuration={2500} anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}>
          {children}
        </SnackbarProvider>
      </ThemeProvider>
    </ThemeModeContext.Provider>
  );
}
