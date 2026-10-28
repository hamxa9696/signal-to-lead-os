"use client";
import { useState } from "react";

export function CopyButton({ text, label = "Copy", className = "btn-primary", title }: { text: string; label?: string; className?: string; title?: string }) {
  const [copied, setCopied] = useState<"ok" | "fail" | null>(null);
  return (
    <button
      type="button"
      title={title}
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setCopied("ok");
        } catch {
          setCopied("fail");
        }
        setTimeout(() => setCopied(null), 1800);
      }}
      className={className}
    >
      {copied === "ok" ? "Copied ✓" : copied === "fail" ? "Copy blocked" : label}
    </button>
  );
}
