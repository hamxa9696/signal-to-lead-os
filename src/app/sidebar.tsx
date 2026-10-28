"use client";
import Link from "next/link";
import { PendingButton } from "./pending-button";
import { LangSwitch } from "./translator";
import { usePathname } from "next/navigation";

const ICONS: Record<string, React.ReactNode> = {
  performance: <path d="M4 20V10M10 20V4M16 20v-7M22 20H2" />,
  topics: <path d="M4 6h16M4 12h16M4 18h10" />,
  signals: (
    <>
      <path d="M4 12a8 8 0 0 1 16 0M8 12a4 4 0 0 1 8 0" />
      <circle cx="12" cy="12" r="1" />
    </>
  ),
  review: <path d="M4 4v6h6M20 20v-6h-6M5 15a7 7 0 0 0 12 2M19 9A7 7 0 0 0 7 7" />,
  delivery: <path d="M4 6l8 7 8-7M4 6h16v12H4z" />,
  audience: <path d="M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM2 21v-1a6 6 0 0 1 12 0v1M16 3.5a4 4 0 0 1 0 7.5M22 21v-1a6 6 0 0 0-4-5.6" />,
  categories: <path d="M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z" />,
  forecast: <path d="M3 17l5-5 4 3 7-8M15 7h4v4" />,
  sources: <path d="M4 11a9 9 0 0 1 9 9M4 4a16 16 0 0 1 16 16M5 19h.01" />,
  knowledge: <path d="M5 4h11l3 3v13H5zM9 10h6M9 14h6" />,
  status: (
    <>
      <circle cx="12" cy="12" r="3" />
      <path d="M12 2v3M12 19v3M2 12h3M19 12h3" />
    </>
  ),
};

const GROUPS = [
  {
    label: "Plan",
    links: [
      { href: "/performance", label: "Performance", icon: "performance" },
      { href: "/topics", label: "Topics & signals", icon: "topics", also: ["/signals"] },
      { href: "/forecast", label: "Trend forecast", icon: "forecast" },
      { href: "/review", label: "Monthly review", icon: "review" },
    ],
  },
  {
    label: "Inputs",
    links: [
      { href: "/categories", label: "Categories", icon: "categories" },
      { href: "/sources", label: "Sources", icon: "sources" },
      { href: "/audience", label: "Audience", icon: "audience" },
      { href: "/knowledge", label: "Knowledge", icon: "knowledge" },
    ],
  },
  { label: "System", links: [{ href: "/status", label: "Status", icon: "status" }] },
];

export function Sidebar({ signOut }: { signOut: (() => Promise<void>) | null }) {
  const path = usePathname();
  if (path.startsWith("/login") || path.startsWith("/auth")) return null;
  return (
    <aside className="flex w-full flex-col gap-3 border-b border-line bg-sidebar px-4 py-3 md:sticky md:gap-6 md:py-5 md:top-0 md:h-screen md:w-[248px] md:flex-none md:border-r md:border-b-0">
      <Link href="/performance" className="flex items-center gap-3 px-2" aria-label="Kizashi home">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/brand/kizashi-logo.png" alt="" width={40} height={38} className="h-[38px] w-10 shrink-0 rounded-[10px] object-cover shadow-[0_1px_2px_rgba(30,58,49,0.12)]" />
        <span className="min-w-0">
          <span className="block text-[13px] font-semibold tracking-[0.28em] text-ink">KIZASHI</span>
          <span className="block text-[11px] text-faint"><span lang="ja" className="font-[family-name:var(--font-mincho)]">兆し</span> · Renesis Tech Japan</span>
        </span>
      </Link>
      <nav aria-label="Main" className="-mx-4 flex flex-nowrap gap-x-0.5 overflow-x-auto px-4 md:mx-0 md:flex-col md:gap-y-4 md:overflow-visible md:px-0">
        {GROUPS.map((g) => (
          <div key={g.label} className="flex shrink-0 flex-nowrap gap-0.5 md:flex-col">
            <p className="eyebrow mb-1 ml-3 hidden md:block">{g.label}</p>
            {g.links.map((l) => {
              const active = [l.href, ...(("also" in l && l.also) || [])].some((h) => path === h || path.startsWith(`${h}/`));
              return (
                <Link
                  key={l.href}
                  href={l.href}
                  aria-current={active ? "page" : undefined}
                  className={`flex min-h-[36px] shrink-0 items-center gap-2.5 whitespace-nowrap rounded-lg px-3 py-1.5 text-sm ${
                    active ? "bg-surface font-semibold text-ink shadow-[0_1px_2px_rgba(16,24,40,0.06),0_0_0_1px_var(--color-line)]" : "text-muted hover:bg-subtle hover:text-ink"
                  }`}
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke={active ? "var(--color-accent)" : "currentColor"} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    {ICONS[l.icon]}
                  </svg>
                  {l.label}
                </Link>
              );
            })}
          </div>
        ))}
      </nav>
      <div className="flex items-center gap-3 md:mt-auto md:flex-col md:items-stretch">
        <div className="flex-1">
          <p className="eyebrow mb-1.5 ml-1 hidden md:block">Content language</p>
          <LangSwitch />
        </div>
        {signOut && (
          <form action={signOut}>
            <PendingButton pendingText="Signing out…" className="w-full whitespace-nowrap !justify-start rounded-lg px-3 py-2 text-left text-sm text-muted hover:bg-subtle hover:text-ink">Sign out</PendingButton>
          </form>
        )}
      </div>
    </aside>
  );
}
