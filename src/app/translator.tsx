"use client";
// In-app English view. When "English" is on, every Japanese text node inside <main> is replaced
// with a cached Gemini translation; switching back restores the original text. Inputs, textareas
// and code/prompt blocks are never touched, so nothing you edit or copy is changed.
import { useEffect, useState } from "react";

export type Lang = "ja" | "en";
const KEY = "stl-lang";
const EVENT = "stl-lang";
const JA = /[぀-ヿ㐀-鿿ｦ-ﾟ]/;
const SKIP = new Set(["SCRIPT", "STYLE", "TEXTAREA", "INPUT", "OPTION", "PRE", "CODE", "NOSCRIPT"]);
const MAX_TEXT = 4_000;
const FIRST_CHUNK = 40; // what's on screen first, so the visible part flips quickly
const CHUNK = 120;
const PARALLEL = 2;

export function getLang(): Lang {
  try {
    return localStorage.getItem(KEY) === "en" ? "en" : "ja";
  } catch {
    return "ja";
  }
}

export function setLang(l: Lang) {
  try {
    localStorage.setItem(KEY, l);
  } catch {
    /* private mode: still switch for this page */
  }
  window.dispatchEvent(new CustomEvent(EVENT, { detail: l }));
}

export function useLang(): Lang {
  const [lang, set] = useState<Lang>("ja");
  useEffect(() => {
    set(getLang());
    const on = (e: Event) => set((e as CustomEvent<Lang>).detail);
    window.addEventListener(EVENT, on);
    return () => window.removeEventListener(EVENT, on);
  }, []);
  return lang;
}

// Session-wide memory of translations (survives client navigation, cleared with the tab).
const memo = new Map<string, string>();
try {
  Object.entries(JSON.parse(sessionStorage.getItem("stl-tr") ?? "{}") as Record<string, string>).forEach(([k, v]) => memo.set(k, v));
} catch {
  /* server render or no storage */
}
const saveMemo = () => {
  try {
    sessionStorage.setItem("stl-tr", JSON.stringify(Object.fromEntries([...memo].slice(-3000))));
  } catch {
    /* full or unavailable */
  }
};

const original = new Map<Text, string>(); // node → Japanese text we replaced
const applied = new WeakMap<Text, string>(); // node → English text we put there

function skip(node: Text): boolean {
  for (let el = node.parentElement; el; el = el.parentElement) {
    if (SKIP.has(el.tagName) || el.isContentEditable || el.hasAttribute("data-no-translate")) return true;
    if (el.tagName === "MAIN") return false;
  }
  return true; // outside <main>
}

/**
 * True once React has hydrated this element. Changing text React has not hydrated yet causes a
 * hydration mismatch, after which React throws the page away and rebuilds it (clicks get lost).
 */
const hydrated = (el: Element | null) => !!el && Object.keys(el).some((k) => k.startsWith("__reactFiber$"));
let waitingForHydration = false;

function collect(root: Node): Text[] {
  const out: Text[] = [];
  waitingForHydration = false;
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  for (let n = walker.nextNode() as Text | null; n; n = walker.nextNode() as Text | null) {
    const v = n.nodeValue ?? "";
    if (v.length > MAX_TEXT || !JA.test(v) || applied.get(n) === v || skip(n)) continue;
    if (!hydrated(n.parentElement)) {
      waitingForHydration = true; // try again shortly
      continue;
    }
    out.push(n);
  }
  return out;
}

function apply(node: Text, en: string) {
  const v = node.nodeValue ?? "";
  const lead = v.match(/^\s*/)?.[0] ?? "";
  const trail = v.match(/\s*$/)?.[0] ?? "";
  if (!original.has(node)) original.set(node, v);
  const next = lead + en + trail;
  applied.set(node, next);
  node.nodeValue = next;
}

function restoreAll() {
  for (const [node, ja] of original) {
    if (node.isConnected && applied.get(node) === node.nodeValue) node.nodeValue = ja;
  }
  original.clear();
}

export function Translator() {
  const lang = useLang();
  const [busy, setBusy] = useState(0);

  useEffect(() => {
    if (lang !== "en") {
      restoreAll();
      return;
    }
    const main = document.querySelector("main");
    if (!main) return;
    let stopped = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const inflight = new Set<string>();

    const run = async () => {
      const nodes = collect(document.body);
      const need: { key: string; top: number }[] = [];
      for (const n of nodes) {
        const key = (n.nodeValue ?? "").trim();
        const hit = memo.get(key);
        if (hit) apply(n, hit);
        else if (!inflight.has(key)) need.push({ key, top: n.parentElement?.getBoundingClientRect().top ?? 1e9 });
      }
      // Nearest the top of the screen first.
      need.sort((a, b) => (a.top < 0 ? 1e8 - a.top : a.top) - (b.top < 0 ? 1e8 - b.top : b.top));
      const unique = [...new Set(need.map((x) => x.key))];
      const chunks = unique.length ? [unique.slice(0, FIRST_CHUNK)] : [];
      for (let i = FIRST_CHUNK; i < unique.length; i += CHUNK) chunks.push(unique.slice(i, i + CHUNK));
      chunks.flat().forEach((k) => inflight.add(k));

      const send = async (chunk: string[]) => {
        setBusy((b) => b + 1);
        try {
          const res = await fetch("/api/translate", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ texts: chunk }) });
          const { map = {} } = (await res.json()) as { map?: Record<string, string> };
          Object.entries(map).forEach(([k, v]) => memo.set(k, v));
          saveMemo();
          if (!stopped) {
            for (const n of collect(document.body)) {
              const hit = memo.get((n.nodeValue ?? "").trim());
              if (hit) apply(n, hit);
            }
          }
        } catch {
          /* offline / server busy: stays Japanese */
        } finally {
          chunk.forEach((k) => inflight.delete(k));
          setBusy((b) => b - 1);
        }
      };
      // Parts of the page not hydrated yet: look again shortly (hydration changes no DOM, so no mutation fires).
      if (waitingForHydration && !stopped) {
        clearTimeout(timer);
        timer = setTimeout(run, 300);
      }
      if (chunks.length) await send(chunks[0]);
      for (let i = 1; i < chunks.length && !stopped; i += PARALLEL) await Promise.all(chunks.slice(i, i + PARALLEL).map(send));
    };

    run();
    // New content (navigation, server actions, React re-renders) gets translated too.
    const observer = new MutationObserver(() => {
      clearTimeout(timer);
      timer = setTimeout(run, 250);
    });
    observer.observe(document.body, { childList: true, subtree: true, characterData: true });
    return () => {
      stopped = true;
      clearTimeout(timer);
      observer.disconnect();
    };
  }, [lang]);

  if (lang !== "en" || busy <= 0) return null;
  return (
    <div role="status" className="fixed right-4 bottom-4 z-50 flex items-center gap-2 rounded-full bg-ink px-3.5 py-2 text-[12.5px] font-medium text-white shadow-lg">
      <span className="h-2 w-2 animate-pulse rounded-full bg-accent" />
      Translating to English…
    </div>
  );
}

export function LangSwitch() {
  const lang = useLang();
  const opt = (l: Lang, label: string) => (
    <button
      type="button"
      onClick={() => setLang(l)}
      aria-pressed={lang === l}
      className={`flex-1 rounded-md px-2 py-1 text-[12.5px] ${lang === l ? "bg-surface font-semibold text-ink shadow-[0_1px_2px_rgba(16,24,40,0.08)]" : "text-muted hover:text-ink"}`}
    >
      {label}
    </button>
  );
  return (
    <div role="group" aria-label="Content language" className="flex gap-0.5 rounded-lg bg-subtle p-0.5">
      {opt("ja", "日本語")}
      {opt("en", "English")}
    </div>
  );
}
