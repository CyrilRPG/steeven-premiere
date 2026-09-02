"use client";

import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from "react";
import { cx } from "@/components/ui/primitives";

export interface ToastOptions {
  actionLabel?: string;
  onAction?: () => void | Promise<void>;
  tone?: "neutral" | "success" | "danger";
  durationMs?: number;
}

interface ToastItem extends ToastOptions {
  id: number;
  message: string;
}

const ToastContext = createContext<(message: string, opts?: ToastOptions) => void>(() => {});

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const counter = useRef(0);

  const dismiss = useCallback((id: number) => setItems((list) => list.filter((t) => t.id !== id)), []);

  const toast = useCallback(
    (message: string, opts?: ToastOptions) => {
      const id = ++counter.current;
      setItems((list) => [...list.slice(-2), { id, message, ...opts }]);
      setTimeout(() => dismiss(id), opts?.durationMs ?? (opts?.actionLabel ? 6000 : 3000));
    },
    [dismiss],
  );

  const value = useMemo(() => toast, [toast]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="pointer-events-none fixed inset-x-0 bottom-20 z-[60] flex flex-col items-center gap-2 px-4 md:bottom-6" aria-live="polite">
        {items.map((t) => (
          <div
            key={t.id}
            className={cx(
              "pointer-events-auto flex max-w-md items-center gap-3 rounded-lg border px-4 py-2.5 text-sm shadow-lg",
              t.tone === "danger" ? "border-danger/40 bg-danger-soft text-danger" : t.tone === "success" ? "border-success/40 bg-success-soft text-success" : "border-border bg-surface text-fg",
            )}
          >
            <span>{t.message}</span>
            {t.actionLabel && (
              <button
                type="button"
                className="font-semibold underline underline-offset-2"
                onClick={async () => {
                  await t.onAction?.();
                  dismiss(t.id);
                }}
              >
                {t.actionLabel}
              </button>
            )}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  return useContext(ToastContext);
}
