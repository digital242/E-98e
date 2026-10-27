"use client";
import { useMemo, useState } from "react";
import { addDays, fmtDate, fmtINR, fmtNum, round2 } from "@/lib/calc";
import { run } from "@/store/notificationStore";
import { useERPStore } from "@/store/erpStore";
import type { PlanLine } from "@/store/domains/production";
import { Btn, Card, DataTable, Field, HBars, Modal, PageHeader, ProgressBar, Stat, StatusBadge } from "@/components/ui";
import { useLookups } from "@/components/useLookups";
import OrdersView from "@/components/OrdersView";

export default function PlantHeadPortal({ view }: { view: string }) {
  switch (view) {
    case "incoming-orders": return <IncomingOrders />;
    case "planning": return <Planning />;
    case "material-approvals": return <MaterialApprovals />;
    case "indent-approvals": return <IndentApprovals />;
    case "production-analytics": return <Analytics />;
    default: return <Dashboard />;
  }
}

function Dashboard() {
  const s = useERPStore();
  const L = useLookups();
  const activeWo = s.workOrders.filter((w) => w.status !== "COMPLETED");
  const loadByMachine = s.machines.map((m) => ({ label: m, value: activeWo.filter((w) => w.machine === m).reduce((a, w) => a + (w.plannedQty - w.producedQty) * (L.product(w.productId)?.weightKg ?? 0), 0) }));
  const lowStock = s.rawMaterials.filter((m) => m.stock <= m.reorderLevel);
  const late = s.orders.filter((o) => !["CLOSED", "DELIVERED", "REJECTED", "IN_TRANSIT"].includes(o.workflowStatus) && new Date(o.deliveryDate) < new Date());
  return (
    <>
      <PageHeader title="Plant operations" subtitle="Capacity, pending decisions and risks" />
      <div className="stats">
        <Stat label="Awaiting your acceptance" value={s.orders.filter((o) => o.planningStatus === "PENDING" && o.commercialStatus !== "CREDIT_HOLD").length} tone="accent" />
        <Stat label="To plan" value={s.orders.filter((o) => o.planningStatus === "PLANT_HEAD_ACCEPTED").length} />
        <Stat label="Active work orders" value={activeWo.length} sub={`${fmtNum(activeWo.reduce((a, w) => a + w.plannedQty - w.producedQty, 0))} units to mould`} />
        <Stat label="Late orders" value={late.length} tone={late.length ? "bad" : "ok"} />
        <Stat label="Materials below reorder" value={lowStock.length} tone={lowStock.length ? "bad" : "ok"} />
      </div>
      <div className="grid grid-2">
        <Card title="Open load by machine (kg of FRP)">
          <HBars rows={loadByMachine} format={(n) => `${fmtNum(Math.round(n))} kg`} />
        </Card>
        <Card title="Approvals waiting">
          <ul style={{ margin: 0, paddingLeft: 18, lineHeight: 2 }}>
            <li>{s.materialRequests.filter((m) => m.status === "PENDING_HOD").length} material requests</li>
            <li>{s.purchaseIndents.filter((i) => i.status === "PENDING_APPROVAL").length} purchase indents</li>
            <li>{s.reworkLogs.filter((r) => r.disposition === "PENDING").length} rejected batches awaiting rework / scrap decision</li>
          </ul>
        </Card>
      </div>
    </>
  );
}

function IncomingOrders() {
  const s = useERPStore();
  const [reject, setReject] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const pending = s.orders.filter((o) => o.planningStatus === "PENDING");
  return (
    <>
      <PageHeader title="Incoming orders" subtitle="Accept orders you can make on time, or reject with a reason. Orders on credit hold need Finance first." />
      <OrdersView
        orders={pending}
        empty="No orders waiting for review"
        actions={(o) =>
          o.commercialStatus === "CREDIT_HOLD" ? (
            <StatusBadge status="CREDIT_HOLD" />
          ) : (
            <>
              <Btn size="sm" variant="danger" onClick={() => setReject(o.id)}>Reject</Btn>
              <Btn size="sm" variant="primary" onClick={() => run(() => s.acceptOrderByPlantHead(o.id, "Accepted — capacity available"), "Order accepted — plan it next")}>Accept</Btn>
            </>
          )
        }
      />
      {reject && (
        <Modal title="Reject order" onClose={() => setReject(null)} footer={<><Btn readOnlySafe onClick={() => setReject(null)}>Cancel</Btn><Btn variant="danger" onClick={() => run(() => s.rejectOrderByPlantHead(reject, reason), "Order rejected") && setReject(null)}>Reject order</Btn></>}>
          <Field label="Reason"><textarea value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Mould for this size not available; earliest slot in 6 weeks" /></Field>
        </Modal>
      )}
    </>
  );
}

function Planning() {
  const s = useERPStore();
  const [planFor, setPlanFor] = useState<string | null>(null);
  const toPlan = s.orders.filter((o) => o.planningStatus === "PLANT_HEAD_ACCEPTED");
  return (
    <>
      <PageHeader title="Production planning" subtitle="Split each accepted order into work orders by machine and shift" />
      <OrdersView orders={toPlan} empty="Nothing to plan — accept incoming orders first" actions={(o) => <Btn size="sm" variant="primary" onClick={() => setPlanFor(o.id)}>Plan</Btn>} />
      <div style={{ height: 16 }} />
      <Schedule />
      {planFor && <PlanModal orderId={planFor} onClose={() => setPlanFor(null)} />}
    </>
  );
}

function Schedule() {
  const s = useERPStore();
  const L = useLookups();
  const rows = s.workOrders.filter((w) => w.status !== "COMPLETED").sort((a, b) => a.targetDate.localeCompare(b.targetDate));
  return (
    <Card title="Open work-order schedule" flush>
      <DataTable
        rowKey={(w) => w.id}
        rows={rows}
        empty="No open work orders"
        columns={[
          { header: "Target", render: (w) => <span className="nowrap">{fmtDate(w.targetDate)}</span> },
          { header: "WO", render: (w) => <span className="mono">{w.workOrderNo}</span> },
          { header: "Order", render: (w) => L.order(w.orderId)?.orderNo },
          { header: "Product", render: (w) => L.productName(w.productId) },
          { header: "Machine / shift", render: (w) => `${w.machine} · ${w.shift}` },
          { header: "Progress", render: (w) => <div style={{ minWidth: 110 }}><ProgressBar value={w.producedQty} max={w.plannedQty} /><small>{w.producedQty}/{w.plannedQty}</small></div> },
          { header: "Status", render: (w) => <StatusBadge status={w.status} /> },
        ]}
      />
    </Card>
  );
}

function PlanModal({ orderId, onClose }: { orderId: string; onClose: () => void }) {
  const s = useERPStore();
  const L = useLookups();
  const o = s.orders.find((x) => x.id === orderId)!;
  const [lines, setLines] = useState<PlanLine[]>(
    o.items.map((i, k) => ({ productId: i.productId, plannedQty: Math.ceil(i.qty * 1.02), machine: s.machines[k % s.machines.length], shift: "A", targetDate: addDays(new Date().toISOString(), 5).slice(0, 10) }))
  );
  const upd = (k: number, patch: Partial<PlanLine>) => setLines(lines.map((l, i) => (i === k ? { ...l, ...patch } : l)));
  const materialNeed = useMemo(() => {
    const need = new Map<string, number>();
    lines.forEach((l) => L.product(l.productId)?.bom.forEach((b) => need.set(b.materialId, (need.get(b.materialId) ?? 0) + b.qtyPerUnit * l.plannedQty)));
    return Array.from(need, ([id, qty]) => ({ m: L.material(id)!, qty: round2(qty) }));
  }, [lines, L]);
  return (
    <Modal title={`Plan ${o.orderNo}`} wide onClose={onClose} footer={<><Btn readOnlySafe onClick={onClose}>Cancel</Btn><Btn variant="primary" onClick={() => run(() => s.planOrder(o.id, lines), (w) => `${w.length} work order(s) released to production`) && onClose()}>Release work orders</Btn></>}>
      <div className="stack">
        <small>Planned qty defaults to ordered qty + 2% moulding allowance.</small>
        <div className="table-wrap">
          <table>
            <thead><tr><th>Product</th><th className="num">Ordered</th><th className="num">Planned</th><th>Machine</th><th>Shift</th><th>Target date</th><th /></tr></thead>
            <tbody>
              {lines.map((l, k) => (
                <tr key={k}>
                  <td>{L.productName(l.productId)}</td>
                  <td className="num">{o.items.filter((i) => i.productId === l.productId).reduce((a, i) => a + i.qty, 0)}</td>
                  <td className="num"><input type="number" style={{ width: 80 }} value={l.plannedQty} onChange={(e) => upd(k, { plannedQty: Number(e.target.value) })} /></td>
                  <td><select value={l.machine} onChange={(e) => upd(k, { machine: e.target.value })}>{s.machines.map((m) => <option key={m}>{m}</option>)}</select></td>
                  <td><select value={l.shift} onChange={(e) => upd(k, { shift: e.target.value as PlanLine["shift"] })}>{["A", "B", "C"].map((x) => <option key={x}>{x}</option>)}</select></td>
                  <td><input type="date" value={l.targetDate} onChange={(e) => upd(k, { targetDate: e.target.value })} /></td>
                  <td><button className="btn ghost sm" aria-label="Split line" title="Split across another machine" onClick={() => setLines([...lines.slice(0, k + 1), { ...l, plannedQty: 0 }, ...lines.slice(k + 1)])}>Split</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <Card title="Raw material required vs stock">
          <div className="table-wrap">
            <table>
              <thead><tr><th>Material</th><th className="num">Required</th><th className="num">In stock</th><th /></tr></thead>
              <tbody>
                {materialNeed.map(({ m, qty }) => (
                  <tr key={m.id}><td>{m.name}</td><td className="num">{fmtNum(qty)} {m.unit}</td><td className="num">{fmtNum(m.stock)}</td><td>{qty > m.stock ? <StatusBadge status="SHORTAGE" /> : <StatusBadge status="APPROVED" />}</td></tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      </div>
    </Modal>
  );
}

function MaterialApprovals() {
  const s = useERPStore();
  const L = useLookups();
  const rows = s.materialRequests.filter((m) => m.status === "PENDING_HOD");
  return (
    <>
      <PageHeader title="Material request approvals" subtitle="Check requested quantities against the bill of materials before the store issues them" />
      <Card flush>
        <DataTable
          rowKey={(m) => m.id}
          rows={rows}
          empty="No material requests waiting"
          columns={[
            { header: "MR", render: (m) => <><span className="mono">{m.mrNo}</span><div><small>{fmtDate(m.createdAt)} · {m.requestedBy}</small></div></> },
            { header: "Work order", render: (m) => { const w = L.workOrder(m.workOrderId); return <>{w?.workOrderNo}<div><small>{w && L.productName(w.productId)} × {w ? w.plannedQty - w.producedQty : 0}</small></div></>; } },
            {
              header: "Materials (requested / BOM)",
              render: (m) => {
                const w = L.workOrder(m.workOrderId);
                const p = w && L.product(w.productId);
                return (
                  <div style={{ fontSize: 12.5 }}>
                    {m.lines.map((l) => {
                      const bom = p?.bom.find((b) => b.materialId === l.materialId);
                      const std = bom && w ? round2(bom.qtyPerUnit * (w.plannedQty - w.producedQty)) : 0;
                      const over = std > 0 && l.qty > std * 1.05;
                      return <div key={l.materialId} style={{ color: over ? "var(--bad)" : undefined }}>{L.material(l.materialId)?.name}: {fmtNum(l.qty)} / {fmtNum(std)} {L.material(l.materialId)?.unit}{over ? " ▲ above BOM" : ""}</div>;
                    })}
                  </div>
                );
              },
            },
            {
              header: "",
              render: (m) => (
                <div className="row" style={{ justifyContent: "flex-end" }}>
                  <Btn size="sm" variant="danger" onClick={() => run(() => s.rejectMaterialRequest(m.id, "Rejected by Plant Head"), "Request rejected")}>Reject</Btn>
                  <Btn size="sm" variant="primary" onClick={() => run(() => s.approveMaterialRequest(m.id), "Approved — sent to Store")}>Approve</Btn>
                </div>
              ),
            },
          ]}
        />
      </Card>
    </>
  );
}

function IndentApprovals() {
  const s = useERPStore();
  const L = useLookups();
  const rows = s.purchaseIndents.filter((i) => i.status === "PENDING_APPROVAL");
  return (
    <>
      <PageHeader title="Purchase indent approvals" subtitle="Approved indents go to Finance to raise a purchase order" />
      <Card flush>
        <DataTable
          rowKey={(i) => i.id}
          rows={rows}
          empty="No indents waiting"
          columns={[
            { header: "Indent", render: (i) => <><span className="mono">{i.indentNo}</span><div><small>{fmtDate(i.createdAt)} · {i.requestedBy}</small></div></> },
            { header: "Material", render: (i) => L.material(i.materialId)?.name },
            { header: "Qty", num: true, render: (i) => `${fmtNum(i.qty)} ${L.material(i.materialId)?.unit}` },
            { header: "Est. value", num: true, render: (i) => fmtINR(i.qty * (L.material(i.materialId)?.unitCost ?? 0)) },
            { header: "Reason", render: (i) => <><StatusBadge status={i.reason} /><div><small>{i.sourceRef}</small></div></> },
            { header: "Stock now", num: true, render: (i) => fmtNum(L.material(i.materialId)?.stock ?? 0) },
            {
              header: "",
              render: (i) => (
                <div className="row" style={{ justifyContent: "flex-end" }}>
                  <Btn size="sm" variant="danger" onClick={() => run(() => s.rejectIndent(i.id), "Indent rejected")}>Reject</Btn>
                  <Btn size="sm" variant="primary" onClick={() => run(() => s.approveIndent(i.id), "Indent approved — sent to Finance")}>Approve</Btn>
                </div>
              ),
            },
          ]}
        />
      </Card>
    </>
  );
}

function Analytics() {
  const s = useERPStore();
  const L = useLookups();
  const produced = s.productionLogs.reduce((a, l) => a + l.qty, 0);
  const inspected = s.qcRecords.reduce((a, q) => a + q.inspectedQty, 0);
  const accepted = s.qcRecords.reduce((a, q) => a + q.acceptedQty, 0);
  const byProduct = new Map<string, number>();
  s.productionLogs.forEach((l) => {
    const w = L.workOrder(l.workOrderId);
    if (w) byProduct.set(L.productShort(w.productId), (byProduct.get(L.productShort(w.productId)) ?? 0) + l.qty);
  });
  const byShift = ["A", "B", "C"].map((sh) => ({ label: `Shift ${sh}`, value: s.productionLogs.filter((l) => l.shift === sh).reduce((a, l) => a + l.qty, 0) }));
  const defects = new Map<string, number>();
  s.reworkLogs.forEach((r) => defects.set(r.reason || "Unspecified", (defects.get(r.reason || "Unspecified") ?? 0) + r.qty));
  return (
    <>
      <PageHeader title="Production analytics" subtitle="Output, first-pass yield and defects" />
      <div className="stats">
        <Stat label="Units moulded" value={fmtNum(produced)} />
        <Stat label="First-pass yield" value={inspected ? `${round2((accepted / inspected) * 100)}%` : "—"} tone="ok" sub={`${accepted} of ${inspected} inspected`} />
        <Stat label="Rejected units" value={fmtNum(inspected - accepted)} tone="bad" />
      </div>
      <div className="grid grid-3">
        <Card title="Output by product"><HBars rows={Array.from(byProduct, ([label, value]) => ({ label, value }))} format={fmtNum} /></Card>
        <Card title="Output by shift"><HBars rows={byShift} format={fmtNum} /></Card>
        <Card title="Defect reasons"><HBars rows={Array.from(defects, ([label, value]) => ({ label, value }))} format={fmtNum} /></Card>
      </div>
    </>
  );
}
