"use client";
// Interactive content calendar: month / 2-week / agenda views, drag & drop, filters, workload per
// day, a "needs attention" panel and a detail panel with prompt copy and "posted".
import Link from "next/link";
import { useMemo, useState, useTransition } from "react";
import type { CalItem } from "@/lib/calendar";
import { CopyButton } from "../../copy-button";
import { PostedToggle } from "../posted-toggle";
import { moveItem } from "../spoke-actions";

export type View = "month" | "weeks" | "agenda";
type Trend = { term: string; direction: string; last_7d: number; predicted: number; window_start: string; window_end: string };

const CH = [
  { k: "hub", l: "Website hub" }, { k: "x", l: "X" }, { k: "linkedin", l: "LinkedIn" },
  { k: "note", l: "note" }, { k: "newsletter", l: "Newsletter" }, { k: "youtube", l: "YouTube" },
] as const;
const SLOT_F = [{ k: "evergreen", l: "Evergreen" }, { k: "fast_take", l: "Fast take" }, { k: "lead_magnet", l: "Lead magnet" }, { k: "refresh", l: "Rewrite" }] as const;
const STATE: Record<CalItem["state"], { l: string; cls: string }> = {
  live: { l: "Live", cls: "text-good" }, planned: { l: "Planned", cls: "text-muted" }, overdue: { l: "Overdue", cls: "text-bad" },
  unapproved: { l: "Needs approval", cls: "text-faint" }, posted: { l: "Posted", cls: "text-good" }, due: { l: "To post", cls: "text-accent-ink" },
  waiting: { l: "After the hub is live", cls: "text-faint" },
};
const addDays = (d: string, n: number) => new Date(Date.parse(`${d}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);
const fmt = (d: string, o: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat("en-GB", { ...o, timeZone: "UTC" }).format(new Date(`${d}T00:00:00Z`));

export function CalendarBoard(p: {
  view: View; start: string; end: string; today: string; anchor: string; prev: string; next: string;
  items: CalItem[]; backlog: CalItem[]; prompts: Record<string, string>; trends: Trend[]; feedPath: string;
}) {
  const [items, setItems] = useState(p.items);
  const [backlog, setBacklog] = useState(p.backlog);
  const [channels, setChannels] = useState<Set<string>>(new Set(CH.map((c) => c.k)));
  const [slots, setSlots] = useState<Set<string>>(new Set(SLOT_F.map((s) => s.k)));
  const [showUnapproved, setShowUnapproved] = useState(true);
  const [showDone, setShowDone] = useState(true);
  const [sel, setSel] = useState<string | null>(null);
  const [drag, setDrag] = useState<string | null>(null);
  const [over, setOver] = useState<string | null>(null);
  const [, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);

  const visible = useMemo(() => items.filter((i) =>
    channels.has(i.kind === "hub" ? "hub" : i.channel!.startsWith("linkedin") ? "linkedin" : i.channel!) && (!i.slot || slots.has(i.slot)) &&
    (showUnapproved || i.state !== "unapproved") && (showDone || (i.state !== "live" && i.state !== "posted"))), [items, channels, slots, showUnapproved, showDone]);
  const byDay = useMemo(() => {
    const m = new Map<string, CalItem[]>();
    for (const i of visible) m.set(i.date, [...(m.get(i.date) ?? []), i]);
    for (const [, v] of m) v.sort((a, b) => (a.kind === "hub" ? 0 : 1) - (b.kind === "hub" ? 0 : 1));
    return m;
  }, [visible]);
  const all = [...items, ...backlog];
  const selected = all.find((i) => i.key === sel) ?? null;

  const overdue = items.filter((i) => i.state === "overdue");
  const dueToday = items.filter((i) => i.date === p.today && (i.state === "due" || i.state === "planned"));
  const fastSoon = items.filter((i) => i.deadline && i.state !== "live" && Date.parse(i.deadline) - Date.now() < 36 * 3_600_000);

  const move = (key: string, date: string) => {
    const it = all.find((i) => i.key === key);
    if (!it || !it.movable || it.date === date) return;
    const before = it.date;
    const fromBacklog = backlog.some((b) => b.key === key);
    setItems((xs) => fromBacklog ? [...xs, { ...it, date, state: date < p.today ? "overdue" : "planned" }] : xs.map((x) => (x.key === key ? { ...x, date } : x)));
    if (fromBacklog) setBacklog((xs) => xs.filter((x) => x.key !== key));
    setMsg(`Moved to ${fmt(date, { weekday: "short", day: "numeric", month: "short" })}`);
    start(async () => {
      const r = await moveItem(it.topicId, it.kind === "hub" ? null : it.channel, date).catch(() => ({ ok: false }));
      if (!r.ok) {
        setItems((xs) => xs.map((x) => (x.key === key ? { ...x, date: before } : x)));
        setMsg("Could not move it, try again");
      }
    });
  };

  const toggle = (set: Set<string>, k: string, f: (s: Set<string>) => void) => {
    const n = new Set(set);
    if (n.has(k)) n.delete(k); else n.add(k);
    f(n);
  };
  const qs = (o: Record<string, string>) => `/topics/calendar?${new URLSearchParams({ view: p.view, ...o })}`;

  const Chip = ({ i }: { i: CalItem }) => (
    <button
      type="button"
      draggable={i.movable}
      onDragStart={(e) => { setDrag(i.key); e.dataTransfer.setData("text/plain", i.key); e.dataTransfer.effectAllowed = "move"; }}
      onDragEnd={() => { setDrag(null); setOver(null); }}
      onClick={() => setSel(i.key)}
      className={`block w-full rounded-md text-left text-[11.5px] leading-snug transition ${drag === i.key ? "opacity-40" : ""} ${sel === i.key ? "ring-2 ring-sprout" : ""} ${i.movable ? "cursor-grab active:cursor-grabbing" : "cursor-pointer"} ${
        i.kind === "hub"
          ? i.state === "unapproved" ? "border border-dashed border-line-strong bg-surface px-2 py-1.5 text-faint" : "px-2 py-1.5 text-white"
          : `border px-2 py-1 ${i.state === "overdue" ? "border-bad/40 bg-bad-soft" : i.state === "posted" ? "border-good/30 bg-good-soft" : "border-line bg-surface"}`
      }`}
      style={i.kind === "hub" && i.state !== "unapproved" ? { background: i.color, opacity: i.state === "live" ? 0.75 : 1 } : undefined}
      title={`${i.kind === "hub" ? i.label : i.label} — ${i.title}`}
    >
      <span className="block text-[10px] font-semibold uppercase tracking-wider opacity-85">
        {i.kind === "hub" ? `${i.label}${i.state === "live" ? " · live ✓" : i.state === "overdue" ? " · overdue" : i.state === "unapproved" ? " · approve?" : ""}` : `${i.label}${i.state === "posted" ? " ✓" : i.state === "overdue" ? " · late" : ""}`}
      </span>
      <span lang="ja" className="line-clamp-2">{i.title}</span>
    </button>
  );

  const DayCell = ({ d, dim, tall }: { d: string; dim?: boolean; tall?: boolean }) => {
    const list = byDay.get(d) ?? [];
    const hours = list.filter((i) => i.state !== "live" && i.state !== "posted" && i.state !== "unapproved").reduce((a, i) => a + i.hours, 0);
    return (
      <div
        onDragOver={(e) => { e.preventDefault(); setOver(d); }}
        onDragLeave={() => setOver((o) => (o === d ? null : o))}
        onDrop={(e) => { e.preventDefault(); const k = e.dataTransfer.getData("text/plain"); setOver(null); setDrag(null); move(k, d); }}
        className={`flex flex-col gap-1 p-1.5 ${tall ? "min-h-[190px]" : "min-h-[120px]"} ${dim ? "bg-subtle/40" : ""} ${d === p.today ? "bg-sprout-soft/40" : ""} ${over === d ? "ring-2 ring-inset ring-accent" : ""}`}
      >
        <div className="flex items-center justify-between gap-1 px-0.5">
          <span className={`text-[11.5px] font-semibold ${d === p.today ? "text-sprout" : dim ? "text-faint/60" : "text-faint"}`}>
            {fmt(d, p.view === "month" ? { day: "numeric" } : { weekday: "short", day: "numeric", month: "short" })}{d === p.today ? " · today" : ""}
          </span>
          {hours > 0 && (
            <span translate="no" title={`About ${hours.toFixed(1)} hours of work planned`} className={`notranslate rounded px-1 font-mono text-[10px] ${hours > 6 ? "bg-bad-soft text-bad" : hours > 3 ? "bg-warn-soft text-warn" : "bg-subtle text-muted"}`}>
              {hours.toFixed(1)}h
            </span>
          )}
        </div>
        {list.slice(0, p.view === "month" ? 4 : 12).map((i) => <Chip key={i.key} i={i} />)}
        {p.view === "month" && list.length > 4 && <span className="px-1 text-[10.5px] text-faint">+{list.length - 4} more</span>}
      </div>
    );
  };

  const days = (from: string, n: number) => Array.from({ length: n }, (_, k) => addDays(from, k));
  const inForecast = (d: string) => p.trends.length > 0 && d >= p.trends[0].window_start && d <= p.trends[0].window_end;

  return (
    <div className="flex flex-col gap-4">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2">
        <nav aria-label="View" className="seg">
          {(["month", "weeks", "agenda"] as const).map((v) => (
            <Link key={v} prefetch={false} href={`/topics/calendar?${new URLSearchParams({ view: v, date: p.anchor })}`} className={p.view === v ? "seg-on" : "seg-item"}>
              {v === "month" ? "Month" : v === "weeks" ? "2 weeks" : "Agenda"}
            </Link>
          ))}
        </nav>
        <Link prefetch={false} href={qs({ date: p.prev })} className="btn">←</Link>
        <Link prefetch={false} href={qs({ date: p.today })} className="btn">Today</Link>
        <Link prefetch={false} href={qs({ date: p.next })} className="btn">→</Link>
        <span className="text-[12.5px] text-faint">{fmt(p.start, { day: "numeric", month: "short" })} – {fmt(p.end, { day: "numeric", month: "short", year: "numeric" })}</span>
        <span className="ml-auto" />
        <CopyButton
          text={typeof window === "undefined" ? p.feedPath : `${window.location.origin}${p.feedPath}`}
          label="📅 Subscribe link"
          title="Copy a private link to add this calendar to Google Calendar or Outlook (Add calendar → From URL)"
          className="btn"
        />
      </div>
      <div className="flex flex-wrap items-center gap-1.5 text-[12px]">
        {CH.map((c) => (
          <button key={c.k} type="button" onClick={() => toggle(channels, c.k, setChannels)} aria-pressed={channels.has(c.k)}
            className={`rounded-full border px-2.5 py-1 ${channels.has(c.k) ? "border-accent bg-accent-soft text-accent-ink" : "border-line-strong text-faint line-through"}`}>{c.l}</button>
        ))}
        <span className="mx-1 h-4 w-px bg-line" />
        {SLOT_F.map((s) => (
          <button key={s.k} type="button" onClick={() => toggle(slots, s.k, setSlots)} aria-pressed={slots.has(s.k)}
            className={`rounded-full border px-2.5 py-1 ${slots.has(s.k) ? "border-ink/30 bg-surface text-ink" : "border-line-strong text-faint line-through"}`}>{s.l}</button>
        ))}
        <span className="mx-1 h-4 w-px bg-line" />
        <label className="flex items-center gap-1 text-muted"><input type="checkbox" checked={showUnapproved} onChange={(e) => setShowUnapproved(e.target.checked)} className="accent-accent" /> Not approved</label>
        <label className="ml-2 flex items-center gap-1 text-muted"><input type="checkbox" checked={showDone} onChange={(e) => setShowDone(e.target.checked)} className="accent-accent" /> Done</label>
        {msg && <span role="status" className="ml-auto text-[12px] text-accent-ink">{msg}</span>}
      </div>

      <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_300px]">
        {/* Calendar */}
        <div className="min-w-0">
          {p.view === "agenda" ? (
            <div className="card divide-y divide-line">
              {days(p.start, 21).filter((d) => (byDay.get(d) ?? []).length).map((d) => (
                <div key={d} onDragOver={(e) => e.preventDefault()} onDrop={(e) => move(e.dataTransfer.getData("text/plain"), d)} className={`grid grid-cols-[120px_minmax(0,1fr)] gap-3 px-4 py-3 ${d === p.today ? "bg-sprout-soft/40" : ""}`}>
                  <p className={`text-[12.5px] font-semibold ${d === p.today ? "text-sprout" : "text-muted"}`}>{fmt(d, { weekday: "short", day: "numeric", month: "short" })}{inForecast(d) ? <span className="block text-[10.5px] font-normal text-faint">forecast week</span> : null}</p>
                  <div className="grid gap-1.5 sm:grid-cols-2 xl:grid-cols-3">{(byDay.get(d) ?? []).map((i) => <Chip key={i.key} i={i} />)}</div>
                </div>
              ))}
              {!days(p.start, 21).some((d) => (byDay.get(d) ?? []).length) && <p className="px-4 py-6 text-sm text-muted">Nothing planned in these 3 weeks.</p>}
            </div>
          ) : (
            <div className="card overflow-x-auto">
              <div className="min-w-[860px]">
                <div className="grid grid-cols-7 border-b border-line bg-[#FAF6EE] text-[10.5px] font-semibold uppercase tracking-wider text-faint">
                  {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((w) => <span key={w} className="px-2 py-1.5">{w}</span>)}
                </div>
                {Array.from({ length: p.view === "month" ? 6 : 2 }, (_, w) => {
                  const ws = addDays(p.start, w * 7);
                  const wTrend = inForecast(ws) || inForecast(addDays(ws, 6));
                  return (
                    <div key={ws} className="border-b border-line last:border-b-0">
                      {wTrend && (
                        <p className="flex flex-wrap items-center gap-1.5 bg-accent-soft/50 px-2 py-1 text-[11px] text-accent-ink">
                          <b>Likely trending:</b>
                          {p.trends.map((t) => <span key={t.term} lang="ja" className="rounded-full bg-surface px-2 py-0.5">{t.direction === "emerging" ? "✦" : "▲"} {t.term}</span>)}
                          <Link prefetch={false} href="/trends/forecast" className="ml-1 font-semibold underline">forecast →</Link>
                        </p>
                      )}
                      <div className="grid grid-cols-7 divide-x divide-line">
                        {days(ws, 7).map((d) => <DayCell key={d} d={d} dim={p.view === "month" && d.slice(0, 7) !== p.anchor.slice(0, 7)} tall={p.view === "weeks"} />)}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* Side panel: details or what needs attention */}
        <aside className="flex flex-col gap-3 lg:sticky lg:top-6">
          {selected ? (
            <section className="card flex flex-col gap-2.5 p-4">
              <div className="flex items-start justify-between gap-2">
                <span className="rounded px-1.5 py-0.5 text-[10.5px] font-semibold tracking-wider text-white" style={{ background: selected.kind === "hub" ? selected.color : "#56625C" }}>
                  {selected.kind === "hub" ? "HUB" : "SPOKE"}
                </span>
                <button type="button" onClick={() => setSel(null)} aria-label="Close details" className="text-faint hover:text-ink">✕</button>
              </div>
              <p className="text-[13px] font-semibold">{selected.label}</p>
              <p lang="ja" className="text-[14px] leading-snug">{selected.title}</p>
              <p className="text-[12.5px] text-muted">
                {selected.date ? fmt(selected.date, { weekday: "long", day: "numeric", month: "short" }) : "No date yet"} · <span className={STATE[selected.state].cls}>{STATE[selected.state].l}</span>
              </p>
              {selected.timing && <p className="text-[12.5px] text-sprout">{selected.timing}</p>}
              {selected.why && <p className="text-[12.5px] text-body">{selected.why}</p>}
              {selected.deadline && <p className="text-[12px] text-bad">Fast take: publish by {new Date(selected.deadline).toLocaleString("en-GB", { weekday: "short", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Tokyo" })} JST</p>}
              {selected.movable && (
                <label className="text-[12px] text-muted">
                  Move to
                  <input type="date" defaultValue={selected.date || p.today} onChange={(e) => e.target.value && move(selected.key, e.target.value)}
                    className="ml-2 rounded-md border border-line-strong bg-surface px-2 py-1 text-[12.5px]" />
                </label>
              )}
              <div className="flex flex-wrap gap-2 border-t border-line pt-2.5">
                <Link href={`/topics/${selected.topicId}`} className="btn-primary !min-h-8 !text-[12.5px]">Open topic</Link>
                {selected.kind === "spoke" && p.prompts[selected.key] && <CopyButton text={p.prompts[selected.key]} label="⧉ Copy prompt" className="btn !min-h-8 !text-[12.5px]" />}
                {selected.kind === "spoke" && selected.state !== "waiting" && <PostedToggle topicId={selected.topicId} channel={selected.channel!} initial={selected.state === "posted"} />}
              </div>
            </section>
          ) : null}
          <section className="card flex flex-col gap-2 p-4">
            <h2 className="text-[13px] font-semibold">Needs attention</h2>
            {[
              { l: "Overdue", xs: overdue, cls: "text-bad" },
              { l: "Today", xs: dueToday, cls: "text-sprout" },
              { l: "Fast-take deadline < 36h", xs: fastSoon, cls: "text-warn" },
            ].map((g) => (
              <div key={g.l}>
                <p className={`text-[11.5px] font-semibold ${g.cls}`}>{g.l} · {g.xs.length}</p>
                <ul className="mt-0.5 flex flex-col gap-0.5">
                  {g.xs.slice(0, 6).map((i) => (
                    <li key={i.key}><button type="button" onClick={() => setSel(i.key)} className="w-full truncate text-left text-[12px] text-body hover:underline"><b className="font-medium">{i.label}</b> · <span lang="ja">{i.title}</span></button></li>
                  ))}
                </ul>
              </div>
            ))}
            {backlog.length > 0 && (
              <div>
                <p className="text-[11.5px] font-semibold text-muted">Approved, no date · {backlog.length} <span className="font-normal text-faint">(drag onto a day)</span></p>
                <div className="mt-1 flex flex-col gap-1">{backlog.map((i) => <Chip key={i.key} i={i} />)}</div>
              </div>
            )}
          </section>
          <section className="card p-4 text-[11.5px] text-faint">
            <p className="font-semibold text-muted">Legend</p>
            <p className="mt-1">Solid colour = hub on the website (green evergreen, terracotta fast take, plum lead magnet). Outlined = spoke. Dashed = not approved. The hour badge is planned work for that day.</p>
          </section>
        </aside>
      </div>
    </div>
  );
}
