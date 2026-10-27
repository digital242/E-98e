"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { navigationForRole } from "@/lib/navigationConfig";
import { useERPStore } from "@/store/erpStore";
import { totalDispatchable } from "@/store/domains/dispatch";
import type { UserRole } from "@/types/erp";

/** Pending-work counters shown as badges next to nav items. */
function useCounters(): Record<string, number> {
  const s = useERPStore();
  return {
    "/plant-head/incoming-orders": s.orders.filter((o) => o.planningStatus === "PENDING" && o.commercialStatus !== "CREDIT_HOLD").length,
    "/plant-head/planning": s.orders.filter((o) => o.planningStatus === "PLANT_HEAD_ACCEPTED").length,
    "/plant-head/material-approvals": s.materialRequests.filter((m) => m.status === "PENDING_HOD").length,
    "/plant-head/indent-approvals": s.purchaseIndents.filter((i) => i.status === "PENDING_APPROVAL").length,
    "/store/material-requests": s.materialRequests.filter((m) => m.status === "APPROVED" || m.status === "SHORTAGE").length,
    "/store/goods-receipt": s.purchaseOrders.filter((p) => p.status === "ISSUED" || p.status === "GATE_ENTRY").length,
    "/qc/pending": s.workOrders.filter((w) => w.pendingQcQty > 0).length,
    "/qc/returns": s.rmas.filter((r) => r.status === "RECEIVED").length,
    "/dispatch/orders": s.orders.filter((o) => totalDispatchable(s, o.id) > 0).length,
    "/dispatch/delivery": s.dispatchOrders.filter((d) => d.status === "IN_TRANSIT").length,
    "/dispatch/returns": s.rmas.filter((r) => r.status === "AUTHORIZED").length,
    "/finance/invoices": s.dispatchOrders.filter((d) => !d.invoiceId && s.orders.find((o) => o.id === d.orderId)?.orderType === "STANDARD").length,
    "/finance/payment-verification": s.paymentConfirmations.filter((p) => p.status === "PENDING").length,
    "/finance-executive/payment-verification": s.paymentConfirmations.filter((p) => p.status === "PENDING").length,
    "/finance/credit-control": s.orders.filter((o) => o.commercialStatus === "CREDIT_HOLD").length,
    "/finance/purchase-orders": s.purchaseIndents.filter((i) => i.status === "APPROVED").length,
    "/finance/payroll": s.payrollBatches.filter((b) => b.status === "SUBMITTED" || b.status === "APPROVED").length,
    "/finance/credit-notes": s.rmas.filter((r) => r.status === "QC_DONE" && !r.replacementOrderId).length,
    "/production/material-requests": s.materialRequests.filter((m) => m.status === "ISSUED").length,
    "/production/testing": s.reworkLogs.filter((r) => r.disposition === "PENDING").length,
    "/sales/returns": s.rmas.filter((r) => r.status === "REQUESTED" || (r.status === "QC_DONE" && !r.replacementOrderId)).length,
    "/hr/leaves": s.leaves.filter((l) => l.status === "PENDING").length,
  };
}

export default function Sidebar({ role, open, onNavigate }: { role: UserRole; open: boolean; onNavigate: () => void }) {
  const pathname = usePathname();
  const counters = useCounters();
  const company = useERPStore((s) => s.company);
  return (
    <aside className={`sidebar ${open ? "open" : ""}`} aria-label="Main navigation">
      <div className="brand" style={{ flexDirection: "column", alignItems: "flex-start", gap: 6 }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={company.logoUrl || "/brand/thermodrain-logo.png"} alt={company.brandName} style={{ width: "100%", height: "auto" }} />
        <div className="brand-sub">Enterprise Resource Planning</div>
      </div>
      {navigationForRole(role).map((section) => (
        <nav key={section.module}>
          <div className="nav-title">{section.title}</div>
          {section.items.map((item) => {
            const active = pathname === item.href || pathname.startsWith(item.href + "/");
            const count = counters[item.href];
            return (
              <Link key={item.href} href={item.href} className={`nav-link ${active ? "active" : ""}`} onClick={onNavigate}>
                <span className="nav-icon" aria-hidden>
                  {item.icon}
                </span>
                {item.label}
                {count ? <span className="nav-badge">{count}</span> : null}
              </Link>
            );
          })}
        </nav>
      ))}
    </aside>
  );
}
