import Link from "next/link";

const LINKS = [
  { href: "/", label: "Status" },
  { href: "/topics", label: "Topics" },
  { href: "/signals", label: "Signals" },
  { href: "/delivery", label: "Delivery" },
  { href: "/knowledge", label: "Knowledge" },
];

export function Nav() {
  return (
    <nav className="border-b border-white/10">
      <div className="mx-auto flex max-w-5xl flex-wrap items-center gap-x-5 gap-y-2 px-4 py-3">
        <span className="font-semibold">Signal-to-Lead OS</span>
        {LINKS.map((l) => (
          <Link key={l.href} href={l.href} className="text-sm text-white/60 hover:text-white">
            {l.label}
          </Link>
        ))}
      </div>
    </nav>
  );
}
