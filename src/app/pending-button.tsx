"use client";
// Submit button that reacts the moment it is clicked: spinner + disabled until the server answers.
import { useFormStatus } from "react-dom";

export function Spinner({ className = "" }: { className?: string }) {
  return <span aria-hidden="true" className={`inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-t-transparent ${className}`} />;
}

export function PendingButton({ children, pendingText, className = "btn", formAction, ariaLabel }: {
  children: React.ReactNode;
  pendingText?: string;
  className?: string;
  formAction?: (f: FormData) => void | Promise<void>;
  ariaLabel?: string;
}) {
  const { pending } = useFormStatus();
  return (
    <button formAction={formAction} disabled={pending} aria-busy={pending} aria-label={ariaLabel} className={`${className} inline-flex items-center justify-center gap-1.5 disabled:cursor-wait disabled:opacity-70`}>
      {pending && <Spinner />}
      {pending && pendingText ? pendingText : children}
    </button>
  );
}
