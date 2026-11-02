import Link from "next/link";

/** Plan: this week's topics as a list or on the calendar. */
export function TopicTabs({ current }: { current: "topics" | "calendar" }) {
  return (
    <nav aria-label="Plan views" className="seg self-start">
      <Link prefetch={false} href="/topics" aria-current={current === "topics" ? "page" : undefined} className={current === "topics" ? "seg-on" : "seg-item"}>
        List
      </Link>
      <Link prefetch={false} href="/topics/calendar" aria-current={current === "calendar" ? "page" : undefined} className={current === "calendar" ? "seg-on" : "seg-item"}>
        Calendar
      </Link>
    </nav>
  );
}
