import type { Metadata, Viewport } from "next";
import { headers } from "next/headers";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

import { Toaster } from "@/components/ui/sonner";
import { APPLE_TOUCH_ICON, PWA_THEME_COLOR } from "@/lib/pwa/constants";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: { default: "EasyGlowCare", template: "%s · EasyGlowCare" },
  description: "Agendamento online para clínicas de estética.",
  icons: { apple: APPLE_TOUCH_ICON },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: PWA_THEME_COLOR,
};

export default async function RootLayout({ children }: LayoutProps<"/">) {
  // Lê a requisição para que nenhuma página seja gerada no build: o nonce da CSP (proxy.ts)
  // só existe por requisição, e uma página pré-gerada sairia com scripts sem nonce.
  await headers();

  return (
    <html
      lang="pt-BR"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        {children}
        <Toaster />
      </body>
    </html>
  );
}
