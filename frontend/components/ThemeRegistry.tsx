"use client";
import { ReactNode } from "react";
import { CssBaseline, ThemeProvider, createTheme } from "@mui/material";

const theme = createTheme({
  palette: { mode: "dark" },
  typography: { fontFamily: "Inter, Roboto, Helvetica, Arial, sans-serif" },
});

export default function ThemeRegistry({ children }: { children: ReactNode }) {
  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      {children}
    </ThemeProvider>
  );
}
