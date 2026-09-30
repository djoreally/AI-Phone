"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

// ---------- classnames ----------
export function cx(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(" ");
}

// ---------- Button ----------
type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "ghost" | "danger" | "success";
  size?: "sm" | "md";
  loading?: boolean;
};
export function Button({ variant = "primary", size = "md", loading, className, children, disabled, ...rest }: ButtonProps) {
  const base = "inline-flex items-center justify-center gap-2 rounded-lg font-medium transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-lime-400/70 disabled:cursor-not-allowed disabled:opacity-50";
  const sizes = { sm: "h-8 px-3 text-xs", md: "h-10 px-4 text-sm" };
  const variants = {
    primary: "bg-lime-400 text-zinc-950 hover:bg-lime-300 shadow-[0_0_0_1px_rgba(163,230,53,0.3),0_8px_24px_-8px_rgba(163,230,53,0.5)]",
    secondary: "bg-zinc-800 text-zinc-100 hover:bg-zinc-700 border border-zinc-700",
    ghost: "bg-transparent text-zinc-300 hover:bg-zinc-800 hover:text-white",
    danger: "bg-rose-500/10 text-rose-300 border border-rose-500/30 hover:bg-rose-500/20",
    success: "bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 hover:bg-emerald-500/25",
  };
  return (
    <button className={cx(base, sizes[size], variants[variant], className)} disabled={disabled || loading} {...rest}>
      {loading && <Spinner className="h-3.5 w-3.5" />}
      {children}
    </button>
  );
}

export function Spinner({ className }: { className?: string }) {
  return (
    <svg className={cx("animate-spin", className ?? "h-4 w-4")} viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-90" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
    </svg>
  );
}

// ---------- Badge ----------
export function Badge({ tone = "neutral", children, className }: { tone?: "neutral" | "lime" | "amber" | "rose" | "sky" | "violet" | "emerald"; children: ReactNode; className?: string }) {
  const tones = {
    neutral: "bg-zinc-800 text-zinc-300 border-zinc-700",
    lime: "bg-lime-400/10 text-lime-300 border-lime-400/30",
    amber: "bg-amber-400/10 text-amber-300 border-amber-400/30",
    rose: "bg-rose-500/10 text-rose-300 border-rose-500/30",
    sky: "bg-sky-400/10 text-sky-300 border-sky-400/30",
    violet: "bg-violet-400/10 text-violet-300 border-violet-400/30",
    emerald: "bg-emerald-400/10 text-emerald-300 border-emerald-400/30",
  };
  return <span className={cx("inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-[11px] font-medium uppercase tracking-wide", tones[tone], className)}>{children}</span>;
}

export function levelTone(level: number) {
  return (["lime", "sky", "amber", "rose"] as const)[Math.min(4, Math.max(1, level)) - 1];
}
export function decisionTone(d: string) {
  if (d === "allow" || d === "allowed") return "lime" as const;
  if (d === "confirm" || d === "confirmed") return "amber" as const;
  if (d === "step_up") return "violet" as const;
  if (d === "deny" || d === "denied") return "rose" as const;
  return "neutral" as const;
}

// ---------- Card ----------
export function Card({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cx("rounded-2xl border border-zinc-800 bg-zinc-900/60 backdrop-blur", className)}>{children}</div>;
}

// ---------- Form controls ----------
const inputCls = "w-full rounded-lg border border-zinc-700 bg-zinc-950/60 px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-500 focus:border-lime-400/60 focus:outline-none focus:ring-2 focus:ring-lime-400/20";
export function Input(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={cx(inputCls, props.className)} />;
}
export function Textarea(props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea {...props} className={cx(inputCls, "min-h-[80px]", props.className)} />;
}
export function Select(props: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return <select {...props} className={cx(inputCls, props.className)} />;
}
export function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-zinc-400">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-xs text-zinc-500">{hint}</span>}
    </label>
  );
}
export function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label?: string }) {
  return (
    <button type="button" role="switch" aria-checked={checked} onClick={() => onChange(!checked)} className="flex items-center gap-2 text-sm text-zinc-300">
      <span className={cx("relative inline-flex h-5 w-9 items-center rounded-full transition-colors", checked ? "bg-lime-400" : "bg-zinc-700")}>
        <span className={cx("inline-block h-4 w-4 transform rounded-full bg-zinc-950 transition-transform", checked ? "translate-x-4" : "translate-x-0.5")} />
      </span>
      {label}
    </button>
  );
}

// ---------- Modal ----------
export function Modal({ open, onClose, title, children, wide }: { open: boolean; onClose: () => void; title: string; children: ReactNode; wide?: boolean }) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 p-0 backdrop-blur-sm sm:items-center sm:p-6" onClick={onClose}>
      <div
        className={cx("max-h-[92vh] w-full overflow-y-auto rounded-t-2xl border border-zinc-800 bg-zinc-900 p-5 shadow-2xl sm:rounded-2xl sm:p-6", wide ? "sm:max-w-3xl" : "sm:max-w-lg")}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal
      >
        <div className="mb-4 flex items-start justify-between gap-4">
          <h2 className="text-lg font-semibold text-white">{title}</h2>
          <button onClick={onClose} className="rounded-md p-1 text-zinc-400 hover:bg-zinc-800 hover:text-white" aria-label="Close">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6 6 18M6 6l12 12" /></svg>
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

export function ConfirmDialog({ open, onClose, onConfirm, title, message, confirmLabel = "Delete", loading }: { open: boolean; onClose: () => void; onConfirm: () => void; title: string; message: string; confirmLabel?: string; loading?: boolean }) {
  return (
    <Modal open={open} onClose={onClose} title={title}>
      <p className="text-sm text-zinc-300">{message}</p>
      <div className="mt-6 flex justify-end gap-2">
        <Button variant="ghost" onClick={onClose}>Cancel</Button>
        <Button variant="danger" onClick={onConfirm} loading={loading}>{confirmLabel}</Button>
      </div>
    </Modal>
  );
}

// ---------- Empty state ----------
export function EmptyState({ icon, title, description, action }: { icon?: ReactNode; title: string; description: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-zinc-800 bg-zinc-900/30 px-6 py-16 text-center">
      <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-zinc-800 text-lime-300">{icon ?? "◎"}</div>
      <h3 className="text-base font-semibold text-white">{title}</h3>
      <p className="mt-1 max-w-sm text-sm text-zinc-400">{description}</p>
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

// ---------- Skeleton ----------
export function Skeleton({ className }: { className?: string }) {
  return <div className={cx("animate-pulse rounded-lg bg-zinc-800/80", className)} />;
}
export function ListSkeleton({ rows = 4 }: { rows?: number }) {
  return (
    <div className="space-y-3">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-5">
          <div className="flex items-center justify-between">
            <Skeleton className="h-5 w-48" />
            <Skeleton className="h-5 w-20" />
          </div>
          <Skeleton className="mt-3 h-4 w-full max-w-md" />
          <Skeleton className="mt-2 h-4 w-2/3 max-w-sm" />
        </div>
      ))}
    </div>
  );
}

// ---------- Page header ----------
export function PageHeader({ eyebrow, title, description, actions }: { eyebrow?: string; title: string; description?: string; actions?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div>
        {eyebrow && <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-lime-300/80">{eyebrow}</p>}
        <h1 className="mt-1 text-2xl font-semibold tracking-tight text-white sm:text-3xl">{title}</h1>
        {description && <p className="mt-1 max-w-2xl text-sm text-zinc-400">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

// ---------- Toasts ----------
type Toast = { id: number; message: string; tone: "success" | "error" | "info" };
const ToastCtx = createContext<{ push: (message: string, tone?: Toast["tone"]) => void } | null>(null);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const push = useCallback((message: string, tone: Toast["tone"] = "info") => {
    const id = Date.now() + Math.random();
    setToasts((t) => [...t, { id, message, tone }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 3500);
  }, []);
  const value = useMemo(() => ({ push }), [push]);
  return (
    <ToastCtx.Provider value={value}>
      {children}
      <div className="pointer-events-none fixed bottom-4 right-4 z-[60] flex w-[calc(100%-2rem)] max-w-sm flex-col gap-2">
        {toasts.map((t) => (
          <div
            key={t.id}
            className={cx(
              "pointer-events-auto rounded-xl border px-4 py-3 text-sm shadow-xl backdrop-blur",
              t.tone === "success" && "border-lime-400/30 bg-zinc-900/95 text-lime-200",
              t.tone === "error" && "border-rose-500/30 bg-zinc-900/95 text-rose-200",
              t.tone === "info" && "border-zinc-700 bg-zinc-900/95 text-zinc-200",
            )}
          >
            {t.message}
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}
export function useToast() {
  const ctx = useContext(ToastCtx);
  if (!ctx) throw new Error("useToast must be used within ToastProvider");
  return ctx;
}

// ---------- fetch helper ----------
export async function api<T>(url: string, init?: RequestInit & { json?: unknown }): Promise<T> {
  const { json, ...rest } = init ?? {};
  const res = await fetch(url, {
    ...rest,
    headers: { "Content-Type": "application/json", ...(rest.headers ?? {}) },
    body: json !== undefined ? JSON.stringify(json) : rest.body,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((data as { error?: string }).error ?? `Request failed (${res.status})`);
  return data as T;
}

export function timeAgo(date: string | Date | null | undefined) {
  if (!date) return "never";
  const d = typeof date === "string" ? new Date(date) : date;
  const diff = (Date.now() - d.getTime()) / 1000;
  if (diff < 60) return "just now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  if (diff < 86400 * 30) return `${Math.floor(diff / 86400)}d ago`;
  return d.toLocaleDateString();
}
