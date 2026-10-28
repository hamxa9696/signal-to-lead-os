"use client";
// Interactive sessions chart: hover (or arrow keys) shows the day/week, sessions and what went live.
import { useRef, useState } from "react";

type Point = { key: string; sessions: number; published: number; inRange: boolean };

const W = 780, left = 48, right = 740, top = 30, bottom = 210;
const n = (v: number) => v.toLocaleString("en-US");
const day = (d: string, opts: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat("en-GB", { ...opts, timeZone: "UTC" }).format(new Date(`${d}T00:00:00Z`));

export function SessionsChart({ points, unit, label }: { points: Point[]; unit: "day" | "week"; label: string }) {
  const svg = useRef<SVGSVGElement>(null);
  const [hover, setHover] = useState<number | null>(null);
  const max = Math.max(...points.map((p) => p.sessions), 0);
  const step = max <= 0 ? 1 : Math.pow(10, Math.floor(Math.log10(max)));
  const nice = max <= 0 ? 4 : Math.ceil(max / step / 2) * 2 * step;
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((f) => Math.round(nice * f));
  const x = (i: number) => left + (i * (right - left)) / Math.max(1, points.length - 1);
  const y = (v: number) => bottom - (v / nice) * (bottom - top);
  const line = points.map((p, i) => `${i ? "L" : "M"}${x(i).toFixed(1)} ${y(p.sessions).toFixed(1)}`).join(" ");
  const every = Math.max(1, Math.ceil(points.length / 8));
  const firstSel = points.findIndex((p) => p.inRange);
  const last = points.length - 1;
  const total = points.filter((p) => p.inRange).reduce((a, p) => a + p.sessions, 0);

  const pick = (clientX: number) => {
    const r = svg.current?.getBoundingClientRect();
    if (!r) return;
    const vx = ((clientX - r.left) / r.width) * W;
    const i = Math.round(((vx - left) / (right - left)) * (points.length - 1));
    setHover(Math.max(0, Math.min(last, i)));
  };

  const h = hover != null ? points[hover] : null;
  const prevPt = hover != null && hover > 0 ? points[hover - 1] : null;
  const diff = h && prevPt ? h.sessions - prevPt.sessions : null;
  const when = h
    ? unit === "week"
      ? `Week of ${day(h.key, { day: "numeric", month: "short", year: "numeric" })}`
      : day(h.key, { weekday: "short", day: "numeric", month: "short", year: "numeric" })
    : "";

  return (
    <div className="relative mt-3.5">
      <svg
        ref={svg}
        viewBox={`0 0 ${W} 250`}
        role="img"
        tabIndex={0}
        aria-label={`Sessions per ${unit}, ${label}: ${n(total)} in total. Hover or use the arrow keys to read each ${unit}.`}
        className="block h-auto w-full cursor-crosshair touch-none font-mono outline-none focus-visible:ring-4 focus-visible:ring-accent-soft"
        onMouseMove={(e) => pick(e.clientX)}
        onTouchMove={(e) => pick(e.touches[0].clientX)}
        onMouseLeave={() => setHover(null)}
        onBlur={() => setHover(null)}
        onKeyDown={(e) => {
          if (e.key === "ArrowLeft") setHover((v) => Math.max(0, (v ?? last + 1) - 1));
          if (e.key === "ArrowRight") setHover((v) => Math.min(last, (v ?? -1) + 1));
        }}
      >
        {firstSel > 0 && <rect x={x(firstSel) - 6} y={top - 10} width={right - x(firstSel) + 12} height={bottom - top + 10} fill="var(--color-accent)" fillOpacity="0.05" rx="6" />}
        <g stroke="#EDE6D8">{ticks.slice(1).map((t) => <line key={t} x1={left} x2={right} y1={y(t)} y2={y(t)} />)}</g>
        <line x1={left} x2={right} y1={bottom} y2={bottom} stroke="#D6CDBA" />
        <g fill="#A29A88" fontSize="11">
          {ticks.map((t) => <text key={t} x={left - 8} y={y(t) + 4} textAnchor="end">{n(t)}</text>)}
          {points.map((p, i) => (i % every === 0 ? <text key={p.key} x={x(i)} y={bottom + 22} textAnchor="middle">{day(p.key, { day: "numeric", month: "short" })}</text> : null))}
        </g>
        <path d={`${line} L${right} ${bottom} L${left} ${bottom} Z`} fill="var(--color-accent)" fillOpacity="0.08" />
        <path d={line} fill="none" stroke="var(--color-accent)" strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" />
        {points.length <= 31 && points.map((p, i) => <circle key={p.key} cx={x(i)} cy={y(p.sessions)} r="2.5" fill="var(--color-accent)" />)}
        {hover == null && (
          <>
            <circle cx={x(last)} cy={y(points[last].sessions)} r="4.5" fill="#FFFFFF" stroke="var(--color-accent)" strokeWidth="2.5" />
            <text x={x(last) - 8} y={y(points[last].sessions) - 10} textAnchor="end" fill="#1E3A31" fontSize="12" fontWeight="500">{n(points[last].sessions)}</text>
          </>
        )}
        <g fill="#1E3A31">
          {points.map((p, i) => (p.published > 0 ? <path key={p.key} d={`M${x(i)} ${bottom - 8} l6 6 l-6 6 l-6 -6 z`} /> : null))}
        </g>
        {h && hover != null && (
          <g pointerEvents="none">
            <line x1={x(hover)} x2={x(hover)} y1={top - 10} y2={bottom} stroke="#1E3A31" strokeOpacity="0.25" strokeDasharray="3 3" />
            <circle cx={x(hover)} cy={y(h.sessions)} r="5.5" fill="#FFFFFF" stroke="var(--color-accent)" strokeWidth="3" />
          </g>
        )}
      </svg>
      {h && hover != null && (
        <div
          role="status"
          className="pointer-events-none absolute top-0 z-10 w-[210px] rounded-lg bg-ink px-3 py-2.5 text-[12.5px] text-white shadow-lg"
          style={{ left: `clamp(0px, calc(${(x(hover) / W) * 100}% - 105px), calc(100% - 210px))` }}
        >
          <p className="text-white/70">{when}</p>
          <p className="mt-0.5 font-mono text-lg font-semibold">{n(h.sessions)} <span className="font-sans text-[12px] font-normal text-white/70">sessions</span></p>
          {diff != null && (
            <p className={diff > 0 ? "text-[#A8D5BC]" : diff < 0 ? "text-[#EBB3A3]" : "text-white/70"}>
              {diff > 0 ? "▲" : diff < 0 ? "▼" : "="} {n(Math.abs(diff))} vs previous {unit}
            </p>
          )}
          {h.published > 0 && <p className="mt-1">◆ {h.published} piece{h.published === 1 ? "" : "s"} went live</p>}
          {!h.inRange && <p className="mt-1 text-white/60">Before the selected range (context)</p>}
        </div>
      )}
    </div>
  );
}
