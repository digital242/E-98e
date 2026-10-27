"use client";
import { fmtINR, fmtNum, round2 } from "@/lib/calc";
import { useERPStore } from "@/store/erpStore";
import { totalDispatchable } from "@/store/domains/dispatch";
import { Card, HBars, PageHeader, Stat, StatusBadge } from "@/components/ui";
import OrdersView from "@/components/OrdersView";
import type { WorkflowStatus } from "@/types/erp";

const STAGES: WorkflowStatus[] = ["CREDIT_HOLD", "PLANT_REVIEW", "ACCEPTED", "PLANNED", "IN_PRODUCTION", "QC", "READY_TO_DISPATCH", "PARTIALLY_DISPATCHED", "IN_TRANSIT", "DELIVERED", "CLOSED"];

export default function SuperAdminPortal(_props: { view: string }) {
  const s = useERPStore();
  const std = s.orders.filter((o) => o.orderType === "STANDARD" && o.planningStatus !== "PLANT_HEAD_REJECTED");
  const book = std.reduce((a, o) => a + o.grandTotal, 0);
  const collected = std.reduce((a, o) => a + o.amountPaid, 0);
  const invoiced = s.invoices.reduce((a, i) => a + i.total, 0);
  const inspected = s.qcRecords.reduce((a, q) => a + q.inspectedQty, 0);
  const accepted = s.qcRecords.reduce((a, q) => a + q.acceptedQty, 0);
  const rmValue = s.rawMaterials.reduce((a, m) => a + m.stock * m.unitCost, 0);
  const lastPayroll = s.payrollBatches[0];
  const openOrders = s.orders.filter((o) => !["CLOSED", "REJECTED"].includes(o.workflowStatus));
  const late = openOrders.filter((o) => o.dispatchStatus !== "DELIVERED" && new Date(o.deliveryDate) < new Date());
  return (
    <>
      <PageHeader title="Executive control center" subtitle="All departments at a glance" />
      <div className="stats">
        <Stat label="Order book" value={fmtINR(book)} sub={`${std.length} orders`} />
        <Stat label="Invoiced" value={fmtINR(invoiced)} />
        <Stat label="Collected" value={fmtINR(collected)} tone="ok" sub={book ? `${Math.round((collected / book) * 100)}% of order book` : undefined} />
        <Stat label="First-pass yield" value={inspected ? `${round2((accepted / inspected) * 100)}%` : "—"} tone="ok" />
        <Stat label="Late orders" value={late.length} tone={late.length ? "bad" : "ok"} />
        <Stat label="Raw material stock" value={fmtINR(rmValue)} />
        <Stat label="Last payroll" value={lastPayroll ? fmtINR(lastPayroll.totalNet) : "—"} sub={lastPayroll ? <>{lastPayroll.month} · <StatusBadge status={lastPayroll.status} /></> : undefined} />
      </div>
      <div className="grid grid-2">
        <Card title="Orders by stage">
          <HBars rows={STAGES.map((st) => ({ label: st.replace(/_/g, " ").toLowerCase(), value: s.orders.filter((o) => o.workflowStatus === st).length })).filter((r) => r.value > 0)} format={fmtNum} />
        </Card>
        <Card title="Departments waiting on">
          <HBars
            rows={[
              { label: "Finance — credit holds", value: s.orders.filter((o) => o.commercialStatus === "CREDIT_HOLD").length },
              { label: "Plant — orders to accept", value: s.orders.filter((o) => o.planningStatus === "PENDING" && o.commercialStatus !== "CREDIT_HOLD").length },
              { label: "Plant — approvals", value: s.materialRequests.filter((m) => m.status === "PENDING_HOD").length + s.purchaseIndents.filter((i) => i.status === "PENDING_APPROVAL").length },
              { label: "Store — issues", value: s.materialRequests.filter((m) => m.status === "APPROVED" || m.status === "SHORTAGE").length },
              { label: "QC — batches", value: s.workOrders.filter((w) => w.pendingQcQty > 0).length },
              { label: "Dispatch — ready", value: s.orders.filter((o) => totalDispatchable(s, o.id) > 0).length },
              { label: "Finance — payments", value: s.paymentConfirmations.filter((p) => p.status === "PENDING").length },
            ]}
            format={fmtNum}
          />
        </Card>
      </div>
      <div style={{ height: 16 }} />
      <h2 style={{ marginBottom: 10 }}>Open orders</h2>
      <OrdersView orders={openOrders} />
    </>
  );
}
