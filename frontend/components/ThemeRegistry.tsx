"use client";
import { ReactNode, useState, useEffect, createContext, useContext } from "react";
import { CssBaseline, ThemeProvider, createTheme, PaletteMode } from "@mui/material";

const ThemeModeContext = createContext({
  mode: 'dark' as PaletteMode,
  toggleMode: () => {},
});

export function useThemeMode() {
  return useContext(ThemeModeContext);
}

export default function ThemeRegistry({ children }: { children: ReactNode }) {
  const [mode, setMode] = useState<PaletteMode>('dark');

  useEffect(() => {
    const saved = localStorage.getItem('theme-mode') as PaletteMode;
    if (saved) setMode(saved);
  }, []);

  const toggleMode = () => {
    setMode((prev) => {
      const newMode = prev === 'dark' ? 'light' : 'dark';
      localStorage.setItem('theme-mode', newMode);
      return newMode;
    });
  };

  const theme = createTheme({
    palette: { mode },
    typography: { fontFamily: "Inter, Roboto, Helvetica, Arial, sans-serif" },
  });

  return (
    <ThemeModeContext.Provider value={{ mode, toggleMode }}>
      <ThemeProvider theme={theme}>
        <CssBaseline />
        {children}
      </ThemeProvider>
    </ThemeModeContext.Provider>
  );
}
