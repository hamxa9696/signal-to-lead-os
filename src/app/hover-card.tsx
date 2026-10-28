"use client";
// A hover/focus card that floats above the page (fixed position), so containers that scroll or clip
// (like the topics table) never cut it off.
import { useRef, useState } from "react";

export function HoverCard({ children, card, width = 320, label }: { children: React.ReactNode; card: React.ReactNode; width?: number; label: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ left: number; top: number; above: boolean } | null>(null);
  const show = () => {
    const r = ref.current?.getBoundingClientRect();
    if (!r) return;
    const left = Math.max(8, Math.min(window.innerWidth - width - 8, r.left + r.width / 2 - width / 2));
    const above = r.bottom + 280 > window.innerHeight && r.top > 300;
    setPos({ left, top: above ? r.top - 8 : r.bottom + 8, above });
  };
  return (
    <div
      ref={ref}
      tabIndex={0}
      aria-label={label}
      className="cursor-help rounded outline-none focus-visible:ring-4 focus-visible:ring-accent-soft"
      onMouseEnter={show}
      onMouseLeave={() => setPos(null)}
      onFocus={show}
      onBlur={() => setPos(null)}
    >
      {children}
      {pos && (
        <div
          role="tooltip"
          className="pointer-events-none fixed z-50 rounded-lg bg-ink px-3.5 py-3 text-[12.5px] leading-relaxed text-white shadow-xl"
          style={{ left: pos.left, top: pos.top, width, transform: pos.above ? "translateY(-100%)" : undefined }}
        >
          {card}
        </div>
      )}
    </div>
  );
}
