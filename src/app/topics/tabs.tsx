import Link from "next/link";

/** Topics are built from signals, so both live under one "Topics" area with two tabs. */
export function TopicTabs({ current }: { current: "topics" | "signals" }) {
  return (
    <nav aria-label="Topics and signals" className="seg self-start">
      <Link prefetch={false} href="/topics" aria-current={current === "topics" ? "page" : undefined} className={current === "topics" ? "seg-on" : "seg-item"}>
        This week&apos;s topics
      </Link>
      <Link prefetch={false} href="/signals" aria-current={current === "signals" ? "page" : undefined} className={current === "signals" ? "seg-on" : "seg-item"}>
        All signals
      </Link>
    </nav>
  );
}
