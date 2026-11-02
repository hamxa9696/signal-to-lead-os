"use client";
// One "Trends" area: the overview board plus the four detailed views it is built from.
import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  { href: "/trends", label: "Overview", hint: "all lenses together" },
  { href: "/trends/signals", label: "Signals", hint: "news stories" },
  { href: "/trends/ai-search", label: "AI search", hint: "what buyers ask AI" },
  { href: "/trends/signal-index", label: "Signal index", hint: "monthly report" },
  { href: "/trends/forecast", label: "Forecast", hint: "next week" },
];

export function TrendTabs() {
  const path = usePathname();
  return (
    <div className="mx-auto w-full max-w-6xl px-4 pt-6 md:px-9">
      <nav aria-label="Trends views" className="flex gap-0.5 overflow-x-auto border-b border-line">
        {TABS.map((t) => {
          const on = t.href === "/trends" ? path === "/trends" : path.startsWith(t.href);
          return (
            <Link key={t.href} href={t.href} prefetch={false} aria-current={on ? "page" : undefined}
              className={`-mb-px shrink-0 border-b-[3px] px-3.5 pt-2 pb-1.5 text-left ${on ? "border-sprout text-ink" : "border-transparent text-muted hover:text-ink"}`}>
              <span className="block text-[13.5px] font-semibold">{t.label}</span>
              <span className="block text-[11px] text-faint">{t.hint}</span>
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
