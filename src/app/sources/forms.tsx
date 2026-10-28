"use client";
import { useActionState } from "react";
import { addKeyword, addRss, type AddState } from "./actions";

const input = "min-h-9 min-w-0 flex-1 rounded-lg border border-line-strong bg-surface px-2.5 py-1.5 text-[13px] focus:border-accent focus:outline-none focus:ring-4 focus:ring-accent-soft";
const btn = "min-h-9 rounded-lg bg-accent px-3 py-1.5 text-[13px] font-semibold text-white hover:bg-accent-ink disabled:opacity-50";

function Msg({ s }: { s: AddState }) {
  if (!s) return null;
  return <p role="status" className={`text-[13px] ${s.ok ? "text-good" : "text-bad"}`}>{s.message}</p>;
}

export function AddKeyword({ suggestions }: { suggestions: string[] }) {
  const [state, action, pending] = useActionState(addKeyword, null);
  return (
    <form action={action} className="flex flex-col gap-2">
      <div className="flex gap-2">
        <input name="keyword" lang="ja" list="kw-suggest" placeholder="例: 製造業 生成AI 活用" aria-label="Search phrase" className={input} />
        <button disabled={pending} className={btn}>{pending ? "Checking…" : "Add search"}</button>
      </div>
      <datalist id="kw-suggest">{suggestions.map((s) => <option key={s} value={s} />)}</datalist>
      <Msg s={state} />
    </form>
  );
}

export function AddRss() {
  const [state, action, pending] = useActionState(addRss, null);
  return (
    <form action={action} className="flex flex-col gap-2">
      <div className="flex flex-wrap gap-2">
        <input name="url" type="url" placeholder="https://example.jp/rss.xml" aria-label="Feed URL" className={input} />
        <input name="name" placeholder="Name (optional)" aria-label="Name" className={`${input} max-w-[180px]`} />
        <button disabled={pending} className={btn}>{pending ? "Checking…" : "Add feed"}</button>
      </div>
      <Msg s={state} />
    </form>
  );
}
