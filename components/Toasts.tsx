"use client";
import { useNotificationStore } from "@/store/notificationStore";

export default function Toasts() {
  const toasts = useNotificationStore((s) => s.toasts);
  const dismiss = useNotificationStore((s) => s.dismiss);
  return (
    <div className="toasts" aria-live="polite">
      {toasts.map((t) => (
        <div key={t.id} className={`toast ${t.kind}`} onClick={() => dismiss(t.id)} role="status">
          {t.message}
        </div>
      ))}
    </div>
  );
}
