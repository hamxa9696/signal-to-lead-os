"use client";
import Link from "next/link";
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
  knowledge: <path d="M5 4h11l3 3v13H5zM9 10h6M9 14h6" />,
  status: (
    <>
      <circle cx="12" cy="12" r="3" />
      <path d="M12 2v3M12 19v3M2 12h3M19 12h3" />
    </>
  ),
};

const LINKS = [
  { href: "/performance", label: "Performance", icon: "performance" },
  { href: "/topics", label: "Topics", icon: "topics" },
  { href: "/signals", label: "Signals", icon: "signals" },
  { href: "/review", label: "Monthly review", icon: "review" },
  { href: "/delivery", label: "Delivery", icon: "delivery" },
  { href: "/knowledge", label: "Knowledge", icon: "knowledge" },
  { href: "/status", label: "Status", icon: "status" },
];

export function Sidebar({ signOut }: { signOut: (() => Promise<void>) | null }) {
  const path = usePathname();
  if (path.startsWith("/login") || path.startsWith("/auth") || path.startsWith("/reset-password")) return null;
  return (
    <aside className="flex w-full flex-col gap-6 border-b border-line bg-sidebar px-4 py-5 md:sticky md:top-0 md:h-screen md:w-[248px] md:flex-none md:border-r md:border-b-0">
      <Link href="/performance" className="flex items-center gap-2.5 px-2">
        <span className="flex h-[30px] w-[30px] items-center justify-center rounded-lg bg-ink">
          <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="var(--color-accent)" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
            <path d="M3 12h4l3-7 4 14 3-7h4" />
          </svg>
        </span>
        <span>
          <span className="block font-bold tracking-tight">Signal-to-Lead</span>
          <span className="block text-[11px] text-faint">Renesis Tech Japan</span>
        </span>
      </Link>
      <nav aria-label="Main" className="flex flex-wrap gap-0.5 md:flex-col">
        <p className="eyebrow mb-1.5 ml-3 hidden md:block">Workspace</p>
        {LINKS.map((l) => {
          const active = path === l.href || path.startsWith(`${l.href}/`);
          return (
            <Link
              key={l.href}
              href={l.href}
              aria-current={active ? "page" : undefined}
              className={`flex min-h-[38px] items-center gap-2.5 rounded-lg px-3 py-2 text-sm ${
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
      </nav>
      {signOut && (
        <form action={signOut} className="md:mt-auto">
          <button className="w-full rounded-lg border border-line-strong bg-surface px-3 py-2 text-left text-sm text-muted hover:bg-subtle hover:text-ink">Sign out</button>
        </form>
      )}
    </aside>
  );
}
