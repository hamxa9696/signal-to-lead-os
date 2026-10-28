import type { Metadata } from "next";
import { Inter_Tight, JetBrains_Mono, Noto_Sans_JP } from "next/font/google";
import { authConfigured } from "@/lib/auth";
import { Sidebar } from "./sidebar";
import { Translator } from "./translator";
import { signOut } from "./login/actions";
import "./globals.css";

const inter = Inter_Tight({ subsets: ["latin"], variable: "--font-inter-tight", display: "swap" });
const mono = JetBrains_Mono({ subsets: ["latin"], variable: "--font-jetbrains", display: "swap" });
const jp = Noto_Sans_JP({ weight: ["400", "500", "700"], subsets: ["latin"], variable: "--font-noto-jp", display: "swap", preload: false });

export const metadata: Metadata = {
  title: "Signal-to-Lead OS",
  description: "Renesis content + inbound pipeline for the Japanese market.",
  // Browser auto-translation (e.g. Chrome Translate) rewrites the page behind React's back and makes
  // navigation crash. The app has its own 日本語 / English switch instead.
  other: { google: "notranslate" },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" translate="no" className={`${inter.variable} ${mono.variable} ${jp.variable}`}>
      <body className="min-h-screen antialiased">
        <div className="flex min-h-screen flex-wrap">
          <Sidebar signOut={authConfigured() ? signOut : null} />
          <div className="min-w-0 flex-[999_1_640px]">{children}</div>
          <Translator />
        </div>
      </body>
    </html>
  );
}
