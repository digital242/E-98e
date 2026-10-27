"use client";
import { useState } from "react";
import { fmtDateTime, round2 } from "@/lib/calc";
import { run } from "@/store/notificationStore";
import { useERPStore } from "@/store/erpStore";
import { requiredTestLoad } from "@/store/domains/production";
import { Btn, Card, DataTable, Field, Modal, PageHeader, Stat, StatusBadge } from "@/components/ui";
import { useLookups } from "@/components/useLookups";

export default function QCPortal({ view }: { view: string }) {
  switch (view) {
    case "history": return <History />;
    case "rework": return <Rework />;
    case "returns": return <ReturnsAudit />;
    default: return <Pending />;
  }
}

function Pending() {
  const s = useERPStore();
  const L = useLookups();
  const [inspect, setInspect] = useState<string | null>(null);
  const rows = s.workOrders.filter((w) => w.pendingQcQty > 0);
  const inspected = s.qcRecords.reduce((a, q) => a + q.inspectedQty, 0);
  const accepted = s.qcRecords.reduce((a, q) => a + q.acceptedQty, 0);
  return (
    <>
      <PageHeader title="Pending inspection" subtitle="Dimensional check, load test to EN 124 class, and surface finish for each batch" />
      <div className="stats">
        <Stat label="Batches waiting" value={rows.length} tone="accent" />
        <Stat label="Units waiting" value={rows.reduce((a, w) => a + w.pendingQcQty, 0)} />
        <Stat label="First-pass yield" value={inspected ? `${round2((accepted / inspected) * 100)}%` : "—"} tone="ok" />
      </div>
      <Card flush>
        <DataTable
          rowKey={(w) => w.id}
          rows={rows}
          empty="Nothing waiting for inspection"
          columns={[
            { header: "WO", render: (w) => <><span className="mono">{w.workOrderNo}</span><div><small>{L.order(w.orderId)?.orderNo}</small></div></> },
            { header: "Product", render: (w) => L.productName(w.productId) },
            { header: "Required test load", render: (w) => { const p = L.product(w.productId); const r = p ? requiredTestLoad(p.loadClass) : 0; return r ? `${r} kN (${p?.loadClass.split(" ")[0]})` : "Visual / dimensional"; } },
            { header: "Units to inspect", num: true, render: (w) => <b>{w.pendingQcQty}</b> },
            { header: "", render: (w) => <Btn size="sm" variant="primary" onClick={() => setInspect(w.id)}>Inspect</Btn> },
          ]}
        />
      </Card>
      {inspect && <InspectModal woId={inspect} onClose={() => setInspect(null)} />}
    </>
  );
}

function InspectModal({ woId, onClose }: { woId: string; onClose: () => void }) {
  const s = useERPStore();
  const L = useLookups();
  const wo = s.workOrders.find((w) => w.id === woId)!;
  const product = L.product(wo.productId)!;
  const required = requiredTestLoad(product.loadClass);
  const [inspectedQty, setIns] = useState(wo.pendingQcQty);
  const [acceptedQty, setAcc] = useState(wo.pendingQcQty);
  const [dimensionCheck, setDim] = useState(true);
  const [finishCheck, setFin] = useState(true);
  const [loadTestKn, setLoad] = useState(required ? Math.round(required * 1.05) : 0);
  const [defects, setDefects] = useState("");
  const loadOk = loadTestKn >= required;
  const save = () => run(() => s.recordQc({ woId, inspectedQty, acceptedQty, dimensionCheck, loadTestKn, finishCheck, defects }), (r) => `${r.qcNo}: ${r.acceptedQty} accepted, ${r.rejectedQty} rejected`) && onClose();
  return (
    <Modal
      title={`Inspect ${wo.workOrderNo}`}
      onClose={onClose}
      footer={
        <>
          <Btn readOnlySafe onClick={onClose}>Cancel</Btn>
          <Btn variant="danger" onClick={() => { setAcc(0); }}>Reject all</Btn>
          <Btn variant="primary" onClick={save}>Save inspection</Btn>
        </>
      }
    >
      <div className="stack">
        <div><b>{product.name}</b> · {product.size} · {product.loadClass}</div>
        <div className="form-grid">
          <Field label="Units inspected" hint={`${wo.pendingQcQty} waiting`}><input type="number" min={1} max={wo.pendingQcQty} value={inspectedQty} onChange={(e) => setIns(Number(e.target.value))} /></Field>
          <Field label="Units accepted"><input type="number" min={0} value={acceptedQty} onChange={(e) => setAcc(Number(e.target.value))} /></Field>
          <Field label="Load test result (kN)" hint={required ? `EN 124 requires ≥ ${required} kN without failure` : "No load class"}>
            <input type="number" value={loadTestKn} onChange={(e) => setLoad(Number(e.target.value))} style={{ borderColor: loadOk ? undefined : "var(--bad)" }} />
          </Field>
          <div className="stack" style={{ gap: 6, justifyContent: "center" }}>
            <label className="check"><input type="checkbox" checked={dimensionCheck} onChange={(e) => setDim(e.target.checked)} /> Dimensions & seating within tolerance</label>
            <label className="check"><input type="checkbox" checked={finishCheck} onChange={(e) => setFin(e.target.checked)} /> Surface finish, gelcoat & marking OK</label>
          </div>
          <Field label="Defects (required if any rejected)" full><textarea value={defects} onChange={(e) => setDefects(e.target.value)} placeholder="e.g. Voids / pinholes, warped frame, under-cure, chipped edge" /></Field>
        </div>
        <div className="row"><span className="muted">Rejected:</span> <b>{Math.max(0, inspectedQty - acceptedQty)}</b> {!loadOk && acceptedQty > 0 && <span className="badge bad">Load test below requirement — cannot accept</span>}</div>
      </div>
    </Modal>
  );
}

function History() {
  const s = useERPStore();
  const L = useLookups();
  return (
    <>
      <PageHeader title="Inspection history" subtitle="Full QC audit trail" />
      <Card flush>
        <DataTable
          rowKey={(q) => q.id}
          rows={s.qcRecords}
          empty="No inspections yet"
          columns={[
            { header: "QC no.", render: (q) => <><span className="mono">{q.qcNo}</span><div><small>{fmtDateTime(q.date)}</small></div></> },
            { header: "WO / Order", render: (q) => <>{L.workOrder(q.workOrderId)?.workOrderNo}<div><small>{L.order(q.orderId)?.orderNo}</small></div></> },
            { header: "Product", render: (q) => L.productShort(q.productId) },
            { header: "Inspected", num: true, render: (q) => q.inspectedQty },
            { header: "Accepted", num: true, render: (q) => q.acceptedQty },
            { header: "Rejected", num: true, render: (q) => q.rejectedQty },
            { header: "Load test", num: true, render: (q) => (q.loadTestKn ? `${q.loadTestKn} kN` : "—") },
            { header: "Defects", render: (q) => q.defects || "—" },
            { header: "Result", render: (q) => <StatusBadge status={q.result} /> },
            { header: "Inspector", render: (q) => q.inspector },
          ]}
        />
      </Card>
    </>
  );
}

function Rework() {
  const s = useERPStore();
  const L = useLookups();
  return (
    <>
      <PageHeader title="Rework log" subtitle="Rejected units — reworked units return to the inspection queue; scrapped units are remoulded" />
      <Card flush>
        <DataTable
          rowKey={(r) => r.id}
          rows={s.reworkLogs}
          empty="No rejected units"
          columns={[
            { header: "Date", render: (r) => fmtDateTime(r.date) },
            { header: "WO", render: (r) => <span className="mono">{L.workOrder(r.workOrderId)?.workOrderNo}</span> },
            { header: "Product", render: (r) => L.productShort(r.productId) },
            { header: "Qty", num: true, render: (r) => r.qty },
            { header: "Reason", render: (r) => r.reason },
            { header: "Disposition", render: (r) => <StatusBadge status={r.disposition} /> },
          ]}
        />
      </Card>
    </>
  );
}

function ReturnsAudit() {
  const s = useERPStore();
  const L = useLookups();
  return (
    <>
      <PageHeader title="Returns audit" subtitle="Decide whether returned goods can be restocked or must be scrapped" />
      <Card flush>
        <DataTable
          rowKey={(r) => r.id}
          rows={s.rmas.filter((r) => r.status === "RECEIVED" || r.qcDecision)}
          empty="No returned goods to audit"
          columns={[
            { header: "RMA", render: (r) => <span className="mono">{r.rmaNo}</span> },
            { header: "Product", render: (r) => `${r.qty} × ${L.productShort(r.productId)}` },
            { header: "Complaint", render: (r) => r.complaint },
            { header: "Status", render: (r) => <><StatusBadge status={r.status} />{r.qcDecision && <div><small>{r.qcDecision}</small></div>}</> },
            {
              header: "",
              render: (r) =>
                r.status === "RECEIVED" && (
                  <div className="row" style={{ justifyContent: "flex-end" }}>
                    <Btn size="sm" onClick={() => run(() => s.rmaQcDecision(r.id, "RESTOCK"), "Restocked to finished goods")}>Restock</Btn>
                    <Btn size="sm" variant="danger" onClick={() => run(() => s.rmaQcDecision(r.id, "SCRAP"), "Marked scrap")}>Scrap</Btn>
                  </div>
                ),
            },
          ]}
        />
      </Card>
    </>
  );
}
