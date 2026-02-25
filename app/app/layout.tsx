import type { Metadata } from "next";
import "./globals.css";
import { ThemeProvider } from "./components/providers/theme-provider";

export const metadata: Metadata = {
  title: "Twitch Chat Toolkit",
  description: "Download and search Twitch chat logs",
};

import { ReduxProvider } from "./components/ReduxProvider";
import { Analytics } from "@vercel/analytics/next";

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="antialiased">
        <ReduxProvider>
          <ThemeProvider
            attribute="class"
            defaultTheme="system"
            enableSystem
            disableTransitionOnChange
          >
            {children}
            <Analytics />
          </ThemeProvider>
        </ReduxProvider>
      </body>
    </html>
  );
}
