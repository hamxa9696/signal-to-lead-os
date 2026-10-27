import type { Metadata } from "next";
import { Inter_Tight, JetBrains_Mono, Noto_Sans_JP } from "next/font/google";
import { authConfigured } from "@/lib/auth";
import { Sidebar } from "./sidebar";
import { signOut } from "./login/actions";
import "./globals.css";

const inter = Inter_Tight({ subsets: ["latin"], variable: "--font-inter-tight", display: "swap" });
const mono = JetBrains_Mono({ subsets: ["latin"], variable: "--font-jetbrains", display: "swap" });
const jp = Noto_Sans_JP({ weight: ["400", "500", "700"], subsets: ["latin"], variable: "--font-noto-jp", display: "swap", preload: false });

export const metadata: Metadata = {
  title: "Signal-to-Lead OS",
  description: "Renesis content + inbound pipeline for the Japanese market.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${inter.variable} ${mono.variable} ${jp.variable}`}>
      <body className="min-h-screen antialiased">
        <div className="flex min-h-screen flex-wrap">
          <Sidebar signOut={authConfigured() ? signOut : null} />
          <div className="min-w-0 flex-[999_1_640px]">{children}</div>
        </div>
      </body>
    </html>
  );
}
