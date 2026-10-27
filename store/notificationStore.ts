"use client";
import { create } from "zustand";

export type ToastKind = "success" | "error" | "info" | "warning";

export interface Toast {
  id: number;
  kind: ToastKind;
  message: string;
}

interface NotificationState {
  toasts: Toast[];
  push: (kind: ToastKind, message: string) => void;
  dismiss: (id: number) => void;
}

let counter = 0;

export const useNotificationStore = create<NotificationState>()((set) => ({
  toasts: [],
  push: (kind, message) => {
    const id = ++counter;
    set((s) => ({ toasts: [...s.toasts, { id, kind, message }] }));
    setTimeout(() => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })), 4500);
  },
  dismiss: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
}));

export const toast = {
  success: (m: string) => useNotificationStore.getState().push("success", m),
  error: (m: string) => useNotificationStore.getState().push("error", m),
  info: (m: string) => useNotificationStore.getState().push("info", m),
  warning: (m: string) => useNotificationStore.getState().push("warning", m),
};

/** Runs a store action; shows a toast with the result. Returns the action result or null on error. */
export function run<T>(fn: () => T, success?: string | ((r: T) => string)): T | null {
  try {
    const r = fn();
    if (success) toast.success(typeof success === "function" ? success(r) : success);
    return r;
  } catch (e) {
    toast.error(e instanceof Error ? e.message : String(e));
    return null;
  }
}
