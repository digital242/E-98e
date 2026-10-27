"use client";
import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

// ---------- Read-only access context ----------
export const AccessContext = createContext<{ canEdit: boolean }>({ canEdit: true });
export const useCanEdit = () => useContext(AccessContext).canEdit;

// ---------- Layout ----------
export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="page-head">
      <div>
        <h1>{title}</h1>
        {subtitle && <p>{subtitle}</p>}
      </div>
      {actions && <div className="row">{actions}</div>}
    </div>
  );
}

export function Card({ title, actions, children, flush, className = "" }: { title?: ReactNode; actions?: ReactNode; children: ReactNode; flush?: boolean; className?: string }) {
  return (
    <section className={`card ${flush ? "flush" : ""} ${className}`}>
      {(title || actions) && (
        <div className="card-head">
          {typeof title === "string" ? <h2>{title}</h2> : title}
          {actions && <div className="row">{actions}</div>}
        </div>
      )}
      {children}
    </section>
  );
}

export function Stat({ label, value, sub, tone }: { label: string; value: ReactNode; sub?: ReactNode; tone?: "accent" | "bad" | "ok" }) {
  // A zero count is not an alert.
  if (value === 0 && (tone === "accent" || tone === "bad")) tone = undefined;
  return (
    <div className={`card stat ${tone ? `tone-${tone}` : ""}`}>
      <span className="stat-label">{label}</span>
      <span className="stat-value">{value}</span>
      {sub && <span className="stat-sub">{sub}</span>}
    </div>
  );
}

// ---------- Badges ----------
type Tone = "ok" | "warn" | "bad" | "info" | "primary" | "";
const TONES: Record<string, Tone> = {
  // good / finished
  CLOSED: "ok", DELIVERED: "ok", PASSED: "ok", PASS: "ok", FULLY_PAID: "ok", VERIFIED: "ok", ISSUED: "primary", ACKNOWLEDGED: "ok",
  COMPLETED: "ok", APPROVED: "ok", WON: "ok", CONVERTED: "ok", RECEIVED: "ok", PAID: "ok", DISBURSED: "ok", CREDIT_OK: "ok",
  READY_TO_DISPATCH: "ok", CREDIT_OVERRIDE: "info", REWORKED: "ok", RESTOCK: "ok", QC_DONE: "info", PLANT_HEAD_ACCEPTED: "info",
  // in progress
  IN_PRODUCTION: "info", IN_PROGRESS: "info", ACTIVE: "info", IN_TRANSIT: "info", PLANNED: "primary", ACCEPTED: "primary",
  QC: "info", SENT: "info", SUBMITTED: "info", PARTIAL: "warn", PARTIALLY_DISPATCHED: "warn", GATE_ENTRY: "info", PO_RAISED: "primary",
  DISPATCHED: "info", AUTHORIZED: "info", CONTACTED: "info", SAMPLE_SENT: "info", QUOTED: "primary",
  // waiting
  PENDING: "warn", PENDING_HOD: "warn", PENDING_APPROVAL: "warn", PLANT_REVIEW: "warn", REQUESTED: "warn", UNPAID: "warn",
  DRAFT: "", NEW: "warn", NOT_STARTED: "",
  // bad
  REJECTED: "bad", FAIL: "bad", CREDIT_HOLD: "bad", SHORTAGE: "bad", LOST: "bad", SCRAPPED: "bad", SCRAP: "bad",
  PLANT_HEAD_REJECTED: "bad", OVERDUE: "bad",
};

export function Badge({ children, tone = "" }: { children: ReactNode; tone?: Tone }) {
  return <span className={`badge ${tone}`}>{children}</span>;
}

export function StatusBadge({ status }: { status: string }) {
  const label = status.replace(/_/g, " ").toLowerCase().replace(/^\w/, (c) => c.toUpperCase());
  return <Badge tone={TONES[status] ?? ""}>{label}</Badge>;
}

// ---------- Buttons ----------
export function Btn({
  children,
  onClick,
  variant,
  size,
  disabled,
  type = "button",
  title,
  readOnlySafe,
}: {
  children: ReactNode;
  onClick?: () => void;
  variant?: "primary" | "danger" | "ghost";
  size?: "sm";
  disabled?: boolean;
  type?: "button" | "submit";
  title?: string;
  /** Viewing actions (print, open) stay enabled for read-only users. */
  readOnlySafe?: boolean;
}) {
  const canEdit = useCanEdit();
  const blocked = !readOnlySafe && !canEdit;
  return (
    <button
      type={type}
      className={`btn ${variant ?? ""} ${size ?? ""}`}
      onClick={onClick}
      disabled={disabled || blocked}
      title={blocked ? "Read-only access" : title}
    >
      {children}
    </button>
  );
}

// ---------- Table ----------
export interface Column<T> {
  header: string;
  render: (row: T) => ReactNode;
  num?: boolean;
  className?: string;
}

export function DataTable<T>({ rows, columns, empty = "Nothing here yet", rowKey }: { rows: T[]; columns: Column<T>[]; empty?: string; rowKey: (r: T) => string }) {
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            {columns.map((c, i) => (
              <th key={i} className={c.num ? "num" : ""}>
                {c.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td colSpan={columns.length} className="empty">
                {empty}
              </td>
            </tr>
          ) : (
            rows.map((r) => (
              <tr key={rowKey(r)}>
                {columns.map((c, i) => (
                  <td key={i} className={`${c.num ? "num" : ""} ${c.className ?? ""}`}>
                    {c.render(r)}
                  </td>
                ))}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}

// ---------- Modal ----------
export function Modal({ title, onClose, children, footer, wide }: { title: string; onClose: () => void; children: ReactNode; footer?: ReactNode; wide?: boolean }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={`modal ${wide ? "wide" : ""}`} role="dialog" aria-modal="true" aria-label={title}>
        <div className="modal-head no-print">
          <h2>{title}</h2>
          <button className="btn ghost sm" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </div>
        <div className="modal-body">{children}</div>
        {footer && <div className="modal-foot no-print">{footer}</div>}
      </div>
    </div>
  );
}

// ---------- Forms ----------
export function Field({ label, children, hint, full }: { label: string; children: ReactNode; hint?: string; full?: boolean }) {
  return (
    <div className={`field ${full ? "full" : ""}`}>
      <label>{label}</label>
      {children}
      {hint && <span className="hint">{hint}</span>}
    </div>
  );
}

export function Tabs<T extends string>({ tabs, value, onChange }: { tabs: { id: T; label: string; count?: number }[]; value: T; onChange: (t: T) => void }) {
  return (
    <div className="tabs" role="tablist">
      {tabs.map((t) => (
        <button key={t.id} role="tab" aria-selected={value === t.id} className={`tab ${value === t.id ? "active" : ""}`} onClick={() => onChange(t.id)}>
          {t.label}
          {t.count !== undefined && <span className="muted"> ({t.count})</span>}
        </button>
      ))}
    </div>
  );
}

export function ProgressBar({ value, max, tone }: { value: number; max: number; tone?: "accent" | "bad" }) {
  const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0;
  return (
    <div className={`bar ${tone ?? ""}`} title={`${Math.round(pct)}%`}>
      <span style={{ width: `${pct}%` }} />
    </div>
  );
}

/** Horizontal bar list — used for simple charts on dashboards. */
export function HBars({ rows, format }: { rows: { label: string; value: number }[]; format: (n: number) => string }) {
  const max = Math.max(1, ...rows.map((r) => r.value));
  if (!rows.length) return <div className="empty">No data yet</div>;
  return (
    <div>
      {rows.map((r) => (
        <div className="hbar-row" key={r.label}>
          <span className="muted" style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={r.label}>
            {r.label}
          </span>
          <ProgressBar value={r.value} max={max} />
          <span className="right mono">{format(r.value)}</span>
        </div>
      ))}
    </div>
  );
}

export function useMounted() {
  const [m, setM] = useState(false);
  useEffect(() => setM(true), []);
  return m;
}

export function Search({ value, onChange, placeholder = "Search…" }: { value: string; onChange: (v: string) => void; placeholder?: string }) {
  return <input type="search" value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} aria-label={placeholder} />;
}
