import ThemeRegistry from "../components/ThemeRegistry";
import PWA from "../components/PWA";
import type { ReactNode } from "react";

export const metadata = {
  title: "Smart Stempling",
  manifest: "/manifest.webmanifest",
  icons: {
    icon: "/icons/icon.svg",
    apple: "/icons/icon.svg",
  },
};

export const viewport = {
  themeColor: "#0b1220",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="no">
      <body>
        <ThemeRegistry>
          <PWA />
          {children}
        </ThemeRegistry>
      </body>
    </html>
  );
}
